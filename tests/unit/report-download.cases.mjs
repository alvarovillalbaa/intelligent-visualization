// T2: authored fixtures, mocked fetch/Blob URLs, React SSR and direct source
// callbacks. No HTTP endpoint, browser, file save or React lifecycle executes.
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const repository = fileURLToPath(new URL('../../', import.meta.url));
const load = createRequire(path.join(process.env.IV_TEST_PROJECT_ROOT || repository, 'package.json'));
const ts = load('typescript'), React = load('react');
const { renderToStaticMarkup } = load('react-dom/server');
const HTML = '<!doctype html><html lang="en"><head><title>Authored Report</title></head><body><h1>Authored Report</h1></body></html>';
const plain = (value) => JSON.parse(JSON.stringify(value));
const flush = () => new Promise(setImmediate);
function frozen(value) { if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.values(value).forEach(frozen); Object.freeze(value); } return value; }
function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
function response(html = HTML) { return new Response(JSON.stringify({ artifactHtml: html }), { headers: { 'content-type': 'application/json' } }); }

let active = null;
function cell(initial) {
  assert.ok(active, 'Hooks require the direct callback harness.');
  const h = active, index = h.cursor++;
  if (!(index in h.cells)) h.cells[index] = typeof initial === 'function' ? initial() : initial;
  return [h, index];
}
const hooks = {
  ...React,
  useState(initial) { const [h, i] = cell(initial); return [h.cells[i], (next) => { h.cells[i] = typeof next === 'function' ? next(h.cells[i]) : next; }]; },
  useRef(initial) { const [h, i] = cell(() => ({ current: initial })); return h.cells[i]; },
  useEffect(callback, deps) {
    const [h, i] = cell(() => ({ deps: null, cleanup: null })), prior = h.cells[i];
    if (!prior.deps || !deps || deps.some((value, index) => !Object.is(value, prior.deps[index]))) h.effects.push({ slot: prior, deps, callback });
  },
};
class Harness {
  constructor(Component, props) { this.Component = Component; this.props = props; this.cells = []; this.cursor = 0; this.effects = []; }
  render() { const previous = active; active = this; this.cursor = 0; try { return this.Component(this.props); } finally { active = previous; } }
  flushEffects() { const pending = this.effects.splice(0); for (const effect of pending) { effect.slot.cleanup?.(); effect.slot.deps = effect.deps; effect.slot.cleanup = effect.callback(); } }
  mount() { this.render(); this.flushEffects(); return this.render(); }
  unmount() { for (const value of this.cells) if (value && typeof value.cleanup === 'function') { value.cleanup(); value.cleanup = null; } }
}

function runtime(react = hooks) {
  const modules = new Map(), calls = [], urls = new Map(), revoked = [], timers = new Map();
  let nextURL = 0, nextTimer = 0;
  class MockURL extends URL {
    static createObjectURL(blob) { const href = 'blob:authored-report-' + ++nextURL; urls.set(href, blob); return href; }
    static revokeObjectURL(href) { revoked.push(href); urls.delete(href); }
  }
  const context = vm.createContext({
    structuredClone, TextEncoder, TextDecoder, Blob, Response, URL: MockURL, AbortController, DOMException, Error, crypto: webcrypto,
    setTimeout(callback, delay) { const id = ++nextTimer; timers.set(id, { callback, delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
  });
  let fetcher = () => { throw new Error('A real network request is forbidden in Report download checks.'); };
  context.fetch = (url, init) => { calls.push({ url, init }); return fetcher(url, init); };
  function source(relative) {
    const file = path.resolve(repository, relative);
    if (modules.has(file)) return modules.get(file).exports;
    const compiled = ts.transpileModule(readFileSync(file, 'utf8'), { fileName: file, reportDiagnostics: true,
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } });
    assert.equal(compiled.diagnostics.length, 0, file + ' must transpile without syntax diagnostics.');
    const module = { exports: {} }; modules.set(file, module);
    const require = (specifier) => {
      if (specifier === 'react') return react;
      if (specifier === 'react/jsx-runtime') return load(specifier);
      if (specifier === 'node:crypto') return load(specifier); // Actual compiler content hashes only.
      if (specifier === '@/components/ui/button') return { Button: function AuthoredButton({ children, variant, size, ...props }) { return React.createElement('button', props, children); } };
      if (specifier === 'zod') return load(process.env.IV_TEST_ZOD_ENTRY || 'zod');
      if (specifier === 'uuid' && file.endsWith('/packages/domain/ids.ts')) return { v7: () => webcrypto.randomUUID() };
      assert.ok(specifier.startsWith('@/') || specifier.startsWith('.'), 'Unexpected runtime dependency: ' + specifier);
      const base = specifier.startsWith('@/') ? path.join(repository, specifier.slice(2)) : path.resolve(path.dirname(file), specifier);
      for (const extension of ['.ts', '.tsx']) { try { readFileSync(base + extension); } catch { continue; } return source(base + extension); }
      throw new Error('Missing source dependency ' + specifier);
    };
    vm.runInContext('(function(exports,require,module){\n' + compiled.outputText + '\n})', context, { filename: file })(module.exports, require, module);
    return module.exports;
  }
  const helper = source('lib/client/report-download.ts');
  const { createStarterReportDocument } = source('packages/domain/fixtures.ts');
  return { source, helper, calls, urls, revoked, timers, fetch: (callback) => { fetcher = callback; }, report: createStarterReportDocument, context };
}
function descendants(node, result = []) { if (React.isValidElement(node)) { result.push(node); React.Children.forEach(node.props.children, (child) => descendants(child, result)); } return result; }
function one(tree, predicate) { const found = descendants(tree).filter(predicate); assert.equal(found.length, 1, 'Expected one matching source element.'); return found[0]; }
const prepareButton = (tree) => one(tree, (node) => typeof node.props.onClick === 'function');
const saveLink = (tree) => descendants(tree).find((node) => node.type === 'a' && node.props.download);
function editor(rt, document = rt.report()) { const { ReportDownload } = rt.source('components/visualizations/report-download.tsx'); const h = new Harness(ReportDownload, { document }); h.mount(); return h; }

export function registerReportDownloadChecks(test) {
  test('download names remove path/control characters, use a safe prefix and cap their length', () => {
    const { helper } = runtime();
    assert.equal(helper.reportDownloadFilename('../CON\r\n/Quarterly: Résumé?'), 'report-con-quarterly-resume.html');
    assert.equal(helper.reportDownloadFilename(' 🟠 / .. '), 'report-draft.html');
    const name = helper.reportDownloadFilename('a'.repeat(300));
    assert.equal(name.length, 92); assert.match(name, /^report-[a-z]+\.html$/);
  });
  test('actual request captures a validated clone and fills empty layouts without rewriting the original', async () => {
    const rt = runtime(), value = rt.report(); value.report.layouts = { lg: [], md: [], sm: [] };
    const original = frozen(value), before = plain(original), signal = new AbortController().signal;
    rt.fetch(async () => response());
    const result = await rt.helper.requestReportDownload(original, signal);
    assert.equal(result.html, HTML); assert.match(result.filename, /^report-.*\.html$/);
    assert.equal(rt.calls.length, 1); assert.equal(rt.calls[0].url, '/api/visualizations/artifact');
    assert.equal(rt.calls[0].init.method, 'POST'); assert.equal(rt.calls[0].init.signal, signal);
    assert.equal(rt.calls[0].init.headers['content-type'], 'application/json');
    const body = JSON.parse(rt.calls[0].init.body);
    assert.deepEqual(Object.keys(body), ['document']);
    for (const size of ['lg', 'md', 'sm']) assert.equal(body.document.report.layouts[size].length, original.report.blocks.length);
    assert.deepEqual(plain(original), before);
  });
  test('actual static compiler response round-trips through the actual download helper without an endpoint', async () => {
    const rt = runtime(), { compileVisualizationArtifact } = rt.source('lib/artifacts/compiler.ts');
    const value = rt.report(); value.title = '🟠 Export / résumé'; value.subtitle = 'Authored exported subtitle';
    value.report.decisionQuestion = 'Authored exported decision?'; value.report.executiveSummary = 'Authored exported conclusion.';
    const original = frozen(value), before = plain(original); let compiled;
    rt.fetch(async (_url, init) => {
      const captured = JSON.parse(init.body);
      compiled = await compileVisualizationArtifact(captured.document, { visualizationId: 'draft-preview', versionId: 'draft-preview', createdAt: '2026-10-28T00:00:00Z', preview: true });
      return response(compiled.html);
    });
    const result = await rt.helper.requestReportDownload(original, new AbortController().signal);
    assert.equal(result.html, compiled.html); assert.equal(result.filename, 'report-export-resume.html');
    for (const text of ['Authored exported subtitle', 'Authored exported decision?', 'Authored exported conclusion.', '--iv-lg-w:12', 'report-grid']) assert.ok(result.html.includes(text), text);
    assert.equal(compiled.manifest.rendererVersion, 'visualization-report-html-v2');
    assert.doesNotMatch(result.html, /navigator\.sendBeacon/); assert.deepEqual(plain(original), before); assert.equal(rt.calls.length, 1);
  });
  test('invalid or oversized authored input rejects before any request', async () => {
    const rt = runtime(); const document = rt.report(); document.report.layouts.sm[0].w = 5;
    await assert.rejects(rt.helper.requestReportDownload(document, new AbortController().signal), /columns/);
    const large = rt.report(); large.summary = 'x'.repeat(2 * 1024 * 1024 + 1);
    await assert.rejects(rt.helper.requestReportDownload(large, new AbortController().signal), /2 MiB/);
    assert.equal(rt.calls.length, 0);
  });
  test('already-aborted request never reaches fetch', async () => {
    const rt = runtime(), controller = new AbortController(); controller.abort();
    await assert.rejects(rt.helper.requestReportDownload(rt.report(), controller.signal), { name: 'AbortError' });
    assert.equal(rt.calls.length, 0);
  });
  for (const [name, make, message] of [
    ['failed status', () => new Response('Authored failure', { status: 503 }), /could not be prepared/],
    ['unexpected media type', () => new Response(JSON.stringify({ artifactHtml: HTML }), { headers: { 'content-type': 'text/plain' } }), /not recognized/],
    ['empty response', () => new Response(null, { headers: { 'content-type': 'application/json' } }), /empty/],
    ['malformed JSON', () => new Response('{bad', { headers: { 'content-type': 'application/json' } }), /not recognized/],
    ['missing HTML', () => new Response('{}', { headers: { 'content-type': 'application/json' } }), /incomplete/],
    ['partial HTML', () => response('<html><head></head><body>Partial</body></html>'), /incomplete/],
    ['unclosed body', () => response('<!doctype html><html><head></head><body>Partial</html>'), /incomplete/],
  ]) test('download rejects ' + name + ' instead of creating a file', async () => {
    const rt = runtime(); rt.fetch(async () => make());
    await assert.rejects(rt.helper.requestReportDownload(rt.report(), new AbortController().signal), message);
    assert.equal(rt.urls.size, 0);
  });
  test('advertised and streamed response byte limits cancel oversized bodies', async () => {
    for (const advertised of [true, false]) {
      const rt = runtime(); let canceled = false;
      const stream = new ReadableStream({ start(controller) { if (!advertised) controller.enqueue(new Uint8Array(rt.helper.REPORT_DOWNLOAD_RESPONSE_BYTES + 1)); }, cancel() { canceled = true; } });
      rt.fetch(async () => new Response(stream, { headers: { 'content-type': 'application/json', ...(advertised ? { 'content-length': String(rt.helper.REPORT_DOWNLOAD_RESPONSE_BYTES + 1) } : {}) } }));
      await assert.rejects(rt.helper.requestReportDownload(rt.report(), new AbortController().signal), /too large/);
      await flush(); assert.equal(canceled, true);
    }
  });
  test('UTF-8 response decoding preserves text split across chunk boundaries', async () => {
    const rt = runtime(), html = HTML.replace('Authored Report</h1>', 'Authored café 🟠</h1>');
    const bytes = new TextEncoder().encode(JSON.stringify({ artifactHtml: html }));
    rt.fetch(async () => new Response(new ReadableStream({ start(controller) { for (let i = 0; i < bytes.length; i += 3) controller.enqueue(bytes.slice(i, i + 3)); controller.close(); } }), { headers: { 'content-type': 'application/json' } }));
    assert.equal((await rt.helper.requestReportDownload(rt.report(), new AbortController().signal)).html, html);
  });
  test('Report download SSR has a 44px preparation control and never requests a file', () => {
    const rt = runtime(React), { ReportDownload } = rt.source('components/visualizations/report-download.tsx');
    const html = renderToStaticMarkup(React.createElement(ReportDownload, { document: rt.report() }));
    assert.match(html, /Download Report HTML/); assert.match(html, /min-h-11/); assert.doesNotMatch(html, /download=|blob:/);
    assert.equal(rt.calls.length, 0); assert.equal(rt.urls.size, 0);
  });
  test('preparation makes one request and exposes an explicit native Save link for exact HTML bytes', async () => {
    const rt = runtime(), pending = deferred(); rt.fetch(() => pending.promise);
    const h = editor(rt), original = plain(h.props.document);
    const click = prepareButton(h.render()).props.onClick; click(); click();
    assert.equal(rt.calls.length, 1); assert.equal(prepareButton(h.render()).props.disabled, true); assert.equal(saveLink(h.render()), undefined);
    pending.resolve(response()); await flush();
    const link = saveLink(h.render()); assert.ok(link); assert.equal(link.props.children, 'Save Report HTML');
    assert.match(link.props.download, /^report-.*\.html$/); assert.equal(await rt.urls.get(link.props.href).text(), HTML);
    assert.equal(rt.timers.size, 0); assert.deepEqual(plain(h.props.document), original);
    h.unmount(); assert.deepEqual(rt.revoked, [link.props.href]);
  });
  test('preparation failure keeps draft and enables retry without creating a Blob URL', async () => {
    const rt = runtime(); rt.fetch(async () => new Response('', { status: 500 }));
    const h = editor(rt), original = plain(h.props.document); prepareButton(h.render()).props.onClick(); await flush();
    assert.equal(prepareButton(h.render()).props.children, 'Retry Report HTML');
    assert.match(one(h.render(), (node) => node.props.role === 'alert').props.children, /draft is still available/);
    assert.equal(rt.urls.size, 0); assert.deepEqual(plain(h.props.document), original);
    rt.fetch(async () => response()); prepareButton(h.render()).props.onClick(); await flush(); assert.ok(saveLink(h.render())); h.unmount();
  });
  test('failed Blob URL allocation exposes retry and retains the current draft', async () => {
    const rt = runtime(); rt.fetch(async () => response());
    rt.context.URL.createObjectURL = () => { throw new Error('Authored file preparation failure'); };
    const h = editor(rt), before = plain(h.props.document); prepareButton(h.render()).props.onClick(); await flush();
    assert.equal(prepareButton(h.render()).props.children, 'Retry Report HTML'); assert.equal(prepareButton(h.render()).props.disabled, false);
    assert.equal(saveLink(h.render()), undefined); assert.equal(rt.urls.size, 0); assert.equal(rt.timers.size, 0);
    assert.deepEqual(plain(h.props.document), before); h.unmount();
  });
  test('replaced document hides and revokes its prepared URL before preparing another copy', async () => {
    const rt = runtime(); rt.fetch(async () => response());
    const h = editor(rt); prepareButton(h.render()).props.onClick(); await flush(); const old = saveLink(h.render()).props.href;
    h.props = { document: { ...h.props.document, title: 'Different authored Report' } };
    assert.equal(saveLink(h.render()), undefined); h.flushEffects(); h.render();
    assert.deepEqual(rt.revoked, [old]); prepareButton(h.render()).props.onClick(); await flush();
    assert.equal(saveLink(h.render()).props.download, 'report-different-authored-report.html'); h.unmount();
  });
  test('stale request resolution after document replacement cannot overwrite a newer file', async () => {
    const rt = runtime(), old = deferred(), latest = deferred(); let call = 0;
    rt.fetch(() => (++call === 1 ? old.promise : latest.promise));
    const h = editor(rt); prepareButton(h.render()).props.onClick(); const priorSignal = rt.calls[0].init.signal;
    h.props = { document: { ...h.props.document, title: 'Latest authored Report' } }; h.render(); h.flushEffects(); h.render();
    assert.equal(priorSignal.aborted, true); prepareButton(h.render()).props.onClick(); latest.resolve(response()); await flush();
    const href = saveLink(h.render()).props.href; old.resolve(response(HTML.replace('Authored Report</h1>', 'Stale Report</h1>'))); await flush();
    assert.equal(saveLink(h.render()).props.href, href); assert.equal(rt.urls.size, 1); assert.equal(rt.calls.length, 2); h.unmount();
  });
  test('unmount aborts the pending request and late results create no file', async () => {
    const rt = runtime(), pending = deferred(); rt.fetch(() => pending.promise);
    const h = editor(rt); prepareButton(h.render()).props.onClick(); const signal = rt.calls[0].init.signal; h.unmount();
    assert.equal(signal.aborted, true); assert.equal(rt.timers.size, 0); pending.resolve(response()); await flush(); assert.equal(rt.urls.size, 0);
  });
  test('timeout unlocks retry and an abort-ignoring old response cannot replace the retry result', async () => {
    const rt = runtime(), pending = deferred(); let call = 0; rt.fetch(() => ++call === 1 ? pending.promise : Promise.resolve(response()));
    const h = editor(rt); prepareButton(h.render()).props.onClick(); const timer = [...rt.timers.values()][0];
    assert.equal(timer.delay, 30_000); timer.callback(); assert.equal(rt.calls[0].init.signal.aborted, true);
    assert.match(one(h.render(), (node) => node.props.role === 'alert').props.children, /timed out/);
    prepareButton(h.render()).props.onClick(); await flush(); const href = saveLink(h.render()).props.href;
    pending.resolve(response()); await flush(); assert.equal(saveLink(h.render()).props.href, href); assert.equal(rt.urls.size, 1); h.unmount();
  });
  test('preparing a replacement revokes the previously prepared URL and cleans all owned URLs', async () => {
    const rt = runtime(); rt.fetch(async () => response()); const h = editor(rt);
    prepareButton(h.render()).props.onClick(); await flush(); const first = saveLink(h.render()).props.href;
    prepareButton(h.render()).props.onClick(); assert.equal(rt.urls.has(first), false); assert.equal(saveLink(h.render()), undefined);
    await flush(); const second = saveLink(h.render()).props.href; assert.notEqual(first, second); h.unmount();
    assert.deepEqual(rt.revoked, [first, second]); assert.equal(rt.urls.size, 0); assert.equal(rt.timers.size, 0);
  });
}
