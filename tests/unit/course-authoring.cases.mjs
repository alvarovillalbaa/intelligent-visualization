// Tier 2: authored fixtures through actual client helpers and guest persistence.
// localStorage is in memory; fixture UUIDs use native randomUUID (not UUIDv7).
// No browser, backend, provider or model executes.
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const repository = fileURLToPath(new URL('../../', import.meta.url));
const project = process.env.IV_TEST_PROJECT_ROOT || repository;
const external = createRequire(path.join(project, 'package.json'));
const ts = external('typescript');
const context = vm.createContext({
  structuredClone, TextEncoder, URL, crypto: webcrypto,
  fetch() { throw new Error('Network is forbidden in course authoring checks.'); },
});
const modules = new Map();

function actual(relative) {
  const filename = path.resolve(repository, relative.endsWith('.ts') ? relative : relative + '.ts');
  assert.ok(filename.startsWith(repository), 'Only repository source can be VM-loaded.');
  if (modules.has(filename)) return modules.get(filename).exports;
  const compiled = ts.transpileModule(readFileSync(filename, 'utf8'), {
    fileName: filename,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    reportDiagnostics: true,
  });
  assert.equal(compiled.diagnostics.length, 0, filename + ' must transpile without syntax diagnostics.');
  const moduleRecord = { exports: {} };
  modules.set(filename, moduleRecord);
  const require = (specifier) => {
    if (specifier.startsWith('@/')) return actual(specifier.slice(2));
    if (specifier.startsWith('.')) return actual(path.relative(repository, path.resolve(path.dirname(filename), specifier)));
    if (specifier === 'uuid') return { v7: () => webcrypto.randomUUID() };
    assert.equal(specifier, 'zod', 'Unexpected runtime dependency: ' + specifier);
    return external(process.env.IV_TEST_ZOD_ENTRY || specifier);
  };
  vm.runInContext('(function(exports,require,module){\n' + compiled.outputText + '\n})', context, { filename })(moduleRecord.exports, require, moduleRecord);
  return moduleRecord.exports;
}

const { validateCourseEdit, applyCourseDraftEdit, createCourseBlock, createCourseLesson, createCourseModule, COURSE_AUTHORING_LIMITS } = actual('lib/client/course-authoring');
const { createGenerationBatch, updateGenerationResult } = actual('lib/client/generation-batch');
const { storeGuestDraft, loadGuestDraft } = actual('lib/client/guest-draft');
const { createStarterCourseDocument, createStarterSlidesDocument, createStarterReportDocument } = actual('packages/domain/fixtures');
const plain = (value) => JSON.parse(JSON.stringify(value));
const clone = (value) => structuredClone(value);

function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

function course() {
  const document = createStarterCourseDocument();
  document.sourceManifest = [{ id: 'authored-source', label: 'Authored source', kind: 'paste', contentHash: 'authored-hash', provenance: 'Authored evidence; not provider output.' }];
  document.assetIds = ['authored-asset'];
  document.engagement = { cta: { label: 'Read the source', href: 'https://example.com/source' }, poll: { question: 'Was this clear?', options: ['Yes', 'Not yet'] } };
  return document;
}

function batch() {
  const input = { inputKind: 'paste', rawText: '  Authored source\r\nkeep whitespace  ', prompt: 'Teach this source', files: [{ name: 'authored.txt', type: 'text/plain', content: 'Exact file source' }], themeMode: 'brand' };
  let value = createGenerationBatch(['slides', 'course', 'report'], input, 'authored-course-batch', 100);
  for (const result of value.results) {
    const document = result.kind === 'course' ? course() : result.kind === 'slides' ? createStarterSlidesDocument() : createStarterReportDocument();
    value = updateGenerationResult(value, result.id, { status: 'completed', draft: { kind: result.kind, document, provider: 'authored-provider', modelName: 'authored-model', generatedAt: 101, artifactHtml: '<html>Stale authored artifact</html>' }, saveStatus: 'saved', savedDeckId: 'saved-' + result.kind });
  }
  return value;
}

function target(value) { return value.results.find((result) => result.kind === 'course'); }
function apply(value, edited, expected = clone(target(value).draft)) {
  return applyCourseDraftEdit(value, target(value).id, expected, edited);
}

function storage(run) {
  const values = new Map();
  let writes = 0;
  let rejectWrites = false;
  const prior = context.window;
  context.window = { localStorage: {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      writes++;
      if (rejectWrites) {
        const error = new Error('Authored storage quota exhausted');
        error.name = 'QuotaExceededError';
        throw error;
      }
      values.set(key, value);
    },
    removeItem: (key) => { values.delete(key); },
  } };
  try { run({ values, writes: () => writes, failWrites: () => { rejectWrites = true; } }); }
  finally {
    if (prior === undefined) delete context.window;
    else context.window = prior;
  }
}

function snapshot(value) {
  return { input: { rawText: value.input.rawText, files: value.input.files }, selectedKind: 'course', selectedKinds: ['slides', 'course', 'report'], draft: null, batch: value };
}

export function registerCourseAuthoringChecks(test) {
  test('valid course validation clones values without trimming, annotating or changing the source', () => {
    const value = course();
    value.title = '  Authored title  ';
    const before = plain(value);
    const validated = validateCourseEdit(freeze(value));
    assert.deepEqual(plain(validated), before);
    assert.notEqual(validated, value);
    assert.notEqual(validated.course.modules, value.course.modules);
    assert.equal(validated.title, '  Authored title  ');
  });

  test('factories create independent valid modules, lessons and every typed block', () => {
    const value = course();
    value.course.modules = [createCourseModule(), createCourseModule()];
    const lesson = createCourseLesson();
    value.course.modules[0].lessons.push(lesson);
    const kinds = ['heading', 'prose', 'callout', 'multiple-choice-check', 'free-recall-check', 'summary'];
    lesson.blocks = kinds.map(createCourseBlock);
    assert.doesNotThrow(() => validateCourseEdit(value));
    assert.notEqual(value.course.modules[0].id, value.course.modules[1].id);
    assert.notEqual(value.course.modules[0].lessons[0].blocks, value.course.modules[1].lessons[0].blocks);
    assert.deepEqual(lesson.blocks.map(({ kind }) => kind), kinds);
    assert.throws(() => createCourseBlock('unsupported'), /supported/);
  });

  test('applying edits is immutable, preserves every sibling/input/save state and removes stale HTML', () => {
    const value = batch(), original = plain(value), expected = clone(target(value).draft);
    const edited = clone(expected.document);
    edited.title = 'Edited title'; edited.subtitle = 'Edited subtitle'; edited.summary = 'Edited summary';
    edited.audience = 'Edited audience'; edited.goal = 'Edited goal'; edited.seo = { title: 'Edited SEO', description: 'Edited description' };
    edited.course.mission = 'Edited mission';
    const editBefore = plain(edited);
    const next = apply(freeze(value), freeze(edited), freeze(expected));
    assert.notEqual(next, value);
    assert.equal(next.input, value.input);
    assert.equal(next.results[0], value.results[0]); assert.equal(next.results[2], value.results[2]);
    assert.equal(target(next).saveStatus, 'saved'); assert.equal(target(next).savedDeckId, 'saved-course');
    assert.equal(target(next).draft.provider, 'authored-provider'); assert.equal(target(next).draft.modelName, 'authored-model');
    assert.equal(target(next).draft.generatedAt, 101);
    assert.equal(Object.hasOwn(target(next).draft, 'artifactHtml'), false);
    assert.equal(target(next).draft.document.title, edited.title);
    assert.deepEqual(plain(target(next).draft.document.course), plain(edited.course));
    assert.deepEqual(plain(value), original); assert.deepEqual(plain(edited), editBefore);
  });

  test('only editable fields are adopted while theme, brand, source, assets, engagement and schema metadata survive', () => {
    const value = batch(), original = clone(target(value).draft.document), edited = clone(original);
    edited.schemaVersion = 2; edited.locale = 'fr-FR'; edited.visualDirection.layout = 'forged layout';
    edited.theme.accent = '#ffffff'; edited.brand.companyName = 'Forged brand';
    edited.sourceManifest = []; edited.assetIds = []; edited.engagement = {};
    edited.course.mission = 'Authored changed mission';
    const output = target(apply(value, edited)).draft.document;
    for (const key of ['schemaVersion', 'locale', 'visualDirection', 'theme', 'brand', 'sourceManifest', 'assetIds', 'engagement']) assert.deepEqual(plain(output[key]), plain(original[key]), key);
    assert.equal(output.course.mission, edited.course.mission);
  });

  test('omitting an optional subtitle explicitly removes it without losing other fields', () => {
    const value = batch(); target(value).draft.document.subtitle = 'Previous subtitle';
    const edited = clone(target(value).draft.document); delete edited.subtitle;
    const output = target(apply(value, edited)).draft.document;
    assert.equal(Object.hasOwn(output, 'subtitle'), false);
  });

  test('reordering modules, lessons, content and practice persists exact identities and answer selection', () => {
    const value = batch(), edited = clone(target(value).draft.document);
    edited.course.modules.push(createCourseModule());
    edited.course.modules[0].lessons.push(createCourseLesson());
    const lesson = edited.course.modules[0].lessons[0];
    lesson.blocks.reverse(); lesson.practice.push(createCourseBlock('free-recall-check')); lesson.practice.reverse();
    const multiple = lesson.practice.find(({ kind }) => kind === 'multiple-choice-check');
    multiple.options = ['Reordered second', 'Reordered first']; multiple.answerIndex = 1;
    edited.course.modules[0].lessons.reverse(); edited.course.modules.reverse();
    const output = target(apply(value, edited)).draft.document;
    assert.deepEqual(plain(output.course), plain(edited.course));
    assert.equal(output.course.modules[1].lessons[1].practice[1].answerIndex, 1);
  });

  test('editing and validating a disposable clone leaves the batch and durable guest snapshot unchanged until Apply', () => storage(({ values, writes }) => {
    const value = batch(), before = plain(value);
    assert.equal(storeGuestDraft(snapshot(value)).stored, true);
    const rawBefore = [...values.values()][0], count = writes();
    const cancelled = clone(target(value).draft.document);
    cancelled.title = 'Discard this title'; cancelled.course.modules.push(createCourseModule());
    validateCourseEdit(cancelled);
    assert.deepEqual(plain(value), before); assert.equal(writes(), count); assert.equal([...values.values()][0], rawBefore);
  }));

  test('edited course and unchanged source/siblings round-trip through actual guest storage without compiled HTML', () => storage(() => {
    const value = batch(), edited = clone(target(value).draft.document);
    edited.title = 'Durable authored title'; edited.course.glossary.push({ id: 'new-glossary', term: 'Evidence', definition: 'Authored definition' });
    const next = apply(value, edited);
    assert.equal(storeGuestDraft(snapshot(next)).stored, true);
    const loaded = loadGuestDraft();
    assert.equal(loaded.recoveryRequired, false);
    assert.equal(target(loaded.batch).draft.document.title, edited.title);
    assert.deepEqual(plain(loaded.batch.input), plain(value.input));
    for (let index = 0; index < 3; index++) {
      assert.deepEqual(plain(loaded.batch.results[index].draft.document), plain(next.results[index].draft.document));
      assert.equal(Object.hasOwn(loaded.batch.results[index].draft, 'artifactHtml'), false);
    }
    assert.equal(target(loaded.batch).saveStatus, 'saved'); assert.equal(target(loaded.batch).draft.provider, 'authored-provider');
  }));

  test('failed guest replacement retains the prior durable course while keeping the edited in-memory batch and siblings intact', () => storage(({ values, writes, failWrites }) => {
    const original = batch();
    assert.equal(storeGuestDraft(snapshot(original)).stored, true);
    const priorRaw = values.get('iv:guest-draft:v2'), priorWrites = writes();
    const edited = clone(target(original).draft.document);
    edited.title = 'New in-memory course awaiting a durable save';
    const next = apply(original, edited), beforeStore = plain(next);
    failWrites();
    assert.deepEqual(plain(storeGuestDraft(snapshot(next))), { stored: false, compacted: false });
    assert.ok(writes() > priorWrites, 'The actual guest store must attempt the replacement.');
    assert.equal(values.get('iv:guest-draft:v2'), priorRaw);
    const reloaded = loadGuestDraft();
    assert.equal(target(reloaded.batch).draft.document.title, target(original).draft.document.title);
    for (let index = 0; index < 3; index++) assert.deepEqual(plain(reloaded.batch.results[index].draft.document), plain(original.results[index].draft.document));
    assert.deepEqual(plain(next), beforeStore);
    assert.equal(target(next).draft.document.title, edited.title);
    assert.equal(next.results[0], original.results[0]); assert.equal(next.results[2], original.results[2]);
  }));

  test('sibling asynchronous completions and target save updates do not invalidate the unchanged expected draft', () => {
    const value = batch(), expected = clone(target(value).draft), edited = clone(expected.document);
    edited.title = 'Course edit beside asynchronous siblings';
    const changed = clone(value);
    changed.results[0].status = 'running'; changed.results[0].error = 'Authored retry notice';
    target(changed).saveStatus = 'saving'; target(changed).savedDeckId = 'newly-returned-id';
    const output = apply(changed, edited, expected);
    assert.equal(output.results[0], changed.results[0]);
    assert.equal(target(output).saveStatus, 'saving'); assert.equal(target(output).savedDeckId, 'newly-returned-id');
    assert.equal(target(output).draft.document.title, edited.title);
  });

  for (const field of ['document', 'provider', 'modelName', 'generatedAt', 'artifactHtml']) {
    test(`changed current draft ${field} rejects stale Apply without replacing any batch state`, () => {
      const value = batch(), expected = clone(target(value).draft), edited = clone(expected.document);
      if (field === 'document') target(value).draft.document.title = 'Newer title';
      else if (field === 'generatedAt') target(value).draft.generatedAt++;
      else target(value).draft[field] += ' changed';
      const before = plain(value);
      assert.throws(() => apply(value, edited, expected), /changed while you were editing/);
      assert.deepEqual(plain(value), before);
    });
  }

  test('expected draft object key order does not create a false stale edit', () => {
    const value = batch(), original = target(value).draft;
    const expected = Object.fromEntries(Object.entries(clone(original)).reverse());
    const edited = clone(original.document); edited.title = 'Equivalent expected snapshot';
    assert.equal(target(apply(value, edited, expected)).draft.document.title, edited.title);
  });

  test('missing, duplicated, mismatched and unfinished target results cannot be edited', () => {
    const value = batch(), expected = clone(target(value).draft), edited = clone(expected.document), id = target(value).id;
    assert.throws(() => applyCourseDraftEdit(value, 'missing-course', expected, edited), /no longer available/);
    for (const status of ['queued', 'running', 'failed', 'interrupted']) {
      const changed = clone(value); target(changed).status = status;
      assert.throws(() => apply(changed, edited, expected), /no longer available/);
    }
    const duplicated = clone(value); duplicated.results.push(clone(target(duplicated)));
    assert.throws(() => applyCourseDraftEdit(duplicated, id, expected, edited), /no longer available/);
    const mismatched = clone(value); target(mismatched).draft.kind = 'report';
    assert.throws(() => apply(mismatched, edited, expected), /no longer available/);
  });

  test('invalid Apply is transactional and cannot erase existing compiled HTML or saved state', () => {
    const value = batch(), before = plain(value), edited = clone(target(value).draft.document);
    edited.course.modules[0].lessons[0].practice[0].answerIndex = 999;
    assert.throws(() => apply(freeze(value), edited), /correct answer/);
    assert.deepEqual(plain(value), before);
  });

  for (const location of ['module', 'lesson', 'block', 'glossary', 'reference', 'source', 'asset', 'theme']) {
    test(`blank ${location} ID rejects the entire authored document`, () => {
      const value = course(), courseModule = value.course.modules[0], lesson = courseModule.lessons[0];
      if (location === 'module') courseModule.id = ' ';
      if (location === 'lesson') lesson.id = ' ';
      if (location === 'block') lesson.blocks[0].id = ' ';
      if (location === 'glossary') value.course.glossary[0].id = ' ';
      if (location === 'reference') value.course.references = [{ id: ' ', title: 'Reference', href: 'https://example.com', note: '' }];
      if (location === 'source') value.sourceManifest[0].id = ' ';
      if (location === 'asset') value.assetIds = [' '];
      if (location === 'theme') value.theme = { ...value.theme, id: ' ' };
      assert.throws(() => validateCourseEdit(value), /cannot be blank/);
    });
  }

  test('duplicate record IDs across modules, lessons, content, practice, glossary and references reject', () => {
    const operations = [
      (v) => { v.course.modules.push(clone(v.course.modules[0])); },
      (v) => { v.course.modules[0].lessons.push(clone(v.course.modules[0].lessons[0])); },
      (v) => { v.course.modules[0].lessons[0].practice[0].id = v.course.modules[0].lessons[0].blocks[0].id; },
      (v) => { v.course.glossary[0].id = v.course.modules[0].id; },
      (v) => { v.course.references = [{ id: v.course.glossary[0].id, title: 'Ref', href: 'https://example.com', note: '' }]; },
    ];
    for (const change of operations) { const value = course(); change(value); assert.throws(() => validateCourseEdit(value), /Duplicate ID/); }
  });

  for (const location of ['course', 'lesson']) {
    test(`${location} duration must be a positive finite safe integer`, () => {
      for (const minutes of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
        const value = course();
        (location === 'course' ? value.course : value.course.modules[0].lessons[0]).estimatedMinutes = minutes;
        assert.throws(() => validateCourseEdit(value));
      }
    });
  }

  test('multiple-choice answers remain in range and options stay nonblank with at least two choices', () => {
    for (const change of [
      (b) => { b.answerIndex = -1; }, (b) => { b.answerIndex = 1.5; },
      (b) => { b.answerIndex = b.options.length; }, (b) => { b.answerIndex = NaN; },
      (b) => { b.options = ['Only one']; }, (b) => { b.options[0] = ' \n'; },
    ]) {
      const value = course(); change(value.course.modules[0].lessons[0].practice[0]);
      assert.throws(() => validateCourseEdit(value));
    }
  });

  test('cross-module prerequisite chains are valid without imposing display order', () => {
    const value = course(), second = createCourseModule(), firstLesson = value.course.modules[0].lessons[0];
    second.lessons[0].prerequisiteIds = [firstLesson.id];
    value.course.modules.unshift(second);
    assert.doesNotThrow(() => validateCourseEdit(value));
  });

  test('a module without lessons stays editable but cannot be applied as an empty learning unit', () => {
    const value = batch(), edited = clone(target(value).draft.document);
    edited.course.modules[0].lessons = [];
    assert.throws(() => apply(value, edited), /Add a lesson/);
    assert.equal(target(value).draft.document.course.modules[0].lessons.length, 1);
  });

  test('missing, self, duplicate and cyclic prerequisites reject without filtering source dependencies', () => {
    for (const mode of ['missing', 'self', 'duplicate', 'cycle']) {
      const value = course(), first = value.course.modules[0].lessons[0], second = createCourseLesson();
      value.course.modules.push({ ...createCourseModule(), lessons: [second] });
      first.prerequisiteIds = mode === 'missing' ? ['deleted-lesson'] : mode === 'self' ? [first.id] : mode === 'duplicate' ? [second.id, second.id] : [second.id];
      if (mode === 'cycle') second.prerequisiteIds = [first.id];
      const before = plain(value);
      assert.throws(() => validateCourseEdit(value)); assert.deepEqual(plain(value), before);
    }
  });

  test('deleting a referenced lesson requires explicit dependency repair before Apply', () => {
    const value = batch(), edited = clone(target(value).draft.document), first = edited.course.modules[0].lessons[0], second = createCourseLesson();
    second.prerequisiteIds = [first.id]; edited.course.modules[0].lessons = [second];
    assert.throws(() => apply(value, edited), /no longer exists/);
    second.prerequisiteIds = [];
    assert.equal(target(apply(value, edited)).draft.document.course.modules[0].lessons[0].id, second.id);
  });

  test('only HTTP and HTTPS course reference URLs can be authored', () => {
    for (const href of ['javascript:alert(1)', 'data:text/plain,authored', 'mailto:test@example.com', 'ftp://example.com/file', 'file:///tmp/authored']) {
      const value = course(); value.course.references = [{ id: 'authored-ref', title: 'Reference', href, note: '' }];
      assert.throws(() => validateCourseEdit(value), /HTTP or HTTPS/);
    }
    for (const href of ['http://example.com/source', 'https://example.com/source?q=authored#part']) {
      const value = course(); value.course.references = [{ id: 'authored-ref', title: 'Reference', href, note: '' }];
      assert.equal(validateCourseEdit(value).course.references[0].href, href);
    }
  });

  test('unknown root and nested fields reject instead of disappearing during schema parsing', () => {
    for (const change of [(v) => { v.unknown = 'keep for recovery'; }, (v) => { v.course.modules[0].lessons[0].blocks[0].unknown = 'keep for recovery'; }]) {
      const value = course(); change(value); const before = plain(value);
      assert.throws(() => validateCourseEdit(value), /unsupported fields/); assert.deepEqual(plain(value), before);
    }
  });

  test('2 MiB UTF8 resource boundary accepts exact size and rejects one extra byte', () => {
    const value = course(), size = new TextEncoder().encode(JSON.stringify(value)).byteLength;
    value.course.mission += 'x'.repeat(COURSE_AUTHORING_LIMITS.bytes - size);
    assert.doesNotThrow(() => validateCourseEdit(value));
    value.course.mission += 'x';
    assert.throws(() => validateCourseEdit(value), /2 MiB/);
    const unicode = course(); unicode.course.mission = '😀'.repeat(COURSE_AUTHORING_LIMITS.bytes / 4);
    assert.throws(() => validateCourseEdit(unicode), /2 MiB/);
  });

  for (const limit of ['modules', 'lessons', 'blocksPerLesson', 'blocks', 'options', 'glossary', 'references', 'listItems']) {
    test(`authoring ${limit} count cap rejects the whole edit`, () => {
      const value = course(), lesson = value.course.modules[0].lessons[0];
      if (limit === 'modules') value.course.modules = Array.from({ length: 33 }, createCourseModule);
      if (limit === 'lessons') value.course.modules[0].lessons = Array.from({ length: 257 }, createCourseLesson);
      if (limit === 'blocksPerLesson') { lesson.blocks = Array.from({ length: 257 }, () => createCourseBlock('prose')); lesson.practice = Array.from({ length: 256 }, () => createCourseBlock('prose')); }
      if (limit === 'blocks') value.course.modules[0].lessons = Array.from({ length: 17 }, () => ({ ...createCourseLesson(), blocks: Array.from({ length: 241 }, () => createCourseBlock('prose')) }));
      if (limit === 'options') lesson.practice[0].options = Array.from({ length: 33 }, (_, index) => 'Option ' + index);
      if (limit === 'glossary') value.course.glossary = Array.from({ length: 257 }, (_, index) => ({ id: 'glossary-' + index, term: 'Term', definition: 'Definition' }));
      if (limit === 'references') value.course.references = Array.from({ length: 257 }, (_, index) => ({ id: 'ref-' + index, title: 'Reference', href: 'https://example.com', note: '' }));
      if (limit === 'listItems') value.course.learningObjectives = Array.from({ length: 257 }, () => 'Objective');
      assert.throws(() => validateCourseEdit(value));
    });
  }

  test('cycles, deep nesting, sparse lists, non-JSON values and accessors reject without invoking getters', () => {
    const operations = [
      (v) => { v.extra = v; }, (v) => { let nested = {}; v.extra = nested; for (let i = 0; i < 20; i++) nested = nested.child = {}; },
      (v) => { v.extra = undefined; }, (v) => { v.extra = () => {}; }, (v) => { v.extra = new Date(); },
      (v) => { v.course.prerequisites = new Array(2); },
      (v) => { Object.defineProperty(v, 'extra', { enumerable: true, get() { throw new Error('Getter must not run'); } }); },
    ];
    for (const change of operations) { const value = course(); change(value); assert.throws(() => validateCourseEdit(value), (error) => !error.message.includes('Getter must not run')); }
  });
}
