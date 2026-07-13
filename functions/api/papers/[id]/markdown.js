import { servePaperMarkdown } from "../../../_lib/markdown.js";

export async function onRequest({ request, env, params }) {
  const method = request.method.toUpperCase();
  if (method !== "GET" && method !== "HEAD") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json; charset=utf-8", Allow: "GET, HEAD" },
    });
  }

  return servePaperMarkdown({
    request,
    bucket: env.PAPERS_BUCKET,
    paperId: params.id,
  });
}
