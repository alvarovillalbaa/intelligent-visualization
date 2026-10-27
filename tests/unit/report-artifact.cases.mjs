// T2: static HTML/CSS output from the actual artifact compiler. No HTTP handler,
// browser, backend/provider/database, analytics runtime or model executes.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const repository = path.resolve(fileURLToPath(new URL('../../', import.meta.url)));
const external = createRequire(path.join(process.env.IV_TEST_PROJECT_ROOT || repository, 'package.json'));
const ts = external('typescript');
const modules = new Map();
let fixtureID = 0;
const context = vm.createContext({ structuredClone, TextEncoder, URL,
  fetch() { throw new Error('Network is forbidden in static artifact checks.'); } });
function actual(relative) {
  const filename = path.resolve(repository, relative.endsWith('.ts') ? relative : relative + '.ts');
  assert.ok(filename.startsWith(repository + path.sep), 'Only repository modules can be loaded.');
  if (modules.has(filename)) return modules.get(filename).exports;
  const source = relative === 'lib/artifacts/compiler' && process.env.IV_REPORT_ARTIFACT_SOURCE
    ? readFileSync(process.env.IV_REPORT_ARTIFACT_SOURCE, 'utf8') : readFileSync(filename, 'utf8');
  const compiled = ts.transpileModule(source, { fileName: filename,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }, reportDiagnostics: true });
  assert.equal(compiled.diagnostics.length, 0, filename + ' must transpile without syntax diagnostics.');
  const module = { exports: {} }; modules.set(filename, module);
  const require = (specifier) => {
    if (specifier.startsWith('@/')) return actual(specifier.slice(2));
    if (specifier.startsWith('.')) return actual(path.relative(repository, path.resolve(path.dirname(filename), specifier)));
    if (specifier === 'node:crypto') return { createHash };
    if (specifier === 'uuid') return { v7: () => `fixture-generated-${++fixtureID}` };
    assert.equal(specifier, 'zod', 'Unexpected artifact runtime import: ' + specifier);
    return external(process.env.IV_TEST_ZOD_ENTRY || specifier);
  };
  vm.runInContext('(function(exports,require,module){\n' + compiled.outputText + '\n})', context, { filename })(module.exports, require, module);
  return module.exports;
}
const { compileVisualizationArtifact } = actual('lib/artifacts/compiler');
const { createStarterCourseDocument, createStarterReportDocument, createStarterSlidesDocument } = actual('packages/domain/fixtures');
const { canonicalSerialize, contentHash } = actual('packages/domain/serialization');
const plain = (value) => JSON.parse(JSON.stringify(value));
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const options = { visualizationId: 'authored-report', versionId: 'authored-version', createdAt: '2026-10-28T00:00:00.000Z', preview: true };
function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}

function report() {
  const document = structuredClone(createStarterReportDocument());
  document.title = 'Authored standalone Report'; document.subtitle = 'Authored subtitle'; document.summary = 'Authored summary.';
  document.seo = { title: 'Authored search title', description: 'Authored search description' };
  document.sourceManifest = [{ id: 'authored-source', kind: 'paste', label: 'Authored source', contentHash: 'authored-source-hash', provenance: 'Authored source context.' }];
  document.assetIds = ['authored-image-asset'];
  document.report = {
    decisionQuestion: 'Which authored option should we choose?', executiveSummary: 'Authored executive conclusion.',
    blocks: [
      { id: 'heading', kind: 'heading', level: 1, text: 'Authored heading' },
      { id: 'narrative', kind: 'rich-text', text: 'Authored narrative\n\nSecond paragraph.' },
      { id: 'metric', kind: 'kpi', label: 'Authored metric', value: '42%', detail: 'Authored metric detail.', provenance: 'Authored metric provenance.' },
      { id: 'graph', kind: 'chart', chart: {
        id: 'graph-spec', type: 'bar', title: 'Authored graph', description: 'Authored graph description.',
        series: [{ key: 'value', label: 'Score', color: '#2563eb' }], data: [{ label: 'A', value: 12 }, { label: 'B', value: 24 }], xKey: 'label',
        source: 'Authored chart source.', provenance: 'Authored chart provenance.', accessibleLabel: 'Two authored scores.', illustrative: true,
      } },
      { id: 'table', kind: 'data-table', title: 'Authored table', columns: ['Name', 'Score'], rows: [['A', '12']], provenance: 'Authored table provenance.' },
      { id: 'tabs', kind: 'tabs', tabs: [
        { id: 'tab-one', label: 'First authored view', blocks: [{ id: 'nested-note', kind: 'source-note', text: 'Nested authored qualification.' }] },
        { id: 'tab-two', label: 'Second authored view', blocks: [{ id: 'nested-metric', kind: 'kpi', label: 'Nested metric', value: '17', detail: 'Nested metric detail.', provenance: 'Nested metric provenance.' }] },
      ] },
      { id: 'link', kind: 'cta', cta: { label: 'Read authored evidence', href: 'https://example.com/evidence', helperText: 'Authored link context.' } },
      { id: 'image', kind: 'image', assetId: 'authored-image-asset', alt: 'Authored image description.', caption: 'Authored independent image caption.' },
    ],
    layouts: { lg: [], md: [], sm: [] },
    dataSources: [{ id: 'authored-snapshot', label: 'Authored snapshot', contentHash: 'authored-snapshot-hash', rowCount: 2, provenance: 'Authored immutable snapshot.' }],
  };
  for (const [breakpoint, columns] of [['lg', 12], ['md', 8], ['sm', 4]]) {
    document.report.layouts[breakpoint] = document.report.blocks.map((block, index) => ({ blockId: block.id, x: 0, y: index * 8, w: columns, h: 6 }));
  }
  document.report.layouts.lg[0] = { blockId: 'heading', x: 8, y: 0, w: 4, h: 2, minW: 2, maxW: 8, locked: true };
  document.report.layouts.md[0] = { blockId: 'heading', x: 4, y: 0, w: 4, h: 3 };
  document.report.layouts.sm[0] = { blockId: 'heading', x: 0, y: 1, w: 4, h: 4 };
  return document;
}

async function compile(document = report(), overrides = {}) {
  return compileVisualizationArtifact(document, { ...options, ...overrides });
}
function cssOf(html) { const match = html.match(/<style>([\s\S]*?)<\/style>/); assert.ok(match, 'A standalone style element is required.'); return match[1]; }
function mainOf(html) { const match = html.match(/<main class="report">([\s\S]*?)<\/main>/); assert.ok(match); return match[1]; }
function cellOf(html, id) { const tag = [...html.matchAll(/<section\b[^>]*>/g)].map((match) => match[0]).find((tag) => tag.includes(`data-report-block="${id}"`)); assert.ok(tag, 'Missing wrapper for ' + id); return tag; }
function attributes(tag) { return Object.fromEntries([...tag.matchAll(/([\w:-]+)="([^"]*)"/g)].map((match) => [match[1], match[2]])); }
function tags(html, tag, className) {
  return [...html.matchAll(new RegExp('<' + tag + '\\b[^>]*>', 'g'))].map((match) => attributes(match[0]))
    .filter((attrs) => !className || (attrs.class ?? '').split(' ').includes(className));
}
function chartDocument(type, data = [{ label: 'A', alpha: -10, beta: 5 }, { label: 'B', alpha: 0, beta: null }, { label: 'C', alpha: 10, beta: -5 }]) {
  const document = report(), block = document.report.blocks.find((entry) => entry.kind === 'chart');
  block.chart.type = type; block.chart.series = [{ key: 'alpha', label: 'Alpha', color: '#2563eb' }, { key: 'beta', label: 'Beta', color: '#db2777' }]; block.chart.data = data;
  document.report.blocks = [block];
  for (const [breakpoint, columns] of [['lg', 12], ['md', 8], ['sm', 4]]) document.report.layouts[breakpoint] = [{ blockId: block.id, x: 0, y: 0, w: columns, h: 12 }];
  return document;
}
function svgsOf(html) { return [...html.matchAll(/<svg\b[\s\S]*?<\/svg>/g)].map((match) => match[0]); }
function seriesGroup(svg, key) {
  const match = svg.match(new RegExp('<g\\b[^>]*data-series-key="' + key + '"[^>]*>([\\s\\S]*?)<\\/g>'));
  assert.ok(match, 'Missing plotted series ' + key); return match[1];
}
function fixedIDs(value, kind) {
  const document = structuredClone(value), ids = new Map();
  const collect = (entry) => {
    if (!entry || typeof entry !== 'object') return;
    if (typeof entry.id === 'string' && !ids.has(entry.id)) ids.set(entry.id, `${kind}-fixed-${ids.size + 1}`);
    Object.values(entry).forEach(collect);
  };
  const replace = (entry) => typeof entry === 'string' ? ids.get(entry) ?? entry : Array.isArray(entry) ? entry.map(replace)
    : entry && typeof entry === 'object' ? Object.fromEntries(Object.entries(entry).map(([key, nested]) => [key, replace(nested)])) : entry;
  collect(document); return replace(document);
}

// Recorded from immutable compiler 78e64961d0b23fe4619af4e8f5ea78ee025adcd9
// with the same fixed-ID documents/options, not from the changed renderer.
const LEGACY_FINGERPRINTS = {
  'course:false': { html: 'b140360ac969981b204aa9dbe99b07d1868f058ebb93230061a0a15f47de48d6', manifest: 'fa5a82fb6bfe09bbb8a4f0ff057abda2bc081dfb6f615c60148762cc10dcc91c' },
  'course:true': { html: '1cc5c88be5f31a0493364467be927129f05bfc9b18ef0dcf36ef00de9d002452', manifest: '8a95724246d27f9e68bb01cb432b7c0fa1f8dc0b4c6f61a65e594a0d3f119eb9' },
  'slides:false': { html: 'ae919701c58aee0ed5076a7fbf7ef588961a30efdfc2b16b0ef5c8c09c672932', manifest: '9cdf66372ed3c3fc316ff25f17f242733f71b3f9ecc48b4d88fe4dcab3100fbf' },
  'slides:true': { html: 'cef6de2fcc5995774d5627cbc7e426dc68dc8430a4a128fddd7a57c684f6596c', manifest: '088a56fd48769d319b4ee0437af3ae8181e50701673fb0e63533b037a560602c' },
};
export async function reportArtifactLegacyFingerprints() {
  const results = {};
  for (const [kind, factory] of [['course', createStarterCourseDocument], ['slides', createStarterSlidesDocument]]) {
    for (const preview of [false, true]) {
      const document = fixedIDs(factory(), kind), value = await compile(document, { visualizationId: `authored-${kind}`, preview });
      results[`${kind}:${preview}`] = { html: sha256(value.html), manifest: sha256(JSON.stringify(value.manifest)) };
    }
  }
  return results;
}

export function registerReportArtifactChecks(test) {
  test('standalone Report compilation is deterministic with hashes covering exact authored document and output', async () => {
    const document = report(), first = await compile(document), second = await compile(document);
    assert.deepEqual(plain(first), plain(second));
    assert.equal(first.manifest.documentHash, contentHash(document));
    assert.equal(first.manifest.artifactHash, contentHash(first.html)); assert.equal(first.contentHash, first.manifest.artifactHash);
    assert.equal(first.manifest.rendererVersion, 'visualization-report-html-v2');
    assert.equal(first.manifest.createdAt, options.createdAt);
  });

  test('compilation preserves frozen layout, snapshot, source and evidence values without annotation', async () => {
    const document = report(), before = plain(document), result = await compile(freeze(document));
    assert.deepEqual(plain(document), before);
    assert.deepEqual(plain(result.manifest.sourceHashes), ['authored-source-hash']);
    assert.deepEqual(plain(result.manifest.assetReferences), ['authored-image-asset']);
    assert.equal(result.manifest.documentHash, sha256(canonicalSerialize(before)));
    assert.deepEqual(plain(result.warnings), []);
  });

  test('Report HTML contains its standalone container and complete grid rather than a runtime dependency', async () => {
    const { html } = await compile();
    assert.match(html, /<div class="report-artifact">/); assert.match(mainOf(html), /<div class="report-grid">/);
    assert.doesNotMatch(html, /<script\b[^>]*\bsrc=|recharts|_next\/|https:\/\/cdn/);
  });

  for (const [breakpoint, placement] of [['sm', { x: 1, y: 2, w: 4, h: 4 }], ['md', { x: 5, y: 1, w: 4, h: 3 }], ['lg', { x: 9, y: 1, w: 4, h: 2 }]]) {
    test(`standalone ${breakpoint} placement uses its own numeric CSS starts and spans`, async () => {
      const { html } = await compile(), cell = cellOf(html, 'heading');
      for (const [key, value] of Object.entries(placement)) assert.ok(cell.includes(`--iv-${breakpoint}-${key}:${value}`), cell);
    });
  }

  test('container breakpoints, columns, row heights and gaps match Report authoring geometry', async () => {
    const css = cssOf((await compile()).html).replace(/\s+/g, '');
    assert.match(css, /container-name:iv-report-artifact/); assert.match(css, /container-type:inline-size/);
    assert.match(css, /@containeriv-report-artifact\(min-width:768px\)/); assert.match(css, /@containeriv-report-artifact\(min-width:1024px\)/);
    for (const columns of [4, 8, 12]) assert.ok(css.includes(`repeat(${columns},minmax(0,1fr))`));
    assert.match(css, /grid-auto-rows:40px/); assert.match(css, /gap:12px/);
  });

  test('source DOM reading order survives a different visual order at every breakpoint', async () => {
    const document = report();
    for (const items of Object.values(document.report.layouts)) for (const [index, item] of items.entries()) item.y = (items.length - index - 1) * 8;
    const body = mainOf((await compile(document)).html), ids = [...body.matchAll(/data-report-block="([^"]+)"/g)].map((match) => match[1]);
    assert.deepEqual(ids, document.report.blocks.map((block) => block.id));
  });

  test('every grid region is named and keyboard-focusable while overflowing content remains scrollable', async () => {
    const document = report(), { html } = await compile(document);
    document.report.blocks.forEach((block, index) => {
      const cell = cellOf(html, block.id); assert.ok(cell.includes(`aria-label="Report block ${index + 1}: ${block.kind}"`)); assert.ok(cell.includes('tabindex="0"'));
    });
    assert.match(cssOf(html).replace(/\s+/g, ''), /\.report-cell\{[^}]*overflow:auto/);
    for (const note of ['Authored metric provenance.', 'Authored chart source.', 'Authored chart provenance.', 'Illustrative values.', 'Authored table provenance.', 'Nested authored qualification.', 'Nested metric provenance.']) assert.ok(html.includes(note), note);
  });

  test('print CSS expands Report cells into source flow without fixed-size clipping', async () => {
    const css = cssOf((await compile()).html).replace(/\s+/g, ''), print = css.slice(css.indexOf('@mediaprint'));
    assert.match(print, /^@mediaprint/); assert.match(print, /\.report-grid\{[^}]*display:block/);
    assert.match(print, /\.report-cell\{[^}]*overflow:visible/); assert.match(print, /height:auto/);
  });

  test('export keeps document metadata, Report context and edited link/image text visible', async () => {
    const { html } = await compile();
    for (const text of ['Authored standalone Report', 'Authored subtitle', 'Authored summary.', 'Authored search title', 'Authored search description', 'Which authored option should we choose?', 'Authored executive conclusion.', 'Authored link context.', 'Authored image description.', 'Authored independent image caption.']) assert.ok(html.includes(text), text);
  });

  test('the visible source appendix preserves supplied source/dataset records and a zero row count without internal IDs', async () => {
    const document = report(); document.sourceManifest[0].id = 'private-source-record-id'; document.report.dataSources[0].id = 'private-dataset-record-id'; document.report.dataSources[0].rowCount = 0;
    const before = plain(document), result = await compile(freeze(document)), start = result.html.indexOf('<section class="report-sources"');
    assert.ok(start > result.html.indexOf('class="report-grid"'));
    const appendix = result.html.slice(start, result.html.indexOf('</main>', start));
    assert.match(appendix, /aria-label="Sources"/); assert.match(appendix, /aria-label="Source records"/); assert.match(appendix, /aria-label="Dataset snapshots"/);
    for (const value of ['Authored source', 'authored-source-hash', 'Authored source context.', 'Authored snapshot', 'authored-snapshot-hash', 'Authored immutable snapshot.']) assert.ok(appendix.includes(value), value);
    assert.match(appendix, /Supplied row count<\/dt><dd>0<\/dd>/);
    assert.doesNotMatch(appendix, /private-source-record-id|private-dataset-record-id|<details|\bhidden\b/);
    assert.deepEqual(plain(result.manifest.sourceHashes), ['authored-source-hash']); assert.deepEqual(plain(document), before);
  });

  test('source appendix labels, provenance and supplied hashes remain escaped text', async () => {
    const document = report();
    document.sourceManifest[0].label = '<source-label>'; document.sourceManifest[0].provenance = '<script>source()</script>'; document.sourceManifest[0].contentHash = '<source-hash>&"';
    document.report.dataSources[0].label = '<dataset-label>'; document.report.dataSources[0].provenance = '<img src=x onerror=dataset()>'; document.report.dataSources[0].contentHash = '<dataset-hash>';
    const { html } = await compile(document), appendix = html.slice(html.indexOf('<section class="report-sources"'));
    for (const value of ['&lt;source-label&gt;', '&lt;script&gt;source()&lt;/script&gt;', '&lt;source-hash&gt;&amp;&quot;', '&lt;dataset-label&gt;', '&lt;img src=x onerror=dataset()&gt;', '&lt;dataset-hash&gt;']) assert.ok(appendix.includes(value), value);
    assert.doesNotMatch(appendix, /<script>source|<img src=x|<source-label>|<dataset-label>/);
  });

  test('empty source and snapshot collections omit the appendix instead of inventing citations', async () => {
    const document = report(); document.sourceManifest = []; document.report.dataSources = [];
    const { html } = await compile(document);
    assert.doesNotMatch(html, /class="report-sources"|aria-label="Source records"|aria-label="Dataset snapshots"|authored-source-hash|authored-snapshot-hash/);
  });

  test('Report narrative paragraph breaks survive escaped standalone text', async () => {
    const document = report(); document.report.blocks[1].text = 'First\n\n<script>authored()</script>';
    const { html } = await compile(document);
    assert.ok(html.includes('First\n\n&lt;script&gt;authored()&lt;/script&gt;'));
    assert.match(cssOf(html), /white-space:\s*pre-wrap/); assert.doesNotMatch(html, /<script>authored/);
  });

  test('hostile IDs and text stay escaped attributes/text and never become CSS selectors', async () => {
    const document = report(), id = '"/><script>authoredID()</script><x id="';
    document.report.blocks[0].id = id; document.report.blocks[0].text = '<img src=x onerror=authored()> & evidence';
    for (const items of Object.values(document.report.layouts)) items[0].blockId = id;
    const { html } = await compile(document), css = cssOf(html);
    assert.ok(html.includes('&lt;script&gt;authoredID()&lt;/script&gt;')); assert.ok(html.includes('&lt;img src=x onerror=authored()&gt; &amp; evidence'));
    assert.doesNotMatch(html, /<script>authoredID|<img src=x/); assert.ok(!css.includes(id));
    assert.deepEqual(plain((await compile(document)).warnings), []);
  });

  test('Report theme text cannot terminate the standalone style element', async () => {
    const document = report(); document.theme.bodyFont = '</style><script>authoredTheme()</script>';
    const { html } = await compile(document);
    assert.equal((html.match(/<style>/g) || []).length, 1); assert.equal((html.match(/<\/style>/g) || []).length, 1);
    assert.doesNotMatch(html, /<script>authoredTheme/); assert.match(cssOf(html), /\\3c\s*\/style>/);
  });

  for (const [name, change] of [
    ['empty generated layouts', (doc) => { doc.report.layouts = { lg: [], md: [], sm: [] }; }],
    ['a sparse breakpoint', (doc) => { doc.report.layouts.md.pop(); }],
    ['duplicate placement identities', (doc) => { doc.report.layouts.lg[1].blockId = 'heading'; }],
    ['unknown placement identities', (doc) => { doc.report.layouts.sm[0].blockId = 'missing'; }],
    ['duplicate document block IDs', (doc) => { doc.report.blocks[1].id = 'heading'; }],
    ['fractional geometry', (doc) => { doc.report.layouts.lg[0].x = 8.5; }],
    ['negative geometry', (doc) => { doc.report.layouts.md[0].y = -1; }],
    ['zero dimensions', (doc) => { doc.report.layouts.sm[0].h = 0; }],
    ['column overflow', (doc) => { doc.report.layouts.sm[0].w = 5; }],
    ['overlap', (doc) => { doc.report.layouts.lg[1].y = 0; }],
    ['minimum constraints', (doc) => { doc.report.layouts.lg[0].minW = 5; }],
    ['maximum constraints', (doc) => { doc.report.layouts.md[0].maxH = 2; }],
  ]) {
    test(`${name} falls back to complete readable source flow with one structured warning`, async () => {
      const document = report(); change(document); const before = plain(document), result = await compile(freeze(document));
      assert.match(mainOf(result.html), /<div class="report-flow">/); assert.doesNotMatch(mainOf(result.html), /<div class="report-grid">|tabindex="0"|--iv-(?:sm|md|lg)-x/);
      assert.equal(result.warnings.length, 1); assert.equal(result.warnings[0].code, 'REPORT_LAYOUT_FALLBACK'); assert.equal(typeof result.warnings[0].message, 'string');
      for (const text of ['Authored heading', 'Authored narrative', 'Authored metric', 'Authored graph', 'Authored table', 'Nested authored qualification.']) assert.ok(result.html.includes(text), text);
      assert.deepEqual(plain(document), before);
    });
  }

  test('valid standalone layouts beyond the editor row ceiling retain their authored geometry', async () => {
    const document = report();
    for (const items of Object.values(document.report.layouts)) for (const item of items) item.y += 500;
    const result = await compile(document);
    assert.deepEqual(plain(result.warnings), []); assert.match(mainOf(result.html), /class="report-grid"/); assert.ok(cellOf(result.html, 'heading').includes('--iv-lg-y:501'));
  });

  for (const [y, grid] of [[9998, true], [9999, false], [Number.MAX_SAFE_INTEGER - 2, false]]) {
    test(`standalone grid line representability is explicit at logical row ${y}`, async () => {
      const document = report(); document.report.blocks = [document.report.blocks[0]];
      for (const [breakpoint, columns] of [['lg', 12], ['md', 8], ['sm', 4]]) document.report.layouts[breakpoint] = [{ blockId: 'heading', x: 0, y, w: columns, h: 1 }];
      const result = await compile(document);
      if (grid) { assert.deepEqual(plain(result.warnings), []); assert.ok(cellOf(result.html, 'heading').includes('--iv-lg-y:9999')); }
      else { assert.equal(result.warnings[0].code, 'REPORT_LAYOUT_FALLBACK'); assert.match(mainOf(result.html), /class="report-flow"/); assert.doesNotMatch(mainOf(result.html), /--iv-lg-y/); }
    });
  }

  for (const type of ['line', 'bar', 'area', 'composed']) {
    test(`${type} chart preserves both supplied series, signed/zero/null values and accessible table data`, async () => {
      const { html } = await compile(chartDocument(type)), svgs = svgsOf(html);
      assert.equal(svgs.length, 1); assert.doesNotMatch(svgs[0], /NaN|Infinity/);
      assert.ok(seriesGroup(svgs[0], 'alpha')); assert.ok(seriesGroup(svgs[0], 'beta'));
      assert.match(html, /class="chart-legend"/); assert.match(html, /class="chart-data"/);
      for (const label of ['Alpha', 'Beta', 'Authored chart source.', 'Authored chart provenance.', 'Illustrative values.']) assert.ok(html.includes(label), label);
      const cells = tags(html, 'td');
      assert.deepEqual(cells.filter((cell) => cell['data-column-key'] === 'alpha').map((cell) => cell['data-value-type']), ['number', 'number', 'number']);
      assert.deepEqual(cells.filter((cell) => cell['data-column-key'] === 'beta').map((cell) => cell['data-value-type']), ['number', 'null', 'number']);
      for (const value of ['-10', '0', '10', '5', '-5']) assert.ok(html.includes('>' + value + '</td>'), value);
      assert.match(html, /data-value-type="null"[^>]*>Empty<\/td>/);
    });
  }

  test('bar SVG keeps negative bars below zero and positive bars above it, with zero height for zero', async () => {
    const svg = svgsOf((await compile(chartDocument('bar'))).html)[0], zero = Number(attributes(svg.match(/<svg\b[^>]*>/)[0])['data-zero-y']);
    assert.ok(Number.isFinite(zero));
    const bars = tags(svg, 'rect', 'chart-bar'); assert.equal(bars.length, 5);
    assert.deepEqual(bars.map((bar) => Number(bar['data-value'])).sort((a, b) => a - b), [-10, -5, 0, 5, 10]);
    for (const bar of bars) {
      const value = Number(bar['data-value']), y = Number(bar.y), height = Number(bar.height);
      assert.ok(Number.isFinite(y) && Number.isFinite(height) && height >= 0);
      if (value < 0) { assert.ok(Math.abs(y - zero) < 0.002); assert.ok(height > 0); }
      if (value > 0) { assert.ok(y < zero); assert.ok(Math.abs(y + height - zero) < 0.002); }
      if (value === 0) { assert.equal(height, 0); assert.ok(Math.abs(y - zero) < 0.002); }
    }
  });

  for (const type of ['line', 'area']) {
    test(`${type} plotted coordinates preserve signed magnitude ratios and connect the actual observations`, async () => {
      const svg = svgsOf((await compile(chartDocument(type))).html)[0], zero = Number(attributes(svg.match(/<svg\b[^>]*>/)[0])['data-zero-y']);
      const alpha = tags(seriesGroup(svg, 'alpha'), 'circle', 'chart-point'), beta = tags(seriesGroup(svg, 'beta'), 'circle', 'chart-point');
      assert.deepEqual(alpha.map((point) => Number(point['data-value'])), [-10, 0, 10]); assert.deepEqual(beta.map((point) => Number(point['data-value'])), [5, -5]);
      assert.ok(Number(alpha[0].cy) > zero); assert.equal(Number(alpha[1].cy), zero); assert.ok(Number(alpha[2].cy) < zero);
      assert.ok(Math.abs(Number(beta[0].cy) - (zero + Number(alpha[2].cy)) / 2) < 0.002);
      assert.ok(Math.abs(Number(beta[1].cy) - (zero + Number(alpha[0].cy)) / 2) < 0.002);
      assert.ok(Math.abs(Number(alpha[1].cx) - (Number(alpha[0].cx) + Number(alpha[2].cx)) / 2) < 0.002);
      const line = tags(seriesGroup(svg, 'alpha'), 'path', 'chart-line')[0];
      assert.deepEqual(line.d.split(/\s+/), alpha.map((point, index) => `${index ? 'L' : 'M'}${point.cx},${point.cy}`));
      if (type === 'area') {
        const area = tags(seriesGroup(svg, 'alpha'), 'path', 'chart-area')[0];
        assert.ok(area.d.startsWith(`M${alpha[0].cx},${zero} `)); assert.ok(area.d.endsWith(`L${alpha.at(-1).cx},${zero} Z`));
      }
    });
    test(`${type} SVG segments stop at nulls and isolated non-null observations remain plotted`, async () => {
      const data = [
        { label: 'A', alpha: -10, beta: 6 }, { label: 'B', alpha: null, beta: 5 },
        { label: 'C', alpha: 0, beta: null }, { label: 'D', alpha: 10, beta: 3 },
        { label: 'E', alpha: null, beta: null }, { label: 'F', alpha: 5, beta: 1 },
      ];
      const svg = svgsOf((await compile(chartDocument(type, data))).html)[0];
      for (const key of ['alpha', 'beta']) {
        const group = seriesGroup(svg, key), paths = tags(group, 'path').filter((tag) => tag['data-start-row'] !== undefined);
        assert.ok(paths.length > 0);
        for (const item of paths) {
          const start = Number(item['data-start-row']), end = Number(item['data-end-row']);
          assert.ok(Number.isSafeInteger(start) && Number.isSafeInteger(end) && start <= end);
          assert.ok(data.slice(start, end + 1).every((row) => row[key] !== null), 'A path must not bridge missing observations.');
          if ((item.class ?? '').split(' ').includes('chart-line')) {
            const points = tags(group, 'circle', 'chart-point').filter((point) => Number(point['data-row-index']) >= start && Number(point['data-row-index']) <= end);
            assert.deepEqual(item.d.split(/\s+/), points.map((point, index) => `${index ? 'L' : 'M'}${point.cx},${point.cy}`));
          }
        }
        const points = tags(group, 'circle', 'chart-point').map((point) => Number(point['data-row-index']));
        for (const index of key === 'alpha' ? [0, 5] : [3, 5]) assert.ok(points.includes(index), `${key} isolated row ${index}`);
      }
      assert.doesNotMatch(svg, /NaN|Infinity/);
      if (type === 'area') assert.ok(tags(svg, 'path', 'chart-area').some((tag) => /Z\s*$/i.test(tag.d)), 'An area segment must close against its baseline.');
    });
  }

  test('composed SVG renders real bar and line geometry rather than relabelling one chart kind', async () => {
    const svg = svgsOf((await compile(chartDocument('composed'))).html)[0];
    assert.ok(tags(svg, 'rect', 'chart-bar').length > 0); assert.ok(tags(svg, 'path', 'chart-line').length > 0);
  });

  for (const type of ['pie', 'donut']) {
    test(`${type} renders separate series facets with faithful positive slices and no fabricated zero/null slice`, async () => {
      const document = chartDocument(type, [{ label: 'A', alpha: 10, beta: 0 }, { label: 'B', alpha: 20, beta: null }, { label: 'C', alpha: 0, beta: 30 }]);
      const { html } = await compile(document), svgs = svgsOf(html);
      assert.equal(svgs.length, 2); assert.match(html, /class="chart-facet"[^>]*data-series-key="alpha"/); assert.match(html, /class="chart-facet"[^>]*data-series-key="beta"/);
      const slices = svgs.flatMap((svg) => [...tags(svg, 'path', 'chart-slice'), ...tags(svg, 'circle', 'chart-slice')]);
      assert.deepEqual(slices.map((slice) => Number(slice['data-value'])).sort((a, b) => a - b), [10, 20, 30]);
      assert.ok(slices.filter((slice) => slice.d).every((slice) => /A/i.test(slice.d)), 'Circular slices must contain actual arc geometry.');
      if (type === 'donut') assert.ok(slices.every((slice) => slice['fill-rule'] === 'evenodd' && (slice.d.match(/A/gi) || []).length >= 2), 'Every donut slice must include an inner hole.');
      if (type === 'donut') for (const slice of slices) {
        const radii = [...slice.d.matchAll(/A([\d.]+),([\d.]+)/g)].map((match) => { assert.equal(match[1], match[2]); return Number(match[1]); });
        assert.ok(Math.min(...radii) > 0 && Math.min(...radii) < Math.max(...radii), 'An actual smaller inner radius is required for the hole.');
      }
      const first = slices.find((slice) => Number(slice['data-value']) === 10), arc = first.d.match(/^M([\d.-]+),([\d.-]+) A([\d.]+),([\d.]+) 0 ([01]) 1 ([\d.-]+),([\d.-]+)/);
      assert.ok(arc, 'The first slice needs inspectable circular arc geometry.');
      const centerX = Number(arc[1]), radius = Number(arc[3]), centerY = Number(arc[2]) + radius, angle = -Math.PI / 2 + 2 * Math.PI * (10 / 30);
      assert.equal(arc[5], '0'); assert.ok(Math.abs(Number(arc[6]) - (centerX + Math.cos(angle) * radius)) < 0.002); assert.ok(Math.abs(Number(arc[7]) - (centerY + Math.sin(angle) * radius)) < 0.002);
      for (const svg of svgs) assert.doesNotMatch(svg, /NaN|Infinity/);
    });
    test(`${type} negative observations are visibly unavailable while the complete data table and notes remain`, async () => {
      const { html } = await compile(chartDocument(type));
      assert.equal(svgsOf(html).length, 0); assert.match(html, /Chart unavailable/);
      assert.ok(html.includes('>-10</td>')); assert.ok(html.includes('>-5</td>')); assert.ok(html.includes('Authored chart provenance.'));
    });
    test(`${type} zero-total observations never manufacture a circular graph`, async () => {
      const { html } = await compile(chartDocument(type, [{ label: 'A', alpha: 0, beta: 0 }]));
      assert.equal(svgsOf(html).length, 0); assert.match(html, /class="chart-data"/); assert.ok(html.includes('>0</td>'));
    });
  }

  for (const [name, data] of [
    ['nonnumeric', [{ label: 'A', alpha: 'not a number', beta: 2 }]],
    ['numeric-looking string', [{ label: 'A', alpha: '12.5', beta: 2 }]],
    ['missing series cell', [{ label: 'A', beta: 2 }]],
  ]) {
    test(`${name} data is preserved in the table and never coerced into plotted numbers`, async () => {
      const { html } = await compile(chartDocument('bar', data));
      assert.equal(svgsOf(html).length, 0); assert.match(html, /Chart unavailable/); assert.match(html, /class="chart-data"/);
      if (name === 'missing series cell') assert.match(html, /data-value-type="missing"[^>]*>Missing<\/td>/);
      else assert.ok(html.includes('>' + data[0].alpha + '</td>'));
    });
  }

  test('empty chart data keeps title, source, provenance and illustrative qualification with no SVG', async () => {
    const { html } = await compile(chartDocument('line', []));
    assert.equal(svgsOf(html).length, 0); assert.match(html, /No chart data available/);
    for (const value of ['Authored graph', 'Authored graph description.', 'Authored chart source.', 'Authored chart provenance.', 'Illustrative values.']) assert.ok(html.includes(value), value);
  });

  test('chart labels, extra data columns, source and SVG colors are escaped without dropping their table evidence', async () => {
    const document = chartDocument('bar', [{ label: '<A>', alpha: 1, beta: 2, note: '<img src=x onerror=authored()>' }]);
    const chart = document.report.blocks[0].chart;
    chart.series[0].label = '<script>Authored series</script>'; chart.series[0].color = '"><script>Authored color</script>';
    chart.source = '<script>Authored source</script>'; chart.provenance = 'Authored & incomplete';
    const { html } = await compile(document);
    for (const value of ['&lt;A&gt;', '&lt;script&gt;Authored series&lt;/script&gt;', '&lt;script&gt;Authored source&lt;/script&gt;', 'Authored &amp; incomplete', '&lt;img src=x onerror=authored()&gt;']) assert.ok(html.includes(value), value);
    assert.ok(tags(html, 'td').some((cell) => cell['data-column-key'] === 'note' && cell['data-value-type'] === 'string'));
    assert.doesNotMatch(html, /<script>Authored|<img src=x/);
  });

  test('zero-only Cartesian values remain honest zero-height bars rather than decorative positive values', async () => {
    const svg = svgsOf((await compile(chartDocument('bar', [{ label: 'A', alpha: 0, beta: 0 }]))).html)[0], bars = tags(svg, 'rect', 'chart-bar');
    assert.equal(bars.length, 2); assert.ok(bars.every((bar) => Number(bar.height) === 0 && Number(bar['data-value']) === 0)); assert.doesNotMatch(svg, /NaN|Infinity/);
  });

  test('finite extreme Cartesian magnitudes stay finite in geometry and retain exact table values', async () => {
    for (const type of ['bar', 'line', 'area', 'composed']) {
      const { html } = await compile(chartDocument(type, [{ label: 'A', alpha: -1e308, beta: 5e307 }, { label: 'B', alpha: 1e308, beta: -5e307 }]));
      const svgs = svgsOf(html); assert.equal(svgs.length, 1); assert.doesNotMatch(svgs[0], /NaN|Infinity/);
      for (const value of ['-1e+308', '1e+308', '5e+307', '-5e+307']) assert.ok(html.includes('>' + value + '</td>'), value);
    }
  });

  for (const [name, change] of [
    ['duplicate series keys', (chart) => { chart.series[1].key = 'alpha'; }],
    ['blank series keys', (chart) => { chart.series[0].key = ''; }],
  ]) {
    test(`${name} produces an explicit unavailable chart without inventing or losing table values`, async () => {
      const document = chartDocument('bar'); change(document.report.blocks[0].chart);
      const { html } = await compile(document);
      assert.equal(svgsOf(html).length, 0); assert.match(html, /Chart unavailable/);
      assert.ok(html.includes('>-10</td>')); assert.ok(html.includes('>-5</td>')); assert.ok(html.includes('Authored chart source.'));
    });
  }

  test('preview/download artifacts contain no analytics or persistent-progress code', async () => {
    const result = await compile();
    assert.doesNotMatch(result.html, /sendBeacon|\/api\/events|localStorage/);
    assert.ok(result.manifest.runtimeFeatures.includes('no-analytics')); assert.ok(result.manifest.runtimeFeatures.includes('no-external-js'));
  });

  test('existing published runtime selection remains explicit rather than changing export metadata silently', async () => {
    const result = await compile(report(), { preview: false });
    assert.match(result.html, /sendBeacon/); assert.ok(result.manifest.runtimeFeatures.includes('analytics-beacon'));
    assert.equal(result.manifest.rendererVersion, 'visualization-report-html-v2');
  });

  for (const kind of ['course', 'slides']) for (const preview of [false, true]) {
    test(`existing ${kind} preview=${preview} HTML and manifest exactly match immutable baseline fingerprints`, async () => {
      const fingerprints = await reportArtifactLegacyFingerprints(), key = `${kind}:${preview}`;
      assert.ok(LEGACY_FINGERPRINTS[key], 'Baseline fingerprints must be recorded before running this check.');
      assert.deepEqual(fingerprints[key], LEGACY_FINGERPRINTS[key]);
    });
  }
}
