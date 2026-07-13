export function parseCSV(text) {
  const rows = [];
  let row = [];
  let value = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const next = text[index + 1];
    if (quoted && character === '"' && next === '"') {
      value += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === "," && !quoted) {
      row.push(value);
      value = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && next === "\n") index += 1;
      row.push(value);
      if (row.some((item) => item.trim())) rows.push(row);
      row = [];
      value = "";
    } else {
      value += character;
    }
  }

  if (value || row.length) {
    row.push(value);
    rows.push(row);
  }

  const headers = (rows.shift() || []).map((header) => header.replace(/^\uFEFF/, "").trim());
  return rows.map((columns) => Object.fromEntries(headers.map((header, index) => [header, (columns[index] || "").trim()])));
}

export function normalizePaper(paper) {
  return {
    ...paper,
    year: Number(paper.year),
    importance: Math.max(1, Math.min(5, Number(paper.importance) || 2)),
    representative: /^(true|1|yes)$/i.test(paper.representative || ""),
    parents: paper.parent_id ? paper.parent_id.split("|").map((id) => id.trim()).filter(Boolean) : [],
  };
}

export function annotateSameYearGroups(papers) {
  const groups = new Map();
  papers.forEach((paper) => {
    const key = `${paper.direction}\u0000${paper.year}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(paper);
  });

  const annotations = new Map();
  groups.forEach((group) => {
    group.forEach((paper, index) => annotations.set(paper.id, {
      index,
      size: group.length,
      extra: Math.max(0, group.length - 1),
    }));
  });
  return annotations;
}

export function filterPapers(papers, filters) {
  const search = (filters.search || "").trim().toLocaleLowerCase("zh-CN");
  return papers.filter((paper) => {
    if (filters.directions?.size && !filters.directions.has(paper.direction)) return false;
    if (filters.types?.size && !filters.types.has(paper.type)) return false;
    if (filters.innovations?.size && !filters.innovations.has(paper.innovationClass)) return false;
    if (Number.isFinite(filters.yearStart) && paper.year < filters.yearStart) return false;
    if (Number.isFinite(filters.yearEnd) && paper.year > filters.yearEnd) return false;
    if (filters.representativeOnly && !paper.representative) return false;
    if (!search) return true;
    const haystack = [paper.title, paper.authors, paper.journal, paper.keywords, paper.summary, paper.doi]
      .filter(Boolean)
      .join(" ")
      .toLocaleLowerCase("zh-CN");
    return haystack.includes(search);
  });
}

export function buildRelations(papers) {
  const ids = new Set(papers.map((paper) => paper.id));
  const byId = new Map(papers.map((paper) => [paper.id, paper]));
  return papers.flatMap((paper) => paper.parents
    .filter((parentId) => ids.has(parentId))
    .map((parentId) => ({
      source: parentId,
      target: paper.id,
      crossDirection: byId.get(parentId)?.direction !== paper.direction,
    })));
}

export function summarizePapers(papers) {
  const years = papers.map((paper) => paper.year).filter(Number.isFinite);
  const directionCounts = new Map();
  const typeCounts = new Map();
  papers.forEach((paper) => {
    directionCounts.set(paper.direction, (directionCounts.get(paper.direction) || 0) + 1);
    typeCounts.set(paper.type, (typeCounts.get(paper.type) || 0) + 1);
  });
  return {
    total: papers.length,
    minYear: years.length ? Math.min(...years) : null,
    maxYear: years.length ? Math.max(...years) : null,
    representativeCount: papers.filter((paper) => paper.representative).length,
    directionCounts,
    typeCounts,
    relations: buildRelations(papers),
  };
}

export function getConnectedIds(relations, selectedId) {
  const connected = new Set(selectedId ? [selectedId] : []);
  relations.forEach((relation) => {
    if (relation.source === selectedId) connected.add(relation.target);
    if (relation.target === selectedId) connected.add(relation.source);
  });
  return connected;
}

export function computeLaneHeights(directions, papers, verticalScale = 1) {
  const heights = new Map();
  directions.forEach((direction) => {
    const count = papers.filter((paper) => paper.direction === direction.id).length;
    const baseHeight = Math.max(72, Math.min(140, 64 + count * 3.2));
    heights.set(direction.id, Math.round(baseHeight * verticalScale));
  });
  return heights;
}

export function fitLaneScaleToHeight(directions, papers, availableHeight, chromeHeight = 38) {
  if (!directions.length || !Number.isFinite(availableHeight) || availableHeight <= chromeHeight) return 1;
  const baseHeights = computeLaneHeights(directions, papers, 1);
  const baseTotal = [...baseHeights.values()].reduce((sum, height) => sum + height, 0);
  if (!baseTotal) return 1;

  let scale = Math.max(0.65, Math.min(1, (availableHeight - chromeHeight) / baseTotal));
  while (scale > 0.65) {
    const fittedTotal = chromeHeight + [...computeLaneHeights(directions, papers, scale).values()]
      .reduce((sum, height) => sum + height, 0);
    if (fittedTotal <= availableHeight) break;
    scale = Math.max(0.65, scale - 0.001);
  }
  return Number(scale.toFixed(3));
}

export function alignViewportToPixel({ targetYear, span, width, targetX, marginLeft, marginRight }) {
  const plotWidth = width - marginLeft - marginRight;
  if (![targetYear, span, width, targetX, marginLeft, marginRight].every(Number.isFinite) || span <= 0 || plotWidth <= 0) {
    return { viewStart: targetYear - span / 2, viewEnd: targetYear + span / 2 };
  }
  const targetRatio = Math.max(0, Math.min(1, (targetX - marginLeft) / plotWidth));
  const viewStart = targetYear - targetRatio * span;
  return { viewStart, viewEnd: viewStart + span };
}

export function zoomViewport2D(viewport, factor, anchorRatio = 0.5) {
  const span = viewport.viewEnd - viewport.viewStart;
  const nextSpan = Math.max(3, Math.min(34, span * factor));
  const anchor = viewport.viewStart + span * anchorRatio;
  const verticalScale = Math.max(0.65, Math.min(1.8, viewport.verticalScale / factor));
  const viewStart = anchor - nextSpan * anchorRatio;
  return { viewStart, viewEnd: viewStart + nextSpan, verticalScale };
}

export function togglePaperSelection(currentId, clickedId) {
  if (currentId === clickedId) return { selectedId: null, open: false };
  return { selectedId: clickedId, open: true };
}

export function paperNodeHitRadius(visualRadius, minimumRadius = 14, padding = 6) {
  if (![visualRadius, minimumRadius, padding].every(Number.isFinite)) return 14;
  return Math.max(minimumRadius, visualRadius + padding);
}

export function exceedsDragThreshold(startX, startY, currentX, currentY, threshold = 5) {
  if (![startX, startY, currentX, currentY, threshold].every(Number.isFinite) || threshold < 0) return false;
  return Math.hypot(currentX - startX, currentY - startY) >= threshold;
}

export function horizontalEdgeOpacity(x, minX, maxX, fadeWidth = 20) {
  if (![x, minX, maxX, fadeWidth].every(Number.isFinite) || maxX <= minX || fadeWidth <= 0) return 0;
  if (x <= minX - fadeWidth || x >= maxX + fadeWidth) return 0;
  if (x < minX) return (x - (minX - fadeWidth)) / fadeWidth;
  if (x > maxX) return ((maxX + fadeWidth) - x) / fadeWidth;
  return 1;
}

export function relationEdgeOpacity(sourceX, targetX, minX, maxX, fadeWidth = 20) {
  return Math.min(
    horizontalEdgeOpacity(sourceX, minX, maxX, fadeWidth),
    horizontalEdgeOpacity(targetX, minX, maxX, fadeWidth),
  );
}
