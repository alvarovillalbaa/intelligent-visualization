// T2: actual compiler over authored documents. No browser, endpoint, model,
// analytics/progress script, provider or database executes.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const repository = fileURLToPath(new URL('../../', import.meta.url));
const external = createRequire(path.join(process.env.IV_TEST_PROJECT_ROOT || repository, 'package.json'));
const ts = external('typescript');
const plain = (value) => JSON.parse(JSON.stringify(value));
function frozen(value) { if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.values(value).forEach(frozen); Object.freeze(value); } return value; }

export function authoredCourseDocument(starter) {
  const document = structuredClone(starter);
  document.title = 'Authored complete Course'; document.subtitle = 'Authored Course subtitle';
  document.summary = 'Authored overall summary.'; document.audience = 'Authored curious learners'; document.goal = 'Authored practical goal';
  document.seo = { title: 'Authored search-only title', description: 'Authored search-only description' };
  document.sourceManifest = [{ id: 'source-private-id', kind: 'paste', label: 'Authored source', contentHash: 'authored-source-hash', provenance: 'Authored source provenance.' }];
  document.assetIds = ['authored-asset-reference'];
  document.course = {
    mission: 'Authored teaching mission.', estimatedMinutes: 24,
    learnerProfile: { level: 'intermediate', assumedKnowledge: ['Authored assumed knowledge'], goals: ['Authored learner goal'], constraints: ['Authored learner constraint'] },
    learningObjectives: ['Authored learning objective'], prerequisites: ['Authored preparation requirement'],
    modules: [
      { id: 'module-a', title: 'Authored module A', objective: 'Authored module A objective.', lessons: [
        { id: 'lesson-a', title: 'Authored lesson A', objective: 'Authored lesson A objective.', estimatedMinutes: 8, prerequisiteIds: [],
          explanation: 'Authored explanation\n\nSecond explanatory paragraph.',
          blocks: [
            { id: 'heading-a', kind: 'heading', text: 'Authored section heading' },
            { id: 'prose-a', kind: 'prose', text: 'Authored prose\n\nSecond prose paragraph.' },
            { id: 'callout-a', kind: 'callout', title: 'Authored callout title', body: 'Authored callout body.' },
          ], practice: [
            { id: 'quiz-a', kind: 'multiple-choice-check', prompt: 'Authored choice question?', options: ['Authored first option', 'Authored correct option', 'Authored third option'], answerIndex: 1, explanation: 'Authored answer explanation.' },
            { id: 'recall-a', kind: 'free-recall-check', prompt: 'Authored recall question?', guidance: 'Authored recall guidance.' },
            { id: 'summary-a', kind: 'summary', items: ['Authored summary item one', 'Authored summary item two'] },
          ], feedback: 'Authored lesson A feedback.', summary: 'Authored lesson A summary.', references: ['reference-a', 'Unmatched authored citation <literal>'] },
        { id: 'lesson-b', title: 'Authored lesson B', objective: 'Authored lesson B objective.', estimatedMinutes: 6, prerequisiteIds: ['lesson-a'],
          explanation: 'Authored follow-up explanation.', blocks: [{ id: 'prose-b', kind: 'prose', text: 'Authored follow-up content.' }], practice: [],
          feedback: 'Authored lesson B feedback.', summary: 'Authored lesson B summary.', references: ['reference-b'] },
      ] },
      { id: 'module-b', title: 'Authored module B', objective: 'Authored module B objective.', lessons: [
        { id: 'lesson-c', title: 'Authored lesson C', objective: 'Authored lesson C objective.', estimatedMinutes: 10, prerequisiteIds: ['lesson-b'],
          explanation: 'Authored final explanation.', blocks: [{ id: 'prose-c', kind: 'prose', text: 'Authored final content.' }], practice: [],
          feedback: 'Authored lesson C feedback.', summary: 'Authored lesson C summary.', references: [] },
      ] },
    ],
    glossary: [{ id: 'term-a', term: 'Authored term', definition: 'Authored definition\nwith a second line.' }],
    references: [
      { id: 'reference-a', title: 'Authored HTTPS reference', href: 'https://example.com/evidence?x=1&y=2#detail', note: 'Authored HTTPS reference note.' },
      { id: 'reference-b', title: 'Authored HTTP reference', href: 'http://example.com/context', note: 'Authored HTTP reference note.' },
    ],
  };
  return document;
}

export function createCourseArtifactRuntime(courseOverride) {
  const modules = new Map(); let fixtureID = 0;
  const context = vm.createContext({ structuredClone, TextEncoder, URL,
    fetch() { throw new Error('Network is forbidden in Course artifact checks.'); } });
  function actual(relative) {
    const filename = path.resolve(repository, relative.endsWith('.ts') ? relative : relative + '.ts');
    assert.ok(filename.startsWith(repository + path.sep), 'Only repository modules may load.');
    if (courseOverride && filename === path.join(repository, 'lib/artifacts/course.ts')) return courseOverride;
    if (modules.has(filename)) return modules.get(filename).exports;
    const compiled = ts.transpileModule(readFileSync(filename, 'utf8'), { fileName: filename, reportDiagnostics: true,
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
    assert.equal(compiled.diagnostics.length, 0, filename + ' must parse without syntax diagnostics.');
    const record = { exports: {} }; modules.set(filename, record);
    function require(specifier) {
      if (specifier.startsWith('@/')) return actual(specifier.slice(2));
      if (specifier.startsWith('.')) return actual(path.relative(repository, path.resolve(path.dirname(filename), specifier)));
      if (specifier === 'node:crypto') return { createHash };
      if (specifier === 'uuid') return { v7: () => `course-authored-id-${++fixtureID}` };
      assert.equal(specifier, 'zod', 'Unexpected Course artifact dependency: ' + specifier);
      return external(process.env.IV_TEST_ZOD_ENTRY || specifier);
    }
    vm.runInContext('(function(exports,require,module){\n' + compiled.outputText + '\n})', context, { filename })(record.exports, require, record);
    return record.exports;
  }
  const { compileVisualizationArtifact } = actual('lib/artifacts/compiler');
  const fixtures = actual('packages/domain/fixtures'), serialization = actual('packages/domain/serialization');
  const compile = (document, overrides = {}) => compileVisualizationArtifact(document, { visualizationId: 'authored-course', versionId: 'authored-version', createdAt: '2026-10-29T00:00:00.000Z', preview: true, ...overrides });
  return { actual, fixtures, serialization, compile, course: () => authoredCourseDocument(fixtures.createStarterCourseDocument()) };
}

function main(html) { const result = html.match(/<main class="course">([\s\S]*?)<\/main>/); assert.ok(result); return result[1]; }
function css(html) { const result = html.match(/<style>([\s\S]*?)<\/style>/); assert.ok(result); return result[1]; }
function attrs(tag) { return Object.fromEntries([...tag.matchAll(/([\w:-]+)="([^"]*)"/g)].map((match) => [match[1], match[2]])); }
function starts(html, tag) { return [...html.matchAll(new RegExp('<' + tag + '\\b[^>]*>', 'g'))].map((match) => attrs(match[0])); }
function ordered(html, text) { let prior = -1; for (const value of text) { const index = html.indexOf(value, prior + 1); assert.ok(index > prior, value + ' must remain in authored order.'); prior = index; } }

export function registerCourseArtifactChecks(test) {
  test('Course artifact: deterministic v2 compilation binds document and HTML hashes', async () => {
    const rt = createCourseArtifactRuntime(), document = rt.course(), first = await rt.compile(document), second = await rt.compile(document);
    assert.deepEqual(plain(first), plain(second)); assert.equal(first.manifest.rendererVersion, 'visualization-course-html-v2');
    assert.equal(first.manifest.documentHash, rt.serialization.contentHash(document));
    assert.equal(first.manifest.artifactHash, rt.serialization.contentHash(first.html)); assert.equal(first.contentHash, first.manifest.artifactHash);
    assert.equal(first.manifest.createdAt, '2026-10-29T00:00:00.000Z');
  });
  test('Course artifact: frozen source asset theme and authored content remain unchanged', async () => {
    const rt = createCourseArtifactRuntime(), document = rt.course(), before = plain(document), result = await rt.compile(frozen(document));
    assert.deepEqual(plain(document), before); assert.deepEqual(plain(result.manifest.sourceHashes), ['authored-source-hash']);
    assert.deepEqual(plain(result.manifest.assetReferences), ['authored-asset-reference']); assert.deepEqual(plain(result.warnings), []);
    assert.equal(result.manifest.documentHash, rt.serialization.contentHash(before));
  });
  test('Course artifact: visible metadata and separate search metadata preserve authored values', async () => {
    const rt = createCourseArtifactRuntime(), { html } = await rt.compile(rt.course());
    for (const value of ['Authored complete Course', 'Authored Course subtitle', 'Authored overall summary.', 'Authored curious learners', 'Authored practical goal']) assert.ok(html.includes(value), value);
    assert.match(html, /<title>Authored search-only title<\/title>/); assert.match(html, /name="description" content="Authored search-only description"/);
    assert.doesNotMatch(main(html), /Authored search-only title|Authored search-only description/);
  });
  test('Course artifact: mission learner preparation objectives and supplied durations survive export', async () => {
    const rt = createCourseArtifactRuntime(), body = main((await rt.compile(rt.course())).html);
    for (const value of ['Authored teaching mission.', '2 modules · 3 lessons · about 24 minutes · intermediate', 'Authored learning objective', 'Authored preparation requirement', 'Authored assumed knowledge', 'Authored learner goal', 'Authored learner constraint', 'Authored module A objective.', 'Authored lesson A objective.', '8 min', '6 min', '10 min']) assert.ok(body.includes(value), value);
  });
  test('Course artifact: module lesson content and practice follow authored reading order', async () => {
    const rt = createCourseArtifactRuntime(), body = main((await rt.compile(rt.course())).html);
    ordered(body, ['Authored module A objective.', 'Authored lesson A objective.', 'Authored section heading', 'Authored prose', 'Authored callout title', 'Authored choice question?', 'Authored recall question?', 'Authored summary item one', 'Authored lesson A feedback.', 'Authored lesson B objective.', 'Authored module B objective.', 'Authored lesson C objective.']);
  });
  test('Course artifact: all six block kinds retain their complete authored content', async () => {
    const rt = createCourseArtifactRuntime(), body = main((await rt.compile(rt.course())).html);
    for (const value of ['Authored section heading', 'Authored prose\n\nSecond prose paragraph.', 'Authored callout title', 'Authored callout body.', 'Authored choice question?', 'Authored first option', 'Authored correct option', 'Authored third option', 'Authored answer explanation.', 'Authored recall question?', 'Authored recall guidance.', 'Authored summary item one', 'Authored summary item two']) assert.ok(body.includes(value), value);
    assert.equal(starts(body, 'input').filter((input) => input.type === 'radio').length, 3); assert.equal(starts(body, 'textarea').length, 1);
  });
  test('Course artifact: multiple-choice inputs share a safe group and preserve the actual answer index', async () => {
    const rt = createCourseArtifactRuntime(), body = main((await rt.compile(rt.course())).html), quiz = starts(body, 'fieldset').find((entry) => entry.class === 'quiz');
    assert.equal(quiz['data-answer'], '1'); assert.equal(quiz['data-block-id'], 'quiz-a');
    const inputs = starts(body, 'input').filter((entry) => entry.type === 'radio');
    assert.equal(new Set(inputs.map((entry) => entry.name)).size, 1); assert.match(inputs[0].name, /^course-node-\d+-answer$/);
    assert.deepEqual(inputs.map((entry) => entry.value), ['0', '1', '2']); assert.match(body, /class="feedback" hidden>Authored answer explanation\.<\/p>/);
  });
  test('Course artifact: free-recall labels and guidance name their actual response control', async () => {
    const rt = createCourseArtifactRuntime(), { html } = await rt.compile(rt.course()), body = main(html), textarea = starts(body, 'textarea')[0];
    assert.ok(starts(body, 'label').some((label) => label.for === textarea.id));
    assert.match(body, new RegExp('id="' + textarea['aria-describedby'] + '">Authored recall guidance\\.'));
    assert.match(css(html), /white-space:pre-wrap/); assert.match(css(html), /focus-visible/);
  });
  test('Course artifact: lesson feedback summaries and explicit practice regions remain visible', async () => {
    const rt = createCourseArtifactRuntime(), body = main((await rt.compile(rt.course())).html);
    assert.match(body, /<section class="practice" aria-label="Practice">/);
    for (const value of ['Authored lesson A feedback.', 'Authored lesson B feedback.', 'Authored lesson C feedback.', 'Authored lesson A summary.', 'Authored lesson B summary.', 'Authored lesson C summary.']) assert.ok(body.includes(value), value);
    assert.equal(starts(body, 'button').filter((entry) => entry.class === 'complete-lesson').length, 3);
  });
  test('Course artifact: prerequisites resolve to lesson titles and retain unavailable references as escaped text', async () => {
    const rt = createCourseArtifactRuntime(), document = rt.course(); document.course.modules[1].lessons[0].prerequisiteIds.push('<missing-prerequisite>&');
    const body = main((await rt.compile(document)).html), articleIDs = starts(body, 'article').map((entry) => entry.id);
    const links = [...body.matchAll(/<a href="#([^"]+)">([^<]+)<\/a>/g)];
    assert.ok(links.some((entry) => articleIDs.includes(entry[1]) && entry[2] === 'Authored lesson A'));
    assert.ok(links.some((entry) => articleIDs.includes(entry[1]) && entry[2] === 'Authored lesson B'));
    assert.match(body, /Unavailable prerequisite: &lt;missing-prerequisite&gt;&amp;/); assert.doesNotMatch(body, /<missing-prerequisite>/);
  });
  test('Course artifact: linked citations resolve internally while unmatched citations stay literal', async () => {
    const rt = createCourseArtifactRuntime(), body = main((await rt.compile(rt.course())).html);
    const referenceIDs = starts(body.slice(body.indexOf('class="course-references"')), 'li').map((entry) => entry.id);
    assert.ok([...body.matchAll(/<a href="#([^"]+)">Authored HTTPS reference<\/a>/g)].some((entry) => referenceIDs.includes(entry[1])));
    assert.match(body, /Unmatched authored citation &lt;literal&gt;/); assert.doesNotMatch(body, /<literal>/);
  });
  test('Course artifact: HTTP and HTTPS reference URLs preserve notes with safe external-link attributes', async () => {
    const rt = createCourseArtifactRuntime(), body = main((await rt.compile(rt.course())).html), links = starts(body, 'a').filter((entry) => /^https?:/.test(entry.href));
    assert.equal(links.length, 2); assert.ok(links.every((entry) => entry.target === '_blank' && entry.rel === 'noopener noreferrer'));
    assert.equal(links[0].href, 'https://example.com/evidence?x=1&amp;y=2#detail');
    assert.ok(body.includes('Authored HTTPS reference note.')); assert.ok(body.includes('Authored HTTP reference note.'));
  });
  test('Course artifact: unsafe reference schemes become inert readable entries', async () => {
    const rt = createCourseArtifactRuntime(), document = rt.course();
    document.course.references = ['javascript:alert(1)', 'data:text/html,authored', 'mailto:authored@example.com'].map((href, index) => ({ id: 'unsafe-' + index, title: 'Authored unavailable reference ' + index, href, note: 'Keep authored note ' + index }));
    const body = main((await rt.compile(document)).html);
    assert.equal(starts(body, 'a').filter((entry) => /^(?:javascript|data|mailto):/.test(entry.href)).length, 0);
    assert.equal((body.match(/Link unavailable\./g) || []).length, 3); assert.ok(body.includes('Keep authored note 2'));
  });
  test('Course artifact: glossary and empty optional collections do not manufacture content', async () => {
    const rt = createCourseArtifactRuntime(), document = rt.course(), body = main((await rt.compile(document)).html);
    assert.match(body, /<dt>Authored term<\/dt><dd>Authored definition\nwith a second line\.<\/dd>/);
    document.course.glossary = []; document.course.references = []; document.course.prerequisites = [];
    document.course.learnerProfile.assumedKnowledge = []; document.course.learnerProfile.goals = []; document.course.learnerProfile.constraints = [];
    for (const module of document.course.modules) for (const lesson of module.lessons) lesson.references = [];
    const empty = main((await rt.compile(document)).html);
    assert.doesNotMatch(empty, /class="course-glossary"|class="course-references"|class="course-preparation"|Authored term|Link unavailable/);
  });
  test('Course artifact: hostile authored IDs cannot become DOM IDs radio names or broken links', async () => {
    const rt = createCourseArtifactRuntime(), document = rt.course(), hostile = '"><script>authoredID()</script><x id="';
    const first = document.course.modules[0].lessons[0]; first.id = hostile; first.practice[0].id = hostile + '-quiz';
    document.course.modules[0].id = hostile + '-module'; document.course.modules[0].lessons[1].prerequisiteIds = [hostile];
    document.course.references[0].id = hostile + '-reference'; first.references = [hostile + '-reference'];
    const { html } = await rt.compile(document), ids = [...html.matchAll(/\sid="([^"]*)"/g)].map((entry) => entry[1]);
    assert.equal(new Set(ids).size, ids.length); assert.ok(ids.every((id) => /^[a-z0-9-]+$/.test(id)));
    for (const link of starts(main(html), 'a').filter((entry) => entry.href.startsWith('#'))) assert.ok(ids.includes(link.href.slice(1)));
    assert.ok(starts(main(html), 'input').every((input) => /^course-node-\d+-answer$/.test(input.name)));
    assert.doesNotMatch(html, /<script>authoredID|<x id=/); assert.ok(html.includes('&lt;script&gt;authoredID()&lt;/script&gt;'));
  });
  test('Course artifact: hostile metadata lesson prose citations and notes remain escaped text', async () => {
    const rt = createCourseArtifactRuntime(), document = rt.course(), hostile = '<img src=x onerror=authored()> & context';
    document.subtitle = hostile; document.course.mission = hostile; document.course.modules[0].objective = hostile;
    const lesson = document.course.modules[0].lessons[0]; lesson.explanation = hostile; lesson.feedback = hostile; lesson.references = [hostile]; document.course.references[0].note = hostile;
    const { html } = await rt.compile(document);
    assert.ok(html.includes('&lt;img src=x onerror=authored()&gt; &amp; context')); assert.doesNotMatch(html, /<img src=x|<script>authored/);
  });
  test('Course artifact: theme text cannot close CSS and responsive print reduced-motion rules remain', async () => {
    const rt = createCourseArtifactRuntime(), document = rt.course(); document.theme.bodyFont = '</style><script>authoredTheme()</script>';
    const { html } = await rt.compile(document), style = css(html);
    assert.equal((html.match(/<style>/g) || []).length, 1); assert.equal((html.match(/<\/style>/g) || []).length, 1);
    assert.doesNotMatch(html, /<script>authoredTheme/); assert.match(style, /\\3c\s*\/style>/);
    for (const text of ['@media print', '@media(max-width:720px)', '@media(prefers-reduced-motion:reduce)', 'overflow-wrap:anywhere']) assert.ok(style.includes(text), text);
  });
  test('Course artifact: preview includes only in-memory learner interactions and no persistent or network runtime', async () => {
    const rt = createCourseArtifactRuntime(), result = await rt.compile(rt.course());
    assert.match(result.html, /const completed=new Set/); assert.match(result.html, /aria-pressed/); assert.match(result.html, /Correct\. /);
    assert.doesNotMatch(result.html, /sendBeacon|\/api\/events|localStorage|sessionStorage|indexedDB|XMLHttpRequest|fetch\(/);
    assert.ok(result.manifest.runtimeFeatures.includes('in-memory-course-progress')); assert.ok(result.manifest.runtimeFeatures.includes('no-analytics'));
    assert.doesNotMatch(result.html, /<script\b[^>]*\bsrc=|https:\/\/cdn|_next\//);
  });
  test('Course artifact: published runtime selection remains explicit and uses authored data identities', async () => {
    const rt = createCourseArtifactRuntime(), result = await rt.compile(rt.course(), { preview: false });
    assert.match(result.html, /sendBeacon/); assert.match(result.html, /localStorage\.setItem/);
    assert.match(result.html, /nodeId:quiz\.getAttribute\('data-block-id'\)/); assert.doesNotMatch(result.html, /nodeId:quiz\.id/);
    assert.ok(result.manifest.runtimeFeatures.includes('analytics-beacon')); assert.ok(result.manifest.runtimeFeatures.includes('local-course-progress'));
    assert.equal(result.manifest.rendererVersion, 'visualization-course-html-v2');
  });
  test('Course artifact: Report and Slides bytes are independent of Course rendering CSS and runtime', async () => {
    const normal = createCourseArtifactRuntime(), isolated = createCourseArtifactRuntime({ COURSE_ARTIFACT_CSS: 'authored-course-sentinel', renderCourse() { throw new Error('Course renderer must not run for another format.'); }, courseRuntimeScript() { throw new Error('Course runtime must not run for another format.'); } });
    for (const [kind, factory] of [['report', normal.fixtures.createStarterReportDocument], ['slides', normal.fixtures.createStarterSlidesDocument]]) {
      const document = factory();
      for (const preview of [false, true]) {
        const expected = await normal.compile(document, { preview }), actual = await isolated.compile(document, { preview });
        assert.equal(actual.html, expected.html); assert.deepEqual(plain(actual.manifest), plain(expected.manifest));
        assert.equal(actual.manifest.rendererVersion, kind === 'report' ? 'visualization-report-html-v2' : 'visualization-html-v1');
        assert.doesNotMatch(actual.html, /authored-course-sentinel/);
      }
    }
  });
}
