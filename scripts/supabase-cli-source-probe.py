#!/usr/bin/env python3
"""Public CI source-generation probe only. Never starts, links, or applies a DB."""
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
import tarfile
import tempfile
import time
import traceback

repo = Path.cwd()
source = os.environ["SOURCE_COMMIT"]
branch = "qa/supabase-cli-source-20261107-1"
VERSION = "3.0.0"
ASSET = "supabase_3.0.0_linux_amd64.tar.gz"
ARCHIVE_SHA = "eeb61edcd59a4735fcb5e58596574f25d03d420efca779f43ddb307e1cc5c754"
CHECKSUM_SHA = "23763f31f1d3251c71cad4fd27577303f306514e2b99da91427a619d1800301f"
BASE = "https://github.com/supabase/cli/releases/download/v3.0.0/"
assert re.fullmatch(r"[0-9a-f]{40}", source)
assert os.environ.get("CI") == os.environ.get("IV_SUPABASE_SOURCE_PUBLIC_REPOSITORY") == "true"
assert os.environ.get("GITHUB_REPOSITORY") == "alvarovillalbaa/intelligent-visualization"
assert os.environ.get("GITHUB_EVENT_NAME") == "create" and os.environ.get("GITHUB_REF") == "refs/heads/" + branch
assert os.uname().sysname == "Linux" and os.uname().machine == "x86_64"
event = json.loads(Path(os.environ["GITHUB_EVENT_PATH"]).read_text())
assert event["ref_type"] == "branch" and event["ref"] == branch and event["repository"]["private"] is False
assert subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip() == source
work_end, MAX, interruption = time.monotonic() + 420, 1_048_576, None

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
    "scope": "Pinned CLI v3 source generation only: version/help discovery and one empty migration new. No login/link/start/database command, SQL apply, hosted account, product test, app build or browser. Telemetry delivery opted out; any state-file writes confined to owned HOME/SUPABASE_HOME. No OS-level zero-network claim."}
report["references"] = {"breakingChange": "https://supabase.com/changelog/supabase-cli-v3",
    "commands": "https://supabase.com/docs/reference/cli/introduction", "telemetry": "https://supabase.com/docs/guides/local-development/cli/getting-started#telemetry",
    "release": "https://github.com/supabase/cli/releases/tag/v3.0.0",
    "generationSource": "https://github.com/supabase/cli/blob/v3.0.0/apps/cli/src/commands/migration/new/new.handler.ts",
    "stateWriteSource": "https://github.com/supabase/cli/blob/v3.0.0/apps/cli/src/telemetry/telemetry-state.layer.ts"}

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
root = Path(tempfile.mkdtemp(prefix="ivsc-", dir="/tmp"))
os.chmod(root, 0o700)
identity = (root.stat().st_dev, root.stat().st_ino, root.stat().st_uid)
assert root.resolve() == root
nonce = os.urandom(16).hex()
(root / ".owner").write_text(nonce)
work = root / "project"
work.mkdir(mode=0o700)
for name in ["home", "supabase-home", "cache", "config", "tmp"]: (root / name).mkdir(mode=0o700)
groups, observed_processes = [], {}
status, cleanup_end = 1, None
env = {"PATH": "/usr/bin:/bin:/usr/sbin:/sbin", "CI": "true", "LANG": "C.UTF-8", "TZ": "UTC", "NO_COLOR": "1",
    "HOME": str(root / "home"), "SUPABASE_HOME": str(root / "supabase-home"), "TMPDIR": str(root / "tmp"),
    "XDG_CACHE_HOME": str(root / "cache"), "XDG_CONFIG_HOME": str(root / "config"),
    "SUPABASE_TELEMETRY_DISABLED": "1", "DO_NOT_TRACK": "1"}
def capture(data):
    complete = len(data) <= MAX
    retained = data[:MAX]
    return {"bytes": len(retained), "sha256": sha(retained), "gzipBase64": base64.b64encode(gzip.compress(retained, mtime=0)).decode(), "complete": complete}


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
            matched = matched or any(item.startswith(key + b"=" + prefix + b"/") for item in environment for key in [b"TMPDIR", b"XDG_CONFIG_HOME", b"HOME", b"SUPABASE_HOME"])
            if matched:
                argv0 = os.fsdecode(next(iter(argv), b""))
                executable = Path(next(iter(argv0.split()), "unavailable")).name
                row = {"pid": int(entry.name), "startTime": fields[19], "pgid": pgid, "state": fields[0], "executable": executable}
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


def run(argv, timeout=120, accepted=(0,)):
    budget = cleanup_end if cleanup_end is not None else work_end
    limit = min(time.monotonic() + timeout, budget - 6.5)
    assert limit > time.monotonic(), "No command execution budget remains"
    assert cleanup_end is not None or interruption is None, interruption
    proc = subprocess.Popen(argv, cwd=work, env=env, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE, start_new_session=True, umask=0o022)
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
    assert reaped and all(eof) and row["originalProcessGroupAbsent"] and not any(row[key] for key in ["termSent", "killSent", "forcedDrain", "timedOut"]), "Command lifecycle incomplete"
    assert row["stdout"]["complete"] and row["stderr"]["complete"] and proc.returncode in accepted, "Focused command failed: " + " ".join(argv)
    return bytes(buffers[0])

def file_digest(file, expected_size):
    before = file.lstat()
    assert stat.S_ISREG(before.st_mode) and not file.is_symlink() and before.st_uid == os.getuid() and before.st_nlink == 1 and before.st_size == expected_size
    digest, count = hashlib.sha256(), 0
    with file.open("rb") as handle:
        while chunk := handle.read(1024 * 1024):
            count += len(chunk)
            assert count <= expected_size
            digest.update(chunk)
    after = file.lstat()
    assert (before.st_dev, before.st_ino, before.st_uid, before.st_size, before.st_mtime_ns, before.st_ctime_ns) == (after.st_dev, after.st_ino, after.st_uid, after.st_size, after.st_mtime_ns, after.st_ctime_ns)
    assert count == expected_size
    return {"bytes": count, "sha256": digest.hexdigest()}

try:
    archive, checksum = root / ASSET, root / "checksums.txt"
    for name, destination, size in [("checksums.txt", checksum, 1386), (ASSET, archive, 63799117)]:
        run(["/usr/bin/curl", "-q", "--fail", "--location", "--silent", "--show-error", "--proto", "=https", "--proto-redir", "=https",
            "--max-redirs", "3", "--max-time", "120", "--max-filesize", str(size), "--output", str(destination), BASE + name], 125)
    report["archive"] = file_digest(archive, 63799117)
    assert report["archive"]["sha256"] == ARCHIVE_SHA
    report["checksumFile"] = file_digest(checksum, 1386)
    assert report["checksumFile"]["sha256"] == CHECKSUM_SHA
    checksum_bytes = checksum.read_bytes()
    report["checksumFile"]["original"] = capture(checksum_bytes)
    assert (ARCHIVE_SHA + "  " + ASSET).encode() in checksum_bytes.splitlines()
    binary = root / "supabase"
    with tarfile.open(archive, "r:gz") as handle:
        members = handle.getmembers()
        assert 1 <= len(members) <= 16 and sum(row.size for row in members) <= 512 * 1024 * 1024
        assert all(not Path(row.name).is_absolute() and ".." not in Path(row.name).parts and (row.isfile() or row.isdir()) for row in members)
        selected = [row for row in members if row.name == "supabase" and row.isfile()]
        assert len(selected) == 1 and 0 < selected[0].size <= 512 * 1024 * 1024
        with handle.extractfile(selected[0]) as incoming, binary.open("xb") as outgoing:
            os.chmod(binary, 0o700)
            shutil.copyfileobj(incoming, outgoing, 1024 * 1024)
        report["executable"] = file_digest(binary, selected[0].size)
    with binary.open("rb") as handle: assert handle.read(4) == b"\x7fELF"
    guard("after-download")
    top = run([str(binary), "--help"], 20)
    assert b"migration" in top
    version = run([str(binary), "--version"], 20).decode().strip()
    assert version in [VERSION, "v" + VERSION]
    report["cliVersion"] = version
    assert b"new" in run([str(binary), "migration", "--help"], 20)
    help_text = run([str(binary), "migration", "new", "--help"], 20)
    assert b"migration" in help_text and b"new" in help_text
    assert list(work.iterdir()) == [], "Probe project must be fresh before generation"
    output = run([str(binary), "migration", "new", "intelligent_visualization_hosted"], 20)
    generated = list(work.rglob("*.sql"))
    assert len(generated) == 1
    file = generated[0]
    relative = file.relative_to(work).as_posix()
    assert re.fullmatch(r"supabase/migrations/[0-9]{14}_intelligent_visualization_hosted\.sql", relative)
    assert re.findall(rb"supabase/migrations/[0-9]{14}_intelligent_visualization_hosted\.sql", output) == [relative.encode()]
    for directory in [work, work / "supabase", work / "supabase/migrations"]:
        info = directory.lstat()
        assert stat.S_ISDIR(info.st_mode) and not directory.is_symlink() and info.st_uid == os.getuid() and directory.resolve() == directory
    report["generatedMigration"] = {"path": relative, **file_digest(file, 0), "mode": oct(stat.S_IMODE(file.lstat().st_mode)), "original": capture(file.read_bytes()), "generatedByCli": True}
    assert report["generatedMigration"]["mode"] == "0o644"
    assert report["generatedMigration"]["sha256"] == sha(b"")
    guard("after-generation")
    status = 0
except BaseException as error:
    report["error"] = type(error).__name__ + ": " + str(error)
    report["errorLocation"] = [{"file": Path(frame.filename).name[:256], "line": frame.lineno, "function": frame.name[:128]} for frame in traceback.extract_tb(error.__traceback__)[-8:]]
finally:
    cleanup_end = time.monotonic() + 60
    owned, uncertain = owned_processes()
    normal_end = min(time.monotonic() + 2, cleanup_end - 10)
    while owned and not uncertain and time.monotonic() < normal_end:
        time.sleep(0.1); owned, uncertain = owned_processes()
    report["residualBeforeEscalation"] = owned
    if owned or uncertain:
        status = 1
        for row in owned:
            current, _ = owned_processes()
            if row in current:
                try: os.kill(row["pid"], signal.SIGTERM)
                except ProcessLookupError: pass
                report.setdefault("cleanupSignals", []).append({"pid": row["pid"], "startTime": row["startTime"], "signal": "TERM"})
        end = min(time.monotonic() + 5, cleanup_end - 8)
        while owned and time.monotonic() < end:
            time.sleep(0.1); owned, uncertain = owned_processes()
        for row in owned:
            current, _ = owned_processes()
            if row in current:
                try: os.kill(row["pid"], signal.SIGKILL)
                except ProcessLookupError: pass
                report.setdefault("cleanupSignals", []).append({"pid": row["pid"], "startTime": row["startTime"], "signal": "KILL"})
    try: guard("after-cleanup")
    except Exception as error: report["sourceError"] = str(error); status = 1
    owned, uncertain = owned_processes()
    report["processCleanup"] = {"observed": list(observed_processes.values()), "remaining": owned, "uncertain": uncertain, "originalGroupsAbsent": all(group_absent(pgid) for pgid in groups)}
    if owned or uncertain or not report["processCleanup"]["originalGroupsAbsent"]: status = 1
    current = root.lstat()
    safe_root = not root.is_symlink() and (current.st_dev, current.st_ino, current.st_uid) == identity and (root / ".owner").read_text() == nonce
    report["scratchIdentityMatches"] = safe_root
    released = all(row["exitObservedAndReaped"] and all(row["pipesEOF"]) and row["originalProcessGroupAbsent"] and not row["forcedDrain"] for row in report["commands"])
    if safe_root and released and not owned and not uncertain and report["processCleanup"]["originalGroupsAbsent"]: shutil.rmtree(root)
    report["scratchRemoved"] = not root.exists()
    captures = [row[key] for row in report["commands"] for key in ["stdout", "stderr"]]
    report["finishedAt"] = time.time()
    report["passed"] = status == 0 and len(report["commands"]) == 7 and len(report["sourceGuards"]) == 4 and report["scratchRemoved"] and report["scratchIdentityMatches"] and all(row["complete"] for row in captures)
    print("IV_SUPABASE_CLI_SOURCE_RESULT=" + json.dumps(report, separators=(",", ":")), flush=True)
raise SystemExit(0 if report["passed"] else 1)
