import {
  alignViewportToPixel,
  annotateSameYearGroups,
  buildRelations,
  computeLaneHeights,
  exceedsDragThreshold,
  fitLaneScaleToHeight,
  filterPapers,
  getConnectedIds,
  horizontalEdgeOpacity,
  normalizePaper,
  paperNodeHitRadius,
  parseCSV,
  relationEdgeOpacity,
  summarizePapers,
  togglePaperSelection,
  zoomViewport2D,
} from "./timeline-core.js";

const NS = "http://www.w3.org/2000/svg";
const TYPE_LABELS = { theory: "理论", algorithm: "算法", extension: "扩展", application: "应用" };
const INNOVATION_LEVELS = [
  { id: "核心创新", tone: "core" },
  { id: "显著扩展", tone: "major" },
  { id: "增量改进", tone: "incremental" },
  { id: "应用迁移", tone: "application" },
  { id: "证据不足", tone: "uncertain" },
];
const STAGES = [
  { label: "早期探索", start: 2006, end: 2010 },
  { label: "方向拓展", start: 2011, end: 2015 },
  { label: "方法融合", start: 2016, end: 2020 },
  { label: "深化创新", start: 2021, end: 2026 },
];

const state = {
  papers: [],
  insights: {},
  directions: [],
  allRelations: [],
  selectedDirections: new Set(),
  selectedTypes: new Set(Object.keys(TYPE_LABELS)),
  selectedInnovations: new Set(INNOVATION_LEVELS.map((level) => level.id)),
  representativeOnly: false,
  search: "",
  yearStart: 2006,
  yearEnd: 2026,
  viewStart: 2005.5,
  viewEnd: 2026.5,
  verticalScale: 1,
  fullMin: 2006,
  fullMax: 2026,
  selectedId: null,
  selectionActive: false,
  showRelations: true,
  drag: null,
};

const elements = {};

document.addEventListener("DOMContentLoaded", init);

async function init() {
  cacheElements();
  bindStaticEvents();
  try {
    const [directionsResponse, papersResponse, insights, pdfManifest, markdownManifest] = await Promise.all([
      fetch("data/directions.json?v=20260713-relations"),
      fetch("data/papers.csv?v=20260713-relations"),
      fetch("data/paper-insights.json?v=20260713-grok45")
        .then((response) => response.ok ? response.json() : {})
        .catch(() => ({})),
      fetch("data/pdf-manifest.json?v=20260713-pdf1")
        .then((response) => response.ok ? response.json() : { available: [] })
        .catch(() => ({ available: [] })),
      fetch("data/markdown-manifest.json?v=20260713-md1")
        .then((response) => response.ok ? response.json() : { available: [] })
        .catch(() => ({ available: [] })),
    ]);
    if (!directionsResponse.ok || !papersResponse.ok) throw new Error("数据文件无法读取");
    state.directions = await directionsResponse.json();
    state.insights = insights || {};
    const pdfAvailableIds = new Set(pdfManifest?.available || []);
    const markdownAvailableIds = new Set(markdownManifest?.available || []);
    state.papers = parseCSV(await papersResponse.text())
      .map((paper) => normalizePaper({
        ...paper,
        innovationClass: state.insights[paper.id]?.innovation?.classification || "证据不足",
        pdfAvailable: pdfAvailableIds.has(paper.id),
        markdownAvailable: markdownAvailableIds.has(paper.id),
      }))
      .filter((paper) => paper.id && paper.year);
    state.allRelations = buildRelations(state.papers);
    state.selectedDirections = new Set(state.directions.map((direction) => direction.id));
    const summary = summarizePapers(state.papers);
    state.fullMin = summary.minYear;
    state.fullMax = summary.maxYear;
    state.yearStart = summary.minYear;
    state.yearEnd = summary.maxYear;
    state.viewStart = summary.minYear - 0.5;
    state.viewEnd = summary.maxYear + 0.5;
    configureYearControls(summary);
    buildFilterControls(summary);
    state.verticalScale = getFittedLaneScale(state.papers);
    alignDefaultViewport();
    render();
  } catch (error) {
    elements.timelineStatus.textContent = `数据加载失败：${error.message}`;
    elements.empty.hidden = false;
    elements.empty.querySelector("strong").textContent = "数据加载失败";
    elements.empty.querySelector("p").textContent = "请通过 HTTP 服务访问本站。";
  }
}

function cacheElements() {
  Object.assign(elements, {
    app: document.querySelector("#app"),
    workspace: document.querySelector(".workspace"),
    sidebar: document.querySelector("#sidebar"),
    detailPanel: document.querySelector("#detail-panel"),
    detailEmpty: document.querySelector("#detail-empty"),
    detailContent: document.querySelector("#detail-content"),
    scrim: document.querySelector("#scrim"),
    timeline: document.querySelector("#timeline"),
    timelineScroll: document.querySelector("#timeline-scroll"),
    canvasTools: document.querySelector(".canvas-tools"),
    timelineStatus: document.querySelector("#timeline-status"),
    empty: document.querySelector("#empty-state"),
    tooltip: document.querySelector("#tooltip"),
    search: document.querySelector("#search-input"),
    yearStart: document.querySelector("#year-start"),
    yearEnd: document.querySelector("#year-end"),
    yearStartLabel: document.querySelector("#year-start-label"),
    yearEndLabel: document.querySelector("#year-end-label"),
    directionList: document.querySelector("#direction-list"),
    typeList: document.querySelector("#type-list"),
    innovationList: document.querySelector("#innovation-list"),
    stageBand: document.querySelector("#stage-band"),
    stageCards: document.querySelector("#stage-cards"),
    summaryBody: document.querySelector("#summary-body"),
    densityStrip: document.querySelector("#density-strip"),
    viewportWindow: document.querySelector("#viewport-window"),
    exportButton: document.querySelector("#export-button"),
    exportMenu: document.querySelector("#export-menu"),
  });
}

function configureYearControls(summary) {
  [elements.yearStart, elements.yearEnd].forEach((input) => {
    input.min = summary.minYear;
    input.max = summary.maxYear;
  });
  elements.yearStart.value = summary.minYear;
  elements.yearEnd.value = summary.maxYear;
  document.querySelector("#density-min").textContent = summary.minYear;
  document.querySelector("#density-max").textContent = summary.maxYear;
}

function buildFilterControls(summary) {
  elements.directionList.innerHTML = state.directions.map((direction) => `
    <button class="direction-filter active" type="button" data-direction="${direction.id}" style="--direction-color:${direction.color}" aria-pressed="true">
      <i aria-hidden="true"></i><span>${escapeHTML(direction.label)}</span><b>${summary.directionCounts.get(direction.id) || 0}</b>
    </button>`).join("");
  elements.typeList.innerHTML = Object.entries(TYPE_LABELS).map(([id, label]) => `
    <button class="type-filter active" type="button" data-type="${id}" aria-pressed="true"><i class="shape ${id}" aria-hidden="true"></i>${label}</button>`).join("");
  const innovationCounts = new Map();
  state.papers.forEach((paper) => innovationCounts.set(paper.innovationClass, (innovationCounts.get(paper.innovationClass) || 0) + 1));
  elements.innovationList.innerHTML = INNOVATION_LEVELS.map((level) => `
    <button class="innovation-filter active ${level.tone}" type="button" data-innovation="${level.id}" aria-pressed="true">
      <i aria-hidden="true"></i><span>${level.id}</span><b>${innovationCounts.get(level.id) || 0}</b>
    </button>`).join("");
  elements.stageBand.innerHTML = STAGES.map((stage) => `<div class="stage-pill"><span><strong>${stage.label}</strong>${stage.start}–${stage.end}</span></div>`).join("");
  document.querySelector("#total-count").textContent = summary.total;
  document.querySelector("#sidebar-total").textContent = summary.total;
  document.querySelector("#all-count").textContent = summary.total;
  document.querySelector("#representative-count").textContent = summary.representativeCount;
  document.querySelector("#featured-count").textContent = summary.representativeCount;
  document.querySelector("#year-span").textContent = summary.maxYear - summary.minYear + 1;
  document.querySelector("#relation-count").textContent = summary.relations.length;
}

function bindStaticEvents() {
  elements.search.addEventListener("input", () => {
    state.search = elements.search.value;
    render();
  });
  elements.yearStart.addEventListener("input", updateYearRange);
  elements.yearEnd.addEventListener("input", updateYearRange);
  elements.directionList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-direction]");
    if (!button) return;
    const id = button.dataset.direction;
    state.selectedDirections.has(id) ? state.selectedDirections.delete(id) : state.selectedDirections.add(id);
    syncFilterButtons();
    render();
  });
  elements.typeList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-type]");
    if (!button) return;
    const id = button.dataset.type;
    state.selectedTypes.has(id) ? state.selectedTypes.delete(id) : state.selectedTypes.add(id);
    syncFilterButtons();
    render();
  });
  elements.innovationList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-innovation]");
    if (!button) return;
    const id = button.dataset.innovation;
    if (state.selectedInnovations.has(id) && state.selectedInnovations.size === 1) return;
    state.selectedInnovations.has(id) ? state.selectedInnovations.delete(id) : state.selectedInnovations.add(id);
    syncFilterButtons();
    render();
  });
  document.querySelector("#all-directions").addEventListener("click", () => {
    state.selectedDirections = new Set(state.directions.map((direction) => direction.id));
    syncFilterButtons();
    render();
  });
  document.querySelector("#clear-directions").addEventListener("click", () => {
    state.selectedDirections = new Set(state.directions.map((direction) => direction.id));
    syncFilterButtons();
    render();
  });
  document.querySelector("#clear-types").addEventListener("click", () => {
    state.selectedTypes = new Set(Object.keys(TYPE_LABELS));
    syncFilterButtons();
    render();
  });
  document.querySelector("#clear-innovations").addEventListener("click", () => {
    state.selectedInnovations = new Set(INNOVATION_LEVELS.map((level) => level.id));
    syncFilterButtons();
    render();
  });
  document.querySelector("#representative-only").addEventListener("click", () => {
    state.representativeOnly = !state.representativeOnly;
    syncFilterButtons();
    render();
  });
  document.querySelector("#reset-all").addEventListener("click", resetAll);
  document.querySelector("#fit-view").addEventListener("click", fitView);
  document.querySelector("#zoom-in").addEventListener("click", () => zoomAt(0.78, 0.5, 0.5));
  document.querySelector("#zoom-out").addEventListener("click", () => zoomAt(1.25, 0.5, 0.5));
  document.querySelector("#toggle-relations").addEventListener("click", toggleRelations);
  document.querySelector("#fullscreen").addEventListener("click", toggleFullscreen);
  document.querySelector("#close-detail").addEventListener("click", closeDetail);
  document.querySelector("#toggle-sidebar").addEventListener("click", () => openOverlay("sidebar"));
  document.querySelector("#close-sidebar").addEventListener("click", closeOverlays);
  elements.scrim.addEventListener("click", () => {
    if (elements.detailPanel.classList.contains("open")) closeDetail();
    else closeOverlays();
  });
  document.querySelector("#toggle-filter").addEventListener("click", () => {
    if (window.innerWidth <= 840) openOverlay("sidebar");
    else document.querySelector("#advanced-filters").scrollIntoView({ behavior: "smooth", block: "center" });
  });
  elements.exportButton.addEventListener("click", () => {
    const expanded = elements.exportButton.getAttribute("aria-expanded") === "true";
    elements.exportButton.setAttribute("aria-expanded", String(!expanded));
    elements.exportMenu.hidden = expanded;
  });
  document.querySelector("#export-svg").addEventListener("click", exportSVG);
  document.querySelector("#export-png").addEventListener("click", exportPNG);
  elements.timelineScroll.addEventListener("pointerdown", onPointerDown);
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp);
  window.addEventListener("pointercancel", onPointerUp);
  window.addEventListener("resize", debounce(render, 100));
  document.addEventListener("keydown", onKeydown);
  document.addEventListener("click", (event) => {
    if (!event.target.closest(".export-menu")) {
      elements.exportMenu.hidden = true;
      elements.exportButton.setAttribute("aria-expanded", "false");
    }
  });
  elements.densityStrip.addEventListener("click", onDensityClick);
}

function updateYearRange(event) {
  let start = Number(elements.yearStart.value);
  let end = Number(elements.yearEnd.value);
  if (start > end) {
    if (event.target === elements.yearStart) end = start;
    else start = end;
  }
  state.yearStart = start;
  state.yearEnd = end;
  elements.yearStart.value = start;
  elements.yearEnd.value = end;
  elements.yearStartLabel.value = start;
  elements.yearEndLabel.value = end;
  state.viewStart = start - 0.5;
  state.viewEnd = end + 0.5;
  render();
}

function syncFilterButtons() {
  elements.directionList.querySelectorAll("[data-direction]").forEach((button) => {
    const active = state.selectedDirections.has(button.dataset.direction);
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  elements.typeList.querySelectorAll("[data-type]").forEach((button) => {
    const active = state.selectedTypes.has(button.dataset.type);
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  elements.innovationList.querySelectorAll("[data-innovation]").forEach((button) => {
    const active = state.selectedInnovations.has(button.dataset.innovation);
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  const allActive = state.selectedDirections.size === state.directions.length;
  document.querySelector("#all-directions").classList.toggle("active", allActive && !state.representativeOnly);
  const representativeButton = document.querySelector("#representative-only");
  representativeButton.classList.toggle("active", state.representativeOnly);
  representativeButton.setAttribute("aria-pressed", String(state.representativeOnly));
}

function currentPapers() {
  return filterPapers(state.papers, {
    directions: state.selectedDirections,
    types: state.selectedTypes,
    innovations: state.selectedInnovations,
    representativeOnly: state.representativeOnly,
    search: state.search,
    yearStart: state.yearStart,
    yearEnd: state.yearEnd,
  });
}

function render() {
  if (!state.papers.length) return;
  const papers = currentPapers();
  if (state.selectedId && !papers.some((paper) => paper.id === state.selectedId)) closeDetail();
  document.querySelector("#result-count").textContent = papers.length;
  elements.timelineStatus.textContent = papers.length
    ? `${state.yearStart}–${state.yearEnd} · ${state.selectedDirections.size} 个方向 · 滚轮纵向滚动，缩放按钮调整视图，拖拽浏览`
    : "当前筛选条件下没有文献";
  elements.empty.hidden = papers.length > 0;
  drawTimeline(papers);
  renderDensity(papers);
  renderSummary(papers);
}

function drawTimeline(papers) {
  const width = Math.max(elements.timelineScroll.clientWidth, 760);
  const visibleDirections = state.directions.filter((direction) => state.selectedDirections.has(direction.id));
  const top = 34;
  const laneHeights = computeLaneHeights(visibleDirections, papers, state.verticalScale);
  const laneMetrics = new Map();
  let laneTop = top;
  visibleDirections.forEach((direction) => {
    const laneHeight = laneHeights.get(direction.id) || 72;
    laneMetrics.set(direction.id, { top: laneTop, height: laneHeight });
    laneTop += laneHeight;
  });
  const height = laneTop + 4;
  const margin = { left: width < 900 ? 128 : 150, right: 28 };
  const plotWidth = width - margin.left - margin.right;
  const x = (year) => margin.left + ((year - state.viewStart) / (state.viewEnd - state.viewStart)) * plotWidth;
  elements.timeline.setAttribute("viewBox", `0 0 ${width} ${height}`);
  elements.timeline.setAttribute("height", height);
  elements.timeline.innerHTML = "";
  addSvgDefinitions();

  visibleDirections.forEach((direction, laneIndex) => {
    const metric = laneMetrics.get(direction.id);
    const laneY = metric.top;
    const laneHeight = metric.height;
    const lanePapers = papers.filter((paper) => paper.direction === direction.id);
    elements.timeline.append(svg("rect", { x: 0, y: laneY, width, height: laneHeight, class: `lane-background ${laneIndex % 2 ? "alt" : ""}` }));
    elements.timeline.append(svg("line", { x1: 0, x2: width, y1: laneY + laneHeight, y2: laneY + laneHeight, class: "lane-divider" }));
    elements.timeline.append(svg("line", { x1: margin.left, x2: width - margin.right, y1: laneY + laneHeight / 2, y2: laneY + laneHeight / 2, class: "lane-center" }));
    const label = svg("text", { x: 16, y: laneY + 27, class: "lane-label", fill: direction.color });
    label.textContent = direction.label;
    const count = svg("text", { x: 16, y: laneY + 45, class: "lane-count" });
    count.textContent = `${lanePapers.length} 篇 · ${truncate(direction.description, width < 900 ? 11 : 16)}`;
    elements.timeline.append(label, count);
  });

  for (let year = Math.ceil(state.viewStart); year <= Math.floor(state.viewEnd); year += 1) {
    const yearX = x(year);
    if (yearX < margin.left || yearX > width - margin.right) continue;
    elements.timeline.append(svg("line", { x1: yearX, x2: yearX, y1: top - 5, y2: height, class: `year-line ${year % 5 === 0 ? "major" : ""}` }));
    const label = svg("text", { x: yearX, y: 20, class: "year-label", "text-anchor": "middle" });
    label.textContent = year;
    elements.timeline.append(label);
  }

  const positions = layoutNodes(papers, visibleDirections, x, laneMetrics);
  drawRelations(papers, positions, width, margin);
  const connected = getConnectedIds(state.allRelations, state.selectionActive ? state.selectedId : null);
  const cardIds = new Set(state.selectionActive && state.selectedId ? [state.selectedId] : []);
  positions.forEach((position, id) => drawPaperNode(position, papers.find((paper) => paper.id === id), width, margin, connected, cardIds.has(id)));
}

function addSvgDefinitions() {
  const defs = svg("defs");
  const marker = svg("marker", { id: "arrow", viewBox: "0 0 10 10", refX: 8, refY: 5, markerWidth: 5, markerHeight: 5, orient: "auto-start-reverse" });
  marker.append(svg("path", { d: "M 0 0 L 10 5 L 0 10 z", fill: "#8fa0b6" }));
  defs.append(marker);
  elements.timeline.append(defs);
}

function layoutNodes(papers, directions, x, laneMetrics) {
  const positions = new Map();
  const sameYearGroups = annotateSameYearGroups(papers);
  directions.forEach((direction) => {
    const metric = laneMetrics.get(direction.id);
    const byYear = new Map();
    papers.filter((paper) => paper.direction === direction.id)
      .sort((a, b) => a.year - b.year || b.importance - a.importance)
      .forEach((paper) => {
        const count = byYear.get(paper.year) || 0;
        byYear.set(paper.year, count + 1);
        const maxOffset = Math.max(18, metric.height / 2 - 15);
        const slots = [0, -24, 24, -42, 42].map((offset) => clamp(offset, -maxOffset, maxOffset));
        const center = metric.top + metric.height / 2;
        positions.set(paper.id, {
          x: x(paper.year + Math.min(count, 4) * 0.07),
          y: center + slots[count % slots.length],
          slot: count,
          groupSize: sameYearGroups.get(paper.id)?.size || 1,
          groupExtra: sameYearGroups.get(paper.id)?.extra || 0,
        });
      });
  });
  return positions;
}

function drawRelations(papers, positions, width, margin) {
  if (!state.showRelations) return;
  const visibleIds = new Set(papers.map((paper) => paper.id));
  state.allRelations.forEach((relation) => {
    if (!visibleIds.has(relation.source) || !visibleIds.has(relation.target)) return;
    const source = positions.get(relation.source);
    const target = positions.get(relation.target);
    if (!source || !target) return;
    const edgeOpacity = relationEdgeOpacity(source.x, target.x, margin.left, width - margin.right);
    if (edgeOpacity <= 0) return;
    const midX = (source.x + target.x) / 2;
    const related = state.selectionActive && (relation.source === state.selectedId || relation.target === state.selectedId);
    const dimmed = state.selectionActive && !related;
    elements.timeline.append(svg("path", {
      d: `M ${source.x} ${source.y} C ${midX} ${source.y}, ${midX} ${target.y}, ${target.x} ${target.y}`,
      class: `relation-path ${relation.crossDirection ? "cross" : ""} ${related ? "related" : ""} ${dimmed ? "dimmed" : ""}`,
      style: `--edge-opacity:${edgeOpacity}`,
    }));
  });
}

function drawPaperNode(position, paper, width, margin, connected, showCard) {
  if (!paper) return;
  const edgeOpacity = horizontalEdgeOpacity(position.x, margin.left, width - margin.right);
  if (edgeOpacity <= 0) return;
  const direction = state.directions.find((item) => item.id === paper.direction);
  const radius = 4 + paper.importance * 1.1;
  const group = svg("g", {
    class: `paper-node ${paper.id === state.selectedId ? "selected" : ""} ${state.selectionActive && !connected.has(paper.id) ? "dimmed" : ""}`,
    tabindex: 0,
    role: "button",
    "aria-label": `${paper.year} 年，${paper.title}`,
    style: `--edge-opacity:${edgeOpacity}`,
  });
  group.dataset.id = paper.id;
  group.append(svg("circle", {
    cx: position.x,
    cy: position.y,
    r: paperNodeHitRadius(radius),
    class: "node-hit-target",
    "aria-hidden": "true",
  }));
  group.append(svg("circle", { cx: position.x, cy: position.y, r: radius + 6, class: "selection-halo" }));
  if (paper.representative) group.append(svg("circle", { cx: position.x, cy: position.y, r: radius + 3.5, class: "representative-halo" }));
  group.append(createNodeShape(paper.type, position.x, position.y, radius, direction?.color || "#60748d"));

  if (showCard) group.append(createNodeCard(position, paper, radius, width));
  else if (position.groupExtra > 0 && position.slot === position.groupSize - 1) {
    const badge = svg("g", { class: "node-card" });
    const badgeTitle = svg("title");
    badgeTitle.textContent = `同一研究方向、同一年另有 ${position.groupExtra} 篇论文，所有节点均已显示`;
    badge.append(badgeTitle);
    badge.append(svg("circle", { cx: position.x + 14, cy: position.y, r: 9, class: "cluster-badge" }));
    const text = svg("text", { x: position.x + 14, y: position.y + 3, class: "cluster-text", "text-anchor": "middle" });
    text.textContent = `+${position.groupExtra}`;
    badge.append(text);
    group.append(badge);
  }
  group.addEventListener("pointerenter", (event) => showTooltip(event, paper, position.groupExtra));
  group.addEventListener("pointermove", moveTooltip);
  group.addEventListener("pointerleave", hideTooltip);
  group.addEventListener("focus", (event) => showTooltip(event, paper, position.groupExtra));
  group.addEventListener("blur", hideTooltip);
  group.addEventListener("click", (event) => {
    event.stopPropagation();
    selectPaper(paper.id);
  });
  group.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      selectPaper(paper.id);
    }
  });
  elements.timeline.append(group);
}

function createNodeShape(type, x, y, radius, color) {
  let shape;
  if (type === "theory") shape = svg("circle", { cx: x, cy: y, r: radius });
  else if (type === "extension") shape = svg("path", { d: `M ${x} ${y-radius} L ${x+radius} ${y} L ${x} ${y+radius} L ${x-radius} ${y} Z` });
  else if (type === "application") shape = svg("path", { d: `M ${x-radius} ${y} L ${x-radius/2} ${y-radius*.86} L ${x+radius/2} ${y-radius*.86} L ${x+radius} ${y} L ${x+radius/2} ${y+radius*.86} L ${x-radius/2} ${y+radius*.86} Z` });
  else shape = svg("rect", { x: x-radius, y: y-radius, width: radius*2, height: radius*2, rx: 1.5 });
  shape.setAttribute("fill", color);
  shape.setAttribute("stroke", darken(color));
  shape.setAttribute("class", "node-shape");
  return shape;
}

function createNodeCard(position, paper, radius, width) {
  const cardWidth = paper.importance >= 5 ? 174 : 154;
  const cardHeight = 34;
  const placeLeft = position.x + radius + 8 + cardWidth > width - 18;
  const cardX = placeLeft ? position.x - radius - 8 - cardWidth : position.x + radius + 8;
  const cardY = position.y - cardHeight / 2;
  const group = svg("g", { class: `node-card ${paper.representative ? "representative" : ""}` });
  group.append(svg("rect", { x: cardX, y: cardY, width: cardWidth, height: cardHeight, rx: 4, class: "node-card-bg" }));
  const title = svg("text", { x: cardX + 8, y: cardY + 13, class: "node-card-title" });
  title.textContent = truncate(paper.title, cardWidth > 160 ? 25 : 21);
  const meta = svg("text", { x: cardX + 8, y: cardY + 26, class: "node-card-meta" });
  meta.textContent = `${paper.year} · ${TYPE_LABELS[paper.type] || paper.type}${paper.representative ? " · 代表作" : ""}`;
  group.append(title, meta);
  return group;
}

function selectPaper(id) {
  const nextSelection = togglePaperSelection(state.selectedId, id);
  if (!nextSelection.open) {
    closeDetail();
    return;
  }
  state.selectedId = nextSelection.selectedId;
  state.selectionActive = true;
  const paper = state.papers.find((item) => item.id === id);
  if (!paper) return;
  renderDetail(paper);
  elements.workspace.classList.remove("detail-closed");
  elements.detailPanel.classList.add("open");
  if (window.innerWidth <= 1120) {
    elements.scrim.hidden = false;
    document.body.style.overflow = "hidden";
  }
  render();
}

function renderInsightList(items, emptyText = "暂无可核验信息") {
  const values = Array.isArray(items) ? items.filter(Boolean) : [];
  return values.length
    ? `<ul class="insight-list">${values.map((item) => `<li>${escapeHTML(item)}</li>`).join("")}</ul>`
    : `<p class="insight-empty">${emptyText}</p>`;
}

function renderInsightText(label, value) {
  if (!value) return "";
  return `<div class="insight-block"><h5>${label}</h5><p>${escapeHTML(value)}</p></div>`;
}

function renderInsightDetails(insight) {
  if (!insight?.innovation || !insight?.overview) {
    return `<section class="detail-section insight-unavailable"><h4>Grok 论文精读</h4><p>当前论文的结构化精读数据暂不可用，原始摘要与演化关系仍可正常查看。</p></section>`;
  }
  const { innovation, overview } = insight;
  const score = Math.max(1, Math.min(5, Number(innovation.score) || 1));
  const confidence = Math.round((Number(innovation.confidence) || 0) * 100);
  const sourceLabel = insight.source_mode === "fulltext" ? "全文精读" : "摘要判断";
  const sourceClass = insight.source_mode === "fulltext" ? "fulltext" : "abstract-only";
  const classTone = {
    "核心创新": "core",
    "显著扩展": "major",
    "增量改进": "incremental",
    "应用迁移": "application",
    "证据不足": "uncertain",
  }[innovation.classification] || "uncertain";
  const meter = Array.from({ length: 5 }, (_, index) => `<i class="${index < score ? "active" : ""}"></i>`).join("");

  return `
    <section class="innovation-card ${classTone}" aria-label="创新性判断">
      <div class="innovation-heading">
        <div><span class="eyebrow">GROK 4.5 · NOVELTY REVIEW</span><h4>创新性判断</h4></div>
        <span class="innovation-badge">${escapeHTML(innovation.classification || "证据不足")}</span>
      </div>
      <p class="innovation-verdict">${escapeHTML(innovation.verdict || overview.one_sentence_contribution || "暂无判断")}</p>
      <div class="innovation-metrics">
        <span class="source-badge ${sourceClass}">${sourceLabel}</span>
        <span class="innovation-score" aria-label="创新性评分 ${score} / 5">${meter}<b>${score}/5</b></span>
        <span>置信度 ${confidence}%</span>
      </div>
    </section>

    <details class="insight-details" open>
      <summary><span>创新从哪里来</span><small>继承、增量与核心创新</small></summary>
      <div class="insight-details-body">
        <div class="insight-grid">
          <section><h5>继承基础</h5>${renderInsightList(innovation.inherited_foundations)}</section>
          <section><h5>增量推进</h5>${renderInsightList(innovation.incremental_advances)}</section>
        </div>
        <section class="core-innovation-list"><h5>核心创新点</h5>${renderInsightList(innovation.core_innovations)}</section>
        <section><h5>实现与实验变化</h5>${renderInsightList(innovation.implementation_or_experimental_changes)}</section>
        <aside class="evidence-note"><b>证据边界</b><p>${escapeHTML(innovation.evidence_boundary || "未提供证据边界说明")}</p></aside>
      </div>
    </details>

    <details class="insight-details">
      <summary><span>论文精读</span><small>问题、方法与主要结论</small></summary>
      <div class="insight-details-body">
        <p class="insight-callout">${escapeHTML(overview.one_sentence_contribution || "暂无一句话贡献")}</p>
        ${renderInsightText("研究问题", overview.research_problem)}
        ${renderInsightText("核心方法", overview.core_method)}
        <section><h5>主要发现</h5>${renderInsightList(overview.main_findings)}</section>
      </div>
    </details>

    <details class="insight-details">
      <summary><span>理论、实验与边界</span><small>保证、验证与局限</small></summary>
      <div class="insight-details-body">
        ${renderInsightText("理论保证", overview.theoretical_guarantee)}
        ${renderInsightText("实验或算例", overview.experiments_or_examples)}
        ${renderInsightText("局限性", overview.limitations)}
      </div>
    </details>

    <details class="insight-details">
      <summary><span>研究脉络</span><small>前序基础与谱系位置</small></summary>
      <div class="insight-details-body">
        ${renderInsightText("谱系位置", insight.lineage_position)}
        <section><h5>比较依据</h5>${renderInsightList(innovation.comparison_basis)}</section>
      </div>
    </details>`;
}

function renderDetail(paper) {
  const direction = state.directions.find((item) => item.id === paper.direction);
  const insight = state.insights[paper.id];
  const incoming = paper.parents.map((id) => state.papers.find((item) => item.id === id)).filter(Boolean);
  const outgoing = state.papers.filter((item) => item.parents.includes(paper.id));
  const relations = [
    ...incoming.map((item) => ({ paper: item, icon: "subdirectory_arrow_left", label: "继承自" })),
    ...outgoing.map((item) => ({ paper: item, icon: "subdirectory_arrow_right", label: "延伸至" })),
  ];
  const doiUrl = paper.doi ? `https://doi.org/${encodeURIComponent(paper.doi)}` : "";
  const pdfUrl = paper.pdfAvailable ? `/api/papers/${paper.id}/pdf` : "";
  const markdownUrl = paper.markdownAvailable ? `/api/papers/${paper.id}/md` : "";
  const contextUrl = paper.markdownAvailable ? `/api/papers/${paper.id}/context` : "";
  elements.detailEmpty.hidden = true;
  elements.detailContent.hidden = false;
  elements.detailContent.innerHTML = `
    <div class="detail-tags">
      <span class="detail-tag" style="color:${direction?.color || "#5b6d83"}">${escapeHTML(direction?.label || paper.direction)}</span>
      <span class="detail-tag">${paper.year}</span>
      <span class="detail-tag">${TYPE_LABELS[paper.type] || escapeHTML(paper.type)}</span>
      ${paper.representative ? '<span class="detail-tag representative">代表作</span>' : ""}
    </div>
    <h3>${escapeHTML(paper.title)}</h3>
    <dl class="detail-meta">
      <dt>作者</dt><dd>${escapeHTML(paper.authors || "—")}</dd>
      <dt>期刊</dt><dd>${escapeHTML(paper.journal || "—")}</dd>
      <dt>DOI</dt><dd>${doiUrl ? `<a href="${doiUrl}" target="_blank" rel="noopener">${escapeHTML(paper.doi)}</a>` : "—"}</dd>
    </dl>
    ${renderInsightDetails(insight)}
    <section class="detail-section"><h4>内容摘要</h4><p>${escapeHTML(paper.summary || "暂无摘要")}</p></section>
    <section class="detail-section"><h4>关键词</h4><div class="keyword-list">${(paper.keywords || "暂无关键词").split(/[,，]/).map((keyword) => `<span>${escapeHTML(keyword.trim())}</span>`).join("")}</div></section>
    <section class="detail-section"><h4>演化关系 · ${relations.length}</h4><div class="relation-list">${relations.length ? relations.map((relation) => `
      <button class="relation-item" type="button" data-paper-id="${relation.paper.id}">
        <span class="material-symbols-rounded" aria-hidden="true">${relation.icon}</span><span><b>${relation.label}</b> · ${relation.paper.year}<br>${escapeHTML(relation.paper.title)}</span>
      </button>`).join("") : "<p>当前数据中未标注直接关联论文。</p>"}</div></section>
    <div class="detail-actions ${pdfUrl ? "has-pdf" : ""}">
      ${pdfUrl ? `<a class="primary-link full-width" href="${pdfUrl}" target="_blank" rel="noopener"><span class="material-symbols-rounded">menu_book</span>阅读 PDF</a>` : ""}
      ${markdownUrl ? `<a class="secondary-link" href="${markdownUrl}" target="_blank" rel="noopener"><span class="material-symbols-rounded">article</span>查看 MD</a>` : ""}
      ${contextUrl ? `<button class="secondary-link context-copy-action" type="button" data-context-url="${contextUrl}"><span class="material-symbols-rounded">smart_toy</span>复制 AI 上下文</button>` : ""}
      ${doiUrl ? `<a class="${pdfUrl ? "secondary-link" : "primary-link"}" href="${doiUrl}" target="_blank" rel="noopener"><span class="material-symbols-rounded">open_in_new</span>访问论文 DOI</a>` : `<span class="${pdfUrl ? "secondary-link" : "primary-link"}" aria-disabled="true">暂无 DOI 链接</span>`}
      <a class="secondary-action" href="data/papers.csv" download title="下载数据"><span class="material-symbols-rounded">bookmark_add</span></a>
    </div>`;
  elements.detailContent.querySelectorAll("[data-paper-id]").forEach((button) => button.addEventListener("click", () => selectPaper(button.dataset.paperId)));
  elements.detailContent.querySelectorAll("[data-context-url]").forEach((button) => button.addEventListener("click", () => copyMarkdownContext(button, paper)));
}

async function copyMarkdownContext(button, paper) {
  const originalHTML = button.innerHTML;
  try {
    button.disabled = true;
    button.innerHTML = '<span class="material-symbols-rounded">hourglass_top</span>读取中';
    const response = await fetch(button.dataset.contextUrl);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    const markdown = payload.markdown?.content || "";
    const prompt = [
      `论文编号：${paper.id}`,
      `标题：${paper.title}`,
      `年份：${paper.year}`,
      `作者：${paper.authors || "未记录"}`,
      `期刊：${paper.journal || "未记录"}`,
      `DOI：${paper.doi || "未记录"}`,
      "",
      "请基于下面的 MinerU Markdown 原文，回答该论文的研究问题、方法、创新性、相对前序工作的增量或核心创新，并明确证据边界。",
      "",
      markdown,
    ].join("\n");
    await navigator.clipboard.writeText(prompt);
    button.innerHTML = '<span class="material-symbols-rounded">done</span>已复制';
    window.setTimeout(() => { button.innerHTML = originalHTML; button.disabled = false; }, 1400);
  } catch (error) {
    button.innerHTML = '<span class="material-symbols-rounded">error</span>复制失败';
    window.setTimeout(() => { button.innerHTML = originalHTML; button.disabled = false; }, 1800);
  }
}

function closeDetail() {
  state.selectedId = null;
  state.selectionActive = false;
  elements.detailPanel.classList.remove("open");
  elements.workspace.classList.add("detail-closed");
  elements.detailContent.hidden = true;
  elements.detailEmpty.hidden = false;
  closeOverlays();
  if (state.papers.length) render();
}

function renderDensity(papers) {
  const counts = new Map();
  papers.forEach((paper) => counts.set(paper.year, (counts.get(paper.year) || 0) + 1));
  const peak = Math.max(1, ...counts.values());
  elements.densityStrip.innerHTML = Array.from({ length: state.fullMax - state.fullMin + 1 }, (_, index) => {
    const year = state.fullMin + index;
    const count = counts.get(year) || 0;
    return `<i title="${year} 年：${count} 篇" style="height:${Math.max(2, count / peak * 22)}px"></i>`;
  }).join("");
  const leftInset = 66;
  const rightInset = 66;
  const usableWidth = Math.max(20, elements.densityStrip.parentElement.clientWidth - leftInset - rightInset);
  const fullSpan = Math.max(1, state.fullMax - state.fullMin);
  const left = clamp((state.viewStart - state.fullMin) / fullSpan, 0, 1);
  const right = clamp((state.viewEnd - state.fullMin) / fullSpan, 0, 1);
  elements.viewportWindow.style.left = `${leftInset + left * usableWidth}px`;
  elements.viewportWindow.style.width = `${Math.max(12, (right - left) * usableWidth)}px`;
}

function renderSummary(papers) {
  const summary = summarizePapers(papers);
  const activeStages = STAGES.map((stage) => ({
    ...stage,
    count: papers.filter((paper) => paper.year >= stage.start && paper.year <= stage.end).length,
  }));
  const busiest = [...activeStages].sort((a, b) => b.count - a.count)[0];
  const activeDirections = summary.directionCounts.size;
  elements.stageCards.innerHTML = `
    <div class="stage-card"><span>成果跨度</span><strong>${summary.minYear ?? "—"}–${summary.maxYear ?? "—"}</strong><p>${summary.total ? `${summary.maxYear - summary.minYear + 1} 个自然年份` : "当前无结果"}</p></div>
    <div class="stage-card"><span>当前成果</span><strong>${summary.total}</strong><p>来自 ${activeDirections} 个研究方向</p></div>
    <div class="stage-card"><span>代表性成果</span><strong>${summary.representativeCount}</strong><p>由真实数据中的代表作标记确定</p></div>
    <div class="stage-card"><span>高产阶段</span><strong>${busiest?.count || 0}</strong><p>${busiest?.label || "—"} · ${busiest?.start || "—"}–${busiest?.end || "—"}</p></div>`;

  const visibleIds = new Set(papers.map((paper) => paper.id));
  elements.summaryBody.innerHTML = state.directions.filter((direction) => state.selectedDirections.has(direction.id)).map((direction) => {
    const directionPapers = papers.filter((paper) => paper.direction === direction.id);
    if (!directionPapers.length) return "";
    const years = directionPapers.map((paper) => paper.year);
    const representative = [...directionPapers].sort((a, b) => Number(b.representative) - Number(a.representative) || b.importance - a.importance)[0];
    const relationCount = state.allRelations.filter((relation) => visibleIds.has(relation.source) && visibleIds.has(relation.target) && (directionPapers.some((paper) => paper.id === relation.source) || directionPapers.some((paper) => paper.id === relation.target))).length;
    return `<tr><td><span class="summary-direction"><i style="background:${direction.color}"></i>${escapeHTML(direction.label)}</span></td><td>${Math.min(...years)}–${Math.max(...years)}</td><td>${directionPapers.length}</td><td>${escapeHTML(truncate(representative.title, 34))}</td><td>${relationCount}</td></tr>`;
  }).join("") || '<tr><td colspan="5">当前筛选条件下没有可汇总的数据。</td></tr>';
}

function showTooltip(event, paper, groupExtra = 0) {
  const groupNote = groupExtra > 0 ? ` · 同年同方向另有 ${groupExtra} 篇（均已显示）` : "";
  elements.tooltip.innerHTML = `<strong>${escapeHTML(paper.title)}</strong><span>${paper.year} · ${escapeHTML(paper.journal || "期刊未标注")} · ${TYPE_LABELS[paper.type] || paper.type}${groupNote}</span>`;
  elements.tooltip.hidden = false;
  moveTooltip(event);
}

function moveTooltip(event) {
  if (!event.clientX || elements.tooltip.hidden) return;
  const padding = 12;
  const box = elements.tooltip.getBoundingClientRect();
  let left = event.clientX + 14;
  let top = event.clientY + 14;
  if (left + box.width > window.innerWidth - padding) left = event.clientX - box.width - 14;
  if (top + box.height > window.innerHeight - padding) top = event.clientY - box.height - 14;
  elements.tooltip.style.left = `${Math.max(padding, left)}px`;
  elements.tooltip.style.top = `${Math.max(padding, top)}px`;
}

function hideTooltip() { elements.tooltip.hidden = true; }

function zoomAt(factor, horizontalRatio, verticalRatio) {
  const oldScale = state.verticalScale;
  const anchorY = verticalRatio * elements.timelineScroll.clientHeight;
  const contentAnchorY = elements.timelineScroll.scrollTop + anchorY;
  const nextViewport = zoomViewport2D(state, factor, horizontalRatio);
  state.viewStart = nextViewport.viewStart;
  state.viewEnd = nextViewport.viewEnd;
  state.verticalScale = nextViewport.verticalScale;
  render();
  const scaleRatio = state.verticalScale / oldScale;
  elements.timelineScroll.scrollTop = Math.max(0, contentAnchorY * scaleRatio - anchorY);
}

function onPointerDown(event) {
  if (event.target.closest(".paper-node") || event.target.closest(".canvas-tools")) return;
  state.drag = {
    pointerId: event.pointerId,
    active: false,
    x: event.clientX,
    y: event.clientY,
    start: state.viewStart,
    end: state.viewEnd,
    scrollTop: elements.timelineScroll.scrollTop,
  };
  elements.timelineScroll.setPointerCapture?.(event.pointerId);
}

function onPointerMove(event) {
  if (!state.drag || event.pointerId !== state.drag.pointerId) return;
  if (!state.drag.active) {
    if (!exceedsDragThreshold(state.drag.x, state.drag.y, event.clientX, event.clientY)) return;
    state.drag.active = true;
    elements.timelineScroll.classList.add("dragging");
  }
  const horizontalDelta = (event.clientX - state.drag.x) / elements.timelineScroll.clientWidth * (state.drag.end - state.drag.start);
  const verticalDelta = event.clientY - state.drag.y;
  state.viewStart = state.drag.start - horizontalDelta;
  state.viewEnd = state.viewStart + (state.drag.end - state.drag.start);
  render();
  elements.timelineScroll.scrollTop = Math.max(0, state.drag.scrollTop - verticalDelta);
}

function onPointerUp(event) {
  if (!state.drag || (event?.pointerId != null && event.pointerId !== state.drag.pointerId)) return;
  elements.timelineScroll.releasePointerCapture?.(state.drag.pointerId);
  state.drag = null;
  elements.timelineScroll.classList.remove("dragging");
}

function onDensityClick(event) {
  const rect = elements.densityStrip.getBoundingClientRect();
  const ratio = clamp((event.clientX - rect.left) / rect.width, 0, 1);
  const center = state.fullMin + ratio * (state.fullMax - state.fullMin);
  const span = state.viewEnd - state.viewStart;
  state.viewStart = center - span / 2;
  state.viewEnd = center + span / 2;
  render();
}

function fitView() {
  state.viewStart = state.yearStart - 0.5;
  state.viewEnd = state.yearEnd + 0.5;
  state.verticalScale = getFittedLaneScale(currentPapers());
  render();
  elements.timelineScroll.scrollTop = 0;
}

function alignDefaultViewport() {
  const width = Math.max(elements.timelineScroll.clientWidth, 760);
  const marginLeft = width < 900 ? 128 : 150;
  const marginRight = 28;
  const span = state.yearEnd - state.yearStart + 1;
  const targetX = elements.canvasTools.offsetLeft || width - 16 - elements.canvasTools.offsetWidth;
  const viewport = alignViewportToPixel({
    targetYear: state.fullMax,
    span,
    width,
    targetX,
    marginLeft,
    marginRight,
  });
  state.viewStart = viewport.viewStart;
  state.viewEnd = viewport.viewEnd;
}

function getFittedLaneScale(papers) {
  const visibleDirections = state.directions.filter((direction) => state.selectedDirections.has(direction.id));
  return fitLaneScaleToHeight(visibleDirections, papers, elements.timelineScroll.clientHeight || 548);
}

function toggleRelations() {
  state.showRelations = !state.showRelations;
  const button = document.querySelector("#toggle-relations");
  button.classList.toggle("active", state.showRelations);
  button.setAttribute("aria-pressed", String(state.showRelations));
  render();
}

async function toggleFullscreen() {
  const shell = document.querySelector(".timeline-shell");
  if (!document.fullscreenElement) await shell.requestFullscreen?.();
  else await document.exitFullscreen?.();
}

function resetAll() {
  state.selectedDirections = new Set(state.directions.map((direction) => direction.id));
  state.selectedTypes = new Set(Object.keys(TYPE_LABELS));
  state.selectedInnovations = new Set(INNOVATION_LEVELS.map((level) => level.id));
  state.representativeOnly = false;
  state.search = "";
  state.yearStart = state.fullMin;
  state.yearEnd = state.fullMax;
  state.verticalScale = getFittedLaneScale(currentPapers());
  state.showRelations = true;
  elements.search.value = "";
  elements.yearStart.value = state.fullMin;
  elements.yearEnd.value = state.fullMax;
  elements.yearStartLabel.value = state.fullMin;
  elements.yearEndLabel.value = state.fullMax;
  document.querySelector("#toggle-relations").classList.add("active");
  closeDetail();
  alignDefaultViewport();
  syncFilterButtons();
  render();
}

function openOverlay(target) {
  closeOverlays();
  elements[target].classList.add("open");
  elements.scrim.hidden = false;
  document.body.style.overflow = "hidden";
}

function closeOverlays() {
  elements.sidebar.classList.remove("open");
  if (window.innerWidth <= 1120 && !state.selectedId) elements.detailPanel.classList.remove("open");
  elements.scrim.hidden = true;
  document.body.style.overflow = "";
}

function onKeydown(event) {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    elements.search.focus();
  }
  if (event.key === "Escape") {
    elements.exportMenu.hidden = true;
    closeDetail();
    closeOverlays();
  }
}

function serializedSVG() {
  const clone = elements.timeline.cloneNode(true);
  clone.setAttribute("xmlns", NS);
  clone.querySelectorAll("[tabindex]").forEach((node) => node.removeAttribute("tabindex"));
  const style = document.createElementNS(NS, "style");
  style.textContent = [...document.styleSheets].flatMap((sheet) => {
    try { return [...sheet.cssRules].map((rule) => rule.cssText); } catch { return []; }
  }).join("\n");
  clone.insertBefore(style, clone.firstChild);
  return new XMLSerializer().serializeToString(clone);
}

function exportSVG() {
  download(new Blob([serializedSVG()], { type: "image/svg+xml;charset=utf-8" }), "tang-research-timeline.svg");
  elements.exportMenu.hidden = true;
}

function exportPNG() {
  const source = new Blob([serializedSVG()], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(source);
  const image = new Image();
  image.onload = () => {
    const box = elements.timeline.viewBox.baseVal;
    const scale = 2;
    const canvas = document.createElement("canvas");
    canvas.width = box.width * scale;
    canvas.height = box.height * scale;
    const context = canvas.getContext("2d");
    context.fillStyle = "#fbfcfe";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.scale(scale, scale);
    context.drawImage(image, 0, 0);
    URL.revokeObjectURL(url);
    canvas.toBlob((blob) => download(blob, "tang-research-timeline.png"), "image/png");
  };
  image.src = url;
  elements.exportMenu.hidden = true;
}

function download(blob, filename) {
  const anchor = document.createElement("a");
  anchor.href = URL.createObjectURL(blob);
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(anchor.href), 1000);
}

function svg(name, attributes = {}) {
  const element = document.createElementNS(NS, name);
  Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, value));
  return element;
}

function darken(hex) {
  const value = Number.parseInt(hex.slice(1), 16);
  const red = Math.max(0, (value >> 16) - 28);
  const green = Math.max(0, ((value >> 8) & 255) - 28);
  const blue = Math.max(0, (value & 255) - 28);
  return `rgb(${red},${green},${blue})`;
}

function escapeHTML(value = "") {
  return String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character]));
}

function truncate(value = "", limit = 24) { return value.length > limit ? `${value.slice(0, limit - 1)}…` : value; }
function clamp(value, minimum, maximum) { return Math.max(minimum, Math.min(maximum, value)); }
function debounce(callback, delay) { let timeout; return (...args) => { clearTimeout(timeout); timeout = setTimeout(() => callback(...args), delay); }; }
