// Tier 2: authored report data through the actual React renderer. Recharts and
// ReactDOM run in SSR mode; no browser, chart layout, backend or model executes.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const repository = fileURLToPath(new URL('../../', import.meta.url));
const project = process.env.IV_TEST_PROJECT_ROOT || repository;
const load = createRequire(path.join(project, 'package.json'));
const ts = load('typescript');
const React = load('react');
const { renderToStaticMarkup } = load('react-dom/server');
const sourcePath = process.env.IV_REPORT_PREVIEW_SOURCE
  || path.join(repository, 'components/visualizations/renderers/report-preview.tsx');
const source = await readFile(sourcePath, 'utf8');
const sourceTree = ts.createSourceFile(sourcePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const sourceFunctions = sourceTree.statements.filter((node) => ts.isFunctionDeclaration(node) && node.name).map((node) => node.name.text);
assert.ok(sourceFunctions.includes('ChartBlock'), 'The actual chart renderer must be present in both current and baseline source.');
// Test-only exposure of the existing declaration avoids changing production
// exports and keeps baseline checks on its real ChartBlock implementation.
const inspectedSource = source + '\nexports.__ChartBlock = ChartBlock;\nexports.__SourceFunctions = [' + sourceFunctions.join(',') + '];\n';
const compiled = ts.transpileModule(inspectedSource, {
  fileName: sourcePath,
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
    jsx: ts.JsxEmit.ReactJSX,
  },
  reportDiagnostics: true,
});
assert.equal(compiled.diagnostics.length, 0, 'The actual renderer must transpile without syntax diagnostics.');
const runtime = new Map([
  ['react/jsx-runtime', load('react/jsx-runtime')],
  ['recharts', load('recharts')],
]);
const helperFiles = ['lib/client/report-grid.ts', 'lib/client/report-chart-model.ts', 'lib/client/report-chart-projection.ts'];
function actualHelper(relative) {
  assert.ok(helperFiles.includes(relative), 'Only the bounded chart/grid helper set may load.');
  const specifier = '@/' + relative.slice(0, -3);
  if (runtime.has(specifier)) return runtime.get(specifier);
  const file = path.join(repository, relative), child = { exports: {} };
  runtime.set(specifier, child.exports);
  const result = ts.transpileModule(readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }, reportDiagnostics: true,
  });
  assert.equal(result.diagnostics.length, 0);
  vm.runInNewContext('(function(exports,require,module){\n' + result.outputText + '\n})', {})(child.exports,
    (dependency) => {
      if (dependency.startsWith('@/lib/client/')) return actualHelper(dependency.slice(2) + '.ts');
      if (dependency.startsWith('./')) return actualHelper(path.posix.join(path.posix.dirname(relative), dependency) + '.ts');
      throw new Error('Unexpected pure preview-helper runtime import: ' + dependency);
    }, child);
  return child.exports;
}
for (const relative of helperFiles) {
  // Baseline source imports only report-grid; its comparison must not require
  // a new helper that did not exist in that immutable revision.
  if (source.includes('@/' + relative.slice(0, -3))) actualHelper(relative);
}
const moduleRecord = { exports: {} };
vm.runInNewContext('(function (exports, require, module) {\n' + compiled.outputText + '\n})', {
  fetch() { throw new Error('Network is forbidden in report preview checks.'); },
}, { filename: sourcePath })(
  moduleRecord.exports,
  (specifier) => {
    assert.ok(runtime.has(specifier), 'Unexpected renderer runtime import: ' + specifier);
    return runtime.get(specifier);
  },
  moduleRecord,
);
const { ReportPreview } = moduleRecord.exports;

export const reportPreviewHarness = {
  React, Recharts: runtime.get('recharts'), ChartBlock: moduleRecord.exports.__ChartBlock,
  sourceFunctions: new Set(moduleRecord.exports.__SourceFunctions),
};

function chart(overrides = {}) {
  return {
    id: 'authored-chart', type: 'bar', title: 'Authored chart title',
    description: 'Authored chart description', xKey: 'month',
    series: [{ key: 'amount', label: 'Authored series' }],
    data: [{ month: 'January', amount: 12 }, { month: 'February', amount: 24 }],
    source: 'Authored source, separate from qualification',
    provenance: 'Authored chart qualification: extrapolated from the supplied two months.',
    accessibleLabel: 'Authored accessible chart description', illustrative: true,
    ...overrides,
  };
}

function kpi(overrides = {}) {
  return {
    id: 'authored-kpi', kind: 'kpi', label: 'Authored metric label', value: '42%',
    detail: 'Authored metric detail', provenance: 'Authored KPI qualification: only the supplied sample.',
    ...overrides,
  };
}

function table(overrides = {}) {
  return {
    id: 'authored-table', kind: 'data-table', title: 'Authored table title',
    columns: ['Authored column A', 'Authored column B'], rows: [['Authored cell', '17']],
    provenance: 'Authored table qualification: incomplete observations.', ...overrides,
  };
}

function report(blocks) {
  return {
    title: 'Authored report title', summary: 'Authored report summary',
    theme: { background: '#ffffff', foreground: '#222222', bodyFont: 'sans-serif',
      accent: '#ff6f4d', muted: '#eeeeee', border: '#dddddd', displayFont: 'serif' },
    report: { decisionQuestion: 'Authored decision question?', executiveSummary: 'Authored executive summary.', blocks },
  };
}

function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

function render(document) {
  return renderToStaticMarkup(React.createElement(ReportPreview, { document }));
}

export function registerReportPreviewChecks(test) {
  for (const type of ['line', 'bar', 'area', 'pie', 'donut', 'composed']) {
    for (const illustrative of [true, false]) {
      test(`${type} chart preserves its qualification, source and accessible label when illustrative=${illustrative}`, () => {
        const spec = chart({ type, illustrative });
        const document = freeze(report([{ id: 'authored-block', kind: 'chart', chart: spec }]));
        const before = structuredClone(document);
        const html = render(document);
        assert.ok(html.includes(spec.provenance), 'Supplied chart qualification must be visible.');
        assert.ok(html.includes('Source: ' + spec.source), 'The existing source is separate and unchanged.');
        assert.ok(html.includes(spec.title)); assert.ok(html.includes(spec.description));
        assert.ok(html.includes('role="img"')); assert.ok(html.includes('aria-label="' + spec.accessibleLabel + '"'));
        assert.equal(html.split('Illustrative values.').length - 1, illustrative ? 1 : 0);
        assert.doesNotMatch(html, /No chart data available\./);
        assert.deepEqual(document, before, 'Rendering must not annotate or change source values.');
      });
    }
  }

  test('KPI and table qualifications stay beside unchanged labels, values and rows', () => {
    const metric = kpi(), data = table();
    const html = render(freeze(report([metric, data])));
    for (const value of [metric.label, metric.value, metric.detail, metric.provenance,
      data.title, ...data.columns, ...data.rows[0], data.provenance]) assert.ok(html.includes(value), value);
    assert.ok(html.indexOf(metric.provenance) < html.indexOf(data.title));
    assert.ok(html.indexOf(data.provenance) > html.indexOf('</table>'));
  });

  test('recursive tabs retain qualifications for their nested chart, KPI and table', () => {
    const spec = chart(), metric = kpi(), data = table();
    const html = render(freeze(report([{
      id: 'outer-tabs', kind: 'tabs', tabs: [{ id: 'outer-tab', label: 'Authored outer tab', blocks: [
        { id: 'inner-tabs', kind: 'tabs', tabs: [{ id: 'inner-tab', label: 'Authored inner tab', blocks: [
          { id: 'nested-chart', kind: 'chart', chart: spec }, metric, data,
        ] }] },
      ] }],
    }])));
    for (const text of ['Authored outer tab', 'Authored inner tab', spec.provenance, metric.provenance, data.provenance]) {
      assert.ok(html.includes(text), text);
    }
    assert.equal(html.split('Illustrative values.').length - 1, 1);
  });

  for (const unavailable of ['data', 'series']) {
    test(`a chart with empty ${unavailable} retains its title and notes without inventing a graph`, () => {
      const spec = chart({ [unavailable]: [] });
      const html = render(freeze(report([{ id: 'empty-chart', kind: 'chart', chart: spec }])));
      for (const text of [spec.title, spec.description, spec.provenance, 'Source: ' + spec.source, 'Illustrative values.', 'No chart data available.']) {
        assert.ok(html.includes(text), text);
      }
      assert.doesNotMatch(html, /role="img"|recharts-responsive-container|<svg/);
    });
  }

  test('qualifications and source remain escaped text rather than executable markup', () => {
    const hostile = '<script>alert("authored")</script> & supplied <img src=x onerror=alert(1)>';
    const spec = chart({ provenance: 'Chart ' + hostile, source: 'Source ' + hostile });
    const html = render(freeze(report([
      { id: 'escaped-chart', kind: 'chart', chart: spec },
      kpi({ provenance: 'KPI ' + hostile }), table({ provenance: 'Table ' + hostile }),
    ])));
    for (const prefix of ['Chart ', 'Source ', 'KPI ', 'Table ']) {
      assert.ok(html.includes(prefix + '&lt;script&gt;alert(&quot;authored&quot;)&lt;/script&gt; &amp; supplied &lt;img'));
    }
    assert.doesNotMatch(html, /<script|<img src=x/);
  });

  test('empty qualifications and false illustrative flags do not invent extra notes', () => {
    const spec = chart({ illustrative: false, provenance: '', source: '' });
    const html = render(freeze(report([
      { id: 'plain-chart', kind: 'chart', chart: spec }, kpi({ provenance: '' }), table({ provenance: '' }),
    ])));
    assert.doesNotMatch(html, /Illustrative values\.|Source:|undefined|null|Authored .* qualification/);
    assert.ok(html.includes(spec.title)); assert.ok(html.includes('42%')); assert.ok(html.includes('Authored cell'));
  });

  function positioned() {
    const document = report([kpi(), table()]);
    document.subtitle = 'Authored responsive subtitle';
    document.report.layouts = {
      lg: [{ blockId: 'authored-kpi', x: 8, y: 0, w: 4, h: 3 }, { blockId: 'authored-table', x: 0, y: 0, w: 8, h: 6 }],
      md: [{ blockId: 'authored-kpi', x: 0, y: 0, w: 8, h: 3 }, { blockId: 'authored-table', x: 0, y: 3, w: 8, h: 6 }],
      sm: [{ blockId: 'authored-kpi', x: 0, y: 6, w: 4, h: 3 }, { blockId: 'authored-table', x: 0, y: 0, w: 4, h: 6 }],
    };
    return document;
  }

  test('complete layouts render all three positions without reordering or mutating block content', () => {
    const document = freeze(positioned()), before = structuredClone(document);
    const html = render(document);
    assert.match(html, /class="iv-report-grid"/);
    assert.match(html, /--iv-lg-x:9;--iv-lg-y:1;--iv-lg-w:4;--iv-lg-h:3/);
    assert.match(html, /--iv-sm-x:1;--iv-sm-y:7;--iv-sm-w:4;--iv-sm-h:3/);
    assert.ok(html.indexOf('Authored metric label') < html.indexOf('Authored table title'));
    assert.deepEqual(document, before);
  });

  test('grid regions keep chart/table qualifications scrollable and reachable by keyboard', () => {
    const html = render(positioned());
    assert.match(html, /<section[^>]*overflow-auto[^>]*aria-label="Report block 1: kpi"[^>]*tabindex="0"/);
    assert.match(html, /<section[^>]*aria-label="Report block 2: data-table"[^>]*tabindex="0"/);
    assert.ok(html.includes('Authored responsive subtitle'));
    assert.ok(html.includes('Authored KPI qualification'));
    assert.ok(html.includes('Authored table qualification'));
  });

  test('preview uses its container width and the same forty-pixel rows and twelve-pixel gaps as the editor', () => {
    const html = render(positioned());
    assert.match(html, /container-type:inline-size;container-name:iv-report/);
    assert.match(html, /@container iv-report \(min-width:768px\)/);
    assert.match(html, /@container iv-report \(min-width:1024px\)/);
    assert.match(html, /grid-auto-rows:40px; gap:12px/);
  });

  test('editor preview can force each breakpoint regardless of container width', () => {
    for (const breakpoint of ['lg', 'md', 'sm']) {
      const html = renderToStaticMarkup(React.createElement(ReportPreview, { document: positioned(), breakpoint }));
      assert.match(html, new RegExp('class="iv-report-grid" data-breakpoint="' + breakpoint + '"'));
    }
  });

  test('missing, duplicate, out-of-bounds and overlapping layouts keep all blocks readable in source order', () => {
    for (const change of [
      (doc) => { doc.report.layouts.lg = []; },
      (doc) => { doc.report.layouts.md[1].blockId = 'authored-kpi'; },
      (doc) => { doc.report.layouts.sm[0].y = 257; },
      (doc) => { doc.report.layouts.lg[0].x = 0; },
    ]) {
      const document = positioned(); change(document);
      const html = render(freeze(document));
      assert.doesNotMatch(html, /class="iv-report-grid"/);
      assert.ok(html.includes('Authored metric label'));
      assert.ok(html.includes('Authored table title'));
      assert.doesNotMatch(html, /tabindex="0"/);
    }
  });

  test('edited narrative text keeps paragraph breaks with escaped content', () => {
    const html = render(report([{ id: 'narrative', kind: 'rich-text', text: 'First paragraph\n\n<script>authored</script>' }]));
    assert.match(html, /whitespace-pre-wrap break-words/);
    assert.match(html, /First paragraph\n\n&lt;script&gt;authored&lt;\/script&gt;/);
  });

  test('edited link helper text and image description/caption remain visible as text', () => {
    const html = render(report([
      { id: 'authored-link', kind: 'cta', cta: { label: 'Read evidence', href: 'https://example.com/authored', helperText: 'Authored link context <supplied>' } },
      { id: 'authored-image', kind: 'image', assetId: 'attached-image', alt: 'Authored image description', caption: 'Authored independent caption' },
      { id: 'authored-alt-only', kind: 'image', assetId: 'attached-image', alt: 'Authored alt without caption' },
    ]));
    for (const value of ['Read evidence', 'Authored link context &lt;supplied&gt;', 'Authored image description', 'Authored independent caption', 'Authored alt without caption']) assert.ok(html.includes(value), value);
    assert.doesNotMatch(html, /<img/);
  });
}
