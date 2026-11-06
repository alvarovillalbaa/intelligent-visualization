#!/usr/bin/env python3
"""Six focused local-storage checks in public CI; never run on the host."""
import base64
import gzip
import hashlib
import json
import os
from pathlib import Path
import re
import selectors
import shutil
import signal
import stat
import subprocess
import tempfile
import time
import traceback

repo = Path.cwd()
source = os.environ["SOURCE_COMMIT"]
branch = "qa/immutable-storage-20261106-1"
lock_sha = "b18dd278e6eded698e269d2e8400b0359083a8ba34de4721227a70b5e27c0d59"
assert re.fullmatch(r"[0-9a-f]{40}", source)
assert os.environ.get("CI") == os.environ.get("IV_IMMUTABLE_PUBLIC_REPOSITORY") == "true"
assert os.environ.get("GITHUB_REPOSITORY") == "alvarovillalbaa/intelligent-visualization"
assert os.environ.get("GITHUB_EVENT_NAME") == "create" and os.environ.get("GITHUB_REF") == "refs/heads/" + branch
event = json.loads(Path(os.environ["GITHUB_EVENT_PATH"]).read_text())
assert event["ref_type"] == "branch" and event["ref"] == branch and event["repository"]["private"] is False
assert subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip() == source
work_end, cleanup_end, MAX, interruption = time.monotonic() + 1020, None, 4_000_000, None

def interrupted(number, _frame):
    global interruption
    interruption = "Interrupted by signal " + str(number)

signal.signal(signal.SIGTERM, interrupted)
signal.signal(signal.SIGINT, interrupted)

def sha(data):
    return hashlib.sha256(data).hexdigest()


def git(*argv):
    return subprocess.check_output(["git", *argv], cwd=repo)


def vector():
    head = {}
    for entry in git("ls-tree", "-rz", "--full-tree", "HEAD").split(b"\0"):
        if not entry: continue
        metadata, raw_name = entry.split(b"\t", 1)
        mode, kind, blob = metadata.decode().split()
        name = raw_name.decode()
        assert kind == "blob" and mode in ["100644", "100755", "120000"]
        file = repo / name
        info = file.lstat()
        assert file.is_symlink() if mode == "120000" else stat.S_ISREG(info.st_mode) and not file.is_symlink()
        data = os.fsencode(os.readlink(file)) if mode == "120000" else file.read_bytes()
        assert hashlib.sha1(b"blob " + str(len(data)).encode() + b"\0" + data).hexdigest() == blob
        if mode != "120000": assert bool(info.st_mode & 0o111) == (mode == "100755")
        head[name] = {"mode": mode, "blob": blob, "bytes": len(data), "sha256": sha(data)}
    index = {}
    for entry in git("ls-files", "--stage", "-z").split(b"\0"):
        if not entry: continue
        metadata, raw_name = entry.split(b"\t", 1)
        mode, blob, stage = metadata.decode().split()
        assert stage == "0"
        index[raw_name.decode()] = {"mode": mode, "blob": blob}
    assert index == {name: {"mode": row["mode"], "blob": row["blob"]} for name, row in head.items()}
    assert not git("status", "--porcelain", "--untracked-files=all", "--ignored"), "Canonical source has residue or changes"
    return head


before = vector()
report = {"schemaVersion": 1, "sourceCommit": source, "startedAt": time.time(), "commands": [], "sourceFiles": before, "sourceGuards": [],
    "scope": "Six new real owned-temporary-directory immutable-storage cases only; no database/server/browser/model/provider/build or previously accepted test reruns"}

def guard(label):
    current = vector()
    assert current == before
    report["sourceGuards"].append({"label": label, "files": len(current), "bytes": sum(row["bytes"] for row in current.values()),
        "matches": True, "vectorSha256": sha(json.dumps(current, sort_keys=True, separators=(",", ":")).encode())})

guard("before")

def process_stat(entry):
    _prefix, separator, tail = (entry / "stat").read_text().rpartition(") ")
    fields = tail.split()
    if not separator or len(fields) < 20 or not fields[2].isdigit() or not fields[19].isdigit():
        raise ValueError("Process kernel identity could not be parsed")
    return fields


baseline = {}
for entry in Path("/proc").iterdir():
    if not entry.name.isdigit(): continue
    try:
        if entry.stat().st_uid == os.getuid(): baseline[entry.name] = process_stat(entry)[19]
    except (FileNotFoundError, ProcessLookupError): pass
    except (PermissionError, OSError, ValueError): raise RuntimeError("Process baseline identity unavailable")
root = Path(tempfile.mkdtemp(prefix="ivi-", dir="/tmp"))
os.chmod(root, 0o700)
identity = (root.stat().st_dev, root.stat().st_ino, root.stat().st_uid)
assert root.resolve() == root
nonce = os.urandom(16).hex()
(root / ".owner").write_text(nonce)
app = root / "app"
app.mkdir()
groups, export, observed_processes = [], {}, {}
status = 1
env = {key: os.environ[key] for key in ["PATH", "RUNNER_TEMP"] if key in os.environ}
env.update({"CI": "true", "LANG": "C.UTF-8", "TZ": "UTC", "NO_COLOR": "1",
    "HOME": str(root / "home"), "TMPDIR": str(root / "tmp"), "XDG_CACHE_HOME": str(root / "cache"), "XDG_CONFIG_HOME": str(root / "config"),
    "npm_config_cache": str(root / "npm-cache"), "npm_config_userconfig": str(root / "npm-user"), "npm_config_globalconfig": str(root / "npm-global"),
    "IV_IMMUTABLE_CHECK_ROOT": str(root), "LOCAL_STORAGE_DIR": str(root / "storage"),
    "AI_ENABLED": "false", "EVE_ENABLED": "false", "WORKFLOWS_ENABLED": "false", "QUEUES_ENABLED": "false",
    **{key: "" for key in ["DATABASE_URL", "LOCAL_DATABASE_URL", "VERCEL", "VERCEL_OIDC_TOKEN", "BLOB_READ_WRITE_TOKEN", "SUPABASE_URL",
        "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "AI_GATEWAY_API_KEY", "OPENAI_API_KEY",
        "ANTHROPIC_API_KEY", "GOOGLE_GENERATIVE_AI_API_KEY", "FIRECRAWL_API_KEY"]}})
for name in ["home", "tmp", "cache", "config"]: (root / name).mkdir()
for name in ["npm-user", "npm-global"]: (root / name).write_text("")

def capture(data):
    complete = len(data) <= MAX
    retained = data[:MAX]
    return {"bytes": len(retained), "sha256": sha(retained), "gzipBase64": base64.b64encode(gzip.compress(retained, mtime=0)).decode(), "complete": complete}


def capture_file(file):
    info = file.lstat()
    assert stat.S_ISREG(info.st_mode) and not file.is_symlink() and info.st_uid == os.getuid()
    with file.open("rb") as handle: data = handle.read(MAX + 1)
    current = file.lstat()
    assert (info.st_dev, info.st_ino, info.st_size, info.st_mtime_ns) == (current.st_dev, current.st_ino, current.st_size, current.st_mtime_ns)
    return capture(data), data

def owned_processes():
    owned, uncertain = [], []
    for entry in Path("/proc").iterdir():
        if not entry.name.isdigit(): continue
        try:
            if entry.stat().st_uid != os.getuid(): continue
            fields = process_stat(entry)
            if baseline.get(entry.name) == fields[19] or fields[0] == "Z": continue
            cwd = os.readlink(entry / "cwd")
            argv = [value for value in (entry / "cmdline").read_bytes().split(b"\0") if value]
            environment = (entry / "environ").read_bytes().split(b"\0")
            pgid = int(fields[2])
            prefix = os.fsencode(str(root))
            matched = pgid in groups or cwd == str(root) or cwd.startswith(str(root) + "/") or any(prefix + b"/" in item for item in argv)
            matched = matched or any(item.startswith(key + b"=" + prefix + b"/") for item in environment for key in [b"TMPDIR", b"XDG_CONFIG_HOME", b"PLAYWRIGHT_BROWSERS_PATH"])
            if matched:
                argv0 = os.fsdecode(next(iter(argv), b""))
                executable = Path(next(iter(argv0.split()), "unavailable")).name
                row = {"pid": int(entry.name), "startTime": fields[19], "pgid": pgid, "state": fields[0], "executable": executable,
                    "cwd": cwd}
                owned.append(row); observed_processes[(row["pid"], row["startTime"])] = row
        except (FileNotFoundError, ProcessLookupError): pass
        except (PermissionError, OSError, ValueError): uncertain.append(int(entry.name))
    return owned, uncertain


def group_absent(pgid):
    try: os.killpg(pgid, 0); return False
    except ProcessLookupError: return True
    except PermissionError: return False


def send_group(proc, which):
    try: os.killpg(proc.pid, which)
    except ProcessLookupError: pass


def check_export():
    for name, expected in export.items():
        file = app / name
        assert not file.is_symlink() and file.is_file() and sha(file.read_bytes()) == expected["sha256"]
        assert bool(file.stat().st_mode & 0o111) == (expected["mode"] == "100755")


def run(argv, timeout=120, accepted=(0,)):
    budget = cleanup_end if cleanup_end is not None else work_end
    limit = min(time.monotonic() + timeout, budget - 6.5)
    assert limit > time.monotonic(), "No command execution budget remains"
    assert cleanup_end is not None or interruption is None, interruption
    proc = subprocess.Popen(argv, cwd=app, env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE, start_new_session=True)
    groups.append(proc.pid)
    selector, buffers, eof = selectors.DefaultSelector(), [bytearray(), bytearray()], [False, False]
    for index, pipe in enumerate([proc.stdout, proc.stderr]):
        os.set_blocking(pipe.fileno(), False); selector.register(pipe, selectors.EVENT_READ, index)
    row = {"argv": argv, "pid": proc.pid, "timedOut": False, "termSent": False, "killSent": False, "forcedDrain": False}
    started, term_at, kill_at = time.monotonic(), None, None
    try:
        while True:
            now = time.monotonic()
            overflow = any(len(value) > MAX for value in buffers)
            if (now >= limit or overflow or interruption is not None and cleanup_end is None) and term_at is None:
                row["timedOut"] = now >= limit; row["overflow"] = overflow
                row["interrupted"] = interruption
                row["termSent"] = True; send_group(proc, signal.SIGTERM); term_at = now
            if term_at is not None and now - term_at >= 2 and kill_at is None and (proc.poll() is None or not group_absent(proc.pid) or not all(eof)):
                row["killSent"] = True; send_group(proc, signal.SIGKILL); kill_at = now
            for key, _ in selector.select(0.1):
                chunk = os.read(key.fileobj.fileno(), 65536)
                if chunk:
                    if len(buffers[key.data]) <= MAX: buffers[key.data].extend(chunk)
                else:
                    eof[key.data] = True; selector.unregister(key.fileobj); key.fileobj.close()
            owned_processes()
            if proc.poll() is not None and all(eof) and group_absent(proc.pid): break
            if term_at is not None and now - term_at >= 6:
                row["forcedDrain"] = True; break
    finally:
        for key in list(selector.get_map().values()): key.fileobj.close()
        selector.close()
    reaped = proc.poll() is not None
    if reaped: proc.wait()
    row.update({"exitCode": proc.returncode, "seconds": round(time.monotonic() - started, 3), "exitObservedAndReaped": reaped,
        "pipesEOF": eof, "originalProcessGroupAbsent": group_absent(proc.pid), "stdout": capture(bytes(buffers[0])), "stderr": capture(bytes(buffers[1]))})
    report["commands"].append(row)
    check_export()
    assert reaped and all(eof) and row["originalProcessGroupAbsent"] and not any(row[key] for key in ["termSent", "killSent", "forcedDrain", "timedOut"]), "Command lifecycle incomplete"
    assert row["stdout"]["complete"] and row["stderr"]["complete"] and proc.returncode in accepted, "Focused command failed: " + " ".join(argv)
    return bytes(buffers[0])


def read_result():
    file = root / "unit.json"
    if not file.exists(): return None
    archived, raw = capture_file(file)
    report["unitOriginalJson"] = archived
    assert archived["complete"], "Structured result exceeded its bound"
    result = json.loads(raw)
    report["unit"] = result
    return result

try:
    selected = ["package.json", "package-lock.json", "tsconfig.json", "eslint.config.mjs", "vitest.immutable-storage.config.ts",
        "packages/storage/local.ts", "packages/storage/provider.ts", "packages/domain/entities.ts", "tests/unit/immutable-storage.test.ts"]
    for name in selected:
        assert name in before and before[name]["mode"] != "120000" and not (repo / name).is_symlink()
        destination = app / name
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(repo / name, destination)
        os.chmod(destination, 0o755 if before[name]["mode"] == "100755" else 0o644)
        export[name] = before[name]
    report["sourceExport"] = {"files": len(export), "bytes": sum(row["bytes"] for row in export.values()), "inputs": export}
    check_export()
    guard("after-export")
    assert run(["node", "--version"]).strip() == b"v24.21.0"
    lock = (app / "package-lock.json").read_bytes()
    assert len(lock) == 618662 and sha(lock) == lock_sha
    report["frozenLock"] = {"bytes": len(lock), "sha256": lock_sha}
    run(["npm", "ci", "--ignore-scripts", "--no-audit", "--no-fund"], 300)
    guard("after-install")
    scoped = ["packages/storage/local.ts", "packages/storage/provider.ts", "packages/domain/entities.ts",
        "tests/unit/immutable-storage.test.ts", "vitest.immutable-storage.config.ts"]
    run(["node_modules/.bin/eslint", *scoped], 60)
    (app / "tsconfig.immutable-storage-checks.json").write_text(json.dumps({"extends": "./tsconfig.json",
        "include": scoped, "exclude": ["node_modules"], "compilerOptions": {"incremental": False, "plugins": []}}))
    run(["node_modules/.bin/tsc", "--noEmit", "-p", "tsconfig.immutable-storage-checks.json"], 60)
    content = (app / "tests/unit/immutable-storage.test.ts").read_text()
    assert not re.search(r"\b(?:it|test|describe)\.(?:only|skip|todo)\b", content)
    suites = re.findall(r'describe(?:\.sequential)?\("([^"]+)"', content)
    titles = re.findall(r'\bit\("([^"]+)"', content)
    assert suites == ["exclusive local immutable storage"] and len(titles) == len(set(titles)) == 6
    names = sorted(suites[0] + " " + title for title in titles)
    report["expectedIdentities"] = names
    run(["node_modules/.bin/vitest", "run", "--config", "vitest.immutable-storage.config.ts",
        "--reporter=json", "--outputFile=" + str(root / "unit.json")], 90, (0, 1))
    result = read_result()
    assert report["commands"][-1]["exitCode"] == 0
    assert result["success"] is True and result["numTotalTests"] == result["numPassedTests"] == 6
    assert all(result[key] == 0 for key in ["numFailedTests", "numPendingTests", "numTodoTests", "numFailedTestSuites", "numPendingTestSuites"])
    rows = [row for suite in result["testResults"] for row in suite["assertionResults"]]
    assert len(rows) == 6 and sorted(row["fullName"] for row in rows) == names and all(row["status"] == "passed" for row in rows)
    report["fixtureDirectoriesRemaining"] = sorted(entry.name for entry in root.iterdir() if entry.name.startswith("immutable-case-"))
    assert report["fixtureDirectoriesRemaining"] == [], "A case fixture did not remove its owned directory"
    check_export()
    guard("after-checks")
    status = 0
except BaseException as error:
    report["error"] = type(error).__name__ + ": " + str(error)
    report["errorLocation"] = [{"file": Path(frame.filename).name[:256], "line": frame.lineno, "function": frame.name[:128]}
        for frame in traceback.extract_tb(error.__traceback__)[-8:]]
finally:
    cleanup_end = time.monotonic() + 90
    try: read_result()
    except Exception as error: report["unitReportError"] = type(error).__name__ + ": " + str(error); status = 1
    owned, uncertain = owned_processes()
    grace = time.monotonic()
    while owned and not uncertain and time.monotonic() - grace < 2:
        time.sleep(0.1); owned, uncertain = owned_processes()
    report["naturalExitGrace"] = {"maxSeconds": 2, "seconds": round(time.monotonic() - grace, 3)}
    report["residualBeforeEscalation"] = owned
    if owned or uncertain:
        status = 1
        for which, label in [(signal.SIGTERM, "TERM"), (signal.SIGKILL, "KILL")]:
            for row in owned:
                current, _ = owned_processes()
                if row in current:
                    try: os.kill(row["pid"], which)
                    except ProcessLookupError: pass
                    report.setdefault("cleanupSignals", []).append({"pid": row["pid"], "startTime": row["startTime"], "signal": label})
            end = min(time.monotonic() + 3, cleanup_end)
            while owned and time.monotonic() < end:
                time.sleep(0.1); owned, uncertain = owned_processes()
    try: guard("after-cleanup"); check_export(); report["exportUnchanged"] = True
    except Exception as error: report["sourceOrExportError"] = str(error); status = 1
    owned, uncertain = owned_processes()
    report["processCleanup"] = {"observed": list(observed_processes.values()), "remaining": owned, "uncertain": uncertain,
        "originalGroupsAbsent": all(group_absent(pgid) for pgid in groups)}
    if owned or uncertain or not report["processCleanup"]["originalGroupsAbsent"]: status = 1
    info = root.lstat()
    safe = not root.is_symlink() and (info.st_dev, info.st_ino, info.st_uid) == identity and (root / ".owner").read_text() == nonce
    report["scratchIdentityMatches"] = safe
    report["fixtureDirectoriesRemaining"] = sorted(entry.name for entry in root.iterdir() if entry.name.startswith("immutable-case-"))
    if report["fixtureDirectoriesRemaining"]: status = 1
    released = all(row["exitObservedAndReaped"] and all(row["pipesEOF"]) and row["originalProcessGroupAbsent"]
        and not row["forcedDrain"] for row in report["commands"])
    if safe and released and not owned and not uncertain and report["processCleanup"]["originalGroupsAbsent"]: shutil.rmtree(root)
    report["scratchRemoved"], report["finishedAt"] = not root.exists(), time.time()
    captures = [row[label] for row in report["commands"] for label in ["stdout", "stderr"]]
    if "unitOriginalJson" in report: captures.append(report["unitOriginalJson"])
    report["passed"] = status == 0 and report.get("unit", {}).get("numPassedTests") == 6 and len(report["sourceGuards"]) == 5 and all(
        report.get(key) for key in ["scratchIdentityMatches", "scratchRemoved", "exportUnchanged"]) and all(row["complete"] for row in captures)
    print("IV_IMMUTABLE_STORAGE_RESULT=" + json.dumps(report, separators=(",", ":")), flush=True)
raise SystemExit(0 if report["passed"] else 1)
