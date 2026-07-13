import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  buildRelations,
  filterPapers,
  normalizePaper,
  parseCSV,
  summarizePapers,
} from "../js/timeline-core.js";

test("parseCSV preserves quoted commas and Chinese text", () => {
  const rows = parseCSV('id,title,authors\r\nA1,"Paper, Part II","唐玉超, 李明"\r\n');
  assert.deepEqual(rows, [{ id: "A1", title: "Paper, Part II", authors: "唐玉超, 李明" }]);
});

test("normalizePaper converts numeric, boolean and parent fields", () => {
  const paper = normalizePaper({ year: "2025", importance: "7", representative: "true", parent_id: "A1| A2 " });
  assert.equal(paper.year, 2025);
  assert.equal(paper.importance, 5);
  assert.equal(paper.representative, true);
  assert.deepEqual(paper.parents, ["A1", "A2"]);
});

test("filterPapers combines direction, year, type, representative and search", () => {
  const papers = [
    normalizePaper({ id: "A1", year: "2024", title: "Banach splitting", authors: "Tang", direction: "vi", type: "algorithm", representative: "true" }),
    normalizePaper({ id: "A2", year: "2019", title: "Image restoration", authors: "Tang", direction: "imaging", type: "application", representative: "false" }),
  ];
  const result = filterPapers(papers, {
    directions: new Set(["vi"]),
    types: new Set(["algorithm"]),
    yearStart: 2020,
    yearEnd: 2026,
    representativeOnly: true,
    search: "banach",
  });
  assert.deepEqual(result.map((paper) => paper.id), ["A1"]);
});

test("buildRelations only returns links whose two endpoints exist", () => {
  const papers = [
    normalizePaper({ id: "A1", year: "2020", direction: "one" }),
    normalizePaper({ id: "A2", year: "2021", direction: "two", parent_id: "A1|missing" }),
  ];
  assert.deepEqual(buildRelations(papers), [{ source: "A1", target: "A2", crossDirection: true }]);
});

test("real dataset retains all papers and expected metadata", async () => {
  const csv = await readFile(new URL("../data/papers.csv", import.meta.url), "utf8");
  const papers = parseCSV(csv).map(normalizePaper);
  const summary = summarizePapers(papers);
  assert.equal(papers.length, 86);
  assert.equal(summary.minYear, 2006);
  assert.equal(summary.maxYear, 2026);
  assert.equal(summary.representativeCount, 27);
  assert.equal(summary.relations.length, 36);
  assert.equal(summary.directionCounts.get("imaging"), 23);
});
