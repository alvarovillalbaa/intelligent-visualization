// T2: invoke the actual Composer function declarations with authored refs and
// setters. This does not simulate React lifecycle, dialog focus or browser events.
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const repository = fileURLToPath(new URL('../../', import.meta.url));
const load = createRequire(path.join(process.env.IV_TEST_PROJECT_ROOT || repository, 'package.json'));
const ts = load('typescript');
const modules = new Map();
const sourceContext = vm.createContext({ structuredClone, TextEncoder, URL, crypto: webcrypto });
function actual(relative) {
  const file = path.join(repository, relative + '.ts');
  if (modules.has(file)) return modules.get(file).exports;
  const result = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }, reportDiagnostics: true });
  assert.equal(result.diagnostics.length, 0);
  const moduleRecord = { exports: {} }; modules.set(file, moduleRecord);
  vm.runInContext('(function(exports,require,module){\n' + result.outputText + '\n})', sourceContext, { filename: file })(moduleRecord.exports, (specifier) => {
    if (specifier.startsWith('@/')) return actual(specifier.slice(2));
    if (specifier.startsWith('.')) return actual(path.relative(repository, path.resolve(path.dirname(file), specifier)));
    if (specifier === 'uuid') return { v7: () => webcrypto.randomUUID() };
    assert.equal(specifier, 'zod');
    return load(process.env.IV_TEST_ZOD_ENTRY || 'zod');
  }, moduleRecord);
  return moduleRecord.exports;
}
const { applyReportDraftEdit, prepareReportEdit } = actual('lib/client/report-authoring');
const { createStarterReportDocument, createStarterCourseDocument } = actual('packages/domain/fixtures');
const plain = (value) => JSON.parse(JSON.stringify(value));

function declarations(relative, names) {
  const file = path.join(repository, relative), text = readFileSync(file, 'utf8');
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found = new Map();
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.name && names.includes(node.name.text)) found.set(node.name.text, node.getText(source));
    ts.forEachChild(node, visit);
  }
  visit(source);
  assert.equal(found.size, names.length, 'Every checked callback must come from actual source.');
  return names.map((name) => found.get(name)).join('\n');
}
const names = ['replaceBatch', 'replaceCourseEditor', 'replaceReportEditor', 'editCourse', 'editReport', 'applyReportChanges', 'closeReportEditor'];
const callbacks = ts.transpileModule(
  declarations('components/visualizations/composer.tsx', names) + '\n' + declarations('components/visualizations/generation-results.tsx', ['isExampleDraft']),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }, reportDiagnostics: true },
);
assert.equal(callbacks.diagnostics.length, 0);

function batch() {
  return { id: 'authored-batch', input: { rawText: ' Preserve authored source\n' }, results: [
    { id: 'report-result', kind: 'report', status: 'completed', saveStatus: 'not-requested', draft: { kind: 'report', document: createStarterReportDocument(), provider: 'authored-provider', modelName: 'authored-model', generatedAt: 100, artifactHtml: 'stale' } },
    { id: 'course-result', kind: 'course', status: 'completed', saveStatus: 'not-requested', draft: { kind: 'course', document: createStarterCourseDocument(), provider: 'authored-provider', modelName: 'authored-model', generatedAt: 101 } },
  ] };
}
function harness(value = batch()) {
  const state = { batch: value, report: null, course: null, preview: null, previewOpen: true };
  const context = vm.createContext({
    exports: {}, structuredClone, crypto: webcrypto, applyReportDraftEdit,
    batchRef: { current: value }, reportEditorRef: { current: null }, courseEditorRef: { current: null }, mountedRef: { current: true },
    setBatch: (value) => { state.batch = value; }, setReportEditing: (value) => { state.report = value; }, setCourseEditing: (value) => { state.course = value; },
    setPreviewResultId: (value) => { state.preview = value; }, setPreviewOpen: (value) => { state.previewOpen = value; },
  });
  vm.runInContext(callbacks.outputText, context);
  return { context, state };
}

export function registerReportComposerChecks(test) {
  test('opening Report captures isolated original values and closes prior preview and Course editor', () => {
    const { context, state } = harness();
    context.editCourse('course-result'); assert.ok(state.course);
    context.editReport('report-result');
    assert.equal(state.course, null); assert.equal(state.preview, null); assert.equal(state.previewOpen, false);
    assert.equal(state.report.batchId, state.batch.id);
    state.report.document.title = 'Unapplied title';
    assert.notEqual(state.batch.results[0].draft.document.title, 'Unapplied title');
    assert.notEqual(state.report.expectedDraft.document.title, 'Unapplied title');
  });

  test('opening Course invalidates the Report context', () => {
    const { context, state } = harness(); context.editReport('report-result');
    context.editCourse('course-result');
    assert.equal(state.report, null); assert.equal(context.reportEditorRef.current, null); assert.ok(state.course);
  });

  test('unavailable, incomplete, other-format and previous-example results cannot open Report editor', () => {
    for (const mutate of [
      (value) => { value.results[0].status = 'failed'; },
      (value) => { delete value.results[0].draft; },
      (value) => { value.results[0].draft.document = createStarterCourseDocument(); },
      (value) => { value.results[0].draft.provider = ' FALLBACK '; },
      (value) => { value.results[0].draft.modelName = ' Heuristic '; },
    ]) {
      const value = batch(); mutate(value); const { context, state } = harness(value);
      context.editReport('report-result'); assert.equal(state.report, null);
    }
    const { context, state } = harness(); context.editReport('missing'); context.editReport('course-result'); assert.equal(state.report, null);
  });

  test('Apply merges only Report into the latest batch and opens its fresh preview', () => {
    const { context, state } = harness(); context.editReport('report-result');
    const editing = state.report, candidate = prepareReportEdit(editing.document); candidate.title = 'Edited report';
    const latest = structuredClone(state.batch); latest.results[1].saveStatus = 'uncertain';
    context.batchRef.current = latest;
    assert.equal(context.applyReportChanges(editing, candidate), null);
    assert.equal(state.batch.results[0].draft.document.title, 'Edited report');
    assert.equal(state.batch.results[1].saveStatus, 'uncertain');
    assert.deepEqual(plain(state.batch.input), plain(latest.input));
    assert.equal(Object.hasOwn(state.batch.results[0].draft, 'artifactHtml'), false);
    assert.equal(state.report, null); assert.equal(state.preview, 'report-result');
  });

  for (const owner of ['mount', 'editor', 'batch', 'original']) {
    test(`Apply rejects changed ${owner} ownership and retains local edits`, () => {
      const { context, state } = harness(); context.editReport('report-result');
      const editing = state.report, candidate = prepareReportEdit(editing.document); candidate.title = 'Retained edit';
      if (owner === 'mount') context.mountedRef.current = false;
      if (owner === 'editor') context.reportEditorRef.current = { ...editing, id: 'new-editor' };
      if (owner === 'batch') context.batchRef.current = { ...state.batch, id: 'new-batch' };
      if (owner === 'original') state.batch.results[0].draft.document.summary = 'Concurrent change';
      const before = structuredClone(state.batch);
      assert.equal(typeof context.applyReportChanges(editing, candidate), 'string');
      assert.equal(state.report, editing); assert.equal(candidate.title, 'Retained edit');
      assert.deepEqual(plain(state.batch), plain(before));
    });
  }

  test('invalid candidate keeps current Report editor and does not replace batch', () => {
    const { context, state } = harness(); context.editReport('report-result');
    const editing = state.report, candidate = prepareReportEdit(editing.document); candidate.report.layouts.sm[0].w = 5;
    const original = state.batch;
    assert.equal(typeof context.applyReportChanges(editing, candidate), 'string');
    assert.equal(state.batch, original); assert.equal(state.report, editing);
  });

  test('stale cancellation cannot close a newer Report editor', () => {
    const { context, state } = harness(); context.editReport('report-result'); const old = state.report;
    context.editReport('report-result'); const current = state.report;
    assert.notEqual(old.id, current.id); context.closeReportEditor(old); assert.equal(state.report, current);
    context.closeReportEditor(current); assert.equal(state.report, null);
  });
}
