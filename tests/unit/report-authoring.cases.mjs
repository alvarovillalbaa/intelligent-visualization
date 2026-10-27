// Tier 2: authored reports through the actual client helper and guest-store
// functions. In-memory storage and UUID fixtures; no browser/backend/provider.
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const repository = fileURLToPath(new URL('../../', import.meta.url));
const project = process.env.IV_TEST_PROJECT_ROOT || repository;
const external = createRequire(path.join(project, 'package.json'));
const ts = external('typescript');
const context = vm.createContext({ structuredClone, TextEncoder, URL, crypto: webcrypto,
  fetch() { throw new Error('Network is forbidden in report authoring checks.'); } });
const modules = new Map();
function actual(relative) {
  const filename = path.resolve(repository, relative.endsWith('.ts') ? relative : relative + '.ts');
  assert.ok(filename.startsWith(repository), 'Only repository source can be VM-loaded.');
  if (modules.has(filename)) return modules.get(filename).exports;
  const compiled = ts.transpileModule(readFileSync(filename, 'utf8'), { fileName: filename,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }, reportDiagnostics: true });
  assert.equal(compiled.diagnostics.length, 0, filename + ' must transpile without syntax diagnostics.');
  const module = { exports: {} };
  modules.set(filename, module);
  const require = (specifier) => {
    if (specifier.startsWith('@/')) return actual(specifier.slice(2));
    if (specifier.startsWith('.')) return actual(path.relative(repository, path.resolve(path.dirname(filename), specifier)));
    if (specifier === 'uuid') return { v7: () => webcrypto.randomUUID() };
    assert.equal(specifier, 'zod', 'Unexpected runtime dependency: ' + specifier);
    return external(process.env.IV_TEST_ZOD_ENTRY || specifier);
  };
  vm.runInContext('(function(exports,require,module){\n' + compiled.outputText + '\n})', context, { filename })(module.exports, require, module);
  return module.exports;
}
const { validateReportEdit, prepareReportEdit, changeReportLayout, addReportBlock, duplicateReportBlock,
  removeReportBlock, applyReportDraftEdit, createReportBlock, REPORT_AUTHORING_LIMITS } = actual('lib/client/report-authoring');
const { createStarterReportDocument, createStarterCourseDocument, createStarterSlidesDocument } = actual('packages/domain/fixtures');
const { createGenerationBatch, updateGenerationResult } = actual('lib/client/generation-batch');
const { storeGuestDraft, loadGuestDraft } = actual('lib/client/guest-draft');
const plain = (value) => JSON.parse(JSON.stringify(value));
const clone = (value) => structuredClone(value);
function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
function report() {
  const document = createStarterReportDocument();
  document.assetIds = ['authored-asset'];
  document.sourceManifest = [{ id: 'authored-source', label: 'Authored source', kind: 'paste', contentHash: 'authored-hash', provenance: 'Authored source; not provider output.' }];
  return document;
}
function batch() {
  const input = { inputKind: 'paste', rawText: '  Authored report source\r\nkeep whitespace  ', prompt: 'Explain this source',
    files: [{ name: 'authored.txt', type: 'text/plain', content: 'Exact file source' }], themeMode: 'brand' };
  let value = createGenerationBatch(['slides', 'course', 'report'], input, 'authored-report-batch', 100);
  for (const result of value.results) {
    const document = result.kind === 'report' ? report() : result.kind === 'course' ? createStarterCourseDocument() : createStarterSlidesDocument();
    value = updateGenerationResult(value, result.id, { status: 'completed', draft: { kind: result.kind, document,
      provider: 'authored-provider', modelName: 'authored-model', generatedAt: 101, artifactHtml: '<html>Stale authored artifact</html>' }, saveStatus: 'saved', savedDeckId: 'saved-' + result.kind });
  }
  return value;
}
function target(value) { return value.results.find((result) => result.kind === 'report'); }
function apply(value, edited, expected = clone(target(value).draft)) {
  return applyReportDraftEdit(value, target(value).id, expected, edited);
}
function storage(run) {
  const values = new Map(), prior = context.window;
  let fail = false;
  context.window = { localStorage: {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { if (fail) throw new Error('Authored quota exhausted'); values.set(key, value); },
    removeItem: (key) => values.delete(key),
  } };
  try { run({ values, failWrites: () => { fail = true; } }); }
  finally { if (prior === undefined) delete context.window; else context.window = prior; }
}
function snapshot(value) { return { input: { rawText: value.input.rawText, files: value.input.files }, selectedKind: 'report',
  selectedKinds: ['slides', 'course', 'report'], draft: null, batch: value }; }

export function registerReportAuthoringChecks(test) {
  test('valid report validation clones without trimming or changing source/snapshot qualifications', () => {
    const value = report(); value.title = '  Authored title  ';
    const before = plain(value), result = validateReportEdit(freeze(value));
    assert.deepEqual(plain(result), before); assert.notEqual(result, value); assert.notEqual(result.report.blocks, value.report.blocks);
  });
  test('all fifteen typed block factories can be added without changing their siblings', () => {
    const kinds = ['heading', 'rich-text', 'callout', 'quote', 'divider', 'kpi', 'chart', 'data-table', 'tabs', 'image', 'list', 'timeline', 'comparison', 'source-note', 'cta'];
    for (const kind of kinds) {
      const value = report(), before = plain(value), next = addReportBlock(freeze(value), kind);
      assert.equal(next.report.blocks.at(-1).kind, kind); assert.deepEqual(plain(value), before);
      for (const breakpoint of ['lg', 'md', 'sm']) assert.equal(next.report.layouts[breakpoint].length, value.report.blocks.length + 1);
    }
    assert.throws(() => createReportBlock('unknown'), /supported/);
  });
  test('image insertion requires an existing attached asset instead of inventing one', () => {
    const value = report(); value.assetIds = [];
    assert.throws(() => addReportBlock(value, 'image'), /Attach an image/);
    const next = addReportBlock(report(), 'image'); assert.equal(next.report.blocks.at(-1).assetId, 'authored-asset');
  });
  test('preparing real-generation empty layouts fills every breakpoint deterministically', () => {
    const value = report(); value.report.layouts = { lg: [], md: [], sm: [] };
    const before = plain(value), next = prepareReportEdit(freeze(value));
    assert.deepEqual(plain(value), before);
    for (const [breakpoint, columns] of [['lg', 12], ['md', 8], ['sm', 4]]) {
      assert.deepEqual(plain(next.report.layouts[breakpoint]), plain(value.report.blocks.map((block, index) => ({ blockId: block.id, x: 0, y: index * 6, w: columns, h: 6 }))));
    }
    assert.throws(() => validateReportEdit(value), /every report block/);
  });
  test('preparing partial layouts preserves supplied entries and places only missing entries below', () => {
    const value = report(), first = clone(value.report.layouts.lg[0]);
    first.locked = true; value.report.layouts.lg = [first];
    const next = prepareReportEdit(value);
    assert.deepEqual(plain(next.report.layouts.lg[0]), plain(first));
    assert.equal(next.report.layouts.lg[1].y, first.y + first.h);
    assert.deepEqual(plain(next.report.layouts.md), plain(value.report.layouts.md));
  });
  test('preparing a complete report leaves all geometry intact', () => {
    const value = report(); assert.deepEqual(plain(prepareReportEdit(freeze(value))), plain(value));
  });
  for (const [name, change, message] of [
    ['fractional coordinate', (d) => { d.report.layouts.lg[0].x = 0.5; }, /whole number/],
    ['negative coordinate', (d) => { d.report.layouts.lg[0].y = -1; }, /whole number/],
    ['zero width', (d) => { d.report.layouts.lg[0].w = 0; }, /whole number/],
    ['out-of-grid width', (d) => { d.report.layouts.sm[0].w = 5; }, /inside 4 columns/],
    ['row overflow', (d) => { d.report.layouts.lg[0].y = 256; }, /256 rows/],
    ['overlap', (d) => { d.report.layouts.lg[1].y = 0; }, /overlap/],
    ['unknown block', (d) => { d.report.layouts.lg[0].blockId = 'missing'; }, /no longer exists/],
    ['duplicate block layout', (d) => { d.report.layouts.lg.push(clone(d.report.layouts.lg[0])); }, /more than once/],
    ['minimum violation', (d) => { d.report.layouts.lg[1].minW = 9; }, /minimum and maximum/],
    ['maximum violation', (d) => { d.report.layouts.lg[1].maxH = 2; }, /minimum and maximum/],
  ]) test('both validation and preparation reject supplied ' + name, () => {
    const value = report(); change(value); const before = plain(value);
    assert.throws(() => validateReportEdit(value), message); assert.throws(() => prepareReportEdit(value), message);
    assert.deepEqual(plain(value), before);
  });
  test('layout changes affect only the selected breakpoint and preserve source constraints', () => {
    const value = report(), id = value.report.blocks[0].id, next = changeReportLayout(freeze(value), 'lg', id, { y: 20, w: 6, h: 3 });
    assert.equal(next.report.layouts.lg[0].y, 20); assert.equal(value.report.layouts.lg[0].y, 0);
    assert.deepEqual(plain(next.report.layouts.md), plain(value.report.layouts.md));
    assert.deepEqual(plain(next.report.layouts.sm), plain(value.report.layouts.sm));
  });
  test('invalid drop is atomic and does not move or resize any existing block', () => {
    const value = report(), before = plain(value);
    assert.throws(() => changeReportLayout(freeze(value), 'lg', value.report.blocks[3].id, { y: 0 }), /overlap/);
    assert.deepEqual(plain(value), before);
    assert.throws(() => changeReportLayout(value, 'bad', value.report.blocks[0].id, {}), /supported/);
    assert.throws(() => changeReportLayout(value, 'lg', 'missing', {}), /no longer available/);
    assert.throws(() => changeReportLayout(value, 'lg', value.report.blocks[0].id, { minW: 2 }), /Only position/);
  });
  test('lock blocks position/size edits until explicit unlock and is breakpoint-specific', () => {
    const value = report(), id = value.report.blocks[0].id;
    const locked = changeReportLayout(value, 'lg', id, { locked: true });
    assert.throws(() => changeReportLayout(locked, 'lg', id, { y: 20 }), /Unlock/);
    assert.throws(() => changeReportLayout(locked, 'lg', id, { locked: false, y: 20 }), /Unlock/);
    assert.doesNotThrow(() => changeReportLayout(locked, 'md', id, { y: 20 }));
    const unlocked = changeReportLayout(locked, 'lg', id, { locked: false });
    assert.equal(changeReportLayout(unlocked, 'lg', id, { y: 20 }).report.layouts.lg[0].y, 20);
  });
  test('removal requires every breakpoint unlocked and keeps at least one block', () => {
    const value = report(), id = value.report.blocks[0].id;
    assert.throws(() => removeReportBlock(changeReportLayout(value, 'sm', id, { locked: true }), id), /every breakpoint/);
    const next = removeReportBlock(freeze(value), id);
    assert.equal(next.report.blocks.some((block) => block.id === id), false);
    for (const items of Object.values(next.report.layouts)) assert.equal(items.some((item) => item.blockId === id), false);
    let one = next;
    while (one.report.blocks.length > 1) one = removeReportBlock(one, one.report.blocks[0].id);
    assert.throws(() => removeReportBlock(one, one.report.blocks[0].id), /at least one/);
  });
  test('duplicate recursively renews block/tab/chart IDs while retaining evidence values and independent data', () => {
    const value = addReportBlock(report(), 'tabs'), original = value.report.blocks.at(-1);
    original.tabs[0].blocks.push(createReportBlock('chart')); original.tabs[1].blocks.push(createReportBlock('kpi'));
    const next = duplicateReportBlock(freeze(value), original.id), copy = next.report.blocks.at(-1);
    const collect = (block) => [block.id, ...(block.kind === 'chart' ? [block.chart.id] : []), ...(block.kind === 'tabs' ? block.tabs.flatMap((tab) => [tab.id, ...tab.blocks.flatMap(collect)]) : [])];
    assert.equal(collect(copy).some((id) => collect(original).includes(id)), false);
    assert.equal(copy.tabs[0].blocks.at(-1).chart.provenance, original.tabs[0].blocks.at(-1).chart.provenance);
    copy.tabs[0].blocks.at(-1).chart.data.push({ label: 'Authored', value: 7 });
    assert.equal(original.tabs[0].blocks.at(-1).chart.data.length, 0);
    for (const breakpoint of ['lg', 'md', 'sm']) {
      const item = next.report.layouts[breakpoint].at(-1);
      assert.equal(item.blockId, copy.id); assert.equal(item.locked, false);
      assert.ok(item.y >= Math.max(...value.report.layouts[breakpoint].map((entry) => entry.y + entry.h)));
    }
  });
  for (const [name, change, message] of [
    ['duplicate global IDs', (d) => { d.report.blocks[1].id = d.report.blocks[0].id; }, /Duplicate ID/],
    ['duplicate chart/block ID', (d) => { d.report.blocks[3].chart.id = d.report.blocks[0].id; }, /Duplicate ID/],
    ['duplicate series keys', (d) => { d.report.blocks[3].chart.series.push(clone(d.report.blocks[3].chart.series[0])); }, /series keys/],
    ['nonnumeric chart values', (d) => { d.report.blocks[3].chart.data[0].value = '12'; }, /number or null/],
    ['missing series cell', (d) => { delete d.report.blocks[3].chart.data[0].value; }, /number or null/],
    ['missing category key', (d) => { d.report.blocks[3].chart.xKey = 'missing'; }, /category key/],
    ['negative snapshot count', (d) => { d.report.dataSources[0].rowCount = -1; }, /nonnegative/],
    ['unsupported extra field', (d) => { d.report.blocks[0].unsupported = true; }, /unsupported fields/],
    ['blank title', (d) => { d.title = '  '; }, /Title cannot be blank/],
  ]) test('report content validation rejects ' + name, () => { const value = report(); change(value); assert.throws(() => validateReportEdit(value), message); });
  test('numeric chart nulls and empty datasets remain valid without invented data', () => {
    const value = report(), chart = value.report.blocks[3].chart;
    chart.data[0].value = null; assert.doesNotThrow(() => validateReportEdit(value));
    chart.data = []; assert.equal(validateReportEdit(value).report.blocks[3].chart.data.length, 0);
  });
  test('table rows retain exact column count and enforce bounded column/data size', () => {
    const value = addReportBlock(report(), 'data-table'), table = value.report.blocks.at(-1);
    table.rows = [['Authored']]; assert.doesNotThrow(() => validateReportEdit(value));
    table.rows.push(['Two', 'Cells']); assert.throws(() => validateReportEdit(value), /one cell per column/);
    table.rows = []; table.columns = Array.from({ length: 33 }, (_, index) => 'Column ' + index);
    assert.throws(() => validateReportEdit(value), /1–32/);
  });
  test('report CTA validation accepts HTTP(S) and rejects executable/protocol-ambiguous links', () => {
    const value = addReportBlock(report(), 'cta'), block = value.report.blocks.at(-1);
    for (const href of ['https://example.com/path', 'http://example.com']) { block.cta.href = href; assert.doesNotThrow(() => validateReportEdit(value)); }
    for (const href of ['javascript:alert(1)', 'data:text/html,hello', 'mailto:hello@example.com']) { block.cta.href = href; assert.throws(() => validateReportEdit(value), /HTTP or HTTPS/); }
  });
  test('bounded JSON rejects cycles, sparse arrays, accessors, hidden values and nonfinite numbers before schema parsing', () => {
    const circular = report(); circular.loop = circular; assert.throws(() => validateReportEdit(circular), /circular/);
    const sparse = report(); sparse.report.blocks.length++; assert.throws(() => validateReportEdit(sparse), /missing entries/);
    const hidden = report(); Object.defineProperty(hidden, 'hidden', { value: 'secret' }); assert.throws(() => validateReportEdit(hidden), /hidden or computed/);
    const computed = report(); let invoked = false; Object.defineProperty(computed, 'computed', { enumerable: true, get() { invoked = true; return 'secret'; } });
    assert.throws(() => validateReportEdit(computed), /hidden or computed/); assert.equal(invoked, false);
    const nonfinite = report(); nonfinite.report.layouts.lg[0].x = Infinity; assert.throws(() => validateReportEdit(nonfinite), /finite/);
    const missing = report(); missing.subtitle = undefined; assert.throws(() => validateReportEdit(missing), /ordinary JSON/);
  });
  test('report byte and nesting limits fail before unbounded parsing or cloning', () => {
    const tooLarge = report(); tooLarge.summary = 'x'.repeat(REPORT_AUTHORING_LIMITS.bytes + 1);
    assert.throws(() => validateReportEdit(tooLarge), /2 MiB/);
    const deep = report(); let cursor = deep;
    for (let index = 0; index < REPORT_AUTHORING_LIMITS.depth + 2; index++) { cursor.nested = {}; cursor = cursor.nested; }
    assert.throws(() => validateReportEdit(deep), /too complex/);
  });
  test('block/row limits refuse oversized reports or insertions without changing the current draft', () => {
    const value = report(); value.report.blocks = Array.from({ length: 129 }, () => createReportBlock('divider'));
    value.report.layouts = { lg: [], md: [], sm: [] };
    assert.throws(() => validateReportEdit(value), /128 top-level/);
    const full = report();
    for (const items of Object.values(full.report.layouts)) items[3].y = 250;
    const before = plain(full);
    assert.throws(() => addReportBlock(freeze(full), 'rich-text'), /256 rows/);
    assert.deepEqual(plain(full), before);
  });
  test('nested tab depth is bounded while four levels of authored tabs remain valid', () => {
    let value = addReportBlock(report(), 'tabs'), cursor = value.report.blocks.at(-1);
    for (let index = 0; index < 3; index++) { const child = createReportBlock('tabs'); cursor.tabs[0].blocks = [child]; cursor = child; }
    assert.doesNotThrow(() => validateReportEdit(value));
    cursor.tabs[0].blocks = [createReportBlock('tabs')];
    assert.throws(() => validateReportEdit(value), /four levels/);
  });
  test('applying edits preserves latest siblings, input, save state, provenance and immutable source snapshots', () => {
    const value = batch(), original = plain(value), expected = clone(target(value).draft), edited = clone(expected.document);
    edited.title = 'Edited report'; edited.subtitle = 'Edited subtitle'; edited.summary = 'Edited summary'; edited.audience = 'Edited audience'; edited.goal = 'Edited goal'; edited.seo = { title: 'Edited SEO', description: 'Edited SEO description' };
    edited.report.decisionQuestion = 'Edited decision'; edited.report.executiveSummary = 'Edited conclusion'; edited.report.blocks[1].text = 'Edited narrative';
    edited.theme.accent = '#000000'; edited.sourceManifest = []; edited.assetIds = []; edited.visualDirection.layout = 'Rejected layout metadata';
    edited.report.dataSources[0].contentHash = 'attempted snapshot replacement';
    const next = apply(freeze(value), freeze(edited), freeze(expected)), result = target(next).draft;
    assert.equal(next.input, value.input); assert.equal(next.results[0], value.results[0]); assert.equal(next.results[1], value.results[1]);
    assert.equal(target(next).saveStatus, 'saved'); assert.equal(target(next).savedDeckId, 'saved-report');
    assert.equal(result.provider, 'authored-provider'); assert.equal(result.modelName, 'authored-model'); assert.equal(result.generatedAt, 101);
    assert.equal(Object.hasOwn(result, 'artifactHtml'), false); assert.equal(result.document.title, 'Edited report');
    for (const key of ['theme', 'sourceManifest', 'assetIds', 'visualDirection', 'brand']) assert.deepEqual(plain(result.document[key]), plain(expected.document[key]));
    assert.deepEqual(plain(result.document.report.dataSources), plain(expected.document.report.dataSources));
    assert.equal(result.document.report.blocks[1].text, 'Edited narrative'); assert.deepEqual(plain(value), original);
  });
  test('applying supports generated reports with original empty layouts and retains their snapshot records', () => {
    const value = batch(); target(value).draft.document.report.layouts = { lg: [], md: [], sm: [] };
    const next = apply(value, prepareReportEdit(target(value).draft.document));
    assert.equal(target(next).draft.document.report.layouts.lg.length, target(value).draft.document.report.blocks.length);
    assert.deepEqual(plain(target(next).draft.document.report.dataSources), plain(target(value).draft.document.report.dataSources));
  });
  test('applying removes absent optional subtitle without leaving undefined JSON', () => {
    const value = batch(); target(value).draft.document.subtitle = 'Old subtitle';
    const edited = clone(target(value).draft.document); delete edited.subtitle;
    assert.equal(Object.hasOwn(target(apply(value, edited)).draft.document, 'subtitle'), false);
  });
  test('stale draft application preserves the newer draft and leaves authored fields available', () => {
    const value = batch(), expected = clone(target(value).draft), edited = clone(expected.document); edited.title = 'Unapplied text';
    target(value).draft.document.title = 'Newer title'; const before = plain(value);
    assert.throws(() => apply(value, edited, expected), /changed while/); assert.deepEqual(plain(value), before); assert.equal(edited.title, 'Unapplied text');
  });
  test('apply refuses duplicate result identities, wrong formats, incomplete and missing drafts', () => {
    for (const mutate of [(v) => v.results.push(clone(target(v))), (v) => { target(v).status = 'failed'; }, (v) => { target(v).draft.kind = 'course'; }, (v) => { target(v).draft = null; }]) {
      const value = batch(), edited = clone(target(value).draft.document), expected = clone(target(value).draft); mutate(value);
      assert.throws(() => apply(value, edited, expected), /no longer available/);
    }
  });
  test('guest report edits round-trip through existing store and retain all format siblings and four-hour retention', () => storage(({ values }) => {
    const value = batch(), edited = clone(target(value).draft.document); edited.title = 'Stored report edit';
    const next = apply(value, edited); assert.equal(storeGuestDraft(snapshot(next)).stored, true);
    const raw = JSON.parse(values.get('iv:guest-draft:v2')), restored = loadGuestDraft();
    assert.equal(raw.expiresAt - raw.savedAt, 4 * 60 * 60 * 1000); assert.equal(target(restored.batch).draft.document.title, 'Stored report edit');
    assert.deepEqual(plain(restored.batch.results.map((entry) => entry.kind)), ['slides', 'course', 'report']);
  }));
  test('guest quota failure keeps exact prior storage bytes and the applied in-memory report/siblings', () => storage(({ values, failWrites }) => {
    const value = batch(); assert.equal(storeGuestDraft(snapshot(value)).stored, true);
    const before = values.get('iv:guest-draft:v2'), edited = clone(target(value).draft.document); edited.title = 'In-memory report edit';
    const next = apply(value, edited); failWrites(); assert.equal(storeGuestDraft(snapshot(next)).stored, false);
    assert.equal(values.get('iv:guest-draft:v2'), before); assert.equal(target(next).draft.document.title, 'In-memory report edit');
    assert.equal(target(loadGuestDraft().batch).draft.document.title, target(value).draft.document.title);
    assert.equal(next.results[0], value.results[0]); assert.equal(next.results[1], value.results[1]);
  }));
}
