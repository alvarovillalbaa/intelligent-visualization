// Tier 2: authored report data through the actual React renderer. Recharts and
// ReactDOM run in SSR mode; no browser, chart layout, backend or model executes.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
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
const compiled = ts.transpileModule(source, {
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
const module = { exports: {} };
vm.runInNewContext('(function (exports, require, module) {\n' + compiled.outputText + '\n})', {
  fetch() { throw new Error('Network is forbidden in report preview checks.'); },
}, { filename: sourcePath })(
  module.exports,
  (specifier) => {
    assert.ok(runtime.has(specifier), 'Unexpected renderer runtime import: ' + specifier);
    return runtime.get(specifier);
  },
  module,
);
const { ReportPreview } = module.exports;

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
}
