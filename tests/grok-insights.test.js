import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  buildPrompt,
  buildPaperJobs,
  extractAbstractFromMarkdown,
  extractStructuredResult,
  selectComparisonPapers,
  validateInsight,
} from "../scripts/generate-grok-insights.mjs";

const papers = [
  { id: "A1", year: 2024, direction: "d1", parent_id: "A2", title: "Target" },
  { id: "A2", year: 2022, direction: "d1", parent_id: "", title: "Parent" },
  { id: "A3", year: 2021, direction: "d1", parent_id: "", title: "Earlier" },
  { id: "A4", year: 2020, direction: "d2", parent_id: "", title: "Other" },
];

test("selectComparisonPapers prefers curated parents", () => {
  const selected = selectComparisonPapers(papers[0], papers, new Set(["A1", "A2", "A3"]));
  assert.deepEqual(selected.map((paper) => paper.id), ["A2"]);
});

test("selectComparisonPapers falls back to earlier papers in the same direction", () => {
  const selected = selectComparisonPapers({ ...papers[0], parent_id: "" }, papers, new Set(["A1", "A2", "A3"]));
  assert.deepEqual(selected.map((paper) => paper.id), ["A2", "A3"]);
});

test("buildPaperJobs marks missing full text as abstract-only", () => {
  const jobs = buildPaperJobs(papers, new Map([["A1", "A1_2024/full.md"]]));
  assert.equal(jobs.find((job) => job.paper.id === "A1").sourceMode, "fulltext");
  assert.equal(jobs.find((job) => job.paper.id === "A2").sourceMode, "abstract_only");
});

test("extractStructuredResult returns the last valid JSON object", () => {
  const parsed = extractStructuredResult('reading file\n{"ignored":true}\n{"id":"A1","title":"Target"}\n');
  assert.deepEqual(parsed, { id: "A1", title: "Target" });
});

test("extractStructuredResult unwraps Grok structuredOutput", () => {
  const parsed = extractStructuredResult(JSON.stringify({
    text: "{\"id\":\"wrong-wrapper\"}",
    structuredOutput: { id: "A1", title: "Target" },
  }));
  assert.deepEqual(parsed, { id: "A1", title: "Target" });
});

test("buildPrompt forbids importing comparison-paper facts into the target summary", () => {
  const job = {
    paper: { ...papers[0], summary: "Target abstract", journal: "J", authors: "Author", keywords: "key" },
    sourceMode: "fulltext",
    fullTextPath: "A1_2024/full.md",
    comparisons: [papers[1]],
  };
  const prompt = buildPrompt(job, new Map([["A2", "A2_2022/full.md"]]));
  assert.match(prompt, /目标论文事实只能来自目标全文/);
  assert.match(prompt, /不得把前序论文的定理、实验或应用写成目标论文内容/);
});

test("extractAbstractFromMarkdown isolates the target abstract", () => {
  const markdown = "# Title\n\n## Abstract\nTarget abstract line.\n\nKeywords Test\n\n## 1 Introduction\nOther text";
  assert.equal(extractAbstractFromMarkdown(markdown), "Target abstract line.");
});

test("generated Grok insights cover all timeline papers with valid source labels", async () => {
  const { parseCSV } = await import("../js/timeline-core.js");
  const timelinePapers = parseCSV(await readFile(new URL("../data/papers.csv", import.meta.url), "utf8"));
  const insights = JSON.parse(await readFile(new URL("../data/paper-insights.json", import.meta.url), "utf8"));
  const abstractOnlyIds = new Set(["A3", "A12", "A26", "A37", "A43"]);
  const allowedClassifications = new Set(["核心创新", "显著扩展", "增量改进", "应用迁移", "证据不足"]);

  assert.equal(Object.keys(insights).length, timelinePapers.length);
  for (const paper of timelinePapers) {
    const insight = insights[paper.id];
    assert.ok(insight, `${paper.id} must have an insight`);
    assert.equal(insight.id, paper.id);
    assert.equal(insight.title, paper.title);
    assert.equal(insight.source_mode, abstractOnlyIds.has(paper.id) ? "abstract_only" : "fulltext");
    assert.equal(insight.generated_by, "grok-4.5");
    assert.ok(insight.overview.one_sentence_contribution);
    assert.ok(insight.overview.research_problem);
    assert.ok(insight.overview.core_method);
    assert.ok(insight.overview.main_findings.length >= 2);
    assert.ok(insight.overview.theoretical_guarantee);
    assert.ok(insight.overview.experiments_or_examples);
    assert.ok(insight.overview.limitations);
    assert.ok(allowedClassifications.has(insight.innovation.classification));
    assert.ok(insight.innovation.verdict);
    assert.ok(insight.innovation.evidence_boundary);
    assert.ok(Number.isFinite(insight.innovation.confidence));
    assert.ok(insight.keywords.length >= 4);
    if (abstractOnlyIds.has(paper.id)) assert.ok(insight.innovation.confidence <= 0.65);
  }
});

test("validateInsight restores the canonical timeline title", () => {
  const job = { paper: { id: "A1", title: "Canonical-Title" }, sourceMode: "fulltext", comparisons: [] };
  const insight = {
    id: "A1",
    title: "Canonical–Title",
    overview: { one_sentence_contribution: "x", main_findings: ["a", "b"] },
    innovation: { classification: "增量改进", verdict: "x", confidence: 0.8 },
    keywords: ["a", "b", "c", "d"],
  };
  assert.equal(validateInsight(insight, job).title, "Canonical-Title");
});
