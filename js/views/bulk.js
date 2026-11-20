'use strict';
/* A bulk RNA-seq dataset shown on its own (Published data tab), kept apart from the scRNA results.
 * Data lives in Store.d().bulk = { title, description, citation, contexts, comparisons, compLabels, deg, gsea }. */
const BulkView = (() => {
  const key = (a, b, c) => [a, b, c].filter(x => x != null).join('||');

  function render(root, B) {
    const ui = Store.uiGet('bulk', { ctx: B.contexts[0], cmp: B.comparisons[0], coll: 'Hallmark', gene: null, open: true });
    if (!B.contexts.includes(ui.ctx)) ui.ctx = B.contexts[0];
    if (!B.comparisons.includes(ui.cmp)) ui.cmp = B.comparisons[0];
    const colls = [...new Set(Object.values(B.gsea).map(t => t.collection))];
    if (!colls.includes(ui.coll)) ui.coll = colls[0];
    const rerender = () => { Store.uiSave(); App.render(); };
    const lab = c => (B.compLabels && B.compLabels[c]) || c;
    const S = Store.settings, useP = Store.usingP(), qv = (t, i) => (useP ? t.p[i] : t.padj[i]), Q = U.qn();
    const sigI = (t, i) => qv(t, i) < S.degPadj && Math.abs(t.lfc[i]) >= S.degLfc;

    const body = U.h('div');
    const card = U.card(B.title, null,
      U.h('div', { class: 'muted small-text', style: { marginBottom: '8px' } }, [B.description, B.citation].filter(Boolean).join(' — ')),
      U.thresholdBar(), U.h('div', { style: { height: '10px' } }),
      body);
    root.append(card);

    // ---- volcano + top genes ----
    const t = B.deg[key(ui.ctx, ui.cmp)];
    body.append(U.h('div', { class: 'controls' },
      U.h('label', {}, 'Age', U.select(B.contexts, ui.ctx, v => { ui.ctx = v; rerender(); })),
      U.h('label', {}, 'Comparison', U.select(B.comparisons.map(c => [c, lab(c)]), ui.cmp, v => { ui.cmp = v; rerender(); }))));
    const grid = U.h('div', { class: 'grid2b' }), vol = U.h('div'), tbl = U.h('div', { class: 'scroll', style: { maxHeight: '420px' } });
    grid.append(vol, tbl); body.append(grid);
    body.append(U.h('div', { class: 'muted small-text', style: { marginTop: '6px' } }, 'Click a gene (plot or table) to open its detail panel.'));

    if (t) {
      const n = t.genes.length, idx = [...Array(n).keys()].filter(i => Number.isFinite(t.lfc[i]) && Number.isFinite(t.p[i]));
      const sig = idx.filter(i => sigI(t, i)), rest = idx.filter(i => !sigI(t, i));
      let minPos = 1; for (const i of idx) if (qv(t, i) > 0 && qv(t, i) < minPos) minPos = qv(t, i);
      const yv = i => -Math.log10(qv(t, i) > 0 ? qv(t, i) : minPos / 10);
      const top = idx.slice().sort((a, b) => t.p[a] - t.p[b]).slice(0, 12);
      const tr = (ix, name, color, size) => ({
        type: 'scattergl', mode: 'markers', name, x: ix.map(i => t.lfc[i]), y: ix.map(i => yv(i)), customdata: ix.map(i => t.genes[i]),
        text: ix.map(i => `FDR ${U.fmtP(t.padj[i])}, p ${U.fmtP(t.p[i])}`), hovertemplate: '<b>%{customdata}</b><br>log2FC %{x:.2f}<br>%{text}<extra></extra>',
        marker: { color, size, opacity: 0.85 },
      });
      U.plot(vol, [
        tr(rest, 'not significant', '#d1d5db', 4),
        tr(sig.filter(i => t.lfc[i] > 0), 'up', '#b2182b', 7), tr(sig.filter(i => t.lfc[i] < 0), 'down', '#2166ac', 7),
      ], {
        height: 420, margin: { l: 55, r: 10, t: 30, b: 45 }, hovermode: 'closest', legend: { orientation: 'h', y: -0.18, font: { size: 11 } },
        xaxis: { title: { text: 'log2 fold change' }, zeroline: true, zerolinecolor: '#9ca3af', gridcolor: '#f1f2f4' },
        yaxis: { title: { text: useP ? '−log10 p-value' : '−log10 FDR (adjusted p)' }, gridcolor: '#f1f2f4', rangemode: 'tozero' },
        shapes: [-S.degLfc, S.degLfc].filter(x => x !== 0).map(x => ({ type: 'line', x0: x, x1: x, yref: 'paper', y0: 0, y1: 1, line: { dash: 'dot', color: '#9ca3af', width: 1 } }))
          .concat(S.degPadj > 0 && S.degPadj < 1 ? [{ type: 'line', xref: 'paper', x0: 0, x1: 1, y0: -Math.log10(S.degPadj), y1: -Math.log10(S.degPadj), line: { dash: 'dot', color: '#9ca3af', width: 1 } }] : []),
        annotations: [
          ...top.map(i => ({ x: t.lfc[i], y: yv(i), text: t.genes[i], showarrow: false, yshift: 9, font: { size: 10, color: '#374151' } })),
          { xref: 'paper', yref: 'paper', x: 0, y: 1.08, xanchor: 'left', showarrow: false, font: { size: 11, color: '#6b7280' },
            text: `${n.toLocaleString()} genes · ${sig.length} pass ${Q} < ${S.degPadj}${S.degLfc ? ` and |log2FC| ≥ ${S.degLfc}` : ''}${sig.length ? '' : ' · labels = top genes by p'}` },
        ],
      }, pt => openGene(pt.customdata));

      tbl.append(U.h('table', { class: 'tbl' },
        U.h('tr', {}, U.h('th', {}, 'Gene'), U.h('th', { class: 'num' }, 'log2FC'), U.h('th', { class: 'num' }, 'p'), U.h('th', { class: 'num' }, 'FDR')),
        idx.slice().sort((a, b) => t.p[a] - t.p[b]).slice(0, 100).map(i => U.h('tr', { class: 'click', onclick: () => openGene(t.genes[i]) },
          U.h('td', {}, U.h('b', {}, t.genes[i])),
          U.h('td', { class: 'num', style: { color: t.lfc[i] > 0 ? 'var(--up)' : 'var(--down)' } }, U.signed(t.lfc[i])),
          U.h('td', { class: 'num', style: useP && sigI(t, i) ? { fontWeight: 600 } : {} }, U.fmtP(t.p[i])), U.h('td', { class: 'num', style: !useP && sigI(t, i) ? { fontWeight: 600 } : {} }, U.fmtP(t.padj[i]))))));
    } else vol.append(U.h('p', { class: 'muted' }, 'No table for this age and comparison.'));


    // ---- pathways: every age x comparison ----
    const pw = U.h('div');
    body.append(U.h('h4', { style: { marginTop: '18px' } }, 'Pathways (GSEA): every age and comparison'),
      U.h('div', { class: 'controls' },
        U.h('label', {}, 'Gene sets', U.select(colls, ui.coll, v => { ui.coll = v; rerender(); })),
        U.h('span', { class: 'muted small-text' }, `Colour = NES (red: higher in the first group). Stars: * ${Q}<0.05, ** <0.01, *** <0.001 (· = passes your cutoff only). Shows pathways with ${Q} < ${S.gseaPadj} somewhere (top 40 for large collections).`)),
      pw);
    const cols = [];
    for (const ctx of B.contexts) for (const c of B.comparisons) { const g = B.gsea[key(ctx, c, ui.coll)]; if (g) cols.push({ ctx, c, g, map: new Map(g.names.map((n, i) => [n, i])) }); }
    const best = new Map();
    for (const col of cols) col.g.names.forEach((n, i) => { const q = col.g[useP ? 'p' : 'padj'][i]; if (q < (best.get(n) ?? Infinity)) best.set(n, q); });
    const paths = [...best.entries()].filter(([, q]) => q < S.gseaPadj).sort((a, b) => a[1] - b[1]).slice(0, 40).map(([n]) => n);
    if (!paths.length) { pw.append(U.h('p', { class: 'muted' }, `No pathway reaches ${Q} < ${S.gseaPadj} in this collection.`)); return; }
    const val = (col, n, f) => { const i = col.map.get(n); return i == null ? null : col.g[f][i]; };
    U.plot(pw, [{
      type: 'heatmap', x: cols.map((_, j) => j), y: paths.map((_, i) => i), xgap: 2, ygap: 2,
      z: paths.map(n => cols.map(col => val(col, n, 'nes'))),
      text: paths.map(n => cols.map(col => U.stars(val(col, n, useP ? 'p' : 'padj'), S.gseaPadj))), texttemplate: '%{text}',
      customdata: paths.map(n => cols.map(col => `<b>${U.esc(U.pretty(n))}</b><br>${U.esc(col.ctx)} · ${U.esc(lab(col.c))}<br>NES ${U.fmt(val(col, n, 'nes'))}, FDR ${U.fmtP(val(col, n, 'padj'))}, p ${U.fmtP(val(col, n, 'p'))}`)),
      hovertemplate: '%{customdata}<extra></extra>', colorscale: U.DIVERGING, zmid: 0, zmin: -3, zmax: 3,
      colorbar: { title: { text: 'NES', side: 'right' }, thickness: 12 },
    }], {
      height: 140 + 22 * paths.length, margin: { l: 330, r: 20, t: 10, b: 130 }, plot_bgcolor: '#eceef2',
      xaxis: { tickvals: cols.map((_, j) => j), ticktext: cols.map(col => `${col.ctx} · ${U.trunc(lab(col.c), 26)}`), tickangle: -35 },
      yaxis: { tickvals: paths.map((_, i) => i), ticktext: paths.map(n => U.trunc(U.pretty(n), 48)), autorange: 'reversed' },
    });
  }

  const openGene = g => Drawer.open({ type: 'gene', id: g, from: 'bulk' });

  /** log2FC of one gene in every age x comparison of the bulk dataset (used by the gene detail panel). */
  function geneTable(B, g) {
    const S = Store.settings, useP = Store.usingP();
    const lab = c => (B.compLabels && B.compLabels[c]) || c;
    const cell = (ctx, c) => {
      const tt = B.deg[key(ctx, c)], i = tt ? tt.genes.indexOf(g) : -1;
      if (i < 0) return U.h('td', { class: 'num muted' }, '–');
      const q = useP ? tt.p[i] : tt.padj[i], sig = q < S.degPadj && Math.abs(tt.lfc[i]) >= S.degLfc;
      return U.h('td', { class: 'num', style: { color: tt.lfc[i] > 0 ? 'var(--up)' : 'var(--down)', fontWeight: sig ? 600 : 400 }, title: `p ${U.fmtP(tt.p[i])}, FDR ${U.fmtP(tt.padj[i])}` },
        U.signed(tt.lfc[i]) + (sig ? ' *' : ''));
    };
    if (!Object.values(B.deg).some(t => t.genes.includes(g))) return U.h('p', { class: 'muted small-text' }, 'Not tested in the bulk data (not detected or filtered out).');
    return U.h('div', {},
      U.h('div', { class: 'hscroll' }, U.h('table', { class: 'tbl' },
        U.h('tr', {}, U.h('th', {}, ''), B.comparisons.map(c => U.h('th', { class: 'num' }, lab(c)))),
        B.contexts.map(ctx => U.h('tr', {}, U.h('td', {}, U.h('b', {}, ctx)), B.comparisons.map(c => cell(ctx, c)))))),
      U.h('div', { class: 'muted small-text' }, `log2FC; * = passes ${U.qn()} < ${S.degPadj} and |log2FC| ≥ ${S.degLfc}. Hover a value for p and FDR.`));
  }

  return { render, geneTable };
})();
