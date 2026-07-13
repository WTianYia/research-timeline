# Node Hit Target and Drag Threshold Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make paper-node clicks stable near their edges while preserving deliberate omnidirectional canvas dragging.

**Architecture:** Put geometry decisions in `timeline-core.js` as pure tested helpers. Render a transparent SVG hit circle inside each paper group, and promote a pending canvas pointer gesture to dragging only after the helper reports that the movement threshold was crossed.

**Tech Stack:** Vanilla JavaScript ES modules, SVG, CSS, Node test runner, desktop Chrome.

---

### Task 1: Geometry regression tests

**Files:**
- Modify: `tests/timeline-core.test.js`
- Modify: `js/timeline-core.js`

- [ ] Import `paperNodeHitRadius` and `exceedsDragThreshold` in the core test.
- [ ] Assert a small visible node receives at least a 14px hit radius and a larger node keeps sufficient padding.
- [ ] Assert 4px pointer jitter does not start a drag while 5px movement does.
- [ ] Run `node --test tests/timeline-core.test.js` and confirm the new imports fail before implementation.
- [ ] Implement the two pure helpers with finite-number guards.
- [ ] Run the core test and confirm it passes.

### Task 2: SVG hit target and delayed dragging

**Files:**
- Modify: `js/timeline.js`
- Modify: `css/style.css`
- Modify: `index.html`

- [ ] Insert a transparent `.node-hit-target` circle before node halos using the tested hit radius.
- [ ] Keep the timeline cursor neutral until a pending empty-canvas gesture crosses 5px.
- [ ] On promotion, capture the pointer, add the dragging class, and preserve existing horizontal and vertical drag calculations.
- [ ] On pointer release or cancellation, clear the pending gesture and dragging class.
- [ ] Bump the CSS and JS cache query versions.

### Task 3: Verification

**Files:**
- Modify: `design-qa.md`
- Create: `docs/qa-node-hit-target.png`

- [ ] In desktop Chrome, click a point inside the invisible hit ring but outside the visible node and confirm details open without viewport movement.
- [ ] Confirm a sub-threshold blank gesture does not move the viewport.
- [ ] Confirm a larger blank diagonal gesture still moves both axes.
- [ ] Run `npm test`, `npm run check`, and `git diff --check`.
- [ ] Record the observed values and screenshot in `design-qa.md` without committing or deploying.
