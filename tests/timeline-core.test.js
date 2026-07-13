import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  alignViewportToPixel,
  annotateSameYearGroups,
  buildRelations,
  computeLaneHeights,
  exceedsDragThreshold,
  fitLaneScaleToHeight,
  filterPapers,
  horizontalEdgeOpacity,
  normalizePaper,
  paperNodeHitRadius,
  parseCSV,
  relationEdgeOpacity,
  summarizePapers,
  togglePaperSelection,
  zoomViewport2D,
} from "../js/timeline-core.js";

test("alignViewportToPixel preserves span and places the target year at the requested pixel", () => {
  const viewport = alignViewportToPixel({
    targetYear: 2026,
    span: 21,
    width: 1592,
    targetX: 1360,
    marginLeft: 150,
    marginRight: 28,
  });
  const plotWidth = 1592 - 150 - 28;
  const mappedX = 150 + ((2026 - viewport.viewStart) / (viewport.viewEnd - viewport.viewStart)) * plotWidth;

  assert.equal(viewport.viewEnd - viewport.viewStart, 21);
  assert.ok(Math.abs(mappedX - 1360) < 0.001);
});

test("initial HTML keeps the literature detail panel closed", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  assert.match(html, /class="workspace detail-closed"/);
});

test("paper details load and expose Grok innovation insights", async () => {
  const script = await readFile(new URL("../js/timeline.js", import.meta.url), "utf8");
  assert.match(script, /data\/paper-insights\.json/);
  assert.match(script, /创新性判断/);
  assert.match(script, /证据边界/);
});

test("paper details load the PDF manifest and expose the same-origin reader endpoint", async () => {
  const script = await readFile(new URL("../js/timeline.js", import.meta.url), "utf8");
  const manifest = JSON.parse(await readFile(new URL("../data/pdf-manifest.json", import.meta.url), "utf8"));
  assert.match(script, /data\/pdf-manifest\.json/);
  assert.match(script, /\/api\/papers\/\$\{paper\.id\}\/pdf/);
  assert.match(script, /阅读 PDF/);
  assert.equal(manifest.available.length, 81);
  assert.deepEqual(manifest.missing, ["A3", "A12", "A26", "A37", "A43"]);
});

test("paper details load the Markdown manifest and expose AI context access", async () => {
  const script = await readFile(new URL("../js/timeline.js", import.meta.url), "utf8");
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  const manifest = JSON.parse(await readFile(new URL("../data/markdown-manifest.json", import.meta.url), "utf8"));
  assert.match(script, /data\/markdown-manifest\.json/);
  assert.match(script, /\/api\/papers\/\$\{paper\.id\}\/md/);
  assert.match(script, /\/api\/papers\/\$\{paper\.id\}\/chat/);
  assert.match(script, /sendPaperChatMessage/);
  assert.doesNotMatch(script, /copyMarkdownContext/);
  assert.doesNotMatch(script, /download title="下载数据"/);
  assert.doesNotMatch(html, /href="data\/papers\.csv" download/);
  assert.equal(manifest.available.length, 81);
  assert.deepEqual(manifest.missing, ["A3", "A12", "A26", "A37", "A43"]);
});

test("sidebar exposes innovation filters and timeline explains same-year badges", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  const script = await readFile(new URL("../js/timeline.js", import.meta.url), "utf8");
  assert.match(html, /id="innovation-list"/);
  assert.match(html, /同年同方向/);
  assert.match(script, /selectedInnovations/);
  assert.match(script, /annotateSameYearGroups/);
});

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

test("filterPapers combines Grok innovation classifications with existing filters", () => {
  const papers = [
    normalizePaper({ id: "A1", year: "2024", direction: "vi", type: "algorithm", innovationClass: "核心创新" }),
    normalizePaper({ id: "A2", year: "2024", direction: "vi", type: "algorithm", innovationClass: "增量改进" }),
  ];
  const result = filterPapers(papers, { innovations: new Set(["核心创新"]) });
  assert.deepEqual(result.map((paper) => paper.id), ["A1"]);
});

test("annotateSameYearGroups reports additional papers instead of slot ordinals", () => {
  const papers = [
    { id: "A1", year: 2024, direction: "vi" },
    { id: "A2", year: 2024, direction: "vi" },
    { id: "A3", year: 2024, direction: "vi" },
    { id: "A4", year: 2025, direction: "vi" },
  ];
  const grouped = annotateSameYearGroups(papers);
  assert.deepEqual(grouped.get("A1"), { index: 0, size: 3, extra: 2 });
  assert.deepEqual(grouped.get("A2"), { index: 1, size: 3, extra: 2 });
  assert.deepEqual(grouped.get("A4"), { index: 0, size: 1, extra: 0 });
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
  assert.equal(summary.relations.length, 50);
  assert.equal(summary.directionCounts.get("imaging"), 15);
});

test("real dataset has valid taxonomy and chronologically sound relations", async () => {
  const csv = await readFile(new URL("../data/papers.csv", import.meta.url), "utf8");
  const directions = JSON.parse(await readFile(new URL("../data/directions.json", import.meta.url), "utf8"));
  const papers = parseCSV(csv).map(normalizePaper);
  const byId = new Map(papers.map((paper) => [paper.id, paper]));
  const directionIds = new Set(directions.map((direction) => direction.id));
  const acceptedTypes = new Set(["theory", "algorithm", "extension", "application"]);
  const ids = papers.map((paper) => paper.id);
  const edges = [];

  assert.equal(new Set(ids).size, ids.length, "paper IDs must be unique");
  papers.forEach((paper) => {
    assert.ok(directionIds.has(paper.direction), `${paper.id} has an unknown direction`);
    assert.ok(acceptedTypes.has(paper.type), `${paper.id} has an unknown type`);
    assert.equal(new Set(paper.parents).size, paper.parents.length, `${paper.id} repeats a parent`);
    paper.parents.forEach((parentId) => {
      const parent = byId.get(parentId);
      assert.ok(parent, `${paper.id} references missing parent ${parentId}`);
      assert.notEqual(parentId, paper.id, `${paper.id} cannot reference itself`);
      assert.ok(parent.year <= paper.year, `${parentId} (${parent.year}) cannot follow ${paper.id} (${paper.year})`);
      edges.push(`${parentId}->${paper.id}`);
    });
  });
  assert.equal(new Set(edges).size, edges.length, "relations must be unique");
});

test("real dataset places papers by primary contribution and keeps curated research chains", async () => {
  const csv = await readFile(new URL("../data/papers.csv", import.meta.url), "utf8");
  const papers = parseCSV(csv).map(normalizePaper);
  const byId = new Map(papers.map((paper) => [paper.id, paper]));
  const relations = new Set(buildRelations(papers).map(({ source, target }) => `${source}->${target}`));
  const expectedDirections = {
    A5: "monotone-vi",
    A14: "intelligent-systems",
    A20: "monotone-vi",
    A31: "monotone-vi",
    A33: "fixed-point",
    A37: "primal-dual",
    A62: "fixed-point",
    A82: "fixed-point",
    A86: "fixed-point",
    A87: "fixed-point",
  };

  Object.entries(expectedDirections).forEach(([id, direction]) => {
    assert.equal(byId.get(id)?.direction, direction, `${id} must follow its primary contribution`);
  });

  ["A3->A11", "A52->A54", "A61->A67", "A77->A74", "A75->A69"].forEach((edge) => {
    assert.equal(relations.has(edge), false, `${edge} is reversed or unsupported`);
  });
  ["A11->A3", "A67->A61", "A50->A45", "A28->A20", "A28->A17", "A23->A13"].forEach((edge) => {
    assert.equal(relations.has(edge), true, `${edge} is a curated research-family relation`);
  });
});

test("computeLaneHeights keeps sparse directions tighter than dense directions", () => {
  const directions = [{ id: "dense" }, { id: "sparse" }];
  const papers = [
    ...Array.from({ length: 23 }, (_, index) => ({ id: `D${index}`, direction: "dense" })),
    ...Array.from({ length: 3 }, (_, index) => ({ id: `S${index}`, direction: "sparse" })),
  ];
  const heights = computeLaneHeights(directions, papers, 1);
  assert.ok(heights.get("dense") >= 130);
  assert.ok(heights.get("sparse") <= 80);
  assert.ok(heights.get("dense") > heights.get("sparse"));
});

test("fitLaneScaleToHeight fits all six lanes into the available canvas height", () => {
  const directions = ["a", "b", "c", "d", "e", "f"].map((id) => ({ id }));
  const counts = [23, 18, 15, 12, 9, 8];
  const papers = directions.flatMap((direction, directionIndex) =>
    Array.from({ length: counts[directionIndex] }, (_, index) => ({
      id: `${direction.id}${index}`,
      direction: direction.id,
    })),
  );
  const availableHeight = 520;
  const scale = fitLaneScaleToHeight(directions, papers, availableHeight);
  const totalHeight = 38 + [...computeLaneHeights(directions, papers, scale).values()]
    .reduce((sum, height) => sum + height, 0);

  assert.ok(scale >= 0.65 && scale <= 1);
  assert.ok(totalHeight <= availableHeight);
});

test("zoomViewport2D zooms the year span and vertical scale together", () => {
  const zoomed = zoomViewport2D({ viewStart: 2005, viewEnd: 2027, verticalScale: 1 }, 0.8, 0.5);
  assert.equal(Number((zoomed.viewEnd - zoomed.viewStart).toFixed(1)), 17.6);
  assert.equal(zoomed.verticalScale, 1.25);
  assert.equal((zoomed.viewStart + zoomed.viewEnd) / 2, 2016);
});

test("togglePaperSelection closes when the same paper is selected again", () => {
  assert.deepEqual(togglePaperSelection("A1", "A1"), { selectedId: null, open: false });
  assert.deepEqual(togglePaperSelection("A1", "A2"), { selectedId: "A2", open: true });
});

test("paperNodeHitRadius gives every paper a stable click target", () => {
  assert.equal(paperNodeHitRadius(5.1), 14);
  assert.equal(paperNodeHitRadius(9.5), 15.5);
});

test("exceedsDragThreshold ignores pointer jitter until movement reaches five pixels", () => {
  assert.equal(exceedsDragThreshold(100, 100, 104, 100), false);
  assert.equal(exceedsDragThreshold(100, 100, 103, 104), true);
  assert.equal(exceedsDragThreshold(100, 100, 120, 120), true);
});

test("horizontalEdgeOpacity fades nodes across the shared plot boundary", () => {
  assert.equal(horizontalEdgeOpacity(200, 150, 900, 20), 1);
  assert.equal(horizontalEdgeOpacity(140, 150, 900, 20), 0.5);
  assert.equal(horizontalEdgeOpacity(130, 150, 900, 20), 0);
  assert.equal(horizontalEdgeOpacity(910, 150, 900, 20), 0.5);
  assert.equal(horizontalEdgeOpacity(920, 150, 900, 20), 0);
});

test("relationEdgeOpacity follows the less visible endpoint", () => {
  assert.equal(relationEdgeOpacity(140, 200, 150, 900, 20), 0.5);
  assert.equal(relationEdgeOpacity(130, 200, 150, 900, 20), 0);
  assert.equal(relationEdgeOpacity(200, 300, 150, 900, 20), 1);
});
