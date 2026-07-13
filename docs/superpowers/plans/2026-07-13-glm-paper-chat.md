# GLM Paper Chat Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a site-native GLM chat box in each paper detail panel that automatically uses the current paper metadata, Markdown excerpt, and current chat history.

**Architecture:** The browser sends only the current paper metadata, user message, and local conversation history to a same-origin Pages Function. The Pages Function reads the paper Markdown from R2, builds a bounded prompt, calls the Zhipu OpenAI-compatible GLM endpoint with `glm-4.7-flash`, and returns the assistant reply. The API key is stored only as `ZHIPU_API_KEY` in Cloudflare Pages environment variables.

**Tech Stack:** Cloudflare Pages Functions, Cloudflare R2, vanilla JavaScript frontend, Node test runner, Zhipu OpenAI-compatible HTTP API.

---

### Task 1: Backend chat route

**Files:**
- Create: `functions/_lib/glm-chat.js`
- Create: `functions/api/papers/[id]/chat.js`
- Test: `tests/glm-chat.test.js`

- [x] Write failing tests for missing API key, invalid method, Markdown lookup, prompt construction, and GLM response parsing.
- [x] Run targeted tests and confirm failure before implementation.
- [x] Implement minimal GLM chat helper and Pages route.
- [x] Run targeted tests until green.

### Task 2: Frontend detail panel chat UI

**Files:**
- Modify: `js/timeline.js`
- Modify: `css/style.css`
- Test: `tests/timeline-core.test.js`

- [x] Write failing tests that require the GLM chat UI, remove the copy-context handler, and remove the data download action.
- [x] Replace the copy-context button with a chat panel.
- [x] Keep `查看 MD` and `访问 DOI` as same-row secondary actions.
- [x] Add per-paper in-memory conversation history and POST to `/api/papers/:id/chat`.

### Task 3: Secret, deploy, and verify

**Files:**
- No source file should contain the API key.

- [x] Store `ZHIPU_API_KEY` in Cloudflare Pages secrets through Wrangler.
- [x] Run `npm test`, `npm run check`, and `git diff --check`.
- [x] Commit, push, wait for Cloudflare Pages Production Active.
- [x] Verify live chat endpoint and Chrome detail-panel UI.
