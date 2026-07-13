import { readdir, stat, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseCSV } from "../js/timeline-core.js";

const PROJECT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WRANGLER_CWD = process.platform === "win32" ? process.env.USERPROFILE || PROJECT_DIR : PROJECT_DIR;
const DEFAULT_MINERU_DIR = path.resolve(PROJECT_DIR, "..", "02_\u5510\u7389\u8d85\u6587\u732e\u68c0\u7d22_2026-07-03", "MinerU\u89e3\u6790_2026-07-03");
const DEFAULT_BUCKET = "tang-research-papers";
const PROGRESS_PATH = path.join(PROJECT_DIR, "upload-markdown-progress.json");
const MANIFEST_PATH = path.join(PROJECT_DIR, "data", "markdown-manifest.json");

function parseArgs(argv) {
  const options = { bucket: DEFAULT_BUCKET, mineruDir: DEFAULT_MINERU_DIR, dryRun: false, only: null, writeManifest: false };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--bucket") options.bucket = argv[++index];
    else if (value === "--mineru-dir") options.mineruDir = path.resolve(argv[++index]);
    else if (value === "--only") options.only = argv[++index].split(",").map((id) => id.trim().toUpperCase()).filter(Boolean);
    else if (value === "--dry-run") options.dryRun = true;
    else if (value === "--write-manifest") options.writeManifest = true;
  }
  return options;
}

async function findMarkdown(directory) {
  const preferred = path.join(directory, "full.md");
  try {
    const preferredStat = await stat(preferred);
    if (preferredStat.isFile()) return { file: preferred, size: preferredStat.size };
  } catch {}

  const candidates = [];
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) candidates.push(...await findAllMarkdown(absolute));
    else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) candidates.push(absolute);
  }
  const sized = await Promise.all(candidates.map(async (file) => ({ file, size: (await stat(file)).size })));
  return sized.sort((a, b) => b.size - a.size)[0] || null;
}

async function findAllMarkdown(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await findAllMarkdown(absolute));
    else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) files.push(absolute);
  }
  return files;
}

function runWrangler(args) {
  const command = process.platform === "win32" ? "C:\\Windows\\System32\\cmd.exe" : "npx";
  const commandArgs = process.platform === "win32"
    ? ["/c", "npx.cmd", "--yes", "wrangler", ...args]
    : ["--yes", "wrangler", ...args];
  return new Promise((resolve, reject) => {
    const child = spawn(command, commandArgs, { cwd: WRANGLER_CWD, stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`wrangler exited with ${code}`)));
  });
}

async function readProgress(bucket) {
  try {
    const progress = JSON.parse(await readFile(PROGRESS_PATH, "utf8"));
    return progress.bucket === bucket ? new Set(progress.completed || []) : new Set();
  } catch {
    return new Set();
  }
}

async function discoverJobs(options) {
  const papers = parseCSV(await readFile(path.join(PROJECT_DIR, "data", "papers.csv"), "utf8"));
  const ids = papers.map((paper) => paper.id).filter(Boolean);
  const allowed = new Set(options.only?.length ? options.only : ids);
  const directories = await readdir(options.mineruDir, { withFileTypes: true });
  const byId = new Map(directories
    .filter((entry) => entry.isDirectory() && /^A\d+_/.test(entry.name))
    .map((entry) => [entry.name.split("_")[0], path.join(options.mineruDir, entry.name)]));

  const jobs = [];
  const missing = [];
  for (const id of ids) {
    const directory = byId.get(id);
    if (!directory) {
      missing.push(id);
      continue;
    }
    const markdown = await findMarkdown(directory);
    if (!markdown) {
      missing.push(id);
      continue;
    }
    if (allowed.has(id)) jobs.push({ id, ...markdown });
  }
  return { jobs, missing };
}

async function uploadWithRetry(job, options) {
  const args = [
    "r2", "object", "put", `${options.bucket}/markdown/${job.id}.md`,
    "--file", job.file,
    "--content-type", "text/markdown; charset=utf-8",
    "--remote",
  ];
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      await runWrangler(args);
      return;
    } catch (error) {
      if (attempt === 4) throw error;
      console.warn(`Upload ${job.id} failed on attempt ${attempt}; retrying in 5s.`);
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const { jobs, missing } = await discoverJobs(options);
  const manifest = {
    bucket: options.bucket,
    objectPrefix: "markdown/",
    available: jobs.map((job) => job.id),
    missing,
  };

  console.log(`Prepared ${jobs.length} Markdown files (${(jobs.reduce((sum, job) => sum + job.size, 0) / 1024 / 1024).toFixed(2)} MiB)`);
  if (options.writeManifest) {
    await writeFile(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
    console.log(`Wrote ${MANIFEST_PATH}`);
  }
  if (options.dryRun) {
    jobs.forEach((job) => console.log(`${job.id}\t${job.size}\t${job.file}`));
    return;
  }

  const completed = [...await readProgress(options.bucket)];
  const completedSet = new Set(completed);
  for (const [index, job] of jobs.entries()) {
    if (completedSet.has(job.id)) {
      console.log(`[${index + 1}/${jobs.length}] Skipping ${job.id} (already uploaded)`);
      continue;
    }
    console.log(`[${index + 1}/${jobs.length}] Uploading ${job.id} (${(job.size / 1024).toFixed(1)} KiB)`);
    await uploadWithRetry(job, options);
    completed.push(job.id);
    completedSet.add(job.id);
    await writeFile(PROGRESS_PATH, JSON.stringify({ bucket: options.bucket, completed }, null, 2));
  }
}

await main();
