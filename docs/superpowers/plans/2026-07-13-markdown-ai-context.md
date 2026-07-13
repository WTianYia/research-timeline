# Markdown and AI context access

## Goal

Expose MinerU Markdown files through the same Cloudflare Pages + R2 deployment so readers and future browser-side AI features can access the parsed full text for each paper.

## Scope

- Store Markdown files in R2 under `markdown/{paperId}.md`.
- Add `/api/papers/:id/markdown` for direct Markdown reading.
- Add `/api/papers/:id/context` for bounded JSON context that can be copied into AI tools or consumed by a future site AI panel.
- Add detail-panel UI controls only when Markdown exists.
- Keep this phase keyless: no paid model endpoint and no secret handling.

## Verification

- Node tests for route behavior and UI wiring.
- Dry-run Markdown discovery before upload.
- R2 upload through Wrangler.
- Production endpoint smoke tests after Cloudflare Pages deployment.
