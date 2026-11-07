#!/usr/bin/env python3
"""Bounded public CI metadata diagnosis only; never provider/test acceptance."""
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
BRANCH = "qa/supabase-provider-20261107-3"
LOCK_SHA = "b18dd278e6eded698e269d2e8400b0359083a8ba34de4721227a70b5e27c0d59"
ASSET = "supabase_3.0.0_linux_amd64.tar.gz"
ARCHIVE_SHA = "eeb61edcd59a4735fcb5e58596574f25d03d420efca779f43ddb307e1cc5c754"
CHECKSUM_SHA = "23763f31f1d3251c71cad4fd27577303f306514e2b99da91427a619d1800301f"
BASE = "https://github.com/supabase/cli/releases/download/v3.0.0/"
MIGRATION = "supabase/migrations/20261107002755_intelligent_visualization_hosted.sql"
ADMIN = "postgresql://postgres:postgres@127.0.0.1:54322/postgres"
RUNTIME = "postgresql://iv_runtime:authored-ci-runtime@127.0.0.1:54322/postgres"
assert re.fullmatch(r"[0-9a-f]{40}", source)
assert os.environ.get("CI") == os.environ.get("IV_SUPABASE_PUBLIC_REPOSITORY") == "true"
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
    "scope": "DIAGNOSTICS ONLY: zero test invocations. Read-only actual runtime catalog metadata and one unchanged-policy provider.health observation after owned fresh migration/provisioning. No provider acceptance, browser/build/model/hosted account/settings calls or selector activation.",
    "capturePolicy": "Original streams exist only in controller memory. Original observed byte counts/SHA-256 are retained, but all retained text/JSON/errors are retrospectively sanitized using parsed disposable status keys and credential patterns. Sanitized gzip captures are not original independently replayable streams. No raw status/config/dotenv artifact is retained."}
prior_path = "docs/results/2026/11-07/supabase-provider-attempt-1.json"
prior_bytes = (repo / prior_path).read_bytes()
assert len(prior_bytes) == 188095 and sha(prior_bytes) == "a99c0f71ff7dd1c5df2cd06e1cab1485f58fbdd54e249480db5ab1f9c98944b6"
prior = json.loads(prior_bytes)
assert prior["passed"] is False and prior["sourceCommit"] == "5babe6dc068669a1f5d970cb22b9d0953d4ae818"
assert prior["error"] == "AssertionError: Command failed: node_modules/.bin/tsc" and "freshCasesPassed" not in prior and "cliArchive" not in prior
report["priorAttempt"] = {"receipt": prior_path, "bytes": len(prior_bytes), "sha256": sha(prior_bytes), "sourceCommit": prior["sourceCommit"],
    "passed": False, "testsExecuted": 0, "stackStarted": False, "reason": "Semantic TypeScript checking failed before CLI setup or tests. No prior cases are carried into this retry."}
second_path = "docs/results/2026/11-07/supabase-provider-attempt-2.json"
second_bytes = (repo / second_path).read_bytes()
assert len(second_bytes) == 323072 and sha(second_bytes) == "dd03c3c755b7a1f1b62fe62366596b447ee0632e8db306053c58c9bd87c651ae"
second = json.loads(second_bytes)
assert second["passed"] is False and second["sourceCommit"] == "5ae8aa3c2f69ad98894375d7f212355c0117c9da"
protected = second["sourceExport"]["inputs"]
assert all(before.get(name) == row for name, row in protected.items()), "Previously failed runtime inputs changed before diagnosis"
report["priorAttempt2"] = {"receipt": second_path, "bytes": len(second_bytes), "sha256": sha(second_bytes), "sourceCommit": second["sourceCommit"],
    "passed": False, "passedCases": 28, "failedCases": 13, "unrunCases": 48, "carriedCases": 0, "unchangedPriorExportInputs": len(protected),
    "reason": "The safe policy error concealed the failing predicate. Metadata is required before choosing any correction; creator membership remains an inference."}
report.update({"testsExecuted": 0, "providerAccepted": False, "passed": False, "diagnosticComplete": False})


def guard(label):
    current = vector(); assert current == before
    report["sourceGuards"].append({"label": label, "files": len(current), "bytes": sum(row["bytes"] for row in current.values()),
        "matches": True, "vectorSha256": sha(json.dumps(current, sort_keys=True, separators=(",", ":")).encode())})


guard("before")
root = Path(tempfile.mkdtemp(prefix="ivsb-", dir="/tmp")); os.chmod(root, 0o700)
identity = (root.stat().st_dev, root.stat().st_ino, root.stat().st_uid)
nonce = os.urandom(16).hex(); (root / ".owner").write_text(nonce)
assert root.resolve() == root
app, stack = root / "app", root / "stack"
for name in ["app", "stack", "home", "supabase-home", "cache", "config", "tmp", "docker"]: (root / name).mkdir(mode=0o700)
for name in ["npm-user", "npm-global"]: (root / name).write_text("")
project = "iv-supabase-" + source[:12]
groups, export, observed, raw_captures = [], {}, {}, []
docker_before, cli, stack_attempted, stack_ready, status = None, None, False, False, 1
secrets, keys_known = {"authored-ci-runtime"}, False
env = {"PATH": os.environ["PATH"], "CI": "true", "LANG": "C.UTF-8", "TZ": "UTC", "NO_COLOR": "1",
    "HOME": str(root / "home"), "SUPABASE_HOME": str(root / "supabase-home"), "TMPDIR": str(root / "tmp"),
    "XDG_CACHE_HOME": str(root / "cache"), "XDG_CONFIG_HOME": str(root / "config"), "DOCKER_CONFIG": str(root / "docker"),
    "npm_config_cache": str(root / "npm-cache"), "npm_config_userconfig": str(root / "npm-user"), "npm_config_globalconfig": str(root / "npm-global"),
    "SUPABASE_TELEMETRY_DISABLED": "1", "SUPABASE_NO_KEYRING": "1", "SUPABASE_EXPERIMENTAL_STACK": "0", "DO_NOT_TRACK": "1",
    "NEXT_TELEMETRY_DISABLED": "1", "PERSISTENCE_PROVIDER": "local", "STORAGE_PROVIDER": "local", "AUTH_PROVIDER": "portable",
    "AI_ENABLED": "false", "EVE_ENABLED": "false", "WORKFLOWS_ENABLED": "false", "QUEUES_ENABLED": "false", "SANDBOX_QA_ENABLED": "false",
    "LOCAL_STORAGE_DIR": str(root / "storage"),
    "IV_SUPABASE_CHECKS": "disposable", "IV_SUPABASE_ADMIN_URL": ADMIN, "IV_SUPABASE_RUNTIME_URL": RUNTIME,
    "IV_SUPABASE_API_URL": "http://127.0.0.1:54321", "IV_SUPABASE_CHECK_ROOT": str(root), "SOURCE_COMMIT": source}


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


def capture(data):
    value = {"observedOriginalBytes": len(data), "observedOriginalSha256": sha(data), "originalRetained": False, "complete": len(data) <= MAX}
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
    for index, pipe in enumerate([proc.stdout, proc.stderr]): os.set_blocking(pipe.fileno(), False); selector.register(pipe, selectors.EVENT_READ, index)
    row = {"argv": argv, "pid": proc.pid, "timedOut": False, "termSent": False, "killSent": False, "forcedDrain": False}
    started, term_at, kill_at = time.monotonic(), None, None
    try:
        while True:
            now = time.monotonic(); overflow = any(len(value) > MAX for value in buffers)
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
                    if len(buffers[key.data]) <= MAX: buffers[key.data].extend(chunk)
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
        "pipesEOF": eof, "originalProcessGroupAbsent": group_absent(proc.pid), "stdout": capture(bytes(buffers[0])), "stderr": capture(bytes(buffers[1]))})
    report["commands"].append(row); check_export()
    assert reaped and all(eof) and row["originalProcessGroupAbsent"] and not any(row[key] for key in ["termSent", "killSent", "timedOut", "forcedDrain"]), "Command lifecycle incomplete"
    assert all(row[key]["complete"] for key in ["stdout", "stderr"]) and proc.returncode in accepted, "Command failed: " + str(argv[0])
    return bytes(buffers[0])


def docker_snapshot():
    result = {}
    for kind, listing, id_field, labels in [("container", ["ps", "-aq", "--no-trunc"], ".Id", ".Config.Labels"),
            ("network", ["network", "ls", "-q", "--no-trunc"], ".Id", ".Labels"), ("volume", ["volume", "ls", "-q"], ".Name", ".Labels")]:
        ids = run(["docker", *listing], 15).decode().split()
        extra = ',"state":{{json .State.Status}},"ports":{{json .NetworkSettings.Ports}}' if kind == "container" else ""
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


def catalog_diagnostics():
    # Read-only metadata from an actual runtime LOGIN. No state payload, session,
    # user row, credential, arbitrary namespace or application object is selected.
    return node(r'''import pg from 'pg';
const p=new pg.Pool({connectionString:process.env.IV_SUPABASE_RUNTIME_URL,max:1,connectionTimeoutMillis:5000,statement_timeout:10000,query_timeout:10000});
const schema='intelligent_visualization_supabase',runtime='iv_runtime';
try{const c=await p.connect();try{await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
const q=async(sql,args=[]) => (await c.query(sql,args)).rows;
const result={
 role:await q(`SELECT current_user AS current_role,session_user AS session_role,r.oid,r.rolname,r.rolsuper,r.rolcreaterole,r.rolcreatedb,
 r.rolreplication,r.rolbypassrls,r.rolinherit,r.rolcanlogin,
 EXISTS(SELECT 1 FROM pg_namespace n WHERE n.nspowner=r.oid) OR EXISTS(SELECT 1 FROM pg_class t WHERE t.relowner=r.oid) AS owns_objects
 FROM pg_roles r WHERE r.rolname=$1`,[runtime]),
 memberships:await q(`SELECT granted.rolname AS granted_role,recipient.rolname AS member_role,grantor.rolname AS grantor,
 m.admin_option,m.inherit_option,m.set_option
 FROM pg_auth_members m JOIN pg_roles granted ON granted.oid=m.roleid JOIN pg_roles recipient ON recipient.oid=m.member
 JOIN pg_roles grantor ON grantor.oid=m.grantor WHERE granted.rolname=$1 OR recipient.rolname=$1
 ORDER BY granted.rolname,recipient.rolname,grantor.rolname`,[runtime]),
 namespace:await q(`SELECT n.nspname,owner.rolname AS owner,n.nspacl::text AS acl,
 has_schema_privilege($2,n.oid,'USAGE') AS runtime_usage,has_schema_privilege($2,n.oid,'CREATE') AS runtime_create
 FROM pg_namespace n JOIN pg_roles owner ON owner.oid=n.nspowner WHERE n.nspname=$1`,[schema,runtime]),
 tables:await q(`SELECT c.relname,c.relkind,owner.rolname AS owner,c.relacl::text AS acl,c.relrowsecurity,c.relforcerowsecurity,
 has_table_privilege($2,c.oid,'SELECT') AS runtime_select,has_table_privilege($2,c.oid,'INSERT') AS runtime_insert,
 has_table_privilege($2,c.oid,'UPDATE') AS runtime_update,has_table_privilege($2,c.oid,'DELETE') AS runtime_delete,
 has_table_privilege($2,c.oid,'TRUNCATE') AS runtime_truncate,has_table_privilege($2,c.oid,'REFERENCES') AS runtime_references,
 has_table_privilege($2,c.oid,'TRIGGER') AS runtime_trigger
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_roles owner ON owner.oid=c.relowner
 WHERE n.nspname=$1 AND c.relkind IN ('r','p','v','m','S','f') ORDER BY c.relname`,[schema,runtime]),
 browserRoles:await q(`SELECT rolname,has_schema_privilege(oid,$1,'USAGE') AS schema_usage,has_schema_privilege(oid,$1,'CREATE') AS schema_create
 FROM pg_roles WHERE rolname IN ('anon','authenticated') ORDER BY rolname`,[schema]),
 policies:await q(`SELECT tablename,policyname,permissive,roles::text[] AS roles,cmd,qual,with_check FROM pg_policies WHERE schemaname=$1 ORDER BY tablename,policyname`,[schema]),
 lineage:await q('SELECT version,name FROM intelligent_visualization_supabase.schema_migrations ORDER BY version'),
 legacyKeys:await q('SELECT key FROM intelligent_visualization_supabase.legacy_repository_state ORDER BY key')};
await c.query('COMMIT');console.log(JSON.stringify(result));}catch(error){await c.query('ROLLBACK');throw error;}finally{c.release();}}
finally{await p.end();}''')


def interrupted(number, _frame):
    global interruption
    interruption = "Interrupted by signal " + str(number)


signal.signal(signal.SIGTERM, interrupted); signal.signal(signal.SIGINT, interrupted)
try:
    configs = {"package.json", "package-lock.json", "tsconfig.json", "next.config.ts", "postcss.config.mjs"}
    selected = [name for name in before if name.startswith(("app/", "components/", "hooks/", "lib/", "packages/", "public/"))
        or name in configs or name == MIGRATION or name.startswith("scripts/") and name.endswith(".ts")]
    for name in selected:
        assert before[name]["mode"] != "120000"
        destination = app / name; destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(repo / name, destination); os.chmod(destination, 0o755 if before[name]["mode"] == "100755" else 0o644)
        export[name] = before[name]
    assert configs | {MIGRATION} <= export.keys()
    report["sourceExport"] = {"files": len(export), "bytes": sum(row["bytes"] for row in export.values()), "inputs": export}
    assert run(["node", "--version"]).strip() == b"v24.21.0"
    lock = (app / "package-lock.json").read_bytes(); assert len(lock) == 618662 and sha(lock) == LOCK_SHA
    report["frozenLock"] = {"bytes": len(lock), "sha256": LOCK_SHA}
    run(["npm", "ci", "--ignore-scripts", "--no-audit", "--no-fund"], 240); guard("after-install")
    for port in [54321, 54322]:
        with socket.socket() as sock:
            sock.bind(("127.0.0.1", port))
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
        selected_binary = [row for row in members if row.name == "supabase" and row.isfile()]; assert len(selected_binary) == 1
        with handle.extractfile(selected_binary[0]) as incoming, cli.open("xb") as outgoing: shutil.copyfileobj(incoming, outgoing, 1024 * 1024)
    os.chmod(cli, 0o700); assert cli.read_bytes()[:4] == b"\x7fELF"
    top_help = run([str(cli), "--help"], 20, cwd=stack).decode()
    assert all(command in top_help for command in ["init", "start", "status", "stop"])
    assert run([str(cli), "--version"], 20, cwd=stack).decode().strip() in ["3.0.0", "v3.0.0"]
    help_output = {}
    for command in ["init", "start", "status", "stop"]:
        help_output[command] = run([str(cli), command, "--help"], 20, cwd=stack).decode()
    assert "--exclude" in help_output["start"] and "--output" in help_output["status"] and "--no-backup" in help_output["stop"]
    report["cliHelpVerified"] = ["top-level", "init", "start --exclude", "status --output", "stop --no-backup"]
    run([str(cli), "init"], 30, cwd=stack)
    config = tomllib.loads((stack / "supabase/config.toml").read_text()); config["project_id"] = project
    assert config["api"]["port"] == 54321 and config["db"]["port"] == 54322 and config["db"]["major_version"] == 17
    for path in ["realtime", "studio", "edge_runtime", "local_smtp", "analytics", "db.pooler", "db.seed", "storage.vector", "storage.s3_protocol"]:
        item = config
        for key in path.split("."): item = item.setdefault(key, {})
        item["enabled"] = False
    encoded = json.dumps(config).encode(); (stack / "supabase/config.json").write_bytes(encoded)
    # CLI3 supports JSON. Leave one config source, so precedence is unambiguous.
    (stack / "supabase/config.toml").unlink()
    report["stackConfiguration"] = {"projectId": project, "bytes": len(encoded), "sha256": sha(encoded), "contentsRetained": False}
    migration_target = stack / MIGRATION; migration_target.parent.mkdir(parents=True, exist_ok=True)
    assert list(migration_target.parent.iterdir()) == []
    shutil.copyfile(app / MIGRATION, migration_target)
    report["migration"] = {"path": MIGRATION, "bytes": len(migration_target.read_bytes()), "sha256": sha(migration_target.read_bytes())}
    stack_attempted = True
    run([str(cli), "start", "--exclude", "realtime,imgproxy,mailpit,postgres-meta,studio,edge-runtime,logflare,vector,supavisor"], 420, cwd=stack)
    values = json.loads(run([str(cli), "status", "-o", "json"], 30, cwd=stack))
    for key in ["ANON_KEY", "SERVICE_ROLE_KEY"]: assert isinstance(values.get(key), str) and values[key]
    secrets.update(value for key, value in values.items() if isinstance(value, str) and any(label in key for label in ["KEY", "SECRET", "PASSWORD"]))
    secrets.update(value for key, value in values.items() if key.endswith("_URL") and isinstance(value, str) and urlsplit(value).password is not None)
    keys_known = True; env["IV_SUPABASE_SERVICE_KEY"] = values["SERVICE_ROLE_KEY"]; env["IV_SUPABASE_ANON_KEY"] = values["ANON_KEY"]
    report["localStatus"] = {"parsed": True, "keysRetained": False, "fields": sorted(values)}
    for key, port, scheme in [("API_URL", 54321, ["http"]), ("DB_URL", 54322, ["postgres", "postgresql"])]:
        location = urlsplit(values[key])
        assert location.scheme in scheme and location.hostname in ["localhost", "127.0.0.1"] and location.port == port and not location.query and not location.fragment
    # Bind administrative DML to positively identified containers before touching
    # either loopback service; a free port alone is not ownership evidence.
    report["dockerStarted"] = owned_docker(docker_snapshot())
    containers = {row["name"].lstrip("/"): row for row in report["dockerStarted"]["container"].values()}
    for service, internal_port, host_port in [("db", "5432/tcp", "54322"), ("kong", "8000/tcp", "54321")]:
        container = containers["supabase_" + service + "_" + project]
        assert container["state"] == "running"
        bindings = container["ports"].get(internal_port)
        assert bindings and all(row["HostPort"] == host_port and row["HostIp"] in ["127.0.0.1", "0.0.0.0", "::"] for row in bindings)
        assert (container["labels"] or {}).get("com.supabase.cli.workdir") == str(stack)
    report["runtimeProvision"] = node("""import pg from 'pg';
const p=new pg.Pool({connectionString:process.env.IV_SUPABASE_ADMIN_URL,max:1,connectionTimeoutMillis:5000,statement_timeout:10000});
try{const role=(await p.query(\"SELECT rolcanlogin FROM pg_roles WHERE rolname='iv_runtime'\")).rows[0];if(!role||role.rolcanlogin!==false)throw Error('Expected newly migrated NOLOGIN role');
await p.query(\"ALTER ROLE iv_runtime LOGIN PASSWORD 'authored-ci-runtime'\");await p.query(\"COMMENT ON DATABASE postgres IS 'iv-supabase-provider-ci:\"+process.env.SOURCE_COMMIT+\"'\");console.log(JSON.stringify({freshRoleProvisioned:true,markerInstalled:true}));}finally{await p.end();}""")
    report["bucketProvision"] = node("""const r=await fetch(process.env.IV_SUPABASE_API_URL+'/storage/v1/bucket',{method:'POST',redirect:'error',signal:AbortSignal.timeout(10000),headers:{apikey:process.env.IV_SUPABASE_SERVICE_KEY,Authorization:'Bearer '+process.env.IV_SUPABASE_SERVICE_KEY,'content-type':'application/json'},body:JSON.stringify({id:'iv-private-checks',name:'iv-private-checks',public:false})});if(![200,201].includes(r.status))throw Error('Private bucket create failed');await r.arrayBuffer();console.log(JSON.stringify({privateBucketCreated:true}));""")
    stack_ready = True
    report["catalogDiagnostics"] = catalog_diagnostics()
    runtime_identity = report["catalogDiagnostics"]["role"]
    assert len(runtime_identity) == 1 and runtime_identity[0]["current_role"] == runtime_identity[0]["session_role"] == "iv_runtime", "Catalog diagnostic did not use the actual runtime LOGIN"
    health_file = app / "diagnostic-provider-health.ts"
    health_source = '''import { createPostgresDatabase } from "./packages/provider-postgres/database"
import { createSupabasePersistenceProviderForDatabase } from "./packages/provider-supabase/adapter"
async function main() {
 const database=createPostgresDatabase({connectionString:process.env.IV_SUPABASE_RUNTIME_URL,max:1,connectionTimeoutMillis:5000,statement_timeout:10000,query_timeout:10000})
 const provider=createSupabasePersistenceProviderForDatabase(database)
 let observation: Record<string,unknown>
 try { observation={attempted:true,ok:true,result:await provider.health()} }
 catch(error) { observation={attempted:true,ok:false,errorType:error instanceof Error?error.name:"UnknownError",message:error instanceof Error?error.message:"UnknownError"} }
 finally { await provider.close() }
 console.log(JSON.stringify(observation))
}
main().catch((error)=>{console.error(error instanceof Error?error.name:"UnknownError");process.exitCode=1})
'''
    health_file.write_text(health_source)
    report["ownedHealthScript"] = {"bytes": len(health_source.encode()), "sha256": sha(health_source.encode()), "internalInjectedDatabase": True,
        "limit": "Diagnostic observation uses the same actual runtime LOGIN and unchanged validator as the failed fixtures; this is not real application-factory or hosted/TLS acceptance."}
    report["providerHealth"] = json.loads(run(["node_modules/.bin/tsx", str(health_file)], 30))
    assert report["providerHealth"]["attempted"] is True and isinstance(report["providerHealth"]["ok"], bool)
    guard("after-diagnostics")
    report["serviceCleanupAudit"] = node("""import pg from 'pg';const p=new pg.Pool({connectionString:process.env.IV_SUPABASE_ADMIN_URL,max:1,statement_timeout:10000});try{
const q=async sql=>(await p.query(sql)).rows[0].n;const result={runtimeClients:await q(\"SELECT count(*)::int AS n FROM pg_stat_activity WHERE usename='iv_runtime'\"),authUsers:await q('SELECT count(*)::int AS n FROM auth.users'),storageObjects:await q('SELECT count(*)::int AS n FROM storage.objects'),testRoles:await q(\"SELECT count(*)::int AS n FROM pg_roles WHERE rolname LIKE 'iv_test_%'\")};if(Object.values(result).some(x=>x!==0))throw Error('Owned fixture service residue remains');console.log(JSON.stringify(result));}finally{await p.end();}""")
    status = 0
except BaseException as error:
    report["error"] = type(error).__name__ + ": " + str(error)
    report["errorLocation"] = [{"file": Path(frame.filename).name, "line": frame.lineno, "function": frame.name} for frame in traceback.extract_tb(error.__traceback__)[-8:]]
finally:
    cleanup_end = time.monotonic() + 90
    if stack_attempted:
        try:
            report["dockerBeforeStop"] = owned_docker(docker_snapshot())
            run([str(cli), "stop", "--no-backup"], 55, cwd=stack)
            remaining = owned_docker(docker_snapshot()); report["dockerAfterStop"] = remaining
            assert not any(remaining.values()), "Owned Docker objects remain after normal stop"
            report["stackRemoved"] = True
        except BaseException as error: report["stackCleanupError"] = type(error).__name__ + ": " + str(error); status = 1
    else: report["stackRemoved"] = True
    try:
        for port in [54321, 54322]:
            with socket.socket() as sock:
                sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1); sock.bind(("127.0.0.1", port))
        report["portsReleased"] = True
        guard("after-stack-stop")
    except BaseException as error: report["stopGuardError"] = type(error).__name__ + ": " + str(error); status = 1
    owned, uncertain = owned_processes(); report["residualBeforeEscalation"] = owned
    if owned or uncertain:
        status = 1
        for row in owned:
            current, _unknown = owned_processes()
            if row in current:
                try: os.kill(row["pid"], signal.SIGTERM)
                except ProcessLookupError: pass
                report.setdefault("cleanupSignals", []).append({"pid": row["pid"], "startTime": row["startTime"], "signal": "TERM"})
        deadline = min(time.monotonic() + 5, cleanup_end - 10)
        while time.monotonic() < deadline:
            owned, uncertain = owned_processes()
            if not owned: break
            time.sleep(0.1)
    owned, uncertain = owned_processes()
    report["processCleanup"] = {"observed": list(observed.values()), "remaining": owned, "uncertain": uncertain, "originalGroupsAbsent": all(group_absent(pgid) for pgid in groups)}
    if owned or uncertain or not report["processCleanup"]["originalGroupsAbsent"]: status = 1
    try: guard("after-cleanup"); check_export(); report["exportUnchanged"] = True
    except BaseException as error: report["sourceError"] = type(error).__name__ + ": " + str(error); status = 1
    try:
        current = root.lstat(); safe_root = not root.is_symlink() and (current.st_dev, current.st_ino, current.st_uid) == identity and (root / ".owner").read_text() == nonce
    except (FileNotFoundError, OSError): safe_root = False
    report["scratchIdentityMatches"] = safe_root
    released = all(row["exitObservedAndReaped"] and all(row["pipesEOF"]) and row["originalProcessGroupAbsent"] and not row["forcedDrain"] for row in report["commands"])
    if safe_root and released and not owned and not uncertain and report.get("stackRemoved") is True and report["processCleanup"]["originalGroupsAbsent"]: shutil.rmtree(root)
    report["scratchRemoved"] = not root.exists()
    # Raw local credentials and original captures never enter emitted evidence.
    def sanitize(value):
        if isinstance(value, str):
            for secret in sorted(secrets, key=len, reverse=True): value = value.replace(secret, "[REDACTED_LOCAL_CREDENTIAL]")
            value = re.sub(r"eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+", "[REDACTED_LOCAL_JWT]", value)
            return re.sub(r"sb_(?:secret|publishable)_[A-Za-z0-9_-]+", "[REDACTED_LOCAL_KEY]", value)
        if isinstance(value, list): return [sanitize(item) for item in value]
        if isinstance(value, dict): return {key: sanitize(item) for key, item in value.items()}
        return value
    for value, raw in raw_captures:
        if not value["complete"] or stack_attempted and not keys_known:
            value.update({"payloadWithheldReason": "incomplete-capture" if not value["complete"] else "incomplete-local-key-inventory", "sanitizedBytes": 0, "sanitizedSha256": sha(b""), "sanitizedGzipBase64": base64.b64encode(gzip.compress(b"", mtime=0)).decode()})
        else:
            # Preserve every noncredential byte, including non-UTF-8 output.
            sanitized = raw
            for secret in sorted(secrets, key=len, reverse=True): sanitized = sanitized.replace(secret.encode(), b"[REDACTED_LOCAL_CREDENTIAL]")
            sanitized = re.sub(rb"eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+", b"[REDACTED_LOCAL_JWT]", sanitized)
            sanitized = re.sub(rb"sb_(?:secret|publishable)_[A-Za-z0-9_-]+", b"[REDACTED_LOCAL_KEY]", sanitized)
            value.update({"sanitization": "byte-preserving-credential-substitution-v1", "sanitizedBytes": len(sanitized), "sanitizedSha256": sha(sanitized), "sanitizedGzipBase64": base64.b64encode(gzip.compress(sanitized, mtime=0)).decode()})
    report["finishedAt"] = time.time()
    report["interruption"] = interruption
    report["providerAccepted"] = report["passed"] = False
    report["diagnosticComplete"] = status == 0 and interruption is None and "catalogDiagnostics" in report and report.get("providerHealth", {}).get("attempted") is True and len(report["sourceGuards"]) == 5 and report.get("portsReleased") is True and report.get("stackRemoved") is True and report["scratchRemoved"] and safe_root and all(value["complete"] for value, _raw in raw_captures)
    print("IV_SUPABASE_DIAGNOSTIC_RESULT=" + json.dumps(sanitize(report), separators=(",", ":")), flush=True)
raise SystemExit(0 if report["diagnosticComplete"] else 1)
