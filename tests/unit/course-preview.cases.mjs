// Tier 2: authored data through the actual React renderer. No browser, backend,
// model, file provider or native interaction executes.
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
const sourcePath = process.env.IV_COURSE_PREVIEW_SOURCE
  || path.join(repository, 'components/visualizations/renderers/course-preview.tsx');
const source = await readFile(sourcePath, 'utf8');
const compiled = ts.transpileModule(source, {
  fileName: sourcePath,
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  reportDiagnostics: true,
});
assert.equal(compiled.diagnostics.length, 0, 'The actual preview must transpile without syntax diagnostics.');
const runtime = new Map([['react', React], ['react/jsx-runtime', load('react/jsx-runtime')]]);
const module = { exports: {} };
vm.runInNewContext('(function (exports, require, module) {\n' + compiled.outputText + '\n})', {}, { filename: sourcePath })(
  module.exports,
  (specifier) => { assert.ok(runtime.has(specifier), 'Unexpected preview import: ' + specifier); return runtime.get(specifier); },
  module,
);

function lesson(id, overrides = {}) {
  return {
    id, title: 'Authored lesson ' + id, objective: 'Authored lesson objective', estimatedMinutes: 8,
    prerequisiteIds: [], explanation: 'Authored explanation', blocks: [], practice: [],
    feedback: '', summary: 'Authored lesson summary', references: [], ...overrides,
  };
}

function course() {
  return {
    title: 'Authored course', subtitle: 'Authored subtitle', summary: 'Authored summary',
    audience: 'Authored audience', goal: 'Authored document goal',
    theme: { background: '#ffffff', foreground: '#222222', bodyFont: 'sans-serif',
      accent: '#ff6f4d', muted: '#eeeeee', border: '#dddddd', displayFont: 'serif' },
    course: {
      mission: 'Authored mission', estimatedMinutes: 16, learningObjectives: ['Authored objective'],
      prerequisites: ['Authored course prerequisite'],
      learnerProfile: { level: 'beginner', assumedKnowledge: ['Authored knowledge'],
        goals: ['Authored learner goal'], constraints: ['Authored learning constraint'] },
      modules: [{ id: 'module-1', title: 'Authored module', objective: 'Authored module objective',
        lessons: [lesson('one'), lesson('two', { prerequisiteIds: ['one'], feedback: 'Authored feedback', references: ['reference-1', 'Authored independent citation'] })] }],
      glossary: [{ id: 'glossary-1', term: 'Authored term', definition: 'Authored definition' }],
      references: [{ id: 'reference-1', title: 'Authored reference', href: 'https://example.com/authored', note: 'Authored note' }],
    },
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
  const before = structuredClone(document);
  const html = renderToStaticMarkup(React.createElement(module.exports.CoursePreview, { document: freeze(document) }));
  assert.deepEqual(document, before, 'Preview must not annotate or alter the authored document.');
  return html;
}

export function registerCoursePreviewChecks(test) {
  test('authored subtitle, audience and goal remain visible in Course preview', () => {
    const document = course();
    const html = render(document);
    for (const text of [document.subtitle, document.audience, document.goal]) assert.ok(html.includes(text), text);
  });

  test('learner preparation preserves all supplied prerequisites and profile lists', () => {
    const document = course();
    const html = render(document);
    for (const text of [...document.course.prerequisites, ...document.course.learnerProfile.assumedKnowledge,
      ...document.course.learnerProfile.goals, ...document.course.learnerProfile.constraints]) assert.ok(html.includes(text), text);
    assert.ok(html.includes('Before you start'));
  });

  test('lesson feedback, prerequisite titles and both reference forms remain visible', () => {
    const document = course();
    const html = render(document);
    assert.ok(html.includes('Authored feedback'));
    assert.match(html, /Before this lesson[\s\S]*Authored lesson one/);
    assert.match(html, /Lesson references[\s\S]*Authored reference[\s\S]*Authored independent citation/);
  });

  test('existing lesson content and all six typed blocks remain renderable', () => {
    const document = course();
    document.course.modules[0].lessons[0].blocks = [
      { id: 'heading', kind: 'heading', text: 'Authored heading block' },
      { id: 'prose', kind: 'prose', text: 'Authored prose block' },
      { id: 'callout', kind: 'callout', title: 'Authored callout', body: 'Authored callout body' },
      { id: 'choice', kind: 'multiple-choice-check', prompt: 'Authored choice question', options: ['Authored option A', 'Authored option B'], answerIndex: 1, explanation: 'Not yet revealed' },
      { id: 'recall', kind: 'free-recall-check', prompt: 'Authored recall prompt', guidance: 'Authored recall guidance' },
      { id: 'summary', kind: 'summary', items: ['Authored block summary'] },
    ];
    const html = render(document);
    for (const text of ['Authored course', 'Authored mission', 'Authored objective', 'Authored module',
      'Authored lesson one', 'Authored explanation', 'Authored lesson summary', 'Authored term', 'Authored definition',
      'Authored heading block', 'Authored prose block', 'Authored callout body', 'Authored choice question',
      'Authored option A', 'Authored option B', 'Authored recall prompt', 'Authored recall guidance', 'Authored block summary']) {
      assert.ok(html.includes(text), text);
    }
    assert.doesNotMatch(html, /Not yet revealed/);
  });

  test('author-supplied metadata and feedback render as escaped text', () => {
    const document = course();
    const text = '<script>authored()</script> & supplied';
    document.subtitle = text;
    document.course.modules[0].lessons[0].feedback = text;
    const html = render(document);
    assert.equal(html.split('&lt;script&gt;authored()&lt;/script&gt; &amp; supplied').length - 1, 2);
    assert.doesNotMatch(html, /<script/);
  });

  test('empty optional preparation and lesson references do not invent content', () => {
    const document = course();
    document.subtitle = '';
    document.course.prerequisites = [];
    document.course.learnerProfile = { level: 'mixed', assumedKnowledge: [], goals: [], constraints: [] };
    for (const value of document.course.modules[0].lessons) {
      value.feedback = ''; value.prerequisiteIds = []; value.references = [];
    }
    const html = render(document);
    assert.doesNotMatch(html, /Before you start|Before this lesson|Lesson references|Feedback|undefined|null/);
  });
}
