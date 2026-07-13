import {
  buildRelations,
  filterPapers,
  getConnectedIds,
  normalizePaper,
  parseCSV,
  summarizePapers,
} from "./timeline-core.js";

const NS = "http://www.w3.org/2000/svg";
const TYPE_LABELS = { theory: "理论", algorithm: "算法", extension: "扩展", application: "应用" };
const STAGES = [
  { label: "早期探索", start: 2006, end: 2010 },
  { label: "方向拓展", start: 2011, end: 2015 },
  { label: "方法融合", start: 2016, end: 2020 },
  { label: "深化创新", start: 2021, end: 2026 },
];

const state = {
  papers: [],
  directions: [],
  allRelations: [],
  selectedDirections: new Set(),
  selectedTypes: new Set(Object.keys(TYPE_LABELS)),
  representativeOnly: false,
  search: "",
  yearStart: 2006,
  yearEnd: 2026,
  viewStart: 2005.5,
  viewEnd: 2026.5,
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
    const [directionsResponse, papersResponse] = await Promise.all([
      fetch("data/directions.json"),
      fetch("data/papers.csv"),
    ]);
    if (!directionsResponse.ok || !papersResponse.ok) throw new Error("数据文件无法读取");
    state.directions = await directionsResponse.json();
    state.papers = parseCSV(await papersResponse.text()).map(normalizePaper).filter((paper) => paper.id && paper.year);
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
    const initialPaper = [...state.papers]
      .filter((paper) => paper.representative)
      .sort((a, b) => b.year - a.year || b.importance - a.importance)[0];
    if (initialPaper) {
      state.selectedId = initialPaper.id;
      renderDetail(initialPaper);
    }
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
    sidebar: document.querySelector("#sidebar"),
    detailPanel: document.querySelector("#detail-panel"),
    detailEmpty: document.querySelector("#detail-empty"),
    detailContent: document.querySelector("#detail-content"),
    scrim: document.querySelector("#scrim"),
    timeline: document.querySelector("#timeline"),
    timelineScroll: document.querySelector("#timeline-scroll"),
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
  document.querySelector("#representative-only").addEventListener("click", () => {
    state.representativeOnly = !state.representativeOnly;
    syncFilterButtons();
    render();
  });
  document.querySelector("#reset-all").addEventListener("click", resetAll);
  document.querySelector("#fit-view").addEventListener("click", fitView);
  document.querySelector("#zoom-in").addEventListener("click", () => zoomAt(0.78, 0.5));
  document.querySelector("#zoom-out").addEventListener("click", () => zoomAt(1.25, 0.5));
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
  elements.timelineScroll.addEventListener("wheel", onWheel, { passive: false });
  elements.timelineScroll.addEventListener("pointerdown", onPointerDown);
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp);
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
    ? `${state.yearStart}–${state.yearEnd} · ${state.selectedDirections.size} 个方向 · 滚轮缩放，拖拽平移，点击节点查看详情`
    : "当前筛选条件下没有文献";
  elements.empty.hidden = papers.length > 0;
  drawTimeline(papers);
  renderDensity(papers);
  renderSummary(papers);
}

function drawTimeline(papers) {
  const width = Math.max(elements.timelineScroll.clientWidth, 760);
  const visibleDirections = state.directions.filter((direction) => state.selectedDirections.has(direction.id));
  const laneHeight = width < 900 ? 144 : 132;
  const top = 34;
  const height = Math.max(elements.timelineScroll.clientHeight, top + visibleDirections.length * laneHeight + 4);
  const margin = { left: width < 900 ? 128 : 150, right: 28 };
  const plotWidth = width - margin.left - margin.right;
  const x = (year) => margin.left + ((year - state.viewStart) / (state.viewEnd - state.viewStart)) * plotWidth;
  elements.timeline.setAttribute("viewBox", `0 0 ${width} ${height}`);
  elements.timeline.setAttribute("height", height);
  elements.timeline.innerHTML = "";
  addSvgDefinitions();

  visibleDirections.forEach((direction, laneIndex) => {
    const laneY = top + laneIndex * laneHeight;
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

  const positions = layoutNodes(papers, visibleDirections, x, top, laneHeight);
  drawRelations(papers, positions);
  const connected = getConnectedIds(state.allRelations, state.selectionActive ? state.selectedId : null);
  const cardIds = chooseCardLabels(papers);
  positions.forEach((position, id) => drawPaperNode(position, papers.find((paper) => paper.id === id), width, margin, connected, cardIds.has(id)));
}

function chooseCardLabels(papers) {
  const winners = new Map();
  papers.forEach((paper) => {
    if (!paper.representative && paper.importance < 5 && paper.id !== state.selectedId) return;
    const bucket = `${paper.direction}:${Math.floor(paper.year / 2)}`;
    const current = winners.get(bucket);
    const score = (paper.id === state.selectedId ? 100 : 0) + (paper.representative ? 20 : 0) + paper.importance;
    const currentScore = current ? (current.id === state.selectedId ? 100 : 0) + (current.representative ? 20 : 0) + current.importance : -1;
    if (!current || score > currentScore || (score === currentScore && paper.year > current.year)) winners.set(bucket, paper);
  });
  if (state.selectedId) winners.set(`selected:${state.selectedId}`, papers.find((paper) => paper.id === state.selectedId));
  return new Set([...winners.values()].filter(Boolean).map((paper) => paper.id));
}

function addSvgDefinitions() {
  const defs = svg("defs");
  const marker = svg("marker", { id: "arrow", viewBox: "0 0 10 10", refX: 8, refY: 5, markerWidth: 5, markerHeight: 5, orient: "auto-start-reverse" });
  marker.append(svg("path", { d: "M 0 0 L 10 5 L 0 10 z", fill: "#8fa0b6" }));
  defs.append(marker);
  elements.timeline.append(defs);
}

function layoutNodes(papers, directions, x, top, laneHeight) {
  const positions = new Map();
  const laneIndex = new Map(directions.map((direction, index) => [direction.id, index]));
  directions.forEach((direction) => {
    const byYear = new Map();
    papers.filter((paper) => paper.direction === direction.id)
      .sort((a, b) => a.year - b.year || b.importance - a.importance)
      .forEach((paper) => {
        const count = byYear.get(paper.year) || 0;
        byYear.set(paper.year, count + 1);
        const slots = [-30, 5, 38, -50, 54];
        const center = top + laneIndex.get(direction.id) * laneHeight + laneHeight / 2;
        positions.set(paper.id, {
          x: x(paper.year + Math.min(count, 4) * 0.07),
          y: center + slots[count % slots.length],
          slot: count,
        });
      });
  });
  return positions;
}

function drawRelations(papers, positions) {
  if (!state.showRelations) return;
  const visibleIds = new Set(papers.map((paper) => paper.id));
  state.allRelations.forEach((relation) => {
    if (!visibleIds.has(relation.source) || !visibleIds.has(relation.target)) return;
    const source = positions.get(relation.source);
    const target = positions.get(relation.target);
    if (!source || !target) return;
    const midX = (source.x + target.x) / 2;
    const related = state.selectionActive && (relation.source === state.selectedId || relation.target === state.selectedId);
    const dimmed = state.selectionActive && !related;
    elements.timeline.append(svg("path", {
      d: `M ${source.x} ${source.y} C ${midX} ${source.y}, ${midX} ${target.y}, ${target.x} ${target.y}`,
      class: `relation-path ${relation.crossDirection ? "cross" : ""} ${related ? "related" : ""} ${dimmed ? "dimmed" : ""}`,
    }));
  });
}

function drawPaperNode(position, paper, width, margin, connected, showCard) {
  if (!paper || position.x < margin.left - 20 || position.x > width - margin.right + 20) return;
  const direction = state.directions.find((item) => item.id === paper.direction);
  const radius = 4 + paper.importance * 1.1;
  const group = svg("g", {
    class: `paper-node ${paper.id === state.selectedId ? "selected" : ""} ${state.selectionActive && !connected.has(paper.id) ? "dimmed" : ""}`,
    tabindex: 0,
    role: "button",
    "aria-label": `${paper.year} 年，${paper.title}`,
  });
  group.dataset.id = paper.id;
  group.append(svg("circle", { cx: position.x, cy: position.y, r: radius + 6, class: "selection-halo" }));
  if (paper.representative) group.append(svg("circle", { cx: position.x, cy: position.y, r: radius + 3.5, class: "representative-halo" }));
  group.append(createNodeShape(paper.type, position.x, position.y, radius, direction?.color || "#60748d"));

  if (showCard) group.append(createNodeCard(position, paper, radius, width));
  else if (position.slot >= 3) {
    const badge = svg("g", { class: "node-card" });
    badge.append(svg("circle", { cx: position.x + 14, cy: position.y, r: 9, class: "cluster-badge" }));
    const text = svg("text", { x: position.x + 14, y: position.y + 3, class: "cluster-text", "text-anchor": "middle" });
    text.textContent = `+${position.slot}`;
    badge.append(text);
    group.append(badge);
  }
  group.addEventListener("pointerenter", (event) => showTooltip(event, paper));
  group.addEventListener("pointermove", moveTooltip);
  group.addEventListener("pointerleave", hideTooltip);
  group.addEventListener("focus", (event) => showTooltip(event, paper));
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
  state.selectedId = id;
  state.selectionActive = true;
  const paper = state.papers.find((item) => item.id === id);
  if (!paper) return;
  renderDetail(paper);
  elements.detailPanel.classList.add("open");
  if (window.innerWidth <= 1120) {
    elements.scrim.hidden = false;
    document.body.style.overflow = "hidden";
  }
  render();
}

function renderDetail(paper) {
  const direction = state.directions.find((item) => item.id === paper.direction);
  const incoming = paper.parents.map((id) => state.papers.find((item) => item.id === id)).filter(Boolean);
  const outgoing = state.papers.filter((item) => item.parents.includes(paper.id));
  const relations = [
    ...incoming.map((item) => ({ paper: item, icon: "subdirectory_arrow_left", label: "继承自" })),
    ...outgoing.map((item) => ({ paper: item, icon: "subdirectory_arrow_right", label: "延伸至" })),
  ];
  const doiUrl = paper.doi ? `https://doi.org/${encodeURIComponent(paper.doi)}` : "";
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
    <section class="detail-section"><h4>内容摘要</h4><p>${escapeHTML(paper.summary || "暂无摘要")}</p></section>
    <section class="detail-section"><h4>关键词</h4><div class="keyword-list">${(paper.keywords || "暂无关键词").split(/[,，]/).map((keyword) => `<span>${escapeHTML(keyword.trim())}</span>`).join("")}</div></section>
    <section class="detail-section"><h4>演化关系 · ${relations.length}</h4><div class="relation-list">${relations.length ? relations.map((relation) => `
      <button class="relation-item" type="button" data-paper-id="${relation.paper.id}">
        <span class="material-symbols-rounded" aria-hidden="true">${relation.icon}</span><span><b>${relation.label}</b> · ${relation.paper.year}<br>${escapeHTML(relation.paper.title)}</span>
      </button>`).join("") : "<p>当前数据中未标注直接关联论文。</p>"}</div></section>
    <div class="detail-actions">
      ${doiUrl ? `<a class="primary-link" href="${doiUrl}" target="_blank" rel="noopener"><span class="material-symbols-rounded">open_in_new</span>访问论文 DOI</a>` : '<span class="primary-link" aria-disabled="true">暂无 DOI 链接</span>'}
      <a class="secondary-action" href="data/papers.csv" download title="下载数据"><span class="material-symbols-rounded">bookmark_add</span></a>
    </div>`;
  elements.detailContent.querySelectorAll("[data-paper-id]").forEach((button) => button.addEventListener("click", () => selectPaper(button.dataset.paperId)));
}

function closeDetail() {
  state.selectedId = null;
  state.selectionActive = false;
  elements.detailPanel.classList.remove("open");
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

function showTooltip(event, paper) {
  elements.tooltip.innerHTML = `<strong>${escapeHTML(paper.title)}</strong><span>${paper.year} · ${escapeHTML(paper.journal || "期刊未标注")} · ${TYPE_LABELS[paper.type] || paper.type}</span>`;
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

function onWheel(event) {
  if (event.ctrlKey || Math.abs(event.deltaY) >= Math.abs(event.deltaX)) {
    event.preventDefault();
    const rect = elements.timelineScroll.getBoundingClientRect();
    zoomAt(event.deltaY > 0 ? 1.16 : 0.86, clamp((event.clientX - rect.left) / rect.width, 0, 1));
  }
}

function zoomAt(factor, ratio) {
  const span = state.viewEnd - state.viewStart;
  const nextSpan = clamp(span * factor, 3, 34);
  const anchor = state.viewStart + span * ratio;
  state.viewStart = anchor - nextSpan * ratio;
  state.viewEnd = state.viewStart + nextSpan;
  render();
}

function onPointerDown(event) {
  if (event.target.closest(".paper-node") || event.target.closest(".canvas-tools")) return;
  state.drag = { x: event.clientX, start: state.viewStart, end: state.viewEnd };
  elements.timelineScroll.classList.add("dragging");
  elements.timelineScroll.setPointerCapture?.(event.pointerId);
}

function onPointerMove(event) {
  if (!state.drag) return;
  const delta = (event.clientX - state.drag.x) / elements.timelineScroll.clientWidth * (state.drag.end - state.drag.start);
  state.viewStart = state.drag.start - delta;
  state.viewEnd = state.drag.end - delta;
  render();
}

function onPointerUp() {
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
  render();
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
  state.representativeOnly = false;
  state.search = "";
  state.yearStart = state.fullMin;
  state.yearEnd = state.fullMax;
  state.viewStart = state.fullMin - 0.5;
  state.viewEnd = state.fullMax + 0.5;
  state.showRelations = true;
  elements.search.value = "";
  elements.yearStart.value = state.fullMin;
  elements.yearEnd.value = state.fullMax;
  elements.yearStartLabel.value = state.fullMin;
  elements.yearEndLabel.value = state.fullMax;
  document.querySelector("#toggle-relations").classList.add("active");
  closeDetail();
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
