import { createPaperChatResponse } from "../../../_lib/glm-chat.js";

export async function onRequest({ request, env, params }) {
  if (request.method.toUpperCase() !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json; charset=utf-8", Allow: "POST" },
    });
  }

  return createPaperChatResponse({
    request,
    env,
    paperId: params.id,
  });
}
