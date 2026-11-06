#!/usr/bin/env python3
"""Bounded, public-CI-only PostgreSQL and local app acceptance; never run on the host."""
import base64
import gzip
import hashlib
import http.client
import json
import os
from pathlib import Path
import re
import shutil
import signal
import socket
import subprocess
import tempfile
import time

repo = Path.cwd()
source = os.environ["SOURCE_COMMIT"]
admin_url = "postgresql://iv_ci:authored-ci-only@127.0.0.1:54431/postgres"
app_url = "postgresql://iv_ci:authored-ci-only@127.0.0.1:54431/intelligent_visualization_ci"
branch = "qa/postgres-provider-20261106-3"
carry_source = "a5a702ea20108d3ed376fab9a181b838dd5897e0"
carry_path = "docs/results/2026/11-06/postgres-attempt-2.json"
carry_sha256 = "500b26672802fe0b82c25436d14cae7a6e329e905f2f2a87c41c7b7a8ad34384"
lock_sha256 = "b18dd278e6eded698e269d2e8400b0359083a8ba34de4721227a70b5e27c0d59"
assert re.fullmatch(r"[0-9a-f]{40}", source)
assert subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip() == source
assert not subprocess.check_output(["git", "status", "--porcelain"])
assert os.environ.get("CI") == os.environ.get("IV_POSTGRES_PUBLIC_REPOSITORY") == "true"
assert os.environ.get("GITHUB_REPOSITORY") == "alvarovillalbaa/intelligent-visualization"
assert os.environ.get("GITHUB_EVENT_NAME") == "create" and os.environ.get("GITHUB_REF") == "refs/heads/" + branch
event = json.loads(Path(os.environ["GITHUB_EVENT_PATH"]).read_text())
assert event["ref_type"] == "branch" and event["ref"] == branch and event["repository"]["private"] is False
assert os.environ.get("LOCAL_DATABASE_URL") == app_url
assert os.environ.get("IV_POSTGRES_TEST_ADMIN_URL") == admin_url and os.environ.get("IV_POSTGRES_FIXTURES") == "disposable"
paths = subprocess.check_output(["git", "ls-files", "-z"]).decode().split("\0")[:-1]
work_deadline = time.monotonic() + 1050


def digest(data):
    return hashlib.sha256(data).hexdigest()


def vector():
    return {name: digest(os.readlink(repo / name).encode() if (repo / name).is_symlink() else (repo / name).read_bytes()) for name in paths}


before = vector()
preexisting = {}
for entry in Path("/proc").iterdir():
    if not entry.name.isdigit(): continue
    try:
        if entry.stat().st_uid == os.getuid(): preexisting[entry.name] = (entry / "stat").read_text().rsplit(") ", 1)[1].split()[19]
    except (FileNotFoundError, ProcessLookupError, PermissionError): pass
root = Path(tempfile.mkdtemp(prefix="ivp-", dir="/tmp"))
assert len(os.fsencode(str(root / "tmp"))) + 64 <= 107, "Owned Chromium temporary path exceeds its socket budget"
root_identity = (root.stat().st_dev, root.stat().st_ino, root.stat().st_uid)
app = root / "app"
app.mkdir()
report = {"sourceCommit": source, "startedAt": time.time(), "commands": [], "sourceVector": before,
          "scope": "Carry validated 7 unit and 28 PostgreSQL identities from attempt 2; run current static/setup/doctor and 2 actual browser identities; no hosted provider, model or production proof"}
groups, selected, export_expected = [], [], {}
server = server_out = server_err = None
database_marked, status = False, 1
env = {key: os.environ[key] for key in ["PATH", "RUNNER_TEMP"] if key in os.environ}
env.update({"CI": "true", "LANG": "C.UTF-8", "TZ": "UTC", "NO_COLOR": "1", "HOME": str(root / "home"),
    "npm_config_cache": str(root / "npm-cache"), "npm_config_userconfig": str(root / "npm-user"),
    "npm_config_globalconfig": str(root / "npm-global"), "XDG_CACHE_HOME": str(root / "cache"),
    "XDG_CONFIG_HOME": str(root / "config"), "COREPACK_HOME": str(root / "corepack"), "TMPDIR": str(root / "tmp"),
    "NEXT_TELEMETRY_DISABLED": "1", "DO_NOT_TRACK": "1", "NEXT_PUBLIC_APP_URL": "http://127.0.0.1:3100",
    "LOCAL_DATABASE_URL": app_url, "LOCAL_STORAGE_DIR": str(root / "storage"), "PERSISTENCE_PROVIDER": "local",
    "STORAGE_PROVIDER": "local", "AUTH_PROVIDER": "portable", "REALTIME_PROVIDER": "local", "AI_ENABLED": "false",
    "EVE_ENABLED": "false", "WORKFLOWS_ENABLED": "false", "QUEUES_ENABLED": "false", "SANDBOX_QA_ENABLED": "false",
    "IV_POSTGRES_FIXTURES": "disposable", "IV_POSTGRES_TEST_ADMIN_URL": admin_url,
    "IV_POSTGRES_APP_ORIGIN": "http://127.0.0.1:3100", "IV_POSTGRES_BROWSER_REPORT": str(root / "browser.json"),
    "IV_POSTGRES_BROWSER_OUTPUT": str(root / "browser-output"), "PLAYWRIGHT_BROWSERS_PATH": str(root / "browsers"),
    **{key: "" for key in ["DATABASE_URL", "VERCEL", "VERCEL_OIDC_TOKEN", "BLOB_READ_WRITE_TOKEN", "SUPABASE_URL",
        "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "AI_GATEWAY_API_KEY",
        "OPENAI_API_KEY", "ANTHROPIC_API_KEY", "GOOGLE_GENERATIVE_AI_API_KEY", "FIRECRAWL_API_KEY"]}})
for name in ["home", "cache", "config", "corepack", "tmp"]: (root / name).mkdir()
for name in ["npm-user", "npm-global"]: (root / name).write_text("")


def stream(data):
    complete = len(data) <= 4_000_000
    data = data[:4_000_000]
    return {"bytes": len(data), "sha256": digest(data), "base64": base64.b64encode(data).decode(), "complete": complete}


def file_stream(path):
    with path.open("rb") as handle: return stream(handle.read(4_000_001))


def owned_processes():
    owned, uncertain = [], []
    for entry in Path("/proc").iterdir():
        if not entry.name.isdigit(): continue
        try:
            uid = entry.stat().st_uid
            if uid != os.getuid(): continue
            fields = (entry / "stat").read_text().rsplit(") ", 1)[1].split()
            if preexisting.get(entry.name) == fields[19] or fields[0] == "Z": continue
            cwd, pgid = os.readlink(entry / "cwd"), int(fields[2])
            if pgid in groups or cwd == str(root) or cwd.startswith(str(root) + "/"):
                owned.append({"pid": int(entry.name), "startTime": fields[19], "uid": uid, "pgid": pgid, "cwd": cwd,
                    "command": (entry / "cmdline").read_bytes()[:4096].replace(b"\0", b" ").decode("utf-8", "replace")})
        except (FileNotFoundError, ProcessLookupError): pass
        except PermissionError: uncertain.append(int(entry.name))
    return owned, uncertain


def terminate(identities):
    for identity in identities:
        current, _ = owned_processes()
        if identity in current:
            try: os.kill(identity["pid"], signal.SIGTERM)
            except ProcessLookupError: pass
            report.setdefault("signals", []).append({"pid": identity["pid"], "startTime": identity["startTime"], "signal": "TERM"})


def check_export():
    assert all(not (app / name).is_symlink() and digest((app / name).read_bytes()) == expected for name, expected in export_expected.items()), "Exported source changed"


def capture_lock():
    lock_path = app / "package-lock.json"
    if lock_path.exists():
        data = lock_path.read_bytes()
        report["generatedLock"] = {"bytes": len(data), "sha256": digest(data), "gzipBase64": base64.b64encode(gzip.compress(data, mtime=0)).decode()}


def run(argv, timeout=120, accepted=(0,)):
    timeout = min(timeout, max(1, work_deadline - time.monotonic()))
    started = time.monotonic()
    index = len(report["commands"])
    out_path, err_path = root / f"command-{index}.stdout", root / f"command-{index}.stderr"
    with out_path.open("wb") as out, err_path.open("wb") as err:
        proc = subprocess.Popen(argv, cwd=app, env=env, stdout=out, stderr=err, start_new_session=True)
        groups.append(proc.pid)
        timed_out = False
        while proc.poll() is None:
            server_overflow = server is not None and sum((root / ("server." + label)).stat().st_size for label in ["stdout", "stderr"]) > 4_000_000
            if time.monotonic() - started >= timeout or out_path.stat().st_size + err_path.stat().st_size > 4_000_000 or server_overflow:
                timed_out = True
                terminate([row for row in owned_processes()[0] if row["pgid"] == proc.pid])
                try: proc.wait(timeout=10)
                except subprocess.TimeoutExpired: pass
                break
            time.sleep(0.1)
    report["commands"].append({"argv": argv, "exitCode": proc.returncode, "timedOut": timed_out,
        "seconds": round(time.monotonic() - started, 3), "stdout": file_stream(out_path), "stderr": file_stream(err_path)})
    check_export()
    if proc.returncode not in accepted or timed_out: raise RuntimeError("Focused command failed: " + " ".join(argv))
    return base64.b64decode(report["commands"][-1]["stdout"]["base64"])


def database_guard(operation):
    code = r'''
import pg from 'pg';
const admin = new pg.Pool({connectionString:process.env.IV_POSTGRES_TEST_ADMIN_URL,max:1,connectionTimeoutMillis:5000,query_timeout:10000});
const name='intelligent_visualization_ci', marker='iv-postgres-acceptance:'+process.argv[2], operation=process.argv[1];
try {
 const fixtures=(await admin.query("SELECT datname FROM pg_database WHERE datname ~ '^iv_check_' ORDER BY datname")).rows.map(row=>row.datname);
 const row=(await admin.query("SELECT shobj_description(oid,'pg_database') AS marker FROM pg_database WHERE datname=$1",[name])).rows[0];
 if(operation==='mark') {
  if(!row || row.marker!==null || fixtures.length)throw Error('CI database was not fresh or fixtures preexisted');
  const app=new pg.Pool({connectionString:process.env.LOCAL_DATABASE_URL,max:1,connectionTimeoutMillis:5000,query_timeout:10000});
  try {const count=(await app.query("SELECT count(*)::int AS count FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema' AND c.relkind IN ('r','p','v','m','S','f')")).rows[0].count;if(count!==0)throw Error('CI app database was not empty');}finally{await app.end();}
  await admin.query("COMMENT ON DATABASE intelligent_visualization_ci IS '"+marker+"'");
 } else if(operation==='drop') {
  if(row?.marker!==marker)throw Error('CI ownership marker mismatch; drop refused');
  if((await admin.query('SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname=$1',[name])).rows[0].count!==0)throw Error('CI app database has active clients; drop refused');
  await admin.query('DROP DATABASE intelligent_visualization_ci');
 }
 console.log(JSON.stringify({operation,marker,fixtureDatabases:fixtures,fixturesAbsent:fixtures.length===0,databaseRemoved:operation==='drop'}));
} finally {await admin.end();}
'''
    return json.loads(run(["node", "--input-type=module", "-e", code, operation, source], 30))


def check_vitest(data, count, names):
    assert data["success"] and data["numTotalTests"] == data["numPassedTests"] == count
    assert data["numFailedTests"] == data["numPendingTests"] == data["numFailedTestSuites"] == 0
    assert data["numTodoTests"] == data["numPendingTestSuites"] == 0
    rows = [case for suite in data["testResults"] for case in suite["assertionResults"]]
    assert len(rows) == count and sorted(row["fullName"] for row in rows) == sorted(names)
    assert all(row["status"] == "passed" for row in rows)


def verify_capture(capture):
    data = base64.b64decode(capture["base64"], validate=True)
    assert capture["complete"] is True and len(data) == capture["bytes"] <= 4_000_000
    assert digest(data) == capture["sha256"], "Carried original capture hash mismatch"
    return data


def carry_core(tests, expected):
    raw = (repo / carry_path).read_bytes()
    assert digest(raw) == carry_sha256, "Carried receipt hash mismatch"
    carry = json.loads(raw)
    assert carry["sourceCommit"] == carry_source and carry["passed"] is False
    assert all(carry[key] is True for key in ["sourceUnchanged", "nativeStatusClean", "exportUnchanged", "databaseRemoved",
        "scratchIdentityMatches", "streamClosureVerified", "scratchRemoved", "portReleased"])
    assert carry["liveOwnedBeforeScratchRemoval"] == carry["uncertainNewProcesses"] == []
    assert carry["databaseCleanup"]["databaseRemoved"] and carry["databaseCleanup"]["fixturesAbsent"]
    assert carry["databaseCleanup"]["marker"] == "iv-postgres-acceptance:" + carry_source
    assert carry["fixtureAuditAfterTests"]["fixturesAbsent"] and carry["fixtureAuditAfterTests"]["fixtureDatabases"] == []
    assert carry["server"]["intentionalStop"] and not carry["server"]["killSent"] and carry["server"]["remainingOwned"] == []
    assert all(item["signal"] == "TERM" for item in carry.get("signals", []))
    commands = carry["commands"]
    assert len(commands) == 14
    for index, command in enumerate(commands):
        assert not command["timedOut"] and command["exitCode"] == (1 if index == 12 else 0)
        for label in ["stdout", "stderr"]: verify_capture(command[label])
    for label in ["stdout", "stderr"]: verify_capture(carry["server"][label])
    verify_capture(carry["browserOriginalJson"])
    phases = {}
    for phase, files, count, index, config in [("unit", list(tests)[:1], 7, 6, "vitest.postgres-unit.config.ts"),
        ("postgres", list(tests)[1:], 28, 7, "vitest.postgres.config.ts")]:
        command = commands[index]
        assert command["argv"][:5] == ["node_modules/.bin/vitest", "run", "--config", config, "--reporter=json"]
        assert len(command["argv"]) == 7 and command["argv"][5] == "--outputFile" and command["argv"][6].endswith("/" + phase + ".json")
        original = carry[phase + "OriginalJson"]
        data = json.loads(verify_capture(original))
        assert data == carry[phase], "Carried parsed test report differs from its original JSON"
        identities = [title for name in files for title in expected[name]]
        check_vitest(data, count, identities)
        phases[phase] = {"passed": count, "identities": identities, "originalJson": original, "result": data, "executedThisAttempt": False}
    assert carry["expectedIdentities"] == expected
    allowed = {"tests/e2e/postgres-app.spec.ts", "playwright.postgres.config.ts"}
    assert set(export_expected) == set(carry["testedExport"]), "Carried runtime input set changed"
    for name, previous in carry["testedExport"].items():
        if name not in allowed: assert export_expected[name] == previous, "Carried runtime input changed: " + name
    frozen = gzip.decompress(base64.b64decode(carry["generatedLock"]["gzipBase64"], validate=True))
    assert len(frozen) == carry["generatedLock"]["bytes"] == 618662
    assert digest(frozen) == carry["generatedLock"]["sha256"] == lock_sha256
    assert (app / "package-lock.json").read_bytes() == frozen, "Frozen carried lock changed"
    assert carry["generatedLockChecks"] == {"sha256": lock_sha256, "actualAlternativeDatabaseNodesAbsent": True}
    report["carriedCore"] = {"validated": True, "sourceCommit": carry_source, "receipt": carry_path, "receiptSha256": carry_sha256,
        "phases": phases, "originalCapturesVerified": 33, "unchangedRuntimeInputs": len(export_expected) - len(allowed),
        "lockSha256": lock_sha256, "lockBytes": len(frozen), "priorFullAcceptance": False, "priorBrowserAcceptance": False,
        "allowedBrowserInputs": [{"path": name, "before": carry["testedExport"][name], "after": export_expected[name]} for name in sorted(allowed)]}
    return carry


try:
    tests = {"tests/unit/postgres-configuration.test.ts": 7, "tests/providers/local-provider.test.ts": 3,
        "tests/providers/postgres-invariants.test.ts": 11, "tests/providers/legacy-postgres.test.ts": 8,
        "tests/providers/portable-postgres.test.ts": 6}
    configs = {"package.json", "package-lock.json", "tsconfig.json", "eslint.config.mjs", "next.config.ts", "postcss.config.mjs",
        "vitest.postgres-unit.config.ts", "vitest.postgres.config.ts", "playwright.postgres.config.ts"}
    selected = [name for name in paths if name.startswith(("app/", "components/", "hooks/", "lib/", "packages/", "public/"))
        or name in configs or name in tests or name in {"tests/providers/postgres-fixture.ts", "tests/e2e/postgres-app.spec.ts"}
        or name.startswith("scripts/") and name.endswith(".ts")]
    for name in selected:
        assert not (repo / name).is_symlink(), name
        destination = app / name
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(repo / name, destination)
        export_expected[name] = before[name]
    report["sourceExport"] = {"files": len(selected), "bytes": sum((app / name).stat().st_size for name in selected), "sha256": dict(export_expected)}
    expected = {}
    for name, count in tests.items():
        content = (app / name).read_text()
        assert not re.search(r"\b(?:it|test|describe)\.(?:only|skip|todo)\b", content)
        suites = re.findall(r'describe(?:\.sequential)?\("([^"]+)"', content)
        titles = re.findall(r'\bit\("([^"]+)"', content)
        assert len(suites) == 1 and len(titles) == len(set(titles)) == count
        expected[name] = [suites[0] + " " + title for title in titles]
    report["expectedIdentities"] = expected
    carry = carry_core(tests, expected)
    assert run(["node", "--version"]).strip() == b"v24.21.0"
    capture_lock()
    assert report["generatedLock"]["sha256"] == lock_sha256
    report["lockMode"] = "frozen-from-validated-attempt-2"
    new_lock = json.loads((app / "package-lock.json").read_bytes())
    package = json.loads((app / "package.json").read_bytes())
    additions = {"dependencies": {"pg": "8.23.1"}, "devDependencies": {"@types/pg": "8.23.1", "@playwright/test": "1.57.0"}}
    assert new_lock["lockfileVersion"] == 3
    unchanged = []
    for section in ["dependencies", "devDependencies"]:
        assert new_lock["packages"][""][section] == package[section]
        for name in package[section]:
            version = new_lock["packages"]["node_modules/" + name]["version"]
            if name in additions.get(section, {}): assert version == additions[section][name]
            else:
                unchanged.append({"section": section, "package": name, "version": version})
    assert unchanged == carry["directResolutionsPreserved"]
    nodes = [name.rsplit("node_modules/", 1)[-1] for name in new_lock["packages"] if "node_modules/" in name]
    assert not any(name.startswith("@libsql/") or name in {"libsql", "convex", "drizzle-orm", "drizzle-kit", "@neondatabase/serverless", "better-sqlite3", "sqlite3", "@cloudflare/d1"} for name in nodes)
    report["directResolutionsPreserved"] = unchanged
    report["generatedLockChecks"] = {"sha256": report["generatedLock"]["sha256"], "actualAlternativeDatabaseNodesAbsent": True}
    report["testedExport"] = dict(export_expected)
    run(["npm", "ci", "--ignore-scripts", "--no-audit", "--no-fund"], 300)
    report["databaseOwnership"] = database_guard("mark")
    database_marked = True
    scoped = ["lib/demo-store.ts", "lib/env.ts", "lib/legacy-operations.ts", "lib/repository.ts", "lib/persistence/factory.ts", "lib/storage/factory.ts",
        "packages/backend-contracts/provider.ts", "packages/storage/provider.ts", "packages/provider-local/adapter.ts", "packages/provider-local/database.ts",
        "packages/provider-local/schema.ts", "packages/provider-local/legacy-state.ts", "packages/provider-local/portable.ts", "scripts/load-local-env.ts",
        "scripts/setup-local.ts", "scripts/doctor.ts", "scripts/reset-local.ts", "scripts/data-export.ts", "scripts/data-import.ts", "scripts/data-cutover-check.ts",
        "scripts/data-verify.ts", "scripts/data-compare.ts",
        "tests/providers/postgres-fixture.ts", "tests/e2e/postgres-app.spec.ts", "vitest.postgres-unit.config.ts", "vitest.postgres.config.ts", "playwright.postgres.config.ts", *tests]
    assert all(name in selected for name in scoped)
    run(["node_modules/.bin/eslint", *scoped])
    (app / "tsconfig.postgres-checks.json").write_text(json.dumps({"extends": "./tsconfig.json", "include": scoped,
        "exclude": ["node_modules", "components/ai-elements"], "compilerOptions": {"incremental": False, "plugins": []}}))
    run(["node_modules/.bin/tsc", "--noEmit", "-p", "tsconfig.postgres-checks.json"])
    report["fixtureAuditBeforeSetup"] = database_guard("audit")
    assert report["fixtureAuditBeforeSetup"]["fixturesAbsent"], "Disposable test databases remain; no unknown database is dropped"
    run(["npm", "run", "setup:local"], 120)
    run(["npm", "run", "doctor"], 60)
    run(["node_modules/.bin/playwright", "install", "chromium", "--only-shell"], 180)
    probe = socket.socket()
    probe.bind(("127.0.0.1", 3100)); probe.close()
    server_out, server_err = (root / "server.stdout").open("wb"), (root / "server.stderr").open("wb")
    server = subprocess.Popen(["node_modules/.bin/next", "dev", "--webpack", "--hostname", "127.0.0.1", "--port", "3100"],
        cwd=app, env=env, stdout=server_out, stderr=server_err, start_new_session=True)
    groups.append(server.pid)
    deadline = min(time.monotonic() + 120, work_deadline)
    report["readinessReads"] = []
    for pathname, expected_status in [("/auth", 200), ("/app", 307), ("/", 200)]:
        while True:
            assert server.poll() is None, "Owned Next server exited"
            assert sum((root / ("server." + label)).stat().st_size for label in ["stdout", "stderr"]) <= 4_000_000, "Owned server output exceeded its bound"
            try:
                connection = http.client.HTTPConnection("127.0.0.1", 3100, timeout=min(20, max(1, deadline - time.monotonic())))
                connection.request("GET", pathname)
                response = connection.getresponse(); data = response.read(4_000_001); connection.close()
                if response.status == expected_status and len(data) <= 4_000_000:
                    report["readinessReads"].append({"path": pathname, "status": response.status, "bytes": len(data), "sha256": digest(data)})
                    break
            except OSError: pass
            if time.monotonic() >= deadline: raise RuntimeError("Owned route readiness expired: " + pathname)
            time.sleep(0.2)
    run(["node_modules/.bin/playwright", "test", "--config", "playwright.postgres.config.ts"], 330, accepted=(0, 1))
    raw = (root / "browser.json").read_bytes()
    report["browserOriginalJson"], browser = stream(raw), json.loads(raw)
    report["browser"] = browser
    assert report["commands"][-1]["exitCode"] == 0 and not browser["errors"]
    assert browser["stats"]["expected"] == 2 and all(browser["stats"][key] == 0 for key in ["unexpected", "flaky", "skipped"])
    def specs(suites):
        return [spec for suite in suites for spec in suite.get("specs", [])] + [spec for suite in suites for spec in specs(suite.get("suites", []))]
    cases = [(spec, case) for spec in specs(browser["suites"]) for case in spec["tests"]]
    title = re.search(r'const TITLE = "([^"]+)"', (app / "tests/e2e/postgres-app.spec.ts").read_text()).group(1)
    profiles = re.findall(r'\{ name: "([^"]+)"', (app / "playwright.postgres.config.ts").read_text())
    assert len(cases) == 2 and sorted(case["projectName"] for _, case in cases) == sorted(profiles) == ["desktop-chromium", "narrow-chromium"]
    report["browserBoundaries"] = []
    for spec, case in cases:
        assert spec["title"] == title and case["expectedStatus"] == "passed" and case["status"] == "expected" and len(case["results"]) == 1
        result = case["results"][0]
        assert result["status"] == "passed" and result["retry"] == 0 and not result.get("errors")
        attachments = [item for item in result["attachments"] if item["name"] == "iv-postgres-app-boundary" and item["contentType"] == "application/json"]
        assert len(attachments) == 1
        boundary = json.loads(base64.b64decode(attachments[0]["body"], validate=True))
        report["browserBoundaries"].append(boundary)
        assert boundary["kind"] == "iv-postgres-app-boundary" and boundary["title"] == title and boundary["profile"] == case["projectName"]
        assert boundary["status"] == "passed" and boundary["stage"] == "complete" and not boundary["primaryError"]
        assert all(value == 0 for value in boundary["boundary"]["counts"].values()) and boundary["boundary"]["allowedActions"] >= 4
        assert boundary["cleanup"] == {"contextsCreated": 1, "contextsClosed": 1, "pendingJobs": 0, "failures": []}
    status = 0
except Exception as error:
    report["error"] = type(error).__name__ + ": " + str(error)
finally:
    work_deadline = time.monotonic() + 100
    capture_lock()
    # Keep an original report even when its CLI timed out or another gate failed.
    for phase in ["unit", "postgres", "browser"]:
        result_path = root / (phase + ".json")
        if result_path.exists():
            raw = result_path.read_bytes()
            report[phase + "OriginalJson"] = stream(raw)
            try: report[phase] = json.loads(raw)
            except ValueError as error: report[phase + "ReportError"] = str(error)
    if server is not None:
        alive = server.poll() is None
        terminate([row for row in owned_processes()[0] if row["pgid"] == server.pid])
        try: server.wait(timeout=15)
        except subprocess.TimeoutExpired: status = 1
        deadline = time.monotonic() + 15
        remaining = [row for row in owned_processes()[0] if row["pgid"] == server.pid]
        while remaining and time.monotonic() < deadline:
            time.sleep(0.1)
            remaining = [row for row in owned_processes()[0] if row["pgid"] == server.pid]
        server_out.close(); server_err.close()
        report["server"] = {"exitCode": server.returncode, "intentionalStop": alive, "killSent": False, "remainingOwned": remaining}
        if not alive or remaining or server.returncode not in [0, -15, 143]: status = 1
        port = socket.socket(); port.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try: port.bind(("127.0.0.1", 3100)); report["portReleased"] = True
        except OSError: report["portReleased"] = False; status = 1
        finally: port.close()
    else:
        if server_out is not None: server_out.close()
        if server_err is not None: server_err.close()
    residual, uncertain = owned_processes()
    report["residualBeforeTermination"] = residual
    if residual or uncertain: status = 1
    terminate(residual)
    deadline = time.monotonic() + 10
    while residual and time.monotonic() < deadline:
        time.sleep(0.1); residual, uncertain = owned_processes()
    report["databaseRemoved"] = False
    if database_marked:
        try:
            report["databaseCleanup"] = database_guard("drop")
            report["databaseRemoved"] = report["databaseCleanup"]["databaseRemoved"]
            if not report["databaseCleanup"]["fixturesAbsent"]: status = 1
        except Exception as error: report["databaseCleanupError"] = str(error); status = 1
    report["sourceUnchanged"] = before == vector()
    report["nativeStatusClean"] = not subprocess.check_output(["git", "status", "--porcelain"])
    try: check_export(); report["exportUnchanged"] = True
    except Exception as error: report["exportUnchanged"] = False; report["exportError"] = str(error)
    residual, uncertain = owned_processes()
    report["liveOwnedBeforeScratchRemoval"], report["uncertainNewProcesses"] = residual, uncertain
    current = root.lstat()
    report["scratchIdentityMatches"] = not root.is_symlink() and (current.st_dev, current.st_ino, current.st_uid) == root_identity
    for index, command in enumerate(report["commands"]):
        command["stdout"], command["stderr"] = file_stream(root / f"command-{index}.stdout"), file_stream(root / f"command-{index}.stderr")
    if "server" in report: report["server"].update({"stdout": file_stream(root / "server.stdout"), "stderr": file_stream(root / "server.stderr")})
    report["streamClosureVerified"] = not residual and not uncertain
    if report["streamClosureVerified"] and report["scratchIdentityMatches"]: shutil.rmtree(root)
    report["scratchRemoved"], report["finishedAt"] = not root.exists(), time.time()
    captures = [item[label] for item in report["commands"] for label in ["stdout", "stderr"]]
    if "server" in report: captures.extend(report["server"][label] for label in ["stdout", "stderr"])
    captures.extend(report[key] for key in ["unitOriginalJson", "postgresOriginalJson", "browserOriginalJson"] if key in report)
    report["passed"] = status == 0 and report.get("carriedCore", {}).get("validated") is True and all(report.get(key) for key in ["sourceUnchanged", "nativeStatusClean", "exportUnchanged", "scratchRemoved", "databaseRemoved", "streamClosureVerified"]) and all(item["complete"] for item in captures)
    print("IV_POSTGRES_RESULT=" + json.dumps(report, separators=(",", ":")), flush=True)
raise SystemExit(0 if report["passed"] else 1)
