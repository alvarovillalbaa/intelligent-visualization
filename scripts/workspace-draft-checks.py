#!/usr/bin/env python3
"""Public-CI-only workspace draft checks. Never starts local services on the host."""
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

repo = Path.cwd()
source = os.environ["SOURCE_COMMIT"]
branch = "qa/workspace-drafts-20261106-5"
app_url = "postgresql://iv_ci:authored-ci-only@127.0.0.1:54431/intelligent_visualization_ci"
admin_url = "postgresql://iv_ci:authored-ci-only@127.0.0.1:54431/postgres"
lock_sha = "b18dd278e6eded698e269d2e8400b0359083a8ba34de4721227a70b5e27c0d59"
carry_path = "docs/results/2026/11-06/workspace-drafts-attempt-2.json"
carry_sha = "833ecc3780a19a148ca97ec5bc3d4d0f67a8dfd48f34f4e26578ec843b27c13b"
carry_source = "feb450d17a8aa3c7022c4785e6b96b80067e3e0d"
http_carry_path = "docs/results/2026/11-06/workspace-drafts-attempt-4.json"
http_carry_sha = "2f00328ba2a4d126d3beefd512031917f4eaba2f4cecae3160655d7a32bfe8c4"
http_carry_source = "c60dea6dec75ffa0a97956afd47ed93723878818"
assert re.fullmatch(r"[0-9a-f]{40}", source)
assert os.environ.get("CI") == os.environ.get("IV_WORKSPACE_PUBLIC_REPOSITORY") == "true"
assert os.environ.get("GITHUB_REPOSITORY") == "alvarovillalbaa/intelligent-visualization"
assert os.environ.get("GITHUB_EVENT_NAME") == "create" and os.environ.get("GITHUB_REF") == "refs/heads/" + branch
event = json.loads(Path(os.environ["GITHUB_EVENT_PATH"]).read_text())
assert event["ref_type"] == "branch" and event["ref"] == branch and event["repository"]["private"] is False
assert os.environ.get("LOCAL_DATABASE_URL") == app_url and os.environ.get("IV_POSTGRES_TEST_ADMIN_URL") == admin_url
assert os.environ.get("IV_POSTGRES_FIXTURES") == "disposable"
assert subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip() == source
work_end = time.monotonic() + 1020
MAX = 4_000_000
interruption = None


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
report = {"schemaVersion": 1, "sourceCommit": source, "startedAt": time.time(), "commands": [],
    "scope": "Carry 16 PostgreSQL passes from immutable attempt 2 and 8 HTTP unit passes from immutable attempt 4; execute 4 browser cases plus static/setup/doctor checks. Browser save bodies use a bounded in-page real fetch Response.clone observer forwarding original fetch unchanged; generation alone is fulfilled. No model/hosted provider/build",
    "sourceFiles": before, "sourceGuards": []}


def guard(label):
    current = vector()
    assert current == before
    report["sourceGuards"].append({"label": label, "files": len(current), "bytes": sum(row["bytes"] for row in current.values()), "matches": True,
        "vectorSha256": sha(json.dumps(current, sort_keys=True, separators=(",", ":")).encode())})


guard("before")
baseline = {}
for entry in Path("/proc").iterdir():
    if not entry.name.isdigit(): continue
    try:
        if entry.stat().st_uid == os.getuid(): baseline[entry.name] = (entry / "stat").read_text().rsplit(") ", 1)[1].split()[19]
    except (FileNotFoundError, ProcessLookupError): pass
    except PermissionError: raise RuntimeError("Process baseline identity unavailable")
root = Path(tempfile.mkdtemp(prefix="ivw-", dir="/tmp"))
os.chmod(root, 0o700)
identity = (root.stat().st_dev, root.stat().st_ino, root.stat().st_uid)
assert root.resolve() == root and len(os.fsencode(str(root / "tmp"))) + 64 <= 107
nonce = os.urandom(16).hex()
(root / ".owner").write_text(nonce)
app = root / "app"
app.mkdir()
groups, export = [], {}
observed_processes = {}
server = server_out = server_err = None
database_marked, status = False, 1
cleanup_end = None
env = {key: os.environ[key] for key in ["PATH", "RUNNER_TEMP"] if key in os.environ}
env.update({"CI": "true", "LANG": "C.UTF-8", "TZ": "UTC", "NO_COLOR": "1", "HOME": str(root / "home"),
    "npm_config_cache": str(root / "npm-cache"), "npm_config_userconfig": str(root / "npm-user"), "npm_config_globalconfig": str(root / "npm-global"),
    "XDG_CACHE_HOME": str(root / "cache"), "XDG_CONFIG_HOME": str(root / "config"), "TMPDIR": str(root / "tmp"),
    "PLAYWRIGHT_BROWSERS_PATH": str(root / "browsers"), "NEXT_TELEMETRY_DISABLED": "1", "DO_NOT_TRACK": "1",
    "NEXT_PUBLIC_APP_URL": "http://127.0.0.1:3100", "LOCAL_DATABASE_URL": app_url, "LOCAL_STORAGE_DIR": str(root / "storage"),
    "PERSISTENCE_PROVIDER": "local", "STORAGE_PROVIDER": "local", "AUTH_PROVIDER": "portable", "REALTIME_PROVIDER": "local",
    "AI_ENABLED": "false", "EVE_ENABLED": "false", "WORKFLOWS_ENABLED": "false", "QUEUES_ENABLED": "false", "SANDBOX_QA_ENABLED": "false",
    "IV_POSTGRES_FIXTURES": "disposable", "IV_POSTGRES_TEST_ADMIN_URL": admin_url,
    "IV_WORKSPACE_APP_ORIGIN": "http://127.0.0.1:3100", "IV_WORKSPACE_BROWSER_REPORT": str(root / "browser.json"),
    "IV_WORKSPACE_BROWSER_OUTPUT": str(root / "browser-output"),
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
            fields = (entry / "stat").read_text().rsplit(") ", 1)[1].split()
            if baseline.get(entry.name) == fields[19] or fields[0] == "Z": continue
            cwd = os.readlink(entry / "cwd")
            argv = [value for value in (entry / "cmdline").read_bytes().split(b"\0") if value]
            environment = (entry / "environ").read_bytes().split(b"\0")
            pgid = int(fields[2])
            prefix = os.fsencode(str(root))
            matched = pgid in groups or cwd == str(root) or cwd.startswith(str(root) + "/") or any(prefix + b"/" in item for item in argv)
            matched = matched or any(item.startswith(key + b"=" + prefix + b"/") for item in environment for key in [b"TMPDIR", b"XDG_CONFIG_HOME", b"PLAYWRIGHT_BROWSERS_PATH"])
            if matched:
                row = {"pid": int(entry.name), "startTime": fields[19], "pgid": pgid, "state": fields[0], "executable": Path(os.fsdecode(argv[0] or b"unknown").split()[0]).name,
                    "cwd": cwd, "telemetry": len(argv) == 5 and argv[1:] == [os.fsencode(str(app / "node_modules/next/dist/telemetry/detached-flush.js")), b"dev", os.fsencode(str(app)), os.fsencode(f"_events_{server.pid}.json")] if server else False}
                owned.append(row); observed_processes[(row["pid"], row["startTime"])] = row
        except (FileNotFoundError, ProcessLookupError): pass
        except (PermissionError, OSError): uncertain.append(int(entry.name))
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
const name='intelligent_visualization_ci', marker='iv-workspace-drafts:'+process.argv[2], op=process.argv[1];
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
    run(["node_modules/.bin/vitest", "run", "--config", "vitest.workspace-drafts.config.ts", file,
        "--reporter=json", "--outputFile=" + str(root / (phase + ".json"))], 90, (0, 1))
    value = read_report(phase)
    assert report["commands"][-1]["exitCode"] == 0
    assert value["success"] and value["numTotalTests"] == value["numPassedTests"] == count
    assert all(value[key] == 0 for key in ["numFailedTests", "numPendingTests", "numTodoTests", "numFailedTestSuites", "numPendingTestSuites"])
    rows = [row for suite in value["testResults"] for row in suite["assertionResults"]]
    assert len(rows) == count and sorted(row["fullName"] for row in rows) == expected and all(row["status"] == "passed" for row in rows)


def carry_core():
    raw = (repo / carry_path).read_bytes()
    assert len(raw) == 285930 and sha(raw) == carry_sha, "Original failed receipt changed"
    old = json.loads(raw)
    assert old["schemaVersion"] == 1 and old["sourceCommit"] == carry_source and old["passed"] is False
    assert old["error"] == "AssertionError: "
    assert len(old["sourceFiles"]) == 494 and sum(row["bytes"] for row in old["sourceFiles"].values()) == 7227242
    old_vector_sha = sha(json.dumps(old["sourceFiles"], sort_keys=True, separators=(",", ":")).encode())
    assert old_vector_sha == "c2193ecca69b84eb34f35d185dc79ba61f89770a2704cb37b6709c96bcb06d79"
    assert [row["label"] for row in old["sourceGuards"]] == ["before", "after-install", "after-focused-checks", "after-cleanup"]
    assert all(row == {"label": row["label"], "files": 494, "bytes": 7227242, "matches": True, "vectorSha256": old_vector_sha} for row in old["sourceGuards"])
    for key in ["databaseRemoved", "portReleased", "exportUnchanged", "scratchIdentityMatches", "scratchRemoved"]: assert old[key] is True
    assert old["processCleanup"]["remaining"] == old["processCleanup"]["uncertain"] == [] and old["processCleanup"]["originalGroupsAbsent"] is True
    assert old["residualBeforeEscalation"] == [] and old.get("cleanupSignals", []) == []
    assert old["databaseCleanup"] == {"operation": "drop", "marker": "iv-workspace-drafts:" + carry_source, "fixturesAbsent": True, "fixtureDatabases": [], "databaseRemoved": True}
    assert old["fixtureAuditAfterTests"]["fixturesAbsent"] is True and old["fixtureAuditAfterTests"]["fixtureDatabases"] == []
    assert old["server"]["exitCode"] == 0 and old["server"]["intentionalStop"] is True and old["server"]["originalProcessGroupAbsent"] is True
    captures = 0
    def verify(item):
        nonlocal captures
        data = gzip.decompress(base64.b64decode(item["gzipBase64"], validate=True))
        assert item["complete"] is True and len(data) == item["bytes"] <= MAX and sha(data) == item["sha256"]
        captures += 1
        return data
    assert len(old["commands"]) == 14
    for index, command in enumerate(old["commands"]):
        assert command["exitCode"] == (1 if index == 12 else 0)
        assert command["exitObservedAndReaped"] is True and command["pipesEOF"] == [True, True] and command["originalProcessGroupAbsent"] is True
        assert not any(command[key] for key in ["timedOut", "termSent", "killSent", "forcedDrain"])
        for label in ["stdout", "stderr"]: verify(command[label])
    for label in ["stdout", "stderr"]: verify(old["server"][label])
    phases = {}
    for phase, file, count, index in [("unit", "tests/unit/workspace-drafts-http.test.ts", 8, 5), ("postgres", "tests/integration/workspace-drafts-postgres.test.ts", 16, 6)]:
        content = (app / file).read_text()
        assert not re.search(r"\b(?:it|test|describe)\.(?:only|skip|todo)\b", content)
        suites = re.findall(r'describe(?:\.sequential)?\("([^"]+)"', content)
        titles = re.findall(r'\bit\("([^"]+)"', content)
        assert len(suites) == 1 and len(titles) == len(set(titles)) == count
        names = sorted(suites[0] + " " + title for title in titles)
        assert sorted(old["expectedIdentities"][phase]) == names
        command = old["commands"][index]
        assert command["argv"][:6] == ["node_modules/.bin/vitest", "run", "--config", "vitest.workspace-drafts.config.ts", file, "--reporter=json"]
        assert len(command["argv"]) == 7 and command["argv"][6].endswith("/" + phase + ".json")
        result = json.loads(verify(old[phase + "OriginalJson"]))
        assert result == old[phase] and result["success"] is True and result["numTotalTests"] == result["numPassedTests"] == count
        assert all(result[key] == 0 for key in ["numFailedTests", "numPendingTests", "numTodoTests", "numFailedTestSuites", "numPendingTestSuites"])
        rows = [row for suite in result["testResults"] for row in suite["assertionResults"]]
        assert len(rows) == count and sorted(row["fullName"] for row in rows) == names and all(row["status"] == "passed" for row in rows)
        phases[phase] = {"passed": count, "identities": names, "originalJsonBytes": old[phase + "OriginalJson"]["bytes"], "originalJsonSha256": old[phase + "OriginalJson"]["sha256"], "executedThisAttempt": False}
    browser = json.loads(verify(old["browserOriginalJson"]))
    assert browser == old["browser"] and not browser["errors"] and browser["stats"]["expected"] == 0 and browser["stats"]["unexpected"] == 4
    assert browser["stats"]["flaky"] == browser["stats"]["skipped"] == 0
    assert old["commands"][12]["argv"] == ["node_modules/.bin/playwright", "test", "--config", "playwright.workspace-drafts.config.ts"]
    assert captures == 33
    prior_inputs = old["sourceExport"]["inputs"]
    assert len(prior_inputs) == 257 and set(prior_inputs) == set(export)
    allowed_changes = {"lib/workspace-draft-http.ts", "lib/client/workspace-drafts.ts", "tests/unit/workspace-drafts-http.test.ts", "tests/e2e/workspace-drafts.spec.ts", "components/visualizations/generation-results.tsx"}
    assert allowed_changes <= prior_inputs.keys()
    for name, row in prior_inputs.items():
        assert row == old["sourceFiles"][name]
        if name not in allowed_changes: assert export[name] == row, "Previously checked runtime input changed: " + name
    assert old["frozenLock"] == {"bytes": 618662, "sha256": lock_sha}
    assert sha((app / "package-lock.json").read_bytes()) == lock_sha
    report["carriedCore"] = {"validated": True, "sourceCommit": carry_source, "receipt": carry_path, "receiptBytes": len(raw), "receiptSha256": carry_sha,
        "originalCapturesVerified": captures, "phases": {"postgres": phases["postgres"]}, "unchangedRuntimeInputs": 252,
        "historicalUnitReference": {**phases["unit"], "acceptedForCurrentSource": False, "replacementUnitReceiptRequired": True},
        "allowedChangedRuntimeInputs": {name: {"before": prior_inputs[name], "current": export[name]} for name in sorted(allowed_changes)},
        "priorBrowser": {"passed": 0, "failed": 4, "acceptedThisAttempt": False, "originalJsonBytes": old["browserOriginalJson"]["bytes"], "originalJsonSha256": old["browserOriginalJson"]["sha256"]}}


def carry_http():
    raw = (repo / http_carry_path).read_bytes()
    assert len(raw) == 287174 and sha(raw) == http_carry_sha
    old = json.loads(raw)
    assert old["schemaVersion"] == 1 and old["sourceCommit"] == http_carry_source and old["passed"] is False and old["error"] == "AssertionError: "
    assert len(old["sourceFiles"]) == 498 and sum(row["bytes"] for row in old["sourceFiles"].values()) == 7805625
    vector_sha = sha(json.dumps(old["sourceFiles"], sort_keys=True, separators=(",", ":")).encode())
    assert vector_sha == "812407a366fc1531c0fdecfae0aa7081a96930ab9a12e1578606941c89718eae"
    assert [row["label"] for row in old["sourceGuards"]] == ["before", "after-install", "after-focused-checks", "after-cleanup"]
    assert all(row == {"label": row["label"], "files": 498, "bytes": 7805625, "matches": True, "vectorSha256": vector_sha} for row in old["sourceGuards"])
    for key in ["databaseRemoved", "portReleased", "exportUnchanged", "scratchIdentityMatches", "scratchRemoved"]: assert old[key] is True
    assert old["processCleanup"]["remaining"] == old["processCleanup"]["uncertain"] == [] and old["processCleanup"]["originalGroupsAbsent"] is True
    assert old["residualBeforeEscalation"] == [] and old.get("cleanupSignals", []) == []
    assert old["databaseCleanup"] == {"operation": "drop", "marker": "iv-workspace-drafts:" + http_carry_source, "fixturesAbsent": True, "fixtureDatabases": [], "databaseRemoved": True}
    assert old["fixtureAuditBeforeSetup"]["fixturesAbsent"] is True and old["fixtureAuditBeforeSetup"]["fixtureDatabases"] == []
    assert old["server"]["exitCode"] == 0 and old["server"]["intentionalStop"] is True and old["server"]["originalProcessGroupAbsent"] is True
    assert old["carriedCore"]["validated"] is True and old["carriedCore"]["receiptSha256"] == carry_sha
    assert old["carriedCore"]["phases"]["postgres"] == report["carriedCore"]["phases"]["postgres"]
    captures = 0
    def verify(item):
        nonlocal captures
        data = gzip.decompress(base64.b64decode(item["gzipBase64"], validate=True))
        assert item["complete"] is True and len(data) == item["bytes"] <= MAX and sha(data) == item["sha256"]
        captures += 1
        return data
    assert len(old["commands"]) == 13
    for index, command in enumerate(old["commands"]):
        assert command["exitCode"] == (1 if index == 11 else 0)
        assert command["exitObservedAndReaped"] is True and command["pipesEOF"] == [True, True] and command["originalProcessGroupAbsent"] is True
        assert not any(command[key] for key in ["timedOut", "termSent", "killSent", "forcedDrain"])
        for label in ["stdout", "stderr"]: verify(command[label])
    for label in ["stdout", "stderr"]: verify(old["server"][label])
    result = json.loads(verify(old["unitOriginalJson"]))
    file = "tests/unit/workspace-drafts-http.test.ts"
    content = (app / file).read_text()
    assert not re.search(r"\b(?:it|test|describe)\.(?:only|skip|todo)\b", content)
    suites = re.findall(r'describe(?:\.sequential)?\("([^"]+)"', content)
    titles = re.findall(r'\bit\("([^"]+)"', content)
    assert len(suites) == 1 and len(titles) == len(set(titles)) == 8
    names = sorted(suites[0] + " " + title for title in titles)
    assert names == sorted(old["expectedIdentities"]["unit"])
    command = old["commands"][5]
    assert command["argv"][:6] == ["node_modules/.bin/vitest", "run", "--config", "vitest.workspace-drafts.config.ts", file, "--reporter=json"]
    assert len(command["argv"]) == 7 and command["argv"][6].endswith("/unit.json")
    assert result == old["unit"] and result["success"] is True and result["numTotalTests"] == result["numPassedTests"] == 8
    assert all(result[key] == 0 for key in ["numFailedTests", "numPendingTests", "numTodoTests", "numFailedTestSuites", "numPendingTestSuites"])
    rows = [row for suite in result["testResults"] for row in suite["assertionResults"]]
    assert len(rows) == 8 and sorted(row["fullName"] for row in rows) == names and all(row["status"] == "passed" for row in rows)
    browser = json.loads(verify(old["browserOriginalJson"]))
    assert browser == old["browser"] and not browser["errors"] and browser["stats"]["expected"] == 0 and browser["stats"]["unexpected"] == 4
    assert browser["stats"]["flaky"] == browser["stats"]["skipped"] == 0 and captures == 30
    assert old["commands"][11]["argv"] == ["node_modules/.bin/playwright", "test", "--config", "playwright.workspace-drafts.config.ts"]
    prior = old["sourceExport"]["inputs"]
    allowed = {"components/visualizations/generation-results.tsx", "tests/e2e/workspace-drafts.spec.ts"}
    assert len(prior) == 257 and set(prior) == set(export) and allowed <= prior.keys()
    for name, row in prior.items():
        assert row == old["sourceFiles"][name]
        if name not in allowed: assert export[name] == row, "HTTP checked runtime input changed: " + name
    assert old["frozenLock"] == {"bytes": 618662, "sha256": lock_sha}
    report["carriedHttp"] = {"validated": True, "sourceCommit": http_carry_source, "receipt": http_carry_path, "receiptBytes": len(raw), "receiptSha256": http_carry_sha,
        "passed": 8, "identities": names, "originalJsonBytes": old["unitOriginalJson"]["bytes"], "originalJsonSha256": old["unitOriginalJson"]["sha256"], "executedThisAttempt": False,
        "originalCapturesVerified": captures, "unchangedRuntimeInputs": 255,
        "allowedChangedRuntimeInputs": {name: {"before": prior[name], "current": export[name]} for name in sorted(allowed)},
        "priorBrowser": {"passed": 0, "failed": 4, "acceptedThisAttempt": False, "originalJsonBytes": old["browserOriginalJson"]["bytes"], "originalJsonSha256": old["browserOriginalJson"]["sha256"]}}


def check_browser():
    value = read_report("browser")
    assert report["commands"][-1]["exitCode"] == 0 and not value["errors"]
    assert value["stats"]["expected"] == 4 and all(value["stats"][key] == 0 for key in ["unexpected", "flaky", "skipped"])
    def walk(suites):
        return [spec for suite in suites for spec in suite.get("specs", [])] + [spec for suite in suites for spec in walk(suite.get("suites", []))]
    titles = ["a Course is applied saved privately edited and restored after a new session", "a Report is applied saved privately edited and restored after a new session"]
    cases = [(spec, case) for spec in walk(value["suites"]) for case in spec["tests"]]
    assert len(cases) == 4 and sorted((spec["title"], case["projectName"]) for spec, case in cases) == sorted((title, profile) for title in titles for profile in ["desktop-chromium", "narrow-chromium"])
    report["browserBoundaries"] = []
    for spec, case in cases:
        assert case["expectedStatus"] == "passed" and case["status"] == "expected" and len(case["results"]) == 1
        result = case["results"][0]
        assert result["status"] == "passed" and result["retry"] == 0 and not result.get("errors")
        attachments = [row for row in result["attachments"] if row["name"] == "iv-workspace-draft-boundary" and row["contentType"] == "application/json"]
        assert len(attachments) == 1
        raw = base64.b64decode(attachments[0]["body"], validate=True)
        assert len(raw) <= 16384
        boundary = json.loads(raw)
        report["browserBoundaries"].append({"bytes": len(raw), "sha256": sha(raw), "result": boundary})
        assert boundary["kind"] == "iv-workspace-draft-boundary" and boundary["schemaVersion"] == 1
        assert boundary["profile"] == case["projectName"] and boundary["title"] == spec["title"]
        assert boundary["status"] == "passed" and boundary["stage"] == "complete" and boundary["primaryError"] is None
        assert boundary["authoredGenerationResponses"] == 1 and boundary["realSaveRequests"] == 2
        observer = boundary["responseObserver"]
        assert observer["kind"] == "native-fetch-response-clone" and observer["maxResponseBytes"] == 5242880 and observer["pendingJobs"] == 0 and observer["failures"] == []
        assert len(observer["reads"]) == 2 and len({row["requestId"] for row in observer["reads"]}) == 2
        assert all(row["status"] == 200 and "no-store" in row["cacheControl"] and 0 < row["bytes"] <= 5242880 and re.fullmatch(r"[0-9a-f]{64}", row["sha256"]) for row in observer["reads"])
        assert boundary["observations"]["newSessionRestored"] is True
        saves = boundary["observations"]["saves"]
        assert len(saves) == 2 and [row["revision"] for row in saves] == [1, 2] and saves[0]["id"] == saves[1]["id"]
        assert saves[0]["requestId"] != saves[1]["requestId"] and saves[0]["documentHash"] != saves[1]["documentHash"]
        assert [row["requestId"] for row in observer["reads"]] == [row["requestId"] for row in saves]
        assert all(value == 0 for value in boundary["boundary"]["counts"].values())
        rows = boundary["boundary"]["navigationCancellations"]
        assert boundary["boundary"]["navigationCancellationCount"] == len(rows) <= 16
        for row in rows:
            assert row["transition"] != "complete" and row["target"].startswith("/")
            assert row["status"] == 200 and row["contentType"].startswith("text/x-component") or row["method"] == "POST" and row["status"] in [303, 307, 308]
            assert row["path"] == row["target"] if row["method"] == "GET" else row["method"] == "POST" and row["redirect"] == row["target"]
        assert boundary["cleanup"] == {"contextsCreated": 1, "contextsClosed": 1, "pendingJobs": 0, "failures": []}


try:
    configs = {"package.json", "package-lock.json", "tsconfig.json", "eslint.config.mjs", "next.config.ts", "postcss.config.mjs", "vitest.workspace-drafts.config.ts", "playwright.workspace-drafts.config.ts"}
    tests = {"tests/unit/workspace-drafts-http.test.ts", "tests/integration/workspace-drafts-postgres.test.ts", "tests/providers/postgres-fixture.ts", "tests/e2e/workspace-drafts.spec.ts"}
    selected = [name for name in before if name.startswith(("app/", "components/", "hooks/", "lib/", "packages/", "public/")) or name in configs or name in tests or name.startswith("scripts/") and name.endswith(".ts")]
    for name in selected:
        assert before[name]["mode"] != "120000" and not (repo / name).is_symlink(), "Runtime exports must be regular source inputs"
        destination = app / name
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(repo / name, destination); os.chmod(destination, 0o755 if before[name]["mode"] == "100755" else 0o644)
        export[name] = before[name]
    assert configs | tests <= export.keys()
    report["sourceExport"] = {"files": len(export), "bytes": sum(row["bytes"] for row in export.values()), "inputs": export}
    check_export()
    carry_core()
    carry_http()
    assert run(["node", "--version"]).strip() == b"v24.21.0"
    assert sha((app / "package-lock.json").read_bytes()) == lock_sha
    report["frozenLock"] = {"bytes": (app / "package-lock.json").stat().st_size, "sha256": lock_sha}
    run(["npm", "ci", "--ignore-scripts", "--no-audit", "--no-fund"], 240)
    guard("after-install")
    report["databaseOwnership"] = database_guard("mark"); database_marked = True
    scoped = [name for name in selected if name in tests or name in {"vitest.workspace-drafts.config.ts", "playwright.workspace-drafts.config.ts", "lib/workspace-drafts.ts", "lib/workspace-draft-http.ts", "lib/client/workspace-drafts.ts", "lib/client/generation-batch.ts", "components/visualizations/composer.tsx", "components/visualizations/generation-results.tsx", "components/visualizations/saved-draft-editor.tsx", "packages/backend-contracts/provider.ts", "packages/backend-contracts/workspace-drafts.ts", "packages/provider-local/adapter.ts", "packages/provider-local/workspace-drafts.ts", "packages/domain/canonical.ts", "packages/domain/serialization.ts"} or name.startswith("app/api/workspaces/") or name.startswith("app/app/workspaces/") and ("visualizations/" in name or name.endswith("/[workspaceSlug]/page.tsx"))]
    report["focusedStaticInputs"] = scoped
    run(["node_modules/.bin/eslint", *scoped], 60)
    (app / "tsconfig.workspace-drafts-checks.json").write_text(json.dumps({"extends": "./tsconfig.json", "include": scoped, "exclude": ["node_modules", "components/ai-elements"], "compilerOptions": {"incremental": False, "plugins": []}}))
    run(["node_modules/.bin/tsc", "--noEmit", "-p", "tsconfig.workspace-drafts-checks.json"], 60)
    report["fixtureAuditBeforeSetup"] = database_guard("audit")
    assert report["fixtureAuditBeforeSetup"]["fixturesAbsent"]
    guard("after-focused-checks")
    run(["npm", "run", "setup:local"], 60); run(["npm", "run", "doctor"], 30)
    run(["node_modules/.bin/playwright", "install", "--only-shell", "chromium"], 150)
    shells = [p for p in (root / "browsers").rglob("*") if p.name in ["headless_shell", "chrome-headless-shell"] and p.is_file() and not p.is_symlink()]
    assert len(shells) == 1
    shell = shells[0]
    assert shell.stat().st_uid == os.getuid() and shell.open("rb").read(4) == b"\x7fELF"
    linked = run(["ldd", str(shell)], 20)
    assert b"not found" not in linked
    report["browserRuntime"] = {"playwright": json.loads((app / "node_modules/@playwright/test/package.json").read_text())["version"], "sharedLibrariesResolved": True, "shellBytes": shell.stat().st_size}
    assert report["browserRuntime"]["playwright"] == "1.57.0"
    assert work_end - time.monotonic() >= 667, "Setup consumed the bounded browser window"
    probe = socket.socket(); probe.bind(("127.0.0.1", 3100)); probe.close()
    server_out, server_err = (root / "server.stdout").open("wb"), (root / "server.stderr").open("wb")
    server = subprocess.Popen(["node_modules/.bin/next", "dev", "--webpack", "--hostname", "127.0.0.1", "--port", "3100"], cwd=app, env=env, stdout=server_out, stderr=server_err, start_new_session=True)
    groups.append(server.pid)
    ready_end = min(time.monotonic() + 90, work_end - 667)
    report["readiness"] = []
    for pathname, expected in [("/auth", 200), ("/app", 307), ("/", 200)]:
        while True:
            assert server.poll() is None
            assert interruption is None, interruption
            connection = http.client.HTTPConnection("127.0.0.1", 3100, timeout=10)
            try:
                connection.request("GET", pathname); response = connection.getresponse(); data = response.read(MAX + 1)
                if response.status == expected and len(data) <= MAX:
                    report["readiness"].append({"path": pathname, "status": response.status, "bytes": len(data), "sha256": sha(data)}); break
            except OSError: pass
            finally: connection.close()
            assert time.monotonic() < ready_end, "Next readiness expired"
            time.sleep(0.2)
    assert work_end - time.monotonic() >= 667
    run(["node_modules/.bin/playwright", "test", "--config", "playwright.workspace-drafts.config.ts"], 660, (0, 1))
    check_browser(); guard("after-browser")
    status = 0
except BaseException as error:
    report["error"] = type(error).__name__ + ": " + str(error)
finally:
    cleanup_end = time.monotonic() + 90
    for phase in ["unit", "postgres", "browser"]:
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
    captures += [report[key] for key in ["unitOriginalJson", "postgresOriginalJson", "browserOriginalJson"] if key in report]
    captures += [report["server"][key] for key in ["stdout", "stderr"] if key in report.get("server", {})]
    report["finishedAt"] = time.time()
    report["passed"] = status == 0 and report.get("carriedCore", {}).get("validated") is True and report.get("carriedHttp", {}).get("validated") is True and len(report["sourceGuards"]) == 5 and all(report.get(key) for key in ["databaseRemoved", "portReleased", "exportUnchanged", "scratchRemoved", "scratchIdentityMatches"]) and all(row["complete"] for row in captures)
    print("IV_WORKSPACE_DRAFT_RESULT=" + json.dumps(report, separators=(",", ":")), flush=True)
raise SystemExit(0 if report["passed"] else 1)
