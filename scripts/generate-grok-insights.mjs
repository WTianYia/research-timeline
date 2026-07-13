import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseCSV } from "../js/timeline-core.js";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_DIR = path.resolve(SCRIPT_DIR, "..");
const DEFAULT_MINERU_DIR = path.resolve(PROJECT_DIR, "..", "02_唐玉超文献检索_2026-07-03", "MinerU解析_2026-07-03");
const DEFAULT_OUTPUT_DIR = path.join(PROJECT_DIR, "data", "paper-insights");
const AGGREGATE_PATH = path.join(PROJECT_DIR, "data", "paper-insights.json");

const insightSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    id: { type: "string" },
    title: { type: "string" },
    source_mode: { type: "string", enum: ["fulltext", "abstract_only"] },
    overview: {
      type: "object",
      additionalProperties: false,
      properties: {
        one_sentence_contribution: { type: "string" },
        research_problem: { type: "string" },
        core_method: { type: "string" },
        main_findings: { type: "array", minItems: 2, maxItems: 4, items: { type: "string" } },
        theoretical_guarantee: { type: "string" },
        experiments_or_examples: { type: "string" },
        limitations: { type: "string" },
      },
      required: ["one_sentence_contribution", "research_problem", "core_method", "main_findings", "theoretical_guarantee", "experiments_or_examples", "limitations"],
    },
    innovation: {
      type: "object",
      additionalProperties: false,
      properties: {
        classification: { type: "string", enum: ["核心创新", "显著扩展", "增量改进", "应用迁移", "证据不足"] },
        score: { type: "integer", minimum: 1, maximum: 5 },
        verdict: { type: "string" },
        inherited_foundations: { type: "array", items: { type: "string" } },
        incremental_advances: { type: "array", items: { type: "string" } },
        core_innovations: { type: "array", items: { type: "string" } },
        implementation_or_experimental_changes: { type: "array", items: { type: "string" } },
        comparison_basis: { type: "array", items: { type: "string" } },
        evidence_boundary: { type: "string" },
        confidence: { type: "number", minimum: 0, maximum: 1 },
      },
      required: ["classification", "score", "verdict", "inherited_foundations", "incremental_advances", "core_innovations", "implementation_or_experimental_changes", "comparison_basis", "evidence_boundary", "confidence"],
    },
    lineage_position: { type: "string" },
    keywords: { type: "array", minItems: 4, maxItems: 10, items: { type: "string" } },
  },
  required: ["id", "title", "source_mode", "overview", "innovation", "lineage_position", "keywords"],
};

function paperOrder(id) {
  const match = String(id).match(/^(\D+)(\d+)$/);
  return match ? [match[1], Number(match[2])] : [String(id), 0];
}

export function selectComparisonPapers(target, papers, fullTextIds, limit = 3) {
  const byId = new Map(papers.map((paper) => [paper.id, paper]));
  const parents = String(target.parent_id || "")
    .split("|")
    .map((id) => id.trim())
    .filter((id) => id && fullTextIds.has(id) && byId.has(id))
    .map((id) => byId.get(id));
  if (parents.length) return parents.slice(0, limit);

  return papers
    .filter((paper) => paper.id !== target.id && paper.direction === target.direction && Number(paper.year) < Number(target.year) && fullTextIds.has(paper.id))
    .sort((a, b) => Number(b.year) - Number(a.year) || paperOrder(b.id)[1] - paperOrder(a.id)[1])
    .slice(0, Math.min(2, limit));
}

export function buildPaperJobs(papers, fullTextMap) {
  const fullTextIds = new Set(fullTextMap.keys());
  return [...papers]
    .sort((a, b) => paperOrder(a.id)[0].localeCompare(paperOrder(b.id)[0]) || paperOrder(a.id)[1] - paperOrder(b.id)[1])
    .map((paper) => ({
      paper,
      sourceMode: fullTextMap.has(paper.id) ? "fulltext" : "abstract_only",
      fullTextPath: fullTextMap.get(paper.id) || null,
      comparisons: selectComparisonPapers(paper, papers, fullTextIds),
    }));
}

function balancedJsonSlices(text) {
  const slices = [];
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === "{") {
      if (depth === 0) start = index;
      depth += 1;
    } else if (char === "}" && depth > 0) {
      depth -= 1;
      if (depth === 0 && start >= 0) slices.push(text.slice(start, index + 1));
    }
  }
  return slices;
}

export function extractAbstractFromMarkdown(markdown) {
  const match = String(markdown || "").match(/##\s+Abstract\s*\r?\n([\s\S]*?)(?=\r?\n\s*(?:Keywords?|##\s+))/i);
  return match ? match[1].replace(/\s+/g, " ").trim() : "";
}

export function extractStructuredResult(rawOutput) {
  const cleaned = String(rawOutput || "").replace(/\u001b\[[0-9;]*m/g, "");
  const candidates = balancedJsonSlices(cleaned);
  for (let index = candidates.length - 1; index >= 0; index -= 1) {
    try {
      const parsed = JSON.parse(candidates[index]);
      if (parsed?.structuredOutput && typeof parsed.structuredOutput === "object") return parsed.structuredOutput;
      if (parsed?.result && typeof parsed.result === "object") return parsed.result;
      if (typeof parsed?.text === "string") {
        try {
          const textResult = JSON.parse(parsed.text);
          if (textResult && typeof textResult === "object") return textResult;
        } catch {
          // Fall through to the outer object.
        }
      }
      if (parsed && typeof parsed === "object") return parsed;
    } catch {
      // Continue to the previous balanced object.
    }
  }
  throw new Error("Grok output did not contain a valid JSON object");
}

async function discoverFullTexts(mineruDir) {
  const mapping = new Map();
  const entries = await readdir(mineruDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const match = entry.name.match(/^([A-Za-z]+\d+)_\d{4}$/);
    if (!match) continue;
    const fullPath = path.join(mineruDir, entry.name, "full.md");
    if (existsSync(fullPath)) mapping.set(match[1], `${entry.name}/full.md`);
  }
  return mapping;
}

export function buildPrompt(job, fullTextMap) {
  const paper = job.paper;
  const comparisonLines = job.comparisons.map((item) => {
    const fullText = fullTextMap.get(item.id);
    return `- ${item.id}（${item.year}）《${item.title}》；全文：${fullText}`;
  });
  const sourceInstruction = job.sourceMode === "fulltext"
    ? `目标论文全文：${job.fullTextPath}。必须通读目标全文，再作判断。\n目标论文摘要锚点（用于防止串文）：${job.targetAbstract || paper.summary || "未提取到摘要，必须自行读取目标全文 Abstract"}`
    : `目标论文没有本地全文，只能使用以下摘要与元数据，不得假装读过全文。摘要：${paper.summary || "无"}`;

  return `你是严谨的学术论文分析员。只读取下列本地文件，不联网、不修改任何文件。\n\n目标论文：${paper.id}（${paper.year}）《${paper.title}》\n期刊：${paper.journal || "未知"}\n作者：${paper.authors || "未知"}\n现有关键词：${paper.keywords || "无"}\n${sourceInstruction}\n\n用于创新性比较的前序论文：\n${comparisonLines.length ? comparisonLines.join("\n") : "- 没有可用的本地前序全文；只能依据目标论文对相关工作的陈述，降低创新判断置信度。"}\n\n事实隔离规则：\n- overview、理论保证、实验、局限中的目标论文事实只能来自目标全文或目标摘要。\n- 前序论文只用于 innovation 和 lineage_position 的相对比较。\n- 不得把前序论文的定理、实验或应用写成目标论文内容。\n- 输出前必须重新核对目标论文 Abstract、main contributions、theorem/convergence 与 experiments/conclusion；发现无法在目标全文定位的内容必须删除或标为证据不足。\n\n输出要求：\n1. 先总结研究问题、核心方法、主要结论、理论保证、实验或算例、局限。\n2. 创新性必须在“核心创新、显著扩展、增量改进、应用迁移、证据不足”中选择一个。\n3. 不得把作者自述直接当作新颖性证据；必须区分继承内容、真正增量、核心创新和仅实验/实现变化。\n4. comparison_basis 只写用于比较的论文 ID、标题或目标论文中的相关工作依据。\n5. evidence_boundary 明确哪些判断有原文对照支持，哪些受本地文献覆盖限制。\n6. 全文缺失时 source_mode 必须为 abstract_only，confidence 不得高于 0.65；不得编造定理、实验、数值和创新。\n7. 中文输出，句子紧凑，可直接放入学术网站详情页。\n8. id 必须是 ${paper.id}，title 必须与目标论文一致，source_mode 必须是 ${job.sourceMode}。`;
}

export function validateInsight(insight, job) {
  const missing = [];
  if (insight.id !== job.paper.id) missing.push("id");
  if (!insight.title) missing.push("title");
  if (!insight.overview?.one_sentence_contribution) missing.push("overview.one_sentence_contribution");
  if (!Array.isArray(insight.overview?.main_findings) || insight.overview.main_findings.length < 2) missing.push("overview.main_findings");
  if (!insight.innovation?.classification) missing.push("innovation.classification");
  if (!insight.innovation?.verdict) missing.push("innovation.verdict");
  if (!Number.isFinite(insight.innovation?.confidence)) missing.push("innovation.confidence");
  if (!Array.isArray(insight.keywords) || insight.keywords.length < 4) missing.push("keywords");
  if (missing.length) throw new Error(`Missing or invalid fields: ${missing.join(", ")}`);
  insight.title = job.paper.title;
  insight.source_mode = job.sourceMode;
  if (job.sourceMode === "abstract_only") insight.innovation.confidence = Math.min(0.65, insight.innovation.confidence);
  insight.generated_by = "grok-4.5";
  insight.generated_at = new Date().toISOString();
  insight.comparison_ids = job.comparisons.map((paper) => paper.id);
  return insight;
}

function parseArgs(argv) {
  const options = { model: "grok-4.5", only: null, limit: Infinity, force: false, retries: 3, mineruDir: DEFAULT_MINERU_DIR };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--only") options.only = new Set(String(argv[++index]).split(",").map((id) => id.trim()));
    else if (arg === "--limit") options.limit = Number(argv[++index]);
    else if (arg === "--force") options.force = true;
    else if (arg === "--model") options.model = argv[++index];
    else if (arg === "--retries") options.retries = Number(argv[++index]);
    else if (arg === "--mineru-dir") options.mineruDir = path.resolve(argv[++index]);
  }
  return options;
}

async function writeAggregate(jobs, outputDir) {
  const aggregate = {};
  for (const job of jobs) {
    const outputPath = path.join(outputDir, `${job.paper.id}.json`);
    if (!existsSync(outputPath)) continue;
    try {
      aggregate[job.paper.id] = JSON.parse(await readFile(outputPath, "utf8"));
    } catch {
      // Invalid checkpoints are excluded and will be regenerated on the next run.
    }
  }
  await writeFile(AGGREGATE_PATH, `${JSON.stringify(aggregate, null, 2)}\n`, "utf8");
  return Object.keys(aggregate).length;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const csv = await readFile(path.join(PROJECT_DIR, "data", "papers.csv"), "utf8");
  const papers = parseCSV(csv);
  const fullTextMap = await discoverFullTexts(options.mineruDir);
  const allJobs = buildPaperJobs(papers, fullTextMap);
  let jobs = allJobs.filter((job) => !options.only || options.only.has(job.paper.id)).slice(0, options.limit);
  await mkdir(DEFAULT_OUTPUT_DIR, { recursive: true });
  await mkdir(path.join(DEFAULT_OUTPUT_DIR, "_errors"), { recursive: true });

  console.log(`Grok model: ${options.model}`);
  console.log(`Papers: ${papers.length}; full text matched: ${allJobs.filter((job) => job.sourceMode === "fulltext").length}; abstract-only: ${allJobs.filter((job) => job.sourceMode === "abstract_only").length}`);

  let completed = 0;
  let failed = 0;
  for (let index = 0; index < jobs.length; index += 1) {
    const job = jobs[index];
    const outputPath = path.join(DEFAULT_OUTPUT_DIR, `${job.paper.id}.json`);
    if (!options.force && existsSync(outputPath)) {
      try {
        const checkpoint = validateInsight(JSON.parse(await readFile(outputPath, "utf8")), job);
        await writeFile(outputPath, `${JSON.stringify(checkpoint, null, 2)}\n`, "utf8");
        completed += 1;
        console.log(`[${index + 1}/${jobs.length}] ${job.paper.id} skipped (checkpoint)`);
        continue;
      } catch {
        // Regenerate invalid checkpoint.
      }
    }

    console.log(`[${index + 1}/${jobs.length}] ${job.paper.id} ${job.sourceMode} started`);
    if (job.sourceMode === "fulltext") {
      const targetMarkdown = await readFile(path.join(options.mineruDir, job.fullTextPath), "utf8");
      job.targetAbstract = extractAbstractFromMarkdown(targetMarkdown).slice(0, 2400);
    }
    const prompt = buildPrompt(job, fullTextMap);
    let lastError = null;
    for (let attempt = 1; attempt <= options.retries; attempt += 1) {
      const result = spawnSync("grok", [
        "-m", options.model,
        "--cwd", options.mineruDir,
        "--single", prompt,
        "--max-turns", "16",
        "--disable-web-search",
        "--always-approve",
        "--no-memory",
        "--json-schema", JSON.stringify(insightSchema),
      ], {
        encoding: "utf8",
        maxBuffer: 16 * 1024 * 1024,
        timeout: 10 * 60 * 1000,
        windowsHide: true,
      });
      try {
        const insight = validateInsight(extractStructuredResult(result.stdout), job);
        await writeFile(outputPath, `${JSON.stringify(insight, null, 2)}\n`, "utf8");
        completed += 1;
        lastError = null;
        console.log(`[${index + 1}/${jobs.length}] ${job.paper.id} completed (${insight.innovation.classification}, confidence ${insight.innovation.confidence})`);
        break;
      } catch (error) {
        lastError = error;
        const diagnostic = `attempt=${attempt}\nstatus=${result.status}\nerror=${error.message}\nstdout=${result.stdout}\nstderr=${result.stderr}`;
        await writeFile(path.join(DEFAULT_OUTPUT_DIR, "_errors", `${job.paper.id}.log`), diagnostic, "utf8");
        console.log(`[${index + 1}/${jobs.length}] ${job.paper.id} attempt ${attempt} failed: ${error.message}`);
      }
    }
    if (lastError) failed += 1;
    const aggregateCount = await writeAggregate(allJobs, DEFAULT_OUTPUT_DIR);
    console.log(`progress completed=${completed} failed=${failed} aggregate=${aggregateCount}/${papers.length}`);
  }

  const aggregateCount = await writeAggregate(allJobs, DEFAULT_OUTPUT_DIR);
  console.log(`FINAL aggregate=${aggregateCount}/${papers.length} failed=${failed}`);
  if (aggregateCount !== papers.length || failed) process.exitCode = 1;
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  await main();
}
