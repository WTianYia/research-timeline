import test from "node:test";
import assert from "node:assert/strict";
import { onRequest } from "../functions/api/papers/[id]/chat.js";
import { buildGlmMessages, createPaperChatResponse } from "../functions/_lib/glm-chat.js";

function createBucket(content = "# A31\n\nMarkdown full text about preconditioned splitting.") {
  const bytes = new TextEncoder().encode(content);
  return {
    async get(key) {
      if (key !== "markdown/A31.md") return null;
      return { size: bytes.length, body: new Blob([bytes]).stream(), async text() { return content; } };
    },
  };
}

function createRequest(body, method = "POST") {
  return new Request("https://example.test/api/papers/A31/chat", {
    method,
    headers: { "Content-Type": "application/json" },
    body: body == null ? undefined : JSON.stringify(body),
  });
}

test("buildGlmMessages includes paper metadata, markdown and bounded chat history", () => {
  const messages = buildGlmMessages({
    paperId: "A31",
    paper: { title: "Preconditioned Three-Operator Splitting", year: 2022, authors: "Yuchao Tang", journal: "JOTA", doi: "10.1007/test" },
    markdown: "# A31\n\nfull text",
    history: [
      { role: "user", content: "先总结" },
      { role: "assistant", content: "这是总结" },
      { role: "system", content: "bad" },
    ],
    message: "创新点是什么？",
  });
  assert.equal(messages[0].role, "system");
  assert.match(messages[1].content, /论文编号：A31/);
  assert.match(messages[1].content, /标题：Preconditioned Three-Operator Splitting/);
  assert.match(messages[1].content, /Markdown 原文摘录/);
  assert.deepEqual(messages.slice(-3).map((item) => item.role), ["user", "assistant", "user"]);
  assert.equal(messages.at(-1).content, "创新点是什么？");
});

test("createPaperChatResponse calls glm-4.7-flash and returns assistant content", async () => {
  const calls = [];
  const response = await createPaperChatResponse({
    request: createRequest({
      message: "这篇文章的核心创新是什么？",
      history: [{ role: "user", content: "前面的问题" }],
      paper: { title: "Test Paper", year: 2022 },
    }),
    env: { PAPERS_BUCKET: createBucket(), ZHIPU_API_KEY: "test-key" },
    paperId: "A31",
    fetcher: async (url, options) => {
      calls.push({ url, options });
      return new Response(JSON.stringify({ choices: [{ message: { content: "这是 GLM 回复。" } }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    },
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { reply: "这是 GLM 回复。", model: "glm-4.7-flash" });
  assert.equal(calls[0].url, "https://open.bigmodel.cn/api/paas/v4/chat/completions");
  assert.equal(calls[0].options.headers.Authorization, "Bearer test-key");
  const body = JSON.parse(calls[0].options.body);
  assert.equal(body.model, "glm-4.7-flash");
  assert.match(body.messages[1].content, /Markdown full text/);
});

test("createPaperChatResponse rejects missing key, empty message and missing markdown", async () => {
  const missingKey = await createPaperChatResponse({
    request: createRequest({ message: "hello" }),
    env: { PAPERS_BUCKET: createBucket() },
    paperId: "A31",
  });
  assert.equal(missingKey.status, 503);

  const emptyMessage = await createPaperChatResponse({
    request: createRequest({ message: "   " }),
    env: { PAPERS_BUCKET: createBucket(), ZHIPU_API_KEY: "test-key" },
    paperId: "A31",
  });
  assert.equal(emptyMessage.status, 400);

  const missingMarkdown = await createPaperChatResponse({
    request: createRequest({ message: "hello" }),
    env: { PAPERS_BUCKET: createBucket(), ZHIPU_API_KEY: "test-key" },
    paperId: "A99",
  });
  assert.equal(missingMarkdown.status, 404);
});

test("Pages chat route only accepts POST", async () => {
  const rejected = await onRequest({
    request: createRequest(null, "GET"),
    env: { PAPERS_BUCKET: createBucket(), ZHIPU_API_KEY: "test-key" },
    params: { id: "A31" },
  });
  assert.equal(rejected.status, 405);
});
