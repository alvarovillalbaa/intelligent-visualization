#!/usr/bin/env node
// Four local Course export browser cases; all runtime work stays in owned public CI.
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { gzipSync } from 'node:zlib';
const REPOSITORY = 'alvarovillalbaa/intelligent-visualization';
const BRANCH = 'refs/heads/qa/iv-course-export-20261105';
const ACTIVE = '.github/workflows/course-export-browser.yml';
const SPEC = 'docs/proposals/course-export-browser-v2.test.ts.example';
const SPEC_SHA = 'f61bdf287eaf6ebd06a71e27c292758aa9ebaf3dee3c11115ae38fec57c8aee2';
const ORIGIN = 'http://127.0.0.1:3100';
const CONFIG = 'docs/proposals/course-export-browser-v2.config.ts.example';
const CONFIG_SHA = '5b110a71c0f7abcd4ddfad5fafc953702460ba12adad6f906c73945ea38e9886';
const EXISTING_CI_BLOB = 'd758b9ae4a9cdf72a96fdf02285ba6d45cafdbaf';
const TITLES = [
  'native Course HTML export retains authored content and its local interactive runtime across a file reload',
  'failed Course preparation preserves the stored draft and Retry calls the real local artifact route',
];
const PROJECTS = ['desktop', 'mobile'];
const STREAM_LIMIT = 524288, REPORT_LIMIT = 1048576, BROWSER_LIMIT = 2097152;
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const gitBlob = bytes => createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
const need = (condition, code) => { if (!condition) throw new Error(code); };
const finite = error => /^[a-z0-9_]+$/.test(error?.message ?? '') ? error.message : 'controller_error';
const sourceCommit = process.argv[3];
need(process.argv.length === 4 && process.argv[2] === '--source-commit' && /^[a-f0-9]{40}$/.test(sourceCommit ?? ''), 'source_pin_required');
need(process.version === 'v24.21.0' && process.platform === 'linux' && process.env.CI === 'true'
  && process.env.GITHUB_ACTIONS === 'true' && process.env.GITHUB_REPOSITORY === REPOSITORY
  && process.env.GITHUB_EVENT_NAME === 'push' && process.env.GITHUB_REF === BRANCH
  && process.env.IV_COURSE_PUBLIC_REPOSITORY === 'true', 'approved_public_ci_required');

const repo = fs.realpathSync(process.cwd()), parent = fs.realpathSync('/tmp');
need(path.isAbsolute(parent) && fs.statSync(parent).isDirectory(), 'runner_temp_invalid');
const root = fs.mkdtempSync(path.join(parent, 'ivc-'));
fs.chmodSync(root, 0o700);
const identity = fs.lstatSync(root), nonce = randomUUID();
need(identity.uid === process.getuid(), 'scratch_owner_invalid');
fs.writeFileSync(path.join(root, 'owner'), nonce, { flag: 'wx', mode: 0o600 });
for (const name of ['tools', 'tmp', 'cache', 'config', 'browsers', 'app', 'downloads', 'output']) fs.mkdirSync(path.join(root, name), { mode: 0o700 });
for (const name of ['npm-user', 'npm-global']) fs.writeFileSync(path.join(root, name), '', { flag: 'wx', mode: 0o600 });
const tools = path.join(root, 'tools'), app = path.join(root, 'app');
const specFile = path.join(app, 'tests/tmp/course-export.spec.ts'), configFile = path.join(app, 'tests/tmp/course-export.config.ts');
const resultFile = path.join(root, 'browser-results.json'), outputDirectory = path.join(root, 'output/results');
need(Buffer.byteLength(path.join(root, 'tmp')) + 64 < 108, 'chromium_socket_path_budget');
const env = {
  PATH: `${path.dirname(process.execPath)}:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin`,
  HOME: process.env.HOME, LANG: 'C.UTF-8', TZ: 'UTC', CI: 'true', NO_COLOR: '1',
  TMPDIR: path.join(root, 'tmp'), TMP: path.join(root, 'tmp'), TEMP: path.join(root, 'tmp'),
  XDG_CACHE_HOME: path.join(root, 'cache'), XDG_CONFIG_HOME: path.join(root, 'config'),
  NODE_COMPILE_CACHE: path.join(root, 'cache', 'node'),
  npm_config_userconfig: path.join(root, 'npm-user'), npm_config_globalconfig: path.join(root, 'npm-global'),
  npm_config_cache: path.join(root, 'cache', 'npm'), npm_config_registry: 'https://registry.npmjs.org/',
  npm_config_audit: 'false', npm_config_fund: 'false', npm_config_update_notifier: 'false',
  GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_TERMINAL_PROMPT: '0', GIT_OPTIONAL_LOCKS: '0',
  PLAYWRIGHT_BROWSERS_PATH: path.join(root, 'browsers'), PLAYWRIGHT_HTML_OPEN: 'never',
  NODE_PATH: path.join(tools, 'node_modules'), NODE_ENV: 'development', NEXT_TELEMETRY_DISABLED: '1', DO_NOT_TRACK: '1',
  NEXT_PUBLIC_APP_URL: ORIGIN, PERSISTENCE_PROVIDER: 'local', STORAGE_PROVIDER: 'auto', AUTH_PROVIDER: 'portable', REALTIME_PROVIDER: 'auto',
  AI_ENABLED: 'false', EVE_ENABLED: 'false', WORKFLOWS_ENABLED: 'false', QUEUES_ENABLED: 'false', SANDBOX_QA_ENABLED: 'false',
  IV_COURSE_RUN_ROOT: root, IV_COURSE_DOWNLOADS: path.join(root, 'downloads'), IV_COURSE_BROWSER_RESULTS: resultFile,
  IV_COURSE_OUTPUT: outputDirectory, SOURCE_COMMIT: sourceCommit,
};
for (const name of ['DATABASE_URL', 'CONVEX_URL', 'NEXT_PUBLIC_CONVEX_URL', 'CONVEX_DEPLOYMENT', 'CONVEX_DEPLOY_KEY', 'CONVEX_SERVER_TOKEN',
  'CONVEX_ADMIN_KEY', 'SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY',
  'CLOUDFLARE_DATA_API_URL', 'CLOUDFLARE_DATA_API_SECRET', 'CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_D1_DATABASE_ID',
  'CLOUDFLARE_R2_BUCKET', 'CLOUDFLARE_R2_ACCESS_KEY_ID', 'CLOUDFLARE_R2_SECRET_ACCESS_KEY', 'BLOB_READ_WRITE_TOKEN',
  'AI_GATEWAY_API_KEY', 'VERCEL_OIDC_TOKEN', 'VERCEL', 'OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'GOOGLE_GENERATIVE_AI_API_KEY',
  'FIRECRAWL_API_KEY', 'VISUALIZATION_SIGNING_SECRET', 'SLIDES_SIGNING_SECRET']) env[name] = '';
const report = {
  schemaVersion: 'iv.course-export-browser.v2', sourceCommit, origin: ORIGIN,
  status: 'failed', startedAtUtc: new Date().toISOString(),
  runtime: { node: process.version, platform: process.platform, architecture: process.arch,
    tmpDirectoryBytes: Buffer.byteLength(path.join(root, 'tmp')), chromiumSocketReserveBytes: 64 },
  scope: { scenarios: TITLES, projects: PROJECTS, cases: 4, retries: 0, workers: 1, productionBuild: false, nextDevelopmentCompilation: true,
    applicationDependencies: 'unchanged frozen npm lock, lifecycle scripts disabled, owned export only',
    accounts: false, models: false, physicalDevice: false, old106UnitCasesRepeated: false, broad474CaseCIRepeated: false,
    server: 'actual loopback Next development server --webpack', generation: 'authored intercepted fixture',
    artifact: 'actual local preview compiler route', sourceExport: 'runtime input subset only' },
  limits: { workSeconds: 1020, cleanupSeconds: 90, browserSeconds: 660, jobMinutes: 20,
    streamBytes: STREAM_LIMIT, streamGzipBytes: 131072, allStreamsGzipBytes: 524288,
    browserGlobalSeconds: 600, browserJsonBytes: BROWSER_LIMIT, reportBytes: REPORT_LIMIT, assetFetchSeconds: 8 },
  commands: [], guards: [], errors: [], sourceFiles: [],
  proofLimits: [
    'Four actual local browser cases run once. The 106 old unit cases and the existing broad CI are not selected or repeated.',
    'Only an exact runtime-input subset is exported under owned scratch. No .git, documentation, prior evidence or existing dependency folder is copied.',
    'The generation response is authored and intercepted. The preview artifact route, native download, exact saved-file opening and inline learner runtime are actual selected behavior.',
    'The app initializes its anonymous modules/in-memory seeds; no session cookie means the reviewed guest path returns before repository lookup. Browser guards are not a server-side network sandbox.',
    'Only runner-local tooling/dependencies are installed without lifecycle scripts. No apt, sudo, database setup, provider credentials, model calls or Next production build is used.',
    'The owned Next server receives an intentional graceful SIGTERM after browser completion. That expected shutdown is qualified separately from foreground command exit-zero requirements.',
    'Original process groups, same-UID new PID starttimes and root-attributed argv/cwd are checked before cleanup. This is scoped task-process evidence, not a host-wide inventory.',
    'Desktop/mobile Chromium emulation and local standalone files do not prove hosted/authenticated persistence, physical devices, all browsers, print fidelity or generation quality.',
  ],
};
const workEnd = Date.now() + 1020000;
let cleanupEnd, interrupted = false, globalExpired = false, baseline, allGzip = 0, browserAttempted = false;
let browserScanUncertain = false, lastBrowserScan = 0;
const browserProcesses = new Map();
const processBaseline = new Map();
let processBaselineReady = false, serverControl, serverTask, serverOutcome, serverError, serverStopRequested = false;
let readinessUncertain = false;
let exported = [], exportDirectoryIdentities = new Map();
const active = new Set(), activeHttp = new Set(), handlers = new Map();
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  const handler = () => { interrupted = true; for (const child of active) child.stop('interrupted'); for (const request of activeHttp) request.abort(); };
  handlers.set(signal, handler); process.on(signal, handler);
}
const globalTimer = setTimeout(() => { globalExpired = true; for (const child of active) child.stop('global_deadline'); for (const request of activeHttp) request.abort(); }, Math.max(1, workEnd + 90000 - Date.now()));
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
function owner() {
  const current = fs.lstatSync(root), marker = path.join(root, 'owner');
  need(path.dirname(root) === parent && current.isDirectory() && !current.isSymbolicLink() && current.dev === identity.dev && current.ino === identity.ino
    && current.uid === process.getuid() && fs.lstatSync(marker).uid === process.getuid()
    && !fs.lstatSync(marker).isSymbolicLink() && fs.readFileSync(marker, 'utf8') === nonce, 'scratch_identity_changed');
}
function read(file, maximum = 16777216) {
  const before = fs.lstatSync(file); need(before.isFile() && !before.isSymbolicLink() && before.size <= maximum, 'file_type_or_bound');
  const bytes = fs.readFileSync(file), after = fs.lstatSync(file);
  need(before.dev === after.dev && before.ino === after.ino && before.size === after.size && before.mtimeMs === after.mtimeMs
    && before.ctimeMs === after.ctimeMs && bytes.length === before.size, 'file_changed'); return bytes;
}
function scrub(value, maximum = 700) {
  let text = String(value ?? '').replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '');
  for (const [from, to] of [[root, '[scratch]'], [repo, '[repository]'], [process.env.HOME, '[runner-home]']]) if (from) text = text.split(from).join(to);
  return Buffer.from(text).subarray(0, maximum).toString('utf8');
}
function compressed(bytes, maximum = 131072) {
  const zip = gzipSync(bytes); need(zip.length <= maximum, 'raw_gzip_limit');
  return { encoding: 'gzip-base64', bytes: bytes.length, sha256: sha(bytes), compressedBytes: zip.length, data: zip.toString('base64') };
}
function groupAbsent(pid) { try { process.kill(-pid, 0); return false; } catch (error) { return error.code === 'ESRCH' ? true : null; } }
function proc(pid) {
  const base = `/proc/${pid}`, item = fs.statSync(base);
  if (item.uid !== process.getuid()) return null;
  const before = readProc(path.join(base, 'stat'), 8192).toString(), close = before.lastIndexOf(')');
  need(close > 0, 'proc_stat_shape');
  const fields = before.slice(close + 2).trim().split(/\s+/);
  need(fields.length >= 20 && /^\d+$/.test(fields[19]), 'proc_stat_shape');
  if (processBaselineReady && processBaseline.get(pid) === fields[19]) return null;
  const args = readProc(path.join(base, 'cmdline'), 65536).toString().split('\0').filter(Boolean);
  const cwd = fs.readlinkSync(path.join(base, 'cwd'));
  const after = readProc(path.join(base, 'stat'), 8192).toString(), afterClose = after.lastIndexOf(')');
  need(afterClose > 0 && after.slice(afterClose + 2).trim().split(/\s+/)[19] === fields[19], 'proc_identity_changed');
  const owned = args.some(arg => arg === root || arg.startsWith(root + '/') || arg.includes('=' + root + '/'))
    || cwd === root || cwd.startsWith(root + '/')
    || browserProcesses.has(pid + ':' + fields[19]);
  return { pid, ppid: Number(fields[1]), pgid: Number(fields[2]), session: Number(fields[3]), state: fields[0],
    starttime: fields[19], owned, cwdInsideOwnedRoot: cwd === root || cwd.startsWith(root + '/'),
    executable: args.length ? path.basename(args[0].trim().split(/\s+/)[0]).slice(0, 80) : '' };
}
function snapshotProcessBaseline() {
  const names = fs.readdirSync('/proc').filter(name => /^\d+$/.test(name)); need(names.length <= 8192, 'proc_inventory_bound');
  for (const name of names) {
    try {
      const base = '/proc/' + name; if (fs.statSync(base).uid !== process.getuid()) continue;
      const text = readProc(path.join(base, 'stat'), 8192).toString(), fields = text.slice(text.lastIndexOf(')') + 2).trim().split(/\s+/);
      need(fields.length >= 20 && /^\d+$/.test(fields[19]), 'proc_stat_shape'); processBaseline.set(Number(name), fields[19]);
    } catch (error) { if (!['ENOENT', 'ESRCH'].includes(error.code)) throw error; }
  }
  processBaselineReady = true; report.runtime.preexistingSameUidPidIdentities = processBaseline.size;
}
function readProc(file, maximum) {
  const fd = fs.openSync(file, 'r');
  try { const buffer = Buffer.alloc(maximum + 1), length = fs.readSync(fd, buffer, 0, buffer.length, 0); need(length <= maximum, 'proc_read_bound'); return buffer.subarray(0, length); }
  finally { fs.closeSync(fd); }
}
function scanBrowsers(force = false) {
  if (!processBaselineReady || (!force && Date.now() - lastBrowserScan < 500)) return [];
  lastBrowserScan = Date.now(); const names = fs.readdirSync('/proc').filter(name => /^\d+$/.test(name));
  need(names.length <= 8192, 'proc_inventory_bound'); const present = [];
  for (const name of names) {
    const pid = Number(name); if (pid === process.pid) continue;
    try {
      const item = proc(pid); if (!item?.owned) continue;
      // The command supervisor owns its own process group; this supplementary
      // inventory records detached browser descendants without logging argv.
      const key = item.pid + ':' + item.starttime;
      if (!browserProcesses.has(key)) browserProcesses.set(key, { ...item, firstSeenAtUtc: new Date().toISOString() });
      need(browserProcesses.size <= 256, 'browser_process_inventory_bound');
      present.push(item);
    } catch (error) {
      if (!['ENOENT', 'ESRCH'].includes(error.code)) browserScanUncertain = true;
    }
  }
  return present;
}
async function cleanupBrowsers() {
  owner(); const graceEnd = Math.min(Date.now() + 2000, cleanupEnd - 17000); let present = scanBrowsers(true), termSent = 0, killSent = 0;
  while (present.length && Date.now() < graceEnd) { await pause(100); present = scanBrowsers(true); }
  const started = Date.now();
  while (present.length && Date.now() - started < 6500 && Date.now() < cleanupEnd - 10000) {
    for (const item of present) {
      try {
        const current = proc(item.pid);
        need(current?.owned && current.starttime === item.starttime, 'browser_pid_identity_changed');
        const signal = Date.now() - started >= 3000 ? 'SIGKILL' : 'SIGTERM';
        process.kill(item.pid, signal); if (signal === 'SIGKILL') killSent++; else termSent++;
      } catch (error) { if (!['ENOENT', 'ESRCH'].includes(error.code)) browserScanUncertain = true; }
    }
    await pause(100); present = scanBrowsers(true);
  }
  const stillPresent = scanBrowsers(true);
  report.browserProcessCleanup = { passed: !browserScanUncertain && stillPresent.length === 0 && termSent === 0 && killSent === 0,
    basis: 'New/reused same-UID kernel PID identities, positive owned-root argv or cwd attribution, then starttime revalidation; preexisting identities excluded and no argv/cwd contents retained.',
    observed: [...browserProcesses.values()], remaining: stillPresent, termSent, killSent, scanUncertain: browserScanUncertain };
  need(report.browserProcessCleanup.passed, 'browser_process_cleanup_unverified');
}
async function run(label, executable, args, seconds, { cleanup = false, retainFailure = false, cwd = repo, postScratch = false } = {}) {
  if (postScratch) need(cleanup && report.scratchCleanup === 'passed' && !fs.existsSync(root), 'scratch_postguard_invalid'); else owner();
  need(cleanup || (!interrupted && !globalExpired), 'interrupted_before_command');
  const end = cleanup ? cleanupEnd : workEnd, remaining = end - Date.now() - 6500;
  need(remaining > 0, 'command_budget_exhausted');
  const commandEnv = postScratch ? { PATH: env.PATH, HOME: env.HOME, LANG: env.LANG, TZ: env.TZ,
    GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_TERMINAL_PROMPT: '0', GIT_OPTIONAL_LOCKS: '0' } : env;
  const started = Date.now(), child = spawn(executable, args, { cwd, env: commandEnv, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
  const chunks = [[], []], count = [0, 0], size = [0, 0], digest = [createHash('sha256'), createHash('sha256')], eof = [false, false];
  let exitCode = null, signal = null, exited = false, closed = false, reason = null, stopAt = null, termSent = false, killSent = false, forcedDrain = false, captureFinished = false;
  const control = { pid: child.pid, stop(why) {
    if (!reason) { reason = why; stopAt = Date.now(); }
    if (!termSent && child.pid) { termSent = true; try { process.kill(-child.pid, 'SIGTERM'); } catch {} }
  } };
  if (label === 'next_server') serverControl = control;
  active.add(control);
  child.once('error', () => { control.stop('spawn_failed'); });
  child.once('exit', (code, received) => { exited = true; exitCode = code; signal = received; });
  child.once('close', () => { closed = true; });
  [child.stdout, child.stderr].forEach((stream, index) => {
    stream.once('end', () => { eof[index] = true; });
    stream.on('data', bytes => {
      if (captureFinished) return;
      count[index] += bytes.length; digest[index].update(bytes);
      const kept = bytes.subarray(0, Math.max(0, STREAM_LIMIT - size[index])); chunks[index].push(kept); size[index] += kept.length;
      if (count[index] > STREAM_LIMIT) control.stop('output_limit');
    });
  });
  let leaderClosedAt = null;
  while (true) {
    try { scanBrowsers(); } catch { browserScanUncertain = true; }
    if (label === 'browser_cases' && (serverOutcome || serverError)) control.stop('server_exited_during_browser');
    const now = Date.now(), absent = child.pid ? groupAbsent(child.pid) : true;
    if (closed && leaderClosedAt === null) leaderClosedAt = now;
    if (interrupted && !cleanup) control.stop('interrupted');
    if (now - started >= Math.min(seconds * 1000, remaining)) control.stop('timeout');
    if (closed && exited && eof.every(Boolean) && absent === true) break;
    if (closed && !child.pid) break;
    if (leaderClosedAt !== null && absent !== true && now - leaderClosedAt >= 1500) control.stop('process_group_remaining');
    if (stopAt !== null && now - stopAt >= 3000 && !killSent && child.pid && absent !== true) {
      killSent = true; try { process.kill(-child.pid, 'SIGKILL'); } catch {}
    }
    if (stopAt !== null && now - stopAt >= 6000) {
      forcedDrain = !closed || !eof.every(Boolean);
      if (forcedDrain) { child.stdout.destroy(); child.stderr.destroy(); }
      break;
    }
    await pause(25);
  }
  captureFinished = true; const output = chunks.map(parts => Buffer.concat(parts));
  const row = { label, args: [executable === process.execPath ? '[node]' : scrub(executable, 250), ...args.map(value => scrub(value, 250))],
    exitCode, signal, stopReason: reason, exitObservedAndReaped: exited, closeObserved: closed, pipesEOF: [...eof],
    forcedDrain, originalProcessGroupAbsent: child.pid ? groupAbsent(child.pid) : true, termSent, killSent, durationMs: Date.now() - started,
    streams: output.map((bytes, index) => {
      const raw = compressed(bytes); allGzip += raw.compressedBytes;
      return { name: index ? 'stderr' : 'stdout', observedBytes: count[index], observedSha256: digest[index].digest('hex'),
        complete: closed && eof[index] && count[index] === bytes.length && !forcedDrain, raw, head: scrub(bytes.toString(), 500), tail: scrub(bytes.subarray(Math.max(0, bytes.length - 700)).toString(), 700) };
    }) };
  row.released = exited && closed && eof.every(Boolean) && !forcedDrain && row.originalProcessGroupAbsent === true;
  report.commands.push(row); active.delete(control);
  need(allGzip <= 524288, 'all_streams_gzip_limit');
  row.intentionalServerStop = label === 'next_server' && serverStopRequested && row.stopReason === 'expected_server_stop';
  const exitAccepted = label === 'next_server'
    ? row.intentionalServerStop && row.termSent && !row.killSent && (row.exitCode === 0 || (row.exitCode === null && row.signal === 'SIGTERM'))
    : row.exitCode === 0 && row.signal === null && row.stopReason === null;
  const accepted = exitAccepted && row.released && row.streams.every(stream => stream.complete);
  if (!retainFailure) need(accepted, label + '_failed');
  return { output, row, accepted };
}
function parseGit(bytes, index) {
  const rows = new Map();
  for (const record of bytes.toString().split('\0').filter(Boolean)) {
    const tab = record.indexOf('\t'), header = record.slice(0, tab).split(' '), name = record.slice(tab + 1);
    need(tab > 0 && name && !path.isAbsolute(name) && !name.split('/').some(part => !part || part === '.' || part === '..') && !rows.has(name), 'git_entry_invalid');
    need(index ? header[2] === '0' : header[1] === 'blob', 'git_entry_type'); rows.set(name, { mode: header[0], gitBlob: header[index ? 1 : 2] });
  }
  return rows;
}
function fileVector(name) {
  const file = path.join(repo, name);
  for (let current = path.dirname(file); current !== repo; current = path.dirname(current)) {
    const item = fs.lstatSync(current); need(item.isDirectory() && !item.isSymbolicLink(), 'tracked_ancestor_changed');
  }
  const before = fs.lstatSync(file), mode = before.isSymbolicLink() ? '120000' : before.isFile() ? (before.mode & 0o111 ? '100755' : '100644') : null;
  need(mode, 'tracked_type_invalid');
  const bytes = before.isSymbolicLink() ? fs.readlinkSync(file, { encoding: 'buffer' }) : read(file), after = fs.lstatSync(file);
  need(before.dev === after.dev && before.ino === after.ino && before.size === after.size && before.mtimeMs === after.mtimeMs && before.ctimeMs === after.ctimeMs, 'tracked_file_changed');
  return { path: name, mode, gitBlob: gitBlob(bytes), bytes: bytes.length, sha256: sha(bytes) };
}
async function guard(label, cleanup = false, postScratch = false) {
  const result = { label, passed: false }; report.guards.push(result); const options = { cleanup, postScratch };
  need((await run(label + '_head', 'git', ['rev-parse', 'HEAD'], 10, options)).output[0].toString().trim() === sourceCommit, 'head_changed');
  need(!fs.existsSync(path.join(repo, ACTIVE)), 'active_workflow_in_source');
  const tree = parseGit((await run(label + '_tree', 'git', ['ls-tree', '-r', '-z', 'HEAD'], 10, options)).output[0], false);
  need(tree.get('.github/workflows/ci.yml')?.gitBlob === EXISTING_CI_BLOB, 'existing_ci_changed');
  const index = parseGit((await run(label + '_index', 'git', ['ls-files', '--stage', '-z'], 10, options)).output[0], true);
  need(tree.size > 0 && index.size === tree.size, 'tracked_count_changed');
  const vector = [];
  for (const [name, item] of tree) {
    const value = fileVector(name); need(index.get(name)?.mode === item.mode && index.get(name)?.gitBlob === item.gitBlob
      && value.mode === item.mode && value.gitBlob === item.gitBlob, 'full_tracked_source_changed'); vector.push(value);
  }
  need((await run(label + '_status', 'git', ['status', '--porcelain=v1', '-z', '--untracked-files=all'], 10, options)).output[0].length === 0, 'worktree_not_clean');
  await run(label + '_diff', 'git', ['-c', 'core.filemode=true', 'diff', '--no-ext-diff', '--no-textconv', '--quiet', '--exit-code', 'HEAD', '--'], 10, options);
  const ignored = (await run(label + '_ignored', 'git', ['status', '--porcelain=v1', '-z', '--ignored=matching', '--untracked-files=normal'], 10, options)).output[0];
  need(ignored.length === 0, 'repository_generated_output');
  if (!baseline) { baseline = vector; report.sourceFiles = vector; }
  need(JSON.stringify(vector) === JSON.stringify(baseline), 'source_vector_changed');
  Object.assign(result, { passed: true, trackedFiles: vector.length, sourceBytes: vector.reduce((sum, file) => sum + file.bytes, 0),
    vectorSha256: sha(JSON.stringify(vector)), fullHeadIndexModesAndBytes: true, noUntrackedOrIgnoredOutput: true });
}
const RUNTIME_ROOTS = ['app', 'components', 'hooks', 'lib', 'packages', 'convex', 'public'];
const RUNTIME_CONFIGS = new Set(['package.json', 'package-lock.json', 'tsconfig.json', 'next.config.ts', 'next-env.d.ts', 'postcss.config.mjs', 'components.json']);
const ownedDirectoryIdentities = new Map(['tools', 'tmp', 'cache', 'config', 'browsers', 'app', 'downloads', 'output'].map(name => {
  const value = fs.lstatSync(path.join(root, name)); return [name, { dev: value.dev, ino: value.ino }];
}));
function exportRuntime() {
  const chosen = baseline.filter(item => RUNTIME_CONFIGS.has(item.path)
    || RUNTIME_ROOTS.some(name => item.path.startsWith(name + '/')) && !/\.md$/i.test(item.path));
  need(chosen.length > 0 && chosen.reduce((total, item) => total + item.bytes, 0) <= 16777216, 'runtime_export_bound');
  need(chosen.some(item => item.path === 'package-lock.json') && chosen.some(item => item.path === 'app/page.tsx')
    && chosen.some(item => item.path === 'app/api/visualizations/artifact/route.ts'), 'runtime_export_incomplete');
  const aliases = new Set();
  for (const item of chosen) {
    need(['100644', '100755'].includes(item.mode), 'runtime_export_symlink');
    const bytes = read(path.join(repo, item.path)); need(bytes.length === item.bytes && sha(bytes) === item.sha256 && gitBlob(bytes) === item.gitBlob, 'runtime_export_source_changed');
    if (/\.[cm]?[jt]sx?$/.test(item.path)) {
      for (const match of bytes.toString().matchAll(/(?:from\s*|import\s*\(\s*|import\s*)['"]@\/([^/'"]+)/g)) aliases.add(match[1]);
    }
    let folder = app;
    for (const part of path.dirname(item.path).split('/').filter(part => part !== '.')) {
      folder = path.join(folder, part);
      if (!fs.existsSync(folder)) fs.mkdirSync(folder, { mode: 0o700 });
      const current = fs.lstatSync(folder); need(current.isDirectory() && !current.isSymbolicLink() && current.uid === process.getuid(), 'runtime_export_ancestor');
      exportDirectoryIdentities.set(folder, { dev: current.dev, ino: current.ino });
    }
    const target = path.join(app, item.path); fs.writeFileSync(target, bytes, { flag: 'wx', mode: item.mode === '100755' ? 0o755 : 0o644 });
  }
  need([...aliases].every(name => RUNTIME_ROOTS.includes(name)), 'runtime_alias_root_missing');
  exported = chosen.map(item => ({ ...item }));
  report.runtimeExport = { kind: 'exact-runtime-input-subset', fileCount: exported.length, totalBytes: exported.reduce((sum, item) => sum + item.bytes, 0),
    byteLimit: 16777216, aliases: [...aliases].sort(), files: exported, guards: [],
    qualification: 'Runtime sources/configuration and the existing frozen npm lock only; no Git history, docs/evidence, old tests or existing dependencies are copied.' };
  verifyRuntimeExport('before_tool_work');
}
function verifyRuntimeExport(label) {
  owner(); need(exported.length > 0, 'runtime_export_missing');
  for (const [folder, expected] of exportDirectoryIdentities) {
    const item = fs.lstatSync(folder); need(item.isDirectory() && !item.isSymbolicLink() && item.uid === process.getuid()
      && item.dev === expected.dev && item.ino === expected.ino, 'runtime_export_directory_changed');
  }
  for (const expected of exported) {
    const file = path.join(app, expected.path), item = fs.lstatSync(file);
    need(item.isFile() && !item.isSymbolicLink() && item.uid === process.getuid()
      && (item.mode & 0o111 ? '100755' : '100644') === expected.mode, 'runtime_export_mode_changed');
    const bytes = read(file); need(bytes.length === expected.bytes && sha(bytes) === expected.sha256 && gitBlob(bytes) === expected.gitBlob, 'runtime_export_input_changed');
  }
  report.runtimeExport.guards.push({ label, passed: true, files: exported.length, vectorSha256: sha(JSON.stringify(exported)) });
}
function materializeBrowser() {
  const folder = path.dirname(specFile); fs.mkdirSync(path.dirname(folder), { mode: 0o700 }); fs.mkdirSync(folder, { mode: 0o700 });
  report.generated = [];
  for (const [source, target, expected] of [[SPEC, specFile, SPEC_SHA], [CONFIG, configFile, CONFIG_SHA]]) {
    const bytes = read(path.join(repo, source), 262144); need(sha(bytes) === expected, 'browser_source_hash');
    fs.writeFileSync(target, bytes, { flag: 'wx', mode: 0o600 });
    need(read(target, 262144).equals(bytes), 'browser_materialization_changed');
    const item = fs.lstatSync(target);
    report.generated.push({ source, target: 'app/tests/tmp/' + path.basename(target), bytes: bytes.length, sha256: sha(bytes), dev: item.dev, ino: item.ino });
  }
  need(!fs.existsSync(resultFile) && !fs.existsSync(outputDirectory), 'browser_output_preexisting');
}
function verifyMaterialized() {
  for (const row of report.generated ?? []) {
    const target = path.join(root, row.target), item = fs.lstatSync(target), bytes = read(target, 262144);
    need(item.isFile() && !item.isSymbolicLink() && item.uid === process.getuid() && item.dev === row.dev && item.ino === row.ino
      && bytes.length === row.bytes && sha(bytes) === row.sha256, 'materialized_browser_changed');
  }
}
async function portFree(label) {
  const probe = net.createServer(socket => socket.destroy()); let timer;
  try {
    await new Promise((resolve, reject) => {
      timer = setTimeout(() => reject(new Error('loopback_port_probe_timeout')), 2000);
      probe.once('error', () => reject(new Error('loopback_port_not_free')));
      probe.listen({ host: '127.0.0.1', port: 3100, exclusive: true }, () => probe.close(error => error ? reject(error) : resolve()));
    });
    (report.portChecks ??= []).push({ label, host: '127.0.0.1', port: 3100, unbound: true });
  } finally { clearTimeout(timer); if (probe.listening) await new Promise(resolve => probe.close(resolve)); }
}
function ownedServerAlive() {
  need(serverControl?.pid && !serverOutcome && !serverError, 'owned_server_not_alive');
  const item = proc(serverControl.pid); need(item?.owned && item.cwdInsideOwnedRoot, 'owned_server_identity_missing');
  return { pid: item.pid, starttime: item.starttime, executable: item.executable };
}
async function waitForServer() {
  const end = Math.min(Date.now() + 180000, workEnd - 667000);
  need(end > Date.now(), 'server_readiness_window_unavailable');
  let last = 'no_response';
  while (Date.now() < end) {
    ownedServerAlive();
    const abort = new AbortController(); activeHttp.add(abort); const timer = setTimeout(() => abort.abort(), 5000); let response;
    try {
      response = await fetch(ORIGIN + '/', { redirect: 'error', credentials: 'omit', cache: 'no-store', signal: abort.signal });
      const status = response.status;
      const cancelled = !response.body || await Promise.race([response.body.cancel().then(() => true, () => false), pause(1000).then(() => false)]);
      if (!cancelled) readinessUncertain = true;
      need(cancelled, 'readiness_body_cleanup_unverified'); ownedServerAlive();
      if (status === 200) { report.serverReadiness = { status, origin: ORIGIN, anonymous: true, readerReleased: true, owner: ownedServerAlive() }; return; }
      last = 'status_' + status;
    } catch { last = 'readiness_request_failed'; }
    finally { clearTimeout(timer); abort.abort(); activeHttp.delete(abort); }
    await pause(250);
  }
  throw new Error(last === 'no_response' ? 'server_readiness_timeout' : 'server_readiness_failed');
}
async function stopServer() {
  if (!serverTask) return;
  if (!serverOutcome && !serverError) { serverStopRequested = true; serverControl.stop('expected_server_stop'); }
  await Promise.race([serverTask, pause(Math.max(1, Math.min(10000, cleanupEnd - Date.now() - 15000)))]);
  need(!serverError && serverOutcome, 'server_teardown_unsettled');
  report.server = { accepted: serverOutcome.accepted, intentionalStop: serverStopRequested, command: 'next_server',
    qualification: 'The controller intentionally requests graceful SIGTERM after the browser command. Exit zero or direct SIGTERM is accepted only with complete pipes, reaping, original-group absence and no KILL.' };
  need(serverOutcome.accepted, 'server_teardown_failed');
}
async function chromiumLibraries() {
  const pending = [path.join(root, 'browsers')], found = []; let seen = 0;
  while (pending.length) {
    const folder = pending.pop();
    for (const item of fs.readdirSync(folder, { withFileTypes: true })) {
      need(++seen <= 8192, 'browser_install_inventory_bound');
      const file = path.join(folder, item.name);
      if (item.isDirectory()) pending.push(file);
      else if (item.isFile() && item.name === 'chrome-headless-shell') found.push(file);
    }
  }
  need(found.length === 1, 'headless_chromium_binary_missing');
  const file = found[0], before = fs.lstatSync(file); need(before.isFile() && !before.isSymbolicLink() && before.uid === process.getuid() && before.size <= 536870912, 'headless_binary_identity');
  const hash = createHash('sha256'), fd = fs.openSync(file, 'r'), buffer = Buffer.alloc(65536); let bytes = 0;
  try {
    while (true) {
      const length = fs.readSync(fd, buffer, 0, buffer.length, null); if (!length) break;
      if (!bytes) need(buffer[0] === 0x7f && buffer[1] === 0x45 && buffer[2] === 0x4c && buffer[3] === 0x46, 'headless_binary_not_elf');
      bytes += length; need(bytes <= 536870912, 'headless_binary_bound'); hash.update(buffer.subarray(0, length));
    }
  } finally { fs.closeSync(fd); }
  const after = fs.lstatSync(file); need(before.dev === after.dev && before.ino === after.ino && before.size === after.size
    && before.mtimeMs === after.mtimeMs && before.ctimeMs === after.ctimeMs && bytes === before.size, 'headless_binary_changed');
  const linked = await run('headless_shared_libraries', '/usr/bin/ldd', [file], 30, { cwd: tools });
  need(linked.output[0].length > 0 && !/\bnot found\b/i.test(Buffer.concat(linked.output).toString()), 'headless_shared_library_missing');
  report.runtime.headlessChromium = { bytes, sha256: hash.digest('hex'), sharedLibrariesPassed: true, lddStdoutSha256: sha(linked.output[0]),
    qualification: 'The installed default headless-shell ELF resolves against preinstalled runner libraries. Actual Playwright browser launch remains mandatory.' };
}


function exactKeys(value, keys, code) {
  need(value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).sort().join(',') === [...keys].sort().join(','), code);
}
function readBoundary(attachment) {
  need(attachment.contentType === 'application/json' && typeof attachment.body === 'string' && attachment.body.length <= 21848, 'browser_boundary_attachment');
  const bytes = Buffer.from(attachment.body, 'base64');
  need(bytes.toString('base64') === attachment.body && bytes.length <= 16384, 'browser_boundary_body');
  return { bytes: bytes.length, sha256: sha(bytes), value: JSON.parse(bytes.toString()) };
}
function diagnosticMetadata(attachment) {
  need(attachment.name === 'error-context' && attachment.contentType === 'text/markdown' && typeof attachment.path === 'string'
    && path.basename(attachment.path) === 'error-context.md' && attachment.body === undefined, 'browser_extra_attachment');
  const file = path.resolve(attachment.path); need(file.startsWith(outputDirectory + '/'), 'diagnostic_path_outside_output');
  for (let at = path.dirname(file); at !== path.join(root, 'output'); at = path.dirname(at)) {
    const item = fs.lstatSync(at); need(item.isDirectory() && !item.isSymbolicLink() && item.uid === process.getuid(), 'diagnostic_ancestor_identity');
  }
  const item = fs.lstatSync(file); need(item.isFile() && !item.isSymbolicLink() && item.uid === process.getuid() && item.size <= 1048576, 'diagnostic_file_metadata');
  return { name: attachment.name, contentType: attachment.contentType, bytes: item.size, contentsRetained: false };
}
function validateBoundary(item, title, project) {
  exactKeys(item, ['kind', 'schemaVersion', 'profile', 'title', 'generation', 'artifact', 'downloads', 'standalone', 'boundary', 'cleanup'], 'boundary_shape');
  need(item.kind === 'iv-course-export-boundary' && item.schemaVersion === 1 && item.profile === project && item.title === title, 'boundary_case_identity');
  const first = title === TITLES[0];
  exactKeys(item.generation, ['authoredResponses'], 'boundary_generation_shape');
  exactKeys(item.artifact, ['requests', 'realRequests', 'controlled503s'], 'boundary_artifact_shape');
  need(item.generation.authoredResponses === 1 && item.artifact.requests === (first ? 1 : 2)
    && item.artifact.realRequests === 1 && item.artifact.controlled503s === (first ? 0 : 1), 'boundary_actual_artifact');
  need(Array.isArray(item.downloads) && item.downloads.length === 1, 'boundary_download_count');
  for (const file of item.downloads) {
    exactKeys(file, ['filename', 'bytes', 'sha256'], 'boundary_download_shape');
    need(file.filename === 'course-authored-course-resume.html' && Number.isSafeInteger(file.bytes) && file.bytes > 0 && file.bytes <= 8388608
      && /^[a-f0-9]{64}$/.test(file.sha256), 'boundary_download_bytes');
  }
  exactKeys(item.standalone, ['contextsCreated', 'opened', 'fileLoads', 'finalRuntime'], 'boundary_standalone_shape');
  need(item.standalone.contextsCreated === (first ? 1 : 0) && item.standalone.opened === (first ? 1 : 0)
    && item.standalone.fileLoads === (first ? 2 : 0), 'boundary_standalone_count');
  if (first) {
    exactKeys(item.standalone.finalRuntime, ['heading', 'quizFeedbackHidden', 'completionPressed'], 'boundary_runtime_shape');
    need(item.standalone.finalRuntime.heading === 'Authored / Course: Résumé?' && item.standalone.finalRuntime.quizFeedbackHidden === true
      && item.standalone.finalRuntime.completionPressed === 'false', 'boundary_standalone_runtime');
  } else need(item.standalone.finalRuntime === null, 'boundary_unexpected_standalone');
  exactKeys(item.boundary, ['allowedReads', 'developmentWebSockets', 'blockedWebSockets', 'unexpectedCount', 'unexpected', 'pageErrorCount', 'pageErrors'], 'boundary_network_shape');
  need(Number.isSafeInteger(item.boundary.allowedReads) && item.boundary.allowedReads > 0 && item.boundary.allowedReads <= 10000
    && Number.isSafeInteger(item.boundary.developmentWebSockets) && item.boundary.developmentWebSockets >= 0
    && item.boundary.blockedWebSockets === 0 && item.boundary.unexpectedCount === 0 && Array.isArray(item.boundary.unexpected)
    && item.boundary.unexpected.length === 0 && item.boundary.pageErrorCount === 0 && Array.isArray(item.boundary.pageErrors)
    && item.boundary.pageErrors.length === 0, 'boundary_network_or_page_error');
  exactKeys(item.cleanup, ['pageClosed', 'standaloneContextsClosed', 'downloadsDeleted', 'directoriesCreated', 'directoriesRemoved', 'failures', 'passed'], 'boundary_cleanup_shape');
  need(item.cleanup.pageClosed === true && item.cleanup.standaloneContextsClosed === (first ? 1 : 0) && item.cleanup.downloadsDeleted === 1
    && item.cleanup.directoriesCreated === 1 && item.cleanup.directoriesRemoved === 1 && Array.isArray(item.cleanup.failures)
    && item.cleanup.failures.length === 0 && item.cleanup.passed === true, 'boundary_owned_cleanup');
}
function browserResults() {
  need(fs.existsSync(resultFile), 'browser_json_missing');
  const bytes = read(resultFile, BROWSER_LIMIT), raw = compressed(bytes); allGzip += raw.compressedBytes;
  report.browser = { accepted: false, raw, cases: [], rawBytes: bytes.length, rawSha256: sha(bytes) };
  need(allGzip <= 524288, 'all_streams_gzip_limit');
  const value = JSON.parse(bytes.toString()), cases = report.browser.cases;
  report.browser.stats = value.stats; report.browser.errors = value.errors;
  let suitesSeen = 0;
  const walk = suites => {
    need(Array.isArray(suites), 'browser_suite_shape');
    for (const suite of suites) {
      need(++suitesSeen <= 32 && Array.isArray(suite.specs) && (suite.suites === undefined || Array.isArray(suite.suites)), 'browser_suite_shape');
      for (const spec of suite.specs) {
        need(Array.isArray(spec.tests), 'browser_spec_shape');
        for (const test of spec.tests) {
          need(cases.length < 16 && Array.isArray(test.results), 'browser_test_shape');
          const row = { title: spec.title, project: test.projectName, expectedStatus: test.expectedStatus, status: test.status,
            results: test.results.map(result => ({ status: result.status, retry: result.retry, errors: result.errors ?? [] })), boundary: null, diagnostics: [] };
          cases.push(row);
          for (const result of test.results) {
            need(Array.isArray(result.attachments), 'browser_attachment_shape');
            const boundaries = result.attachments.filter(item => item.name === 'iv-course-export-boundary');
            if (boundaries.length === 1) row.boundary = readBoundary(boundaries[0]);
            need(boundaries.length === 1, 'browser_boundary_count');
            for (const attachment of result.attachments.filter(item => item.name !== 'iv-course-export-boundary')) {
              need(result.status !== 'passed', 'passed_case_extra_attachment'); row.diagnostics.push(diagnosticMetadata(attachment));
            }
          }
        }
      }
      walk(suite.suites ?? []);
    }
  };
  walk(value.suites);
  need(Array.isArray(value.errors) && value.errors.length === 0 && value.stats?.expected === 4 && value.stats?.unexpected === 0
    && value.stats?.flaky === 0 && value.stats?.skipped === 0, 'browser_global_failure');
  const expected = new Set(PROJECTS.flatMap(project => TITLES.map(title => project + ':' + title))), seen = new Set();
  need(cases.length === 4, 'browser_case_count');
  for (const row of cases) {
    const key = row.project + ':' + row.title; need(expected.has(key) && !seen.has(key), 'browser_case_identity'); seen.add(key);
    need(row.expectedStatus === 'passed' && row.status === 'expected' && row.results.length === 1
      && row.results[0].status === 'passed' && row.results[0].retry === 0 && row.results[0].errors.length === 0, 'browser_case_failure');
    validateBoundary(row.boundary.value, row.title, row.project);
  }
  report.browser.accepted = true;
}


try {
  snapshotProcessBaseline();
  await guard('before');
  const packageSource = JSON.parse(read(path.join(repo, 'package.json'), 32768));
  need(packageSource.name === 'intelligent-visualization' && packageSource.dependencies?.next === '16.1.6'
    && !packageSource.dependencies?.['@playwright/test'] && !packageSource.devDependencies?.['@playwright/test'], 'package_scope_changed');
  exportRuntime();
  report.runtime.nodeSha256 = sha(read(process.execPath, 268435456));
  const npm = fs.realpathSync(path.join(path.dirname(process.execPath), 'npm'));
  report.runtime.npmCliSha256 = sha(read(npm, 1048576));
  report.runtime.npm = (await run('npm_version', process.execPath, [npm, '--version'], 15, { cwd: tools })).output[0].toString().trim();
  await run('install_frozen_app_dependencies', process.execPath, [npm, 'ci', '--ignore-scripts', '--no-audit', '--no-fund', '--include=dev'], 240, { cwd: app });
  verifyRuntimeExport('after_frozen_npm_ci');
  report.runtime.applicationPackages = ['next', 'react', 'typescript'].map(name => {
    const bytes = read(path.join(app, 'node_modules', name, 'package.json'), 65536), value = JSON.parse(bytes);
    need(value.name === name && typeof value.version === 'string', 'installed_app_package_invalid');
    if (name === 'next') need(value.version === '16.1.6', 'installed_next_version_changed');
    return { name, version: value.version, packageJsonSha256: sha(bytes) };
  });
  await run('install_browser_tool', process.execPath, [npm, 'install', '--prefix', tools, '--no-save', '--package-lock=false', '--ignore-scripts', '--no-audit', '--no-fund', '@playwright/test@1.64.1'], 120, { cwd: tools });
  report.runtime.toolPackages = ['@playwright/test', 'playwright', 'playwright-core'].map(name => {
    const bytes = read(path.join(tools, 'node_modules', name, 'package.json'), 32768), value = JSON.parse(bytes);
    need(value.name === name && value.version === '1.64.1', 'browser_tool_version'); return { name, version: value.version, packageJsonSha256: sha(bytes) };
  });
  const cli = path.join(tools, 'node_modules/@playwright/test/cli.js');
  report.runtime.playwright = '1.64.1'; report.runtime.playwrightCliSha256 = sha(read(cli, 1048576));
  await run('install_headless_chromium', process.execPath, [cli, 'install', '--only-shell', 'chromium'], 180, { cwd: tools });
  await chromiumLibraries();
  materializeBrowser();
  await portFree('before_server');
  const next = path.join(app, 'node_modules/next/dist/bin/next');
  serverTask = run('next_server', process.execPath, [next, 'dev', '--webpack', '--hostname', '127.0.0.1', '--port', '3100'], 1020,
    { cwd: app, retainFailure: true }).then(value => { serverOutcome = value; return value; }, error => { serverError = error; });
  await waitForServer();
  await guard('before_browser');
  ownedServerAlive(); need(workEnd - Date.now() >= 667000, 'browser_window_unavailable'); browserAttempted = true;
  const browser = await run('browser_cases', process.execPath, [cli, 'test', '--config', configFile, '--workers=1', '--retries=0'], 660,
    { cwd: app, retainFailure: true });
  browserResults(); need(browser.accepted, 'browser_cli_failed');
  await guard('after_browser');
} catch (error) { report.errors.push(finite(error)); }
finally {
  cleanupEnd = Math.min(Date.now() + 90000, workEnd + 90000);
  try { await stopServer(); } catch (error) { report.errors.push(finite(error)); }
  try { if (exported.length) verifyRuntimeExport('after_tool_work'); verifyMaterialized(); } catch (error) { report.errors.push(finite(error)); }
  try { await guard('after', true); } catch (error) { report.errors.push(finite(error)); }
  report.processCleanup = { passed: active.size === 0 && report.commands.every(row => row.released), started: report.commands.length };
  for (const request of activeHttp) request.abort();
  report.networkCleanup = { passed: activeHttp.size === 0 && !readinessUncertain,
    basis: 'Bounded anonymous loopback readiness response was consumed or cancelled and released; no host-wide socket inventory.' };
  try { await cleanupBrowsers(); } catch (error) { report.errors.push(finite(error)); }
  try { if (serverTask) await portFree('after_server_and_process_cleanup'); } catch (error) { report.errors.push(finite(error)); }
  try {
    owner(); need(report.processCleanup.passed && report.browserProcessCleanup?.passed === true && report.networkCleanup.passed, 'process_cleanup_unverified');
    if (serverTask) need(report.portChecks?.some(row => row.label === 'after_server_and_process_cleanup' && row.unbound), 'server_port_cleanup_unverified');
    if (browserAttempted) need(report.browser?.raw?.encoding === 'gzip-base64', 'browser_failure_report_not_retained');
    need(fs.readdirSync(path.join(root, 'downloads')).length === 0, 'download_directory_remaining');
    for (const [name, expected] of ownedDirectoryIdentities) {
      const item = fs.lstatSync(path.join(root, name)); need(item.isDirectory() && !item.isSymbolicLink() && item.uid === process.getuid()
        && item.dev === expected.dev && item.ino === expected.ino, 'owned_child_directory_changed');
    }
    fs.rmSync(root, { recursive: true }); need(!fs.existsSync(root), 'scratch_still_present'); report.scratchCleanup = 'passed';
  } catch (error) { report.scratchCleanup = 'unverified'; report.errors.push(finite(error)); }
  try { if (report.scratchCleanup === 'passed') await guard('after_cleanup', true, true); } catch (error) { report.errors.push(finite(error)); }
  report.processCleanup = { passed: active.size === 0 && report.commands.every(row => row.released), started: report.commands.length };
  if (interrupted) report.errors.push('interrupted');
  if (globalExpired || Date.now() > workEnd + 90000) report.errors.push('global_deadline');
  report.interrupted = interrupted; report.completedAtUtc = new Date().toISOString();
  report.status = !report.errors.length && report.browser?.accepted === true && report.processCleanup.passed && report.browserProcessCleanup?.passed === true
    && report.networkCleanup.passed && report.server?.accepted === true && report.runtimeExport?.guards?.length >= 2
    && report.scratchCleanup === 'passed' ? 'passed' : 'failed';
  let text = JSON.stringify(report);
  if (Buffer.byteLength(text) > REPORT_LIMIT) { text = JSON.stringify({ schemaVersion: report.schemaVersion, sourceCommit, status: 'failed', errors: ['report_limit'] }); report.status = 'failed'; }
  const outputTimer = setTimeout(() => { process.stderr.write('controller_stdout_deadline\n'); process.exit(1); }, Math.max(1, Math.min(2000, workEnd + 92000 - Date.now())));
  process.stdout.write('IV_COURSE_BROWSER_REPORT=' + text + '\n', () => {
    clearTimeout(outputTimer); clearTimeout(globalTimer);
    for (const [signal, handler] of handlers) process.removeListener(signal, handler);
    process.exitCode = report.status === 'passed' && !interrupted && !globalExpired && Date.now() <= workEnd + 92000 ? 0 : 1;
  });
}
