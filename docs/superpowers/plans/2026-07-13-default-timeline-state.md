# Default Timeline State Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align the initial 2026 year line to the floating canvas toolbar and start with no paper detail open.

**Architecture:** Add a pure viewport-alignment helper to `timeline-core.js`, then use measured canvas and toolbar geometry during initialization and reset. Keep the detail panel closed in the initial HTML and remove automatic paper selection.

**Tech Stack:** Static HTML, ES modules, Node built-in tests, Chrome visual QA.

---

### Task 1: Define the default viewport behavior

**Files:**
- Modify: `tests/timeline-core.test.js`
- Modify: `js/timeline-core.js`

- [ ] Add a failing test proving the target year maps to the requested toolbar-left pixel while preserving the year span.
- [ ] Export `alignViewportToPixel` and implement the inverse linear mapping.
- [ ] Run `npm test` and confirm the helper test passes.

### Task 2: Close detail and align the initial render

**Files:**
- Modify: `index.html`
- Modify: `js/timeline.js`
- Test: `tests/timeline-core.test.js`

- [ ] Add a failing static-state test requiring `workspace detail-closed` in the initial HTML.
- [ ] Remove initial representative-paper selection.
- [ ] Measure `.timeline-scroll` and `.canvas-tools`, then apply the aligned view during initialization and reset.
- [ ] Bump the module resource version and run all tests.

### Task 3: Match the screenshot state in Chrome

**Files:**
- Modify: `design-qa.md`

- [ ] Open the local page in the user's Chrome at the reference viewport.
- [ ] Measure the 2026 line and toolbar-left edge, requiring at most 2px difference.
- [ ] Confirm no selected node, no title card, and a closed detail panel at startup.
- [ ] Verify node selection still opens and closes detail.
- [ ] Run `npm test`, `npm run check`, and `git diff --check` without committing or deploying.

