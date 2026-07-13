import { normalizePaperId } from "./pdf.js";

const CONTEXT_LIMIT = 12000;

function errorResponse(message, status) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

function buildMarkdownHeaders(object, paperId, contentLength) {
  const headers = new Headers();
  object.writeHttpMetadata?.(headers);
  headers.set("Content-Type", "text/markdown; charset=utf-8");
  headers.set("Content-Disposition", `inline; filename="${paperId}.md"`);
  headers.set("Cache-Control", "public, max-age=86400, stale-while-revalidate=604800");
  headers.set("X-Content-Type-Options", "nosniff");
  if (object.httpEtag) headers.set("ETag", object.httpEtag);
  if (Number.isFinite(contentLength)) headers.set("Content-Length", String(contentLength));
  return headers;
}

async function readObjectText(object) {
  if (typeof object.text === "function") return object.text();
  if (!object.body) return "";
  return new Response(object.body).text();
}

export async function servePaperMarkdown({ request, bucket, paperId }) {
  if (!bucket) return errorResponse("Markdown storage is not configured", 503);
  const id = normalizePaperId(paperId);
  if (!id) return errorResponse("Invalid paper id", 400);
  const key = `markdown/${id}.md`;
  const method = request.method.toUpperCase();

  if (method === "HEAD") {
    const object = await bucket.head(key);
    if (!object) return errorResponse("Markdown not found", 404);
    return new Response(null, { status: 200, headers: buildMarkdownHeaders(object, id, object.size) });
  }

  const object = await bucket.get(key);
  if (!object?.body && typeof object?.text !== "function") return errorResponse("Markdown not found", 404);
  return new Response(object.body, { status: 200, headers: buildMarkdownHeaders(object, id, object.size) });
}

export async function servePaperContext({ bucket, paperId }) {
  if (!bucket) return errorResponse("Markdown storage is not configured", 503);
  const id = normalizePaperId(paperId);
  if (!id) return errorResponse("Invalid paper id", 400);
  const key = `markdown/${id}.md`;
  const object = await bucket.get(key);
  if (!object?.body && typeof object?.text !== "function") return errorResponse("Markdown not found", 404);
  const content = await readObjectText(object);
  const bounded = content.slice(0, CONTEXT_LIMIT);
  return new Response(JSON.stringify({
    paperId: id,
    markdown: {
      available: true,
      url: `/api/papers/${id}/markdown`,
      size: object.size ?? new TextEncoder().encode(content).length,
      content: bounded,
      truncated: content.length > bounded.length,
      contentLimit: CONTEXT_LIMIT,
    },
  }), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
