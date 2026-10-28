// T2: actual Composer callbacks and mount cleanup with authored state, deferred
// fetch/JSON and timers. No React lifecycle, browser, HTTP route or provider runs.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const repository = fileURLToPath(new URL('../../', import.meta.url));
const load = createRequire(path.join(process.env.IV_TEST_PROJECT_ROOT || repository, 'package.json'));
const ts = load('typescript');
const sourcePath = process.env.IV_EXTRACTION_SOURCE || path.join(repository, 'components/visualizations/composer.tsx');
const source = ts.createSourceFile(sourcePath, readFileSync(sourcePath, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const composer = source.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === 'Composer');
assert.ok(composer?.body, 'The checked callbacks must belong to the actual Composer.');
const declarations = new Map(composer.body.statements.filter(ts.isFunctionDeclaration).map((node) => [node.name?.text, node]));
const required = ['startExtraction', 'handleContinue', 'startOver', 'generationInputSnapshot', 'commitText',
  'useCandidateStyle', 'shuffleStyle', 'skipStyle', 'replaceBatch', 'replaceCourseEditor', 'replaceReportEditor'];
for (const name of required) assert.ok(declarations.has(name), 'Missing actual callback: ' + name);
const constants = new Map(source.statements.filter(ts.isVariableStatement)
  .flatMap((node) => node.declarationList.declarations).map((node) => [node.name.getText(source), node]));
const mounts = composer.body.statements.filter(ts.isExpressionStatement).map((node) => node.expression)
  .filter((node) => ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'useEffect')
  .map((node) => node.arguments[0]).filter((node) => ts.isArrowFunction(node) && ts.isBlock(node.body)
    && node.body.statements.some((statement) => {
      if (!ts.isExpressionStatement(statement) || !ts.isBinaryExpression(statement.expression)) return false;
      const expression = statement.expression;
      return expression.operatorToken.kind === ts.SyntaxKind.EqualsToken
        && expression.left.getText(source) === 'mountedRef.current' && expression.right.kind === ts.SyntaxKind.TrueKeyword;
    }));
assert.equal(mounts.length, 1, 'Use the actual mount effect and its returned cleanup.');
const text = [
  ...['EXTRACTION_TIMEOUT_MS', 'DEFAULT_PROMPT'].map((name) => { assert.ok(constants.has(name)); return 'const ' + constants.get(name).getText(source) + ';'; }),
  ...[...required, ...(declarations.has('invalidateExtraction') ? ['invalidateExtraction'] : [])].map((name) => declarations.get(name).getText(source)),
  'globalThis.mountExtractionOwner = ' + mounts[0].getText(source) + ';',
].join('\n');
const compiled = ts.transpileModule(text, { fileName: sourcePath, reportDiagnostics: true,
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
assert.equal(compiled.diagnostics.length, 0, 'Actual callbacks must transpile without syntax diagnostics.');
const plain = (value) => JSON.parse(JSON.stringify(value));
const flush = () => new Promise(setImmediate);
function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
const A = 'https://a.example.test/source', B = 'https://b.example.test/source';
function payload(label = 'current') {
  return { available: true, markdown: 'Authored context: ' + label,
    brandKit: { colors: { accent: '#24785b' }, logos: ['https://example.test/' + label + '.svg'] },
    proposedTheme: { name: label, background: '#faf9f4', foreground: '#182c26', accent: '#24785b' } };
}

function harness() {
  const requests = [], timers = new Map(), queued = [], writes = [];
  let timerId = 0, queueSetters = false, cleanup;
  const context = vm.createContext({ AbortController, JSON,
    props: { mode: 'guest' }, mountedRef: { current: true }, extractionRef: { current: null },
    generationBusyRef: { current: false }, requestRef: { current: null },
    importEpochRef: { current: 0 }, pendingImportsRef: { current: 0 },
    batchRef: { current: null }, courseEditorRef: { current: null }, reportEditorRef: { current: null },
    style: { status: 'idle' }, detectedUrl: null, pendingText: '', textEntries: [], rawText: '', files: [],
    setStyle(next) {
      const apply = () => {
        const previous = context.style;
        context.style = typeof next === 'function' ? next(previous) : next;
        if (context.style !== previous) writes.push(context.style);
      };
      if (queueSetters && typeof next === 'function') queued.push(apply); else apply();
    },
    setTextEntries(next) { context.textEntries = typeof next === 'function' ? next(context.textEntries) : next; },
    setPendingText(value) { context.pendingText = value; }, setFiles(value) { context.files = value; },
    setStep(value) { context.step = value; }, setError(value) { context.error = value; },
    setImporting() {}, setDismissedUrls() {}, setSelectedKinds() {}, setDraft() {}, setPreviewOpen() {},
    setPreviewResultId() {}, setBatch() {}, setCourseEditing() {}, setReportEditing() {},
    setRecoveryRequired() {}, setStorageNotice() {}, clearGuestDraft() {},
    nextShuffledTheme() { return { name: 'authored shuffled choice', background: '#102e28', foreground: '#f7f6f0', accent: '#dbaf55' }; },
    setTimeout(callback, delay) { const id = ++timerId; timers.set(id, { callback, delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
    fetch(url, init) {
      assert.equal(url, '/api/brand/extract', 'A real or unrelated request is forbidden.');
      const pending = deferred();
      requests.push({ url, init, pending, respond(value = payload()) { pending.resolve({ json: async () => value }); },
        json() { const body = deferred(); pending.resolve({ json: () => body.promise }); return body; } });
      return pending.promise; // Deliberately ignores abort: ownership must reject late work.
    },
  });
  vm.runInContext(compiled.outputText, context, { filename: sourcePath });
  const rt = { context, requests, timers, writes,
    continue(url) { context.detectedUrl = url; context.rawText = url || 'Authored plain source'; context.pendingText = ''; context.handleContinue(); return requests.at(-1); },
    mount() { cleanup = context.mountExtractionOwner(); }, unmount() { assert.equal(typeof cleanup, 'function'); cleanup(); },
    queue(value = true) { queueSetters = value; }, drain() { while (queued.length) queued.shift()(); },
  };
  rt.mount();
  return rt;
}

export function registerComposerExtractionChecks(test) {
  test('Continue requests the chosen URL once with the existing timeout and transport', () => {
    const rt = harness(), request = rt.continue(A);
    assert.equal(request.init.method, 'POST'); assert.deepEqual(plain(request.init.headers), { 'content-type': 'application/json' });
    assert.deepEqual(JSON.parse(request.init.body), { url: A }); assert.equal(request.init.signal.aborted, false);
    assert.equal([...rt.timers.values()][0].delay, 15_000); assert.equal(rt.context.style.status, 'loading');
    assert.equal(rt.context.step, 'configure');
  });
  test('a current successful extraction retains its context and exact candidate', async () => {
    const rt = harness(), value = payload(); rt.continue(A).respond(value); await flush();
    assert.equal(rt.context.style.status, 'ready'); assert.equal(rt.context.style.markdown, value.markdown);
    assert.equal(rt.context.style.candidate, value.proposedTheme); assert.equal(rt.context.style.extracted, value.proposedTheme);
    assert.equal(rt.context.style.decision, null); assert.equal(rt.timers.size, 0);
  });
  test('a current unavailable extraction retains returned source markdown', async () => {
    const rt = harness(); rt.continue(A).respond({ available: false, markdown: 'Authored unavailable context' }); await flush();
    assert.deepEqual(plain(rt.context.style), { status: 'unavailable', url: A, markdown: 'Authored unavailable context' });
  });
  for (const phase of ['fetch', 'json']) test(`a current ${phase} failure unlocks style reading`, async () => {
    const rt = harness(), request = rt.continue(A);
    if (phase === 'fetch') request.pending.reject(new Error('Authored failure'));
    else { const body = request.json(); await flush(); body.reject(new Error('Authored invalid JSON')); }
    await flush(); assert.deepEqual(plain(rt.context.style), { status: 'unavailable', url: A }); assert.equal(rt.timers.size, 0);
  });
  for (const outcome of ['success', 'failure']) test(`A-B-A ignores the first A ${outcome} while the newest A is pending`, async () => {
    const rt = harness(), first = rt.continue(A); rt.continue(B); const latest = rt.continue(A);
    if (outcome === 'success') first.respond(payload('obsolete')); else first.pending.reject(new Error('Authored obsolete failure'));
    await flush(); assert.deepEqual(plain(rt.context.style), { status: 'loading', url: A });
    latest.respond(payload('newest')); await flush(); assert.equal(rt.context.style.candidate.name, 'newest');
  });
  for (const outcome of ['success', 'failure']) test(`a completed newest extraction survives an obsolete ${outcome}`, async () => {
    const rt = harness(), first = rt.continue(A); rt.continue(B); const latest = rt.continue(A);
    latest.respond(payload('newest')); await flush(); const accepted = rt.context.style;
    if (outcome === 'success') first.respond(payload('obsolete')); else first.pending.reject(new Error('Authored obsolete failure'));
    await flush(); assert.equal(rt.context.style, accepted);
  });
  test('superseding while JSON is pending rejects the old parsed body', async () => {
    const rt = harness(), old = rt.continue(A), body = old.json(); await flush();
    rt.continue(B); const latest = rt.continue(A); body.resolve(payload('obsolete body')); await flush();
    assert.deepEqual(plain(rt.context.style), { status: 'loading', url: A });
    latest.respond(payload('newest body')); await flush(); assert.equal(rt.context.style.candidate.name, 'newest body');
  });
  test('replacement aborts only the old request and clears its timer', () => {
    const rt = harness(), old = rt.continue(A), oldTimer = [...rt.timers.keys()][0], latest = rt.continue(B);
    assert.equal(old.init.signal.aborted, true); assert.equal(latest.init.signal.aborted, false);
    assert.equal(rt.timers.has(oldTimer), false); assert.equal(rt.timers.size, 1);
  });
  test('Start over aborts extraction and late completion cannot restore cleared style', async () => {
    const rt = harness(), old = rt.continue(A); rt.context.startOver();
    assert.equal(old.init.signal.aborted, true); assert.equal(rt.timers.size, 0); old.respond(payload('obsolete')); await flush();
    assert.deepEqual(plain(rt.context.style), { status: 'idle' }); assert.equal(rt.context.step, 'source');
  });
  test('Start over followed by the same URL gives its new extraction exclusive ownership', async () => {
    const rt = harness(), old = rt.continue(A); rt.context.startOver(); const latest = rt.continue(A);
    old.respond(payload('before reset')); await flush(); assert.equal(rt.context.style.status, 'loading');
    latest.respond(payload('after reset')); await flush(); assert.equal(rt.context.style.candidate.name, 'after reset');
  });
  test('Continue without a URL aborts extraction and preserves a plain-source snapshot', async () => {
    const rt = harness(), old = rt.continue(A); rt.continue(null);
    assert.equal(old.init.signal.aborted, true); assert.equal(rt.timers.size, 0); old.respond(payload('obsolete')); await flush();
    assert.deepEqual(plain(rt.context.style), { status: 'idle' });
    const snapshot = rt.context.generationInputSnapshot(); assert.equal(snapshot.inputKind, 'paste');
    assert.equal(snapshot.brandContext, undefined); assert.equal(snapshot.themeOverride, undefined); assert.equal(snapshot.sourceUrl, undefined);
  });
  test('actual mount cleanup aborts owned extraction and rejects late JSON', async () => {
    const rt = harness(), old = rt.continue(A), body = old.json(); await flush(); rt.unmount();
    assert.equal(rt.context.mountedRef.current, false); assert.equal(old.init.signal.aborted, true); assert.equal(rt.timers.size, 0);
    const writes = rt.writes.length; body.resolve(payload('unmounted')); await flush(); assert.equal(rt.writes.length, writes);
  });
  test('cleanup then Strict Mode setup cannot revive the first same-URL request', async () => {
    const rt = harness(), old = rt.continue(A); rt.unmount(); rt.mount(); rt.context.startExtraction(A); const latest = rt.requests.at(-1);
    old.respond(payload('before cleanup')); await flush(); assert.equal(rt.context.style.status, 'loading');
    latest.respond(payload('after setup')); await flush(); assert.equal(rt.context.style.candidate.name, 'after setup');
  });
  test('an unmounted owner cannot start extraction', () => {
    const rt = harness(); rt.unmount(); rt.context.startExtraction(A); assert.equal(rt.requests.length, 0); assert.equal(rt.timers.size, 0);
  });
  test('live timeout releases loading even when the fetch ignores abort', async () => {
    const rt = harness(), current = rt.continue(A), timer = [...rt.timers.values()][0]; timer.callback();
    assert.equal(current.init.signal.aborted, true); assert.deepEqual(plain(rt.context.style), { status: 'unavailable', url: A });
    current.respond(payload('late after timeout')); await flush(); assert.equal(rt.context.style.status, 'unavailable');
  });
  test('an already-queued obsolete timer cannot abort or change the replacement', () => {
    const rt = harness(); rt.continue(A); const timer = [...rt.timers.values()][0]; const latest = rt.continue(B); timer.callback();
    assert.equal(latest.init.signal.aborted, false); assert.deepEqual(plain(rt.context.style), { status: 'loading', url: B });
  });
  test('an obsolete timer cannot change reset state', () => {
    const rt = harness(); rt.continue(A); const timer = [...rt.timers.values()][0]; rt.context.startOver(); const writes = rt.writes.length;
    timer.callback(); assert.equal(rt.writes.length, writes); assert.deepEqual(plain(rt.context.style), { status: 'idle' });
  });
  for (const outcome of ['success', 'failure']) test(`a queued obsolete ${outcome} updater cannot capture a newer same-URL request`, async () => {
    const rt = harness(), old = rt.continue(A); rt.queue();
    if (outcome === 'success') old.respond(payload('queued obsolete')); else old.pending.reject(new Error('Authored obsolete rejection'));
    await flush(); rt.queue(false); rt.continue(B); const latest = rt.continue(A); rt.drain();
    assert.deepEqual(plain(rt.context.style), { status: 'loading', url: A }); latest.respond(payload('newest')); await flush();
    assert.equal(rt.context.style.candidate.name, 'newest');
  });
  test('the current queued success remains applicable after promise cleanup', async () => {
    const rt = harness(); rt.queue(); rt.continue(A).respond(payload('queued current')); await flush();
    assert.equal(rt.context.style.status, 'loading'); assert.equal(rt.timers.size, 0); rt.drain();
    assert.equal(rt.context.style.candidate.name, 'queued current');
  });
  test('a queued timeout updater cannot change a replacement loading state', () => {
    const rt = harness(); rt.continue(A); rt.queue(); [...rt.timers.values()][0].callback(); rt.queue(false);
    rt.continue(B); rt.drain(); assert.deepEqual(plain(rt.context.style), { status: 'loading', url: B });
  });
  test('Continue with an unchanged loading URL reuses its request', () => {
    const rt = harness(), current = rt.continue(A); rt.continue(A);
    assert.equal(rt.requests.length, 1); assert.equal(current.init.signal.aborted, false); assert.equal(rt.timers.size, 1);
  });
  for (const decision of ['accepted', 'shuffled', 'skipped']) test(`Continue reuses ${decision} same-URL style and captures its correct generation context`, async () => {
    const rt = harness(), old = rt.continue(A); rt.continue(B); const latest = rt.continue(A), value = payload('newest source');
    old.respond(payload('obsolete source')); await flush(); latest.respond(value); await flush();
    if (decision === 'accepted') rt.context.useCandidateStyle();
    else if (decision === 'shuffled') rt.context.shuffleStyle(); else rt.context.skipStyle();
    const selected = rt.context.style, calls = rt.requests.length; rt.continue(A);
    assert.equal(rt.requests.length, calls); assert.equal(rt.context.style, selected); assert.equal(selected.decision, decision);
    const snapshot = rt.context.generationInputSnapshot(); assert.equal(snapshot.sourceUrl, A); assert.equal(snapshot.rawText, A);
    assert.equal(snapshot.brandContext.markdown, value.markdown);
    if (decision === 'skipped') { assert.equal(snapshot.brandContext.brandKit, undefined); assert.equal(snapshot.themeOverride, undefined); }
    else { assert.equal(snapshot.brandContext.brandKit, value.brandKit); assert.equal(snapshot.themeOverride, selected.candidate);
      assert.equal(snapshot.themeMode, decision === 'accepted' ? 'brand' : 'remix'); }
  });
}
