(() => {
  "use strict";

  const NS = "http://www.w3.org/2000/svg";
  const state = { papers: [], directions: [], selected: new Set(), search: "", featuredOnly: false, viewStart: 2005, viewEnd: 2027, drag: null };
  const els = {};
  const typeLabels = { theory: "理论", extension: "扩展", algorithm: "算法", application: "应用" };

  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    Object.assign(els, {
      svg: document.querySelector("#timeline"), wrap: document.querySelector("#timeline-wrap"), tooltip: document.querySelector("#tooltip"),
      directionButtons: document.querySelector("#direction-buttons"), search: document.querySelector("#search-input"), featured: document.querySelector("#featured-only"),
      summary: document.querySelector("#summary-body"), overview: document.querySelector("#stage-overview"), empty: document.querySelector("#empty-state"),
      paperCount: document.querySelector("#paper-count"), yearRange: document.querySelector("#year-range"), legend: document.querySelector("#legend")
    });
    try {
      const [directions, csv] = await Promise.all([fetch("data/directions.json").then(checkFetch).then(r => r.json()), fetch("data/papers.csv").then(checkFetch).then(r => r.text())]);
      state.directions = directions;
      state.papers = parseCSV(csv).map(normalizePaper).filter(p => p.id && p.year);
      state.selected = new Set(directions.map(d => d.id));
      const years = state.papers.map(p => p.year);
      state.viewStart = Math.min(...years) - 1;
      state.viewEnd = Math.max(...years) + 1;
      buildControls(); bindEvents(); render();
    } catch (error) {
      els.wrap.innerHTML = `<div class="empty-state">数据加载失败：${escapeHTML(error.message)}。请通过 HTTP 服务器打开页面。</div>`;
    }
  }

  function checkFetch(response) { if (!response.ok) throw new Error(`${response.status} ${response.statusText}`); return response; }

  function parseCSV(text) {
    const rows = []; let row = [], value = "", quoted = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i], next = text[i + 1];
      if (quoted && c === '"' && next === '"') { value += '"'; i++; }
      else if (c === '"') quoted = !quoted;
      else if (c === "," && !quoted) { row.push(value); value = ""; }
      else if ((c === "\n" || c === "\r") && !quoted) { if (c === "\r" && next === "\n") i++; row.push(value); if (row.some(v => v.trim())) rows.push(row); row = []; value = ""; }
      else value += c;
    }
    if (value || row.length) { row.push(value); rows.push(row); }
    const headers = rows.shift().map(h => h.replace(/^\uFEFF/, "").trim());
    return rows.map(cols => Object.fromEntries(headers.map((h, i) => [h, (cols[i] || "").trim()])));
  }

  function normalizePaper(p) {
    return { ...p, year: Number(p.year), importance: Math.max(1, Math.min(5, Number(p.importance) || 2)), representative: /^(true|1|yes)$/i.test(p.representative), parents: p.parent_id ? p.parent_id.split("|").map(s => s.trim()).filter(Boolean) : [] };
  }

  function buildControls() {
    els.directionButtons.innerHTML = `<button class="chip active" data-direction="all">全部</button>` + state.directions.map(d => `<button class="chip active" data-direction="${d.id}" style="--chip-color:${d.color}">${d.label}</button>`).join("");
    els.legend.innerHTML = Object.entries(typeLabels).map(([id, label]) => `<span class="legend-item"><i class="legend-mark ${id}"></i>${label}</span>`).join("");
  }

  function bindEvents() {
    els.directionButtons.addEventListener("click", event => {
      const button = event.target.closest("button"); if (!button) return;
      const id = button.dataset.direction;
      if (id === "all") state.selected = state.selected.size === state.directions.length ? new Set() : new Set(state.directions.map(d => d.id));
      else state.selected.has(id) ? state.selected.delete(id) : state.selected.add(id);
      syncChips(); render();
    });
    els.search.addEventListener("input", () => { state.search = els.search.value.trim().toLowerCase(); render(); });
    els.featured.addEventListener("change", () => { state.featuredOnly = els.featured.checked; render(); });
    document.querySelector("#reset-view").addEventListener("click", resetView);
    document.querySelector("#export-svg").addEventListener("click", exportSVG);
    document.querySelector("#export-png").addEventListener("click", exportPNG);
    els.wrap.addEventListener("wheel", onWheel, { passive: false });
    els.wrap.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("resize", debounce(render, 120));
  }

  function syncChips() {
    els.directionButtons.querySelectorAll("[data-direction]").forEach(b => b.classList.toggle("active", b.dataset.direction === "all" ? state.selected.size === state.directions.length : state.selected.has(b.dataset.direction)));
  }

  function filteredPapers() {
    return state.papers.filter(p => {
      if (!state.selected.has(p.direction) || (state.featuredOnly && !p.representative)) return false;
      if (!state.search) return true;
      return [p.title, p.authors, p.journal, p.keywords, p.summary].join(" ").toLowerCase().includes(state.search);
    });
  }

  function render() {
    if (!state.papers.length) return;
    const papers = filteredPapers();
    els.empty.hidden = papers.length > 0;
    els.paperCount.textContent = `${papers.length} / ${state.papers.length} 篇成果`;
    els.yearRange.textContent = papers.length ? `${Math.min(...papers.map(p => p.year))}—${Math.max(...papers.map(p => p.year))}` : "无结果";
    drawTimeline(papers); renderDensity(papers); renderSummary(papers);
  }

  function renderDensity(papers) {
    const strip = document.querySelector("#density-strip"), windowEl = document.querySelector("#viewport-window");
    if (!strip || !state.papers.length) return;
    const min = Math.min(...state.papers.map(p => p.year)), max = Math.max(...state.papers.map(p => p.year));
    const counts = new Map(); papers.forEach(p => counts.set(p.year, (counts.get(p.year) || 0) + 1));
    const peak = Math.max(1, ...counts.values());
    strip.innerHTML = Array.from({length:max-min+1}, (_,i) => { const year=min+i, count=counts.get(year)||0; return `<i title="${year}: ${count} 篇" style="height:${Math.max(2, count/peak*24)}px"></i>`; }).join("");
    const left = Math.max(0, Math.min(100, (state.viewStart-min)/(max-min)*100)), right = Math.max(0, Math.min(100, (state.viewEnd-min)/(max-min)*100));
    windowEl.style.left = `${left}%`; windowEl.style.width = `${Math.max(3,right-left)}%`;
  }

  function drawTimeline(papers) {
    const width = Math.max(els.wrap.clientWidth, 720), height = Math.max(els.wrap.clientHeight, 500);
    const margin = { top: 48, right: 42, bottom: 30, left: width < 760 ? 135 : 205 };
    const lanes = state.directions.filter(d => state.selected.has(d.id));
    const laneHeight = lanes.length ? (height - margin.top - margin.bottom) / lanes.length : 0;
    els.svg.setAttribute("viewBox", `0 0 ${width} ${height}`); els.svg.innerHTML = "";
    const defs = svgEl("defs"); defs.innerHTML = `<marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#71828b"/></marker>`; els.svg.append(defs);
    const plotW = width - margin.left - margin.right;
    const x = year => margin.left + ((year - state.viewStart) / (state.viewEnd - state.viewStart)) * plotW;
    lanes.forEach((lane, i) => {
      const y = margin.top + i * laneHeight;
      els.svg.append(svgEl("rect", { x: 0, y, width, height: laneHeight, class: `lane-bg ${i % 2 ? "alt" : ""}` }));
      els.svg.append(svgEl("line", { x1: margin.left, x2: width - margin.right, y1: y + laneHeight / 2, y2: y + laneHeight / 2, class: "lane-rule" }));
      const label = svgEl("text", { x: 16, y: y + 25, class: "lane-label", fill: lane.color }); label.textContent = lane.label; els.svg.append(label);
      const desc = svgEl("text", { x: 16, y: y + 43, class: "year-label" }); desc.textContent = truncate(lane.description, width < 760 ? 17 : 29); els.svg.append(desc);
    });
    for (let year = Math.ceil(state.viewStart); year <= Math.floor(state.viewEnd); year++) {
      const px = x(year); if (px < margin.left || px > width - margin.right) continue;
      const major = year % 5 === 0;
      els.svg.append(svgEl("line", { x1: px, x2: px, y1: margin.top - 7, y2: height - margin.bottom, class: `year-line ${major ? "major" : ""}` }));
      const t = svgEl("text", { x: px, y: 25, class: "year-label", "text-anchor": "middle" }); t.textContent = year; els.svg.append(t);
    }

    const positions = new Map(), laneIndex = new Map(lanes.map((d, i) => [d.id, i])), labelIds = new Set();
    lanes.forEach(lane => {
      const lanePapers = papers.filter(p => p.direction === lane.id).sort((a,b) => a.year - b.year || b.importance - a.importance);
      const buckets = new Map();
      lanePapers.forEach(p => {
        const key = p.year; const slot = buckets.get(key) || 0; buckets.set(key, slot + 1);
        const offsets = [0, -24, 24, -43, 43, -60, 60];
        const px = x(p.year + Math.min(slot, 4) * .08), baseY = margin.top + laneIndex.get(lane.id) * laneHeight + laneHeight / 2;
        positions.set(p.id, { x: px, y: baseY + offsets[slot % offsets.length], paper: p });
      });
      const labelBuckets = new Map();
      lanePapers.filter(p => p.representative && p.importance >= 4).forEach(p => {
        const bucket = Math.floor(p.year / 4), current = labelBuckets.get(bucket);
        if (!current || p.importance > current.importance || (p.importance === current.importance && p.year > current.year)) labelBuckets.set(bucket, p);
      });
      labelBuckets.forEach(p => labelIds.add(p.id));
    });
    const byId = new Map(papers.map(p => [p.id, p]));
    positions.forEach(pos => pos.paper.parents.forEach(parentId => {
      if (!positions.has(parentId)) return;
      const from = positions.get(parentId), cross = from.paper.direction !== pos.paper.direction;
      const mid = (from.x + pos.x) / 2;
      els.svg.append(svgEl("path", { d: `M ${from.x} ${from.y} C ${mid} ${from.y}, ${mid} ${pos.y}, ${pos.x} ${pos.y}`, class: `parent-link ${cross ? "cross" : ""}` }));
    }));
    positions.forEach(pos => drawNode(pos, byId.get(pos.paper.id), width, margin, labelIds.has(pos.paper.id)));
  }

  function drawNode(pos, p, width, margin, showLabel) {
    if (pos.x < margin.left - 20 || pos.x > width - margin.right + 20) return;
    const direction = state.directions.find(d => d.id === p.direction), r = 4.5 + p.importance * 1.7;
    const group = svgEl("g", { class: "node", tabindex: "0", "aria-label": `${p.year} ${p.title}` });
    let shape;
    if (p.type === "theory") shape = svgEl("circle", { cx: pos.x, cy: pos.y, r });
    else if (p.type === "extension") shape = svgEl("path", { d: diamondPath(pos.x, pos.y, r * 1.08) });
    else if (p.type === "application") shape = svgEl("path", { d: hexPath(pos.x, pos.y, r) });
    else shape = svgEl("rect", { x: pos.x-r, y: pos.y-r, width: r*2, height: r*2, rx: 2 });
    shape.setAttribute("fill", direction?.color || "#65747d"); shape.setAttribute("stroke", darken(direction?.color || "#65747d")); shape.setAttribute("class", `node-shape type-${p.type}`); group.append(shape);
    if (p.representative) group.append(svgEl("circle", { cx: pos.x, cy: pos.y, r: r + 4, fill: "none", stroke: direction?.color || "#65747d", "stroke-width": 1, opacity: .5 }));
    if (showLabel) { const label = svgEl("text", { x: pos.x + r + 5, y: pos.y + 3, class: "node-label" }); label.textContent = truncate(p.title, 24); group.append(label); }
    group.addEventListener("pointerenter", e => showTooltip(e, p)); group.addEventListener("pointermove", moveTooltip); group.addEventListener("pointerleave", hideTooltip);
    group.addEventListener("focus", e => showTooltip(e, p)); group.addEventListener("blur", hideTooltip);
    els.svg.append(group);
  }

  function showTooltip(event, p) {
    els.tooltip.innerHTML = `<h3>${escapeHTML(p.title)}</h3><dl><dt>年份</dt><dd>${p.year}</dd><dt>期刊</dt><dd>${escapeHTML(p.journal)}</dd><dt>作者</dt><dd>${escapeHTML(p.authors)}</dd><dt>关键词</dt><dd>${escapeHTML(p.keywords)}</dd><dt>类型</dt><dd>${typeLabels[p.type] || p.type}</dd></dl><p class="abstract">${escapeHTML(p.summary)}</p>`;
    els.tooltip.hidden = false; moveTooltip(event);
  }
  function moveTooltip(event) { if (!event.clientX) return; const pad=14, box=els.tooltip.getBoundingClientRect(); let left=event.clientX+15, top=event.clientY+15; if(left+box.width>innerWidth-pad) left=event.clientX-box.width-15; if(top+box.height>innerHeight-pad) top=event.clientY-box.height-15; els.tooltip.style.left=`${Math.max(pad,left)}px`; els.tooltip.style.top=`${Math.max(pad,top)}px`; }
  function hideTooltip() { els.tooltip.hidden = true; }

  function renderSummary(papers) {
    const paperMap = new Map(papers.map(p => [p.id, p]));
    const rows = state.directions.filter(d => state.selected.has(d.id)).map(d => {
      const ps = papers.filter(p => p.direction === d.id); if (!ps.length) return null;
      const years = ps.map(p => p.year), reps = ps.filter(p => p.representative).sort((a,b) => b.importance-a.importance || b.year-a.year);
      let connections = 0; ps.forEach(p => p.parents.forEach(id => { const parent = paperMap.get(id); if (parent && parent.direction !== p.direction) connections++; }));
      papers.forEach(p => p.parents.forEach(id => { const parent = paperMap.get(id); if (parent?.direction === d.id && p.direction !== d.id) connections++; }));
      return { d, ps, first: Math.min(...years), last: Math.max(...years), rep: reps[0] || [...ps].sort((a,b)=>b.importance-a.importance)[0], connections };
    }).filter(Boolean);
    els.summary.innerHTML = rows.map(r => `<tr><td><i class="dir-dot" style="background:${r.d.color}"></i>${r.d.label}</td><td>${r.first}</td><td>${r.first}—${r.last}</td><td>${r.ps.length}</td><td>${escapeHTML(r.rep.title)}</td><td>${r.connections}</td></tr>`).join("") || `<tr><td colspan="6">当前筛选条件下没有可统计的数据</td></tr>`;
    const years = papers.map(p=>p.year), reps = papers.filter(p=>p.representative), cross = rows.reduce((sum,r)=>sum+r.connections,0);
    els.overview.innerHTML = `<div class="stage-card"><span>成果跨度</span><strong>${years.length ? Math.min(...years)+"—"+Math.max(...years) : "--"}</strong><p>覆盖 ${years.length ? Math.max(...years)-Math.min(...years)+1 : 0} 个自然年份</p></div><div class="stage-card"><span>当前成果</span><strong>${papers.length}</strong><p>筛选范围内的论文、会议论文与章节</p></div><div class="stage-card"><span>代表性成果</span><strong>${reps.length}</strong><p>importance 较高且标记为代表作</p></div><div class="stage-card"><span>跨方向连接</span><strong>${Math.ceil(cross/2)}</strong><p>方法迁移与研究方向融合关系</p></div>`;
  }

  function onWheel(event) {
    event.preventDefault(); const rect = els.wrap.getBoundingClientRect(), ratio = (event.clientX - rect.left) / rect.width;
    const span = state.viewEnd - state.viewStart, factor = event.deltaY > 0 ? 1.14 : .86, next = Math.max(4, Math.min(40, span * factor)), anchor = state.viewStart + ratio * span;
    state.viewStart = anchor - ratio * next; state.viewEnd = state.viewStart + next; render();
  }
  function onPointerDown(event) { if (event.target.closest(".node")) return; state.drag = { x: event.clientX, start: state.viewStart, end: state.viewEnd }; els.wrap.classList.add("dragging"); els.wrap.setPointerCapture?.(event.pointerId); }
  function onPointerMove(event) { if (!state.drag) return; const delta = (event.clientX-state.drag.x)/els.wrap.clientWidth*(state.drag.end-state.drag.start); state.viewStart=state.drag.start-delta; state.viewEnd=state.drag.end-delta; render(); }
  function onPointerUp() { state.drag=null; els.wrap.classList.remove("dragging"); }
  function resetView() { const years=state.papers.map(p=>p.year); state.viewStart=Math.min(...years)-1; state.viewEnd=Math.max(...years)+1; render(); }

  function serializedSVG() { const clone=els.svg.cloneNode(true); clone.setAttribute("xmlns",NS); const style=document.createElementNS(NS,"style"); style.textContent=[...document.styleSheets].flatMap(s=>{try{return [...s.cssRules].map(r=>r.cssText)}catch{return[]}}).join("\n"); clone.insertBefore(style,clone.firstChild); return new XMLSerializer().serializeToString(clone); }
  function exportSVG() { download(new Blob([serializedSVG()],{type:"image/svg+xml;charset=utf-8"}),"research-timeline.svg"); }
  function exportPNG() { const blob=new Blob([serializedSVG()],{type:"image/svg+xml;charset=utf-8"}), url=URL.createObjectURL(blob), img=new Image(); img.onload=()=>{ const box=els.svg.viewBox.baseVal, scale=2, canvas=document.createElement("canvas"); canvas.width=box.width*scale; canvas.height=box.height*scale; const ctx=canvas.getContext("2d"); ctx.fillStyle="#fbfcfc"; ctx.fillRect(0,0,canvas.width,canvas.height); ctx.scale(scale,scale); ctx.drawImage(img,0,0); URL.revokeObjectURL(url); canvas.toBlob(png=>download(png,"research-timeline.png"),"image/png"); }; img.src=url; }
  function download(blob,name){const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}
  function svgEl(name, attrs={}) { const el=document.createElementNS(NS,name); Object.entries(attrs).forEach(([k,v])=>el.setAttribute(k,v)); return el; }
  function diamondPath(x,y,r){return `M ${x} ${y-r} L ${x+r} ${y} L ${x} ${y+r} L ${x-r} ${y} Z`;}
  function hexPath(x,y,r){return `M ${x-r} ${y} L ${x-r/2} ${y-r*.86} L ${x+r/2} ${y-r*.86} L ${x+r} ${y} L ${x+r/2} ${y+r*.86} L ${x-r/2} ${y+r*.86} Z`;}
  function darken(hex){const n=parseInt(hex.slice(1),16), r=Math.max(0,(n>>16)-34),g=Math.max(0,((n>>8)&255)-34),b=Math.max(0,(n&255)-34);return `rgb(${r},${g},${b})`;}
  function truncate(s,n){return s.length>n?s.slice(0,n-1)+"…":s;}
  function escapeHTML(s=""){return s.replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));}
  function debounce(fn,ms){let id;return()=>{clearTimeout(id);id=setTimeout(fn,ms)}}
})();
