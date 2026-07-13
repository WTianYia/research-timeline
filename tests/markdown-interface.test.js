import test from "node:test";
import assert from "node:assert/strict";
import { onRequest as onMarkdownRequest } from "../functions/api/papers/[id]/markdown.js";
import { onRequest as onMdRequest } from "../functions/api/papers/[id]/md.js";
import { onRequest as onContextRequest } from "../functions/api/papers/[id]/context.js";
import { servePaperContext, servePaperMarkdown } from "../functions/_lib/markdown.js";

const DEFAULT_MARKDOWN = "# A31\n\nThis paper proposes a new splitting method for variational inequalities.";

function createBucket(content = DEFAULT_MARKDOWN) {
  const bytes = new TextEncoder().encode(content);
  const metadata = {
    size: bytes.length,
    httpEtag: '"md-etag"',
    writeHttpMetadata(headers) { headers.set("Content-Type", "text/markdown"); },
  };
  return {
    async head(key) { return key === "markdown/A31.md" ? metadata : null; },
    async get(key) {
      if (key !== "markdown/A31.md") return null;
      return { ...metadata, body: new Blob([bytes]).stream(), async text() { return content; } };
    },
  };
}

test("servePaperMarkdown returns an inline Markdown document", async () => {
  const response = await servePaperMarkdown({
    request: new Request("https://example.test/api/papers/A31/markdown"),
    bucket: createBucket(),
    paperId: "A31",
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "text/markdown; charset=utf-8");
  assert.equal(response.headers.get("content-disposition"), 'inline; filename="A31.md"');
  assert.match(await response.text(), /^# A31/);
});

test("servePaperMarkdown supports HEAD and distinguishes invalid or missing resources", async () => {
  const head = await servePaperMarkdown({
    request: new Request("https://example.test/api/papers/A31/markdown", { method: "HEAD" }),
    bucket: createBucket(),
    paperId: "A31",
  });
  assert.equal(head.status, 200);
  assert.equal(head.headers.get("content-length"), String(new TextEncoder().encode(DEFAULT_MARKDOWN).length));
  assert.equal(await head.text(), "");

  const invalid = await servePaperMarkdown({ request: new Request("https://example.test"), bucket: createBucket(), paperId: "../A31" });
  assert.equal(invalid.status, 400);

  const missing = await servePaperMarkdown({ request: new Request("https://example.test"), bucket: createBucket(), paperId: "A99" });
  assert.equal(missing.status, 404);

  const unavailable = await servePaperMarkdown({ request: new Request("https://example.test"), bucket: null, paperId: "A31" });
  assert.equal(unavailable.status, 503);
});

test("servePaperContext exposes bounded Markdown content for browser-side AI usage", async () => {
  const response = await servePaperContext({
    request: new Request("https://example.test/api/papers/A31/context"),
    bucket: createBucket("0123456789".repeat(1600)),
    paperId: "A31",
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "application/json; charset=utf-8");
  const payload = await response.json();
  assert.equal(payload.paperId, "A31");
  assert.equal(payload.markdown.available, true);
  assert.equal(payload.markdown.url, "/api/papers/A31/md");
  assert.equal(payload.markdown.content.length, 12000);
  assert.equal(payload.markdown.truncated, true);
});

test("Pages routes delegate only supported methods", async () => {
  const markdown = await onMarkdownRequest({
    request: new Request("https://example.test/api/papers/A31/markdown"),
    env: { PAPERS_BUCKET: createBucket() },
    params: { id: "A31" },
  });
  assert.equal(markdown.status, 200);

  const mdAlias = await onMdRequest({
    request: new Request("https://example.test/api/papers/A31/md"),
    env: { PAPERS_BUCKET: createBucket() },
    params: { id: "A31" },
  });
  assert.equal(mdAlias.status, 200);

  const markdownRejected = await onMarkdownRequest({
    request: new Request("https://example.test/api/papers/A31/markdown", { method: "POST" }),
    env: { PAPERS_BUCKET: createBucket() },
    params: { id: "A31" },
  });
  assert.equal(markdownRejected.status, 405);

  const context = await onContextRequest({
    request: new Request("https://example.test/api/papers/A31/context"),
    env: { PAPERS_BUCKET: createBucket() },
    params: { id: "A31" },
  });
  assert.equal(context.status, 200);

  const contextRejected = await onContextRequest({
    request: new Request("https://example.test/api/papers/A31/context", { method: "HEAD" }),
    env: { PAPERS_BUCKET: createBucket() },
    params: { id: "A31" },
  });
  assert.equal(contextRejected.status, 405);
});
