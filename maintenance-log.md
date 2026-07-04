# Maintenance log

## 2026-07-04 — M1: Universal-subject engine

**What changed**
- **Subject taxonomy** ([src/subjects.js](src/subjects.js)): 12 domains (Mathematics,
  Natural Sciences, CS, Languages, Humanities, Social Sciences, Business, Health,
  Engineering, Arts & Music, Test Prep, Life Skills) + a General fallback. Each domain
  carries an icon, accent color, subject list, classification keywords (word-boundary
  matched so "sat/act/ap/ib" don't fire inside words), concept-extraction hints, and
  teaching/practice guidance. `classifySubject()` infers a domain from a free-text
  subject name; projects store `domainId` (inferred on create/normalize, overridable).
- **Math rendering (KaTeX)**: the markdown renderer now parses `$$…$$`, `\[…\]`,
  `\(…\)`, and money-safe `$…$` ([src/math.js](src/math.js)) and renders through a
  lazy-loaded KaTeX chunk (260KB that only loads when math first appears) with
  MathML output for screen readers. The tutor prompt now instructs LaTeX for all
  mathematical/chemical notation.
- **Domain-aware teaching**: `buildSystemPrompt` injects the domain's representation
  guidance (worked LaTeX steps for math, conjugation tables for languages, timelines
  + sources for history, vignettes for medicine, …); the practice generator and
  flashcard prompts shape questions per domain (e.g. language decks put the
  target-language item on Q).
- **Coding bias removed**: concept extraction now works for any subject (domain hints
  from the taxonomy + asked-about phrases like "what is the subjunctive mood" +
  mid-sentence proper phrases like "French Revolution"), the skill tree groups by
  mastery level instead of CS keywords, note tags cover formulas/definitions/vocab/
  dates, the Brain's seed concepts come from the project's domain, community
  challenges span 8 domains, misconception detection gained physics/psych/biology
  classics, and code-flavored placeholders/copy were generalized.
- **UI**: domain picker in the project modal (live accent + toast), domain badge on
  the chat welcome, domain-accented project dots + tooltips in the sidebar.

**What I tested**
- Created the plan's five subjects in the browser — Organic Chemistry → Natural
  Sciences, AP US History → Test Prep, Spanish B2 → Languages, Music Theory → Arts,
  MCAT → Test Prep — each with its domain accent; overrode Spanish B2's domain via
  the picker and back.
- Asked chat for the quadratic formula: model answered in LaTeX; 17 formulas rendered
  (5 display + 12 inline), all with MathML, zero raw `$` outside math, clean at 375px
  with no horizontal overflow. Zero console errors.
- `npm test` 43/43 (adds 7 taxonomy + 11 math-parsing + 5 universal-extraction tests);
  `npm run build` clean; KaTeX properly code-split.

**Deferred**
- Domain clustering inside the Brain graph is M2. Per-domain badge tracks are M10.

## 2026-07-04 — M0: Stabilize & full audit

**What changed**
- **Mobile responsive baseline**: the left nav rail becomes a fixed bottom nav ≤820px
  (all 8 destinations, safe-area padding); the chat sidebar becomes an overlay drawer
  with backdrop, close button, Escape, and a focus trap. Brain, Code lab, and Settings
  now stack properly on phones (Settings body used to render 1px wide — the layout was
  `flex` while its column rules assumed `grid`).
- **Accessibility pass**: real `<nav>`/`<button>` semantics + `aria-current` in the rail
  (was clickable divs), skip-to-content link, labeled inputs everywhere, `role="dialog"`
  + focus traps + Escape on the project library / onboarding / command palette /
  drawer, `role="alertdialog"` confirm dialog, aria-live regions for toasts + streaming
  ("Peer is responding"), visible `:focus-visible` rings that survive the skin,
  hover-only chat-row actions now show on focus and on touch, reduced-motion blanket
  for all skin animations, and the Brain's decorative star/haze motion pauses under
  `prefers-reduced-motion`.
- **Bug fixes**: StreamingMessage's 24ms reveal interval never stopped after streaming
  (one leaked interval per answered message); the flashcards Space/arrow key handler
  hijacked typing in inputs and dialogs; the window resize listener force-reset the
  sidebar on every resize; Escape while renaming a chat committed instead of
  cancelling; chat auto-scroll used `scrollIntoView`, which also scrolled the
  overflow-hidden `.main` and shifted the whole layout up; LanguagePicker never closed
  on outside click/Escape; Vite HMR websocket errors on non-default ports (HMR now
  binds to the dev http server).
- **Destructive-action confirms**: delete chat / project / note / deck and "reset local
  data" now go through an accessible confirm dialog.
- **Light theme actually works in-app** now (the skin hard-coded dark surfaces over the
  `.theme-light` variables). Brain + Code lab intentionally keep dark canvases.
- **Command palette**: ArrowUp/Down + Enter navigation.
- New files: `src/a11y.js` (useMediaQuery, useFocusTrap), `src/peer-responsive.css`
  (rail/bottom-nav, drawer, mobile brain/code-lab, focus, reduced motion, light theme).

**What I tested**
- 375×812 (phone): landing, onboarding, chat (send → real streamed AI answer), drawer,
  Brain (filters wrap, 3D map renders), Code lab (stacked editor/terminal/tutor),
  Notes, Cards, Rooms, Settings (tabs horizontal), project library modal, confirm
  dialog. 1280×800 (desktop): chat, Brain full-bleed, Settings grid 190/760, light +
  dark themes. Command palette open/arrow/Escape/focus-restore; Escape closes project
  modal; drawer closes when the project modal opens; modal z-order above bottom nav.
- Zero browser console errors/warnings after the HMR fix.
- `npm test` 20/20 green; `npm run build` clean.

**Known follow-ups** (deliberately deferred)
- Bundle is one 1.35MB chunk — lazy-load Three.js/pdf.js in a perf pass (M2 targets the
  Brain; the perf budget applies from M1 on).
- Brain desktop layout untouched (full M2 workstream, incl. non-3D equivalent view).
- Keyboard-only + real screen-reader deep pass is M12; M0 covered semantics, traps,
  live regions, and smoke-level keyboard flows.
