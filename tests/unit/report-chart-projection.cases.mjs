// T2: authored numeric data through the actual projection and installed Recharts
// pie/scale math. No browser, server, endpoint, provider or model executes.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const repository = fileURLToPath(new URL('../../', import.meta.url));
const external = createRequire(path.join(process.env.IV_TEST_PROJECT_ROOT || repository, 'package.json'));
const ts = external('typescript'), React = external('react');
const { Pie, Cell } = external('recharts');
const { scaleLinear } = external('victory-vendor/d3-scale');
const modules = new Map();
function actual(relative) {
  assert.ok(['lib/client/report-chart-model.ts', 'lib/client/report-chart-projection.ts'].includes(relative));
  if (modules.has(relative)) return modules.get(relative).exports;
  const filename = path.join(repository, relative), module = { exports: {} };
  modules.set(relative, module);
  const result = ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }, reportDiagnostics: true,
  });
  assert.equal(result.diagnostics.length, 0, 'Actual projection helpers must transpile without syntax diagnostics.');
  vm.runInNewContext('(function(exports,require,module){\n' + result.outputText + '\n})', {})(module.exports,
    (specifier) => {
      assert.equal(specifier, './report-chart-model');
      return actual('lib/client/report-chart-model.ts');
    }, module);
  return module.exports;
}
const { createReportChartProjection } = actual('lib/client/report-chart-projection.ts');

function spec(change = {}) {
  return {
    id: 'authored-chart', type: 'bar', title: 'Authored chart', description: 'Authored values.',
    series: [{ key: 'actual', label: 'Actual' }, { key: 'comparison', label: 'Comparison' }],
    data: [{ label: 'A', actual: -10, comparison: 5 }, { label: 'B', actual: 0, comparison: null }, { label: 'C', actual: 10, comparison: -5 }],
    xKey: 'label', source: 'Authored source', provenance: 'Authored qualification.', accessibleLabel: 'Authored observations.', illustrative: true,
    ...change,
  };
}
function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
function pie(specification, seriesIndex = 0, cellProps = { fill: '#2563eb' }) {
  const projection = createReportChartProjection(specification, [seriesIndex]);
  const item = React.createElement(Pie, {
    data: projection.data, dataKey: projection.dataKeys[seriesIndex], nameKey: projection.categoryDataKey,
    innerRadius: specification.type === 'donut' ? 58 : 0, outerRadius: 104,
    isAnimationActive: false,
  }, projection.data.map((_, index) => React.createElement(Cell, { key: index, ...cellProps })));
  const props = { ...Pie.defaultProps, ...item.props };
  const rows = Pie.getRealPieData(props);
  const composed = Pie.getComposedData({ item, offset: { left: 0, top: 0, width: 320, height: 280 } });
  return { projection, item, rows, composed };
}

export function registerReportChartProjectionChecks(test) {
  test('Cartesian projection has one common factor and leaves frozen raw data untouched', () => {
    const source = freeze(spec()), before = structuredClone(source), projection = createReportChartProjection(source);
    assert.equal(projection.factor, 10);
    assert.notEqual(projection.data, source.data);
    assert.deepEqual(Object.keys(projection.data[0]), []);
    assert.ok(Object.getOwnPropertySymbols(projection.data[0]).length > 0);
    for (const symbol of Object.getOwnPropertySymbols(projection.data[0])) assert.equal(Object.getOwnPropertyDescriptor(projection.data[0], symbol).enumerable, true);
    assert.deepEqual(Array.from(projection.data, projection.dataKeys[0]), [-1, 0, 1]);
    assert.deepEqual(Array.from(projection.data, projection.dataKeys[1]), [0.5, null, -0.5]);
    assert.deepEqual(source, before);
  });

  test('actual linear scale math remains finite across signed 1e308 values after projection', () => {
    const source = spec({ series: [{ key: 'actual', label: 'Actual' }], data: [{ label: 'Low', actual: -1e308 }, { label: 'Zero', actual: 0 }, { label: 'High', actual: 1e308 }] });
    const rawScale = scaleLinear().domain([-1e308, 1e308]).range([244, 20]);
    assert.equal(Number.isFinite(rawScale(1e308)), false, 'The same dependency reproduces raw-domain overflow.');
    const projection = createReportChartProjection(source), scale = scaleLinear().domain([-1, 1]).range([244, 20]);
    const coordinates = Array.from(projection.data, (row) => scale(projection.dataKeys[0](row)));
    assert.deepEqual(coordinates, [244, 132, 20]);
    assert.ok(coordinates.every(Number.isFinite));
  });

  test('Number.MAX_VALUE and subnormal observations project without nonfinite coordinates', () => {
    for (const magnitude of [Number.MAX_VALUE, Number.MIN_VALUE]) {
      const source = spec({ series: [{ key: 'actual', label: 'Actual' }], data: [{ actual: -magnitude }, { actual: magnitude }], xKey: 'actual' });
      const projection = createReportChartProjection(source);
      assert.equal(projection.factor, magnitude);
      assert.deepEqual(Array.from(projection.data, projection.dataKeys[0]), [-1, 1]);
      assert.equal(projection.categoryDataKey(projection.data[1]), magnitude);
      assert.equal(projection.tooltipValue(1, projection.dataKeys[0], projection.data[1]), magnitude);
    }
  });

  test('zero and null retain distinct projected and raw values with a safe unit factor', () => {
    const source = spec({ series: [{ key: 'actual', label: 'Actual' }], data: [{ actual: 0 }, { actual: -0 }, { actual: null }], xKey: 'actual' });
    const projection = createReportChartProjection(source);
    assert.equal(projection.factor, 1);
    assert.equal(projection.dataKeys[0](projection.data[0]), 0);
    assert.ok(Object.is(projection.dataKeys[0](projection.data[1]), -0));
    assert.equal(projection.dataKeys[0](projection.data[2]), null);
    assert.equal(projection.tooltipValue(0, projection.dataKeys[0], projection.data[0]), 0);
    assert.ok(Object.is(projection.tooltipValue(0, projection.dataKeys[0], projection.data[1]), -0));
    assert.equal(projection.tooltipValue(0, projection.dataKeys[0], projection.data[2]), 'Empty');
    assert.equal(projection.categoryDataKey(projection.data[2]), 'Empty');
  });

  test('a numeric category shared with a series keeps its original number', () => {
    const source = spec({ series: [{ key: 'actual', label: 'Actual' }], data: [{ actual: 0.1 }, { actual: 0.3 }], xKey: 'actual' });
    const projection = createReportChartProjection(source);
    assert.equal(projection.dataKeys[0](projection.data[0]), 0.1 / 0.3);
    assert.equal(projection.categoryDataKey(projection.data[0]), 0.1);
    assert.equal(projection.tooltipValue(0.1 / 0.3, projection.dataKeys[0], projection.data[0]), 0.1);
    assert.equal(projection.tickLabel(0.1 / 0.3), '0.1');
  });

  test('category fallback follows the source key and supports an empty owned row index', () => {
    const source = spec({ series: [], data: [{ category: 'Authored first category' }, {}] }); delete source.xKey;
    const projection = createReportChartProjection(source);
    assert.equal(projection.categoryDataKey(projection.data[0]), 'Authored first category');
    const empty = createReportChartProjection(spec({ series: [], data: [{}], xKey: undefined }));
    assert.equal(empty.categoryDataKey(empty.data[0]), 1);
    assert.equal(empty.categoryDataKey({}), undefined);
  });

  test('unknown tooltip keys and unowned payloads never present normalized fallback as raw', () => {
    const projection = createReportChartProjection(spec());
    assert.equal(projection.tooltipValue(0.5, 'actual', projection.data[0]), 'Unavailable');
    assert.equal(projection.tooltipValue(0.5, () => 0.5, projection.data[0]), 'Unavailable');
    assert.equal(projection.tooltipValue(0.5, projection.dataKeys[0], { actual: 5 }), 'Unavailable');
    assert.equal(projection.tooltipValue(0.5, projection.dataKeys[0], null), 'Unavailable');
  });

  test('invalid source numbers and text are not coerced into projected observations', () => {
    const projection = createReportChartProjection(spec({ series: [{ key: 'actual', label: 'Actual' }], data: [{ actual: Infinity }, { actual: NaN }, { actual: '17' }, {}, { actual: null }] }));
    assert.equal(projection.factor, 1);
    assert.deepEqual(Array.from(projection.data, projection.dataKeys[0]), [null, null, null, null, null]);
    for (const row of projection.data.slice(0, 4)) assert.equal(projection.tooltipValue(0, projection.dataKeys[0], row), 'Unavailable');
    assert.equal(projection.tooltipValue(0, projection.dataKeys[0], projection.data[4]), 'Empty');
  });

  test('Cartesian factors always include all series even if a caller selects a subset', () => {
    const source = spec({ data: [{ label: 'A', actual: 1e308, comparison: 0.1 }] });
    const projection = createReportChartProjection(source, [1]);
    assert.equal(projection.factor, 1e308);
    assert.equal(projection.dataKeys[0](projection.data[0]), 1);
    assert.ok(Number.isFinite(projection.dataKeys[1](projection.data[0])));
  });

  test('radial facets each use their own divisor, including exposed nonselected keys', () => {
    const source = spec({ type: 'pie', data: [{ label: 'A', actual: 1e308, comparison: 0.1 }, { label: 'B', actual: 5e307, comparison: 0.05 }] });
    const projection = createReportChartProjection(source, [1]);
    assert.equal(projection.factor, 0.1);
    assert.deepEqual(Array.from(projection.data, projection.dataKeys[0]), [1, 0.5]);
    assert.deepEqual(Array.from(projection.data, projection.dataKeys[1]), [1, 0.5]);
    const invalid = createReportChartProjection(spec({ type: 'pie', data: [{ actual: -1e308, comparison: 0.1 }] }), [0]);
    assert.equal(invalid.dataKeys[0](invalid.data[0]), -1);
  });

  for (const type of ['pie', 'donut']) {
    test(`actual Recharts ${type} math avoids raw sum overflow and retains raw tooltips`, () => {
      const source = freeze(spec({ type, series: [{ key: 'actual', label: 'Actual' }], data: [{ label: 'A', actual: 1e308 }, { label: 'B', actual: 1e308 }] }));
      const { projection, composed } = pie(source);
      assert.equal(1e308 + 1e308, Infinity);
      assert.equal(composed.sectors.length, 2);
      assert.deepEqual(composed.sectors.map((sector) => sector.endAngle - sector.startAngle), [180, 180]);
      assert.ok(composed.sectors.every((sector) => [sector.startAngle, sector.endAngle, sector.percent].every(Number.isFinite)));
      for (const sector of composed.sectors) {
        const item = sector.tooltipPayload[0];
        assert.equal(projection.tooltipValue(item.value, item.dataKey, item.payload), 1e308);
      }
      assert.equal(composed.innerRadius, type === 'donut' ? 58 : 0);
    });
  }

  test('actual pie category access names a null category explicitly without changing its numeric value', () => {
    const source = freeze(spec({ type: 'pie', data: [{ label: null, actual: 2, comparison: 1 }, { label: 'B', actual: 4, comparison: 2 }] }));
    const { projection, composed } = pie(source);
    const item = composed.sectors[0].tooltipPayload[0];
    assert.equal(item.name, 'Empty');
    assert.equal(projection.tooltipValue(item.value, item.dataKey, item.payload), 2);
    assert.equal(source.data[0].label, null);
  });

  for (const key of ['fill', 'value', 'payload', 'name', 'cx', 'outerRadius']) {
    test(`actual pie Cell merges cannot overwrite source series/category named ${key}`, () => {
      const source = freeze(spec({ type: 'pie', series: [{ key, label: 'Reserved source series' }], data: [{ [key]: 0.1 }, { [key]: 0.3 }], xKey: key }));
      const { projection, rows, composed } = pie(source);
      assert.equal(rows[0].fill, '#2563eb');
      assert.equal(projection.dataKeys[0](rows[0]), 0.1 / 0.3);
      assert.equal(projection.categoryDataKey(rows[0]), 0.1);
      assert.equal(projection.tooltipValue(0.1 / 0.3, projection.dataKeys[0], rows[0]), 0.1);
      const first = composed.sectors[0], tooltip = first.tooltipPayload[0];
      assert.ok(Math.abs((first.endAngle - first.startAngle) - 90) < 1e-10);
      assert.equal(tooltip.name, 0.1);
      assert.equal(projection.tooltipValue(tooltip.value, tooltip.dataKey, tooltip.payload), 0.1);
      assert.deepEqual(source.data, [{ [key]: 0.1 }, { [key]: 0.3 }]);
    });
  }

  test('tick labels inverse-scale ordinary values and format out-of-range products without Infinity or fake zero', () => {
    const huge = createReportChartProjection(spec({ series: [{ key: 'actual', label: 'Actual' }], data: [{ actual: Number.MAX_VALUE }] }));
    assert.match(huge.tickLabel(2), /^3\.60e\+308$/);
    assert.match(huge.tickLabel(-2), /^-3\.60e\+308$/);
    const tiny = createReportChartProjection(spec({ series: [{ key: 'actual', label: 'Actual' }], data: [{ actual: Number.MIN_VALUE }] }));
    assert.equal(0.1 * Number.MIN_VALUE, 0);
    assert.equal(tiny.tickLabel(0.1), '4.94e-325');
    assert.equal(tiny.tickLabel(-0.1), '-4.94e-325');
    assert.equal(tiny.tickLabel(0), '0');
    for (const value of [NaN, Infinity, -Infinity, '', ' ', 'Infinity', 'not a number']) assert.equal(huge.tickLabel(value), '—');
    assert.equal(createReportChartProjection(spec()).tickLabel('0.5'), '5');
  });

  test('invalid requested series indices reject without modifying source data', () => {
    const source = freeze(spec()), before = structuredClone(source);
    for (const indices of [[-1], [2], [0.5], [NaN]]) assert.throws(() => createReportChartProjection(source, indices), /existing chart series/);
    assert.deepEqual(source, before);
  });
}
