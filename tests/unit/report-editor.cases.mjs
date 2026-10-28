// Tier 2: authored inputs through actual React SSR and direct source callbacks.
// UI hosts and a bounded hook harness do not prove browser events/focus/layout.
// Layout-effect callbacks commit only after a completed render; commit:false
// discards pending layout effects and replaced state cells. Ref objects remain
// shared so eager render-time ref mutations are still observable regressions.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { webcrypto } from 'node:crypto';
import vm from 'node:vm';

const repository = fileURLToPath(new URL('../../', import.meta.url));
const load = createRequire(path.join(process.env.IV_TEST_PROJECT_ROOT || repository, 'package.json'));
const ts = load('typescript'), React = load('react');
const { renderToStaticMarkup } = load('react-dom/server');
const harnessStack = [];
let sequence = 0;
function cell(initial) {
  const harness = harnessStack.at(-1);
  assert.ok(harness, 'Hooks require the authored source harness.');
  const index = harness.cursor++;
  if (!(index in harness.cells)) harness.cells[index] = typeof initial === 'function' ? initial() : initial;
  return [harness, index];
}
const callbackReact = {
  ...React,
  useState(initial) { const [h, i] = cell(initial); return [h.cells[i], (next) => { h.cells[i] = typeof next === 'function' ? next(h.cells[i]) : next; }]; },
  useRef(initial) { const [h, i] = cell(() => ({ current: initial })); return h.cells[i]; },
  useId() { const [h, i] = cell(() => `report-${harnessStack.at(-1).id}-${harnessStack.at(-1).cursor}`); return h.cells[i]; },
  useEffect() { cell(undefined); },
  useLayoutEffect(callback, deps) {
    const [h, i] = cell(() => ({ deps: null, cleanup: null })), prior = h.cells[i];
    if (!prior.deps || !deps || deps.length !== prior.deps.length || deps.some((value, index) => !Object.is(value, prior.deps[index]))) h.layoutEffects.push({ slot: prior, deps, callback });
  },
};
class Harness {
  constructor(Component, props) { this.Component = Component; this.props = props; this.cells = []; this.cursor = 0; this.id = ++sequence; this.layoutEffects = []; }
  render({ commit = true } = {}) {
    const previousCells = this.cells.slice();
    harnessStack.push(this); this.cursor = 0; this.layoutEffects = [];
    let tree;
    try { tree = this.Component(this.props); } finally { harnessStack.pop(); }
    const pending = this.layoutEffects; this.layoutEffects = [];
    if (!commit) { this.cells = previousCells; return tree; }
    for (const effect of pending) {
      effect.slot.cleanup?.(); effect.slot.cleanup = effect.callback(); effect.slot.deps = effect.deps;
    }
    return tree;
  }
}
function host(tag) { return function Host({ children, variant, size, showCloseButton, open, onOpenChange, ...props }) { return React.createElement(tag, props, children); }; }
const ui = {
  '@/components/ui/button': { Button: host('button') }, '@/components/ui/input': { Input: host('input') }, '@/components/ui/textarea': { Textarea: host('textarea') },
  '@/components/ui/dialog': { Dialog: host('div'), DialogContent: host('div'), DialogHeader: host('div'), DialogTitle: host('h2'), DialogDescription: host('p') },
};
function runtime(react) {
  const modules = new Map(), context = vm.createContext({ structuredClone, TextEncoder, URL, crypto: webcrypto, Error,
    HTMLElement: class AuthoredElement {}, document: { activeElement: null }, requestAnimationFrame(callback) { callback(); },
    fetch() { throw new Error('Network is forbidden in Report editor checks.'); } });
  function source(filename) {
    filename = path.resolve(repository, filename);
    if (modules.has(filename)) return modules.get(filename).exports;
    const compiled = ts.transpileModule(readFileSync(filename, 'utf8'), { fileName: filename, reportDiagnostics: true,
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } });
    assert.equal(compiled.diagnostics.length, 0, filename + ' must transpile without syntax diagnostics.');
    const moduleRecord = { exports: {} }; modules.set(filename, moduleRecord);
    const require = (specifier) => {
      if (specifier === 'react') return react;
      if (specifier === 'react/jsx-runtime' || specifier === 'recharts') return load(specifier);
      if (specifier === 'zod') return load(process.env.IV_TEST_ZOD_ENTRY || 'zod');
      if (specifier === 'uuid' && filename.endsWith('/packages/domain/ids.ts')) return { v7: () => webcrypto.randomUUID() };
      if (ui[specifier]) return ui[specifier];
      assert.ok(specifier.startsWith('@/') || specifier.startsWith('.'), 'Unexpected source import: ' + specifier);
      const base = specifier.startsWith('@/') ? path.join(repository, specifier.slice(2)) : path.resolve(path.dirname(filename), specifier);
      for (const extension of ['.ts', '.tsx']) { try { readFileSync(base + extension); } catch { continue; } return source(base + extension); }
      throw new Error('No source module for ' + specifier);
    };
    vm.runInContext('(function(exports,require,module){\n' + compiled.outputText + '\n})', context, { filename })(moduleRecord.exports, require, moduleRecord);
    return moduleRecord.exports;
  }
  return { source };
}
const ssr = runtime(React), callbacks = runtime(callbackReact);
const { ReportEditor } = callbacks.source('components/visualizations/report-editor.tsx');
const { createStarterReportDocument } = ssr.source('packages/domain/fixtures.ts');
const { createReportBlock, validateReportEdit } = ssr.source('lib/client/report-authoring.ts');
const history = ssr.source('components/visualizations/report-editor/history.ts');
const plain = (value) => JSON.parse(JSON.stringify(value));
function freeze(value) { if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
function report() {
  const document = createStarterReportDocument();
  document.title = 'Authored <report> & title'; document.assetIds = ['authored-image'];
  document.report.dataSources = [{ id: 'authored-dataset', label: 'Authored snapshot', contentHash: 'unchanged-data-hash', rowCount: 2, provenance: '<Authored> source qualification' }];
  return document;
}
function descendants(node, result = []) {
  if (React.isValidElement(node)) { result.push(node); React.Children.forEach(node.props.children, (child) => descendants(child, result)); }
  return result;
}
function one(tree, predicate) { const matches = descendants(tree).filter(predicate); assert.equal(matches.length, 1, 'Expected exactly one matching source element.'); return matches[0]; }
const button = (tree, label) => one(tree, (node) => node.props.children === label && typeof node.props.onClick === 'function');
const field = (tree, label) => one(tree, (node) => node.props.label === label && typeof node.props.onChange === 'function');
const grid = (tree) => one(tree, (node) => node.type?.name === 'GridCanvas');
const submit = (tree) => one(tree, (node) => node.type === 'form').props.onSubmit({ preventDefault() {} });
const editor = (props = {}) => new Harness(ReportEditor, { document: freeze(report()), onApply() { return null; }, onCancel() {}, ...props });

export function registerReportEditorChecks(test) {
  test('Report editor SSR labels fields and snapshots, escapes text and keeps source unchanged', () => {
    const document = freeze(report()), before = structuredClone(document);
    const html = renderToStaticMarkup(React.createElement(ssr.source('components/visualizations/report-editor.tsx').ReportEditor, { document, onApply() {}, onCancel() {} }));
    for (const text of ['Edit report', 'Report title', 'Decision question', 'Large', 'Medium', 'Small', 'Column position', 'Width in columns', 'Source snapshots', 'unchanged-data-hash', '&lt;Authored&gt; source qualification']) assert.ok(html.includes(text), text);
    const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
    assert.equal(new Set(ids).size, ids.length);
    for (const [, id] of html.matchAll(/\bfor="([^"]+)"/g)) assert.ok(ids.includes(id));
    assert.ok([...html.matchAll(/<button\b[^>]*>/g)].every(([tag]) => tag.includes('min-h-11')));
    assert.deepEqual(plain(document), before);
  });
  test('all fifteen typed blocks expose their actual editing fields without raw JSON', () => {
    const { BlockFields } = ssr.source('components/visualizations/report-editor/block-fields.tsx');
    const kinds = ['heading', 'rich-text', 'callout', 'quote', 'divider', 'kpi', 'chart', 'data-table', 'tabs', 'image', 'list', 'timeline', 'comparison', 'source-note', 'cta'];
    const html = kinds.map((kind) => { const block = createReportBlock(kind); if (kind === 'image') block.assetId = 'authored-image'; return renderToStaticMarkup(React.createElement(BlockFields, { block, assetIds: ['authored-image'], onChange() {} })); }).join('');
    for (const label of ['Heading text', 'Callout body', 'Quote attribution', 'KPI provenance', 'Chart accessible description', 'Chart values', 'Table title', 'Tab 1 label', 'Attached image asset', 'List items', 'Milestone', 'Comparison', 'Source note', 'Link URL']) assert.ok(html.includes(label), label);
    assert.doesNotMatch(html, /contenteditable|Edit JSON/);
  });
  test('pristine Cancel never applies and isolated field changes preserve caller input', () => {
    const supplied = freeze(report()), before = structuredClone(supplied); let canceled = 0, applied = 0;
    const h = editor({ document: supplied, onCancel() { canceled++; }, onApply() { applied++; return null; } });
    button(h.render(), 'Cancel').props.onClick();
    assert.equal(canceled, 1); assert.equal(applied, 0);
    field(h.render(), 'Report title').props.onChange('Unapplied title');
    assert.equal(grid(h.render()).props.document.title, 'Unapplied title'); assert.deepEqual(plain(supplied), before);
  });
  test('dirty close blocks dismissal and keeps fields until explicit discard', () => {
    let canceled = 0, canceledDismissal = 0; const h = editor({ onCancel() { canceled++; } });
    field(h.render(), 'Report summary').props.onChange('Keep this draft');
    h.render().props.onOpenChange(false, { cancel() { canceledDismissal++; } });
    assert.equal(canceledDismissal, 1); assert.equal(canceled, 0);
    button(h.render(), 'Keep editing').props.onClick();
    assert.equal(field(h.render(), 'Report summary').props.value, 'Keep this draft');
    button(h.render(), 'Cancel').props.onClick(); button(h.render(), 'Discard changes').props.onClick(); assert.equal(canceled, 1);
  });
  test('Apply validates actual edited draft and retains it when the parent rejects', () => {
    let received; const h = editor({ onApply(value) { received = value; return 'Authored persistence failure'; } });
    field(h.render(), 'Report title').props.onChange('Candidate title'); submit(h.render());
    assert.equal(received.title, 'Candidate title'); assert.equal(field(h.render(), 'Report title').props.value, 'Candidate title');
    assert.equal(one(h.render(), (node) => node.props.role === 'alert').props.children, 'Authored persistence failure');
  });
  test('blank typed title blocks Apply without resetting its field', () => {
    let applied = 0; const h = editor({ onApply() { applied++; return null; } });
    field(h.render(), 'Report title').props.onChange(''); submit(h.render());
    assert.equal(applied, 0); assert.equal(field(h.render(), 'Report title').props.value, '');
    assert.ok(one(h.render(), (node) => node.props.role === 'alert').props.children);
  });
  test('position typing is staged atomically through intermediate collisions and one Undo', () => {
    const h = editor(), original = grid(h.render()).props.document;
    field(h.render(), 'Row position').props.onChange('');
    field(h.render(), 'Row position').props.onChange('2');
    assert.equal(grid(h.render()).props.document.report.layouts.lg[0].y, 0);
    field(h.render(), 'Row position').props.onChange('20');
    button(h.render(), 'Apply position and size').props.onClick();
    assert.equal(grid(h.render()).props.document.report.layouts.lg[0].y, 20);
    assert.deepEqual(plain(grid(h.render()).props.document.report.layouts.md), plain(original.report.layouts.md));
    button(h.render(), 'Undo').props.onClick(); assert.equal(grid(h.render()).props.document.report.layouts.lg[0].y, 0);
    button(h.render(), 'Redo').props.onClick(); assert.equal(grid(h.render()).props.document.report.layouts.lg[0].y, 20);
  });
  test('invalid staged position survives errors, blocks switching, and can be corrected for Preview', () => {
    const h = editor(); field(h.render(), 'Row position').props.onChange('2');
    button(h.render(), 'Apply position and size').props.onClick();
    assert.equal(field(h.render(), 'Row position').props.value, '2'); assert.equal(grid(h.render()).props.document.report.layouts.lg[0].y, 0);
    const small = one(h.render(), (node) => typeof node.props.onClick === 'function' && Array.isArray(node.props.children) && node.props.children.includes('Small'));
    small.props.onClick(); assert.equal(grid(h.render()).props.breakpoint, 'lg');
    field(h.render(), 'Row position').props.onChange('20'); button(h.render(), 'Preview draft').props.onClick();
    const preview = one(h.render(), (node) => node.type?.name === 'ReportPreview');
    assert.equal(preview.props.document.report.layouts.lg[0].y, 20); assert.equal(preview.props.breakpoint, 'lg');
  });
  test('pending position fields are dirty and Undo discards only that staged input first', () => {
    let canceled = 0, applied = 0; const h = editor({ onCancel() { canceled++; }, onApply() { applied++; return null; } });
    field(h.render(), 'Row position').props.onChange(''); button(h.render(), 'Cancel').props.onClick();
    assert.equal(canceled, 0); button(h.render(), 'Keep editing').props.onClick();
    button(h.render(), 'Undo').props.onClick(); assert.equal(field(h.render(), 'Row position').props.value, '0'); assert.equal(applied, 0);
  });
  test('Apply validates pending position before calling parent and retains invalid text', () => {
    let received = null; const h = editor({ onApply(value) { received = value; return null; } });
    field(h.render(), 'Row position').props.onChange(''); submit(h.render()); assert.equal(received, null);
    assert.equal(field(h.render(), 'Row position').props.value, '');
    field(h.render(), 'Row position').props.onChange('20'); submit(h.render()); assert.equal(received.report.layouts.lg[0].y, 20);
  });
  test('history caps at twenty, clears redo after a new edit, and distinguishes NaN from null', () => {
    let value = history.createReportHistory(report());
    for (let index = 0; index < 25; index++) { const next = structuredClone(value.present); next.title = String(index); value = history.commitReportHistory(value, next); }
    assert.equal(value.past.length, 20); value = history.undoReportHistory(value); assert.equal(value.future.length, 1);
    const next = structuredClone(value.present); next.title = 'New edit'; value = history.commitReportHistory(value, next); assert.equal(value.future.length, 0);
    const a = { chart: { value: Number.NaN } }, b = { chart: { value: null } };
    assert.equal(history.reportDraftsEqual(a, b), false); assert.equal(history.reportDraftsEqual(a, structuredClone(a)), true);
    const valueKey = value.present.report.blocks[3].chart.series[0].key;
    const invalid = structuredClone(value.present); invalid.report.blocks[3].chart.data[0][valueKey] = Number.NaN;
    value = history.commitReportHistory(value, invalid);
    const corrected = structuredClone(value.present); corrected.report.blocks[3].chart.data[0][valueKey] = null;
    value = history.commitReportHistory(value, corrected); assert.equal(value.present.report.blocks[3].chart.data[0][valueKey], null);
    assert.doesNotThrow(() => validateReportEdit(value.present));
  });
  test('chart key rename retains exact numbers and null after blank/colliding proposals', () => {
    const { ChartFields } = callbacks.source('components/visualizations/report-editor/data-fields.tsx');
    const chart = createReportBlock('chart').chart; chart.data = [{ label: 'A', value: 7.25 }, { label: 'B', value: null }];
    let candidate; const h = new Harness(ChartFields, { chart: freeze(chart), onChange(value) { candidate = value; } });
    const rename = one(h.render(), (node) => node.type?.name === 'RenameKey');
    const key = new Harness(rename.type, rename.props);
    field(key.render(), 'New series 1 key').props.onChange(''); button(key.render(), 'Rename key').props.onClick(); assert.equal(candidate, undefined);
    field(key.render(), 'New series 1 key').props.onChange('label'); button(key.render(), 'Rename key').props.onClick(); assert.equal(candidate, undefined);
    field(key.render(), 'New series 1 key').props.onChange('authoredMetric'); button(key.render(), 'Rename key').props.onClick();
    assert.equal(candidate.series[0].key, 'authoredMetric'); assert.deepEqual(plain(candidate.data), [{ label: 'A', authoredMetric: 7.25 }, { label: 'B', authoredMetric: null }]); assert.equal(candidate.xKey, 'label');
    assert.deepEqual(plain(chart.data), [{ label: 'A', value: 7.25 }, { label: 'B', value: null }]);
  });
  test('numeric chart field keeps fractional typing and blank invalid text while updating its draft value', () => {
    const { ChartFields } = callbacks.source('components/visualizations/report-editor/data-fields.tsx');
    const chart = createReportBlock('chart').chart; chart.data = [{ label: 'A', value: 0 }];
    const outer = new Harness(ChartFields, { chart, onChange() {} });
    const cell = one(outer.render(), (node) => node.type?.name === 'DataCell' && node.props.label === 'Row 1, value');
    const cellTree = new Harness(cell.type, cell.props).render();
    const numeric = one(cellTree, (node) => node.type?.name === 'NumberDataField');
    let draftValue = 0;
    const input = new Harness(numeric.type, { ...numeric.props, onChange(value) { draftValue = value; input.props = { ...input.props, value }; } });
    field(input.render(), 'Row 1, value').props.onChange('1');
    field(input.render(), 'Row 1, value').props.onChange('1.'); assert.equal(field(input.render(), 'Row 1, value').props.value, '1.'); assert.equal(draftValue, 1);
    field(input.render(), 'Row 1, value').props.onChange('1.25'); assert.equal(draftValue, 1.25); assert.equal(field(input.render(), 'Row 1, value').props.value, '1.25');
    field(input.render(), 'Row 1, value').props.onChange(''); assert.ok(Number.isNaN(draftValue)); assert.equal(field(input.render(), 'Row 1, value').props.value, '');
    input.props = { ...input.props, value: 7.5 }; input.render(); assert.equal(field(input.render(), 'Row 1, value').props.value, '7.5', 'External history changes refresh the displayed value.');
  });
  test('later parent document cannot replace isolated edits and malformed initial layout stays unchanged', () => {
    const h = editor(); field(h.render(), 'Report title').props.onChange('Local edit'); const next = report(); next.title = 'New parent'; h.props = { ...h.props, document: next };
    assert.equal(field(h.render(), 'Report title').props.value, 'Local edit');
    const bad = report(); bad.report.layouts.lg[0].w = 99; const broken = editor({ document: freeze(bad) });
    assert.equal(one(broken.render(), (node) => node.props.children === 'Apply changes').props.disabled, true);
    assert.equal(descendants(broken.render()).filter((node) => node.type?.name === 'GridCanvas').length, 0); assert.equal(bad.report.layouts.lg[0].w, 99);
  });

  function pointerHarness() {
    const { GridCanvas } = callbacks.source('components/visualizations/report-editor/grid-canvas.tsx');
    const document = freeze(report()), selectedId = document.report.blocks[2].id, changes = [], errors = [];
    const h = new Harness(GridCanvas, { document, breakpoint: 'lg', selectedId, onChange(id, patch) { changes.push({ id, patch }); }, onError(message) { errors.push(message); } });
    let width = 624, captured = false;
    const node = { setPointerCapture() { captured = true; }, hasPointerCapture() { return captured; }, releasePointerCapture() { captured = false; } };
    const tree = h.render(); one(tree, (element) => element.props.ref && element.props['aria-label'] === 'lg layout, 12 columns').props.ref.current = { getBoundingClientRect() { return { width }; } };
    const event = (x, y, pointerId = 1) => ({ button: 0, isPrimary: true, pointerId, clientX: x, clientY: y, currentTarget: node, preventDefault() {} });
    const handle = (mode = 'Drag') => one(h.render(), (element) => element.props['aria-label'] === `${mode} selected block`);
    return { h, event, handle, changes, errors, isCaptured() { return captured; }, resize(widthValue) { width = widthValue; } };
  }
  test('pointer move stays transient and only the owning release commits one snapped change', () => {
    const p = pointerHarness(); p.handle().props.onPointerDown(p.event(100, 100)); p.handle().props.onPointerMove(p.event(47, 152));
    assert.equal(p.changes.length, 0); p.handle().props.onPointerUp(p.event(47, 152, 2)); assert.equal(p.changes.length, 0);
    p.handle().props.onPointerUp(p.event(47, 152)); assert.equal(p.changes.length, 1);
    assert.deepEqual(plain(p.changes[0].patch), { x: 7, y: 3, w: 4, h: 3 });
    p.handle().props.onPointerUp(p.event(47, 152)); assert.equal(p.changes.length, 1);
  });
  test('pointer cancel/lost capture and changed canvas width never commit', () => {
    for (const name of ['onPointerCancel', 'onLostPointerCapture']) { const p = pointerHarness(); p.handle().props.onPointerDown(p.event(100, 100)); p.handle().props[name](p.event(150, 150)); p.handle().props.onPointerUp(p.event(150, 150)); assert.equal(p.changes.length, 0); }
    const p = pointerHarness(); p.handle().props.onPointerDown(p.event(100, 100)); p.resize(500); p.handle().props.onPointerUp(p.event(150, 150)); assert.equal(p.changes.length, 0); assert.equal(p.errors.length, 1);
  });
  test('pointer resize snaps within bounds and rejects an obsolete document owner', () => {
    const p = pointerHarness(); p.handle('Resize').props.onPointerDown(p.event(100, 100)); p.handle('Resize').props.onPointerUp(p.event(47, 152));
    assert.deepEqual(plain(p.changes[0].patch), { x: 8, y: 2, w: 3, h: 4 });
    const stale = pointerHarness(); stale.handle().props.onPointerDown(stale.event(100, 100)); stale.h.props = { ...stale.h.props, document: freeze(report()) }; stale.h.render(); stale.handle().props.onPointerUp(stale.event(150, 150)); assert.equal(stale.changes.length, 0);
    const staged = pointerHarness(); staged.handle().props.onPointerDown(staged.event(100, 100)); staged.h.props = { ...staged.h.props, disabled: true }; staged.h.render(); staged.handle().props.onPointerUp(staged.event(150, 150)); assert.equal(staged.changes.length, 0);
  });
  test('an abandoned render cannot replace the committed pointer gesture owner', () => {
    const p = pointerHarness(), committed = p.h.props, handle = p.handle();
    handle.props.onPointerDown(p.event(100, 100));
    p.h.props = { ...committed, document: freeze(report()) };
    p.h.render({ commit: false });
    p.h.props = committed;
    handle.props.onPointerUp(p.event(47, 152));
    assert.equal(p.changes.length, 1); assert.equal(p.errors.length, 0);
    assert.equal(p.changes[0].id, committed.selectedId);
    assert.deepEqual(plain(p.changes[0].patch), { x: 7, y: 3, w: 4, h: 3 });
    handle.props.onPointerUp(p.event(47, 152)); assert.equal(p.changes.length, 1);
  });
  test('committed context changes clear the ghost and capture without reviving the old gesture', () => {
    for (const change of [{ document: freeze(report()) }, { disabled: true }]) {
      const p = pointerHarness(), committed = p.h.props, handle = p.handle(), release = p.event(47, 152);
      handle.props.onPointerDown(p.event(100, 100)); handle.props.onPointerMove(release);
      assert.equal(descendants(p.h.render()).filter(node => node.props.role === 'status').length, 1);
      assert.equal(release.currentTarget.hasPointerCapture(release.pointerId), true);
      assert.equal(p.isCaptured(), true);
      p.h.props = { ...committed, ...change };
      assert.equal(descendants(p.h.render()).filter(node => node.props.role === 'status').length, 0);
      assert.equal(release.currentTarget.hasPointerCapture(release.pointerId), false);
      assert.equal(p.isCaptured(), false);
      handle.props.onPointerUp(release); assert.equal(p.changes.length, 0);
      p.h.props = committed;
      assert.equal(descendants(p.h.render()).filter(node => node.props.role === 'status').length, 0);
      handle.props.onPointerUp(release);
      assert.equal(p.changes.length, 0); assert.equal(p.errors.length, 0);
      const next = p.handle(); next.props.onPointerDown(p.event(100, 100, 2));
      assert.equal(p.isCaptured(), true);
      handle.props.onPointerUp(release); assert.equal(p.changes.length, 0);
      next.props.onPointerUp(p.event(47, 152, 2));
      assert.equal(p.changes.length, 1); assert.equal(p.isCaptured(), false); assert.equal(p.errors.length, 0);
      assert.deepEqual(plain(p.changes[0].patch), { x: 7, y: 3, w: 4, h: 3 });
    }
  });
}
