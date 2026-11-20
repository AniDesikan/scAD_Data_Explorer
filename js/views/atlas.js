'use strict';
/* Overview: DEG counts per cell type, pathway landscape heatmap, auto-generated leads. */
const AtlasView = (() => {
  function render(root) {
    const d = Store.d();
    const ui = Store.uiGet('atlas', { cmps: null, coll: '(all)', q: '', topN: 40, order: 'cluster', mask: false, colMode: 'ct' });
    if (!Array.isArray(ui.cmps)) ui.cmps = d.comparisons.slice();
    ui.cmps = ui.cmps.filter(c => d.comparisons.includes(c));
    if (!ui.cmps.length) ui.cmps = d.comparisons.slice();
    const colls = Store.collections();
    if (ui.coll !== '(all)' && !colls.includes(ui.coll)) ui.coll = '(all)';

    root.append(U.h('div', { class: 'view-head' },
      U.h('h2', {}, 'Overview'),
      U.h('p', { class: 'muted' }, 'Start here: where are the biggest changes? Click any square to drill into it. Gene and pathway details open in a side panel.'),
      U.thresholdBar()));
    degCard(root, d);
    pathCard(root, d, ui, colls);
    leadsCard(root, d, ui);
  }

  function degCard(root, d) {
    const s = Store.settings, cts = d.celltypes, cmps = d.comparisons;
    const div = U.h('div');
    root.append(U.card('How many genes change, and where?',
      `Number of DEGs per cell type (${U.qn()} < ${s.degPadj}, |log2FC| ≥ ${s.degLfc}; change them with the Significance boxes above). ↑ = higher in the first group named in the comparison. Click a square to open that cell type.`, div));
    const z = [], text = [], cd = [];
    for (const cmp of cmps) {
      const zr = [], tr = [], cr = [];
      for (const ct of cts) {
        const t = Store.degTable(ct, cmp);
        if (!t) { zr.push(null); tr.push(''); cr.push(`${ct} · ${cmp}<br>no DEG table`); continue; }
        const c = Store.degCounts(t);
        zr.push(c.up + c.down); tr.push(`↑${c.up}<br>↓${c.down}`);
        cr.push(`<b>${U.esc(ct)}</b> · ${U.esc(cmp)}<br>${c.up} up, ${c.down} down<br>${t.genes.length.toLocaleString()} genes tested`);
      }
      z.push(zr); text.push(tr); cd.push(cr);
    }
    if (!cmps.length || !cts.length) { div.append(U.h('p', { class: 'muted' }, 'No DEG tables loaded.')); return; }
    U.plot(div, [{
      type: 'heatmap', z, text, customdata: cd, texttemplate: '%{text}', hovertemplate: '%{customdata}<extra></extra>',
      x: cts.map((_, i) => i), y: cmps.map((_, i) => i), colorscale: [[0, '#f5f3ff'], [1, '#6d28d9']], showscale: false, xgap: 3, ygap: 3,
      textfont: { size: 11 },
    }], {
      height: 110 + 52 * cmps.length, margin: { l: 170, r: 10, t: 10, b: 90 },
      xaxis: { tickvals: cts.map((_, i) => i), ticktext: cts, tickangle: -30, showgrid: false },
      yaxis: { tickvals: cmps.map((_, i) => i), ticktext: cmps, autorange: 'reversed', showgrid: false },
    }, pt => App.openExplore(cts[pt.x], cmps[pt.y]));
  }

  function buildMatrix(d, ui) {
    const s = Store.settings, cmpsSel = d.comparisons.filter(c => ui.cmps.includes(c));
    let cols = [];
    if (ui.colMode === 'ct') { for (const ct of d.celltypes) for (const cmp of cmpsSel) cols.push({ ct, cmp }); }
    else { for (const cmp of cmpsSel) for (const ct of d.celltypes) cols.push({ ct, cmp }); }
    let tables = cols.map(c => Store.gseaTables(c.ct, c.cmp, ui.coll));
    const keep = tables.map(ts => ts.length > 0);
    cols = cols.filter((_, j) => keep[j]); tables = tables.filter((_, j) => keep[j]);
    const rows = new Map();
    tables.forEach((ts, j) => ts.forEach(t => t.names.forEach((n, i) => {
      let r = rows.get(n);
      if (!r) { r = { name: n, id: t.ids ? t.ids[i] : '', coll: t.collection, vals: new Array(cols.length).fill(null) }; rows.set(n, r); }
      const q = Store.pathQ(t, i), cur = r.vals[j];
      if (!cur || q < cur.q) r.vals[j] = { score: t.score[i], q, size: t.size ? t.size[i] : NaN, nLE: t.genes && t.genes[i] ? t.genes[i].length : 0, type: t.scoreType };
    })));
    let re = null;
    if (ui.q) { try { re = new RegExp(ui.q, 'i'); } catch { re = new RegExp(ui.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'); } }
    let list = [...rows.values()].filter(r => !re || re.test(r.name) || re.test(U.pretty(r.name)) || (r.id && re.test(r.id)));
    for (const r of list) {
      r.nsig = 0; r.maxAbs = 0; let maxAll = 0;
      for (const v of r.vals) if (v && Number.isFinite(v.score)) {
        maxAll = Math.max(maxAll, Math.abs(v.score));
        if (v.q < s.gseaPadj) { r.nsig++; r.maxAbs = Math.max(r.maxAbs, Math.abs(v.score)); }
      }
      if (!r.nsig) r.maxAbs = maxAll;
    }
    if (!re) list = list.filter(r => r.nsig > 0);
    list.sort((a, b) => (b.nsig > 0) - (a.nsig > 0) || b.maxAbs - a.maxAbs);
    list = list.slice(0, ui.topN);
    if (ui.order === 'cluster') { const o = U.clusterOrder(list.map(r => r.vals.map(v => (v ? v.score : 0)))); list = o.map(i => list[i]); }
    else if (ui.order === 'name') list.sort((a, b) => U.pretty(a.name).localeCompare(U.pretty(b.name)));
    else if (ui.order === 'nsig') list.sort((a, b) => b.nsig - a.nsig || b.maxAbs - a.maxAbs);
    return { cols, rows: list };
  }

  function pathCard(root, d, ui, colls) {
    const s = Store.settings;
    const plotDiv = U.h('div'), info = U.h('div', { class: 'muted small-text' });
    const redraw = () => { Store.uiSave(); draw(); };
    const cmpBoxes = U.h('span', { class: 'pills' }, d.comparisons.map(c => {
      const b = U.h('button', { class: 'pill' + (ui.cmps.includes(c) ? ' active' : ''), title: d.compLabels[c] || '' }, c);
      b.onclick = () => {
        ui.cmps = ui.cmps.includes(c) ? ui.cmps.filter(x => x !== c) : [...ui.cmps, c];
        if (!ui.cmps.length) ui.cmps = [c];
        [...cmpBoxes.children].forEach((x, i) => x.classList.toggle('active', ui.cmps.includes(d.comparisons[i])));
        redraw();
      };
      return b;
    }));
    const q = U.h('input', { type: 'search', placeholder: 'e.g. synap|estr|interferon', value: ui.q, style: { width: '220px' } });
    q.addEventListener('input', U.debounce(() => { ui.q = q.value.trim(); redraw(); }, 300));
    const controls = U.h('div', { class: 'controls' },
      U.h('label', {}, 'Comparisons', cmpBoxes),
      U.h('label', {}, 'Collection', U.select(['(all)', ...colls], ui.coll, v => { ui.coll = v; redraw(); })),
      U.h('label', {}, 'Keyword', q),
      U.h('label', {}, 'Show', U.select([20, 40, 60, 100, 200].map(n => [n, `top ${n}`]), ui.topN, v => { ui.topN = +v; redraw(); })),
      U.h('label', {}, 'Order', U.select([['cluster', 'clustered (similar patterns together)'], ['score', 'strongest effect'], ['nsig', 'most cell types'], ['name', 'A–Z']], ui.order, v => { ui.order = v; redraw(); })),
      U.h('label', {}, 'Columns', U.select([['ct', 'grouped by cell type'], ['cmp', 'grouped by comparison']], ui.colMode, v => { ui.colMode = v; redraw(); })),
      U.h('label', {}, U.h('input', { type: 'checkbox', checked: ui.mask, onchange: e => { ui.mask = e.target.checked; redraw(); } }), 'colour only significant'));
    root.append(U.card('Pathway landscape',
      `Each row is a pathway, each column a cell type × comparison. Red = enriched among genes higher in the first group, blue = lower. Stars: * ${U.qn()}<0.05, ** <0.01, *** <0.001 (· = passes your threshold of ${s.gseaPadj}). Grey = not tested. Click a square to see the genes behind it. Keywords accept regular expressions.`,
      controls, info, plotDiv));

    function draw() {
      Plotly.purge(plotDiv); plotDiv.innerHTML = '';
      const { cols, rows } = buildMatrix(d, ui);
      if (!cols.length) { info.textContent = 'No pathway results for the selected comparisons/collection.'; return; }
      if (!rows.length) { info.textContent = ui.q ? 'No pathway names match that keyword.' : `No pathway passes ${U.qn()} < ${s.gseaPadj} in the selected columns. Try another collection, more comparisons, or a looser pathway FDR (Significance boxes above).`; return; }
      info.textContent = `${rows.length} pathways shown${ui.q ? '' : ' (significant in at least one column)'}.`;
      const types = new Set(rows.flatMap(r => r.vals.filter(Boolean).map(v => v.type)));
      const z = rows.map(r => r.vals.map(v => (!v ? null : ui.mask && !(v.q < s.gseaPadj) ? 0 : v.score)));
      const text = rows.map(r => r.vals.map(v => (v ? U.stars(v.q, s.gseaPadj) : '')));
      const cd = rows.map(r => r.vals.map((v, j) => {
        const c = cols[j];
        if (!v) return `<b>${U.esc(U.pretty(r.name))}</b><br>${U.esc(c.ct)} · ${U.esc(c.cmp)}<br>not tested`;
        return `<b>${U.esc(U.trunc(U.pretty(r.name), 70))}</b><br>${U.esc(c.ct)} · ${U.esc(c.cmp)}<br>${v.type === 'NES' ? 'NES' : 'score'} ${U.fmt(v.score)} · ${U.qn()} ${U.fmtP(v.q)}${Number.isFinite(v.size) ? ` · size ${v.size}` : ''}${v.nLE ? ` · ${v.nLE} driver genes` : ''}<br><i>click for genes</i>`;
      }));
      const zmax = Math.max(1, U.quantile(z.flat().filter(v => v != null).map(Math.abs), 0.98) || 1);
      const multi = new Set(cols.map(c => c.cmp)).size > 1;
      const outer = ui.colMode === 'ct' ? 'ct' : 'cmp', inner = outer === 'ct' ? 'cmp' : 'ct';
      const ticktext = cols.map(c => (multi ? c[inner] : c.ct));
      const shapes = [], annotations = [];
      if (multi) {
        let start = 0;
        for (let j = 1; j <= cols.length; j++) {
          if (j === cols.length || cols[j][outer] !== cols[start][outer]) {
            annotations.push({ x: (start + j - 1) / 2, y: 1, xref: 'x', yref: 'paper', yanchor: 'bottom', text: `<b>${U.esc(U.trunc(cols[start][outer], 22))}</b>`, showarrow: false, font: { size: 11 } });
            if (j < cols.length) shapes.push({ type: 'line', x0: j - 0.5, x1: j - 0.5, yref: 'paper', y0: 0, y1: 1, line: { color: '#111827', width: 1.5 } });
            start = j;
          }
        }
      }
      U.plot(plotDiv, [{
        type: 'heatmap', z, text, customdata: cd, texttemplate: '%{text}', hovertemplate: '%{customdata}<extra></extra>',
        x: cols.map((_, j) => j), y: rows.map((_, i) => i), colorscale: U.DIVERGING, zmid: 0, zmin: -zmax, zmax,
        xgap: 1, ygap: 1, textfont: { size: 10 },
        colorbar: { title: { text: types.size === 1 && types.has('NES') ? 'NES' : 'score', side: 'right' }, thickness: 12, len: Math.min(1, 300 / (rows.length * 17 + 100)) },
      }], {
        height: Math.max(320, rows.length * 17 + 200), margin: { l: 340, r: 20, t: multi ? 40 : 10, b: 130 },
        plot_bgcolor: '#eceef2',
        xaxis: { tickvals: cols.map((_, j) => j), ticktext, tickangle: -45, showgrid: false, zeroline: false, tickfont: { size: 11 } },
        yaxis: { tickvals: rows.map((_, i) => i), ticktext: rows.map(r => U.trunc(U.pretty(r.name), 55)), autorange: 'reversed', showgrid: false, zeroline: false, tickfont: { size: 11 } },
        shapes, annotations,
      }, pt => {
        const r = rows[pt.y], c = cols[pt.x];
        if (r && c) Drawer.open({ type: 'path', id: r.name, ctx: { ct: c.ct, cmp: c.cmp } });
      });
    }
    draw();
  }

  /** Auto-generated leads: pathways that change in one comparison but not another, and broadly shared changes. */
  function leadsCard(root, d, ui) {
    const s = Store.settings, cmps = d.comparisons.filter(c => ui.cmps.includes(c));
    const byPathCt = new Map();
    for (const t of Object.values(d.gsea)) {
      if (!cmps.includes(t.comparison) || (ui.coll !== '(all)' && t.collection !== ui.coll)) continue;
      t.names.forEach((n, i) => {
        const k = n + '||' + t.celltype;
        if (!byPathCt.has(k)) byPathCt.set(k, { name: n, ct: t.celltype, by: {} });
        const cur = byPathCt.get(k).by[t.comparison], q = Store.pathQ(t, i);
        if (!cur || q < cur.q) byPathCt.get(k).by[t.comparison] = { score: t.score[i], q };
      });
    }
    const specific = [];
    for (const e of byPathCt.values()) {
      const tested = cmps.filter(c => e.by[c]);
      const sig = tested.filter(c => e.by[c].q < s.gseaPadj);
      if (tested.length < 2 || !sig.length || sig.length === tested.length) continue;
      const best = sig.reduce((a, b) => (Math.abs(e.by[b].score) > Math.abs(e.by[a].score) ? b : a));
      specific.push({ ...e, best, sig, ns: tested.filter(c => !sig.includes(c)), mag: Math.abs(e.by[best].score) });
    }
    specific.sort((a, b) => b.mag - a.mag);
    const shared = [];
    const byPathCmp = new Map();
    for (const e of byPathCt.values()) for (const c of cmps) {
      const v = e.by[c]; if (!v) continue;
      const k = e.name + '||' + c;
      if (!byPathCmp.has(k)) byPathCmp.set(k, { name: e.name, cmp: c, up: [], down: [], tested: 0 });
      const o = byPathCmp.get(k); o.tested++;
      if (v.q < s.gseaPadj) (v.score > 0 ? o.up : o.down).push(e.ct);
    }
    for (const o of byPathCmp.values()) {
      const n = Math.max(o.up.length, o.down.length);
      if (n >= 3 && n / o.tested >= 0.4) shared.push({ ...o, n, dir: o.up.length >= o.down.length ? 1 : -1 });
    }
    shared.sort((a, b) => b.n - a.n);

    const left = U.h('div'), right = U.h('div');
    specific.slice(0, 15).forEach(e => {
      const v = e.by[e.best];
      left.append(U.h('div', { class: 'insight', onclick: () => Drawer.open({ type: 'path', id: e.name, ctx: { ct: e.ct, cmp: e.best } }) },
        U.h('b', {}, e.ct), ' — ', U.pretty(e.name), ' ',
        U.h('span', { class: 'chip ' + (v.score > 0 ? 'up' : 'down') }, `${U.arrow(v.score)} ${e.best} (${U.fmt(v.score)}, ${U.qn()} ${U.fmtP(v.q)})`),
        U.h('span', { class: 'muted' }, ` not significant in ${e.ns.join(', ')}`)));
    });
    shared.slice(0, 15).forEach(o => {
      const cts = o.dir > 0 ? o.up : o.down;
      right.append(U.h('div', { class: 'insight', onclick: () => Drawer.open({ type: 'path', id: o.name, ctx: { ct: cts[0], cmp: o.cmp } }) },
        U.pretty(o.name), ' ',
        U.h('span', { class: 'chip ' + (o.dir > 0 ? 'up' : 'down') }, `${U.arrow(o.dir)} in ${cts.length}/${o.tested} cell types`),
        U.h('span', { class: 'muted' }, ` · ${o.cmp}: ${cts.join(', ')}`)));
    });
    if (!specific.length) left.append(U.h('p', { class: 'muted' }, 'Nothing found. Select at least two comparisons above.'));
    if (!shared.length) right.append(U.h('p', { class: 'muted' }, 'No pathway changes in the same direction in ≥3 cell types.'));
    root.append(U.card('Leads worth a look',
      'Generated automatically from the pathway results (uses the comparisons and collection selected above). These are starting points to check, not conclusions: "not significant" does not mean "no effect".',
      U.h('div', { class: 'grid2b' },
        U.h('div', {}, U.h('h4', {}, 'Changes seen in one comparison but not others'), left),
        U.h('div', {}, U.h('h4', {}, 'Changes shared across many cell types'), right))));
  }

  return { render };
})();
