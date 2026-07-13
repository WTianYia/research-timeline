import { normalizePaperId } from "./pdf.js";

const GLM_ENDPOINT = "https://open.bigmodel.cn/api/paas/v4/chat/completions";
const GLM_MODEL = "glm-4.7-flash";
const MARKDOWN_LIMIT = 12000;
const HISTORY_LIMIT = 8;

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

async function readObjectText(object) {
  if (typeof object.text === "function") return object.text();
  if (!object.body) return "";
  return new Response(object.body).text();
}

function cleanText(value, limit = 4000) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, limit);
}

function cleanHistory(history) {
  return (Array.isArray(history) ? history : [])
    .filter((item) => item && (item.role === "user" || item.role === "assistant") && cleanText(item.content, 1))
    .slice(-HISTORY_LIMIT)
    .map((item) => ({ role: item.role, content: cleanText(item.content) }));
}

export function buildGlmMessages({ paperId, paper = {}, markdown, history = [], message }) {
  const excerpt = String(markdown || "").slice(0, MARKDOWN_LIMIT);
  const metadata = [
    `论文编号：${paperId}`,
    `标题：${paper.title || "未记录"}`,
    `年份：${paper.year || "未记录"}`,
    `作者：${paper.authors || "未记录"}`,
    `期刊：${paper.journal || "未记录"}`,
    `DOI：${paper.doi || "未记录"}`,
  ].join("\n");

  return [
    {
      role: "system",
      content: "你是一个严谨的学术论文助手。回答必须基于用户当前选择的论文元数据、MinerU Markdown 原文摘录和当前对话上下文。不能编造原文没有支持的结论；证据不足时直接说明。默认使用简体中文，结构清晰，重点回答用户问题。",
    },
    {
      role: "user",
      content: `${metadata}\n\nMarkdown 原文摘录：\n${excerpt}`,
    },
    ...cleanHistory(history),
    { role: "user", content: cleanText(message) },
  ];
}

export async function createPaperChatResponse({ request, env, paperId, fetcher = fetch }) {
  if (!env?.ZHIPU_API_KEY) return jsonResponse({ error: "GLM API key is not configured" }, 503);
  if (!env?.PAPERS_BUCKET) return jsonResponse({ error: "Markdown storage is not configured" }, 503);

  const id = normalizePaperId(paperId);
  if (!id) return jsonResponse({ error: "Invalid paper id" }, 400);

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const message = cleanText(body?.message, 2000);
  if (!message) return jsonResponse({ error: "Message is required" }, 400);

  const object = await env.PAPERS_BUCKET.get(`markdown/${id}.md`);
  if (!object?.body && typeof object?.text !== "function") return jsonResponse({ error: "Markdown not found" }, 404);
  const markdown = await readObjectText(object);

  const glmResponse = await fetcher(GLM_ENDPOINT, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${env.ZHIPU_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: GLM_MODEL,
      messages: buildGlmMessages({
        paperId: id,
        paper: body.paper || {},
        markdown,
        history: body.history || [],
        message,
      }),
      temperature: 0.3,
      max_tokens: 2048,
    }),
  });

  const payload = await glmResponse.json().catch(() => ({}));
  if (!glmResponse.ok) {
    return jsonResponse({ error: payload?.error?.message || "GLM request failed" }, 502);
  }

  const reply = payload?.choices?.[0]?.message?.content;
  if (!reply) return jsonResponse({ error: "GLM response is empty" }, 502);
  return jsonResponse({ reply, model: GLM_MODEL });
}
