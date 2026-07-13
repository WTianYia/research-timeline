import { servePaperPdf } from "../../../_lib/pdf.js";

export async function onRequest(context) {
  if (!['GET', 'HEAD'].includes(context.request.method.toUpperCase())) {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json; charset=utf-8", "Allow": "GET, HEAD" },
    });
  }
  return servePaperPdf({
    request: context.request,
    bucket: context.env.PAPERS_BUCKET,
    paperId: context.params.id,
  });
}
