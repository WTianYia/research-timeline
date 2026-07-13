import test from "node:test";
import assert from "node:assert/strict";
import { onRequest } from "../functions/api/papers/[id]/pdf.js";
import { normalizePaperId, parseByteRange, servePaperPdf } from "../functions/_lib/pdf.js";

function createBucket(content = "%PDF-1.7\nexample paper") {
  const bytes = new TextEncoder().encode(content);
  const metadata = {
    size: bytes.length,
    httpEtag: '"test-etag"',
    writeHttpMetadata(headers) { headers.set("Content-Type", "application/pdf"); },
  };
  return {
    async head(key) { return key === "papers/A31.pdf" ? metadata : null; },
    async get(key, options = {}) {
      if (key !== "papers/A31.pdf") return null;
      const range = options.range;
      const body = range ? bytes.slice(range.offset, range.offset + range.length) : bytes;
      return { ...metadata, body, range };
    },
  };
}

test("normalizePaperId only accepts timeline paper identifiers", () => {
  assert.equal(normalizePaperId("a31"), "A31");
  assert.equal(normalizePaperId("A003"), "A003");
  assert.equal(normalizePaperId("../A31"), null);
  assert.equal(normalizePaperId("BP1"), null);
});

test("parseByteRange supports bounded, open-ended and suffix ranges", () => {
  assert.deepEqual(parseByteRange("bytes=2-6", 10), { offset: 2, length: 5 });
  assert.deepEqual(parseByteRange("bytes=7-", 10), { offset: 7, length: 3 });
  assert.deepEqual(parseByteRange("bytes=-4", 10), { offset: 6, length: 4 });
  assert.equal(parseByteRange("bytes=20-30", 10), false);
  assert.equal(parseByteRange("bytes=0-1,4-5", 10), false);
});

test("servePaperPdf returns a complete inline PDF", async () => {
  const response = await servePaperPdf({
    request: new Request("https://example.test/api/papers/A31/pdf"),
    bucket: createBucket(),
    paperId: "A31",
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "application/pdf");
  assert.equal(response.headers.get("content-disposition"), 'inline; filename="A31.pdf"');
  assert.equal(response.headers.get("accept-ranges"), "bytes");
  assert.match(await response.text(), /^%PDF-/);
});

test("servePaperPdf returns a standards-compliant partial response", async () => {
  const response = await servePaperPdf({
    request: new Request("https://example.test/api/papers/A31/pdf", { headers: { Range: "bytes=0-3" } }),
    bucket: createBucket(),
    paperId: "A31",
  });
  assert.equal(response.status, 206);
  assert.equal(response.headers.get("content-range"), "bytes 0-3/22");
  assert.equal(response.headers.get("content-length"), "4");
  assert.equal(await response.text(), "%PDF");
});

test("servePaperPdf supports HEAD without reading the object body", async () => {
  const response = await servePaperPdf({
    request: new Request("https://example.test/api/papers/A31/pdf", { method: "HEAD" }),
    bucket: createBucket(),
    paperId: "A31",
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-length"), "22");
  assert.equal(await response.text(), "");
});

test("servePaperPdf distinguishes missing bindings, invalid ranges and missing papers", async () => {
  const unavailable = await servePaperPdf({ request: new Request("https://example.test"), bucket: null, paperId: "A31" });
  assert.equal(unavailable.status, 503);

  const invalidRange = await servePaperPdf({
    request: new Request("https://example.test", { headers: { Range: "bytes=999-" } }),
    bucket: createBucket(),
    paperId: "A31",
  });
  assert.equal(invalidRange.status, 416);

  const missing = await servePaperPdf({ request: new Request("https://example.test"), bucket: createBucket(), paperId: "A99" });
  assert.equal(missing.status, 404);
});

test("Pages route delegates only GET and HEAD requests to the PDF service", async () => {
  const response = await onRequest({
    request: new Request("https://example.test/api/papers/A31/pdf"),
    env: { PAPERS_BUCKET: createBucket() },
    params: { id: "A31" },
  });
  assert.equal(response.status, 200);

  const rejected = await onRequest({
    request: new Request("https://example.test/api/papers/A31/pdf", { method: "POST" }),
    env: { PAPERS_BUCKET: createBucket() },
    params: { id: "A31" },
  });
  assert.equal(rejected.status, 405);
});
