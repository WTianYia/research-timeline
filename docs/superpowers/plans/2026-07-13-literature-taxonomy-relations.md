# Literature Taxonomy and Relations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reclassify all 86 papers by primary contribution and rebuild the timeline edges from evidence-backed research families.

**Architecture:** Keep `papers.csv` as the single runtime source. Add dataset-level invariants to the existing Node test suite so invalid years, categories, parents, and known false edges cannot return. Document the evidence and changed chains in a local audit report.

**Tech Stack:** Static HTML/CSS/ES modules, CSV/JSON data, Node built-in test runner, Chrome extension validation.

---

### Task 1: Add dataset integrity regression tests

**Files:**
- Modify: `tests/timeline-core.test.js`

- [ ] Add a test asserting ID uniqueness, accepted directions/types, existing parents, no self-links, no duplicate links, and parent year not later than child year.
- [ ] Add assertions for the corrected placements of A20, A31, A33, A37, A62, A82, A86 and A87.
- [ ] Add assertions that the known false or reversed edges are absent and that the core research-family chains are present.
- [ ] Run `npm test` and verify the new tests fail against the current dataset.

### Task 2: Reclassify papers and rebuild relationships

**Files:**
- Modify: `data/papers.csv`
- Modify: `data/directions.json`

- [ ] Assign every paper to the lane representing its primary contribution.
- [ ] Normalize each paper type using the four approved definitions.
- [ ] Replace speculative `parent_id` values with the approved sparse relation graph.
- [ ] Update the cross-computing lane description so numerical PDE and numerical linear algebra placements are explicit.
- [ ] Run `npm test` and verify the dataset tests pass.

### Task 3: Record evidence and verify the rendered graph

**Files:**
- Create: `docs/literature-data-audit-2026-07-13.md`
- Modify: `README.md`
- Modify: `design-qa.md`

- [ ] Record counts, corrected placements, removed false edges, retained family chains, evidence sources, and remaining uncertainty.
- [ ] Run `npm test`, `npm run check`, and `git diff --check`.
- [ ] Open the local site in the user's Chrome and verify six lanes, year placement, representative family links, and detail-panel incoming/outgoing relations.
- [ ] Keep all changes local; do not commit, push, or deploy.

