import type { CourseBlock, CourseVisualizationDocument } from "@/packages/domain/entities"

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;")
}

function referenceUrl(value: string): string | null {
  try {
    const url = new URL(value)
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null
  } catch { return null }
}

function list(title: string, items: string[], level: 3 | 4 = 3): string {
  if (!items.length) return ""
  return `<section class="course-list"><h${level}>${escapeHtml(title)}</h${level}><ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></section>`
}

function renderBlock(block: CourseBlock, anchor: string): string {
  switch (block.kind) {
    case "heading":
      return `<h4 id="${anchor}">${escapeHtml(block.text)}</h4>`
    case "prose":
      return `<p id="${anchor}">${escapeHtml(block.text)}</p>`
    case "callout":
      return `<aside class="callout" id="${anchor}"><strong>${escapeHtml(block.title)}</strong><p>${escapeHtml(block.body)}</p></aside>`
    case "multiple-choice-check":
      return `<fieldset class="quiz" id="${anchor}" data-block-id="${escapeHtml(block.id)}" data-answer="${block.answerIndex}"><legend>${escapeHtml(block.prompt)}</legend>${block.options.map((option, index) => `<label><input type="radio" name="${anchor}-answer" value="${index}" /> <span>${escapeHtml(option)}</span></label>`).join("")}<p class="feedback" hidden>${escapeHtml(block.explanation)}</p></fieldset>`
    case "free-recall-check":
      return `<section class="recall" id="${anchor}"><label for="${anchor}-response">${escapeHtml(block.prompt)}</label><textarea id="${anchor}-response" aria-describedby="${anchor}-guidance"></textarea><p id="${anchor}-guidance">${escapeHtml(block.guidance)}</p></section>`
    case "summary":
      return `<ul class="summary" id="${anchor}">${block.items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`
  }
}

export function renderCourse(document: CourseVisualizationDocument): string {
  const { course } = document
  // HTML identity is separate from authored record IDs, which may contain any
  // text. Allocation is deterministic for the same document and collision-free.
  let nextAnchor = 0
  const allocate = () => `course-node-${++nextAnchor}`
  const lessonsById = new Map<string, { title: string; anchor: string }>()
  const modules = course.modules.map((module) => ({
    module,
    anchor: allocate(),
    lessons: module.lessons.map((lesson) => {
      const anchor = allocate()
      if (!lessonsById.has(lesson.id)) lessonsById.set(lesson.id, { title: lesson.title, anchor })
      return {
        lesson,
        anchor,
        blocks: lesson.blocks.map((block) => ({ block, anchor: allocate() })),
        practice: lesson.practice.map((block) => ({ block, anchor: allocate() })),
      }
    }),
  }))
  const glossary = course.glossary.map((entry) => ({ entry, anchor: allocate() }))
  const references = course.references.map((reference) => ({ reference, anchor: allocate() }))
  const referencesById = new Map<string, typeof references[number]>()
  for (const reference of references) {
    if (!referencesById.has(reference.reference.id)) referencesById.set(reference.reference.id, reference)
  }
  const lessonCount = modules.reduce((total, module) => total + module.lessons.length, 0)
  const overview = `<section class="course-overview" aria-labelledby="course-overview-title"><h2 id="course-overview-title">Course overview</h2><p><strong>For:</strong> ${escapeHtml(document.audience)}</p><p><strong>Goal:</strong> ${escapeHtml(document.goal)}</p><p>${modules.length} modules · ${lessonCount} lessons · about ${course.estimatedMinutes} minutes · ${escapeHtml(course.learnerProfile.level)}</p><p class="course-mission">${escapeHtml(course.mission)}</p>${list("Learning objectives", course.learningObjectives)}</section>`
  const preparation = list("Prerequisites", course.prerequisites)
    + list("Assumed knowledge", course.learnerProfile.assumedKnowledge)
    + list("Learner goals", course.learnerProfile.goals)
    + list("Learning constraints", course.learnerProfile.constraints)
  const preparationSection = preparation ? `<section class="course-preparation" aria-labelledby="course-preparation-title"><h2 id="course-preparation-title">Before you start</h2>${preparation}</section>` : ""
  const toc = modules.map(({ module, anchor }) => `<li><a href="#${anchor}">${escapeHtml(module.title)}</a></li>`).join("")
  const content = modules.map(({ module, anchor, lessons }, moduleIndex) => {
    const lessonContent = lessons.map(({ lesson, anchor: lessonAnchor, blocks, practice }) => {
      const prerequisites = lesson.prerequisiteIds.length
        ? `<section class="course-list"><h4>Before this lesson</h4><ul>${lesson.prerequisiteIds.map((id) => {
          const prerequisite = lessonsById.get(id)
          return prerequisite ? `<li><a href="#${prerequisite.anchor}">${escapeHtml(prerequisite.title)}</a></li>` : `<li>Unavailable prerequisite: ${escapeHtml(id)}</li>`
        }).join("")}</ul></section>`
        : ""
      const citations = lesson.references.length
        ? `<section class="course-list"><h4>Lesson references</h4><ul>${lesson.references.map((citation) => {
          const reference = referencesById.get(citation)
          return reference ? `<li><a href="#${reference.anchor}">${escapeHtml(reference.reference.title)}</a></li>` : `<li>${escapeHtml(citation)}</li>`
        }).join("")}</ul></section>`
        : ""
      const practiceContent = practice.length ? `<section class="practice" aria-label="Practice"><h4>Practice</h4>${practice.map(({ block, anchor: blockAnchor }) => renderBlock(block, blockAnchor)).join("")}</section>` : ""
      const feedback = lesson.feedback ? `<section class="lesson-feedback"><h4>Feedback</h4><p>${escapeHtml(lesson.feedback)}</p></section>` : ""
      const summary = lesson.summary ? `<p class="lesson-summary">${escapeHtml(lesson.summary)}</p>` : ""
      return `<article class="lesson" id="${lessonAnchor}"><header class="lesson-header"><h3>${escapeHtml(lesson.title)}</h3><p>${lesson.estimatedMinutes} min</p></header><p class="lesson-objective">${escapeHtml(lesson.objective)}</p>${prerequisites}<p>${escapeHtml(lesson.explanation)}</p>${blocks.map(({ block, anchor: blockAnchor }) => renderBlock(block, blockAnchor)).join("")}${practiceContent}${feedback}${summary}${citations}<button class="complete-lesson" type="button" data-lesson-id="${escapeHtml(lesson.id)}">Mark complete</button></article>`
    }).join("")
    return `<section class="module" id="${anchor}"><p class="course-module-number">Module ${moduleIndex + 1}</p><h2>${escapeHtml(module.title)}</h2><p>${escapeHtml(module.objective)}</p>${lessonContent}</section>`
  }).join("")
  const glossaryContent = glossary.length ? `<section class="course-glossary" aria-labelledby="course-glossary-title"><h2 id="course-glossary-title">Glossary</h2><dl>${glossary.map(({ entry, anchor }) => `<div id="${anchor}"><dt>${escapeHtml(entry.term)}</dt><dd>${escapeHtml(entry.definition)}</dd></div>`).join("")}</dl></section>` : ""
  const referenceContent = references.length ? `<section class="course-references" aria-labelledby="course-references-title"><h2 id="course-references-title">References</h2><ul>${references.map(({ reference, anchor }) => {
    const href = referenceUrl(reference.href)
    const title = href ? `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(reference.title)}</a>` : `<span>${escapeHtml(reference.title)}</span><span class="course-link-unavailable"> (Link unavailable.)</span>`
    return `<li id="${anchor}">${title}${reference.note ? `<p>${escapeHtml(reference.note)}</p>` : ""}</li>`
  }).join("")}</ul></section>` : ""
  return `<nav class="toc" aria-label="Course modules"><ol>${toc}</ol></nav><main class="course">${overview}${preparationSection}${content}${glossaryContent}${referenceContent}</main>`
}

export const COURSE_ARTIFACT_CSS = `.course{max-width:900px;overflow-wrap:anywhere}.course p,.course li,.course dt,.course dd,.course legend,.course label{white-space:pre-wrap}.course h2,.course h3,.course h4{line-height:1.25}.course-overview,.course-preparation,.course-glossary,.course-references{padding:1.5rem 0;border-bottom:1px solid var(--border)}.course-overview>p,.course-preparation p{margin:.75rem 0}.course-list{margin:1.25rem 0}.course-list h3,.course-list h4{font-size:1rem;margin:0 0 .5rem}.course-list ul,.course-references ul{padding-inline-start:1.5rem}.course li+li{margin-top:.5rem}.course .lesson{margin:1.5rem 0;padding:1.5rem;border:1px solid var(--border);border-radius:8px}.lesson-header{display:flex;flex-wrap:wrap;align-items:baseline;justify-content:space-between;gap:.5rem 1rem}.lesson-header h3,.lesson-header p{margin:0}.lesson-objective,.lesson-summary{opacity:.8}.course-module-number{font-size:.8rem;text-transform:uppercase;letter-spacing:.1em}.course .quiz,.course .recall,.course .practice{min-width:0;margin:1.5rem 0;padding:1rem;border:1px solid var(--border);border-radius:8px}.course .quiz label{display:flex;align-items:baseline;gap:.5rem;padding:.5rem 0}.course .quiz input{flex:none}.course .recall label{display:block;font-weight:600}.course textarea{display:block;box-sizing:border-box;width:100%;min-height:7rem;margin-top:.75rem;padding:.75rem;font:inherit;background:var(--bg);color:var(--fg);border:1px solid var(--border);border-radius:4px}.course .lesson-feedback{margin:1rem 0}.course .lesson-feedback h4{margin-bottom:.5rem}.course .course-glossary dl{display:grid;gap:1rem}.course .course-glossary dt{font-weight:600}.course .course-glossary dd{margin:.25rem 0 0}.course a:focus-visible,.toc a:focus-visible,.course button:focus-visible,.course input:focus-visible,.course textarea:focus-visible{outline:2px solid var(--accent);outline-offset:3px}.course button{min-height:44px;padding:.5rem .75rem;font:inherit;cursor:pointer}.course [id]{scroll-margin-top:5rem}@media(max-width:720px){.course .lesson{padding:1rem}.toc{padding:.75rem 1rem}}@media print{.toc{position:static}.course{max-width:none;padding:0}.course .lesson{break-inside:auto}.course textarea{min-height:5rem}.complete-lesson{display:none}.floating-cta{position:static}}`

export function courseRuntimeScript(preview = false): string {
  if (preview) {
    return `<script>(()=>{const completed=new Set();document.querySelectorAll('.complete-lesson').forEach((button)=>{button.setAttribute('aria-pressed','false');button.addEventListener('click',()=>{const id=button.getAttribute('data-lesson-id');if(id&&!completed.has(id)){completed.add(id);button.textContent='Completed';button.setAttribute('aria-pressed','true')}})});document.querySelectorAll('.quiz').forEach((quiz)=>{const feedback=quiz.querySelector('.feedback');const explanation=feedback?feedback.textContent:'';quiz.addEventListener('change',()=>{const selected=quiz.querySelector('input:checked');if(feedback&&selected){feedback.hidden=false;feedback.setAttribute('role','status');feedback.textContent=(selected.value===quiz.getAttribute('data-answer')?'Correct. ':'Try again. ')+explanation}})})})();</script>`
  }
  return `<script>(()=>{const post=(type,payload={})=>{try{navigator.sendBeacon&&navigator.sendBeacon('/api/events',new Blob([JSON.stringify({type,publicId:document.body.dataset.publicId||'',...payload})],{type:'application/json'}))}catch{}};post('view');document.querySelectorAll('.complete-lesson').forEach((button)=>button.addEventListener('click',()=>{const id=button.getAttribute('data-lesson-id');if(id){localStorage.setItem('iv:lesson:'+id,'complete');post('course_lesson_complete',{nodeId:id,nodeKind:'course-lesson'})}}));document.querySelectorAll('.quiz').forEach((quiz)=>quiz.addEventListener('change',()=>{const feedback=quiz.querySelector('.feedback');if(feedback)feedback.hidden=false;post('course_quiz_answer',{nodeId:quiz.getAttribute('data-block-id'),nodeKind:'course-block'})}))})();</script>`
}
