'use strict';
/* A bulk RNA-seq dataset shown on its own (Published data tab), kept apart from the scRNA results.
 * Data lives in Store.d().bulk = { title, description, citation, caveats, contexts, comparisons, compLabels, deg, gsea }. */
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

    const body = U.h('div');
    const card = U.card(B.title, null,
      U.h('div', { class: 'muted small-text', style: { marginBottom: '8px' } }, [B.description, B.citation].filter(Boolean).join(' — ')),
      B.caveats ? U.h('div', { class: 'callout' }, B.caveats) : null,
      body);
    root.append(card);

    // ---- volcano + top genes ----
    const t = B.deg[key(ui.ctx, ui.cmp)];
    body.append(U.h('div', { class: 'controls' },
      U.h('label', {}, 'Age', U.select(B.contexts, ui.ctx, v => { ui.ctx = v; rerender(); })),
      U.h('label', {}, 'Comparison', U.select(B.comparisons.map(c => [c, lab(c)]), ui.cmp, v => { ui.cmp = v; rerender(); }))));
    const grid = U.h('div', { class: 'grid2b' }), vol = U.h('div'), tbl = U.h('div', { class: 'scroll', style: { maxHeight: '420px' } });
    grid.append(vol, tbl); body.append(grid);
    const geneBox = U.h('div', { style: { marginTop: '10px' } });
    body.append(geneBox);

    if (t) {
      const n = t.genes.length, idx = [...Array(n).keys()].filter(i => Number.isFinite(t.lfc[i]) && Number.isFinite(t.p[i]));
      const fdr = idx.filter(i => t.padj[i] < 0.05), nom = idx.filter(i => !(t.padj[i] < 0.05) && t.p[i] < 0.01), rest = idx.filter(i => !(t.p[i] < 0.01));
      const top = idx.slice().sort((a, b) => t.p[a] - t.p[b]).slice(0, 12);
      const tr = (ix, name, color, size) => ({
        type: 'scattergl', mode: 'markers', name, x: ix.map(i => t.lfc[i]), y: ix.map(i => -Math.log10(t.p[i])), customdata: ix.map(i => t.genes[i]),
        text: ix.map(i => `FDR ${U.fmtP(t.padj[i])}`), hovertemplate: '<b>%{customdata}</b><br>log2FC %{x:.2f}<br>p %{y:.2f} (−log10)<br>%{text}<extra></extra>',
        marker: { color, size, opacity: 0.85 },
      });
      U.plot(vol, [
        tr(rest, 'p ≥ 0.01', '#d1d5db', 4),
        tr(nom.filter(i => t.lfc[i] > 0), 'up, p < 0.01', '#f4a582', 6), tr(nom.filter(i => t.lfc[i] < 0), 'down, p < 0.01', '#92c5de', 6),
        tr(fdr.filter(i => t.lfc[i] > 0), 'up, FDR < 0.05', '#b2182b', 8), tr(fdr.filter(i => t.lfc[i] < 0), 'down, FDR < 0.05', '#2166ac', 8),
      ], {
        height: 420, margin: { l: 55, r: 10, t: 30, b: 45 }, hovermode: 'closest', legend: { orientation: 'h', y: -0.18, font: { size: 11 } },
        xaxis: { title: { text: 'log2 fold change' }, zeroline: true, zerolinecolor: '#9ca3af', gridcolor: '#f1f2f4' },
        yaxis: { title: { text: '−log10 p' }, gridcolor: '#f1f2f4' },
        annotations: [
          ...top.map(i => ({ x: t.lfc[i], y: -Math.log10(t.p[i]), text: t.genes[i], showarrow: false, yshift: 9, font: { size: 10, color: '#374151' } })),
          { xref: 'paper', yref: 'paper', x: 0, y: 1.08, xanchor: 'left', showarrow: false, font: { size: 11, color: '#6b7280' },
            text: `${n.toLocaleString()} genes · FDR < 0.05: ${fdr.length} · nominal p < 0.01: ${nom.length + fdr.length}` },
        ],
      }, pt => { ui.gene = pt.customdata; Store.uiSave(); drawGene(); });

      tbl.append(U.h('table', { class: 'tbl' },
        U.h('tr', {}, U.h('th', {}, 'Gene'), U.h('th', { class: 'num' }, 'log2FC'), U.h('th', { class: 'num' }, 'p'), U.h('th', { class: 'num' }, 'FDR')),
        idx.slice().sort((a, b) => t.p[a] - t.p[b]).slice(0, 100).map(i => U.h('tr', { class: 'click', onclick: () => { ui.gene = t.genes[i]; Store.uiSave(); drawGene(); } },
          U.h('td', {}, U.h('b', {}, t.genes[i])),
          U.h('td', { class: 'num', style: { color: t.lfc[i] > 0 ? 'var(--up)' : 'var(--down)' } }, U.signed(t.lfc[i])),
          U.h('td', { class: 'num' }, U.fmtP(t.p[i])), U.h('td', { class: 'num' }, U.fmtP(t.padj[i]))))));
    } else vol.append(U.h('p', { class: 'muted' }, 'No table for this age and comparison.'));

    // one gene across every age x comparison
    function drawGene() {
      geneBox.innerHTML = '';
      const g = ui.gene;
      if (!g) { geneBox.append(U.h('div', { class: 'muted small-text' }, 'Click a gene (plot or table) to see it in every age and comparison.')); return; }
      const cell = (ctx, c) => {
        const tt = B.deg[key(ctx, c)], i = tt ? tt.genes.indexOf(g) : -1;
        if (i < 0) return U.h('td', { class: 'num muted' }, '–');
        return U.h('td', { class: 'num', style: { color: tt.lfc[i] > 0 ? 'var(--up)' : 'var(--down)' }, title: `p ${U.fmtP(tt.p[i])}, FDR ${U.fmtP(tt.padj[i])}` },
          `${U.signed(tt.lfc[i])} `, U.h('span', { class: 'muted' }, tt.p[i] < 0.01 ? (tt.padj[i] < 0.05 ? '(FDR<0.05)' : '(p<0.01)') : ''));
      };
      geneBox.append(U.h('h4', {}, `${g}: log2FC in the bulk data`),
        U.h('div', { class: 'hscroll' }, U.h('table', { class: 'tbl' },
          U.h('tr', {}, U.h('th', {}, ''), B.comparisons.map(c => U.h('th', { class: 'num' }, lab(c)))),
          B.contexts.map(ctx => U.h('tr', {}, U.h('td', {}, U.h('b', {}, ctx)), B.comparisons.map(c => cell(ctx, c)))))),
        U.h('div', { class: 'links' },
          U.h('a', { href: `https://www.ncbi.nlm.nih.gov/gene/?term=${encodeURIComponent(g)}[sym]+AND+mouse[orgn]`, target: '_blank', rel: 'noopener' }, 'NCBI Gene'),
          U.h('a', { href: `https://www.informatics.jax.org/searchtool/Search.do?query=${encodeURIComponent(g)}`, target: '_blank', rel: 'noopener' }, 'MGI')));
    }
    drawGene();

    // ---- pathways: every age x comparison ----
    const pw = U.h('div');
    body.append(U.h('h4', { style: { marginTop: '18px' } }, 'Pathways (GSEA): every age and comparison'),
      U.h('div', { class: 'controls' },
        U.h('label', {}, 'Gene sets', U.select(colls, ui.coll, v => { ui.coll = v; rerender(); })),
        U.h('span', { class: 'muted small-text' }, 'Colour = NES (red: higher in the first group). Stars = FDR. Shows pathways with FDR < 0.05 somewhere (top 40 for large collections).')),
      pw);
    const cols = [];
    for (const ctx of B.contexts) for (const c of B.comparisons) { const g = B.gsea[key(ctx, c, ui.coll)]; if (g) cols.push({ ctx, c, g, map: new Map(g.names.map((n, i) => [n, i])) }); }
    const best = new Map();
    for (const col of cols) col.g.names.forEach((n, i) => { const q = col.g.padj[i]; if (q < (best.get(n) ?? Infinity)) best.set(n, q); });
    const paths = [...best.entries()].filter(([, q]) => q < 0.05).sort((a, b) => a[1] - b[1]).slice(0, 40).map(([n]) => n);
    if (!paths.length) { pw.append(U.h('p', { class: 'muted' }, 'No pathway reaches FDR < 0.05 in this collection.')); return; }
    const val = (col, n, f) => { const i = col.map.get(n); return i == null ? null : col.g[f][i]; };
    U.plot(pw, [{
      type: 'heatmap', x: cols.map((_, j) => j), y: paths.map((_, i) => i), xgap: 2, ygap: 2,
      z: paths.map(n => cols.map(col => val(col, n, 'nes'))),
      text: paths.map(n => cols.map(col => U.stars(val(col, n, 'padj')))), texttemplate: '%{text}',
      customdata: paths.map(n => cols.map(col => `<b>${U.esc(U.pretty(n))}</b><br>${U.esc(col.ctx)} · ${U.esc(lab(col.c))}<br>NES ${U.fmt(val(col, n, 'nes'))}, FDR ${U.fmtP(val(col, n, 'padj'))}`)),
      hovertemplate: '%{customdata}<extra></extra>', colorscale: U.DIVERGING, zmid: 0, zmin: -3, zmax: 3,
      colorbar: { title: { text: 'NES', side: 'right' }, thickness: 12 },
    }], {
      height: 140 + 22 * paths.length, margin: { l: 330, r: 20, t: 10, b: 130 }, plot_bgcolor: '#eceef2',
      xaxis: { tickvals: cols.map((_, j) => j), ticktext: cols.map(col => `${col.ctx} · ${U.trunc(lab(col.c), 26)}`), tickangle: -35 },
      yaxis: { tickvals: paths.map((_, i) => i), ticktext: paths.map(n => U.trunc(U.pretty(n), 48)), autorange: 'reversed' },
    });
  }

  return { render };
})();
