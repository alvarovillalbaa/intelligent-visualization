// Tier 2: authored UTF-8 bytes through actual parser, authoring, history and guest
// store source. No application process, browser, file provider, server or network.
import assert from 'node:assert/strict';
import { createHash, webcrypto } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const repository = fileURLToPath(new URL('../../', import.meta.url));
const external = createRequire(path.join(process.env.IV_TEST_PROJECT_ROOT || repository, 'package.json'));
const ts = external('typescript');
const context = vm.createContext({ structuredClone, TextEncoder, TextDecoder, Uint8Array, ArrayBuffer, URL, crypto: webcrypto,
  fetch() { throw new Error('Network is forbidden in Report CSV checks.'); } });
const modules = new Map();
function actual(relative) {
  const filename = path.resolve(repository, relative.endsWith('.ts') ? relative : relative + '.ts');
  assert.ok(filename.startsWith(repository), 'Only repository source can be loaded.');
  if (modules.has(filename)) return modules.get(filename).exports;
  const compiled = ts.transpileModule(readFileSync(filename, 'utf8'), { fileName: filename, reportDiagnostics: true,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
  assert.equal(compiled.diagnostics.length, 0, filename + ' must transpile without syntax diagnostics.');
  const record = { exports: {} }; modules.set(filename, record);
  const require = (specifier) => {
    if (specifier.startsWith('@/')) return actual(specifier.slice(2));
    if (specifier.startsWith('.')) return actual(path.relative(repository, path.resolve(path.dirname(filename), specifier)));
    if (specifier === 'uuid') return { v7: () => webcrypto.randomUUID() };
    assert.equal(specifier, 'zod', 'Unexpected runtime dependency: ' + specifier);
    return external(process.env.IV_TEST_ZOD_ENTRY || specifier);
  };
  vm.runInContext('(function(exports,require,module){\n' + compiled.outputText + '\n})', context, { filename })(record.exports, require, record);
  return record.exports;
}

const { prepareReportCsvImport, requirePreparedReportCsvImport, REPORT_CSV_IMPORT_LIMITS } = actual('lib/client/report-csv');
const { appendImportedReportTable, prepareReportEdit, validateReportEdit, applyReportDraftEdit } = actual('lib/client/report-authoring');
const history = actual('components/visualizations/report-editor/history');
const { createStarterReportDocument, createStarterCourseDocument, createStarterSlidesDocument } = actual('packages/domain/fixtures');
const { createGenerationBatch, updateGenerationResult } = actual('lib/client/generation-batch');
const { storeGuestDraft, loadGuestDraft } = actual('lib/client/guest-draft');
const bytes = (text) => new TextEncoder().encode(text);
const plain = (value) => JSON.parse(JSON.stringify(value));
const clone = (value) => structuredClone(value);
const fingerprint = (columns, rows) => createHash('sha256').update(JSON.stringify({ columns, rows }), 'utf8').digest('hex');
function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
const review = (text = 'Name,Value\nAlpha,12', options = {}) => prepareReportCsvImport(bytes(text), { label: 'Authored.csv', firstRowIsHeader: true, ...options });
function report() {
  const value = createStarterReportDocument();
  value.sourceManifest = [{ id: 'authored-source', label: 'Authored original source', kind: 'paste', contentHash: 'original-source-hash', provenance: 'Authored source; not provider output.' }];
  value.assetIds = ['authored-asset'];
  value.report.dataSources = [
    { id: 'original-a', label: 'Original A', contentHash: 'original-hash-a', rowCount: 2, provenance: 'Keep original qualification A.' },
    { id: 'original-b', label: 'Original B', contentHash: 'original-hash-b', rowCount: 0, provenance: 'Keep original qualification B.' },
  ];
  return value;
}
function batch() {
  let value = createGenerationBatch(['slides', 'course', 'report'], { inputKind: 'paste', rawText: '  Authored CSV source\r\nkeep whitespace  ', prompt: 'Explain the source', files: [], themeMode: 'brand' }, 'authored-csv-batch', 100);
  for (const result of value.results) {
    const document = result.kind === 'report' ? report() : result.kind === 'course' ? createStarterCourseDocument() : createStarterSlidesDocument();
    value = updateGenerationResult(value, result.id, { status: 'completed', draft: { kind: result.kind, document,
      provider: 'authored-provider', modelName: 'authored-model', generatedAt: 101, artifactHtml: '<html>Stale authored artifact</html>' }, saveStatus: 'saved', savedDeckId: 'saved-' + result.kind });
  }
  return value;
}
const target = (value) => value.results.find((result) => result.kind === 'report');
function apply(value, document, expected = clone(target(value).draft)) {
  return applyReportDraftEdit(value, target(value).id, expected, document);
}
function guestSnapshot(value) {
  return { input: { rawText: value.input.rawText, files: value.input.files }, selectedKind: 'report', selectedKinds: ['slides', 'course', 'report'], draft: null, batch: value };
}
async function storage(run) {
  const values = new Map(), prior = context.window; let failing = false;
  context.window = { localStorage: { getItem: (key) => values.get(key) ?? null,
    setItem(key, value) { if (failing) throw new Error('Authored CSV quota exhausted'); values.set(key, value); }, removeItem: (key) => values.delete(key) } };
  try { return await run({ values, failWrites() { failing = true; } }); }
  finally { if (prior === undefined) delete context.window; else context.window = prior; }
}

export function registerReportCsvImportChecks(test) {
  test('UTF-8 review retains authored accents, emoji and literal table values', async () => {
    const value = await review('Région,Observation\nEspaña,☀️ café');
    assert.deepEqual(plain(value.columns), ['Région', 'Observation']);
    assert.deepEqual(plain(value.rows), [['España', '☀️ café']]);
    assert.equal(value.rowCount, 1); assert.equal(value.byteLength, bytes('Région,Observation\nEspaña,☀️ café').byteLength);
  });
  test('one leading UTF-8 BOM is omitted from headings but counted in file bytes', async () => {
    const normal = await review('A,B\nx,y'), bom = await review('\ufeffA,B\nx,y');
    assert.deepEqual(plain(bom.columns), ['A', 'B']); assert.deepEqual(plain(bom.rows), [['x', 'y']]);
    assert.equal(bom.contentHash, normal.contentHash); assert.equal(bom.byteLength, normal.byteLength + 3);
  });
  test('quoted commas, escaped quotes and embedded CRLF remain literal cell contents', async () => {
    const value = await review('Name,Note\r\n"Alpha, beta","He said ""yes""\r\nThen left"\r\n');
    assert.deepEqual(plain(value.rows), [['Alpha, beta', 'He said "yes"\r\nThen left']]);
    assert.equal(value.rowCount, 1);
  });
  test('spaces, empty trailing cells and a final record delimiter are preserved without an extra row', async () => {
    const value = await review(' Heading ,Tail,\n  exact  , ,\n');
    assert.deepEqual(plain(value.columns), [' Heading ', 'Tail', '']);
    assert.deepEqual(plain(value.rows), [['  exact  ', ' ', '']]);
  });
  test('spreadsheet formulas, leading zeroes and HTML-like text remain inert strings', async () => {
    const rows = [['=SUM(1;2)', '+12', '-7', '@name', '0012', '<img onerror=alert(1)>']];
    const value = await review('A,B,C,D,E,F\n' + rows[0].join(','));
    assert.deepEqual(plain(value.rows), rows); assert.ok(value.rows[0].every((cell) => typeof cell === 'string'));
  });
  test('blank and duplicate literal headings are allowed without renaming them', async () => {
    const value = await review(',Name,Name\nblank,left,right');
    assert.deepEqual(plain(value.columns), ['', 'Name', 'Name']);
    assert.deepEqual(plain(value.rows), [['blank', 'left', 'right']]);
  });
  test('no-header mode generates positional headings and retains the first record as data', async () => {
    const value = await review('Name,Value\nAlpha,12', { firstRowIsHeader: false });
    assert.deepEqual(plain(value.columns), ['Column 1', 'Column 2']);
    assert.deepEqual(plain(value.rows), [['Name', 'Value'], ['Alpha', '12']]);
    assert.equal(value.rowCount, 2); assert.equal(value.firstRowIsHeader, false);
  });
  test('empty and BOM-only files reject while nonempty blank headings remain literal', async () => {
    await assert.rejects(review(''), /nonempty/); await assert.rejects(review('\ufeff'), /nonempty/);
    assert.deepEqual(plain((await review('   ')).columns), ['   ']);
    assert.deepEqual(plain((await review('\n')).columns), ['']);
  });
  test('header-only files support zero rows and additional blank records remain actual data', async () => {
    const only = await review('A,B\r\n');
    assert.deepEqual(plain(only.rows), []); assert.equal(only.rowCount, 0);
    assert.deepEqual(plain((await review('A\n\n')).rows), [['']]);
  });
  test('source labels and header mode require explicit bounded values', async () => {
    for (const label of ['', '  ', 'x'.repeat(256), null]) await assert.rejects(review('A\nx', { label }));
    for (const firstRowIsHeader of [undefined, null, 'true', 1]) await assert.rejects(review('A\nx', { firstRowIsHeader }));
    const label = 'x'.repeat(255); assert.equal((await review('A\nx', { label })).label, label);
  });
  test('ragged short and long records are rejected without modifying the supplied bytes', async () => {
    for (const text of ['A,B\nx', 'A,B\nx,y,z']) {
      const input = bytes(text), before = input.slice();
      await assert.rejects(prepareReportCsvImport(input, { label: 'Ragged.csv', firstRowIsHeader: true }));
      assert.deepEqual(input, before);
    }
  });
  test('unterminated quoted fields are rejected rather than silently repaired', async () => {
    await assert.rejects(review('A,B\nx,"unfinished'));
  });
  test('quotes inside unquoted fields and text after closing quotes are rejected', async () => {
    for (const text of ['A\nun"quoted', 'A\n"quoted"tail']) await assert.rejects(review(text));
  });
  test('invalid UTF-8 sequences fail decoding instead of introducing replacement characters', async () => {
    for (const input of [new Uint8Array([0xc3, 0x28]), new Uint8Array([0xc0, 0xaf]), new Uint8Array([0xe2, 0x82])]) {
      await assert.rejects(prepareReportCsvImport(input, { label: 'Invalid.csv', firstRowIsHeader: false }));
    }
  });
  test('decoded NUL characters are rejected in headings and quoted or unquoted data', async () => {
    for (const text of ['A\0\nx', 'A\nx\0', 'A\n"x\0"']) await assert.rejects(review(text), /without NUL/);
  });
  test('the raw CSV byte cap accepts exactly 2 MiB and rejects one additional byte', async () => {
    assert.equal(REPORT_CSV_IMPORT_LIMITS.bytes, 2 * 1024 * 1024);
    const input = new Uint8Array(2 * 1024 * 1024).fill(120);
    const value = await prepareReportCsvImport(input, { label: 'Boundary.csv', firstRowIsHeader: false });
    assert.equal(value.byteLength, input.byteLength); assert.equal(value.rows[0][0].length, input.byteLength);
    await assert.rejects(prepareReportCsvImport(new Uint8Array(input.byteLength + 1).fill(120), { label: 'Too big.csv', firstRowIsHeader: false }));
  });
  test('32 literal columns are accepted and a 33rd column is rejected', async () => {
    const heading = Array.from({ length: 32 }, (_, index) => `H${index}`), row = heading.map(() => 'x');
    const value = await review(heading.join(',') + '\n' + row.join(','));
    assert.equal(value.columns.length, 32); assert.equal(value.rows[0].length, 32);
    await assert.rejects(review([...heading, 'H32'].join(',') + '\n' + [...row, 'x'].join(',')));
  });
  test('header mode accepts 256 data rows plus headings and rejects row 257', async () => {
    const records = Array.from({ length: 256 }, (_, index) => String(index));
    const value = await review(['Value', ...records].join('\n'));
    assert.equal(value.rowCount, 256); assert.equal(value.rows.at(-1)[0], '255');
    await assert.rejects(review(['Value', ...records, '256'].join('\n')));
  });
  test('no-header mode counts every record toward the 256-row cap', async () => {
    const records = Array.from({ length: 256 }, (_, index) => String(index));
    const value = await review(records.join('\n'), { firstRowIsHeader: false });
    assert.equal(value.rowCount, 256); assert.equal(value.rows[0][0], '0');
    await assert.rejects(review([...records, '256'].join('\n'), { firstRowIsHeader: false }));
  });
  test('the content hash matches independent SHA-256 of canonical parsed columns and rows', async () => {
    const columns = ['A', 'B'], rows = [['x', 'y']], value = await review('A,B\nx,y');
    assert.equal(value.contentHash, fingerprint(columns, rows)); assert.match(value.contentHash, /^[a-f0-9]{64}$/);
  });
  test('equivalent CSV quoting, BOM and line endings share a parsed-data hash independent of labels', async () => {
    const a = await review('A,B\nx,y', { label: 'First.csv' });
    const b = await review('\ufeff"A","B"\r\n"x","y"\r\n', { label: 'Other.csv' });
    assert.equal(a.contentHash, b.contentHash); assert.notEqual(a.byteLength, b.byteLength); assert.notEqual(a.label, b.label);
  });
  test('changing a literal heading, cell or header interpretation changes the fingerprint', async () => {
    const values = await Promise.all([review('A\nx'), review('B\nx'), review('A\ny'), review('A\nx', { firstRowIsHeader: false })]);
    assert.equal(new Set(values.map((value) => value.contentHash)).size, 4);
  });
  test('missing or failing SHA-256 support rejects review creation without an unhashed fallback', async () => {
    const original = context.crypto;
    try {
      context.crypto = {}; await assert.rejects(review(), /SHA-256 support/);
      context.crypto = { subtle: { digest: async () => { throw new Error('Authored digest failure'); } } };
      await assert.rejects(review(), /fingerprint could not be created/);
    } finally { context.crypto = original; }
  });
  test('prepared reviews, column arrays, row arrays and cells are deeply immutable', async () => {
    const value = await review();
    for (const entry of [value, value.columns, value.rows, ...value.rows]) assert.equal(Object.isFrozen(entry), true);
    assert.equal(requirePreparedReportCsvImport(value), value);
    assert.throws(() => { value.label = 'Changed'; });
    assert.throws(() => { value.columns[0] = 'Changed'; });
    assert.throws(() => { value.rows[0][0] = 'Changed'; });
    assert.throws(() => value.rows.push(['Changed']));
  });
  test('forged, spread, reconstructed and proxied reviews are rejected before reading their fields', async () => {
    const value = await review(); let reads = 0;
    const getter = Object.defineProperty({}, 'columns', { get() { reads++; throw new Error('Do not read forged fields'); } });
    const proxy = new Proxy(value, { get() { reads++; throw new Error('Do not inspect the proxy'); } });
    for (const invalid of [null, {}, { ...value }, clone(value), freeze(plain(value)), getter, proxy]) assert.throws(() => requirePreparedReportCsvImport(invalid));
    assert.equal(reads, 0);
    assert.throws(() => appendImportedReportTable(report(), clone(value)));
  });
  test('mutating original bytes and options while hashing cannot change the prepared review', async () => {
    const input = bytes('A\nx'), options = { label: 'Owned.csv', firstRowIsHeader: true };
    const pending = prepareReportCsvImport(input, options);
    input.fill(122); options.label = 'Changed.csv'; options.firstRowIsHeader = false;
    const value = await pending;
    assert.equal(value.label, 'Owned.csv'); assert.equal(value.firstRowIsHeader, true);
    assert.deepEqual(plain(value.columns), ['A']); assert.deepEqual(plain(value.rows), [['x']]);
    assert.equal(value.contentHash, fingerprint(['A'], [['x']]));
  });
  test('import appends one literal table and one qualified snapshot without changing original content', async () => {
    const source = freeze(report()), before = plain(source), prepared = await review('A,B\n"=1+1","x,y"');
    const result = appendImportedReportTable(source, prepared), block = result.document.report.blocks.at(-1), snapshot = result.document.report.dataSources.at(-1);
    assert.equal(block.id, result.blockId); assert.equal(block.kind, 'data-table'); assert.equal(block.title, prepared.label);
    assert.deepEqual(plain(block.columns), ['A', 'B']); assert.deepEqual(plain(block.rows), [['=1+1', 'x,y']]);
    assert.notEqual(block.id, snapshot.id); assert.equal(snapshot.label, prepared.label);
    assert.equal(snapshot.contentHash, prepared.contentHash); assert.equal(snapshot.rowCount, 1);
    assert.match(snapshot.provenance, /not.*original file bytes/); assert.match(snapshot.provenance, /not.*independently verified/);
    assert.ok(block.provenance.includes(snapshot.id)); assert.ok(block.provenance.includes(prepared.contentHash));
    assert.deepEqual(plain(result.document.report.blocks.slice(0, -1)), before.report.blocks);
    assert.deepEqual(plain(result.document.report.dataSources.slice(0, -1)), before.report.dataSources);
    assert.deepEqual(plain(source), before); assert.doesNotThrow(() => validateReportEdit(result.document));
  });
  test('an imported table receives a full-width nonoverlapping placement at all three breakpoints', async () => {
    const source = report(), result = appendImportedReportTable(source, await review());
    for (const [breakpoint, columns] of [['lg', 12], ['md', 8], ['sm', 4]]) {
      const prior = source.report.layouts[breakpoint], next = result.document.report.layouts[breakpoint];
      assert.deepEqual(plain(next.slice(0, -1)), plain(prior));
      assert.deepEqual(plain(next.at(-1)), { blockId: result.blockId, x: 0, y: Math.max(...prior.map((item) => item.y + item.h)), w: columns, h: 6 });
    }
  });
  test('preparing missing generated layouts before import positions every old and new block', async () => {
    const source = report(); source.report.layouts = { lg: [], md: [], sm: [] };
    const before = plain(source), result = appendImportedReportTable(prepareReportEdit(freeze(source)), await review());
    for (const breakpoint of ['lg', 'md', 'sm']) assert.equal(result.document.report.layouts[breakpoint].length, source.report.blocks.length + 1);
    assert.deepEqual(plain(source), before); assert.doesNotThrow(() => validateReportEdit(result.document));
  });
  test('layout exhaustion rejects the whole import without an orphan table or snapshot', async () => {
    const source = report();
    for (const breakpoint of ['lg', 'md', 'sm']) source.report.layouts[breakpoint].at(-1).y = 250;
    validateReportEdit(source); const before = plain(source), prepared = await review();
    assert.throws(() => appendImportedReportTable(freeze(source), prepared));
    assert.deepEqual(plain(source), before); assert.equal(requirePreparedReportCsvImport(prepared), prepared);
  });
  test('the full Report JSON cap rejects a valid raw-size CSV atomically', async () => {
    const source = freeze(report()), before = plain(source);
    const prepared = await review('x'.repeat(2 * 1024 * 1024), { firstRowIsHeader: false });
    assert.throws(() => appendImportedReportTable(source, prepared), /2 MiB/); assert.deepEqual(plain(source), before);
  });
  test('one history commit undoes and redoes the imported table, snapshot and all layouts together', async () => {
    const source = freeze(report()), imported = appendImportedReportTable(source, await review()).document;
    const initial = history.createReportHistory(source), committed = history.commitReportHistory(initial, imported);
    assert.equal(committed.past.length, 1); assert.equal(committed.future.length, 0);
    const undone = history.undoReportHistory(committed); assert.deepEqual(plain(undone.present), plain(source));
    const redone = history.redoReportHistory(undone); assert.deepEqual(plain(redone.present), plain(imported));
    assert.deepEqual(plain(initial.present), plain(source));
  });
  test('Apply appends the imported snapshot while preserving immutable fields and draft metadata', async () => {
    const value = freeze(batch()), expected = clone(target(value).draft), imported = appendImportedReportTable(expected.document, await review()).document;
    imported.theme.accent = '#000000'; imported.sourceManifest = []; imported.assetIds = []; imported.visualDirection.layout = 'Rejected metadata';
    const result = apply(value, freeze(imported), freeze(expected)), next = target(result).draft;
    assert.deepEqual(plain(next.document.report.dataSources), plain(imported.report.dataSources));
    for (const key of ['theme', 'sourceManifest', 'assetIds', 'visualDirection', 'brand']) assert.deepEqual(plain(next.document[key]), plain(expected.document[key]));
    for (const key of ['provider', 'modelName', 'generatedAt']) assert.equal(next[key], expected[key]);
    assert.equal(Object.hasOwn(next, 'artifactHtml'), false); assert.equal(target(result).savedDeckId, 'saved-report');
    assert.equal(result.input, value.input); assert.equal(result.results[0], value.results[0]); assert.equal(result.results[1], value.results[1]);
  });
  test('Apply rejects deleting, reordering or rewriting any existing ordered snapshot prefix', async () => {
    const value = freeze(batch()), expected = clone(target(value).draft), imported = appendImportedReportTable(expected.document, await review()).document;
    const before = plain(value);
    for (const mutate of [(d) => d.report.dataSources.shift(), (d) => d.report.dataSources.reverse(),
      (d) => { d.report.dataSources[0].contentHash = 'changed'; }, (d) => { d.report.dataSources[0].provenance = 'rewritten'; }]) {
      const edited = clone(imported); mutate(edited); assert.throws(() => apply(value, edited, expected), /source snapshots cannot be rewritten/);
      assert.deepEqual(plain(value), before);
    }
  });
  test('Apply rejects invalid new snapshot fingerprints and blank qualifications without mutation', async () => {
    const value = freeze(batch()), expected = clone(target(value).draft), imported = appendImportedReportTable(expected.document, await review()).document;
    for (const hash of ['', 'sample', 'a'.repeat(63), 'A'.repeat(64), 'g'.repeat(64)]) {
      const edited = clone(imported); edited.report.dataSources.at(-1).contentHash = hash;
      assert.throws(() => apply(value, edited, expected), /SHA-256/);
    }
    for (const key of ['label', 'provenance']) {
      const edited = clone(imported); edited.report.dataSources.at(-1)[key] = '  ';
      assert.throws(() => apply(value, edited, expected), /cannot be blank/);
    }
    assert.deepEqual(plain(target(value).draft), plain(expected));
  });
  test('table-cell edits preserve the previously committed import fingerprint and snapshot qualification', async () => {
    const first = batch(), imported = appendImportedReportTable(target(first).draft.document, await review()).document;
    const committed = apply(first, imported), expected = clone(target(committed).draft), edited = clone(expected.document);
    edited.report.blocks.at(-1).rows[0][1] = 'Editable later';
    const next = apply(committed, edited, expected);
    assert.deepEqual(plain(target(next).draft.document.report.dataSources), plain(expected.document.report.dataSources));
    assert.equal(target(next).draft.document.report.blocks.at(-1).rows[0][1], 'Editable later');
  });
  test('stale Report Apply rejects the imported candidate and preserves the newer Report', async () => {
    const value = batch(), expected = clone(target(value).draft), imported = appendImportedReportTable(expected.document, await review()).document;
    target(value).draft.document.title = 'Newer Report'; const before = plain(value);
    assert.throws(() => apply(freeze(value), imported, expected), /changed while/);
    assert.deepEqual(plain(value), before); assert.equal(imported.report.blocks.at(-1).kind, 'data-table');
  });
  test('Report Apply preserves a sibling completed after the editor captured its expected draft', async () => {
    const initial = batch(), expected = clone(target(initial).draft), imported = appendImportedReportTable(expected.document, await review()).document;
    const current = clone(initial); current.results[1].draft.document.title = 'Newer Course sibling'; current.results[1].savedDeckId = 'latest-course';
    const next = apply(freeze(current), imported, expected);
    assert.equal(next.results[1], current.results[1]); assert.equal(next.results[1].draft.document.title, 'Newer Course sibling');
    assert.equal(next.results[1].savedDeckId, 'latest-course'); assert.equal(target(next).draft.document.report.dataSources.length, 3);
  });
  test('successive CSV imports preserve the exact committed snapshot prefix in order', async () => {
    const initial = batch(), first = apply(initial, appendImportedReportTable(target(initial).draft.document, await review()).document);
    const prior = clone(target(first).draft), secondReview = await review('Other\nSecond', { label: 'Second.csv' });
    const second = apply(first, appendImportedReportTable(prior.document, secondReview).document, prior);
    assert.deepEqual(plain(target(second).draft.document.report.dataSources.slice(0, -1)), plain(prior.document.report.dataSources));
    assert.equal(target(second).draft.document.report.dataSources.at(-1).contentHash, secondReview.contentHash);
  });
  test('guest storage round-trips imported literals, snapshots, siblings and four-hour retention', async () => storage(async ({ values }) => {
    const initial = batch(), applied = apply(initial, appendImportedReportTable(target(initial).draft.document, await review('A,B\n"=1+1","x,y"')).document);
    assert.equal(storeGuestDraft(guestSnapshot(applied)).stored, true);
    const raw = JSON.parse(values.get('iv:guest-draft:v2')), restored = loadGuestDraft();
    assert.equal(raw.expiresAt - raw.savedAt, 4 * 60 * 60 * 1000);
    assert.deepEqual(plain(target(restored.batch).draft.document), plain(target(applied).draft.document));
    assert.deepEqual(plain(restored.batch.input), plain(initial.input));
    assert.deepEqual(plain(restored.batch.results.map((entry) => entry.kind)), ['slides', 'course', 'report']);
  }));
  test('guest quota failure retains prior bytes and the new imported in-memory Report and siblings', async () => storage(async ({ values, failWrites }) => {
    const initial = batch(); assert.equal(storeGuestDraft(guestSnapshot(initial)).stored, true);
    const prior = values.get('iv:guest-draft:v2'), applied = apply(initial, appendImportedReportTable(target(initial).draft.document, await review()).document);
    failWrites(); assert.equal(storeGuestDraft(guestSnapshot(applied)).stored, false);
    assert.equal(values.get('iv:guest-draft:v2'), prior); assert.equal(target(applied).draft.document.report.dataSources.length, 3);
    assert.equal(applied.results[0], initial.results[0]); assert.equal(applied.results[1], initial.results[1]);
    assert.deepEqual(plain(target(loadGuestDraft().batch).draft.document), plain(target(initial).draft.document));
  }));
}
