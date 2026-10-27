// Tier 2: authored data through React SSR and direct source callbacks. UI-only host
// stubs and a small hook harness do not establish browser events, focus or layout.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { webcrypto } from 'node:crypto';
import vm from 'node:vm';

const repository = fileURLToPath(new URL('../../', import.meta.url));
const load = createRequire(path.join(process.env.IV_TEST_PROJECT_ROOT || repository, 'package.json'));
const ts = load('typescript');
const React = load('react');
const { renderToStaticMarkup } = load('react-dom/server');
let activeHarness = null;
let harnessID = 0;

function cell(initial) {
  assert.ok(activeHarness, 'Hooks must run inside the source callback harness.');
  const harness = activeHarness, index = harness.cursor++;
  if (!(index in harness.cells)) harness.cells[index] = typeof initial === 'function' ? initial() : initial;
  return [harness, index];
}

const callbackReact = {
  ...React,
  useState(initial) {
    const [harness, index] = cell(initial);
    return [harness.cells[index], (next) => {
      harness.cells[index] = typeof next === 'function' ? next(harness.cells[index]) : next;
    }];
  },
  useRef(initial) { const [harness, index] = cell(() => ({ current: initial })); return harness.cells[index]; },
  useId() { const [harness, index] = cell(() => `authored-${activeHarness.id}-${activeHarness.cursor}`); return harness.cells[index]; },
  useEffect() { cell(undefined); },
};

class Harness {
  constructor(Component, props) { this.Component = Component; this.props = props; this.cells = []; this.cursor = 0; this.id = ++harnessID; }
  render() {
    const previous = activeHarness;
    activeHarness = this;
    this.cursor = 0;
    try { return this.Component(this.props); } finally { activeHarness = previous; }
  }
}

function host(tag) {
  return function HostControl({ children, variant, size, showCloseButton, open, onOpenChange, ...props }) {
    return React.createElement(tag, props, children);
  };
}

const ui = {
  '@/components/ui/button': { Button: host('button') },
  '@/components/ui/input': { Input: host('input') },
  '@/components/ui/textarea': { Textarea: host('textarea') },
  '@/components/ui/dialog': {
    Dialog: host('div'), DialogContent: host('div'), DialogHeader: host('div'),
    DialogTitle: host('h2'), DialogDescription: host('p'),
  },
};

function sourceRuntime(react) {
  const modules = new Map();
  const context = vm.createContext({
    structuredClone, TextEncoder, URL, crypto: webcrypto, Error,
    HTMLElement: class AuthoredHTMLElement {}, document: { activeElement: null },
    requestAnimationFrame(callback) { callback(); },
    fetch() { throw new Error('Network is forbidden in course editor checks.'); },
  });
  function source(file) {
    file = path.resolve(repository, file);
    if (modules.has(file)) return modules.get(file).exports;
    const module = { exports: {} };
    modules.set(file, module);
    const compiled = ts.transpileModule(readFileSync(file, 'utf8'), {
      fileName: file, reportDiagnostics: true,
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
    });
    assert.equal(compiled.diagnostics.length, 0, `${file} must transpile without syntax diagnostics.`);
    const requireSource = (specifier) => {
      if (specifier === 'react') return react;
      if (specifier === 'react/jsx-runtime') return load(specifier);
      if (specifier === 'zod') return load(process.env.IV_TEST_ZOD_ENTRY || 'zod');
      // Only the starter fixture's ID dependency is substituted; UUIDv7 ordering is not under test.
      if (specifier === 'uuid' && file.endsWith('/packages/domain/ids.ts')) return { v7: () => webcrypto.randomUUID() };
      if (ui[specifier]) return ui[specifier];
      assert.ok(specifier.startsWith('@/') || specifier.startsWith('.'), `Unexpected source import: ${specifier}`);
      const base = specifier.startsWith('@/') ? path.join(repository, specifier.slice(2)) : path.resolve(path.dirname(file), specifier);
      for (const extension of ['.ts', '.tsx']) {
        try { readFileSync(base + extension); } catch { continue; }
        return source(base + extension);
      }
      throw new Error(`No source module for ${specifier}`);
    };
    vm.runInContext('(function(exports,require,module){\n' + compiled.outputText + '\n})', context, { filename: file })(module.exports, requireSource, module);
    return module.exports;
  }
  return { source };
}

const ssr = sourceRuntime(React);
const callbacks = sourceRuntime(callbackReact);
const { CourseEditor } = callbacks.source('components/visualizations/course-editor.tsx');
const { createStarterCourseDocument } = ssr.source('packages/domain/fixtures.ts');
const { createCourseBlock, createCourseLesson, createCourseModule, validateCourseEdit } = ssr.source('lib/client/course-authoring.ts');

function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}

const plain = (value) => JSON.parse(JSON.stringify(value));

function course() {
  const document = createStarterCourseDocument();
  document.title = 'Authored <course> & title';
  document.sourceManifest = [{ id: 'authored-source', label: 'Authored notes', kind: 'paste', contentHash: 'keep-this-hash', provenance: 'Authored source context' }];
  document.course.references = [{ id: 'authored-reference', title: 'Authored reference', href: 'https://reference.invalid/notes', note: 'Authored note' }];
  return document;
}

function descendants(node, result = []) {
  if (React.isValidElement(node)) {
    result.push(node);
    React.Children.forEach(node.props.children, (child) => descendants(child, result));
  }
  return result;
}

function one(tree, predicate) {
  const matches = descendants(tree).filter(predicate);
  assert.equal(matches.length, 1, 'Expected one matching source element.');
  return matches[0];
}

const button = (tree, label) => one(tree, (node) => node.props.children === label && typeof node.props.onClick === 'function');
const fields = (tree) => one(tree, (node) => node.type?.name === 'DocumentFields');
const submit = (tree) => one(tree, (node) => node.type === 'form').props.onSubmit({ preventDefault() {} });

export function registerCourseEditorChecks(test) {
  test('actual React SSR exposes all typed block fields and unique labels without changing the supplied course', () => {
    const document = course(), lesson = document.course.modules[0].lessons[0];
    const kinds = ['heading', 'prose', 'callout', 'multiple-choice-check', 'free-recall-check', 'summary'];
    lesson.blocks = kinds.map(createCourseBlock);
    lesson.practice = kinds.map(createCourseBlock);
    lesson.references = ['Book title, chapter 3\nAuthored freeform note'];
    const before = structuredClone(document);
    const html = renderToStaticMarkup(React.createElement(ssr.source('components/visualizations/course-editor.tsx').CourseEditor, {
      document: freeze(document), onApply() { assert.fail('SSR must not apply.'); }, onCancel() { assert.fail('SSR must not cancel.'); },
    }));
    for (const label of ['Title', 'Subtitle', 'Search description', 'Learner level', 'Estimated course minutes', 'Assumed knowledge', 'Required lessons', 'Heading text', 'Prose text', 'Callout body', 'Check prompt', 'Answer explanation', 'Recall guidance', 'Summary points', 'Lesson feedback', 'Reference web address 1']) assert.ok(html.includes(label), label);
    assert.ok(html.includes('Authored &lt;course&gt; &amp; title'));
    assert.ok(html.includes('Book title, chapter 3\nAuthored freeform note'));
    const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
    assert.equal(new Set(ids).size, ids.length, 'Every rendered field ID must be unique.');
    for (const [, id] of html.matchAll(/\bfor="([^"]+)"/g)) assert.ok(ids.includes(id), `Label target ${id}`);
    assert.ok([...html.matchAll(/<button\b[^>]*>/g)].every(([tag]) => tag.includes('min-h-11')), 'Editing buttons retain their 44px minimum class.');
    assert.doesNotMatch(html, /keep-this-hash|providerId|modelId/);
    assert.deepEqual(plain(document), before);
  });

  test('actual prerequisite fields show unavailable IDs with an explicit remove action', () => {
    const document = course();
    document.course.modules[0].lessons[0].prerequisiteIds = ['unavailable-authored-lesson'];
    const html = renderToStaticMarkup(React.createElement(ssr.source('components/visualizations/course-editor.tsx').CourseEditor, { document, onApply() {}, onCancel() {} }));
    assert.ok(html.includes('Unavailable lesson'));
    assert.ok(html.includes('Remove unavailable prerequisite unavailable-authored-lesson'));
  });

  test('actual edit callbacks clone the source and pristine cancellation never applies', () => {
    const supplied = course(); supplied.subtitle = 'Optional authored subtitle';
    const original = freeze(supplied), before = structuredClone(original);
    let canceled = 0, applied = 0;
    const editor = new Harness(CourseEditor, { document: original, onApply() { applied++; return null; }, onCancel() { canceled++; } });
    button(editor.render(), 'Cancel').props.onClick();
    assert.equal(canceled, 1); assert.equal(applied, 0);
    const documentFields = fields(editor.render());
    const fieldTree = new Harness(documentFields.type, documentFields.props).render();
    one(fieldTree, (node) => node.props.label === 'Subtitle').props.onChange('');
    assert.equal(Object.hasOwn(fields(editor.render()).props.draft, 'subtitle'), false, 'Clearing the optional subtitle must delete it, not introduce undefined.');
    assert.doesNotThrow(() => validateCourseEdit(fields(editor.render()).props.draft));
    fields(editor.render()).props.update((draft) => { draft.title = 'Unapplied authored title'; });
    assert.equal(fields(editor.render()).props.draft.title, 'Unapplied authored title');
    assert.deepEqual(plain(original), before);
  });

  test('dirty close callbacks cancel dismissal and keep fields until explicit discard', () => {
    const original = freeze(course());
    let canceled = 0, dismissalCanceled = 0;
    const editor = new Harness(CourseEditor, { document: original, onApply() { return null; }, onCancel() { canceled++; } });
    fields(editor.render()).props.update((draft) => { draft.summary = 'Unapplied summary'; });
    editor.render().props.onOpenChange(false, { cancel() { dismissalCanceled++; } });
    assert.equal(dismissalCanceled, 1); assert.equal(canceled, 0);
    button(editor.render(), 'Keep editing').props.onClick();
    assert.equal(fields(editor.render()).props.draft.summary, 'Unapplied summary');
    button(editor.render(), 'Cancel').props.onClick();
    button(editor.render(), 'Discard changes').props.onClick();
    assert.equal(canceled, 1);
    assert.notEqual(original.summary, 'Unapplied summary');
  });

  test('actual Apply validates edited content and retains fields on parent persistence error', () => {
    const original = freeze(course());
    let received = null;
    const editor = new Harness(CourseEditor, { document: original, onApply(value) { received = value; return 'Authored persistence failure'; }, onCancel() { assert.fail('An Apply failure must keep the editor open.'); } });
    fields(editor.render()).props.update((draft) => { draft.title = 'Applied candidate'; });
    submit(editor.render());
    assert.equal(received.title, 'Applied candidate');
    assert.equal(one(editor.render(), (node) => node.props.role === 'alert').props.children, 'Authored persistence failure');
    assert.equal(fields(editor.render()).props.draft.title, 'Applied candidate');
    assert.notEqual(original.title, 'Applied candidate');
    assert.deepEqual(plain(received.sourceManifest), plain(original.sourceManifest));
    assert.deepEqual(plain(received.theme), plain(original.theme));
  });

  test('invalid fields block actual Apply before parent mutation and remain editable', () => {
    let applied = 0;
    const editor = new Harness(CourseEditor, { document: freeze(course()), onApply() { applied++; return null; }, onCancel() {} });
    fields(editor.render()).props.update((draft) => { draft.title = ''; });
    submit(editor.render());
    assert.equal(applied, 0);
    assert.equal(fields(editor.render()).props.draft.title, '');
    assert.ok(one(editor.render(), (node) => node.props.role === 'alert').props.children.length > 0);
  });

  test('actual Preview uses an unapplied validated snapshot and resets check generation', () => {
    let applied = 0;
    const original = freeze(course());
    const editor = new Harness(CourseEditor, { document: original, onApply() { applied++; return null; }, onCancel() {} });
    fields(editor.render()).props.update((draft) => { draft.title = 'Preview-only title'; });
    button(editor.render(), 'Preview draft').props.onClick();
    const first = one(editor.render(), (node) => node.type?.name === 'CoursePreview');
    assert.equal(first.props.document.title, 'Preview-only title');
    button(editor.render(), 'Edit fields').props.onClick();
    button(editor.render(), 'Preview draft').props.onClick();
    const second = one(editor.render(), (node) => node.type?.name === 'CoursePreview');
    assert.notEqual(first.key, second.key);
    assert.equal(applied, 0); assert.notEqual(original.title, 'Preview-only title');
  });

  test('later document props do not replace an unapplied local edit', () => {
    const editor = new Harness(CourseEditor, { document: freeze(course()), onApply() { return null; }, onCancel() {} });
    fields(editor.render()).props.update((draft) => { draft.title = 'Keep local fields'; });
    const changed = course(); changed.title = 'New parent props';
    editor.props = { ...editor.props, document: changed };
    assert.equal(fields(editor.render()).props.draft.title, 'Keep local fields');
  });

  test('actual module removal cleans dependent lesson links only in the isolated draft', () => {
    const document = course(), second = createCourseModule();
    second.lessons[0].prerequisiteIds = [document.course.modules[0].lessons[0].id];
    document.course.modules.push(second);
    const before = structuredClone(document);
    const editor = new Harness(CourseEditor, { document: freeze(document), onApply() { return null; }, onCancel() {} });
    const firstModule = descendants(editor.render()).find((node) => node.type?.name === 'ModuleEditor');
    firstModule.props.onRemove();
    const draft = fields(editor.render()).props.draft;
    assert.equal(draft.course.modules.length, 1);
    assert.deepEqual([...draft.course.modules[0].lessons[0].prerequisiteIds], []);
    assert.deepEqual(plain(document), before);
  });

  test('actual lesson removal cleans dependent links while retaining one lesson per module', () => {
    const document = course(), module = document.course.modules[0], removedID = module.lessons[0].id;
    const second = createCourseLesson(); second.prerequisiteIds = [removedID]; module.lessons.push(second);
    const editor = new Harness(CourseEditor, { document: freeze(document), onApply() { return null; }, onCancel() {} });
    one(editor.render(), (node) => node.type?.name === 'ModuleEditor').props.onRemoveLesson(removedID);
    let draft = fields(editor.render()).props.draft;
    assert.equal(draft.course.modules[0].lessons.length, 1);
    assert.deepEqual([...draft.course.modules[0].lessons[0].prerequisiteIds], []);
    one(editor.render(), (node) => node.type?.name === 'ModuleEditor').props.onRemoveLesson(second.id);
    draft = fields(editor.render()).props.draft;
    assert.equal(draft.course.modules[0].lessons.length, 1);
  });

  test('actual MC option callbacks preserve the correct answer through reorder and require reselection after removal', () => {
    const { BlockListEditor } = callbacks.source('components/visualizations/course-editor/block-editor.tsx');
    let block = { ...createCourseBlock('multiple-choice-check'), options: ['Authored A', 'Authored B', 'Authored C'], answerIndex: 1 };
    const list = new Harness(BlockListEditor, { label: 'Content', blocks: [block], onChange() {} });
    const blockFields = one(list.render(), (node) => node.type?.name === 'BlockFields');
    const renderedFields = new Harness(blockFields.type, blockFields.props).render();
    const choice = one(renderedFields, (node) => node.type?.name === 'ChoiceOptions');
    const options = new Harness(choice.type, { block, onChange(value) { block = value; } });
    const originalAnswerID = one(options.render(), (node) => node.type === 'input' && node.props.checked).props.id;
    one(options.render(), (node) => node.type?.name === 'ReorderControls' && node.props.index === 0).props.onMove(1);
    assert.deepEqual([...block.options], ['Authored B', 'Authored A', 'Authored C']); assert.equal(block.answerIndex, 0);
    options.props = { ...options.props, block };
    assert.equal(one(options.render(), (node) => node.type === 'input' && node.props.checked).props.id, originalAnswerID);
    one(options.render(), (node) => node.type?.name === 'ReorderControls' && node.props.index === 0).props.onRemove();
    assert.equal(block.answerIndex, -1);
    const document = course(); document.course.modules[0].lessons[0].blocks = [block];
    assert.throws(() => validateCourseEdit(document));
    options.props = { ...options.props, block };
    const survivingRadios = descendants(options.render()).filter((node) => node.type === 'input');
    survivingRadios[1].props.onChange();
    document.course.modules[0].lessons[0].blocks = [block];
    assert.doesNotThrow(() => validateCourseEdit(document));
  });
}
