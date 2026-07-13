const PAPER_ID_PATTERN = /^A\d{1,3}$/;

export function normalizePaperId(value) {
  const id = String(value || "").trim().toUpperCase();
  return PAPER_ID_PATTERN.test(id) ? id : null;
}

export function parseByteRange(header, size) {
  if (!header) return null;
  if (!Number.isInteger(size) || size < 0) return false;
  const match = /^bytes=(\d*)-(\d*)$/i.exec(String(header).trim());
  if (!match || (!match[1] && !match[2])) return false;

  if (!match[1]) {
    const suffix = Number(match[2]);
    if (!Number.isInteger(suffix) || suffix <= 0) return false;
    const length = Math.min(suffix, size);
    return { offset: size - length, length };
  }

  const start = Number(match[1]);
  const requestedEnd = match[2] ? Number(match[2]) : size - 1;
  if (!Number.isInteger(start) || !Number.isInteger(requestedEnd) || start < 0 || start >= size || requestedEnd < start) return false;
  const end = Math.min(requestedEnd, size - 1);
  return { offset: start, length: end - start + 1 };
}

function errorResponse(message, status, extraHeaders = {}) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...extraHeaders },
  });
}

function buildPdfHeaders(object, paperId, contentLength) {
  const headers = new Headers();
  object.writeHttpMetadata?.(headers);
  headers.set("Content-Type", "application/pdf");
  headers.set("Content-Disposition", `inline; filename="${paperId}.pdf"`);
  headers.set("Accept-Ranges", "bytes");
  headers.set("Cache-Control", "public, max-age=86400, stale-while-revalidate=604800");
  headers.set("X-Content-Type-Options", "nosniff");
  if (object.httpEtag) headers.set("ETag", object.httpEtag);
  if (Number.isFinite(contentLength)) headers.set("Content-Length", String(contentLength));
  return headers;
}

export async function servePaperPdf({ request, bucket, paperId }) {
  if (!bucket) return errorResponse("PDF storage is not configured", 503);
  const id = normalizePaperId(paperId);
  if (!id) return errorResponse("Invalid paper id", 400);
  const key = `papers/${id}.pdf`;
  const method = request.method.toUpperCase();

  if (method === "HEAD") {
    const object = await bucket.head(key);
    if (!object) return errorResponse("PDF not found", 404);
    return new Response(null, { status: 200, headers: buildPdfHeaders(object, id, object.size) });
  }

  const rangeHeader = request.headers.get("Range");
  if (rangeHeader) {
    const metadata = await bucket.head(key);
    if (!metadata) return errorResponse("PDF not found", 404);
    const range = parseByteRange(rangeHeader, metadata.size);
    if (!range) return errorResponse("Requested range is not satisfiable", 416, { "Content-Range": `bytes */${metadata.size}` });
    const object = await bucket.get(key, { range });
    if (!object?.body) return errorResponse("PDF not found", 404);
    const headers = buildPdfHeaders(object, id, range.length);
    headers.set("Content-Range", `bytes ${range.offset}-${range.offset + range.length - 1}/${metadata.size}`);
    return new Response(object.body, { status: 206, headers });
  }

  const object = await bucket.get(key);
  if (!object?.body) return errorResponse("PDF not found", 404);
  return new Response(object.body, { status: 200, headers: buildPdfHeaders(object, id, object.size) });
}
