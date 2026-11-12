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
branch = "qa/workspace-removals-20261112-3"
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
    run(["node_modules/.bin/vitest", "run", "--config", "vitest.workspace-removals.config.ts", "--reporter=json", "--outputFile=" + str(root / "core.json")], 150)
    report["core"] = json.loads((root / "core.json").read_text())
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
    for name in ["core", "browser"]:
        file = root / (name + ".json")
        if file.exists() and name not in report: report[name] = json.loads(file.read_text())
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
