import { servePaperContext } from "../../../_lib/markdown.js";

export async function onRequest({ request, env, params }) {
  const method = request.method.toUpperCase();
  if (method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json; charset=utf-8", Allow: "GET" },
    });
  }

  return servePaperContext({
    request,
    bucket: env.PAPERS_BUCKET,
    paperId: params.id,
  });
}
