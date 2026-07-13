# PDF Interface Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Serve 81 locally available paper PDFs through a range-capable Cloudflare Pages Function backed by private R2 and expose the reader link in paper details.

**Architecture:** Keep binary files outside GitHub in `tang-research-papers`. A small tested library validates IDs, parses one HTTP byte range, and builds the R2 response; the file-routed Pages Function delegates to it. The frontend loads a generated availability manifest and only renders PDF links for known objects.

**Tech Stack:** Vanilla JavaScript ES modules, Node test runner, Cloudflare Pages Functions, R2, Wrangler, GitHub Pages deployment integration.

---

### Task 1: Test PDF request semantics

**Files:**
- Create: `tests/pdf-interface.test.js`
- Create: `functions/_lib/pdf.js`
- Create: `functions/api/papers/[id]/pdf.js`

- [ ] Write tests that require `normalizePaperId`, `parseByteRange`, full GET, ranged GET, HEAD, 404, 416 and 503 behavior.
- [ ] Run `node --test tests/pdf-interface.test.js` and confirm failure because the PDF library does not exist.
- [ ] Implement the minimal library and route handler, using only a validated `papers/A<number>.pdf` key.
- [ ] Re-run the focused test and confirm all cases pass.

### Task 2: Add PDF availability to the website

**Files:**
- Create: `data/pdf-manifest.json`
- Modify: `js/timeline.js`
- Modify: `css/style.css`
- Modify: `index.html`
- Modify: `tests/timeline-core.test.js`

- [ ] Add a failing integration assertion for manifest loading and `/api/papers/${paper.id}/pdf` rendering.
- [ ] Generate the 81-ID manifest from MinerU directories that correspond to `data/papers.csv`.
- [ ] Load the manifest with the existing directions, CSV and insights requests.
- [ ] Render “阅读 PDF” as the primary detail action when available and keep DOI as fallback/secondary access.
- [ ] Bump static cache versions and confirm the focused tests pass.

### Task 3: Upload and bind R2

**Files:**
- Create: `scripts/upload-pdfs-to-r2.mjs`
- Create: `.gitignore`

- [ ] Authenticate Wrangler against the existing Cloudflare account.
- [ ] Create or reuse `tang-research-papers`.
- [ ] Upload exactly one source PDF for each of the 81 manifest IDs with `application/pdf` metadata.
- [ ] Verify object count, sample object size and `%PDF-` signature.
- [ ] Add the production and preview `PAPERS_BUCKET` R2 binding to the `research-timeline` Pages project.

### Task 4: Publish and verify production

**Files:**
- Modify: `README.md`
- Modify: `design-qa.md`

- [ ] Run `npm.cmd test`, `npm.cmd run check` and `git diff --check`.
- [ ] Stage the intended accumulated website work plus PDF interface, commit on a feature branch and push to GitHub.
- [ ] Open the GitHub PR, merge after checks, and wait for the Cloudflare production deployment.
- [ ] Verify a full PDF request and byte range request on `www.tianyi.ddns-ip.net`.
- [ ] Use desktop Chrome to open a paper detail, click “阅读 PDF”, and confirm the PDF viewer renders.
- [ ] Record production URL, response status and screenshot in `design-qa.md`.
