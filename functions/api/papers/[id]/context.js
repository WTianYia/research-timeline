import { normalizePaperId } from "../../../_lib/pdf.js";

const CONTEXT_LIMIT = 12000;

function errorResponse(message, status) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export async function onRequest({ request, env, params }) {
  const method = request.method.toUpperCase();
  if (method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json; charset=utf-8", Allow: "GET" },
    });
  }

  const bucket = env.PAPERS_BUCKET;
  if (!bucket) return errorResponse("Markdown storage is not configured", 503);
  const id = normalizePaperId(params.id);
  if (!id) return errorResponse("Invalid paper id", 400);
  const object = await bucket.get(`markdown/${id}.md`);
  if (!object?.body && typeof object?.text !== "function") return errorResponse("Markdown not found", 404);
  const content = typeof object.text === "function" ? await object.text() : await new Response(object.body).text();
  const bounded = content.slice(0, CONTEXT_LIMIT);

  return new Response(JSON.stringify({
    paperId: id,
    markdown: {
      available: true,
      url: `/api/papers/${id}/md`,
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
