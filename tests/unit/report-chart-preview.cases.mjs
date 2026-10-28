// T2: authored chart data through actual React SSR and actual ChartBlock source
// elements. Recharts is not painted; no browser, API, provider or model executes.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { reportPreviewHarness } from './report-preview.cases.mjs';

const repository = fileURLToPath(new URL('../../', import.meta.url));
const load = createRequire(path.join(process.env.IV_TEST_PROJECT_ROOT || repository, 'package.json'));
const { renderToStaticMarkup } = load('react-dom/server');
const { React, Recharts, ChartBlock, sourceFunctions } = reportPreviewHarness;
const TYPES = ['line', 'bar', 'area', 'pie', 'donut', 'composed'];

function spec(type = 'bar', overrides = {}) {
  return {
    id: 'authored-spec', type, title: 'Authored chart', description: 'Authored graph description.',
    accessibleLabel: 'Authored observation comparison', xKey: 'period',
    series: [{ key: 'alpha', label: 'Authored Alpha', color: '#2563eb' }, { key: 'beta', label: 'Authored Beta', color: '#db2777' }],
    data: [{ period: 'First', alpha: 5, beta: 12, annotation: 'Authored row one' },
      { period: 'Second', alpha: 0, beta: null, annotation: 'Authored row two' },
      { period: 'Third', alpha: 15, beta: 24, annotation: 'Authored row three' }],
    source: 'Authored independent source', provenance: 'Authored data qualification', illustrative: true,
    ...overrides,
  };
}

function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}

function render(value) {
  const before = structuredClone(value);
  const html = renderToStaticMarkup(React.createElement(ChartBlock, { spec: freeze(value) }));
  assert.deepEqual(value, before, 'SSR must not rewrite supplied values or qualification records.');
  return html;
}

function elements(value) {
  const before = structuredClone(value), result = [];
  let count = 0;
  function visit(node, depth = 0) {
    assert.ok(depth <= 32 && ++count <= 10_000, 'Source element traversal must stay bounded.');
    if (!React.isValidElement(node)) return;
    result.push(node);
    if (sourceFunctions.has(node.type)) { visit(node.type(node.props), depth + 1); return; }
    React.Children.forEach(node.props.children, (child) => visit(child, depth + 1));
  }
  visit(ChartBlock({ spec: freeze(value) }));
  assert.deepEqual(value, before, 'Source construction must not filter or alter supplied rows.');
  return result;
}

function nodes(value, type) { return elements(value).filter((node) => node.type === type); }
function graphNodes(value) {
  const charts = new Set([Recharts.BarChart, Recharts.LineChart, Recharts.AreaChart, Recharts.ComposedChart, Recharts.PieChart]);
  return elements(value).filter((node) => charts.has(node.type));
}
function projectedValues(mark, data) {
  assert.equal(typeof mark.props.dataKey, 'function', 'Plot values need a bounded projection accessor.');
  return Array.from(data, (point) => mark.props.dataKey(point));
}
function assertOpaqueRows(data, count) {
  assert.equal(data.length, count);
  assert.ok(data.every((point) => Object.keys(point).length === 0 && Object.getOwnPropertySymbols(point).length > 0), 'Plot wrappers must not expose reserved raw string fields to Recharts merges.');
}
function tooltipValue(tooltip, key, point, name = 'Authored series') {
  assert.equal(typeof tooltip.props.formatter, 'function', 'Tooltips need an exact raw-value lookup.');
  const result = tooltip.props.formatter(0.5, name, { dataKey: key, payload: point });
  return Array.isArray(result) ? result[0] : result;
}
function attributes(tag) { return Object.fromEntries([...tag.matchAll(/([\w:-]+)="([^"]*)"/g)].map((match) => [match[1], match[2]])); }
function cells(html) {
  return [...html.matchAll(/<td\b([^>]*)>([\s\S]*?)<\/td>/g)].map((match) => ({ ...attributes(match[1]), text: match[2] }));
}

export function registerReportChartPreviewChecks(test) {
  for (const type of TYPES) {
    test(`${type} preview retains every supplied series and extra observation column in an accessible table`, () => {
      const value = spec(type), html = render(value), values = cells(html);
      assert.match(html, /<caption[^>]*>Data: Authored chart<\/caption>/);
      assert.match(html, /scope="col"/); assert.match(html, /scope="row"/);
      assert.deepEqual(values.slice(0, 4).map((cell) => cell['data-column-key']), ['period', 'alpha', 'beta', 'annotation']);
      assert.equal(values.length, value.data.length * 4);
      for (const text of ['Authored Alpha', 'Authored Beta', 'Authored row one', 'Authored row two', 'Authored row three']) assert.ok(html.includes(text), text);
      assert.ok(values.some((cell) => cell['data-column-key'] === 'alpha' && cell['data-value-type'] === 'number' && cell.text === '0'));
      assert.ok(values.some((cell) => cell['data-column-key'] === 'beta' && cell['data-value-type'] === 'null' && cell.text === 'Empty'));
    });
  }

  test('composed charts select a real mixed chart with first-series bars and every remaining series as a line', () => {
    const value = spec('composed'); value.series.push({ key: 'gamma', label: 'Authored Gamma' });
    value.data.forEach((row, index) => { row.gamma = 30 + index; });
    const tree = elements(value), charts = tree.filter((node) => node.type === Recharts.ComposedChart);
    assert.equal(charts.length, 1); assertOpaqueRows(charts[0].props.data, value.data.length);
    assert.equal(tree.filter((node) => node.type === Recharts.BarChart).length, 0);
    const bars = tree.filter((node) => node.type === Recharts.Bar), lines = tree.filter((node) => node.type === Recharts.Line);
    assert.deepEqual(bars.map((node) => node.props.name), ['Authored Alpha']);
    assert.deepEqual(lines.map((node) => node.props.name), ['Authored Beta', 'Authored Gamma']);
    for (const [mark, key] of [[bars[0], 'alpha'], [lines[0], 'beta'], [lines[1], 'gamma']]) {
      assert.deepEqual(projectedValues(mark, charts[0].props.data), value.data.map((row) => row[key] === null ? null : row[key] / 32));
    }
    const html = render(value); assert.ok(html.includes('Authored Alpha (bars)')); assert.ok(html.includes('Authored Beta (line)')); assert.ok(html.includes('Authored Gamma (line)'));
  });

  for (const type of ['line', 'area', 'composed']) {
    test(`${type} preserves null gaps and isolated values through linear marks with visible point props`, () => {
      const value = spec(type), marks = elements(value).filter((node) => node.type === Recharts.Line || node.type === Recharts.Area);
      assert.equal(marks.length, type === 'composed' ? 1 : 2);
      for (const mark of marks) {
        assert.equal(mark.props.type, 'linear'); assert.equal(mark.props.connectNulls, false);
        assert.ok(mark.props.dot && typeof mark.props.dot === 'object' && mark.props.dot.r > 0, 'Isolated values need a point mark, not a disappearing one-point path.');
        if (mark.type === Recharts.Area) assert.equal(mark.props.baseValue, 0);
      }
    });
  }

  for (const type of ['bar', 'line', 'area', 'composed']) {
    test(`${type} uses a zero-inclusive numeric axis without discarding negative observations`, () => {
      const value = spec(type); value.data[0].alpha = -5;
      const axis = nodes(value, Recharts.YAxis); assert.equal(axis.length, 1);
      assert.equal(typeof axis[0].props.domain, 'function');
      for (const [domain, expected] of [[[2, 10], [0, 10]], [[-10, -2], [-10, 0]], [[-3, 6], [-3, 6]]]) {
        assert.deepEqual(Array.from(axis[0].props.domain(domain)), expected);
      }
      assert.ok(cells(render(value)).some((cell) => cell['data-value-type'] === 'number' && cell.text === '-5'));
    });
  }

  test('bar marks keep true zero without decorative positive minimum sizes', () => {
    for (const type of ['bar', 'composed']) {
      for (const mark of nodes(spec(type), Recharts.Bar)) assert.equal(mark.props.minPointSize, 0);
    }
  });

  for (const type of ['pie', 'donut']) {
    test(`${type} supplies one labelled graph for every series rather than silently using the first`, () => {
      const value = spec(type), html = render(value), tree = elements(value);
      const pies = tree.filter((node) => node.type === Recharts.Pie);
      assert.equal(pies.length, 2);
      for (const [index, pie] of pies.entries()) {
        assertOpaqueRows(pie.props.data, value.data.length); assert.equal(typeof pie.props.nameKey, 'function');
        const key = value.series[index].key, factor = index === 0 ? 15 : 24;
        assert.deepEqual(projectedValues(pie, pie.props.data), value.data.map((row) => row[key] === null ? null : row[key] / factor));
        assert.deepEqual(Array.from(pie.props.data, (point) => pie.props.nameKey(point)), value.data.map((row) => row.period));
        assert.equal(type === 'donut' ? pie.props.innerRadius !== 0 : pie.props.innerRadius === 0, true);
      }
      assert.equal(tree.filter((node) => node.type === Recharts.PieChart).length, 2);
      for (const series of value.series) {
        assert.ok(tree.some((node) => typeof node.type === 'string' && /^h[1-6]$/.test(node.type) && node.props.children === series.label), 'Each radial series needs its own semantic heading.');
        assert.ok(html.includes(`aria-label="${value.accessibleLabel} — ${series.label}"`));
      }
    });

    test(`${type} rejects negative and zero-total series individually while keeping their full data`, () => {
      const negative = spec(type); negative.data[0].alpha = -5;
      let html = render(negative);
      assert.ok(html.includes('Chart unavailable. Pie and donut values must be nonnegative.'));
      const remaining = nodes(negative, Recharts.Pie); assert.equal(remaining.length, 1);
      assert.deepEqual(projectedValues(remaining[0], remaining[0].props.data), [0.5, null, 1]);
      assert.ok(cells(html).some((cell) => cell['data-column-key'] === 'alpha' && cell.text === '-5'));
      const empty = spec(type); empty.data.forEach((row) => { row.alpha = 0; row.beta = null; });
      html = render(empty);
      assert.equal(graphNodes(empty).length, 0); assert.equal(html.split('This series has no positive values.').length - 1, 2);
      assert.equal(cells(html).filter((cell) => cell['data-value-type'] === 'null').length, 3);
    });
  }

  for (const [name, change, message] of [
    ['nonnumeric series', (value) => { value.data[1].alpha = 'Not a number'; }, 'Series values must be finite numbers or empty values.'],
    ['missing series cell', (value) => { delete value.data[1].alpha; }, 'A chart row is missing a series value.'],
    ['duplicate series key', (value) => { value.series[1].key = 'alpha'; }, 'Chart series keys are missing or duplicated.'],
    ['missing category cell', (value) => { delete value.data[1].period; }, 'A chart row is missing its category value.'],
    ['all-null Cartesian data', (value) => { value.data.forEach((row) => { row.alpha = null; row.beta = null; }); }, 'No numeric chart values were supplied.'],
  ]) {
    test(`${name} exposes its problem without inventing a graph or dropping table evidence`, () => {
      const value = spec(); change(value); const html = render(value);
      assert.equal(graphNodes(value).length, 0); assert.ok(html.includes('Chart unavailable. ' + message));
      assert.match(html, /<table\b/); assert.ok(html.includes(value.source)); assert.ok(html.includes(value.provenance));
      if (name === 'nonnumeric series') assert.ok(cells(html).some((cell) => cell['data-value-type'] === 'string' && cell.text === 'Not a number'));
      if (name === 'missing series cell') assert.ok(cells(html).some((cell) => cell['data-value-type'] === 'missing' && cell.text === 'Missing'));
    });
  }

  test('metadata and qualifications stay independent of graph availability and tables do not invent source claims', () => {
    const value = spec('line', { data: [], series: [] }), html = render(value);
    for (const text of [value.title, value.description, value.source, value.provenance, 'Illustrative values.', 'No chart data available.']) assert.ok(html.includes(text), text);
    assert.equal(graphNodes(value).length, 0); assert.match(html, /<caption[^>]*>Data: Authored chart<\/caption>/);
    const plainSpec = spec('line', { source: '', provenance: '', illustrative: false });
    assert.doesNotMatch(render(plainSpec), /Illustrative values\.|Source:|Authored data qualification/);
  });

  test('every chart type falls back to its title when an accessible label is empty', () => {
    for (const type of TYPES) {
      const value = spec(type, { accessibleLabel: '' });
      const images = elements(value).filter((node) => node.props.role === 'img');
      assert.equal(images.length, type === 'pie' || type === 'donut' ? 2 : 1);
      assert.ok(images.every((node) => typeof node.props['aria-label'] === 'string' && node.props['aria-label'].startsWith(value.title)));
    }
  });

  test('category and series bindings retain supplied values and use the same fallback palette as exported charts', () => {
    const value = spec('bar');
    value.series = Array.from({ length: 6 }, (_, index) => ({ key: 'value' + index, label: 'Series ' + index }));
    value.series[2].color = '#123456'; value.data = [{ period: 'Only category', ...Object.fromEntries(value.series.map((series, index) => [series.key, index])) }];
    const tree = elements(value), bars = tree.filter((node) => node.type === Recharts.Bar);
    assert.deepEqual(bars.map((bar) => bar.props.fill), ['#ff6f4d', '#7cd3ff', '#123456', '#a15cff', '#ffbf69', '#2563eb']);
    const chart = tree.find((node) => node.type === Recharts.BarChart), category = tree.find((node) => node.type === Recharts.XAxis).props.dataKey;
    assert.equal(typeof category, 'function'); assert.equal(category(chart.props.data[0]), 'Only category');
    const fallback = structuredClone(value); delete fallback.xKey;
    const fallbackTree = elements(fallback), fallbackChart = fallbackTree.find((node) => node.type === Recharts.BarChart);
    assert.equal(fallbackTree.find((node) => node.type === Recharts.XAxis).props.dataKey(fallbackChart.props.data[0]), 'Only category');
  });

  test('series labels, category values, extra data and qualifications render as escaped text', () => {
    const hostile = '<script>authored()</script> & "supplied"', value = spec('pie');
    value.series[0].label = hostile; value.data[0].period = hostile; value.data[0].annotation = hostile;
    value.title = hostile; value.source = hostile; value.provenance = hostile;
    const html = render(value);
    assert.ok(html.includes('&lt;script&gt;authored()&lt;/script&gt; &amp; &quot;supplied&quot;'));
    assert.doesNotMatch(html, /<script\b|<img\b|dangerouslySetInnerHTML/);
    assert.ok(cells(html).some((cell) => cell['data-column-key'] === 'annotation' && cell.text.includes('&lt;script&gt;')));
  });

  for (const type of TYPES) {
    test(`${type} sends bounded projected values to Recharts while its tooltip and table retain extreme raw observations`, () => {
      const radial = type === 'pie' || type === 'donut';
      const value = spec(type, { data: [
        { period: 'First', alpha: radial ? 1e308 : -1e308, beta: radial ? 1e307 : 1e308 },
        { period: 'Second', alpha: radial ? 1e308 : 0, beta: radial ? 2e307 : null },
        { period: 'Third', alpha: null, beta: 0.1 },
        { period: 'Fourth', alpha: radial ? 0 : 1e308, beta: 0 },
      ] });
      const tree = elements(value), tooltips = tree.filter((node) => node.type === Recharts.Tooltip);
      const chart = tree.find((node) => [Recharts.BarChart, Recharts.LineChart, Recharts.AreaChart, Recharts.ComposedChart].includes(node.type));
      const marks = tree.filter((node) => [Recharts.Bar, Recharts.Line, Recharts.Area, Recharts.Pie].includes(node.type));
      assert.equal(marks.length, 2);
      for (const [index, mark] of marks.entries()) {
        const data = radial ? mark.props.data : chart.props.data, series = value.series[index];
        assertOpaqueRows(data, value.data.length);
        const factor = radial && index === 1 ? 2e307 : 1e308;
        const projected = projectedValues(mark, data);
        assert.deepEqual(projected, value.data.map((row) => row[series.key] === null ? null : row[series.key] / factor));
        assert.ok(projected.every((item) => item === null || Number.isFinite(item) && Math.abs(item) <= 1));
        const tooltip = tooltips[radial ? index : 0];
        for (const [rowIndex, point] of data.entries()) {
          const raw = value.data[rowIndex][series.key];
          assert.equal(tooltipValue(tooltip, mark.props.dataKey, point), raw === null ? 'Empty' : raw);
        }
      }
      if (!radial) {
        const axis = tree.find((node) => node.type === Recharts.YAxis);
        assert.equal(typeof axis.props.tickFormatter, 'function');
        assert.equal(Number(axis.props.tickFormatter(1)), 1e308);
        assert.equal(Number(axis.props.tickFormatter(-1)), -1e308);
      }
      const html = render(value);
      assert.ok(cells(html).some((cell) => cell['data-value-type'] === 'number' && cell.text === '1e+308'));
      assert.ok(cells(html).some((cell) => cell['data-value-type'] === 'number' && cell.text === '0.1'));
    });
  }

  test('reserved fill, payload, value and name fields cannot replace original categories, plotted series or raw tooltip values', () => {
    const keys = ['fill', 'payload', 'value', 'name'];
    for (const type of ['bar', 'pie']) {
      const value = spec(type, {
        xKey: 'fill', series: keys.map((key) => ({ key, label: 'Series ' + key })),
        data: [{ fill: 1e308, payload: 2e307, value: 0.1, name: -0 }, { fill: 5e307, payload: 1e307, value: 1, name: 5 }],
      });
      const tree = elements(value), radial = type === 'pie';
      const chart = tree.find((node) => node.type === Recharts.BarChart);
      const marks = tree.filter((node) => node.type === (radial ? Recharts.Pie : Recharts.Bar));
      const tooltips = tree.filter((node) => node.type === Recharts.Tooltip);
      assert.equal(marks.length, keys.length);
      for (const [index, mark] of marks.entries()) {
        const data = radial ? mark.props.data : chart.props.data, key = keys[index];
        const category = radial ? mark.props.nameKey : tree.find((node) => node.type === Recharts.XAxis).props.dataKey;
        for (const [rowIndex, point] of data.entries()) {
          const merged = { ...point, fill: '#overwritten', payload: 'overwritten', value: 999, name: 'Overwritten label' };
          assert.equal(mark.props.dataKey(merged), mark.props.dataKey(point));
          assert.equal(category(merged), value.data[rowIndex].fill);
          assert.ok(Object.is(tooltipValue(tooltips[radial ? index : 0], mark.props.dataKey, merged), value.data[rowIndex][key]));
        }
      }
      assert.ok(cells(render(value)).some((cell) => cell['data-column-key'] === 'value' && cell.text === '0.1'));
    }
  });

  test('unrecognized tooltip payloads never relabel normalized fractions as raw observations', () => {
    for (const type of ['bar', 'pie']) {
      const value = spec(type), tree = elements(value), tooltip = tree.find((node) => node.type === Recharts.Tooltip);
      const mark = tree.find((node) => node.type === (type === 'pie' ? Recharts.Pie : Recharts.Bar));
      assert.equal(tooltipValue(tooltip, mark.props.dataKey, {}), 'Unavailable');
      const data = type === 'pie' ? mark.props.data : tree.find((node) => node.type === Recharts.BarChart).props.data;
      assert.equal(tooltipValue(tooltip, () => 0.5, data[0]), 'Unavailable');
    }
  });
}
