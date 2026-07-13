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

export function filterPapers(papers, filters) {
  const search = (filters.search || "").trim().toLocaleLowerCase("zh-CN");
  return papers.filter((paper) => {
    if (filters.directions?.size && !filters.directions.has(paper.direction)) return false;
    if (filters.types?.size && !filters.types.has(paper.type)) return false;
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
