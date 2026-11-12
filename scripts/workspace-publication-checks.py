#!/usr/bin/env python3
"""Public-CI-only new workspace publication acceptance; never run on the host."""
import base64
import gzip
import hashlib
import http.client
import json
import os
from pathlib import Path
import re
import selectors
import shutil
import signal
import socket
import stat
import subprocess
import tempfile
import time
import traceback
from urllib.parse import urlsplit

repo = Path.cwd()
source = os.environ["SOURCE_COMMIT"]
branch = "qa/workspace-publications-20261106-3"
app_url = "postgresql://iv_ci:authored-ci-only@127.0.0.1:54431/intelligent_visualization_ci"
admin_url = "postgresql://iv_ci:authored-ci-only@127.0.0.1:54431/postgres"
lock_sha = "b18dd278e6eded698e269d2e8400b0359083a8ba34de4721227a70b5e27c0d59"
carry_path = "docs/results/2026/11-06/workspace-publications-attempt-1.json"
carry_sha = "7964d501e29a06143646d23c8e697b738b5d04d741ac55cff44e77a8d0ab7833"
carry_source = "3f1eee91e7e7372d011267d1f0d2f5c5d6ce209f"
browser_carry_path = "docs/results/2026/11-06/workspace-publications-attempt-2.json"
browser_carry_sha = "6bd3e991f40628be178485db8b690b492831aeffab1eaba0bfe9caf98dae2203"
browser_carry_source = "6d43b8d4b9393061ba0080aa4d93f87a814259ce"
REPORT_TITLE = "a Report publishes saved revisions to an anonymous live link while prior version bytes stay immutable"
assert re.fullmatch(r"[0-9a-f]{40}", source)
assert os.environ.get("CI") == os.environ.get("IV_PUBLICATION_PUBLIC_REPOSITORY") == "true"
assert os.environ.get("GITHUB_REPOSITORY") == "alvarovillalbaa/intelligent-visualization"
assert os.environ.get("GITHUB_EVENT_NAME") == "create" and os.environ.get("GITHUB_REF") == "refs/heads/" + branch
event = json.loads(Path(os.environ["GITHUB_EVENT_PATH"]).read_text())
assert event["ref_type"] == "branch" and event["ref"] == branch and event["repository"]["private"] is False
assert os.environ.get("LOCAL_DATABASE_URL") == app_url and os.environ.get("IV_POSTGRES_TEST_ADMIN_URL") == admin_url
assert os.environ.get("IV_POSTGRES_FIXTURES") == "disposable"
assert subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip() == source
work_end, MAX, interruption = time.monotonic() + 1020, 4_000_000, None

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
    "scope": "Carry 40 core passes from immutable attempt 1 and 3 full browser passes from immutable attempt 2 with unchanged application inputs. Execute only narrow Report with diagnostic exact publication GET clone EOF/state/hash/native-signal and actual Playwright-request timelines; no failure classification change or exact JS-to-request binding claim. No accepted-case reruns/generation/model/provider/build."}

def guard(label):
    current = vector()
    assert current == before
    report["sourceGuards"].append({"label": label, "files": len(current), "bytes": sum(row["bytes"] for row in current.values()), "matches": True,
        "vectorSha256": sha(json.dumps(current, sort_keys=True, separators=(",", ":")).encode())})

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
root = Path(tempfile.mkdtemp(prefix="ivp-", dir="/tmp"))
os.chmod(root, 0o700)
identity = (root.stat().st_dev, root.stat().st_ino, root.stat().st_uid)
assert root.resolve() == root and len(os.fsencode(str(root / "tmp"))) + 64 <= 107
nonce = os.urandom(16).hex()
(root / ".owner").write_text(nonce)
app = root / "app"
app.mkdir()
groups, export, observed_processes = [], {}, {}
server = server_out = server_err = None
database_marked, status, cleanup_end = False, 1, None
env = {key: os.environ[key] for key in ["PATH", "RUNNER_TEMP"] if key in os.environ}
env.update({"CI": "true", "LANG": "C.UTF-8", "TZ": "UTC", "NO_COLOR": "1", "HOME": str(root / "home"),
    "npm_config_cache": str(root / "npm-cache"), "npm_config_userconfig": str(root / "npm-user"), "npm_config_globalconfig": str(root / "npm-global"),
    "XDG_CACHE_HOME": str(root / "cache"), "XDG_CONFIG_HOME": str(root / "config"), "TMPDIR": str(root / "tmp"),
    "PLAYWRIGHT_BROWSERS_PATH": str(root / "browsers"), "NEXT_TELEMETRY_DISABLED": "1", "DO_NOT_TRACK": "1",
    "NEXT_PUBLIC_APP_URL": "http://127.0.0.1:3100", "LOCAL_DATABASE_URL": app_url, "LOCAL_STORAGE_DIR": str(root / "storage"),
    "PERSISTENCE_PROVIDER": "local", "STORAGE_PROVIDER": "local", "AUTH_PROVIDER": "portable", "REALTIME_PROVIDER": "local",
    "AI_ENABLED": "false", "EVE_ENABLED": "false", "WORKFLOWS_ENABLED": "false", "QUEUES_ENABLED": "false", "SANDBOX_QA_ENABLED": "false",
    "IV_POSTGRES_FIXTURES": "disposable", "IV_POSTGRES_TEST_ADMIN_URL": admin_url,
    "IV_PUBLICATION_APP_ORIGIN": "http://127.0.0.1:3100", "IV_PUBLICATION_BROWSER_REPORT": str(root / "browser.json"),
    "IV_PUBLICATION_BROWSER_OUTPUT": str(root / "browser-output"),
    **{key: "" for key in ["DATABASE_URL", "VERCEL", "VERCEL_OIDC_TOKEN", "BLOB_READ_WRITE_TOKEN", "SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL",
        "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "AI_GATEWAY_API_KEY", "OPENAI_API_KEY", "ANTHROPIC_API_KEY", "GOOGLE_GENERATIVE_AI_API_KEY", "FIRECRAWL_API_KEY"]}})
for name in ["home", "cache", "config", "tmp"]: (root / name).mkdir()
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
                    "cwd": cwd, "telemetry": len(argv) == 5 and argv[1:] == [os.fsencode(str(app / "node_modules/next/dist/telemetry/detached-flush.js")), b"dev", os.fsencode(str(app)), os.fsencode(f"_events_{server.pid}.json")] if server else False}
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
            server_overflow = server is not None and any((root / ("server." + label)).stat().st_size > MAX for label in ["stdout", "stderr"])
            if (now >= limit or overflow or server_overflow or interruption is not None and cleanup_end is None) and term_at is None:
                row["timedOut"] = now >= limit; row["overflow"] = overflow or server_overflow
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

def database_guard(operation):
    code = r'''
import pg from 'pg';
const admin=new pg.Pool({connectionString:process.env.IV_POSTGRES_TEST_ADMIN_URL,max:1,connectionTimeoutMillis:5000,query_timeout:10000});
const name='intelligent_visualization_ci', marker='iv-workspace-publications:'+process.argv[2], op=process.argv[1];
try {
 const fixtures=(await admin.query("SELECT datname FROM pg_database WHERE datname ~ '^iv_check_' ORDER BY datname")).rows.map(r=>r.datname);
 const row=(await admin.query("SELECT shobj_description(oid,'pg_database') AS marker FROM pg_database WHERE datname=$1",[name])).rows[0];
 if(op==='mark') {
  if(!row||row.marker!==null||fixtures.length)throw Error('Disposable DB not fresh');
  const app=new pg.Pool({connectionString:process.env.LOCAL_DATABASE_URL,max:1,connectionTimeoutMillis:5000,query_timeout:10000});
  try {const n=(await app.query("SELECT count(*)::int AS n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema' AND c.relkind IN ('r','p','v','m','S','f')")).rows[0].n;if(n!==0)throw Error('Disposable app DB not empty');}finally{await app.end();}
  await admin.query("COMMENT ON DATABASE intelligent_visualization_ci IS '"+marker+"'");
 } else if(op==='drop') {
  if(row?.marker!==marker)throw Error('Disposable marker mismatch');
  if((await admin.query('SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname=$1',[name])).rows[0].n!==0)throw Error('Disposable DB still in use');
  await admin.query('DROP DATABASE intelligent_visualization_ci');
 }
 console.log(JSON.stringify({operation:op,marker,fixturesAbsent:fixtures.length===0,fixtureDatabases:fixtures,databaseRemoved:op==='drop'}));
}finally{await admin.end();}
'''
    return json.loads(run(["node", "--input-type=module", "-e", code, operation, source], 25))


def read_report(phase):
    file = root / (phase + ".json")
    if not file.exists(): return None
    archived, raw = capture_file(file)
    report[phase + "OriginalJson"] = archived
    assert archived["complete"], "Structured report too large"
    value = json.loads(raw)
    report[phase] = value
    return value

def vitest(phase, file, count):
    content = (app / file).read_text()
    assert not re.search(r"\b(?:it|test|describe)\.(?:only|skip|todo)\b", content)
    suites = re.findall(r'describe(?:\.sequential)?\("([^"]+)"', content)
    titles = re.findall(r'\bit\("([^"]+)"', content)
    assert len(suites) == 1 and len(titles) == len(set(titles)) == count
    expected = sorted(suites[0] + " " + title for title in titles)
    report.setdefault("expectedIdentities", {})[phase] = expected
    run(["node_modules/.bin/vitest", "run", "--config", "vitest.workspace-publications.config.ts", file,
        "--reporter=json", "--outputFile=" + str(root / (phase + ".json"))], 90, (0, 1))
    value = read_report(phase)
    assert report["commands"][-1]["exitCode"] == 0
    assert value["success"] and value["numTotalTests"] == value["numPassedTests"] == count
    assert all(value[key] == 0 for key in ["numFailedTests", "numPendingTests", "numTodoTests", "numFailedTestSuites", "numPendingTestSuites"])
    rows = [row for suite in value["testResults"] for row in suite["assertionResults"]]
    assert len(rows) == count and sorted(row["fullName"] for row in rows) == expected and all(row["status"] == "passed" for row in rows)


def carry_core(tests):
    raw = (repo / carry_path).read_bytes()
    assert len(raw) == 284832 and sha(raw) == carry_sha, "Original publication receipt changed"
    old = json.loads(raw)
    assert old["schemaVersion"] == 1 and old["sourceCommit"] == carry_source and old["passed"] is False and old["error"] == "AssertionError: "
    assert len(old["sourceFiles"]) == 535 and sum(row["bytes"] for row in old["sourceFiles"].values()) == 8908461
    vector_sha = sha(json.dumps(old["sourceFiles"], sort_keys=True, separators=(",", ":")).encode())
    assert vector_sha == "fd4edf756b0b26675fcac93b5fe4e0aca68dede0ea24d3d578fc66199dcbd64d"
    assert [row["label"] for row in old["sourceGuards"]] == ["before", "after-install", "after-focused-checks", "after-cleanup"]
    assert all(row == {"label": row["label"], "files": 535, "bytes": 8908461, "matches": True, "vectorSha256": vector_sha} for row in old["sourceGuards"])
    for key in ["databaseRemoved", "portReleased", "exportUnchanged", "scratchIdentityMatches", "scratchRemoved"]: assert old[key] is True
    assert old["processCleanup"]["remaining"] == old["processCleanup"]["uncertain"] == [] and old["processCleanup"]["originalGroupsAbsent"] is True
    assert old["residualBeforeEscalation"] == [] and old.get("cleanupSignals", []) == []
    assert old["databaseCleanup"] == {"operation": "drop", "marker": "iv-workspace-publications:" + carry_source, "fixturesAbsent": True, "fixtureDatabases": [], "databaseRemoved": True}
    assert old["fixtureAuditAfterTests"]["fixturesAbsent"] is True and old["fixtureAuditAfterTests"]["fixtureDatabases"] == []
    assert old["server"]["exitCode"] == 0 and old["server"]["intentionalStop"] is True and old["server"]["originalProcessGroupAbsent"] is True
    captures = 0
    def verify(item):
        nonlocal captures
        data = gzip.decompress(base64.b64decode(item["gzipBase64"], validate=True))
        assert item["complete"] is True and len(data) == item["bytes"] <= MAX and sha(data) == item["sha256"]
        captures += 1
        return data
    assert len(old["commands"]) == 15
    for index, command in enumerate(old["commands"]):
        assert command["exitCode"] == (1 if index == 13 else 0)
        assert command["exitObservedAndReaped"] is True and command["pipesEOF"] == [True, True] and command["originalProcessGroupAbsent"] is True
        assert not any(command[key] for key in ["timedOut", "termSent", "killSent", "forcedDrain"])
        for label in ["stdout", "stderr"]: verify(command[label])
    for label in ["stdout", "stderr"]: verify(old["server"][label])
    phases = {}
    for index, (phase, (file, count)) in enumerate(tests.items(), 5):
        content = (app / file).read_text()
        assert not re.search(r"\b(?:it|test|describe)\.(?:only|skip|todo)\b", content)
        suites = re.findall(r'describe(?:\.sequential)?\("([^"]+)"', content)
        titles = re.findall(r'\bit\("([^"]+)"', content)
        assert len(suites) == 1 and len(titles) == len(set(titles)) == count
        names = sorted(suites[0] + " " + title for title in titles)
        assert names == sorted(old["expectedIdentities"][phase])
        command = old["commands"][index]
        assert command["argv"][:6] == ["node_modules/.bin/vitest", "run", "--config", "vitest.workspace-publications.config.ts", file, "--reporter=json"]
        assert len(command["argv"]) == 7 and command["argv"][6].endswith("/" + phase + ".json")
        value = json.loads(verify(old[phase + "OriginalJson"]))
        assert value == old[phase] and value["success"] is True and value["numTotalTests"] == value["numPassedTests"] == count
        assert all(value[key] == 0 for key in ["numFailedTests", "numPendingTests", "numTodoTests", "numFailedTestSuites", "numPendingTestSuites"])
        rows = [row for suite in value["testResults"] for row in suite["assertionResults"]]
        assert len(rows) == count and sorted(row["fullName"] for row in rows) == names and all(row["status"] == "passed" for row in rows)
        phases[phase] = {"passed": count, "identities": names, "originalJsonBytes": old[phase + "OriginalJson"]["bytes"], "originalJsonSha256": old[phase + "OriginalJson"]["sha256"], "executedThisAttempt": False}
    browser = json.loads(verify(old["browserOriginalJson"]))
    assert browser == old["browser"] and not browser["errors"] and browser["stats"]["expected"] == 1 and browser["stats"]["unexpected"] == 3
    assert browser["stats"]["flaky"] == browser["stats"]["skipped"] == 0 and captures == 36
    assert old["commands"][13]["argv"] == ["node_modules/.bin/playwright", "test", "--config", "playwright.workspace-publications.config.ts"]
    def walk(suites):
        return [spec for suite in suites for spec in suite.get("specs", [])] + [spec for suite in suites for spec in walk(suite.get("suites", []))]
    outcomes = []
    for spec in walk(browser["suites"]):
        for case in spec["tests"]:
            assert case["expectedStatus"] == "passed" and len(case["results"]) == 1 and case["results"][0]["retry"] == 0
            outcomes.append({"title": spec["title"], "profile": case["projectName"], "status": case["results"][0]["status"]})
    assert len(outcomes) == 4 and [row for row in outcomes if row["status"] == "passed"] == [{"title": "a Course publishes saved revisions to an anonymous live link while prior version bytes stay immutable", "profile": "narrow-chromium", "status": "passed"}]
    assert sum(row["status"] == "failed" for row in outcomes) == 3
    prior = old["sourceExport"]["inputs"]
    allowed = {"components/visualizations/workspace-publisher.tsx", "tests/e2e/workspace-publications.spec.ts"}
    assert len(prior) == 269 and set(prior) == set(export) and allowed <= prior.keys()
    for name, row in prior.items():
        assert row == old["sourceFiles"][name]
        if name not in allowed: assert export[name] == row, "Previously checked publication runtime input changed: " + name
    assert old["frozenLock"] == {"bytes": 618662, "sha256": lock_sha}
    assert sha((app / "package-lock.json").read_bytes()) == lock_sha
    report["carriedCore"] = {"validated": True, "sourceCommit": carry_source, "receipt": carry_path, "receiptBytes": len(raw), "receiptSha256": carry_sha,
        "originalCapturesVerified": captures, "phases": phases, "passed": 40, "executedThisAttempt": False, "unchangedRuntimeInputs": 267,
        "allowedChangedRuntimeInputs": {name: {"before": prior[name], "current": export[name]} for name in sorted(allowed)},
        "priorBrowser": {"passed": 1, "failed": 3, "acceptedForCurrentSource": False, "outcomes": outcomes, "originalJsonBytes": old["browserOriginalJson"]["bytes"], "originalJsonSha256": old["browserOriginalJson"]["sha256"]}}


def validate_browser_case(spec, case, include_get=False):
    assert case["expectedStatus"] == "passed" and case["status"] == "expected" and len(case["results"]) == 1
    result = case["results"][0]
    assert result["status"] == "passed" and result["retry"] == 0 and not result.get("errors")
    attachments = [row for row in result["attachments"] if row["name"] == "iv-workspace-publication-boundary" and row["contentType"] == "application/json"]
    assert len(attachments) == 1
    raw = base64.b64decode(attachments[0]["body"], validate=True)
    assert len(raw) <= 24576
    boundary = json.loads(raw)
    entry = {"bytes": len(raw), "sha256": sha(raw), "result": boundary}
    assert boundary["kind"] == "iv-workspace-publication-boundary" and boundary["schemaVersion"] == 1
    assert boundary["profile"] == case["projectName"] and boundary["title"] == spec["title"]
    assert boundary["documentKind"] == ("course" if spec["title"].startswith("a Course") else "report")
    assert boundary["status"] == "passed" and boundary["stage"] == "complete" and boundary["primaryError"] is None
    assert boundary["realPublishRequests"] == 2 and boundary["realSaveRequests"] == 1
    obs = boundary["observations"]
    assert obs["seed"]["actualAuthenticatedRequest"] is True and obs["seed"]["revision"] == 1
    assert all(obs[key] is True for key in ["unsavedPublicationBlocked", "anonymousCookiesAbsent", "originalVersionBytesUnchanged", "reservedNamespaceProbeDoesNotClaimKnownStagedKey"])
    publications = obs["publications"]
    assert len(publications) == 2 and [row["sourceRevision"] for row in publications] == [1, 2]
    assert publications[0]["publicId"] == publications[1]["publicId"] and publications[0]["versionId"] != publications[1]["versionId"]
    assert publications[0]["requestId"] != publications[1]["requestId"]
    for row in publications:
        assert re.fullmatch(boundary["documentKind"] + r"_[0-9a-f]{32}", row["publicId"])
        assert re.fullmatch(r"[0-9a-f-]{36}", row["versionId"]) and re.fullmatch(r"[0-9a-f-]{36}", row["requestId"])
        assert re.fullmatch(r"[0-9a-f]{64}", row["documentHash"]) and re.fullmatch(r"[0-9a-f]{64}", row["artifactHash"])
    immutable = obs["immutableReads"]
    first_path = "/v/" + publications[0]["publicId"] + "/" + publications[0]["versionId"]
    original_reads = [row for row in immutable if row["path"] == first_path]
    assert len(immutable) == 4 and len(original_reads) == 3
    assert len({(row["bytes"], row["sha256"]) for row in original_reads}) == 1
    assert all(0 < row["bytes"] <= 8388608 and re.fullmatch(r"[0-9a-f]{64}", row["sha256"]) for row in immutable)
    assert len(obs["liveTargets"]) == 3 and all(row["status"] == 307 for row in obs["liveTargets"])
    assert obs["liveTargets"][0]["target"] == obs["liveTargets"][1]["target"] == first_path
    assert obs["liveTargets"][2]["target"] == "/v/" + publications[1]["publicId"] + "/" + publications[1]["versionId"]
    assert len(obs["probes"]) == 4 and all(row["status"] == 404 for row in obs["probes"])
    if boundary["documentKind"] == "course":
        assert obs["reader"] == {"kind": "course", "feedbackCorrect": True, "completionRestoredAfterReload": True, "quizFeedbackReset": True}
        assert obs["newVersionInitiallyIncomplete"] is True
    else:
        assert boundary["documentKind"] == "report" and obs["reader"] == {"kind": "report", "literalMarkupVisible": True, "noInjectedImage": True}
    observer = boundary["responseObserver"]
    assert observer["kind"] == "native-fetch-response-clone" and observer["maxResponseBytes"] == 5242880 and observer["pendingJobs"] == 0 and observer["failures"] == []
    reads = observer["reads"]
    assert len(reads) == len({row["requestId"] for row in reads}) == 3
    assert all(row["status"] == 200 and "no-store" in row["cacheControl"] and 0 < row["bytes"] <= 5242880 and re.fullmatch(r"[0-9a-f]{64}", row["sha256"]) for row in reads)
    assert [row["requestId"] for row in reads if row["path"].endswith("/publications")] == [row["requestId"] for row in publications]
    assert boundary["boundary"]["counts"] == {key: 0 for key in ["unexpectedRequests", "unexpectedWebSockets", "requestFailures", "httpErrors", "pageErrors", "consoleErrors", "dialogs", "analyticsRequests"]}
    rows = boundary["boundary"]["navigationCancellations"]
    assert boundary["boundary"]["navigationCancellationCount"] == len(rows) <= 16
    for row in rows:
        assert row["transition"] in ["sign-in", "private-seed", "private-open", "publish-1", "public-reader", "unsaved-edit", "save-2", "publish-2", "final-proof"]
        assert row["status"] == 200 and row["contentType"].startswith("text/x-component") or row["method"] == "POST" and row["status"] in [303, 307, 308]
        assert row["path"] == row["target"] if row["method"] == "GET" else row["method"] == "POST" and row["redirect"] == row["target"]
    assert boundary["cleanup"] == {"contextsCreated": 2, "contextsClosed": 2, "pendingJobs": 0, "failures": []}
    if include_get:
        observation = boundary["publicationGetObserver"]
        assert observation["kind"] == "native-fetch-publication-get-clone" and observation["maxBodyBytes"] == 131072
        assert observation["correlation"] == "method-path-ordinal-and-time-only" and observation["exactFailedRequestBindingClaimed"] is False
        assert observation["snapshotBeforeContextClose"] is True and observation["signalsDetached"] is True
        assert observation["pendingJobs"] == 0 and observation["failures"] == []
        assert observation["nodePendingRequests"] == 0 and 1 <= observation["nodeRequests"] == len(observation["nodeTimeline"]) <= 8
        assert observation["nodeRequests"] == observation["requests"]
        for row in observation["nodeTimeline"]:
            assert row["path"] == "/api/workspaces/core-growth/visualizations/" + obs["seed"]["id"] + "/publications"
            assert isinstance(row["startedAt"], int) and row["startedAt"] > 0 and isinstance(row["responseAt"], int) and row["responseAt"] > 0
            assert row["status"] == 200 and row["contentType"].startswith("application/json") and isinstance(row["requestfinishedAt"], int)
            assert row["requestfailedAt"] is None and row["errorText"] is None
        reads = observation["reads"]
        assert 1 <= observation["requests"] == len(reads) <= 8
        assert [row["ordinal"] for row in reads] == list(range(1, len(reads) + 1))
        for row in reads:
            assert row["path"] == "/api/workspaces/core-growth/visualizations/" + obs["seed"]["id"] + "/publications"
            assert row["status"] == 200 and "no-store" in row["cacheControl"] and row["contentType"].startswith("application/json")
            assert row["eof"] is True and row["bodyError"] is None and 0 < row["bytes"] <= 131072 and re.fullmatch(r"[0-9a-f]{64}", row["sha256"])
            assert all(isinstance(row[key], int) and row[key] > 0 for key in ["startedAt", "responseAt", "eofAt"])
            state = row["state"]
            assert state["id"] == obs["seed"]["id"] and state["workspaceSlug"] == "core-growth" and state["kind"] == "report"
            assert state["draftRevision"] in [1, 2] and re.fullmatch(r"[0-9a-f]{64}", state["draftHash"])
            signal = row["signal"]
            assert signal["present"] is True and isinstance(signal["initialAborted"], bool) and isinstance(signal["abortedAtEOF"], bool) and isinstance(signal["finalAborted"], bool)
            assert signal["abortObservedAt"] is None or isinstance(signal["abortObservedAt"], int) and signal["abortObservedAt"] > 0
    return entry

def carry_browser():
    raw = (repo / browser_carry_path).read_bytes()
    assert len(raw) == 257639 and sha(raw) == browser_carry_sha
    old = json.loads(raw)
    assert old["schemaVersion"] == 1 and old["sourceCommit"] == browser_carry_source and old["passed"] is False and old["error"] == "AssertionError: "
    assert len(old["sourceFiles"]) == 537 and sum(row["bytes"] for row in old["sourceFiles"].values()) == 9204397
    vector_sha = sha(json.dumps(old["sourceFiles"], sort_keys=True, separators=(",", ":")).encode())
    assert vector_sha == "6f6c0e1438def63ce06ed4540de5900aa73c7954fa223b2daf261608966e58e1"
    assert [row["label"] for row in old["sourceGuards"]] == ["before", "after-install", "after-focused-checks", "after-cleanup"]
    assert all(row == {"label": row["label"], "files": 537, "bytes": 9204397, "matches": True, "vectorSha256": vector_sha} for row in old["sourceGuards"])
    for key in ["databaseRemoved", "portReleased", "exportUnchanged", "scratchIdentityMatches", "scratchRemoved"]: assert old[key] is True
    assert old["processCleanup"]["remaining"] == old["processCleanup"]["uncertain"] == [] and old["processCleanup"]["originalGroupsAbsent"] is True
    assert old["residualBeforeEscalation"] == [] and old.get("cleanupSignals", []) == []
    assert old["databaseCleanup"] == {"operation": "drop", "marker": "iv-workspace-publications:" + browser_carry_source, "fixturesAbsent": True, "fixtureDatabases": [], "databaseRemoved": True}
    assert old["fixtureAuditBeforeSetup"]["fixturesAbsent"] is True and old["fixtureAuditBeforeSetup"]["fixtureDatabases"] == []
    assert old["server"]["exitCode"] == 0 and old["server"]["intentionalStop"] is True and old["server"]["originalProcessGroupAbsent"] is True
    assert old["carriedCore"]["validated"] is True and old["carriedCore"]["receiptSha256"] == carry_sha and old["carriedCore"]["phases"] == report["carriedCore"]["phases"]
    captures = 0
    def verify(item):
        nonlocal captures
        data = gzip.decompress(base64.b64decode(item["gzipBase64"], validate=True))
        assert item["complete"] is True and len(data) == item["bytes"] <= MAX and sha(data) == item["sha256"]
        captures += 1
        return data
    assert len(old["commands"]) == 12
    for index, command in enumerate(old["commands"]):
        assert command["exitCode"] == (1 if index == 10 else 0)
        assert command["exitObservedAndReaped"] is True and command["pipesEOF"] == [True, True] and command["originalProcessGroupAbsent"] is True
        assert not any(command[key] for key in ["timedOut", "termSent", "killSent", "forcedDrain"])
        for label in ["stdout", "stderr"]: verify(command[label])
    for label in ["stdout", "stderr"]: verify(old["server"][label])
    browser = json.loads(verify(old["browserOriginalJson"]))
    assert captures == 27 and browser == old["browser"] and not browser["errors"]
    assert browser["stats"]["expected"] == 3 and browser["stats"]["unexpected"] == 1 and browser["stats"]["flaky"] == browser["stats"]["skipped"] == 0
    assert old["commands"][10]["argv"] == ["node_modules/.bin/playwright", "test", "--config", "playwright.workspace-publications.config.ts"]
    def walk(suites):
        return [spec for suite in suites for spec in suite.get("specs", [])] + [spec for suite in suites for spec in walk(suite.get("suites", []))]
    titles = ["a Course publishes saved revisions to an anonymous live link while prior version bytes stay immutable", REPORT_TITLE]
    cases = [(spec, case) for spec in walk(browser["suites"]) for case in spec["tests"]]
    assert len(cases) == 4 and sorted((spec["title"], case["projectName"]) for spec, case in cases) == sorted((title, profile) for title in titles for profile in ["desktop-chromium", "narrow-chromium"])
    accepted, failed = [], []
    for spec, case in cases:
        assert case["expectedStatus"] == "passed" and len(case["results"]) == 1 and case["results"][0]["retry"] == 0
        if (spec["title"], case["projectName"]) == (REPORT_TITLE, "narrow-chromium"):
            assert case["status"] == "unexpected" and case["results"][0]["status"] == "failed"
            failed.append({"title": spec["title"], "profile": case["projectName"], "status": "failed"})
        else:
            accepted.append(validate_browser_case(spec, case))
    assert len(accepted) == 3 and len(failed) == 1
    prior = old["sourceExport"]["inputs"]
    allowed = {"tests/e2e/workspace-publications.spec.ts"}
    assert len(prior) == 269 and set(prior) == set(export)
    for name, row in prior.items():
        assert row == old["sourceFiles"][name]
        if name not in allowed: assert export[name] == row, "Accepted browser runtime input changed: " + name
    assert old["frozenLock"] == {"bytes": 618662, "sha256": lock_sha}
    report["carriedBrowser"] = {"validated": True, "sourceCommit": browser_carry_source, "receipt": browser_carry_path, "receiptBytes": len(raw),
        "receiptSha256": browser_carry_sha, "originalCapturesVerified": captures, "originalBrowserJsonBytes": old["browserOriginalJson"]["bytes"],
        "originalBrowserJsonSha256": old["browserOriginalJson"]["sha256"], "passed": 3, "executedThisAttempt": False, "unchangedRuntimeInputs": 268,
        "diagnosticFixtureChange": {"before": prior["tests/e2e/workspace-publications.spec.ts"], "current": export["tests/e2e/workspace-publications.spec.ts"]},
        "acceptedBoundaries": accepted, "priorFailure": failed}

def check_browser():
    value = read_report("browser")
    assert report["commands"][-1]["exitCode"] == 0 and not value["errors"]
    assert value["stats"]["expected"] == 1 and all(value["stats"][key] == 0 for key in ["unexpected", "flaky", "skipped"])
    def walk(suites):
        return [spec for suite in suites for spec in suite.get("specs", [])] + [spec for suite in suites for spec in walk(suite.get("suites", []))]
    cases = [(spec, case) for spec in walk(value["suites"]) for case in spec["tests"]]
    assert len(cases) == 1 and cases[0][0]["title"] == REPORT_TITLE and cases[0][1]["projectName"] == "narrow-chromium"
    report["browserBoundaries"] = [validate_browser_case(cases[0][0], cases[0][1], include_get=True)]
    report["currentBrowserSelection"] = {"passed": 1, "title": REPORT_TITLE, "profile": "narrow-chromium", "threeOthersExecutedThisAttempt": False}


try:
    tests = {"http": ("tests/unit/workspace-publications-http.test.ts", 14), "client": ("tests/unit/workspace-publication-client.test.ts", 6),
        "postgres": ("tests/integration/workspace-publications-postgres.test.ts", 20)}
    configs = {"package.json", "package-lock.json", "tsconfig.json", "eslint.config.mjs", "next.config.ts", "postcss.config.mjs",
        "vitest.workspace-publications.config.ts", "playwright.workspace-publications.config.ts"}
    test_files = {file for file, _count in tests.values()} | {"tests/providers/postgres-fixture.ts", "tests/e2e/workspace-publications.spec.ts"}
    selected = [name for name in before if name.startswith(("app/", "components/", "hooks/", "lib/", "packages/", "public/"))
        or name in configs or name in test_files or name.startswith("scripts/") and name.endswith(".ts")]
    for name in selected:
        assert before[name]["mode"] != "120000" and not (repo / name).is_symlink()
        destination = app / name
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(repo / name, destination); os.chmod(destination, 0o755 if before[name]["mode"] == "100755" else 0o644)
        export[name] = before[name]
    assert configs | test_files <= export.keys()
    report["sourceExport"] = {"files": len(export), "bytes": sum(row["bytes"] for row in export.values()), "inputs": export}
    check_export()
    carry_core(tests)
    carry_browser()
    assert run(["node", "--version"]).strip() == b"v24.21.0"
    lock = (app / "package-lock.json").read_bytes()
    assert len(lock) == 618662 and sha(lock) == lock_sha
    report["frozenLock"] = {"bytes": len(lock), "sha256": lock_sha}
    run(["npm", "ci", "--ignore-scripts", "--no-audit", "--no-fund"], 240)
    guard("after-install")
    report["databaseOwnership"] = database_guard("mark"); database_marked = True
    fixed_static = {"vitest.workspace-publications.config.ts", "playwright.workspace-publications.config.ts",
        "components/visualizations/saved-draft-editor.tsx", "components/visualizations/workspace-publisher.tsx", "packages/backend-contracts/provider.ts", "packages/provider-local/adapter.ts",
        "lib/artifacts/compiler.ts", "lib/artifacts/course.ts"}
    scoped = [name for name in selected if name in test_files or name in fixed_static or "publication" in name
        or name.startswith("app/v/") or name.startswith("app/files/")]
    report["focusedStaticInputs"] = scoped
    run(["node_modules/.bin/eslint", *scoped], 60)
    (app / "tsconfig.workspace-publications-checks.json").write_text(json.dumps({"extends": "./tsconfig.json", "include": scoped,
        "exclude": ["node_modules", "components/ai-elements"], "compilerOptions": {"incremental": False, "plugins": []}}))
    run(["node_modules/.bin/tsc", "--noEmit", "-p", "tsconfig.workspace-publications-checks.json"], 60)
    report["fixtureAuditBeforeSetup"] = database_guard("audit")
    assert report["fixtureAuditBeforeSetup"]["fixturesAbsent"]
    guard("after-focused-checks")
    run(["npm", "run", "setup:local"], 60); run(["npm", "run", "doctor"], 30)
    run(["node_modules/.bin/playwright", "install", "--only-shell", "chromium"], 150)
    shells = [file for file in (root / "browsers").rglob("*") if file.name in ["headless_shell", "chrome-headless-shell"] and file.is_file() and not file.is_symlink()]
    assert len(shells) == 1
    shell = shells[0]
    with shell.open("rb") as handle: assert handle.read(4) == b"\x7fELF"
    assert shell.stat().st_uid == os.getuid()
    assert b"not found" not in run(["ldd", str(shell)], 20)
    report["browserRuntime"] = {"playwright": json.loads((app / "node_modules/@playwright/test/package.json").read_text())["version"],
        "sharedLibrariesResolved": True, "shellBytes": shell.stat().st_size}
    assert report["browserRuntime"]["playwright"] == "1.57.0"
    assert work_end - time.monotonic() >= 667, "Setup consumed the bounded browser window"
    probe = socket.socket(); probe.bind(("127.0.0.1", 3100)); probe.close()
    server_out, server_err = (root / "server.stdout").open("wb"), (root / "server.stderr").open("wb")
    server = subprocess.Popen(["node_modules/.bin/next", "dev", "--webpack", "--hostname", "127.0.0.1", "--port", "3100"],
        cwd=app, env=env, stdout=server_out, stderr=server_err, start_new_session=True)
    groups.append(server.pid)
    ready_end = min(time.monotonic() + 90, work_end - 667)
    report["readiness"] = []
    for pathname, expected in [("/auth", 200), ("/app", 307), ("/app/workspaces/core-growth", 307), ("/", 200), ("/v/course_" + "0" * 32, 404)]:
        while True:
            assert server.poll() is None and interruption is None
            assert all((root / ("server." + label)).stat().st_size <= MAX for label in ["stdout", "stderr"])
            connection = http.client.HTTPConnection("127.0.0.1", 3100, timeout=10)
            try:
                connection.request("GET", pathname); response = connection.getresponse(); data = response.read(MAX + 1)
                if response.status == expected and len(data) <= MAX:
                    row = {"path": pathname, "status": response.status, "bytes": len(data), "sha256": sha(data)}
                    if pathname == "/app/workspaces/core-growth":
                        location = response.getheader("location", "")
                        redirect = urlsplit(location)
                        row["redirectPath"] = redirect.path
                        assert redirect.path == "/auth" and not redirect.query and not redirect.fragment
                        assert not redirect.username and not redirect.password and redirect.netloc in ["", "127.0.0.1:3100"]
                    report["readiness"].append(row); break
            except OSError: pass
            finally: connection.close()
            assert time.monotonic() < ready_end, "Next readiness expired"
            time.sleep(0.2)
    assert work_end - time.monotonic() >= 667
    run(["node_modules/.bin/playwright", "test", "--config", "playwright.workspace-publications.config.ts", "--project=narrow-chromium", "--grep", r"(?:^|\s)" + re.escape(REPORT_TITLE) + "$"], 660, (0, 1))
    check_browser(); guard("after-browser")
    status = 0
except BaseException as error:
    report["error"] = type(error).__name__ + ": " + str(error)
    report["errorLocation"] = [{"file": Path(frame.filename).name[:256], "line": frame.lineno, "function": frame.name[:128]}
        for frame in traceback.extract_tb(error.__traceback__)[-8:]]

finally:
    cleanup_end = time.monotonic() + 90
    for phase in ["http", "client", "postgres", "browser"]:
        try: read_report(phase)
        except Exception as error: report[phase + "ReportError"] = type(error).__name__ + ": " + str(error); status = 1
    if server is not None:
        alive = server.poll() is None
        if alive: send_group(server, signal.SIGTERM)
        try: server.wait(timeout=15)
        except subprocess.TimeoutExpired:
            send_group(server, signal.SIGKILL); status = 1
            try: server.wait(timeout=3)
            except subprocess.TimeoutExpired: pass
        deadline = min(time.monotonic() + 15, cleanup_end - 30)
        while time.monotonic() < deadline:
            owned, uncertain = owned_processes()
            if not owned or uncertain or any(not row["telemetry"] for row in owned): break
            time.sleep(0.1)
        report["server"] = {"exitCode": server.returncode, "intentionalStop": alive, "originalProcessGroupAbsent": group_absent(server.pid), "naturalTelemetryGraceSeconds": 15}
        if not alive or server.returncode not in [0, -15, 143] or not group_absent(server.pid): status = 1
        server_out.close(); server_err.close()
    else:
        if server_out: server_out.close()
        if server_err: server_err.close()
    owned, uncertain = owned_processes()
    report["residualBeforeEscalation"] = owned
    if owned or uncertain:
        status = 1
        for row in owned:
            current, _ = owned_processes()
            if row in current:
                try: os.kill(row["pid"], signal.SIGTERM)
                except ProcessLookupError: pass
                report.setdefault("cleanupSignals", []).append({"pid": row["pid"], "startTime": row["startTime"], "signal": "TERM"})
        deadline = min(time.monotonic() + 5, cleanup_end - 20)
        while owned and time.monotonic() < deadline:
            time.sleep(0.1); owned, uncertain = owned_processes()
        for row in owned:
            current, _ = owned_processes()
            if row in current:
                try: os.kill(row["pid"], signal.SIGKILL)
                except ProcessLookupError: pass
                report.setdefault("cleanupSignals", []).append({"pid": row["pid"], "startTime": row["startTime"], "signal": "KILL"})
    report["databaseRemoved"] = False
    if database_marked:
        try:
            report["databaseCleanup"] = database_guard("drop")
            report["databaseRemoved"] = report["databaseCleanup"]["databaseRemoved"]
            if not report["databaseCleanup"]["fixturesAbsent"]: status = 1
        except Exception as error: report["databaseCleanupError"] = str(error); status = 1
    port = socket.socket(); port.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    try: port.bind(("127.0.0.1", 3100)); report["portReleased"] = True
    except OSError: report["portReleased"] = False; status = 1
    finally: port.close()
    try: guard("after-cleanup"); check_export(); report["exportUnchanged"] = True
    except Exception as error: report["sourceOrExportError"] = str(error); status = 1
    owned, uncertain = owned_processes()
    report["processCleanup"] = {"observed": list(observed_processes.values()), "remaining": owned, "uncertain": uncertain, "originalGroupsAbsent": all(group_absent(pgid) for pgid in groups)}
    if owned or uncertain or not report["processCleanup"]["originalGroupsAbsent"]: status = 1
    for label in ["stdout", "stderr"]:
        if (root / ("server." + label)).exists():
            try: report.setdefault("server", {})[label] = capture_file(root / ("server." + label))[0]
            except Exception as error: report["serverCaptureError"] = str(error); status = 1
    current = root.lstat()
    safe_root = not root.is_symlink() and (current.st_dev, current.st_ino, current.st_uid) == identity and (root / ".owner").read_text() == nonce
    report["scratchIdentityMatches"] = safe_root
    # Never erase scratch while a command's forced/incomplete drain leaves writers uncertain.
    released = all(row["exitObservedAndReaped"] and all(row["pipesEOF"]) and row["originalProcessGroupAbsent"] and not row["forcedDrain"] for row in report["commands"])
    if safe_root and released and not owned and not uncertain and report["processCleanup"]["originalGroupsAbsent"]: shutil.rmtree(root)
    report["scratchRemoved"] = not root.exists()
    captures = [row[key] for row in report["commands"] for key in ["stdout", "stderr"]]
    captures += [report[key] for key in ["httpOriginalJson", "clientOriginalJson", "postgresOriginalJson", "browserOriginalJson"] if key in report]
    captures += [report["server"][key] for key in ["stdout", "stderr"] if key in report.get("server", {})]
    report["finishedAt"] = time.time()
    report["passed"] = status == 0 and report.get("carriedCore", {}).get("validated") is True and report.get("carriedBrowser", {}).get("validated") is True and len(report["sourceGuards"]) == 5 and all(report.get(key) for key in ["databaseRemoved", "portReleased", "exportUnchanged", "scratchRemoved", "scratchIdentityMatches"]) and all(row["complete"] for row in captures)
    print("IV_WORKSPACE_PUBLICATION_RESULT=" + json.dumps(report, separators=(",", ":")), flush=True)
raise SystemExit(0 if report["passed"] else 1)
