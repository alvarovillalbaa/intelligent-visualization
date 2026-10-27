import { nanoid } from "nanoid"

import type {
  BrandProfile,
  DeckSource,
  SlideBlock,
  ThemeTokens,
} from "@/lib/types"
import { clamp } from "@/lib/utils"

export const themeLibrary: ThemeTokens[] = [
  {
    id: "editorial-sunrise",
    name: "Editorial Sunrise",
    mood: "Optimistic, polished, premium",
    displayFont: "\"Clash Display\", \"Geist\", sans-serif",
    bodyFont: "\"Nunito Sans\", \"Geist\", sans-serif",
    background: "#f8efe7",
    foreground: "#161513",
    accent: "#ff6f4d",
    accentSoft: "#ffe1d6",
    card: "#fff8f2",
    cardForeground: "#231f1c",
    border: "#e8c7b6",
    gradient: "linear-gradient(135deg, #fff8ef 0%, #f2ded0 45%, #e6f0ff 100%)",
  },
  {
    id: "cobalt-grid",
    name: "Cobalt Grid",
    mood: "Product launch, technical, precise",
    displayFont: "\"Sora\", \"Geist\", sans-serif",
    bodyFont: "\"Nunito Sans\", \"Geist\", sans-serif",
    background: "#09111f",
    foreground: "#f4f7fb",
    accent: "#7cd3ff",
    accentSoft: "#113558",
    card: "#0f1c31",
    cardForeground: "#edf7ff",
    border: "#1c3654",
    gradient: "linear-gradient(135deg, #07111d 0%, #0f1c31 35%, #1b4268 100%)",
  },
  {
    id: "forest-signal",
    name: "Forest Signal",
    mood: "Trustworthy, modern, data-forward",
    displayFont: "\"Instrument Serif\", \"Geist\", serif",
    bodyFont: "\"Nunito Sans\", \"Geist\", sans-serif",
    background: "#f2f6ef",
    foreground: "#102114",
    accent: "#3c8f5b",
    accentSoft: "#dceddf",
    card: "#f9fdf8",
    cardForeground: "#17301d",
    border: "#bfd5c5",
    gradient: "linear-gradient(135deg, #f7fbf3 0%, #dceddf 50%, #dfeaf7 100%)",
  },
]

const blockAccentPalette = ["#ff6f4d", "#7cd3ff", "#3c8f5b", "#a15cff", "#ffbf69"]

export function remixTheme(baseTheme: ThemeTokens, brand?: BrandProfile): ThemeTokens {
  const accentFromBrand = brand?.palette.find(Boolean)
  const accent = accentFromBrand ?? blockAccentPalette[Math.floor(Math.random() * blockAccentPalette.length)]
  const hue = clamp(accent.length * 7, 10, 300)
  return {
    ...baseTheme,
    id: `${baseTheme.id}-remix-${nanoid(4)}`,
    name: `${baseTheme.name} Remix`,
    accent,
    accentSoft: `${accent}22`,
    gradient: `linear-gradient(135deg, ${baseTheme.background} 0%, ${accent}28 42%, ${baseTheme.card} 100%)`,
    border: `color-mix(in srgb, ${accent} 28%, white)`,
    mood: `${baseTheme.mood}; remixed around ${brand?.companyName ?? "fresh"} tones`,
    foreground: hue > 180 ? baseTheme.foreground : baseTheme.foreground,
  }
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

function renderBlock(block: SlideBlock) {
  switch (block.kind) {
    case "paragraph":
      return `<p class="deck-paragraph">${escapeHtml(block.text)}</p>`
    case "bullets":
      return `<ul class="deck-bullets">${block.items
        .map((item) => `<li>${escapeHtml(item)}</li>`)
        .join("")}</ul>`
    case "stats":
      return `<div class="deck-stats">${block.items
        .map(
          (item) =>
            `<article class="deck-stat"><span>${escapeHtml(item.label)}</span><strong>${escapeHtml(
              item.value,
            )}</strong><small>${escapeHtml(item.detail)}</small></article>`,
        )
        .join("")}</div>`
    case "quote":
      return `<blockquote class="deck-quote"><p>"${escapeHtml(block.quote)}"</p><footer>${escapeHtml(
        block.byline,
      )}</footer></blockquote>`
    case "timeline":
      return `<div class="deck-timeline">${block.items
        .map(
          (item) =>
            `<article class="deck-timeline-item"><strong>${escapeHtml(
              item.label,
            )}</strong><p>${escapeHtml(item.detail)}</p></article>`,
        )
        .join("")}</div>`
    case "code":
      return `<pre class="deck-code"><code>${escapeHtml(block.code)}</code></pre>`
    case "callout":
      return `<div class="deck-callout"><span>${escapeHtml(block.label)}</span><strong>${escapeHtml(
        block.value,
      )}</strong></div>`
    default:
      return ""
  }
}

function renderLeadField(field: DeckSource["leadCapture"]["fields"][number]) {
  if (field.type === "textarea") {
    return `<label class="lead-field"><span>${escapeHtml(field.label)}</span><textarea name="${escapeHtml(field.key)}" placeholder="${escapeHtml(field.placeholder)}" ${field.required ? "required" : ""}></textarea></label>`
  }

  return `<label class="lead-field"><span>${escapeHtml(field.label)}</span><input type="${field.type === "email" ? "email" : "text"}" name="${escapeHtml(field.key)}" placeholder="${escapeHtml(field.placeholder)}" ${field.required ? "required" : ""} /></label>`
}

function previewDeckRuntime() {
  return `
      const state = { visitorId: "preview", seenSlides: new Set(), vote: null };
      const slides = Array.from(document.querySelectorAll(".slide"));
      if ("IntersectionObserver" in window) {
        const observer = new IntersectionObserver((entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) state.seenSlides.add(entry.target.getAttribute("data-slide"));
          }
        }, { threshold: 0.6 });
        slides.forEach((slide) => observer.observe(slide));
      }
      document.addEventListener("keydown", (event) => {
        if (event.target instanceof HTMLElement && event.target.closest("input, textarea, select, [contenteditable=true]")) return;
        const activeIndex = slides.findIndex((slide) => {
          const rect = slide.getBoundingClientRect();
          return rect.top >= -20 && rect.top < window.innerHeight / 2;
        });
        if (event.key === "ArrowDown" || event.key === "PageDown") {
          event.preventDefault();
          slides[Math.min(slides.length - 1, activeIndex + 1)]?.scrollIntoView({ behavior: "smooth" });
        }
        if (event.key === "ArrowUp" || event.key === "PageUp") {
          event.preventDefault();
          slides[Math.max(0, activeIndex - 1)]?.scrollIntoView({ behavior: "smooth" });
        }
      });
      const pollOptions = document.querySelectorAll(".poll-option");
      pollOptions.forEach((button) => {
        button.setAttribute("aria-pressed", "false");
        button.addEventListener("click", () => {
          state.vote = button.getAttribute("data-value");
          pollOptions.forEach((option) => option.setAttribute("aria-pressed", String(option === button)));
          const status = document.getElementById("poll-status");
          if (status) status.textContent = state.vote ? "Preview vote selected. Nothing was submitted." : "";
        });
      });
      const leadStatus = document.getElementById("lead-status");
      if (leadStatus) leadStatus.textContent = "Preview only. Leads are not submitted.";
      document.getElementById("lead-form")?.addEventListener("submit", (event) => {
        event.preventDefault();
        if (leadStatus) leadStatus.textContent = "Preview only. No lead was submitted.";
      });
    `
}

export function buildStandaloneDeckHtml(
  source: DeckSource,
  deckSlug: string,
  options?: {
    teamName?: string
    publicId?: string
    versionId?: string
    preview?: boolean
  },
) {
  const slides = source.slides
    .map(
      (slide, index) => `
      <section class="slide" data-slide="${escapeHtml(slide.id)}" data-slide-index="${index}">
        <div class="slide-topbar">
          <span class="kicker">${escapeHtml(slide.kicker)}</span>
          <span class="slide-progress">${index + 1}/${source.slides.length}</span>
        </div>
        <div class="slide-content">
          <div class="slide-main">
            <h2 class="section-title">${escapeHtml(slide.title)}</h2>
            <p class="subtitle">${escapeHtml(slide.summary)}</p>
            <div class="deck-blocks">
              ${slide.blocks.map(renderBlock).join("")}
            </div>
          </div>
          <aside class="slide-side">
            <div class="panel-card">
              <div class="card-label">Narrative</div>
              <div class="card-title">${escapeHtml(source.brand.companyName)}</div>
              <p class="card-body">${escapeHtml(source.narrative)}</p>
            </div>
            <div class="panel-card">
              <div class="card-label">Theme</div>
              <div class="color-row">
                ${[source.theme.accent, source.theme.background, source.theme.card, source.theme.border]
                  .map((color) => `<span class="color-chip" style="background:${escapeHtml(color)}"></span>`)
                  .join("")}
              </div>
              <p class="card-body">${escapeHtml(source.theme.mood)}</p>
            </div>
          </aside>
        </div>
        <footer class="slide-footer">
          <div class="footer-brand">
            <span class="footer-dot"></span>
            <span>${escapeHtml(options?.teamName ?? source.brand.companyName)}</span>
          </div>
          <span class="slide-number">${String(index + 1).padStart(2, "0")}</span>
        </footer>
      </section>`,
    )
    .join("")

  const leadSection = source.leadCapture.enabled
    ? `<form id="lead-form" class="lead-form">
        ${source.leadCapture.fields.map(renderLeadField).join("")}
        <button class="deck-button deck-button-secondary" type="submit">Submit lead</button>
        <p id="lead-status" class="inline-note"></p>
      </form>`
    : `<p class="inline-note">Lead capture disabled for this deck.</p>`

  const finalPanel = `
    <section class="slide final-slide" data-slide="final" data-slide-index="${source.slides.length - 1}">
      <div class="slide-topbar">
        <span class="kicker">Next step</span>
        <span class="slide-progress">${source.slides.length}/${source.slides.length}</span>
      </div>
      <div class="slide-content">
        <div class="slide-main">
          <h2 class="title">${escapeHtml(source.title)}</h2>
          <p class="subtitle">${escapeHtml(source.summary)}</p>
          <div class="action-grid">
            <section class="panel-card">
              <div class="card-label">CTA</div>
              <div class="card-title">${escapeHtml(source.cta.label)}</div>
              <p class="card-body">${escapeHtml(source.cta.helperText)}</p>
              <a id="cta-button" class="deck-button" href="${escapeHtml(source.cta.href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(source.cta.label)}</a>
            </section>
            <section class="panel-card">
              <div class="card-label">Poll</div>
              <div class="card-title">${escapeHtml(source.poll.question)}</div>
              <div class="poll-options">
                ${source.poll.options
                  .map((option) => `<button class="poll-option" type="button" data-value="${escapeHtml(option)}">${escapeHtml(option)}</button>`)
                  .join("")}
              </div>
              <p id="poll-status" class="inline-note"></p>
            </section>
          </div>
        </div>
        <aside class="slide-side">
          <section class="panel-card panel-card-wide">
            <div class="card-label">${escapeHtml(source.leadCapture.headline)}</div>
            <p class="card-body">${escapeHtml(source.leadCapture.description)}</p>
            ${leadSection}
          </section>
        </aside>
      </div>
      <footer class="slide-footer">
        <div class="footer-brand">
          <span class="footer-dot"></span>
          <span>${escapeHtml(options?.teamName ?? source.brand.companyName)}</span>
        </div>
        <span class="slide-number">END</span>
      </footer>
    </section>`

  const runtimeConfig = JSON.stringify({
    publicId: options?.publicId ?? "",
    versionId: options?.versionId ?? "",
    slideCount: source.slides.length,
  })

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(source.seoTitle)}</title>
    <meta name="description" content="${escapeHtml(source.seoDescription)}" />
    <style>
      :root {
        --background: ${source.theme.background};
        --foreground: ${source.theme.foreground};
        --accent: ${source.theme.accent};
        --accent-soft: ${source.theme.accentSoft};
        --card: ${source.theme.card};
        --card-foreground: ${source.theme.cardForeground};
        --border: ${source.theme.border};
        --gradient: ${source.theme.gradient};
        --font-display: ${source.theme.displayFont};
        --font-body: ${source.theme.bodyFont};
      }
      * { box-sizing: border-box; margin: 0; padding: 0; }
      html {
        scroll-snap-type: y mandatory;
        scroll-behavior: smooth;
      }
      body {
        min-height: 100vh;
        min-height: 100dvh;
        font-family: var(--font-body);
        background: var(--gradient);
        color: var(--foreground);
        overflow-x: hidden;
      }
      main {
        width: 100vw;
      }
      .slide {
        width: 100vw;
        height: 100vh;
        height: 100dvh;
        scroll-snap-align: start;
        padding: clamp(1.5rem, 4vw, 3.75rem);
        display: flex;
        flex-direction: column;
        gap: clamp(1rem, 2vw, 1.5rem);
        overflow: hidden;
      }
      .slide-topbar, .slide-footer {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 1rem;
        font-size: clamp(0.72rem, 1vw, 0.9rem);
        text-transform: uppercase;
        letter-spacing: 0.16em;
        color: color-mix(in srgb, var(--foreground) 62%, transparent);
      }
      .slide-content {
        flex: 1;
        display: grid;
        grid-template-columns: minmax(0, 1.2fr) minmax(280px, 0.8fr);
        gap: clamp(1rem, 2.5vw, 2rem);
        min-height: 0;
      }
      .slide-main, .slide-side {
        min-height: 0;
      }
      .slide-main {
        display: flex;
        flex-direction: column;
        gap: clamp(0.8rem, 1.5vw, 1.25rem);
      }
      .slide-side {
        display: flex;
        flex-direction: column;
        justify-content: center;
        gap: 1rem;
      }
      .panel-card {
        border: 1px solid var(--border);
        border-radius: 1.75rem;
        background: color-mix(in srgb, var(--card) 84%, transparent);
        backdrop-filter: blur(20px);
        padding: 1.25rem 1.35rem;
        box-shadow: 0 22px 70px rgba(15, 23, 42, 0.12);
      }
      .panel-card-wide {
        width: 100%;
      }
      .kicker {
        font-family: var(--font-display);
      }
      .title, .section-title {
        font-family: var(--font-display);
        line-height: 0.98;
        letter-spacing: -0.03em;
      }
      .title { font-size: clamp(2.2rem, 6vw, 5.5rem); }
      .section-title { font-size: clamp(1.9rem, 4.6vw, 4rem); }
      .subtitle, .deck-paragraph, .card-body {
        font-size: clamp(1rem, 1.6vw, 1.16rem);
        line-height: 1.6;
        color: color-mix(in srgb, var(--foreground) 80%, transparent);
      }
      .card-label {
        font-size: clamp(0.72rem, 1vw, 0.88rem);
        text-transform: uppercase;
        letter-spacing: 0.14em;
        color: color-mix(in srgb, var(--foreground) 60%, transparent);
        margin-bottom: 0.55rem;
      }
      .card-title {
        font-family: var(--font-display);
        font-size: clamp(1.1rem, 2vw, 1.6rem);
        margin-bottom: 0.45rem;
      }
      .deck-blocks {
        display: grid;
        gap: 0.95rem;
        overflow: hidden;
      }
      .deck-bullets {
        display: grid;
        gap: 0.7rem;
        list-style: none;
      }
      .deck-bullets li {
        position: relative;
        padding-left: 1rem;
        font-size: clamp(0.98rem, 1.45vw, 1.08rem);
        line-height: 1.5;
      }
      .deck-bullets li::before {
        content: "";
        position: absolute;
        left: 0;
        top: 0.6rem;
        width: 0.38rem;
        height: 0.38rem;
        border-radius: 999px;
        background: var(--accent);
      }
      .deck-stats {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        gap: 0.85rem;
      }
      .deck-stat, .deck-callout, .deck-timeline-item {
        border: 1px solid var(--border);
        border-radius: 1.25rem;
        padding: 1rem;
        background: color-mix(in srgb, var(--background) 74%, white);
      }
      .deck-stat strong, .deck-callout strong {
        display: block;
        font-size: clamp(1.5rem, 2.5vw, 2.3rem);
        margin: 0.4rem 0 0.2rem;
        font-family: var(--font-display);
      }
      .deck-quote {
        padding: 1.15rem 1.3rem;
        border-left: 4px solid var(--accent);
        background: var(--accent-soft);
        border-radius: 1.25rem;
      }
      .deck-code {
        padding: 1rem;
        border-radius: 1.25rem;
        overflow: auto;
        background: #09111f;
        color: #edf7ff;
      }
      .deck-timeline {
        display: grid;
        gap: 0.75rem;
      }
      .footer-brand {
        display: flex;
        align-items: center;
        gap: 0.55rem;
      }
      .footer-dot, .color-chip {
        width: 0.7rem;
        height: 0.7rem;
        border-radius: 999px;
      }
      .footer-dot {
        background: var(--accent);
      }
      .color-row, .poll-options, .action-grid {
        display: grid;
        gap: 0.75rem;
      }
      .color-row {
        grid-template-columns: repeat(4, 1fr);
        max-width: 8rem;
        margin-bottom: 0.6rem;
      }
      .action-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
      .lead-form {
        display: grid;
        gap: 0.75rem;
        margin-top: 1rem;
      }
      .lead-field {
        display: grid;
        gap: 0.35rem;
        font-size: 0.9rem;
      }
      .lead-field span {
        color: color-mix(in srgb, var(--foreground) 72%, transparent);
      }
      .lead-field input, .lead-field textarea, .poll-option {
        width: 100%;
        border-radius: 1rem;
        border: 1px solid var(--border);
        padding: 0.8rem 0.95rem;
        background: color-mix(in srgb, white 68%, var(--card));
        color: var(--foreground);
        font: inherit;
      }
      .lead-field textarea {
        min-height: 6rem;
        resize: vertical;
      }
      .poll-option {
        text-align: left;
        cursor: pointer;
      }
      .deck-button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border-radius: 999px;
        padding: 0.9rem 1.2rem;
        background: var(--foreground);
        color: var(--background);
        text-decoration: none;
        font-weight: 700;
        border: none;
        cursor: pointer;
      }
      .deck-button-secondary {
        background: var(--accent);
        color: white;
      }
      .inline-note {
        font-size: 0.9rem;
        color: color-mix(in srgb, var(--foreground) 65%, transparent);
      }
      @media (max-width: 960px) {
        .slide {
          overflow-y: auto;
        }
        .slide-content, .action-grid {
          grid-template-columns: 1fr;
        }
      }
    </style>
  </head>
  <body>
    <main data-deck="${escapeHtml(deckSlug)}">
      ${slides}
      ${finalPanel}
    </main>
    <script>${options?.preview ? previewDeckRuntime() : `
      const runtime = ${runtimeConfig};
      const visitorStorageKey = "slides_visitor_id";
      const startedAt = Date.now();
      const seenSlides = new Set();
      let completionSent = false;
      const visitorId = localStorage.getItem(visitorStorageKey) || crypto.randomUUID();
      localStorage.setItem(visitorStorageKey, visitorId);

      async function postJson(url, payload) {
        const response = await fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
          keepalive: true,
        });
        if (!response.ok) {
          throw new Error("Request failed");
        }
        return response;
      }

      function sendSessionEnd() {
        const payload = JSON.stringify({
          publicId: runtime.publicId,
          versionId: runtime.versionId,
          type: "session_end",
          visitorId,
          durationMs: Date.now() - startedAt,
        });
        if (navigator.sendBeacon) {
          navigator.sendBeacon("/api/events", new Blob([payload], { type: "application/json" }));
          return;
        }
        void postJson("/api/events", JSON.parse(payload)).catch(() => {});
      }

      void postJson("/api/events", {
        publicId: runtime.publicId,
        versionId: runtime.versionId,
        type: "view",
        visitorId,
      }).catch(() => {});

      const slides = Array.from(document.querySelectorAll(".slide"));
      const observer = new IntersectionObserver((entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) {
            continue;
          }
          const slideId = entry.target.getAttribute("data-slide");
          const slideIndex = Number(entry.target.getAttribute("data-slide-index") || "0");
          if (!slideId || seenSlides.has(slideId)) {
            continue;
          }
          seenSlides.add(slideId);
          void postJson("/api/events", {
            publicId: runtime.publicId,
            versionId: runtime.versionId,
            type: "slide_view",
            slideId,
            visitorId,
          }).catch(() => {});
          if (!completionSent && slideIndex >= runtime.slideCount - 1) {
            completionSent = true;
            void postJson("/api/events", {
              publicId: runtime.publicId,
              versionId: runtime.versionId,
              type: "deck_complete",
              visitorId,
            }).catch(() => {});
          }
        }
      }, { threshold: 0.6 });

      slides.forEach((slide) => observer.observe(slide));

      document.addEventListener("keydown", (event) => {
        const activeIndex = slides.findIndex((slide) => {
          const rect = slide.getBoundingClientRect();
          return rect.top >= -20 && rect.top < window.innerHeight / 2;
        });
        if (event.key === "ArrowDown" || event.key === "PageDown") {
          slides[Math.min(slides.length - 1, activeIndex + 1)]?.scrollIntoView({ behavior: "smooth" });
        }
        if (event.key === "ArrowUp" || event.key === "PageUp") {
          slides[Math.max(0, activeIndex - 1)]?.scrollIntoView({ behavior: "smooth" });
        }
      });

      document.getElementById("cta-button")?.addEventListener("click", () => {
        void postJson("/api/events", {
          publicId: runtime.publicId,
          versionId: runtime.versionId,
          type: "cta_click",
          visitorId,
        }).catch(() => {});
      });

      document.querySelectorAll(".poll-option").forEach((button) => {
        button.addEventListener("click", () => {
          const value = button.getAttribute("data-value");
          document.getElementById("poll-status").textContent = value ? "Vote recorded." : "";
          if (!value) {
            return;
          }
          void postJson("/api/events", {
            publicId: runtime.publicId,
            versionId: runtime.versionId,
            type: "poll_vote",
            visitorId,
            value,
          }).catch(() => {});
        });
      });

      document.getElementById("lead-form")?.addEventListener("submit", async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const payload = Object.fromEntries(new FormData(form).entries());
        const statusNode = document.getElementById("lead-status");
        statusNode.textContent = "Submitting...";
        try {
          await postJson("/api/leads", {
            publicId: runtime.publicId,
            versionId: runtime.versionId,
            payload,
          });
          statusNode.textContent = "Lead captured.";
        } catch {
          statusNode.textContent = "Unable to submit right now.";
        }
      });

      window.addEventListener("pagehide", sendSessionEnd);
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") {
          sendSessionEnd();
        }
      });
    `}</script>
  </body>
</html>`
}
