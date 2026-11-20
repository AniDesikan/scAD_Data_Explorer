'use strict';
/* Published / external hippocampus datasets: upload, then compare overlap with each cell type. */
const RefsView = (() => {
  let staged = [];

  function render(root) {
    const d = Store.d(), s = Store.settings;
    root.append(U.h('div', { class: 'view-head' },
      U.h('h2', {}, 'Published data'),
      U.h('p', { class: 'muted' }, 'Add gene lists or DEG tables from published hippocampus studies (aging, AD models, estradiol treatment, other sex-difference atlases…) and see which of your cell types they resemble.')));
    uploadCard(root);
    const refs = Object.values(d.refs);
    if (!refs.length) {
      root.append(U.card('No published datasets yet', 'Upload one above. A CSV with just a gene column works (a gene list); add log2FC and FDR columns to also compare direction.'));
      return;
    }
    listCard(root, refs);
    if (Store.hasData()) overlapCard(root, refs, d, s);
  }

  // ---------- upload ----------
  function uploadCard(root) {
    const input = U.h('input', { type: 'file', multiple: true, accept: '.csv,.tsv,.txt,.xlsx,.xls,.gz', class: 'hidden' });
    const zone = U.h('div', { class: 'dropzone', onclick: () => input.click() }, 'Drop published gene lists / DEG tables here, or click to choose (CSV, TSV, Excel).');
    const stageWrap = U.h('div');
    const handle = async files => {
      for (const f of files) {
        try {
          for (const t of await Ingest.parseFile(f)) {
            staged.push(Object.assign(t, { map: Ingest.autoMap(t.headers, 'ref'), name: t.stem.replace(/[_]+/g, ' '), description: '', citation: '', species: 'mouse', celltype: '' }));
          }
        } catch (e) { U.toast(`${f.name}: ${e.message}`, 5000); }
      }
      drawStage();
    };
    input.onchange = () => { handle([...input.files]); input.value = ''; };
    zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('over'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('over'));
    zone.addEventListener('drop', e => { e.preventDefault(); zone.classList.remove('over'); handle([...e.dataTransfer.files]); });

    function drawStage() {
      stageWrap.innerHTML = '';
      staged.forEach((it, k) => {
        const field = (label, key, attrs = {}) => {
          const inp = U.h('input', Object.assign({ type: 'text', value: it[key] || '' }, attrs));
          inp.addEventListener('input', () => { it[key] = inp.value; });
          return U.h('label', {}, label, inp);
        };
        const ok = it.map.gene && it.name.trim();
        stageWrap.append(U.h('div', { class: 'stage' },
          U.h('div', { class: 'btnrow' }, U.h('b', {}, it.source), U.h('span', { class: 'muted' }, `${it.rows.length.toLocaleString()} rows`),
            U.h('button', { class: 'small danger', style: { marginLeft: 'auto' }, onclick: () => { staged.splice(k, 1); drawStage(); } }, 'Remove')),
          U.h('div', { class: 'stage-row', style: { marginTop: '6px' } },
            field('Short name *', 'name', { style: { width: '260px' } }),
            field('Cell type / region (optional)', 'celltype', { style: { width: '160px' } }),
            U.h('label', {}, 'Gene symbols are', U.select([['mouse', 'mouse (Esr1)'], ['human', 'human (ESR1) → convert'], ['rat', 'rat → convert']], it.species, v => { it.species = v; }))),
          U.h('div', { class: 'stage-row', style: { marginTop: '6px' } },
            field('What it is (e.g. “aged vs young CA1, snRNA-seq”)', 'description', { style: { width: '380px' } }),
            field('Citation / DOI / URL', 'citation', { style: { width: '260px' } })),
          U.h('details', {}, U.h('summary', {}, 'Columns'), Ingest.mappingUI(it, 'ref', drawStage), Ingest.previewTable(it)),
          it.species !== 'mouse' ? U.h('div', { class: 'muted small-text' }, 'Symbols will be converted by capitalisation only (ESR1 → Esr1). This is right for most genes but not all; a proper ortholog table is safer for important conclusions.') : null,
          ok ? U.h('div', { class: 'ok' }, it.map.lfc || it.map.direction ? 'Will be stored as a DEG table (direction-aware).' : 'Will be stored as a gene list (all listed genes treated as “hits”).')
            : U.h('div', { class: 'err' }, 'Needs a gene column and a name.')));
      });
      if (staged.length) stageWrap.append(U.h('button', { class: 'primary', onclick: () => {
        let n = 0;
        for (const it of staged.slice()) {
          if (!it.map.gene || !it.name.trim()) continue;
          const ref = Ingest.buildRef(it);
          if (ref.genes.length) { Store.addRef(ref); n++; }
          staged.splice(staged.indexOf(it), 1);
        }
        U.toast(`Added ${n} dataset${n === 1 ? '' : 's'}`);
      } }, `Add ${staged.length} dataset${staged.length === 1 ? '' : 's'}`));
    }
    root.append(U.card('Add a published dataset', 'Processed locally, like everything else. Tip: tables of “significant genes only” work fine. For full tables, genes with FDR < ' + Store.settings.refPadj + ' count as hits (change this under Data & settings).', input, zone, stageWrap));
    drawStage();
  }

  function listCard(root, refs) {
    root.append(U.card(`Loaded datasets (${refs.length})`, null, U.h('div', { class: 'listbox' }, refs.map(r => {
      const m = Store.refSig(r);
      let up = 0, dn = 0; m.forEach(v => { if (v > 0) up++; else if (v < 0) dn++; });
      return U.h('div', { class: 'li' },
        U.h('div', { class: 'grow' },
          U.h('b', {}, r.name), r.celltype ? U.h('span', { class: 'muted' }, ` · ${r.celltype}`) : '',
          U.h('div', { class: 'muted small-text' }, [r.description, r.citation].filter(Boolean).join(' — ') || r.source),
          U.h('div', { class: 'small-text' }, `${r.genes.length.toLocaleString()} genes, ${m.size.toLocaleString()} hits`, r.kind === 'deg' ? ` (↑${up} ↓${dn})` : ' (gene list)', r.species !== 'mouse' ? ` · converted from ${r.species}` : '')),
        U.h('button', { class: 'small', onclick: () => {
          const ex = Store.uiGet('explore', {}); ex.overlay = 'ref::' + r.id; Store.uiSave(); App.go('explore');
        } }, 'Show on volcano'),
        U.h('button', { class: 'small danger', onclick: () => { if (confirm(`Remove “${r.name}”?`)) Store.removeRef(r.id); } }, 'Remove'));
    }))));
  }

  // ---------- overlap ----------
  function overlap(ref, t) {
    const uni = Store.rowMap(t), ours = Store.sigGenes(t), R = Store.refSig(ref);
    const Rin = [...R.keys()].filter(g => uni.has(g));
    const ov = Rin.filter(g => ours.has(g));
    let agree = 0, withDir = 0;
    for (const g of ov) { const rd = R.get(g); if (rd) { withDir++; if (rd === ours.get(g)) agree++; } }
    return { N: uni.size, K: Rin.length, n: ours.size, k: ov.length, genes: ov, p: U.phyper(ov.length, uni.size, Rin.length, ours.size), agree, withDir, conc: withDir ? agree / withDir : NaN };
  }

  function overlapCard(root, refs, d, s) {
    const ui = Store.uiGet('refs', { cmp: d.comparisons[0], mode: 'p', sel: null });
    if (!d.comparisons.includes(ui.cmp)) ui.cmp = d.comparisons[0];
    const rerender = () => { Store.uiSave(); App.render(); };
    const cts = d.celltypes.filter(ct => Store.degTable(ct, ui.cmp));
    const div = U.h('div'), detail = U.h('div');
    root.append(U.card('Which of your cell types look like each published dataset?',
      `For each cell (dataset × cell type): how many of your DEGs (${ui.cmp}) are also hits in the published dataset, and is that more than chance (hypergeometric test, universe = genes tested in your cell type)? “Direction agreement” asks whether shared genes change the same way (+1 = all same, −1 = all opposite). Click a cell for the gene list.`,
      U.h('div', { class: 'controls' },
        U.h('label', {}, 'Your comparison', U.select(d.comparisons.map(c => [c, Store.cmpLabel(c)]), ui.cmp, v => { ui.cmp = v; ui.sel = null; rerender(); })),
        U.h('label', {}, 'Colour by', U.select([['p', 'overlap significance (−log10 p)'], ['conc', 'direction agreement']], ui.mode, v => { ui.mode = v; rerender(); }))),
      div, detail));
    if (!cts.length) { div.append(U.h('p', { class: 'muted' }, 'No DEG tables for this comparison.')); return; }
    const M = refs.map(r => cts.map(ct => overlap(r, Store.degTable(ct, ui.cmp))));
    const z = M.map(row => row.map(o => (ui.mode === 'p' ? Math.min(30, -Math.log10(o.p)) : o.withDir >= 3 ? 2 * o.conc - 1 : null)));
    const text = M.map(row => row.map(o => `${o.k}${ui.mode === 'p' ? U.stars(o.p) : ''}`));
    const cd = M.map((row, i) => row.map((o, j) => `<b>${U.esc(refs[i].name)}</b> × <b>${U.esc(cts[j])}</b><br>${o.k} shared of ${o.n} your DEGs / ${o.K} published hits<br>overlap p = ${U.fmtP(o.p)}<br>${o.withDir ? `same direction: ${o.agree}/${o.withDir} (${Math.round(100 * o.conc)}%)` : 'no direction info'}`));
    U.plot(div, [{
      type: 'heatmap', z, text, customdata: cd, texttemplate: '%{text}', hovertemplate: '%{customdata}<extra></extra>',
      x: cts.map((_, j) => j), y: refs.map((_, i) => i), xgap: 2, ygap: 2,
      colorscale: ui.mode === 'p' ? [[0, '#f7f7f7'], [1, '#6d28d9']] : U.DIVERGING,
      zmin: ui.mode === 'p' ? 0 : -1, zmax: ui.mode === 'p' ? Math.max(5, ...z.flat().filter(Number.isFinite)) : 1,
      colorbar: { title: { text: ui.mode === 'p' ? '−log10 p' : 'agreement', side: 'right' }, thickness: 12 },
    }], {
      height: 130 + 42 * refs.length, margin: { l: 260, r: 20, t: 10, b: 100 }, plot_bgcolor: '#eceef2',
      xaxis: { tickvals: cts.map((_, j) => j), ticktext: cts, tickangle: -30 },
      yaxis: { tickvals: refs.map((_, i) => i), ticktext: refs.map(r => U.trunc(r.name, 38)), autorange: 'reversed' },
    }, pt => { ui.sel = { ref: refs[pt.y].id, ct: cts[pt.x] }; Store.uiSave(); drawDetail(); });
    function drawDetail() {
      Plotly.purge(detail); detail.innerHTML = '';
      const sel = ui.sel, r = sel && d.refs[sel.ref], t = sel && Store.degTable(sel.ct, ui.cmp);
      if (!r || !t) return;
      const o = overlap(r, t), R = Store.refSig(r), ctx = { ct: sel.ct, cmp: ui.cmp };
      const rm = Store.rowMap(t), rr = Store.rowMap(r);
      const rows = o.genes.map(g => { const i = rm.get(g), j = rr.get(g); return { g, lfc: t.lfc[i], q: Store.degQ(t, i), rd: R.get(g), rl: r.lfc ? r.lfc[j] : NaN }; }).sort((a, b) => a.q - b.q);
      detail.append(U.h('h4', {}, `${r.name} × ${sel.ct} (${ui.cmp}): ${o.k} shared genes`),
        U.h('div', { class: 'btnrow', style: { marginBottom: '6px' } },
          U.h('button', { class: 'small', onclick: () => U.copy(o.genes.join('\n')) }, 'Copy'),
          U.h('button', { class: 'small', onclick: () => { const ex = Store.uiGet('explore', {}); ex.custom = { label: `Shared with ${r.name}`, genes: o.genes }; ex.overlay = 'custom'; Store.uiSave(); App.openExplore(sel.ct, ui.cmp); } }, 'Show on volcano')));
      const grid = U.h('div', { class: 'grid2b' }), tbl = U.h('div', { class: 'scroll' }), sc = U.h('div');
      grid.append(tbl, sc); detail.append(grid);
      tbl.append(U.h('table', { class: 'tbl' },
        U.h('tr', {}, U.h('th', {}, 'Gene'), U.h('th', { class: 'num' }, 'your log2FC'), U.h('th', { class: 'num' }, 'FDR'), U.h('th', { class: 'num' }, 'published'), U.h('th', {}, '')),
        rows.map(x => U.h('tr', { class: 'click', onclick: () => Drawer.open({ type: 'gene', id: x.g, ctx }) },
          U.h('td', {}, U.h('b', {}, x.g)), U.h('td', { class: 'num', style: { color: x.lfc > 0 ? 'var(--up)' : 'var(--down)' } }, U.signed(x.lfc)),
          U.h('td', { class: 'num' }, U.fmtP(x.q)), U.h('td', { class: 'num' }, Number.isFinite(x.rl) ? U.signed(x.rl) : x.rd ? U.arrow(x.rd) : 'listed'),
          U.h('td', {}, x.rd ? (x.rd === Math.sign(x.lfc) ? '✓ same' : '✗ opposite') : '')))));
      if (r.lfc) {
        const shared = [...rm.keys()].filter(g => rr.has(g)).map(g => ({ g, x: t.lfc[rm.get(g)], y: r.lfc[rr.get(g)], hit: o.genes.includes(g) })).filter(p => Number.isFinite(p.x) && Number.isFinite(p.y));
        const { r: corr, n } = U.pearson(shared.map(p => p.x), shared.map(p => p.y));
        const tr = (ps, name, color, size) => ({ type: 'scattergl', mode: 'markers', name, x: ps.map(p => p.x), y: ps.map(p => p.y), customdata: ps.map(p => p.g), hovertemplate: '<b>%{customdata}</b><br>yours %{x:.2f}<br>published %{y:.2f}<extra></extra>', marker: { color, size, opacity: 0.8 } });
        U.plot(sc, [tr(shared.filter(p => !p.hit), 'other genes', '#d1d5db', 4), tr(shared.filter(p => p.hit), 'significant in both', '#6d28d9', 7)], {
          height: 380, margin: { l: 55, r: 10, t: 30, b: 45 }, hovermode: 'closest',
          xaxis: { title: { text: `your log2FC (${sel.ct})` }, zeroline: true, zerolinecolor: '#9ca3af', gridcolor: '#f1f2f4' },
          yaxis: { title: { text: 'published log2FC' }, zeroline: true, zerolinecolor: '#9ca3af', gridcolor: '#f1f2f4' },
          legend: { orientation: 'h', y: -0.2 },
          annotations: [{ xref: 'paper', yref: 'paper', x: 0, y: 1.07, xanchor: 'left', showarrow: false, text: `r = ${U.fmt(corr)} over ${n.toLocaleString()} shared genes`, font: { size: 11, color: '#6b7280' } }],
        }, pt => Drawer.open({ type: 'gene', id: pt.customdata, ctx }));
      } else sc.append(U.h('p', { class: 'muted small-text' }, 'This dataset is a gene list without fold changes, so there is no scatter.'));
    }
    drawDetail();
  }

  return { render };
})();
