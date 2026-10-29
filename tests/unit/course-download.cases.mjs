// T2: authored fetch/streams/Blob URLs, React SSR and direct source callbacks.
// The hook harness applies state synchronously and commits layout effects only
// when requested. It does not execute React lifecycle/scheduling or a browser save.
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { authoredCourseDocument } from './course-artifact.cases.mjs';

const repository = fileURLToPath(new URL('../../', import.meta.url));
const load = createRequire(path.join(process.env.IV_TEST_PROJECT_ROOT || repository, 'package.json'));
const ts = load('typescript'), React = load('react');
const { renderToStaticMarkup } = load('react-dom/server');
const HTML = '<!doctype html><html lang="en"><head><title>Authored Course</title></head><body><h1>Authored Course</h1></body></html>';
const plain = (value) => JSON.parse(JSON.stringify(value));
const flush = () => new Promise(setImmediate);
function frozen(value) { if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.values(value).forEach(frozen); Object.freeze(value); } return value; }
function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
function response(html = HTML) { return new Response(JSON.stringify({ artifactHtml: html }), { headers: { 'content-type': 'application/json' } }); }

const harnessStack = [];
function cell(initial) {
  const harness = harnessStack.at(-1); assert.ok(harness, 'Hooks require the authored direct-callback harness.');
  const index = harness.cursor++;
  if (!(index in harness.cells)) harness.cells[index] = typeof initial === 'function' ? initial() : initial;
  return [harness, index];
}
function effect(callback, deps) {
  const [harness, index] = cell(() => ({ deps: null, cleanup: null })), prior = harness.cells[index];
  if (!prior.deps || !deps || deps.length !== prior.deps.length || deps.some((value, item) => !Object.is(value, prior.deps[item]))) harness.effects.push({ slot: prior, deps, callback });
}
const hooks = {
  ...React,
  useState(initial) {
    const [harness, index] = cell(initial);
    return [harness.cells[index], (next) => {
      const value = typeof next === 'function' ? next(harness.cells[index]) : next;
      if (!Object.is(value, harness.cells[index])) { harness.cells[index] = value; if (harness.rendering) harness.retry = true; }
    }];
  },
  useRef(initial) { const [harness, index] = cell(() => ({ current: initial })); return harness.cells[index]; },
  useEffect: effect,
  useLayoutEffect: effect,
};
class Harness {
  constructor(Component, props) { this.Component = Component; this.props = props; this.cells = []; this.cursor = 0; this.effects = []; this.rendering = false; this.retry = false; }
  render() {
    let result, attempts = 0;
    do {
      assert.ok(++attempts <= 8, 'Render-phase state must settle.');
      this.effects = []; this.cursor = 0; this.retry = false; this.rendering = true; harnessStack.push(this);
      try { result = this.Component(this.props); } finally { harnessStack.pop(); this.rendering = false; }
    } while (this.retry);
    return result;
  }
  flushEffects() { const pending = this.effects.splice(0); for (const current of pending) { current.slot.cleanup?.(); current.slot.deps = current.deps; current.slot.cleanup = current.callback(); } }
  mount() { this.render(); this.flushEffects(); return this.render(); }
  unmount() { this.effects = []; for (const value of this.cells) if (value && typeof value.cleanup === 'function') { value.cleanup(); value.cleanup = null; } }
}

function runtime(react = hooks) {
  const modules = new Map(), calls = [], urls = new Map(), revoked = [], timers = new Map();
  let nextURL = 0, nextTimer = 0, now = 0;
  class MockURL extends URL {
    static createObjectURL(blob) { const href = 'blob:authored-course-' + ++nextURL; urls.set(href, blob); return href; }
    static revokeObjectURL(href) { revoked.push(href); urls.delete(href); }
  }
  const context = vm.createContext({ structuredClone, TextEncoder, TextDecoder, Blob, Response, URL: MockURL, AbortController, DOMException, Error, crypto: webcrypto,
    performance: { now: () => now },
    setTimeout(callback, delay) { const id = ++nextTimer; timers.set(id, { callback, delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
  });
  let fetcher = () => { throw new Error('A real network request is forbidden in Course download checks.'); };
  context.fetch = (url, init) => { calls.push({ url, init }); return fetcher(url, init); };
  function source(relative) {
    const file = path.resolve(repository, relative); assert.ok(file.startsWith(repository + path.sep));
    if (modules.has(file)) return modules.get(file).exports;
    const compiled = ts.transpileModule(readFileSync(file, 'utf8'), { fileName: file, reportDiagnostics: true,
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } });
    assert.equal(compiled.diagnostics.length, 0, file + ' must transpile without syntax diagnostics.');
    const record = { exports: {} }; modules.set(file, record);
    function require(specifier) {
      if (specifier === 'react') return react;
      if (specifier === 'react/jsx-runtime' || specifier === 'node:crypto') return load(specifier);
      if (specifier === '@/components/ui/button') return { Button: function AuthoredButton({ children, variant, size, ...props }) { return React.createElement('button', props, children); } };
      if (specifier === 'zod') return load(process.env.IV_TEST_ZOD_ENTRY || specifier);
      if (specifier === 'uuid' && file.endsWith('/packages/domain/ids.ts')) return { v7: () => webcrypto.randomUUID() };
      assert.ok(specifier.startsWith('@/') || specifier.startsWith('.'), 'Unexpected Course runtime dependency: ' + specifier);
      const base = specifier.startsWith('@/') ? path.join(repository, specifier.slice(2)) : path.resolve(path.dirname(file), specifier);
      for (const extension of ['.ts', '.tsx']) { try { readFileSync(base + extension); } catch { continue; } return source(base + extension); }
      throw new Error('Missing Course source dependency ' + specifier);
    }
    vm.runInContext('(function(exports,require,module){\n' + compiled.outputText + '\n})', context, { filename: file })(record.exports, require, record);
    return record.exports;
  }
  const helper = source('lib/client/course-download.ts'), fixtures = source('packages/domain/fixtures.ts');
  return { source, helper, calls, urls, revoked, timers, context, advance: (milliseconds) => { now += milliseconds; }, fetch: (callback) => { fetcher = callback; }, course: () => authoredCourseDocument(fixtures.createStarterCourseDocument()) };
}
function descendants(node, result = []) { if (React.isValidElement(node)) { result.push(node); React.Children.forEach(node.props.children, (child) => descendants(child, result)); } return result; }
function one(tree, predicate) { const found = descendants(tree).filter(predicate); assert.equal(found.length, 1, 'Expected one matching source element.'); return found[0]; }
const prepareButton = (tree) => one(tree, (node) => typeof node.props.onClick === 'function');
const saveLink = (tree) => descendants(tree).find((node) => node.type === 'a' && node.props.download);
function editor(rt, document = rt.course()) { const { CourseDownload } = rt.source('components/visualizations/course-download.tsx'); const harness = new Harness(CourseDownload, { document }); harness.mount(); return harness; }
const errorCode = (rt, code) => (error) => error instanceof rt.helper.CourseDownloadError && error.code === code;

export function registerCourseDownloadChecks(test) {
  test('Course download: filenames normalize unsafe characters with a bounded Course prefix', () => {
    const { helper } = runtime();
    assert.equal(helper.courseDownloadFilename('../CON\r\n/Course: Résumé?'), 'course-con-course-resume.html');
    assert.equal(helper.courseDownloadFilename(' 🟠 / .. '), 'course-draft.html');
    const name = helper.courseDownloadFilename('a'.repeat(300)); assert.equal(name.length, 92); assert.match(name, /^course-[a-z]+\.html$/);
  });
  test('Course download: request captures the complete validated clone and exact endpoint contract', async () => {
    const rt = runtime(), original = frozen(rt.course()), before = plain(original), signal = new AbortController().signal;
    rt.fetch(async () => response()); const result = await rt.helper.requestCourseDownload(original, signal);
    assert.equal(result.html, HTML); assert.match(result.filename, /^course-.*\.html$/); assert.equal(rt.calls.length, 1);
    const call = rt.calls[0]; assert.equal(call.url, '/api/visualizations/artifact'); assert.equal(call.init.method, 'POST'); assert.equal(call.init.signal, signal);
    assert.equal(call.init.headers['content-type'], 'application/json'); const body = JSON.parse(call.init.body);
    assert.deepEqual(Object.keys(body), ['document']); assert.deepEqual(body.document, before); assert.deepEqual(plain(original), before);
  });
  test('Course download: actual compiler round-trips full authored fields and blocks through the helper', async () => {
    const rt = runtime(), { compileVisualizationArtifact } = rt.source('lib/artifacts/compiler.ts'), document = rt.course();
    document.title = '🟠 Export / résumé'; const before = plain(document); let compiled;
    rt.fetch(async (_url, init) => { compiled = await compileVisualizationArtifact(JSON.parse(init.body).document, { visualizationId: 'draft-preview', versionId: 'draft-preview', createdAt: '2026-10-29T00:00:00Z', preview: true }); return response(compiled.html); });
    const result = await rt.helper.requestCourseDownload(frozen(document), new AbortController().signal);
    assert.equal(result.html, compiled.html); assert.equal(result.filename, 'course-export-resume.html'); assert.equal(compiled.manifest.rendererVersion, 'visualization-course-html-v2');
    for (const value of ['Authored Course subtitle', 'Authored learner constraint', 'Authored module A objective.', 'Authored callout body.', 'Authored choice question?', 'Authored correct option', 'Authored recall guidance.', 'Authored summary item two', 'Authored lesson A feedback.', 'Authored HTTPS reference note.', 'Authored term']) assert.ok(result.html.includes(value), value);
    assert.doesNotMatch(result.html, /sendBeacon|localStorage|\/api\/events/); assert.deepEqual(plain(document), before); assert.equal(rt.calls.length, 1);
  });
  test('Course download: invalid or oversized Course input fails finitely before fetch', async () => {
    const rt = runtime(), invalid = rt.course(); invalid.course.modules[0].lessons[0].practice[0].answerIndex = 99;
    await assert.rejects(rt.helper.requestCourseDownload(invalid, new AbortController().signal), errorCode(rt, 'invalid_course'));
    const large = rt.course(); large.summary = 'private input'.repeat(200_000);
    await assert.rejects(rt.helper.requestCourseDownload(large, new AbortController().signal), (error) => errorCode(rt, 'invalid_course')(error) && !error.message.includes('private input'));
    assert.equal(rt.calls.length, 0);
  });
  test('Course download: pre-abort avoids fetch and a late fetched response is canceled on abort', async () => {
    const rt = runtime(), aborted = new AbortController(); aborted.abort();
    await assert.rejects(rt.helper.requestCourseDownload(rt.course(), aborted.signal), { name: 'AbortError' }); assert.equal(rt.calls.length, 0);
    const pending = deferred(), controller = new AbortController(); let canceled = false; rt.fetch(() => pending.promise);
    const request = rt.helper.requestCourseDownload(rt.course(), controller.signal); controller.abort();
    pending.resolve(new Response(new ReadableStream({ cancel() { canceled = true; } }), { headers: { 'content-type': 'application/json' } }));
    await assert.rejects(request, { name: 'AbortError' }); await flush(); assert.equal(canceled, true);
  });
  test('Course download: status media JSON and incomplete-envelope errors use finite codes', async () => {
    for (const [make, code] of [
      [() => new Response('private upstream payload', { status: 503 }), 'preparation_failed'],
      [() => { throw new Error('private upstream exception'); }, 'preparation_failed'],
      [() => new Response('{}', { headers: { 'content-type': 'application/jsonp' } }), 'response_unrecognized'],
      [() => new Response(null, { headers: { 'content-type': 'application/json' } }), 'response_empty'],
      [() => new Response('{bad', { headers: { 'content-type': 'application/json' } }), 'response_unrecognized'],
      [() => new Response('{}', { headers: { 'content-type': 'application/json', 'content-length': '1.5' } }), 'response_unrecognized'],
      [() => new Response('{}', { headers: { 'content-type': 'application/json' } }), 'response_incomplete'],
      [() => response('<html><head></head><body>Partial</body></html>'), 'response_incomplete'],
      [() => response('<!doctype html><html><head></head><body>Partial</html>'), 'response_incomplete'],
    ]) {
      const rt = runtime(); rt.fetch(async () => make());
      await assert.rejects(rt.helper.requestCourseDownload(rt.course(), new AbortController().signal), (error) => errorCode(rt, code)(error) && !/private upstream/.test(error.message)); assert.equal(rt.urls.size, 0);
    }
  });
  test('Course download: advertised and streamed response bounds cancel oversized bodies', async () => {
    for (const advertised of [true, false]) {
      const rt = runtime(); let canceled = false;
      const stream = new ReadableStream({ start(controller) { if (!advertised) controller.enqueue(new Uint8Array(rt.helper.COURSE_DOWNLOAD_RESPONSE_BYTES + 1)); }, cancel() { canceled = true; } });
      rt.fetch(async () => new Response(stream, { headers: { 'content-type': 'application/json', ...(advertised ? { 'content-length': String(rt.helper.COURSE_DOWNLOAD_RESPONSE_BYTES + 1) } : {}) } }));
      await assert.rejects(rt.helper.requestCourseDownload(rt.course(), new AbortController().signal), errorCode(rt, 'response_too_large'));
      await flush(); assert.equal(canceled, true);
    }
    const rt = runtime(), overhead = new TextEncoder().encode(JSON.stringify({ artifactHtml: HTML })).length;
    const html = HTML.replace('</body>', 'x'.repeat(rt.helper.COURSE_DOWNLOAD_RESPONSE_BYTES - overhead) + '</body>');
    rt.fetch(async () => response(html)); assert.equal((await rt.helper.requestCourseDownload(rt.course(), new AbortController().signal)).html, html);
  });
  test('Course download: chunked UTF-8 retains authored Unicode and malformed encoding fails finitely', async () => {
    const rt = runtime(), html = HTML.replace('Authored Course</h1>', 'Authored café 🟠</h1>'), bytes = new TextEncoder().encode(JSON.stringify({ artifactHtml: html }));
    rt.fetch(async () => new Response(new ReadableStream({ start(controller) { for (let index = 0; index < bytes.length; index += 3) controller.enqueue(bytes.slice(index, index + 3)); controller.close(); } }), { headers: { 'content-type': 'application/json' } }));
    assert.equal((await rt.helper.requestCourseDownload(rt.course(), new AbortController().signal)).html, html);
    rt.fetch(async () => new Response(Uint8Array.of(0xc3, 0x28), { headers: { 'content-type': 'application/json' } }));
    await assert.rejects(rt.helper.requestCourseDownload(rt.course(), new AbortController().signal), errorCode(rt, 'response_unrecognized'));
  });
  test('Course download: abort cancels a stalled response reader instead of leaving pending owned work', async () => {
    const rt = runtime(), controller = new AbortController(); let canceled = false;
    rt.fetch(async () => new Response(new ReadableStream({ cancel() { canceled = true; } }), { headers: { 'content-type': 'application/json' } }));
    const pending = rt.helper.requestCourseDownload(rt.course(), controller.signal); await flush(); controller.abort();
    await assert.rejects(pending, { name: 'AbortError' }); assert.equal(canceled, true); assert.equal(rt.urls.size, 0);
  });
  test('Course download: SSR renders a labelled preparation control without requesting or saving a file', () => {
    const rt = runtime(React), { CourseDownload } = rt.source('components/visualizations/course-download.tsx');
    const html = renderToStaticMarkup(React.createElement(CourseDownload, { document: rt.course() }));
    assert.match(html, /aria-label="Course HTML download"/); assert.match(html, /Download Course HTML/); assert.match(html, /min-h-11/);
    assert.doesNotMatch(html, /download=|blob:/); assert.equal(rt.calls.length, 0); assert.equal(rt.urls.size, 0);
  });
  test('Course download: explicit preparation exposes a native Save link for the exact HTML bytes', async () => {
    const rt = runtime(); rt.fetch(async () => response()); const harness = editor(rt), before = plain(harness.props.document);
    assert.equal(saveLink(harness.render()), undefined); prepareButton(harness.render()).props.onClick(); await flush();
    const link = saveLink(harness.render()); assert.ok(link); assert.equal(link.props.children, 'Save Course HTML');
    assert.match(link.props.download, /^course-.*\.html$/); assert.equal(await rt.urls.get(link.props.href).text(), HTML); assert.equal(rt.urls.get(link.props.href).type, 'text/html;charset=utf-8');
    assert.equal(typeof link.props.onClick, 'undefined'); assert.deepEqual(plain(harness.props.document), before); harness.unmount();
  });
  test('Course download: synchronous duplicate preparation callbacks share one pending request', async () => {
    const rt = runtime(), pending = deferred(); rt.fetch(() => pending.promise); const harness = editor(rt), click = prepareButton(harness.render()).props.onClick;
    click(); click(); assert.equal(rt.calls.length, 1); assert.equal(prepareButton(harness.render()).props.disabled, true); assert.equal(saveLink(harness.render()), undefined);
    assert.equal(rt.timers.size, 1); pending.resolve(response()); await flush(); assert.ok(saveLink(harness.render())); assert.equal(rt.timers.size, 0); harness.unmount();
  });
  test('Course download: finite preparation failure retains the draft and allows an explicit retry', async () => {
    const rt = runtime(); rt.fetch(async () => new Response('private upstream failure', { status: 500 })); const harness = editor(rt), before = plain(harness.props.document);
    prepareButton(harness.render()).props.onClick(); await flush(); assert.equal(prepareButton(harness.render()).props.children, 'Retry Course HTML');
    const error = one(harness.render(), (node) => node.props.role === 'alert').props.children;
    assert.match(error, /draft is still available/); assert.doesNotMatch(error, /private upstream/); assert.equal(rt.urls.size, 0); assert.deepEqual(plain(harness.props.document), before);
    rt.fetch(async () => response()); prepareButton(harness.render()).props.onClick(); await flush(); assert.ok(saveLink(harness.render())); harness.unmount();
  });
  test('Course download: Blob allocation failure keeps the authored draft and releases pending state', async () => {
    const rt = runtime(); rt.fetch(async () => response()); rt.context.URL.createObjectURL = () => { throw new Error('private allocation details'); };
    const harness = editor(rt), before = plain(harness.props.document); prepareButton(harness.render()).props.onClick(); await flush();
    assert.equal(prepareButton(harness.render()).props.children, 'Retry Course HTML'); assert.equal(prepareButton(harness.render()).props.disabled, false);
    assert.equal(saveLink(harness.render()), undefined); assert.equal(rt.urls.size, 0); assert.equal(rt.timers.size, 0);
    assert.doesNotMatch(one(harness.render(), (node) => node.props.role === 'alert').props.children, /private allocation/); assert.deepEqual(plain(harness.props.document), before); harness.unmount();
  });
  test('Course download: committed A to B to A changes cannot revive a revoked ready URL', async () => {
    const rt = runtime(); rt.fetch(async () => response()); const original = rt.course(), harness = editor(rt, original);
    prepareButton(harness.render()).props.onClick(); await flush(); const old = saveLink(harness.render()).props.href;
    harness.props = { document: { ...original, title: 'Replacement Course' } }; assert.equal(saveLink(harness.render()), undefined); harness.flushEffects(); harness.render();
    assert.deepEqual(rt.revoked, [old]); harness.props = { document: original }; assert.equal(saveLink(harness.render()), undefined); harness.flushEffects(); harness.render();
    assert.equal(saveLink(harness.render()), undefined); prepareButton(harness.render()).props.onClick(); await flush(); assert.notEqual(saveLink(harness.render()).props.href, old); harness.unmount();
  });
  test('Course download: pending replacement aborts only on commit and old success cannot replace a newer file', async () => {
    const rt = runtime(), old = deferred(), latest = deferred(); let count = 0; rt.fetch(() => ++count === 1 ? old.promise : latest.promise);
    const harness = editor(rt); prepareButton(harness.render()).props.onClick(); const signal = rt.calls[0].init.signal;
    harness.props = { document: { ...harness.props.document, title: 'Latest authored Course' } }; harness.render(); assert.equal(signal.aborted, false);
    harness.flushEffects(); harness.render(); assert.equal(signal.aborted, true); prepareButton(harness.render()).props.onClick(); latest.resolve(response()); await flush();
    const href = saveLink(harness.render()).props.href; old.resolve(response(HTML.replace('Authored Course</h1>', 'Obsolete Course</h1>'))); await flush();
    assert.equal(saveLink(harness.render()).props.href, href); assert.equal(rt.urls.size, 1); harness.unmount();
  });
  test('Course download: an old rejection cannot attach errors to or unlock a newer pending request', async () => {
    const rt = runtime(), old = deferred(), latest = deferred(); let count = 0; rt.fetch(() => ++count === 1 ? old.promise : latest.promise);
    const harness = editor(rt); prepareButton(harness.render()).props.onClick(); harness.props = { document: { ...harness.props.document, title: 'Newer authored Course' } }; harness.render(); harness.flushEffects(); harness.render();
    prepareButton(harness.render()).props.onClick(); old.reject(new Error('obsolete upstream request')); await flush();
    assert.equal(prepareButton(harness.render()).props.disabled, true); assert.equal(descendants(harness.render()).some((node) => node.props.role === 'alert'), false);
    assert.equal(rt.timers.size, 1); latest.resolve(response()); await flush(); assert.ok(saveLink(harness.render())); harness.unmount();
  });
  test('Course download: unmount aborts pending work clears timers and fences late responses', async () => {
    const rt = runtime(), pending = deferred(); rt.fetch(() => pending.promise); const harness = editor(rt);
    prepareButton(harness.render()).props.onClick(); const signal = rt.calls[0].init.signal; harness.unmount();
    assert.equal(signal.aborted, true); assert.equal(rt.timers.size, 0); pending.resolve(response()); await flush(); assert.equal(rt.urls.size, 0);
  });
  test('Course download: timeout unlocks retry and the expired result cannot replace its successor', async () => {
    const rt = runtime(), old = deferred(); let count = 0; rt.fetch(() => ++count === 1 ? old.promise : Promise.resolve(response())); const harness = editor(rt);
    prepareButton(harness.render()).props.onClick(); const timer = [...rt.timers.values()][0]; assert.equal(timer.delay, 30_000);
    rt.advance(30_000); timer.callback(); assert.equal(rt.calls[0].init.signal.aborted, true); assert.match(one(harness.render(), (node) => node.props.role === 'alert').props.children, /timed out/);
    prepareButton(harness.render()).props.onClick(); await flush(); const href = saveLink(harness.render()).props.href; old.resolve(response()); await flush();
    assert.equal(saveLink(harness.render()).props.href, href); assert.equal(rt.urls.size, 1); harness.unmount();
  });
  test('Course download: preparing another copy revokes the prior URL and unmount releases the final copy', async () => {
    const rt = runtime(); rt.fetch(async () => response()); const harness = editor(rt);
    prepareButton(harness.render()).props.onClick(); await flush(); const first = saveLink(harness.render()).props.href;
    prepareButton(harness.render()).props.onClick(); assert.equal(rt.urls.has(first), false); assert.equal(saveLink(harness.render()), undefined);
    await flush(); const second = saveLink(harness.render()).props.href; assert.notEqual(first, second); harness.unmount();
    assert.deepEqual(rt.revoked, [first, second]); assert.equal(rt.urls.size, 0); assert.equal(rt.timers.size, 0);
  });
  test('Course download: a late acknowledgement cannot beat a delayed deadline timer', async () => {
    const rt = runtime(), pending = deferred(); rt.fetch(() => pending.promise); const harness = editor(rt);
    prepareButton(harness.render()).props.onClick(); rt.advance(30_001); pending.resolve(response()); await flush();
    assert.equal(saveLink(harness.render()), undefined); assert.equal(rt.urls.size, 0); assert.equal(rt.timers.size, 0);
    assert.equal(prepareButton(harness.render()).props.children, 'Retry Course HTML'); assert.match(one(harness.render(), (node) => node.props.role === 'alert').props.children, /timed out/); harness.unmount();
  });
  test('Course download: preview source binds the Course control to its current Course document only', () => {
    const filename = path.join(repository, 'components/visualizations/preview.tsx'), file = ts.createSourceFile(filename, readFileSync(filename, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX), matches = [];
    assert.equal(file.parseDiagnostics.length, 0);
    function visit(node) { if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(file) === 'CourseDownload') matches.push(node); ts.forEachChild(node, visit); }
    visit(file); assert.equal(matches.length, 1);
    const attribute = matches[0].attributes.properties.find((node) => ts.isJsxAttribute(node) && node.name.getText(file) === 'document');
    assert.ok(attribute?.initializer && ts.isJsxExpression(attribute.initializer)); assert.equal(attribute.initializer.expression.getText(file), 'draft.document');
    let node = matches[0].parent, guarded = false;
    while (node) { if (ts.isConditionalExpression(node) && ts.isBinaryExpression(node.condition) && node.condition.left.getText(file) === 'draft.document.kind' && ts.isStringLiteral(node.condition.right) && node.condition.right.text === 'course') guarded = true; node = node.parent; }
    assert.equal(guarded, true); const source = file.text; assert.match(source, /import\s*\{\s*CourseDownload\s*\}\s*from\s*["']@\/components\/visualizations\/course-download["']/);
  });
}
