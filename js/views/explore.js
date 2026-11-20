'use strict';
/* Cell type explorer: volcano, gene table, pathway bars for one cell type × comparison. */
const ExploreView = (() => {
  let selection = [];

  function render(root) {
    const d = Store.d(), s = Store.settings;
    const ui = Store.uiGet('explore', { ct: null, cmp: null, overlay: 'none', custom: null, find: '', labelN: 12, coll: null, tblSig: true, tblQ: '', tblSort: 'q', tblDir: 1, tblN: 100, pq: '' });
    if (!d.celltypes.includes(ui.ct)) ui.ct = d.celltypes[0];
    if (!d.comparisons.includes(ui.cmp)) ui.cmp = d.comparisons[0];
    const ctx = { ct: ui.ct, cmp: ui.cmp };
    const rerender = () => { Store.uiSave(); App.render(); };

    root.append(U.h('div', { class: 'view-head' },
      U.h('h2', {}, 'Cell type explorer'),
      U.h('p', { class: 'muted' }, 'Pick a cell type and a comparison. Click any point, row or bar for details. To select a group of genes, choose the box or lasso tool (top-right of the volcano) and drag.')));

    const pills = U.h('div', { class: 'pills' }, d.celltypes.map(ct => {
      const t = Store.degTable(ct, ui.cmp), c = t ? Store.degCounts(t) : null;
      return U.h('button', { class: 'pill' + (ct === ui.ct ? ' active' : ''), onclick: () => { ui.ct = ct; selection = []; rerender(); } },
        ct, c ? U.h('span', { class: 'n' }, c.up + c.down) : null);
    }));
    root.append(U.card(null, null,
      U.h('div', { class: 'controls' }, U.h('label', {}, 'Comparison',
        U.select(d.comparisons.map(c => [c, Store.cmpLabel(c)]), ui.cmp, v => { ui.cmp = v; selection = []; rerender(); }))),
      pills));

    const t = Store.degTable(ui.ct, ui.cmp);
    const grid = U.h('div', { class: 'grid2' });
    root.append(grid);

    const volDiv = U.h('div', { style: { minHeight: '200px' } });
    const find = U.h('input', { type: 'search', placeholder: 'e.g. Esr1, Bdnf', value: ui.find, style: { width: '170px' } });
    find.addEventListener('change', () => { ui.find = find.value; rerender(); });
    const controls = U.h('div', { class: 'controls' },
      U.h('label', {}, 'Find genes', find),
      U.h('label', {}, 'Highlight', overlaySelect(ui, ctx, rerender)),
      U.select([0, 5, 12, 25, 50].map(n => [n, `${n} labels`]), ui.labelN, v => { ui.labelN = +v; rerender(); }));
    grid.append(U.card(`Volcano: ${ui.ct} · ${ui.cmp}`,
      t ? `${t.genes.length.toLocaleString()} genes tested. Red/blue = FDR < ${s.degPadj} and |log2FC| ≥ ${s.degLfc}. Positive log2FC = higher in the first group of “${ui.cmp}”${d.compLabels[ui.cmp] ? ` (${d.compLabels[ui.cmp]})` : ''}.` : 'No DEG table loaded for this cell type and comparison.',
      t ? controls : null, volDiv));
    const side = U.h('div');
    grid.append(side);
    if (t) { drawVolcano(volDiv, t, ui, ctx); side.append(summaryCard(t, ctx)); }
    const selCard = U.h('section', { class: 'card', id: 'sel-card' });
    side.append(selCard);
    renderSelection(selCard, t, ctx, ui);
    if (t) root.append(tableCard(t, ui, ctx));
    root.append(pathCard(ui, ctx));
  }

  // ---------- highlighting ----------
  function overlaySelect(ui, ctx, onchange) {
    const s = U.h('select');
    const add = (parent, v, l) => parent.append(U.h('option', { value: v }, l));
    add(s, 'none', '— nothing —');
    add(s, 'star', `Starred genes (${Store.starred('gene').length})`);
    if (ui.custom) add(s, 'custom', `${ui.custom.label} (${ui.custom.genes.length})`);
    const pg = U.h('optgroup', { label: 'Driver genes of a pathway (this cell type)' });
    const rows = [];
    for (const t of Store.gseaTables(ctx.ct, ctx.cmp)) if (t.genes) t.names.forEach((n, i) => rows.push({ n, q: Store.pathQ(t, i), score: t.score[i] }));
    rows.sort((a, b) => a.q - b.q);
    const seen = new Set();
    for (const r of rows) { if (seen.has(r.n) || seen.size >= 300) continue; seen.add(r.n); add(pg, 'path::' + r.n, `${U.arrow(r.score)} ${U.trunc(U.pretty(r.n), 60)} (FDR ${U.fmtP(r.q)})`); }
    if (seen.size) s.append(pg);
    const refs = Object.values(Store.d().refs);
    if (refs.length) { const rg = U.h('optgroup', { label: 'Published datasets' }); refs.forEach(r => add(rg, 'ref::' + r.id, r.name)); s.append(rg); }
    s.value = ui.overlay;
    if (s.value !== ui.overlay) { ui.overlay = 'none'; s.value = 'none'; }
    s.addEventListener('change', () => { ui.overlay = s.value; onchange(); });
    return s;
  }
  function overlayGenes(ui, ctx) {
    const v = ui.overlay;
    if (!v || v === 'none') return null;
    if (v === 'star') return { label: 'Starred', genes: Store.starred('gene') };
    if (v === 'custom') return ui.custom;
    if (v.startsWith('path::')) {
      const name = v.slice(6), genes = new Set();
      for (const t of Store.gseaTables(ctx.ct, ctx.cmp)) if (t.genes) t.names.forEach((n, i) => { if (n === name) t.genes[i].forEach(g => genes.add(g)); });
      return { label: U.trunc(U.pretty(name), 40), genes: [...genes] };
    }
    if (v.startsWith('ref::')) {
      const r = Store.d().refs[v.slice(5)];
      return r ? { label: r.name, genes: [...Store.refSig(r).keys()] } : null;
    }
    return null;
  }
  const parseList = s => (s || '').split(/[\s,;]+/).map(x => x.trim()).filter(Boolean);

  // ---------- volcano ----------
  function drawVolcano(div, t, ui, ctx) {
    const n = t.genes.length;
    const useP = !!t.p && t.p.some(Number.isFinite);
    const pv = useP ? t.p : t.padj || t.p;
    let minPos = 1;
    for (const v of pv) if (v > 0 && v < minPos) minPos = v;
    const ys = new Array(n), groups = { ns: [], up: [], down: [] };
    for (let i = 0; i < n; i++) {
      const p = pv[i];
      ys[i] = Number.isFinite(p) ? -Math.log10(p > 0 ? p : minPos / 10) : 0;
      groups[Store.isSig(t, i) ? (t.lfc[i] > 0 ? 'up' : 'down') : 'ns'].push(i);
    }
    const mk = (ix, name, color, size, extra = {}) => ({
      type: 'scattergl', mode: 'markers', name,
      x: ix.map(i => t.lfc[i]), y: ix.map(i => ys[i]),
      customdata: ix.map(i => [t.genes[i], U.fmtP(Store.degQ(t, i))]),
      hovertemplate: '<b>%{customdata[0]}</b><br>log2FC %{x:.3f}<br>FDR %{customdata[1]}<extra></extra>',
      marker: Object.assign({ color, size, opacity: 0.85 }, extra),
    });
    const traces = [
      mk(groups.ns, `not significant (${groups.ns.length.toLocaleString()})`, '#c4c9d2', 4, { opacity: 0.6 }),
      mk(groups.up, `up (${groups.up.length})`, '#b2182b', 6),
      mk(groups.down, `down (${groups.down.length})`, '#2166ac', 6),
    ];
    const ov = overlayGenes(ui, ctx);
    let ovIdx = [];
    if (ov) {
      ovIdx = ov.genes.map(g => Store.lookup(t, g)).filter(i => i != null);
      traces.push(mk(ovIdx, `${U.trunc(ov.label, 30)} (${ovIdx.length}/${ov.genes.length} in table)`, '#f59e0b', 9, { opacity: 1, line: { color: '#78350f', width: 1 } }));
    }
    const findIdx = [], missing = [];
    for (const g of parseList(ui.find)) { const i = Store.lookup(t, g); if (i == null) missing.push(g); else findIdx.push(i); }
    if (findIdx.length) traces.push(mk(findIdx, 'searched', '#111827', 12, { symbol: 'circle-open', line: { width: 2.5, color: '#111827' }, opacity: 1 }));
    if (missing.length) U.toast(`Not in this table: ${missing.join(', ')}`);

    const lab = new Set();
    // Label the top genes by p-value even when none pass the FDR threshold (small-n pseudobulk designs).
    [...Array(n).keys()].sort((a, b) => ys[b] - ys[a]).slice(0, ui.labelN).forEach(i => lab.add(i));
    if (!groups.up.length && !groups.down.length) U.toast(`No gene passes FDR < ${Store.settings.degPadj} here; labels show the top genes by p-value.`, 4000);
    ovIdx.filter(i => Store.isSig(t, i)).sort((a, b) => ys[b] - ys[a]).slice(0, 15).forEach(i => lab.add(i));
    findIdx.forEach(i => lab.add(i));
    const annotations = [...lab].map(i => ({
      x: t.lfc[i], y: ys[i], text: t.genes[i], showarrow: true, arrowhead: 0, arrowwidth: 1, arrowcolor: '#9ca3af',
      ax: t.lfc[i] > 0 ? 22 : -22, ay: -16, font: { size: 11 }, bgcolor: 'rgba(255,255,255,.7)',
    }));
    const s = Store.settings;
    const shapes = [-s.degLfc, s.degLfc].filter(x => x !== 0).map(x => ({ type: 'line', x0: x, x1: x, yref: 'paper', y0: 0, y1: 1, line: { dash: 'dot', color: '#9ca3af', width: 1 } }));
    const sigY = groups.up.concat(groups.down).map(i => ys[i]);
    if (sigY.length) { const y = Math.min(...sigY); shapes.push({ type: 'line', xref: 'paper', x0: 0, x1: 1, y0: y, y1: y, line: { dash: 'dot', color: '#9ca3af', width: 1 } }); }
    U.plot(div, traces, {
      height: 540, margin: { l: 55, r: 10, t: 10, b: 40 }, hovermode: 'closest', dragmode: 'zoom',
      xaxis: { title: { text: 'log2 fold change' }, zeroline: true, zerolinecolor: '#d1d5db', gridcolor: '#f1f2f4' },
      yaxis: { title: { text: useP ? '−log10 p-value' : '−log10 FDR' }, gridcolor: '#f1f2f4' },
      legend: { orientation: 'h', y: 1.08, x: 0, font: { size: 11 } }, annotations, shapes,
    }, pt => Drawer.open({ type: 'gene', id: pt.customdata[0], ctx }), ev => {
      selection = ev && ev.points ? [...new Set(ev.points.map(p => p.customdata[0]))] : [];
      renderSelection(U.$('#sel-card'), t, ctx, ui);
    });
  }

  function chip(g, dir, ctx) {
    return U.h('span', { class: 'chip ' + (dir > 0 ? 'up' : dir < 0 ? 'down' : ''), onclick: () => Drawer.open({ type: 'gene', id: g, ctx }) }, g);
  }

  function summaryCard(t, ctx) {
    const c = Store.degCounts(t);
    const sig = [...Array(t.genes.length).keys()].filter(i => Store.isSig(t, i));
    const top = dir => sig.filter(i => Math.sign(t.lfc[i]) === dir).sort((a, b) => Store.degQ(t, a) - Store.degQ(t, b) || Math.abs(t.lfc[b]) - Math.abs(t.lfc[a])).slice(0, 15);
    const starCount = Store.starred('gene').filter(g => Store.lookup(t, g) != null).length;
    return U.card('At a glance', null,
      U.h('div', { class: 'kv' },
        U.h('span', { class: 'muted' }, 'Up'), U.h('b', {}, c.up),
        U.h('span', { class: 'muted' }, 'Down'), U.h('b', {}, c.down),
        U.h('span', { class: 'muted' }, 'Starred here'), U.h('span', {}, starCount)),
      U.h('h4', {}, 'Most significant up'), U.h('div', { class: 'chips' }, top(1).map(i => chip(t.genes[i], 1, ctx))),
      U.h('h4', {}, 'Most significant down'), U.h('div', { class: 'chips' }, top(-1).map(i => chip(t.genes[i], -1, ctx))));
  }

  // ---------- selection ----------
  function renderSelection(el, t, ctx, ui) {
    el.innerHTML = '';
    if (!selection.length) {
      el.append(U.h('h3', {}, 'Selected genes'), U.h('div', { class: 'sub' }, 'Draw a box or lasso around a group of points on the volcano to ask what they have in common (shared pathways, overlap with published data). Double-click the plot to clear.'));
      return;
    }
    const sel = new Set(selection);
    const lfcOf = g => { const i = t ? Store.lookup(t, g) : null; return i == null ? 0 : t.lfc[i]; };
    el.append(U.h('h3', {}, `${selection.length} genes selected`),
      U.h('div', { class: 'btnrow', style: { margin: '6px 0' } },
        U.h('button', { class: 'small', onclick: () => U.copy(selection.join('\n')) }, 'Copy'),
        U.h('button', { class: 'small', onclick: () => { selection.forEach(g => Store.setStar('gene', g, true, ctx)); Store.saveNotes(); U.toast(`Starred ${selection.length} genes`); } }, '★ Star all'),
        U.h('button', { class: 'small', onclick: () => { ui.custom = { label: 'Selection', genes: selection.slice() }; ui.overlay = 'custom'; Store.uiSave(); App.render(); } }, 'Keep highlighted')),
      U.h('div', { class: 'chips', style: { maxHeight: '120px', overflow: 'auto' } }, selection.slice(0, 150).map(g => chip(g, Math.sign(lfcOf(g)), ctx))));

    const N = t ? t.genes.length : Store.index().genes.length;
    const hits = [];
    for (const gt of Store.gseaTables(ctx.ct, ctx.cmp)) {
      if (!gt.genes) continue;
      gt.names.forEach((n, i) => {
        const gl = gt.genes[i]; const ov = gl.filter(g => sel.has(g));
        if (ov.length >= 2) hits.push({ n, ov, K: gl.length, q: Store.pathQ(gt, i), score: gt.score[i], p: U.phyper(ov.length, N, gl.length, sel.size) });
      });
    }
    hits.sort((a, b) => a.p - b.p);
    el.append(U.h('h4', {}, 'Pathways sharing these genes (this cell type)'));
    if (!hits.length) el.append(U.h('p', { class: 'muted small-text' }, 'No pathway driver-gene lists contain ≥2 of these genes.'));
    else el.append(U.h('table', { class: 'tbl' },
      U.h('tr', {}, U.h('th', {}, 'Pathway'), U.h('th', { class: 'num' }, 'shared'), U.h('th', { class: 'num' }, 'NES'), U.h('th', { class: 'num', title: 'hypergeometric p for the overlap' }, 'overlap p')),
      hits.slice(0, 12).map(x => U.h('tr', { class: 'click', title: x.ov.join(', '), onclick: () => Drawer.open({ type: 'path', id: x.n, ctx }) },
        U.h('td', {}, U.trunc(U.pretty(x.n), 48)), U.h('td', { class: 'num' }, `${x.ov.length}/${x.K}`),
        U.h('td', { class: 'num' }, U.fmt(x.score)), U.h('td', { class: 'num' }, U.fmtP(x.p))))));

    const refs = Object.values(Store.d().refs);
    if (refs.length) {
      el.append(U.h('h4', {}, 'Also changed in published datasets'));
      el.append(U.h('div', {}, refs.map(r => {
        const m = Store.refSig(r), ov = selection.filter(g => m.has(g));
        return U.h('div', { class: 'small-text', style: { marginBottom: '4px' } }, U.h('b', {}, `${ov.length}`), ` / ${selection.length} — ${r.name}`,
          ov.length ? U.h('div', { class: 'chips' }, ov.slice(0, 30).map(g => chip(g, m.get(g), ctx))) : null);
      })));
    }
  }

  // ---------- table ----------
  function tableCard(t, ui, ctx) {
    const wrap = U.h('div', { class: 'scroll' }), foot = U.h('div', { class: 'muted small-text', style: { marginTop: '6px' } });
    const q = U.h('input', { type: 'search', placeholder: 'filter genes…', value: ui.tblQ, style: { width: '160px' } });
    q.addEventListener('input', U.debounce(() => { ui.tblQ = q.value.trim(); ui.tblN = 100; draw(); }, 200));
    const g2p = Store.index().gene2paths, ctxKeys = new Set(Store.gseaTables(ctx.ct, ctx.cmp).map(x => Store.key(x.celltype, x.comparison, x.collection)));
    const nPaths = g => (g2p.get(g) || []).filter(e => ctxKeys.has(e.k)).length;
    let current = [];
    const card = U.card('Gene table', 'Sorted by significance. Click a column header to sort, a row for details. “Pathways” counts significant pathways in this cell type that list the gene as a driver.',
      U.h('div', { class: 'controls' }, q,
        U.h('label', {}, U.h('input', { type: 'checkbox', checked: ui.tblSig, onchange: e => { ui.tblSig = e.target.checked; ui.tblN = 100; draw(); } }), 'significant only'),
        U.h('button', { class: 'small', onclick: () => U.download(`${ctx.ct}__${ctx.cmp}__genes.csv`, U.toCSV(['gene', 'log2FC', 'p', 'padj'], current.map(i => [t.genes[i], t.lfc[i], t.p ? t.p[i] : '', t.padj ? t.padj[i] : ''])), 'text/csv') }, 'Download CSV')),
      wrap, foot);
    function draw() {
      Store.uiSave();
      let ix = [...Array(t.genes.length).keys()];
      if (ui.tblSig) ix = ix.filter(i => Store.isSig(t, i));
      if (ui.tblQ) { const ql = ui.tblQ.toLowerCase(); ix = ix.filter(i => t.genes[i].toLowerCase().includes(ql)); }
      const dir = ui.tblDir;
      const keyf = { q: i => Store.degQ(t, i), lfc: i => t.lfc[i], abs: i => -Math.abs(t.lfc[i]), gene: i => t.genes[i] }[ui.tblSort] || (i => Store.degQ(t, i));
      ix.sort((a, b) => { const x = keyf(a), y = keyf(b); return (typeof x === 'string' ? x.localeCompare(y) : (x - y) || 0) * dir; });
      current = ix;
      const shown = ix.slice(0, ui.tblN);
      const th = (label, k, cls) => U.h('th', { class: 'sortable ' + (cls || ''), onclick: () => { if (ui.tblSort === k) ui.tblDir *= -1; else { ui.tblSort = k; ui.tblDir = k === 'lfc' ? -1 : 1; } draw(); } }, label + (ui.tblSort === k ? (ui.tblDir > 0 ? ' ▲' : ' ▼') : ''));
      wrap.innerHTML = '';
      wrap.append(U.h('table', { class: 'tbl' },
        U.h('tr', {}, U.h('th', {}, '★'), th('Gene', 'gene'), th('log2FC', 'lfc', 'num'), U.h('th', { class: 'num' }, 'p'), th('FDR', 'q', 'num'), U.h('th', { class: 'num' }, 'Pathways')),
        shown.map(i => {
          const g = t.genes[i], st = Store.isStarred('gene', g);
          return U.h('tr', { class: 'click', onclick: () => Drawer.open({ type: 'gene', id: g, ctx }) },
            U.h('td', {}, U.h('button', { class: 'star' + (st ? ' on' : ''), onclick: e => { e.stopPropagation(); const on = Store.toggleStar('gene', g, ctx); e.target.classList.toggle('on', on); } }, '★')),
            U.h('td', {}, U.h('b', {}, g)),
            U.h('td', { class: 'num', style: { color: t.lfc[i] > 0 ? 'var(--up)' : 'var(--down)' } }, U.signed(t.lfc[i])),
            U.h('td', { class: 'num' }, U.fmtP(t.p ? t.p[i] : NaN)),
            U.h('td', { class: 'num' }, U.fmtP(t.padj ? t.padj[i] : NaN)),
            U.h('td', { class: 'num' }, nPaths(g) || ''));
        })));
      foot.innerHTML = '';
      foot.append(`Showing ${shown.length.toLocaleString()} of ${ix.length.toLocaleString()} genes. `);
      if (ix.length > shown.length) foot.append(U.h('button', { class: 'small', onclick: () => { ui.tblN += 200; draw(); } }, 'Show more'));
    }
    draw();
    return card;
  }

  // ---------- pathways ----------
  function pathCard(ui, ctx) {
    const s = Store.settings, tabs = Store.gseaTables(ctx.ct, ctx.cmp);
    if (!tabs.length) return U.card('Pathways', 'No pathway / GSEA results loaded for this cell type and comparison.');
    const colls = [...new Set(tabs.map(t => t.collection))];
    if (!colls.includes(ui.coll)) ui.coll = colls[0];
    const rows = [];
    for (const t of tabs.filter(x => x.collection === ui.coll)) t.names.forEach((n, i) => rows.push({ n, score: t.score[i], q: Store.pathQ(t, i), size: t.size ? t.size[i] : NaN, nLE: t.genes && t.genes[i] ? t.genes[i].length : 0, type: t.scoreType }));
    const sig = rows.filter(r => r.q < s.gseaPadj);
    const pool = sig.length ? sig : rows;
    const ups = pool.filter(r => r.score > 0).sort((a, b) => b.score - a.score).slice(0, 15);
    const downs = pool.filter(r => r.score < 0).sort((a, b) => a.score - b.score).slice(0, 15);
    const bars = [...ups, ...downs.slice().reverse()]; // strongest up at top, strongest down at bottom
    const plotDiv = U.h('div'), tblWrap = U.h('div', { class: 'scroll' });
    const q = U.h('input', { type: 'search', placeholder: 'search all pathways…', value: ui.pq, style: { width: '220px' } });
    const card = U.card(`Pathways: ${ctx.ct} · ${ctx.cmp}`,
      sig.length ? `${sig.length} of ${rows.length} pathways pass FDR < ${s.gseaPadj}. Top 15 in each direction are shown. Click a bar for its driver genes.`
        : `No pathway passes FDR < ${s.gseaPadj}; showing the strongest trends (faded) for orientation only.`,
      U.h('div', { class: 'controls' }, U.h('label', {}, 'Collection', U.select(colls, ui.coll, v => { ui.coll = v; Store.uiSave(); App.render(); }))),
      plotDiv, U.h('h4', {}, 'All pathways'), q, tblWrap);
    setTimeout(() => {
      if (!bars.length) { plotDiv.append(U.h('p', { class: 'muted' }, 'No pathways.')); return; }
      U.plot(plotDiv, [{
        type: 'bar', orientation: 'h', x: bars.map(r => r.score), y: bars.map((_, i) => i),
        marker: { color: bars.map(r => (r.score > 0 ? '#b2182b' : '#2166ac')), opacity: bars.map(r => (r.q < s.gseaPadj ? 0.9 : 0.35)) },
        customdata: bars.map(r => `<b>${U.esc(U.pretty(r.n))}</b><br>${r.type === 'NES' ? 'NES' : 'score'} ${U.fmt(r.score)} · FDR ${U.fmtP(r.q)}${r.nLE ? `<br>${r.nLE} driver genes` : ''}`),
        hovertemplate: '%{customdata}<extra></extra>',
      }], {
        height: 60 + bars.length * 20, margin: { l: 360, r: 20, t: 10, b: 40 },
        xaxis: { title: { text: bars[0].type === 'NES' ? 'NES' : 'score' }, zeroline: true, zerolinecolor: '#9ca3af', gridcolor: '#f1f2f4' },
        yaxis: { tickvals: bars.map((_, i) => i), ticktext: bars.map(r => U.trunc(U.pretty(r.n), 58)), autorange: 'reversed', tickfont: { size: 11 } },
      }, pt => Drawer.open({ type: 'path', id: bars[pt.y].n, ctx }));
    });
    function drawTable() {
      const ql = ui.pq.toLowerCase();
      const list = rows.filter(r => !ql || r.n.toLowerCase().includes(ql) || U.pretty(r.n).toLowerCase().includes(ql)).sort((a, b) => a.q - b.q).slice(0, 200);
      tblWrap.innerHTML = '';
      tblWrap.append(U.h('table', { class: 'tbl' },
        U.h('tr', {}, U.h('th', {}, 'Pathway'), U.h('th', { class: 'num' }, 'score'), U.h('th', { class: 'num' }, 'FDR'), U.h('th', { class: 'num' }, 'size'), U.h('th', { class: 'num' }, 'drivers')),
        list.map(r => U.h('tr', { class: 'click', onclick: () => Drawer.open({ type: 'path', id: r.n, ctx }) },
          U.h('td', {}, U.pretty(r.n)), U.h('td', { class: 'num', style: { color: r.score > 0 ? 'var(--up)' : 'var(--down)' } }, U.fmt(r.score)),
          U.h('td', { class: 'num' }, U.fmtP(r.q)), U.h('td', { class: 'num' }, Number.isFinite(r.size) ? r.size : ''), U.h('td', { class: 'num' }, r.nLE || '')))));
    }
    q.addEventListener('input', U.debounce(() => { ui.pq = q.value.trim(); Store.uiSave(); drawTable(); }, 200));
    drawTable();
    return card;
  }

  return { render };
})();
