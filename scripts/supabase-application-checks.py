#!/usr/bin/env python3
"""Four owned application journeys; inactive until the separate provider receipt is pinned."""
import base64
import gzip
import hashlib
import http.client
import sys
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
import tarfile
import tempfile
import time
import tomllib
import traceback
from urllib.parse import urlsplit

repo, source = Path.cwd(), os.environ["SOURCE_COMMIT"]
BRANCH = "qa/supabase-application-20261107-2"
LOCK_SHA = "b18dd278e6eded698e269d2e8400b0359083a8ba34de4721227a70b5e27c0d59"
ASSET = "supabase_3.0.0_linux_amd64.tar.gz"
ARCHIVE_SHA = "eeb61edcd59a4735fcb5e58596574f25d03d420efca779f43ddb307e1cc5c754"
CHECKSUM_SHA = "23763f31f1d3251c71cad4fd27577303f306514e2b99da91427a619d1800301f"
BASE = "https://github.com/supabase/cli/releases/download/v3.0.0/"
MIGRATION = "supabase/migrations/20261107002755_intelligent_visualization_hosted.sql"
ADMIN = "postgresql://postgres:postgres@127.0.0.1:5432/postgres"
DB_HOST = "db.abcdefghijklmnopqrst.supabase.co"
API_HOST = "abcdefghijklmnopqrst.supabase.co"
RUNTIME = "postgresql://iv_runtime:authored-ci-runtime@" + DB_HOST + ":5432/postgres"
APP_ORIGIN = "http://127.0.0.1:3100"
STORAGE_ORIGIN = "https://" + API_HOST + ":54443"
PREREQUISITE_PATH = "docs/results/2026/11-07/supabase-provider-attempt-8.json"
PREREQUISITE_SOURCE = "4da1844f22a332aad8bd827a026c3a806b4a308f"
PREREQUISITE_SHA256 = "24e75dfa95b776210d369129d2a592f231e7dca8c78741910f1ab18e5ab74441"
PREREQUISITE_BYTES = 369374
APPLICATION_PRIOR_PATH = "docs/results/2026/11-07/supabase-application-attempt-1.json"
APPLICATION_PRIOR_SOURCE = "0d9ebd2f6c4bf4d7271d91443b015ed9cfd9edcb"
APPLICATION_PRIOR_SHA256 = "b72f64992213cdc3277ba52c916418d6266bd6871727545a66b3e37b24d54806"
APPLICATION_PRIOR_BYTES = 188352
assert re.fullmatch(r"[0-9a-f]{40}", source)
assert os.environ.get("CI") == os.environ.get("IV_SUPABASE_APPLICATION_PUBLIC_REPOSITORY") == "true"
assert os.environ.get("GITHUB_REPOSITORY") == "alvarovillalbaa/intelligent-visualization"
assert os.environ.get("GITHUB_EVENT_NAME") == "create" and os.environ.get("GITHUB_REF") == "refs/heads/" + BRANCH
event = json.loads(Path(os.environ["GITHUB_EVENT_PATH"]).read_text())
assert event["ref_type"] == "branch" and event["ref"] == BRANCH and event["repository"]["private"] is False
assert os.uname().sysname == "Linux" and os.uname().machine == "x86_64"
assert subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip() == source
work_end, cleanup_end, interruption, MAX = time.monotonic() + 1020, None, None, 4_000_000


def sha(data):
    return hashlib.sha256(data).hexdigest()


def git(*args):
    return subprocess.check_output(["git", *args], cwd=repo)


def vector():
    head, index = {}, {}
    for entry in git("ls-tree", "-rz", "--full-tree", "HEAD").split(b"\0"):
        if not entry: continue
        metadata, raw_name = entry.split(b"\t", 1)
        mode, kind, blob = metadata.decode().split(); name = raw_name.decode()
        assert kind == "blob" and mode in ["100644", "100755", "120000"]
        file = repo / name; info = file.lstat()
        assert file.is_symlink() if mode == "120000" else stat.S_ISREG(info.st_mode) and not file.is_symlink()
        data = os.fsencode(os.readlink(file)) if mode == "120000" else file.read_bytes()
        assert hashlib.sha1(b"blob " + str(len(data)).encode() + b"\0" + data).hexdigest() == blob
        if mode != "120000": assert bool(info.st_mode & 0o111) == (mode == "100755")
        head[name] = {"mode": mode, "blob": blob, "bytes": len(data), "sha256": sha(data)}
    for entry in git("ls-files", "--stage", "-z").split(b"\0"):
        if not entry: continue
        metadata, name = entry.split(b"\t", 1); mode, blob, stage = metadata.decode().split()
        assert stage == "0"; index[name.decode()] = {"mode": mode, "blob": blob}
    assert index == {name: {"mode": row["mode"], "blob": row["blob"]} for name, row in head.items()}
    assert not git("status", "--porcelain", "--untracked-files=all", "--ignored")
    return head


before = vector()
report = {"schemaVersion": 1, "sourceCommit": source, "startedAt": time.time(), "commands": [], "sourceFiles": before, "sourceGuards": [],
    "scope": "Four fresh desktop/narrow Course/Report plus legacy Slides browser identities through actual selected factories, owned CA/DNS PostgreSQL TLS and real HTTPS Storage proxy. No provider injection, fetch mapping, TLS disabling, model, hosted account or deployment.",
    "capturePolicy": "Original streams remain only in controller memory. Retained captures/JSON/errors are byte-preservingly sanitized with actual local status keys and private actor passwords. Original observed byte/SHA metadata is not independently replayable original evidence."}
assert re.fullmatch(r"[0-9a-f]{40}", PREREQUISITE_SOURCE) and re.fullmatch(r"[0-9a-f]{64}", PREREQUISITE_SHA256) and PREREQUISITE_BYTES > 0, "The passing 90-case prerequisite must be reviewed and pinned"
prior_bytes = (repo / PREREQUISITE_PATH).read_bytes()
assert len(prior_bytes) == PREREQUISITE_BYTES and sha(prior_bytes) == PREREQUISITE_SHA256
prior = json.loads(prior_bytes)
assert prior["sourceCommit"] == PREREQUISITE_SOURCE and prior["passed"] is True and prior["freshCasesPassed"] == 90
protected = prior["sourceExport"]["inputs"]
allowed_factory_changes = {"lib/persistence/factory.ts", "lib/storage/factory.ts"}
allowed_documentation_changes = {"packages/provider-supabase/README.md"}
reviewed_changes = allowed_factory_changes | allowed_documentation_changes
assert reviewed_changes <= protected.keys() and reviewed_changes <= before.keys()
assert all(before[name]["mode"] == protected[name]["mode"] == "100644" for name in reviewed_changes)
assert all(before.get(name) == row for name, row in protected.items() if name not in reviewed_changes), "Accepted provider inputs changed outside the exact reviewed factories/documentation paths"
report["providerPrerequisite"] = {"receipt": PREREQUISITE_PATH, "bytes": len(prior_bytes), "sha256": sha(prior_bytes), "sourceCommit": PREREQUISITE_SOURCE,
    "passed": 90, "executedThisAttempt": False, "limit": "Separate accepted provider receipt; this is four fresh application journeys, not a fresh combined 94-case invocation.",
    "protectedInputs": len(protected), "preservedExactInputs": len(protected) - len(reviewed_changes),
    "allowedFactoryCodeInputs": sorted(allowed_factory_changes), "allowedDocumentationOnlyInputs": sorted(allowed_documentation_changes),
    "reviewedInputs": [{"path": name, "accepted": protected[name], "current": before[name], "reason": "Reviewed real factory selection/health integration" if name in allowed_factory_changes else "Documentation-only correction of selection and disposable-service acceptance status; no runtime code"} for name in sorted(reviewed_changes)]}
application_prior_bytes = (repo / APPLICATION_PRIOR_PATH).read_bytes()
assert len(application_prior_bytes) == APPLICATION_PRIOR_BYTES and sha(application_prior_bytes) == APPLICATION_PRIOR_SHA256
application_prior = json.loads(application_prior_bytes)
assert application_prior["sourceCommit"] == APPLICATION_PRIOR_SOURCE and application_prior["passed"] is False
assert application_prior["providerCasesExecutedThisAttempt"] == 0 and not application_prior.get("freshBrowserCasesPassed")
assert len(application_prior["commands"]) == 4 and [row["exitCode"] for row in application_prior["commands"]] == [0, 0, 0, 2]
application_protected = application_prior["sourceExport"]["inputs"]
application_changed = "tests/e2e/supabase-application.spec.ts"
assert len(application_protected) == 286 and application_changed in application_protected and application_changed in before
assert application_protected[application_changed]["mode"] == before[application_changed]["mode"] == "100644"
assert all(before.get(name) == row for name, row in application_protected.items() if name != application_changed), "First application attempt inputs changed outside the exact two-line browser-spec correction"
report["previousApplicationAttempts"] = [{"receipt": APPLICATION_PRIOR_PATH, "bytes": len(application_prior_bytes), "sha256": sha(application_prior_bytes),
    "sourceCommit": APPLICATION_PRIOR_SOURCE, "passed": False, "providerCasesExecuted": 0, "browserCasesExecuted": 0,
    "failurePhase": "Semantic TypeScript before CLI setup, TLS probes, Next or browsers", "carriedCases": 0,
    "protectedInputs": 286, "preservedExactInputs": 285,
    "reviewedInput": {"path": application_changed, "previous": application_protected[application_changed], "current": before[application_changed],
        "reason": "Catch callback returns void; layout reads globalThis.document rather than the shadowing visualization document. Assertions and runtime limits unchanged."}}]


def guard(label):
    current = vector(); assert current == before
    report["sourceGuards"].append({"label": label, "files": len(current), "bytes": sum(row["bytes"] for row in current.values()),
        "matches": True, "vectorSha256": sha(json.dumps(current, sort_keys=True, separators=(",", ":")).encode())})


guard("before")
root = Path(tempfile.mkdtemp(prefix="ivsa-", dir="/tmp")); os.chmod(root, 0o700)
identity = (root.stat().st_dev, root.stat().st_ino, root.stat().st_uid)
nonce = os.urandom(16).hex(); (root / ".owner").write_text(nonce)
os.chmod(root / ".owner", 0o600)
assert root.resolve() == root
app, stack = root / "app", root / "stack"
for name in ["app", "stack", "home", "supabase-home", "cache", "config", "tmp", "docker"]: (root / name).mkdir(mode=0o700)
for name in ["npm-user", "npm-global"]: (root / name).write_text("")
project = "iv-supabase-app-" + source[:12]
groups, export, observed, raw_captures = [], {}, {}, []
docker_before, cli, stack_attempted, stack_ready, installed, status = None, None, False, False, False, 1
secrets, keys_known = {"authored-ci-runtime"}, False
managed, seeded, dns_changed, dns_attempted = {}, False, False, False
env = {"PATH": os.environ["PATH"], "CI": "true", "LANG": "C.UTF-8", "TZ": "UTC", "NO_COLOR": "1",
    "HOME": str(root / "home"), "SUPABASE_HOME": str(root / "supabase-home"), "TMPDIR": str(root / "tmp"),
    "XDG_CACHE_HOME": str(root / "cache"), "XDG_CONFIG_HOME": str(root / "config"), "DOCKER_CONFIG": str(root / "docker"),
    "npm_config_cache": str(root / "npm-cache"), "npm_config_userconfig": str(root / "npm-user"), "npm_config_globalconfig": str(root / "npm-global"),
    "PLAYWRIGHT_BROWSERS_PATH": str(root / "browsers"), "SUPABASE_TELEMETRY_DISABLED": "1", "SUPABASE_NO_KEYRING": "1", "SUPABASE_EXPERIMENTAL_STACK": "0",
    "DO_NOT_TRACK": "1", "NEXT_TELEMETRY_DISABLED": "1", "PERSISTENCE_PROVIDER": "supabase", "STORAGE_PROVIDER": "supabase", "AUTH_PROVIDER": "portable",
    "AI_ENABLED": "false", "EVE_ENABLED": "false", "WORKFLOWS_ENABLED": "false", "QUEUES_ENABLED": "false", "SANDBOX_QA_ENABLED": "false",
    "NEXT_PUBLIC_APP_URL": APP_ORIGIN, "SUPABASE_DATABASE_URL": RUNTIME, "SUPABASE_URL": STORAGE_ORIGIN, "SUPABASE_STORAGE_BUCKET": "iv-private-application",
    "IV_SUPABASE_ADMIN_URL": ADMIN, "IV_SUPABASE_API_URL": "http://127.0.0.1:54321",
    "IV_SUPABASE_APPLICATION_CHECKS": "disposable", "IV_SUPABASE_APPLICATION_ROOT": str(root), "IV_SUPABASE_APPLICATION_NONCE": nonce,
    "IV_SUPABASE_APP_ORIGIN": APP_ORIGIN, "IV_SUPABASE_APP_FIXTURES": str(root / "fixtures.json"),
    "IV_SUPABASE_BROWSER_REPORT": str(root / "browser.json"), "IV_SUPABASE_BROWSER_OUTPUT": str(root / "browser-output"), "SOURCE_COMMIT": source}


def process_stat(entry):
    _prefix, separator, tail = (entry / "stat").read_text().rpartition(") "); fields = tail.split()
    assert separator and len(fields) >= 20 and fields[2].isdigit() and fields[19].isdigit()
    return fields


baseline = {}
for entry in Path("/proc").iterdir():
    if not entry.name.isdigit(): continue
    try:
        if entry.stat().st_uid == os.getuid(): baseline[entry.name] = process_stat(entry)[19]
    except (FileNotFoundError, ProcessLookupError): pass


def owned_processes():
    owned, uncertain = [], []
    for entry in Path("/proc").iterdir():
        if not entry.name.isdigit(): continue
        try:
            if entry.stat().st_uid != os.getuid(): continue
            fields = process_stat(entry)
            if baseline.get(entry.name) == fields[19] or fields[0] == "Z": continue
            cwd = os.readlink(entry / "cwd"); argv = (entry / "cmdline").read_bytes().split(b"\0")
            environ = (entry / "environ").read_bytes().split(b"\0"); pgid = int(fields[2]); prefix = os.fsencode(str(root))
            match = pgid in groups or cwd == str(root) or cwd.startswith(str(root) + "/") or any(prefix + b"/" in value for value in argv)
            match = match or any(value.startswith(key + b"=" + prefix + b"/") for value in environ for key in [b"HOME", b"TMPDIR", b"SUPABASE_HOME", b"XDG_CONFIG_HOME"])
            if match:
                row = {"pid": int(entry.name), "startTime": fields[19], "pgid": pgid, "state": fields[0], "executable": Path(os.fsdecode(argv[0])).name}
                owned.append(row); observed[(row["pid"], row["startTime"])] = row
        except (FileNotFoundError, ProcessLookupError): pass
        except (PermissionError, OSError, ValueError, AssertionError): uncertain.append(int(entry.name))
    return owned, uncertain


def group_absent(pgid):
    try: os.killpg(pgid, 0); return False
    except ProcessLookupError: return True
    except PermissionError: return False


def capture(data, total=None, digest=None):
    total = len(data) if total is None else total
    value = {"observedOriginalBytes": total, "observedOriginalSha256": digest or sha(data), "originalRetained": False, "complete": total <= MAX and len(data) == total}
    raw_captures.append((value, data[:MAX])); return value


def check_export():
    for name, row in export.items():
        file = app / name; info = file.lstat()
        assert stat.S_ISREG(info.st_mode) and not file.is_symlink() and sha(file.read_bytes()) == row["sha256"]
        assert bool(info.st_mode & 0o111) == (row["mode"] == "100755")


def run(argv, timeout=60, accepted=(0,), cwd=None):
    limit = min(time.monotonic() + timeout, (cleanup_end or work_end) - 6.5)
    assert limit > time.monotonic() and (cleanup_end is not None or interruption is None)
    proc = subprocess.Popen(argv, cwd=cwd or app, env=env, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE, start_new_session=True, umask=0o022)
    groups.append(proc.pid); selector = selectors.DefaultSelector(); buffers, eof = [bytearray(), bytearray()], [False, False]
    totals, digests = [0, 0], [hashlib.sha256(), hashlib.sha256()]
    for index, pipe in enumerate([proc.stdout, proc.stderr]): os.set_blocking(pipe.fileno(), False); selector.register(pipe, selectors.EVENT_READ, index)
    row = {"argv": argv, "pid": proc.pid, "timedOut": False, "termSent": False, "killSent": False, "forcedDrain": False}
    started, term_at, kill_at = time.monotonic(), None, None
    try:
        while True:
            now = time.monotonic(); overflow = any(value > MAX for value in totals) or cleanup_end is None and any(file.stat().st_size > MAX for item in managed.values() for file in item["files"])
            if (now >= limit or overflow or interruption is not None and cleanup_end is None) and term_at is None:
                row.update({"timedOut": now >= limit, "overflow": overflow, "termSent": True}); term_at = now
                try: os.killpg(proc.pid, signal.SIGTERM)
                except ProcessLookupError: pass
            if term_at is not None and now - term_at >= 2 and kill_at is None and (proc.poll() is None or not all(eof) or not group_absent(proc.pid)):
                row["killSent"] = True; kill_at = now
                try: os.killpg(proc.pid, signal.SIGKILL)
                except ProcessLookupError: pass
            for key, _mask in selector.select(0.1):
                chunk = os.read(key.fileobj.fileno(), 65536)
                if chunk:
                    totals[key.data] += len(chunk); digests[key.data].update(chunk)
                    buffers[key.data].extend(chunk[:max(0, MAX - len(buffers[key.data]))])
                else: eof[key.data] = True; selector.unregister(key.fileobj); key.fileobj.close()
            owned_processes()
            if proc.poll() is not None and all(eof) and group_absent(proc.pid): break
            if term_at is not None and now - term_at >= 6: row["forcedDrain"] = True; break
    finally:
        for key in list(selector.get_map().values()): key.fileobj.close()
        selector.close()
    reaped = proc.poll() is not None
    if reaped: proc.wait()
    row.update({"exitCode": proc.returncode, "seconds": round(time.monotonic() - started, 3), "exitObservedAndReaped": reaped,
        "pipesEOF": eof, "originalProcessGroupAbsent": group_absent(proc.pid), "stdout": capture(bytes(buffers[0]), totals[0], digests[0].hexdigest()), "stderr": capture(bytes(buffers[1]), totals[1], digests[1].hexdigest())})
    report["commands"].append(row)
    try: check_export()
    except (OSError, AssertionError) as error:
        report.setdefault("exportViolations", []).append({"phase": "cleanup" if cleanup_end is not None else "work", "error": type(error).__name__ + ": " + str(error)})
        if cleanup_end is None: raise
    assert reaped and all(eof) and row["originalProcessGroupAbsent"] and not any(row[key] for key in ["termSent", "killSent", "timedOut", "forcedDrain"]), "Command lifecycle incomplete"
    assert all(row[key]["complete"] for key in ["stdout", "stderr"]) and proc.returncode in accepted, "Command failed: " + str(argv[0])
    return bytes(buffers[0])


def docker_snapshot():
    result = {}
    for kind, listing, id_field, labels in [("container", ["ps", "-aq", "--no-trunc"], ".Id", ".Config.Labels"),
            ("network", ["network", "ls", "-q", "--no-trunc"], ".Id", ".Labels"), ("volume", ["volume", "ls", "-q"], ".Name", ".Labels")]:
        ids = run(["docker", *listing], 15).decode().split()
        extra = ',"state":{{json .State.Status}},"ports":{{json .NetworkSettings.Ports}},"mounts":{{json .Mounts}}' if kind == "container" else ""
        template = '{"id":{{json ' + id_field + '}},"name":{{json .Name}},"labels":{{json ' + labels + '}}' + extra + '}'
        rows = [json.loads(line) for line in run(["docker", "inspect", "--type", kind, "--format", template, *ids], 20).decode().splitlines()] if ids else []
        result[kind] = {row["id"]: row for row in rows}
    return result


def owned_docker(current):
    result = {}
    for kind, rows in current.items():
        result[kind] = {}
        for key, row in rows.items():
            if key in docker_before[kind]:
                assert row == docker_before[kind][key], "Pre-existing Docker identity changed"
                continue
            name, labels = row["name"].lstrip("/"), row["labels"] or {}
            assert name.startswith("supabase_") and name.endswith("_" + project) and labels.get("com.supabase.cli.project") == project, "Unclassified new Docker object"
            result[kind][key] = row
        assert set(docker_before[kind]) <= rows.keys(), "Pre-existing Docker object disappeared"
    return result


def node(code, timeout=25):
    return json.loads(run(["node", "--input-type=module", "-e", code], timeout))



def capture_file(file):
    before = file.lstat()
    assert stat.S_ISREG(before.st_mode) and not file.is_symlink() and before.st_uid == os.getuid() and before.st_nlink == 1
    total, digest, retained = 0, hashlib.sha256(), bytearray()
    with file.open("rb") as handle:
        while chunk := handle.read(65536):
            total += len(chunk); digest.update(chunk); retained.extend(chunk[:max(0, MAX - len(retained))])
    after = file.lstat()
    assert (before.st_dev, before.st_ino, before.st_size, before.st_mtime_ns) == (after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns)
    assert total == before.st_size
    data = bytes(retained)
    return capture(data, total, digest.hexdigest()), data


def helper(command, *args, overrides=None):
    previous = dict(env)
    try:
        env.update(overrides or {})
        value = json.loads(run(["node", "--import", "tsx", "scripts/supabase-application-fixture.ts", command, *args], 30))
        assert value.get("sourceCommit", source) == source and value.get("passed") is not False
        report.setdefault("helperCommands", []).append({"command": command, "result": value, "freshProcessReaped": True})
        return value
    finally: env.clear(); env.update(previous)


def start_managed(name, argv):
    assert name not in managed
    files = [root / (name + "." + label) for label in ["stdout", "stderr"]]
    handles = [file.open("xb") for file in files]
    for file in files: os.chmod(file, 0o600)
    child_env = {key: value for key, value in env.items() if key not in ["IV_SUPABASE_ADMIN_URL", "IV_SUPABASE_SERVICE_KEY", "IV_SUPABASE_ANON_KEY"]}
    proc = subprocess.Popen(argv, cwd=app, env=child_env, stdin=subprocess.DEVNULL, stdout=handles[0], stderr=handles[1], start_new_session=True)
    groups.append(proc.pid)
    managed[name] = {"proc": proc, "files": files, "handles": handles, "argv": argv, "started": time.monotonic()}
    report.setdefault("managed", {})[name] = {"pid": proc.pid, "argv": argv, "intentionalStop": False, "killSent": False}


def stop_managed(name):
    item = managed[name]; proc = item["proc"]; row = report["managed"][name]
    if proc.poll() is None:
        row["intentionalStop"] = True
        try: os.killpg(proc.pid, signal.SIGTERM)
        except ProcessLookupError: pass
    deadline = min(time.monotonic() + 15, (cleanup_end or work_end) - 8)
    while time.monotonic() < deadline and (proc.poll() is None or not group_absent(proc.pid)): time.sleep(0.1)
    reaped = proc.poll() is not None
    if reaped: proc.wait()
    for handle in item["handles"]: handle.close()
    row.update({"exitCode": proc.returncode, "exitObservedAndReaped": reaped, "outputFilesClosed": all(handle.closed for handle in item["handles"]),
        "originalProcessGroupAbsent": group_absent(proc.pid), "seconds": round(time.monotonic() - item["started"], 3)})
    if name == "next" and reaped and row["originalProcessGroupAbsent"]: telemetry_grace()
    for label, file in zip(["stdout", "stderr"], item["files"]): row[label], _raw = capture_file(file)
    assert reaped and proc.returncode == 0 and row["outputFilesClosed"] and row["originalProcessGroupAbsent"], "Owned managed service did not close normally"


def fixture_secrets():
    file = Path(env["IV_SUPABASE_APP_FIXTURES"]); before = file.lstat()
    assert file.parent == root and stat.S_ISREG(before.st_mode) and not file.is_symlink() and before.st_uid == os.getuid()
    assert before.st_nlink == 1 and stat.S_IMODE(before.st_mode) == 0o600 and 0 < before.st_size <= 256 * 1024
    descriptor = os.open(file, os.O_RDONLY | os.O_NOFOLLOW)
    try:
        info = os.fstat(descriptor); data = os.read(descriptor, 256 * 1024 + 1); after = os.fstat(descriptor)
    finally: os.close(descriptor)
    named = file.lstat()
    identity_fields = lambda s: (s.st_dev, s.st_ino, s.st_uid, s.st_nlink, s.st_mode, s.st_size, s.st_mtime_ns, s.st_ctime_ns)
    assert identity_fields(before) == identity_fields(info) == identity_fields(after) == identity_fields(named) and len(data) == before.st_size
    value = json.loads(data)
    assert value["schemaVersion"] == 1 and value["sourceCommit"] == source and value["appOrigin"] == APP_ORIGIN
    assert set(value["cases"]) == {"course-desktop", "course-narrow", "report-desktop", "report-narrow"}
    for case in value["cases"].values():
        password = case["password"]
        assert isinstance(password, str) and len(password) >= 24
        secrets.update([password, password + "-publication", case["email"]])
    report["privateFixtures"] = {"bytes": len(data), "sha256": sha(data), "mode": "0o600", "identityVerified": True, "contentsRetained": False, "actorPasswordsAddedToRedaction": 4}
    return value


def dns_aliases(action):
    global dns_changed, dns_attempted
    backup = root / "hosts.before"
    if action == "add":
        data = Path("/etc/hosts").read_bytes()
        assert len(data) <= 65536 and not any(host in line.split(b"#", 1)[0].split() for line in data.splitlines() for host in [DB_HOST.encode(), API_HOST.encode()])
        with backup.open("xb") as file: file.write(data)
        os.chmod(backup, 0o600)
    code = r'''import os,sys,stat,fcntl,hashlib,json
from pathlib import Path
action,folder,nonce,uid,dbhost,apihost=sys.argv[1:];root=Path(folder)
assert root.parent==Path('/tmp') and root.name.startswith('ivsa-') and root.resolve()==root
assert root.stat().st_uid==int(uid) and stat.S_IMODE(root.stat().st_mode)==0o700 and (root/'.owner').read_text()==nonce
fd=os.open(root/'hosts.before',os.O_RDONLY|os.O_NOFOLLOW)
try:
 info=os.fstat(fd);assert info.st_uid==int(uid) and info.st_nlink==1 and stat.S_IMODE(info.st_mode)==0o600 and info.st_size<=65536
 original=os.read(fd,65537);assert len(original)==info.st_size
finally:os.close(fd)
addition=('\n127.0.0.1 '+dbhost+' '+apihost+' # iv-supabase-application-'+nonce+'\n').encode()
expected,desired=(original,original+addition) if action=='add' else (original+addition,original)
fd=os.open('/etc/hosts',os.O_RDWR|os.O_NOFOLLOW)
try:
 fcntl.flock(fd,fcntl.LOCK_EX);before=os.fstat(fd)
 assert stat.S_ISREG(before.st_mode) and before.st_uid==0 and before.st_nlink==1 and not before.st_mode&0o022
 actual=os.read(fd,65537)
 if action=='restore' and actual==original:expected=original
 assert actual==expected,'Hosts changed outside owned append; overwrite refused'
 os.lseek(fd,0,0);assert os.write(fd,desired)==len(desired);os.ftruncate(fd,len(desired));os.fsync(fd)
 after=os.fstat(fd);assert (before.st_dev,before.st_ino,before.st_uid)==(after.st_dev,after.st_ino,after.st_uid)
 os.lseek(fd,0,0);assert os.read(fd,65537)==desired
 print(json.dumps({'action':action,'beforeSha256':hashlib.sha256(expected).hexdigest(),'afterSha256':hashlib.sha256(desired).hexdigest(),'identityMatches':True}))
finally:os.close(fd)'''
    if action == "add": dns_attempted = True
    result = json.loads(run(["sudo", "-n", sys.executable, "-c", code, action, str(root), nonce, str(os.getuid()), DB_HOST, API_HOST], 15))
    report.setdefault("dns", []).append(result); dns_changed = action == "add"
    if action == "add":
        assert all(row[4][0] == "127.0.0.1" for host in [DB_HOST, API_HOST] for row in socket.getaddrinfo(host, None))


def certificates():
    for label in ["ca", "wrong-ca"]:
        run(["openssl", "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", str(root / (label + ".key")), "-out", str(root / (label + ".pem")), "-days", "1", "-sha256", "-subj", "/CN=IV owned " + label], 25)
        os.chmod(root / (label + ".key"), 0o600)
    for label, host in [("db", DB_HOST), ("api", API_HOST)]:
        run(["openssl", "req", "-new", "-newkey", "rsa:2048", "-nodes", "-keyout", str(root / (label + ".key")), "-out", str(root / (label + ".csr")), "-subj", "/CN=" + host], 25)
        os.chmod(root / (label + ".key"), 0o600)
    for label, key, host in [("db", "db", DB_HOST), ("wrong-san", "db", "wrong.owned.invalid"), ("api", "api", API_HOST)]:
        extension = root / (label + ".ext")
        extension.write_text("subjectAltName=DNS:" + host + "\nbasicConstraints=CA:FALSE\nkeyUsage=digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\n")
        run(["openssl", "x509", "-req", "-in", str(root / (key + ".csr")), "-CA", str(root / "ca.pem"), "-CAkey", str(root / "ca.key"), "-CAcreateserial", "-out", str(root / (label + ".pem")), "-days", "1", "-sha256", "-extfile", str(extension)], 15)
    for label in ["ca", "wrong-ca", "db", "api"]:
        file = root / (label + ".key"); info = file.lstat()
        assert stat.S_ISREG(info.st_mode) and not file.is_symlink() and info.st_uid == os.getuid() and stat.S_IMODE(info.st_mode) == 0o600
    report["certificates"] = {label: {"bytes": (root / (label + ".pem")).stat().st_size, "sha256": sha((root / (label + ".pem")).read_bytes())} for label in ["ca", "wrong-ca", "db", "wrong-san", "api"]}
    report["privateKeysRetainedInEvidence"] = False
    env["NODE_EXTRA_CA_CERTS"] = str(root / "ca.pem")


def restore_dns_if_closed():
    owned, uncertain = owned_processes()
    if owned or uncertain:
        report["dnsRestoreDeferred"] = {"remaining": owned, "uncertain": uncertain, "reason": "Retain loopback aliases until every owned client has closed"}
        return False
    dns_aliases("restore")
    return True


def reload_database(db_id):
    stamp = node("""import pg from 'pg';const p=new pg.Pool({connectionString:process.env.IV_SUPABASE_ADMIN_URL,max:1,statement_timeout:5000});try{console.log(JSON.stringify({stamp:(await p.query('SELECT pg_conf_load_time()::text AS stamp')).rows[0].stamp}));}finally{await p.end();}""")["stamp"]
    run(["docker", "kill", "--signal=HUP", db_id], 10)
    node("""import pg from 'pg';const p=new pg.Pool({connectionString:process.env.IV_SUPABASE_ADMIN_URL,max:1,statement_timeout:5000});try{let changed=false;const end=Date.now()+5000;while(Date.now()<end){changed=(await p.query('SELECT pg_conf_load_time() > $1::timestamptz AS changed',[""" + json.dumps(stamp) + """])).rows[0].changed;if(changed)break;await new Promise(r=>setTimeout(r,50));}if(!changed)throw Error('Owned DB configuration reload was not observed');console.log(JSON.stringify({reloadObserved:true}));}finally{await p.end();}""", 15)


def install_database_tls(db_id):
    data_directory = run(["docker", "exec", "--user", "postgres", db_id, "psql", "-X", "-A", "-t", "-U", "postgres", "-d", "postgres", "-c", "SHOW data_directory"], 15).decode().strip()
    assert re.fullmatch(r"/[A-Za-z0-9_./-]+", data_directory) and ".." not in Path(data_directory).parts
    container = next(row for row in report["dockerStarted"]["container"].values() if row["id"] == db_id)
    owned_volumes = set(report["dockerStarted"]["volume"])
    assert any(mount["Type"] == "volume" and mount["Name"] in owned_volumes and Path(data_directory).is_relative_to(mount["Destination"]) for mount in container["mounts"]), "DB data directory is not on its owned fresh volume"
    uid = run(["docker", "exec", db_id, "id", "-u", "postgres"], 10).decode().strip()
    gid = run(["docker", "exec", db_id, "id", "-g", "postgres"], 10).decode().strip()
    assert uid.isdigit() and gid.isdigit()
    run(["docker", "exec", "--user", "0", db_id, "mkdir", "-m", "0700", "/tmp/iv-owned-tls"], 10)
    run(["docker", "cp", str(root / "db.key"), db_id + ":/tmp/iv-owned-tls/server.key"], 10)
    run(["docker", "cp", str(root / "db.pem"), db_id + ":/tmp/iv-owned-tls/server.crt"], 10)
    run(["docker", "exec", "--user", "0", db_id, "chown", "-R", uid + ":" + gid, "/tmp/iv-owned-tls"], 10)
    run(["docker", "exec", "--user", "0", db_id, "chmod", "0600", "/tmp/iv-owned-tls/server.key"], 10)
    block = "\n# Owned disposable application TLS fixture\nssl=on\nssl_cert_file='/tmp/iv-owned-tls/server.crt'\nssl_key_file='/tmp/iv-owned-tls/server.key'\n"
    run(["docker", "exec", "--user", "postgres", db_id, "sh", "-c", 'printf "%s\\n" "$2" >> "$1/postgresql.auto.conf"', "iv-owned-tls", data_directory, block], 10)
    reload_database(db_id)
    report["databaseTLS"] = {"containerId": db_id, "ownedDataVolumeVerified": True, "serverConfigAppended": True, "privateKeyMode": "0o600", "signal": "HUP", "contentsRetained": False}


def switch_database_certificate(db_id, label):
    assert label in ["db", "wrong-san"]
    run(["docker", "cp", str(root / (label + ".pem")), db_id + ":/tmp/iv-owned-tls/server.crt"], 10)
    run(["docker", "exec", "--user", "0", db_id, "chmod", "0644", "/tmp/iv-owned-tls/server.crt"], 10)
    reload_database(db_id)


def start_proxy():
    script = root / "https-proxy.py"
    script.write_text(r'''import http.client,http.server,ssl,signal,threading,json,sys
active=0;requests=0;failures=[];lock=threading.Lock()
class Handler(http.server.BaseHTTPRequestHandler):
 protocol_version='HTTP/1.0'
 def log_message(self,*args):pass
 def forward(self):
  global active,requests
  with lock:active+=1;requests+=1
  upstream=None
  try:
   if self.headers.get('Host')!='abcdefghijklmnopqrst.supabase.co:54443' or not self.path.startswith('/storage/v1/') or '?' in self.path or '#' in self.path:raise ValueError('route')
   size=int(self.headers.get('Content-Length','0'))
   if size<0 or size>64*1024*1024 or self.headers.get('Transfer-Encoding'):raise ValueError('bound')
   body=self.rfile.read(size)
   if len(body)!=size:raise ValueError('short request')
   headers={key:value for key,value in self.headers.items() if key.lower() not in ['host','connection','transfer-encoding','content-length']}
   headers['Host']='127.0.0.1:54321';headers['Content-Length']=str(len(body));headers['Connection']='close'
   upstream=http.client.HTTPConnection('127.0.0.1',54321,timeout=15);upstream.request(self.command,self.path,body=body,headers=headers)
   response=upstream.getresponse();data=response.read(64*1024*1024+1)
   if len(data)>64*1024*1024:raise ValueError('response bound')
   self.send_response(response.status)
   for key,value in response.getheaders():
    if key.lower() not in ['connection','content-length','transfer-encoding']:self.send_header(key,value)
   self.send_header('Content-Length',str(len(data)));self.send_header('Connection','close');self.end_headers();self.wfile.write(data)
  except Exception:
   with lock:
    if len(failures)<16:failures.append('proxy-request-failed')
   try:self.send_error(502,'Owned upstream unavailable')
   except Exception:pass
  finally:
   if upstream:upstream.close()
   with lock:active-=1
 do_GET=forward;do_POST=forward;do_DELETE=forward
class Server(http.server.ThreadingHTTPServer):daemon_threads=True
server=Server(('127.0.0.1',54443),Handler);context=ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER);context.minimum_version=ssl.TLSVersion.TLSv1_2
context.load_cert_chain(sys.argv[1],sys.argv[2]);server.socket=context.wrap_socket(server.socket,server_side=True)
def stop(*args):threading.Thread(target=server.shutdown,daemon=True).start()
signal.signal(signal.SIGTERM,stop);signal.signal(signal.SIGINT,stop)
try:server.serve_forever(poll_interval=.05)
finally:server.server_close();print(json.dumps({'requests':requests,'active':active,'failures':failures}),flush=True)
sys.exit(0 if active==0 and not failures else 1)
''')
    os.chmod(script, 0o600)
    start_managed("proxy", [sys.executable, str(script), str(root / "api.pem"), str(root / "api.key")])


def bootstrap():
    global installed, docker_before, cli, stack_attempted, stack_ready, keys_known
    configs = {"package.json", "package-lock.json", "tsconfig.json", "eslint.config.mjs", "next.config.ts", "postcss.config.mjs", "playwright.supabase-application.config.ts"}
    required = configs | {MIGRATION, "scripts/supabase-application-fixture.ts", "tests/e2e/supabase-application.spec.ts"}
    selected = [name for name in before if name.startswith(("app/", "components/", "hooks/", "lib/", "packages/", "public/"))
        or name in required or name.startswith("scripts/") and name.endswith(".ts")]
    assert required <= set(selected)
    for name in selected:
        assert before[name]["mode"] != "120000"
        destination = app / name; destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(repo / name, destination); os.chmod(destination, 0o755 if before[name]["mode"] == "100755" else 0o644)
        export[name] = before[name]
    report["sourceExport"] = {"files": len(export), "bytes": sum(row["bytes"] for row in export.values()), "inputs": export}
    assert run(["node", "--version"]).strip() == b"v24.21.0"
    lock = (app / "package-lock.json").read_bytes(); assert len(lock) == 618662 and sha(lock) == LOCK_SHA
    report["frozenLock"] = {"bytes": len(lock), "sha256": LOCK_SHA}
    run(["npm", "ci", "--ignore-scripts", "--no-audit", "--no-fund"], 240); installed = True; guard("after-install")
    scoped = sorted({"lib/persistence/factory.ts", "lib/storage/factory.ts", "scripts/supabase-application-fixture.ts",
        "tests/e2e/supabase-application.spec.ts", "playwright.supabase-application.config.ts"})
    report["focusedStaticInputs"] = scoped
    run(["node_modules/.bin/eslint", *scoped], 60)
    (app / "tsconfig.supabase-application-checks.json").write_text(json.dumps({"extends": "./tsconfig.json", "include": scoped,
        "exclude": ["node_modules", "components/ai-elements"], "compilerOptions": {"incremental": False, "plugins": []}}))
    run(["node_modules/.bin/tsc", "--noEmit", "-p", "tsconfig.supabase-application-checks.json"], 60)
    run(["node_modules/.bin/playwright", "install", "--with-deps", "--only-shell", "chromium"], 100)
    for port in [5432, 54321, 54443, 3100]:
        with socket.socket() as sock: sock.bind(("127.0.0.1", port))
    docker_before = docker_snapshot(); report["dockerBaseline"] = docker_before
    for rows in docker_before.values():
        assert all((row["labels"] or {}).get("com.supabase.cli.project") != project and not row["name"].lstrip("/").endswith("_" + project) for row in rows.values()), "Existing project resources cannot be adopted"
    archive, checksum = root / ASSET, root / "checksums.txt"
    for name, file, size, digest in [(ASSET, archive, 63799117, ARCHIVE_SHA), ("checksums.txt", checksum, 1386, CHECKSUM_SHA)]:
        run(["curl", "-q", "--fail", "--location", "--silent", "--show-error", "--proto", "=https", "--proto-redir", "=https", "--max-redirs", "3", "--max-time", "120", "--max-filesize", str(size), "--output", str(file), BASE + name], 125)
        assert file.is_file() and not file.is_symlink() and file.stat().st_size == size and sha(file.read_bytes()) == digest
    assert (ARCHIVE_SHA + "  " + ASSET).encode() in checksum.read_bytes().splitlines()
    report["cliArchive"] = {"version": "3.0.0", "bytes": 63799117, "sha256": ARCHIVE_SHA, "checksumFileSha256": CHECKSUM_SHA}
    cli = root / "supabase"
    with tarfile.open(archive, "r:gz") as handle:
        members = handle.getmembers(); assert 1 <= len(members) <= 16 and sum(row.size for row in members) <= 512 * 1024 * 1024
        assert all(not Path(row.name).is_absolute() and ".." not in Path(row.name).parts and (row.isfile() or row.isdir()) for row in members)
        binary = [row for row in members if row.name == "supabase" and row.isfile()]; assert len(binary) == 1
        with handle.extractfile(binary[0]) as incoming, cli.open("xb") as outgoing: shutil.copyfileobj(incoming, outgoing, 1024 * 1024)
    os.chmod(cli, 0o700); assert cli.read_bytes()[:4] == b"\x7fELF"
    top_help = run([str(cli), "--help"], 20, cwd=stack).decode()
    assert all(command in top_help for command in ["init", "start", "status", "stop"])
    assert run([str(cli), "--version"], 20, cwd=stack).decode().strip() in ["3.0.0", "v3.0.0"]
    help_output = {command: run([str(cli), command, "--help"], 20, cwd=stack).decode() for command in ["init", "start", "status", "stop"]}
    assert "--exclude" in help_output["start"] and "--output" in help_output["status"] and "--no-backup" in help_output["stop"]
    report["cliHelpVerified"] = ["top-level", "init", "start --exclude", "status --output", "stop --no-backup"]
    run([str(cli), "init"], 30, cwd=stack)
    config = tomllib.loads((stack / "supabase/config.toml").read_text()); config["project_id"] = project
    assert config["api"]["port"] == 54321 and config["db"]["major_version"] == 17
    config["db"]["port"] = 5432
    for path in ["realtime", "studio", "edge_runtime", "local_smtp", "analytics", "db.pooler", "db.seed", "storage.vector", "storage.s3_protocol"]:
        item = config
        for key in path.split("."): item = item.setdefault(key, {})
        item["enabled"] = False
    encoded = json.dumps(config).encode(); (stack / "supabase/config.json").write_bytes(encoded); (stack / "supabase/config.toml").unlink()
    report["stackConfiguration"] = {"projectId": project, "bytes": len(encoded), "sha256": sha(encoded), "contentsRetained": False}
    target = stack / MIGRATION; target.parent.mkdir(parents=True, exist_ok=True); assert list(target.parent.iterdir()) == []
    shutil.copyfile(app / MIGRATION, target)
    migration = target.read_bytes()
    assert len(migration) == 12758 and sha(migration) == "73cde35f8ac0f265b1cda968fe1b4b91620ada03b4bab71d41c154c8d02fea43"
    report["migration"] = {"path": MIGRATION, "bytes": len(migration), "sha256": sha(migration)}
    stack_attempted = True
    run([str(cli), "start", "--exclude", "realtime,imgproxy,mailpit,postgres-meta,studio,edge-runtime,logflare,vector,supavisor"], 420, cwd=stack)
    values = json.loads(run([str(cli), "status", "-o", "json"], 30, cwd=stack))
    for key in ["ANON_KEY", "SERVICE_ROLE_KEY"]: assert isinstance(values.get(key), str) and values[key]
    secrets.update(value for key, value in values.items() if isinstance(value, str) and any(label in key for label in ["KEY", "SECRET", "PASSWORD"]))
    secrets.update(value for key, value in values.items() if key.endswith("_URL") and isinstance(value, str) and urlsplit(value).password is not None)
    keys_known = True
    env.update({"IV_SUPABASE_SERVICE_KEY": values["SERVICE_ROLE_KEY"], "IV_SUPABASE_ANON_KEY": values["ANON_KEY"], "SUPABASE_SERVICE_ROLE_KEY": values["SERVICE_ROLE_KEY"]})
    report["localStatus"] = {"parsed": True, "keysRetained": False, "fields": sorted(values)}
    for key, port, schemes in [("API_URL", 54321, ["http"]), ("DB_URL", 5432, ["postgres", "postgresql"])]:
        location = urlsplit(values[key]); assert location.scheme in schemes and location.hostname in ["localhost", "127.0.0.1"] and location.port == port and not location.query and not location.fragment
    report["dockerStarted"] = owned_docker(docker_snapshot())
    containers = {row["name"].lstrip("/"): row for row in report["dockerStarted"]["container"].values()}
    for service, internal, host in [("db", "5432/tcp", "5432"), ("kong", "8000/tcp", "54321")]:
        container = containers["supabase_" + service + "_" + project]
        assert container["state"] == "running" and (container["labels"] or {}).get("com.supabase.cli.workdir") == str(stack)
        bindings = container["ports"].get(internal)
        assert bindings and all(row["HostPort"] == host and row["HostIp"] in ["127.0.0.1", "0.0.0.0", "::"] for row in bindings)
    report["runtimeProvision"] = node("""import pg from 'pg';const p=new pg.Pool({connectionString:process.env.IV_SUPABASE_ADMIN_URL,max:1,connectionTimeoutMillis:5000,statement_timeout:10000});try{
const row=(await p.query("SELECT rolcanlogin FROM pg_roles WHERE rolname='iv_runtime'")).rows[0];if(!row||row.rolcanlogin!==false)throw Error('Expected newly migrated NOLOGIN role');
await p.query("ALTER ROLE iv_runtime LOGIN PASSWORD 'authored-ci-runtime'");await p.query("COMMENT ON DATABASE postgres IS 'iv-supabase-application-ci:"+process.env.SOURCE_COMMIT+"'");console.log(JSON.stringify({freshRoleProvisioned:true,markerInstalled:true}));}finally{await p.end();}""")
    report["bucketProvision"] = node("""const r=await fetch(process.env.IV_SUPABASE_API_URL+'/storage/v1/bucket',{method:'POST',redirect:'error',signal:AbortSignal.timeout(10000),headers:{apikey:process.env.IV_SUPABASE_SERVICE_KEY,Authorization:'Bearer '+process.env.IV_SUPABASE_SERVICE_KEY,'content-type':'application/json'},body:JSON.stringify({id:'iv-private-application',name:'iv-private-application',public:false})});const b=await r.arrayBuffer();if(![200,201].includes(r.status)||b.byteLength>65536)throw Error('Private bucket create failed');console.log(JSON.stringify({privateBucketCreated:true}));""")
    stack_ready = True
    return containers["supabase_db_" + project]["id"]


def runtime_clients(require_zero=False):
    code = """import pg from 'pg';const observations=[],zeroRequired=""" + str(require_zero).lower() + """,deadline=Date.now()+3000;let observationError=null;
async function observe(){const p=new pg.Pool({connectionString:process.env.IV_SUPABASE_ADMIN_URL,max:1,connectionTimeoutMillis:1000,statement_timeout:1000});try{
const marker=(await p.query("SELECT shobj_description(oid,'pg_database') AS marker FROM pg_database WHERE datname=current_database()")).rows[0].marker;
if(marker!=='iv-supabase-application-ci:'+process.env.SOURCE_COMMIT)throw Error('Owned DB marker changed');
const rows=(await p.query("SELECT a.pid,a.backend_start::text,a.application_name,s.ssl,s.version,s.cipher FROM pg_stat_activity a LEFT JOIN pg_stat_ssl s USING(pid) WHERE a.usename='iv_runtime' ORDER BY a.pid")).rows;
const admin=(await p.query('SELECT current_user AS role,pg_backend_pid() AS pid')).rows[0];return{runtimeClients:rows.length,rows,adminRole:admin.role,adminPid:admin.pid};}finally{await p.end();}}
try{do{const row=await observe();observations.push(row);if(!zeroRequired||row.runtimeClients===0)break;await new Promise(r=>setTimeout(r,50));}while(Date.now()<deadline);}catch{observationError='ADMIN_OBSERVATION_FAILED';}
const last=observations.at(-1)??{runtimeClients:null,rows:[],adminRole:null,adminPid:null};console.log(JSON.stringify({...last,observations,observationError,boundedSeconds:3,freshAdminSessionPerObservation:true,zeroObserved:!observationError&&last.runtimeClients===0,signalsSent:[]}));"""
    result = node(code, 6 if require_zero else 10)
    if require_zero: report.setdefault("runtimeZeroBarriers", []).append(result)
    assert result["observationError"] is None and result["observations"], "Owned admin observation failed"
    assert all(row["adminRole"] == "postgres" for row in result["observations"])
    assert len({row["adminPid"] for row in result["observations"]}) == len(result["observations"])
    if require_zero:
        assert result["zeroObserved"] is True and result["runtimeClients"] == 0, "Fixture/runtime pools remain open after the bounded fresh-session observations"
    return result


def get_route(path, accepted=(200,), timeout=30):
    assert path.startswith("/") and not path.startswith("//") and "?" not in path and "#" not in path
    return node("""import{createHash}from'node:crypto';const r=await fetch(""" + json.dumps(APP_ORIGIN + path) + """,{redirect:'manual',signal:AbortSignal.timeout(""" + str(timeout * 1000) + """)});const reader=r.body?.getReader();let size=0;const hash=createHash('sha256');if(reader)try{while(true){const x=await reader.read();if(x.done)break;size+=x.value.byteLength;if(size>8*1024*1024)throw Error('Warm response too large');hash.update(x.value);}}finally{reader.releaseLock();}
if(!""" + json.dumps(list(accepted)) + """.includes(r.status))throw Error('App route not ready');console.log(JSON.stringify({path:""" + json.dumps(path) + """,status:r.status,bytes:size,sha256:hash.digest('hex'),bodyEOF:true,location:r.headers.get('location')}));""", timeout + 3)


def next_tls_window(label):
    assert "next" in managed and managed["next"]["proc"].poll() is None
    assert all(row["exitObservedAndReaped"] and all(row["pipesEOF"]) and row["originalProcessGroupAbsent"] for row in report["commands"])
    other, uncertain = owned_processes(); assert not uncertain
    assert not any(row["executable"] in ["node", "nodejs"] and row["pgid"] != managed["next"]["proc"].pid for row in other), "Non-Next Node helper is still alive"
    health = node("""const r=await fetch('http://127.0.0.1:3100/api/system/capabilities',{redirect:'error',signal:AbortSignal.timeout(15000)});const b=await r.arrayBuffer();if(b.byteLength>131072)throw Error('Health body bound');const v=JSON.parse(new TextDecoder().decode(b));if(r.status!==200||v.persistenceProvider!=='supabase'||v.storageProvider!=='supabase'||v.authProvider!=='portable'||v.health?.ok!==true||v.aiEnabled!==false)throw Error('Actual factory health refused');console.log(JSON.stringify({status:r.status,persistenceProvider:v.persistenceProvider,storageProvider:v.storageProvider,authProvider:v.authProvider,healthOK:v.health.ok,aiEnabled:v.aiEnabled}));""", 20)
    rows = runtime_clients()
    assert rows["runtimeClients"] > 0 and all(row["application_name"] == "intelligent-visualization-supabase" and row["ssl"] is True and row["version"] and row["cipher"] for row in rows["rows"]), "Actual Next TLS session was not observed"
    report.setdefault("nextTLSWindows", []).append({"label": label, "ordinaryCapabilitiesGET": health, "sessions": rows,
        "allFixtureProcessesReaped": True, "attribution": "Only Next may own runtime pools in this explicit window; admin sample is a separate postgres connection.", "continuousJourneyTLSClaimed": False})


def restore_journals():
    journals = list(root.glob("collision-*"))
    allowed = {"course-desktop", "course-narrow", "report-desktop", "report-narrow"}
    assert len(journals) <= 4 and all(file.name in {"collision-" + key + ".json" for key in allowed} for file in journals), "Unknown collision journal"
    for file in journals:
        key = file.name[10:-5]
        helper("collision-off", "--case", key)
    assert not list(root.glob("collision-*"))


def read_browser():
    file = root / "browser.json"
    if not file.exists(): return None
    retained, raw = capture_file(file)
    report["browserJsonCapture"] = retained
    assert retained["complete"]
    value = json.loads(raw); report["playwright"] = value
    return value


def verify_browser(value, fixtures):
    assert value and not value.get("errors")
    stats = value["stats"]
    assert stats["expected"] == 4 and all(stats[key] == 0 for key in ["unexpected", "flaky", "skipped"])
    titles = {kind: "a " + kind.title() + " persists publishes revokes and republishes through Supabase with private Slides attachments and password gates" for kind in ["course", "report"]}
    expected = {(title, profile) for title in titles.values() for profile in ["desktop-chromium", "narrow-chromium"]}
    rows = []
    def walk(suite):
        for spec in suite.get("specs", []):
            for test in spec.get("tests", []): rows.append((spec, test))
        for child in suite.get("suites", []): walk(child)
    for suite in value["suites"]: walk(suite)
    assert len(rows) == 4 and {(spec["title"], test["projectName"]) for spec, test in rows} == expected
    boundaries = []
    for spec, test in rows:
        assert spec["ok"] is True and test["expectedStatus"] == "passed" and test["status"] == "expected" and len(test["results"]) == 1
        result = test["results"][0]
        assert result["status"] == "passed" and result["retry"] == 0 and not result.get("errors") and not result.get("error")
        attachments = [row for row in result.get("attachments", []) if row["name"] == "iv-supabase-application-boundary"]
        assert len(attachments) == 1 and attachments[0]["contentType"] == "application/json" and "body" in attachments[0]
        data = base64.b64decode(attachments[0]["body"], validate=True); assert 0 < len(data) <= 65536
        body = json.loads(data); kind = body["documentKind"]; profile = test["projectName"]
        assert kind in titles and spec["title"] == titles[kind] == body["title"] and body["profile"] == profile
        case = fixtures["cases"][kind + "-" + profile.removesuffix("-chromium")]
        assert body["kind"] == "iv-supabase-application-boundary" and body["schemaVersion"] == 1 and body["stage"] == "complete" and body["status"] == "passed" and body["primaryError"] is None
        assert body["fixture"] == {"workspaceSlug": case["workspaceSlug"], "slidesId": case["slides"]["id"], "slidesPublicId": case["slides"]["publicId"]}
        counts = body["boundary"]["counts"]
        assert set(counts) == {"unexpectedRequests", "unexpectedWebSockets", "requestFailures", "httpErrors", "pageErrors", "consoleErrors", "dialogs", "canonicalAnalytics"} and all(type(x) is int and x == 0 for x in counts.values())
        assert not body["boundary"]["diagnostics"] and body["boundary"]["uploads"] == 1
        assert body["cleanup"] == {"contextsCreated": 4, "contextsClosed": 4, "pendingJobs": 0, "failures": []}
        observation = body["observations"]
        for key in ["workingEditsRetained", "oldVersionStaysRevoked", "foreignRegistrationAndReadRefused", "historicalCollisionPrivateAndPublicRefused", "historicalCollisionRestored", "passwordGateFreshContexts", "oldProtectedVersionStaysPrivate", "freshSignInPreservesPrivateAndPublicState", "courseLocalProgressRetained" if kind == "course" else "reportTextEscaped"]: assert observation[key] is True
        assert observation["initialSave"]["revision"] == 1 and re.fullmatch(r"[0-9a-f-]{36}", observation["initialSave"]["id"])
        publications = observation["publications"]
        assert len(publications) == 2 and [row["sourceRevision"] for row in publications] == [2, 3] and publications[0]["versionId"] != publications[1]["versionId"]
        proofs = observation["responseProofs"]
        assert len(proofs) == 5 and len({row["requestId"] for row in proofs}) == 5
        assert all(row["status"] == 200 and 0 < row["bytes"] <= 5 * 1024 * 1024 and re.fullmatch(r"[0-9a-f]{64}", row["sha256"]) for row in proofs)
        snapshots = observation["snapshots"]
        canonical = [row for row in snapshots if row["kind"] == "canonical"]
        assert len(canonical) == 4 and canonical[0]["sha256"] == canonical[1]["sha256"] == canonical[3]["sha256"]
        assert all((canonical[index]["key"], canonical[index]["bytes"]) == (canonical[0]["key"], canonical[0]["bytes"]) for index in [1, 3])
        assert [row["status"] for row in canonical] == ["published", "revoked", "published", "revoked"]
        assert all(canonical[index]["versionId"] == publications[0]["versionId"] for index in [0, 1, 3]) and canonical[2]["versionId"] == publications[1]["versionId"]
        assert len([row for row in snapshots if row["kind"] == "slides"]) == 3
        negatives = [row for row in observation["negatives"] if "conditional" in row]
        assert len(negatives) >= 12 and all(row["status"] == 404 and row["method"] in ["GET", "HEAD"] for row in negatives)
        observer = body["responseObserver"]
        assert observer["kind"] == "native-fetch-response-clone" and observer["maxGetBytes"] == 131072 and observer["maxPostBytes"] == 5 * 1024 * 1024 and observer["maxPerDocument"] == 32
        assert observer["exactGetRequestBindingClaimed"] is False and observer["originalFetchArgumentsAndPromiseRetained"] is True and observer["rawResponseBodiesRetained"] is False
        assert observer["correlation"] == "method-path-request-id-and-time-only" and 1 <= len(observer["documents"]) <= 12
        assert len({row["documentId"] for row in observer["documents"]}) == len(observer["documents"])
        for document in observer["documents"]:
            assert document["pending"] == 0 and document["failures"] == [] and len(document["reads"]) <= 32
            for read in document["reads"]:
                assert read["method"] in ["GET", "POST"] and read["status"] == 200 and read["eof"] is True and read["error"] is None
                assert 0 <= read["bytes"] <= (131072 if read["method"] == "GET" else 5 * 1024 * 1024) and re.fullmatch(r"[0-9a-f]{64}", read["sha256"])
                assert read["startedAt"] <= read["responseAt"] <= read["eofAt"] and "body" not in read
                signal_state = read["signal"]; assert type(signal_state["present"]) is bool
                for flag in ["initialAborted", "abortedAtEOF", "finalAborted"]: assert signal_state[flag] is None or type(signal_state[flag]) is bool
        actual = body["actualApiRequests"]
        assert 1 <= len(actual) <= 64 and len({row["ordinal"] for row in actual}) == len(actual)
        assert all(row["finished"] is True and row["failed"] is None for row in actual)
        boundaries.append({"title": spec["title"], "project": profile, "bytes": len(data), "sha256": sha(data), "report": body})
    report["browserBoundaries"] = boundaries; report["freshBrowserCasesPassed"] = 4


def application_main():
    global seeded
    db_id = bootstrap()
    dns_aliases("add"); certificates(); install_database_tls(db_id); start_proxy()
    positive = helper("probe-positive"); assert positive["productionFactories"] is True and positive["ssl"]["ssl"] is True
    assert helper("probe-negative-ca", overrides={"NODE_EXTRA_CA_CERTS": str(root / "wrong-ca.pem")})["expectedFailureObserved"] is True
    try:
        switch_database_certificate(db_id, "wrong-san")
        assert helper("probe-negative-san")["expectedFailureObserved"] is True
    finally: switch_database_certificate(db_id, "db")
    bad_url = RUNTIME.replace("authored-ci-runtime", "authored-ci-wrong-password"); secrets.add("authored-ci-wrong-password")
    assert helper("probe-negative-password", overrides={"SUPABASE_DATABASE_URL": bad_url})["expectedFailureObserved"] is True
    assert helper("probe-positive")["productionFactories"] is True
    seed = helper("seed"); seeded = True; fixtures = fixture_secrets()
    assert seed["users"] == seed["slides"] == 8 and seed["fixtureSha256"] == report["privateFixtures"]["sha256"]
    report["runtimeBeforeNext"] = runtime_clients(require_zero=True)
    start_managed("next", ["node", "node_modules/next/dist/bin/next", "dev", "--webpack", "--hostname", "127.0.0.1", "--port", "3100"])
    ready_end = min(time.monotonic() + 60, work_end - 20)
    while True:
        assert managed["next"]["proc"].poll() is None
        try:
            with socket.create_connection(("127.0.0.1", 3100), timeout=0.2): break
        except OSError:
            assert time.monotonic() < ready_end, "Owned Next listener did not become ready"
            time.sleep(0.1)
    report["warmRoutes"] = [get_route(path, (200, 302, 303, 307, 308), 40) for path in ["/", "/auth", "/app"]]
    for case in fixtures["cases"].values():
        report["warmRoutes"].append(get_route("/app/workspaces/" + case["workspaceSlug"], (200, 302, 303, 307, 308), 40))
        report["warmRoutes"].append(get_route(case["slides"]["editorPath"], (200, 302, 303, 307, 308), 40))
    first_case = next(iter(fixtures["cases"].values())); missing_uuid = "00000000-0000-4000-8000-000000000000"
    missing_public = "/v/course_" + "0" * 32
    for path, accepted in [(first_case["slides"]["publicPath"], (404,)), (first_case["slides"]["source"]["url"], (401, 404)),
            ("/published/" + first_case["slides"]["publicId"] + "/" + missing_uuid, (404,)), (missing_public, (404,)), (missing_public + "/" + missing_uuid, (404,)),
            ("/app/workspaces/" + first_case["workspaceSlug"] + "/visualizations/" + missing_uuid, (302, 303, 307, 308))]:
        report["warmRoutes"].append(get_route(path, accepted, 40))
    report["warmNegativeRoutesAreAcceptance"] = False
    next_tls_window("before-four-browser-identities"); guard("before-browser")
    remaining = work_end - time.monotonic() - 30
    assert remaining > 0, "No work budget remains for the four unchanged browser identities"
    report["browserBudget"] = {"remainingWorkSeconds": round(remaining, 3), "outerSeconds": min(780, remaining), "perCaseSeconds": 180, "globalSeconds": 720, "scopeReduced": False}
    run(["node_modules/.bin/playwright", "test", "--config", "playwright.supabase-application.config.ts"], min(780, remaining), accepted=(0, 1))
    value = read_browser()
    assert report["commands"][-1]["exitCode"] == 0
    verify_browser(value, fixtures)
    next_tls_window("after-four-browser-identities-before-audit-helper")
    restore_journals(); audit = helper("audit")
    assert audit["journals"]["remaining"] == 0 and len(audit["objects"]) == 8 and len(audit["canonical"]) == 4
    report["applicationAudit"] = audit; guard("after-browser")


def telemetry_grace():
    deadline = min(time.monotonic() + 15, cleanup_end - 12)
    waited = []
    while True:
        owned, uncertain = owned_processes(); assert not uncertain
        candidates = []
        for row in owned:
            entry = Path("/proc") / str(row["pid"])
            try:
                fields = process_stat(entry)
                if fields[19] != row["startTime"]: continue
                cwd = os.readlink(entry / "cwd"); argv = (entry / "cmdline").read_bytes().split(b"\0")
                if cwd == str(app) and os.fsencode(str(app / "node_modules/next/dist/telemetry/detached-flush.js")) in argv:
                    candidates.append(row)
                    if row not in waited: waited.append(row)
            except (FileNotFoundError, ProcessLookupError): pass
        if not candidates or time.monotonic() >= deadline: break
        time.sleep(0.1)
    report["nextTelemetryGrace"] = {"secondsLimit": 15, "observed": waited, "remaining": candidates, "signalsDuringGrace": []}
    assert not candidates, "Owned Next telemetry outlived its normal bounded grace"


def interrupted(number, _frame):
    global interruption
    interruption = "Interrupted by signal " + str(number)


signal.signal(signal.SIGTERM, interrupted); signal.signal(signal.SIGINT, interrupted)
try:
    application_main()
    status = 0
except BaseException as error:
    report["error"] = type(error).__name__ + ": " + str(error)
    report["errorLocation"] = [{"file": Path(frame.filename).name, "line": frame.lineno, "function": frame.name} for frame in traceback.extract_tb(error.__traceback__)[-8:]]
finally:
    cleanup_end = time.monotonic() + 90
    # Retain ordinary Playwright failures before applying the independent gates.
    if "playwright" not in report:
        try: read_browser()
        except BaseException as error: report["browserCaptureError"] = type(error).__name__ + ": " + str(error); status = 1
    # A lost seed ACK may still leave the exclusive private fixture file. Inventory
    # its real passwords before any retained diagnostic is emitted.
    if (root / "fixtures.json").exists():
        try: fixture_secrets()
        except BaseException as error: report["fixtureSecretInventoryError"] = type(error).__name__ + ": " + str(error); status = 1
    if stack_ready and (root / "fixtures.json").exists():
        try:
            restore_journals()
            report["journalsRestored"] = True
        except BaseException as error: report["journalCleanupError"] = type(error).__name__ + ": " + str(error); status = 1
    else: report["journalsRestored"] = not list(root.glob("collision-*"))
    if "next" in managed:
        try: stop_managed("next")
        except BaseException as error: report["nextCleanupError"] = type(error).__name__ + ": " + str(error); status = 1
    if stack_ready and (root / "fixtures.json").exists():
        try:
            final_audit = helper("audit"); report["applicationAuditFinal"] = final_audit
            assert final_audit["journals"]["remaining"] == 0
        except BaseException as error: report["applicationAuditError"] = type(error).__name__ + ": " + str(error); status = 1
    if "proxy" in managed:
        try:
            stop_managed("proxy")
            row = report["managed"]["proxy"]
            _capture, data = capture_file(managed["proxy"]["files"][0])
            proof = json.loads(data); report["httpsProxy"] = proof
            assert proof["requests"] > 0 and proof["active"] == 0 and proof["failures"] == []
        except BaseException as error: report["proxyCleanupError"] = type(error).__name__ + ": " + str(error); status = 1
    if stack_ready:
        try: report["runtimeAfterAllAppAndHelperClosure"] = runtime_clients(require_zero=True)
        except BaseException as error: report["runtimeClosureError"] = type(error).__name__ + ": " + str(error); status = 1
    if dns_attempted:
        try: report["dnsRestored"] = restore_dns_if_closed()
        except BaseException as error: report["dnsCleanupError"] = type(error).__name__ + ": " + str(error); status = 1
    else: report["dnsRestored"] = True
    if stack_attempted:
        try:
            report["dockerBeforeStop"] = owned_docker(docker_snapshot())
            run([str(cli), "stop", "--no-backup"], 45, cwd=stack)
            remaining = owned_docker(docker_snapshot()); report["dockerAfterStop"] = remaining
            assert not any(remaining.values()), "Owned Docker objects remain after normal stop"
            report["stackRemoved"] = True
        except BaseException as error: report["stackCleanupError"] = type(error).__name__ + ": " + str(error); status = 1
    else: report["stackRemoved"] = True
    try:
        for port in [5432, 54321, 54443, 3100]:
            with socket.socket() as sock:
                sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1); sock.bind(("127.0.0.1", port))
        report["portsReleased"] = True
    except BaseException as error: report["portCleanupError"] = type(error).__name__ + ": " + str(error); status = 1
    owned, uncertain = owned_processes(); report["residualBeforeEscalation"] = owned
    if owned or uncertain:
        status = 1
        for row in owned:
            current, _unknown = owned_processes()
            if row in current:
                try: os.kill(row["pid"], signal.SIGTERM)
                except ProcessLookupError: pass
                report.setdefault("cleanupSignals", []).append({"pid": row["pid"], "startTime": row["startTime"], "signal": "TERM"})
        deadline = min(time.monotonic() + 5, cleanup_end - 8)
        while time.monotonic() < deadline:
            owned, uncertain = owned_processes()
            if not owned: break
            time.sleep(0.1)
    owned, uncertain = owned_processes()
    report["processCleanup"] = {"observed": list(observed.values()), "remaining": owned, "uncertain": uncertain, "originalGroupsAbsent": all(group_absent(pgid) for pgid in groups)}
    if owned or uncertain or not report["processCleanup"]["originalGroupsAbsent"]: status = 1
    if dns_attempted and not report.get("dnsRestored") and not owned and not uncertain:
        try: report["dnsRestored"] = restore_dns_if_closed()
        except BaseException as error: report["dnsCleanupError"] = type(error).__name__ + ": " + str(error); status = 1
    try: guard("after-cleanup"); check_export(); report["exportUnchanged"] = True
    except BaseException as error: report["sourceError"] = type(error).__name__ + ": " + str(error); status = 1
    try:
        current = root.lstat(); owner = root / ".owner"; owner_info = owner.lstat()
        safe_root = not root.is_symlink() and (current.st_dev, current.st_ino, current.st_uid) == identity and stat.S_IMODE(current.st_mode) == 0o700
        safe_root = safe_root and stat.S_ISREG(owner_info.st_mode) and not owner.is_symlink() and owner_info.st_uid == os.getuid() and owner_info.st_nlink == 1 and stat.S_IMODE(owner_info.st_mode) == 0o600 and owner.read_text() == nonce
    except (FileNotFoundError, OSError): safe_root = False
    report["scratchIdentityMatches"] = safe_root
    released = all(row["exitObservedAndReaped"] and all(row["pipesEOF"]) and row["originalProcessGroupAbsent"] and not row["forcedDrain"] for row in report["commands"])
    if safe_root and released and not owned and not uncertain and report.get("stackRemoved") is True and report.get("dnsRestored") is True and report["processCleanup"]["originalGroupsAbsent"]: shutil.rmtree(root)
    report["scratchRemoved"] = not root.exists()
    def sanitize(value):
        if isinstance(value, str):
            for secret in sorted(secrets, key=len, reverse=True): value = value.replace(secret, "[REDACTED_LOCAL_CREDENTIAL]")
            value = re.sub(r"eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+", "[REDACTED_LOCAL_JWT]", value)
            return re.sub(r"sb_(?:secret|publishable)_[A-Za-z0-9_-]+", "[REDACTED_LOCAL_KEY]", value)
        if isinstance(value, list): return [sanitize(item) for item in value]
        if isinstance(value, dict): return {key: sanitize(item) for key, item in value.items()}
        return value
    credentials_inventoried = not stack_attempted or keys_known
    credentials_inventoried = credentials_inventoried and "fixtureSecretInventoryError" not in report
    if not credentials_inventoried:
        for key in ["playwright", "browserBoundaries"]:
            if key in report: report[key] = {"payloadWithheldReason": "incomplete-local-credential-inventory"}
    for value, raw in raw_captures:
        if not value["complete"] or not credentials_inventoried:
            value.update({"payloadWithheldReason": "incomplete-capture" if not value["complete"] else "incomplete-local-credential-inventory", "sanitizedBytes": 0, "sanitizedSha256": sha(b""), "sanitizedGzipBase64": base64.b64encode(gzip.compress(b"", mtime=0)).decode()})
        else:
            sanitized = raw
            for secret in sorted(secrets, key=len, reverse=True): sanitized = sanitized.replace(secret.encode(), b"[REDACTED_LOCAL_CREDENTIAL]")
            sanitized = re.sub(rb"eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+", b"[REDACTED_LOCAL_JWT]", sanitized)
            sanitized = re.sub(rb"sb_(?:secret|publishable)_[A-Za-z0-9_-]+", b"[REDACTED_LOCAL_KEY]", sanitized)
            value.update({"sanitization": "byte-preserving-credential-substitution-v1", "sanitizedBytes": len(sanitized), "sanitizedSha256": sha(sanitized), "sanitizedGzipBase64": base64.b64encode(gzip.compress(sanitized, mtime=0)).decode()})
    report["finishedAt"] = time.time(); report["interruption"] = interruption
    report["passed"] = status == 0 and interruption is None and not report.get("exportViolations") and report.get("freshBrowserCasesPassed") == 4 and len(report.get("nextTLSWindows", [])) == 2 and len(report["sourceGuards"]) == 5 and report.get("portsReleased") is True and report.get("stackRemoved") is True and report.get("dnsRestored") is True and report.get("journalsRestored") is True and report["scratchRemoved"] and safe_root and credentials_inventoried and all(value["complete"] for value, _raw in raw_captures)
    report["providerCasesExecutedThisAttempt"] = 0
    print("IV_SUPABASE_APPLICATION_RESULT=" + json.dumps(sanitize(report), separators=(",", ":")), flush=True)
raise SystemExit(0 if report["passed"] else 1)
