#!/usr/bin/env python3
"""Bounded public-CI-only removal checks. No host install/server/database work."""
import base64
import gzip
import hashlib
import json
import os
from pathlib import Path
import shutil
import signal
import socket
import stat
import subprocess
import tempfile
import time
import traceback

repo = Path.cwd()
source = os.environ["SOURCE_COMMIT"]
branch = "qa/workspace-removals-20261112-6"
assert os.environ.get("CI") == "true"
assert os.environ.get("GITHUB_REPOSITORY") == "alvarovillalbaa/intelligent-visualization"
assert os.environ.get("GITHUB_EVENT_NAME") == "create" and os.environ.get("GITHUB_REF") == "refs/heads/" + branch
event = json.loads(Path(os.environ["GITHUB_EVENT_PATH"]).read_text())
assert event["ref_type"] == "branch" and event["ref"] == branch and event["repository"]["private"] is False
assert subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip() == source
assert not subprocess.check_output(["git", "status", "--porcelain", "--untracked-files=all", "--ignored"])
sha = lambda data: hashlib.sha256(data).hexdigest()
report = {"schemaVersion": 1, "sourceCommit": source, "commands": [], "sourceGuards": [], "cleanup": {}, "startedAt": time.time()}
deadline = time.monotonic() + 1050
root = Path(tempfile.mkdtemp(prefix="iv-removal-", dir=os.environ["RUNNER_TEMP"]))
app = root / "app"
app.mkdir()
report["runnerRoot"] = str(root)

def vector():
    result = {}
    for line in subprocess.check_output(["git", "ls-tree", "-rz", "--full-tree", "HEAD"]).split(b"\0"):
        if not line: continue
        metadata, raw = line.split(b"\t", 1)
        mode, kind, blob = metadata.decode().split()
        name = raw.decode()
        file = repo / name
        assert kind == "blob" and mode in ["100644", "100755", "120000"]
        assert file.is_symlink() if mode == "120000" else stat.S_ISREG(file.lstat().st_mode) and not file.is_symlink()
        data = os.fsencode(os.readlink(file)) if mode == "120000" else file.read_bytes()
        assert hashlib.sha1(b"blob " + str(len(data)).encode() + b"\0" + data).hexdigest() == blob
        result[name] = {"blob": blob, "mode": mode, "bytes": len(data), "sha256": sha(data)}
    return result

before = vector()
report["sourceFiles"] = before
carry_path = "docs/results/2026/11-12/workspace-removals-attempt-4.json"
carry_bytes = (repo / carry_path).read_bytes()
assert sha(carry_bytes) == "59a982134fa7f5b1ac56ad2f20744e9c99e2129a89369b5d882a6bdc450f6eda"
carry = json.loads(carry_bytes)
assert carry["sourceCommit"] == "bbc6f6391539dbec8a783f0d5b75fae8e9a5c1c1" and carry["exitCode"] == 1
assert (carry["core"]["numTotalTests"], carry["core"]["numPassedTests"], carry["core"]["numFailedTests"], carry["core"]["numPendingTests"]) == (34, 32, 2, 0)
failed_titles = ["terminal workspace removal in PostgreSQL makes a direct SQL child write waiting on a removal observe the committed tombstone",
    "terminal workspace removal in PostgreSQL protects every retained child from inserts updates deletes retargets and truncation"]
assert [test["fullName"] for file in carry["core"]["testResults"] for test in file["assertionResults"] if test["status"] == "failed"] == failed_titles
mutable = {"scripts/workspace-removal-checks.py", "tests/integration/workspace-removals-postgres.test.ts", "tests/e2e/workspace-removals.spec.ts"}
runtime_names = lambda files: {name for name in files if not name.startswith(("docs/", ".github/", ".claude/")) and name not in mutable}
assert runtime_names(before) == runtime_names(carry["sourceFiles"])
assert all(before[name] == carry["sourceFiles"][name] for name in runtime_names(before))
report["acceptedCoreProvenance"] = {"path": carry_path, "sha256": sha(carry_bytes), "sourceCommit": carry["sourceCommit"],
    "passed": [test["fullName"] for file in carry["core"]["testResults"] for test in file["assertionResults"] if test["status"] == "passed"],
    "runtimeFilesExact": len(runtime_names(before)), "notANewSingle34CaseRun": True}
completion_path = "docs/results/2026/11-12/workspace-removals-attempt-5.json"
completion_bytes = (repo / completion_path).read_bytes()
assert sha(completion_bytes) == "54396a8221c3cc25cc2c55eb2bf058ae8f947f703cc229902ea1eb66f2736952"
completion = json.loads(completion_bytes)
assert completion["sourceCommit"] == "773036fd67960d0e33bfecae8d534f3e6c09f776" and completion["exitCode"] == 1
assert (completion["core"]["numPassedTests"], completion["core"]["numFailedTests"], completion["core"]["numPendingTests"]) == (2, 0, 32)
assert [test["fullName"] for file in completion["core"]["testResults"] for test in file["assertionResults"] if test["status"] == "passed"] == failed_titles
for name in ["tests/unit/workspace-removals.test.ts", "tests/integration/workspace-removals-postgres.test.ts", "vitest.workspace-removals.config.ts"]:
    assert before[name] == completion["sourceFiles"][name]
assert completion["cleanup"]["database"]["dropped"] is True and all(group["absent"] for group in completion["cleanup"]["groups"])
report["acceptedCoreCompletion"] = {"path": completion_path, "sha256": sha(completion_bytes), "sourceCommit": completion["sourceCommit"], "passed": failed_titles,
    "coreFilesExact": True, "notExecutedAgain": True}

def guard(label):
    assert vector() == before
    assert not subprocess.check_output(["git", "status", "--porcelain", "--untracked-files=all", "--ignored"])
    report["sourceGuards"].append({"label": label, "matches": True, "files": len(before)})

for name in before:
    if name.startswith(("docs/", ".github/", ".claude/")): continue
    assert before[name]["mode"] != "120000", "Unexpected application symlink"
    target = app / name
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(repo / name, target)
    target.chmod(0o755 if before[name]["mode"] == "100755" else 0o644)
assert sha((app / "package-lock.json").read_bytes()) == "b18dd278e6eded698e269d2e8400b0359083a8ba34de4721227a70b5e27c0d59"
env = {key: os.environ[key] for key in ["PATH", "RUNNER_TEMP"]}
for directory in ["home", "tmp", "npm", "browsers", "cache", "config", "storage"]: (root / directory).mkdir()
env.update({"CI": "true", "TZ": "UTC", "LANG": "C.UTF-8", "HOME": str(root / "home"), "TMPDIR": str(root / "tmp"),
    "npm_config_cache": str(root / "npm"), "XDG_CACHE_HOME": str(root / "cache"), "XDG_CONFIG_HOME": str(root / "config"),
    "PLAYWRIGHT_BROWSERS_PATH": str(root / "browsers"), "NEXT_TELEMETRY_DISABLED": "1", "DO_NOT_TRACK": "1", "NO_COLOR": "1",
    "PERSISTENCE_PROVIDER": "local", "STORAGE_PROVIDER": "local", "AUTH_PROVIDER": "portable", "REALTIME_PROVIDER": "local",
    "AI_ENABLED": "false", "EVE_ENABLED": "false", "WORKFLOWS_ENABLED": "false", "QUEUES_ENABLED": "false", "SANDBOX_QA_ENABLED": "false",
    "NEXT_PUBLIC_APP_URL": "http://127.0.0.1:3100", "LOCAL_STORAGE_DIR": str(root / "storage"), "IV_REMOVAL_CHECK_ROOT": str(root),
    "LOCAL_DATABASE_URL": "postgresql://iv_ci:authored-ci-only@127.0.0.1:54431/intelligent_visualization_ci",
    "IV_POSTGRES_TEST_ADMIN_URL": "postgresql://iv_ci:authored-ci-only@127.0.0.1:54431/postgres", "IV_POSTGRES_FIXTURES": "disposable"})
groups = []
server = None

def packed(data):
    assert len(data) <= 2_000_000, "Evidence stream exceeded its bound"
    return {"bytes": len(data), "sha256": sha(data), "gzipBase64": base64.b64encode(gzip.compress(data, mtime=0)).decode()}

def stop(process):
    if process.poll() is None:
        os.killpg(process.pid, signal.SIGTERM)
        try: process.wait(timeout=8)
        except subprocess.TimeoutExpired:
            os.killpg(process.pid, signal.SIGKILL)
            process.wait(timeout=5)
    def live_group():
        for entry in Path('/proc').iterdir():
            if not entry.name.isdigit(): continue
            try:
                fields = (entry / 'stat').read_text().rpartition(') ')[2].split()
                if fields[0] != 'Z' and int(fields[2]) == process.pid: return True
            except (FileNotFoundError, ProcessLookupError): pass
        return False
    if not live_group(): return True
    # Also retire any surviving child after the parent already exited.
    os.killpg(process.pid, signal.SIGTERM)
    end = time.monotonic() + 5
    while time.monotonic() < end:
        if not live_group(): return True
        time.sleep(.1)
    os.killpg(process.pid, signal.SIGKILL)
    return not live_group()

def run(argv, seconds=60):
    start = time.monotonic()
    out, err = root / (str(len(report["commands"])) + ".out"), root / (str(len(report["commands"])) + ".err")
    row = {"argv": argv, "startedAt": time.time()}
    report["commands"].append(row)
    with out.open("wb") as stdout, err.open("wb") as stderr:
        process = subprocess.Popen(argv, cwd=app, env=env, stdout=stdout, stderr=stderr, start_new_session=True)
        groups.append(process)
        try: process.wait(timeout=max(1, min(seconds, deadline - time.monotonic())))
        except subprocess.TimeoutExpired:
            row["timedOut"] = True
            stop(process)
    row.update({"exitCode": process.returncode, "elapsedSeconds": round(time.monotonic() - start, 3), "stdout": packed(out.read_bytes()), "stderr": packed(err.read_bytes())})
    print("IV_REMOVAL_COMMAND", json.dumps({k: v for k, v in row.items() if k not in ["stdout", "stderr"]}), flush=True)
    if process.returncode or row.get("timedOut"): raise RuntimeError("Focused command failed: " + argv[0])
    return out.read_bytes()

def database_guard(action):
    marker = "iv-removal:" + source
    script = r'''
import pg from 'pg';
const action=process.argv[1],marker=process.argv[2],expected=JSON.parse(process.argv[3]);
const pool=new pg.Pool({connectionString:process.env.IV_POSTGRES_TEST_ADMIN_URL,max:1,connectionTimeoutMillis:5000,query_timeout:10000});
try {
 const row=(await pool.query(`SELECT oid::text AS oid,datdba::text AS owner,pg_get_userbyid(datdba) AS owner_name,shobj_description(oid,'pg_database') AS marker,
 (SELECT count(*)::int FROM pg_stat_activity WHERE datid=pg_database.oid) AS clients FROM pg_database WHERE datname='intelligent_visualization_ci'`)).rows[0];
 if(!row||row.owner_name!=='iv_ci'||row.clients!==0)throw Error('Owned application database or pool boundary changed');
 const fixtures=(await pool.query("SELECT datname FROM pg_database WHERE datname LIKE 'iv_check_%'")).rows;
 const roles=(await pool.query("SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated','iv_runtime')")).rows;
 if(fixtures.length||roles.length)throw Error('Disposable fixtures or roles remain');
 if(action==='mark'){
   if(row.marker!==null)throw Error('Existing app database marker cannot be adopted');
   await pool.query("COMMENT ON DATABASE intelligent_visualization_ci IS '"+marker+"'");
 }else if(row.oid!==expected.oid||row.owner!==expected.owner||row.marker!==marker)throw Error('Owned app database identity changed');
 if(action==='drop')await pool.query('DROP DATABASE intelligent_visualization_ci');
 console.log(JSON.stringify({action,oid:row.oid,owner:row.owner,marker,clients:row.clients,fixturesAbsent:true,rolesAbsent:true,dropped:action==='drop'}));
}finally{await pool.end()}
'''
    return json.loads(run(["node", "--input-type=module", "-e", script, action, marker, json.dumps(report.get("databaseOwnership", {}))], 20))

status = 1
try:
    guard("before-install")
    run(["npm", "ci", "--ignore-scripts", "--no-audit", "--no-fund"], 240)
    scoped = [name for name in before if name.endswith((".ts", ".tsx")) and ("removal" in name or "lifecycle" in name)] + [
        "packages/provider-postgres/adapter.ts", "packages/provider-postgres/portable.ts", "packages/provider-postgres/legacy-state.ts", "packages/provider-postgres/workspace-drafts.ts",
        "packages/provider-local/database.ts", "packages/provider-local/schema.ts", "packages/provider-supabase/schema.ts", "packages/backend-contracts/provider.ts",
        "packages/domain/entities.ts", "scripts/setup-local.ts", "lib/workspace-publication-http.ts", "app/app/workspaces/[workspaceSlug]/page.tsx"]
    report["focusedStaticInputs"] = scoped
    run(["node_modules/.bin/eslint", *scoped], 60)
    (app / "tsconfig.removal-checks.json").write_text(json.dumps({"extends": "./tsconfig.json", "include": scoped,
        "exclude": ["node_modules", "components/ai-elements"], "compilerOptions": {"incremental": False, "plugins": []}}))
    run(["node_modules/.bin/tsc", "--noEmit", "-p", "tsconfig.removal-checks.json"], 90)
    report["databaseOwnership"] = database_guard("mark")
    report["fixtureAuditAfterCore"] = database_guard("audit")
    guard("after-core")
    run(["npm", "run", "setup:local"], 75)
    run(["node_modules/.bin/playwright", "install", "--only-shell", "chromium"], 150)
    server_out, server_err = (root / "server.out").open("wb"), (root / "server.err").open("wb")
    server = subprocess.Popen(["node_modules/.bin/next", "dev", "--webpack", "--hostname", "127.0.0.1", "--port", "3100"], cwd=app, env=env, stdout=server_out, stderr=server_err, start_new_session=True)
    groups.append(server)
    end = time.monotonic() + 30
    while time.monotonic() < end:
        assert server.poll() is None
        try:
            with socket.create_connection(("127.0.0.1", 3100), timeout=.5): break
        except OSError: time.sleep(.2)
    else: raise RuntimeError("Owned server failed readiness")
    run(["node_modules/.bin/playwright", "test", "--config", "playwright.workspace-removals.config.ts"], 640)
    report["browser"] = json.loads((root / "browser.json").read_text())
    assert report["browser"]["stats"]["expected"] == 4 and report["browser"]["stats"]["unexpected"] == 0
    report["screenshots"] = {file.name: packed(file.read_bytes()) for file in sorted(root.glob("*.png"))}
    assert len(report["screenshots"]) == 4
    guard("after-browser")
    status = 0
except BaseException as error:
    report["failure"] = {"type": type(error).__name__, "message": str(error), "traceback": traceback.format_exc()}
finally:
    report["cleanup"]["groups"] = [{"pid": process.pid, "absent": stop(process)} for process in reversed(groups)]
    if server:
        server_out.close(); server_err.close()
        report["server"] = {"stdout": packed((root / "server.out").read_bytes()), "stderr": packed((root / "server.err").read_bytes())}
    if "databaseOwnership" in report:
        try: report["cleanup"]["database"] = database_guard("drop")
        except BaseException: report["cleanup"]["databaseError"] = traceback.format_exc(); status = 1
    for name in ["core", "browser"]:
        file = root / (name + ".json")
        if file.exists() and name not in report: report[name] = json.loads(file.read_text())
    report["screenshots"] = {file.name: packed(file.read_bytes()) for file in sorted(root.glob("*.png"))}
    assert len(report["screenshots"]) <= 4
    report["browserFailureContexts"] = {str(file.relative_to(root)): packed(file.read_bytes()) for file in sorted((root / "browser-output").rglob("error-context.md"))}
    assert len(report["browserFailureContexts"]) <= 4
    try: guard("after-owned-shutdown")
    except BaseException: report["cleanup"]["sourceGuardError"] = traceback.format_exc(); status = 1
    if any(not group["absent"] for group in report["cleanup"]["groups"]): status = 1
    report["exitCode"] = status
    report["finishedAt"] = time.time()
    data = json.dumps(report, separators=(",", ":")).encode()
    encoded = base64.b64encode(gzip.compress(data, mtime=0)).decode()
    print("IV_REMOVAL_RECEIPT_BEGIN", json.dumps({"bytes": len(data), "sha256": sha(data)}), flush=True)
    for offset in range(0, len(encoded), 24000): print("IV_REMOVAL_RECEIPT_DATA " + encoded[offset:offset + 24000], flush=True)
    print("IV_REMOVAL_RECEIPT_END", flush=True)
    shutil.rmtree(root)
raise SystemExit(status)
