'use strict';
/* Data & settings: upload results, manage cell types / comparisons, thresholds, share bundles. */
const DataView = (() => {
  let staged = [], sid = 0;

  function render(root) {
    root.append(U.h('div', { class: 'view-head' },
      U.h('h2', {}, 'Data & settings'),
      U.h('p', { class: 'muted' }, 'For the person who ran the analysis: load DEG and pathway tables here, check that cell types and comparisons are named sensibly, then export a single bundle file for collaborators.')));
    root.append(U.h('div', { class: 'callout' }, U.h('b', {}, 'Privacy: '),
      'files are read by this page inside your browser and stored only in this browser’s local storage. Nothing is uploaded anywhere. The optional “Load gene summary / literature” buttons send only a gene symbol or pathway name to MyGene.info, NCBI PubMed or EBI QuickGO.'));
    uploadCard(root);
    loadedCard(root);
    namesCard(root);
    settingsCard(root);
    shareCard(root);
    formatCard(root);
  }

  // ---------- upload ----------
  function uploadCard(root) {
    const input = U.h('input', { type: 'file', multiple: true, accept: '.csv,.tsv,.txt,.xlsx,.xls,.gz', class: 'hidden' });
    const zone = U.h('div', { class: 'dropzone', onclick: () => input.click() },
      U.h('div', {}, U.h('b', {}, 'Drop DEG and pathway (GSEA / enrichment) tables here'), ' or click to choose.'),
      U.h('div', { class: 'small-text' }, 'CSV, TSV, TXT, Excel (one table per sheet), optionally .gz. Name files CellType__Comparison.csv (or CellType__Comparison__Collection.csv) and they are labelled automatically, or use “long” tables with celltype and comparison columns.'));
    const wrap = U.h('div');
    const handle = async files => {
      for (const f of files) {
        try {
          for (const t of await Ingest.parseFile(f)) {
            const kind = Ingest.detectKind(t.headers), inf = Ingest.inferNames(t.stem);
            const it = Object.assign(t, { id: ++sid, kind, map: Ingest.autoMap(t.headers, kind), celltype: inf.ct, comparison: inf.cmp, collection: inf.coll, direction: inf.dir || 'none' });
            if (it.map.celltype) it.celltype = '';
            if (it.map.comparison) it.comparison = '';
            if (kind === 'gsea' && !it.collection) it.collection = Ingest.guessCollection(it);
            staged.push(it);
          }
        } catch (e) { U.toast(`${f.name}: ${e.message}`, 5000); }
      }
      draw();
    };
    input.onchange = () => { handle([...input.files]); input.value = ''; };
    zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('over'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('over'));
    zone.addEventListener('drop', e => { e.preventDefault(); zone.classList.remove('over'); handle([...e.dataTransfer.files]); });
    root.append(U.card('1. Load results', null, input, zone, wrap));

    function draw() {
      wrap.innerHTML = '';
      if (!staged.length) return;
      const d = Store.d();
      const dlCt = U.h('datalist', { id: 'dl-ct' }, d.celltypes.map(c => U.h('option', { value: c })));
      const dlCmp = U.h('datalist', { id: 'dl-cmp' }, d.comparisons.map(c => U.h('option', { value: c })));
      const dlColl = U.h('datalist', { id: 'dl-coll' }, ['GO:BP', 'GO:CC', 'GO:MF', 'GO', 'Hallmark', 'KEGG', 'Reactome', 'WikiPathways', ...Store.collections()].map(c => U.h('option', { value: c })));
      const bulkCmp = U.h('input', { type: 'text', list: 'dl-cmp', placeholder: 'e.g. M_KO_vs_M_Ctrl', style: { width: '180px' } });
      wrap.append(dlCt, dlCmp, dlColl, U.h('div', { class: 'controls', style: { marginTop: '12px' } },
        U.h('b', {}, `${staged.length} table${staged.length === 1 ? '' : 's'} ready to import`),
        U.h('label', {}, 'Set comparison for all', bulkCmp, U.h('button', { class: 'small', onclick: () => { staged.forEach(it => { if (!it.map.comparison) it.comparison = bulkCmp.value.trim(); }); draw(); } }, 'Apply')),
        U.h('button', { class: 'small', onclick: () => { staged = []; draw(); } }, 'Clear list')));
      staged.forEach(it => wrap.append(stageCard(it, draw)));
      const nOk = staged.filter(it => it.kind !== 'skip' && !Ingest.validate(it).length).length;
      wrap.append(U.h('button', { class: 'primary', disabled: !nOk, onclick: importAll }, `Import ${nOk} table${nOk === 1 ? '' : 's'}`),
        nOk < staged.filter(it => it.kind !== 'skip').length ? U.h('span', { class: 'muted small-text', style: { marginLeft: '10px' } }, 'Tables with problems (red) are not imported until fixed.') : null);
    }
    function importAll() {
      const degs = [], gseaMap = new Map(); let skipped = 0;
      const done = [];
      for (const it of staged) {
        if (it.kind === 'skip' || Ingest.validate(it).length) continue;
        const out = Ingest.build(it);
        skipped += out.skipped;
        degs.push(...out.deg);
        for (const t of out.gsea) {
          const k = Store.key(t.celltype, t.comparison, t.collection);
          const prev = gseaMap.get(k);
          if (!prev) { gseaMap.set(k, t); continue; }
          // Merge e.g. separate "up" and "down" ORA files into one table.
          for (const f of ['names', 'ids', 'score', 'nes', 'p', 'padj', 'size', 'genes']) {
            if (prev[f] && t[f]) prev[f] = prev[f].concat(t[f]);
            else if (prev[f] || t[f]) prev[f] = null;
          }
          if (t.scoreType !== prev.scoreType) prev.scoreType = 'mixed';
        }
        done.push(it);
      }
      staged = staged.filter(it => !done.includes(it));
      Store.addTables(degs, [...gseaMap.values()]);
      U.toast(`Imported ${degs.length} DEG table${degs.length === 1 ? '' : 's'} and ${gseaMap.size} pathway table${gseaMap.size === 1 ? '' : 's'}${skipped ? ` (${skipped} rows without cell type/comparison skipped)` : ''}.`, 5000);
    }
  }

  function stageCard(it, redraw) {
    const errs = Ingest.validate(it);
    const txt = (label, key, attrs) => {
      const inp = U.h('input', Object.assign({ type: 'text', value: it[key] || '' }, attrs));
      inp.addEventListener('input', () => { it[key] = inp.value; });
      inp.addEventListener('change', redraw);
      return U.h('label', {}, label, inp);
    };
    const longNote = f => U.h('label', {}, f === 'celltype' ? 'Cell type' : 'Comparison', U.h('span', { class: 'small-text', style: { padding: '5px 0' } }, `from column “${it.map[f]}”`));
    const nes = !!it.map.nes;
    return U.h('div', { class: 'stage' + (errs.length && it.kind !== 'skip' ? ' bad' : '') },
      U.h('div', { class: 'btnrow' },
        U.h('b', {}, it.source), U.h('span', { class: 'muted' }, `${it.rows.length.toLocaleString()} rows`),
        U.h('button', { class: 'small danger', style: { marginLeft: 'auto' }, onclick: () => { staged.splice(staged.indexOf(it), 1); redraw(); } }, 'Remove')),
      U.h('div', { class: 'stage-row', style: { marginTop: '6px' } },
        U.h('label', {}, 'Type', U.select([['deg', 'DEG table'], ['gsea', 'Pathway / GSEA / enrichment'], ['skip', 'Skip']], it.kind, v => {
          it.kind = v;
          if (v !== 'skip') it.map = Ingest.autoMap(it.headers, v);
          if (v === 'gsea' && !it.collection) it.collection = Ingest.guessCollection(it);
          redraw();
        })),
        it.kind === 'skip' ? null : it.map.celltype ? longNote('celltype') : txt('Cell type *', 'celltype', { list: 'dl-ct', style: { width: '170px' } }),
        it.kind === 'skip' ? null : it.map.comparison ? longNote('comparison') : txt('Comparison *', 'comparison', { list: 'dl-cmp', style: { width: '180px' } }),
        it.kind === 'gsea' && !it.map.collection ? txt('Collection', 'collection', { list: 'dl-coll', style: { width: '130px' } }) : null,
        it.kind === 'gsea' && !nes && !it.map.direction ? U.h('label', {}, 'Genes tested were', U.select([['up', 'up-regulated (ORA)'], ['down', 'down-regulated (ORA)'], ['none', 'not directional']], it.direction, v => { it.direction = v; })) : null),
      it.kind === 'skip' ? null : U.h('details', {}, U.h('summary', {}, 'Check columns'), Ingest.mappingUI(it, it.kind, redraw), Ingest.previewTable(it)),
      it.kind === 'skip' ? null : errs.length ? U.h('div', { class: 'err' }, errs.join(' '))
        : U.h('div', { class: 'ok' }, it.kind === 'deg'
          ? `OK: gene “${it.map.gene}”, log2FC “${it.map.lfc}”, ${it.map.padj ? `FDR “${it.map.padj}”` : `p “${it.map.p}” (no adjusted p found; consider mapping one)`}.`
          : `OK: pathway “${it.map.pathway || it.map.id}”, ${nes ? `NES “${it.map.nes}”` : 'no NES (enrichment test)'}, ${it.map.genes ? `genes “${it.map.genes}”` : 'no gene column (driver genes unavailable)'}.`));
  }

  // ---------- loaded ----------
  function loadedCard(root) {
    const d = Store.d();
    if (!Store.hasData()) { root.append(U.card('2. Loaded data', 'Nothing loaded yet.')); return; }
    const tbl = U.h('table', { class: 'tbl' });
    tbl.append(U.h('tr', {}, U.h('th', {}, 'Cell type'), d.comparisons.map(c => U.h('th', {}, c))));
    for (const ct of d.celltypes) {
      tbl.append(U.h('tr', {}, U.h('td', {}, U.h('b', {}, ct)), d.comparisons.map(cmp => {
        const t = Store.degTable(ct, cmp), gs = Store.gseaTables(ct, cmp);
        const del = (kind, k, what) => U.h('button', { class: 'small danger', title: `Remove ${what}`, style: { padding: '0 5px', marginLeft: '4px' }, onclick: () => { if (confirm(`Remove ${what}?`)) Store.removeTable(kind, k); } }, '×');
        return U.h('td', {},
          t ? U.h('div', {}, `DEG: ${t.genes.length.toLocaleString()} genes`, del('deg', Store.key(ct, cmp), `DEG table ${ct} · ${cmp}`)) : U.h('div', { class: 'muted' }, 'no DEG'),
          gs.map(g => U.h('div', { class: 'small-text' }, `${g.collection}: ${g.names.length.toLocaleString()}`, g.genes ? '' : U.h('span', { class: 'muted', title: 'no driver-gene column' }, ' (no genes)'), del('gsea', Store.key(ct, cmp, g.collection), `${g.collection} results ${ct} · ${cmp}`))));
      })));
    }
    root.append(U.card('2. Loaded data', 'One row per cell type, one column per comparison. Re-importing the same cell type × comparison (× collection) replaces it.', U.h('div', { class: 'hscroll' }, tbl)));
  }

  function namesCard(root) {
    const d = Store.d();
    if (!Store.hasData()) return;
    const row = (list, name, extra) => U.h('div', { class: 'li' },
      U.h('div', { class: 'grow' }, U.h('b', {}, name), extra || null),
      U.h('button', { class: 'small', title: 'move up', onclick: () => Store.move(list, name, -1) }, '↑'),
      U.h('button', { class: 'small', title: 'move down', onclick: () => Store.move(list, name, 1) }, '↓'),
      U.h('button', { class: 'small', onclick: () => {
        const n = prompt(`Rename “${name}” to:`, name);
        if (n && n.trim()) list === 'celltypes' ? Store.renameCelltype(name, n.trim()) : Store.renameComparison(name, n.trim());
      } }, 'Rename'));
    const cmpRow = c => {
      const inp = U.h('input', { type: 'text', value: d.compLabels[c] || '', placeholder: 'plain-language description, e.g. “Males: aromatase KO vs control”', style: { width: '100%', marginTop: '4px' } });
      inp.addEventListener('change', () => Store.setCompLabel(c, inp.value.trim()));
      return row('comparisons', c, inp);
    };
    root.append(U.h('div', { class: 'grid2b' },
      U.card('3a. Cell types', 'Order here is the order used in every plot.', U.h('div', { class: 'listbox' }, d.celltypes.map(c => row('celltypes', c)))),
      U.card('3b. Comparisons', 'Add a plain-language description so the direction is unambiguous (positive log2FC = higher in the first group).', U.h('div', { class: 'listbox' }, d.comparisons.map(cmpRow)))));
  }

  function settingsCard(root) {
    const s = Store.settings, d = Store.d();
    const numIn = (k, step) => { const i = U.h('input', { type: 'number', step, min: 0, value: s[k], style: { width: '90px' } }); i.addEventListener('change', () => { const v = parseFloat(i.value); if (Number.isFinite(v)) Store.setSetting(k, v); }); return i; };
    const chk = k => U.h('input', { type: 'checkbox', checked: s[k], onchange: e => Store.setSetting(k, e.target.checked) });
    const title = U.h('input', { type: 'text', value: d.meta.title || '', placeholder: 'Hippocampus scRNA-seq Explorer', style: { width: '320px' } });
    title.addEventListener('change', () => Store.setTitle(title.value.trim()));
    root.append(U.card('4. Settings', 'Thresholds apply everywhere, immediately. They are personal (stored per browser) and not part of the bundle.',
      U.h('div', { class: 'kv' },
        U.h('span', {}, 'Page title'), title,
        U.h('span', {}, 'DEG: FDR below'), numIn('degPadj', 0.01),
        U.h('span', {}, 'DEG: |log2FC| at least'), numIn('degLfc', 0.05),
        U.h('span', {}, 'Pathways: FDR below'), numIn('gseaPadj', 0.01),
        U.h('span', {}, 'Published: FDR below'), numIn('refPadj', 0.01),
        U.h('span', {}, 'Readable pathway names'), U.h('label', {}, chk('prettyNames'), U.h('span', { class: 'small-text muted' }, 'GOBP_SYNAPTIC_SIGNALING → “synaptic signaling (GOBP)”')),
        U.h('span', {}, 'Auto-load annotations'), U.h('label', {}, chk('autoAnnot'), U.h('span', { class: 'small-text muted' }, 'fetch gene summaries / literature / GO definitions as soon as a detail panel opens')))));
  }

  function shareCard(root) {
    const input = U.h('input', { type: 'file', accept: '.json,.gz', class: 'hidden' });
    input.onchange = async () => {
      try { await Store.importBundleFile(input.files[0]); U.toast('Bundle loaded'); App.go('atlas'); }
      catch (e) { U.toast('Could not load bundle: ' + e.message, 5000); }
      input.value = '';
    };
    root.append(U.card('5. Save & share', null,
      U.h('p', { class: 'small-text', style: { marginTop: 0 } }, U.h('b', {}, 'To share with a collaborator: '),
        'click “Export bundle”, send them the file together with this folder, and have them open index.html and click “Load bundle”. Or, if the folder is on a lab web server, put the file at ', U.h('code', {}, 'data/bundle.json.gz'), ' and it loads automatically.'),
      U.h('div', { class: 'btnrow' },
        U.h('button', { class: 'primary', disabled: !Store.hasData(), onclick: () => Store.exportBundle() }, 'Export bundle'),
        input, U.h('button', { onclick: () => input.click() }, 'Load bundle…'),
        U.h('button', { onclick: () => { if (!Store.hasData() || confirm('Replace the current data with simulated demo data?')) { Store.loadDemo(); App.go('atlas'); } } }, 'Load demo data'),
        U.h('button', { class: 'danger', disabled: !Store.hasData() && !Object.keys(Store.d().refs).length, onclick: () => { if (confirm('Remove all loaded data from this browser? (Notes are kept.)')) Store.clearAll(); } }, 'Clear all data'))));
  }

  function formatCard(root) {
    root.append(U.card('Accepted formats', null, U.h('div', { class: 'small-text', html: `
      <p><b>DEG tables</b>: one row per gene. Recognised columns include <code>gene</code> (or R row names), <code>avg_log2FC</code> / <code>log2FoldChange</code> / <code>logFC</code>, <code>p_val</code> / <code>pvalue</code>, <code>p_val_adj</code> / <code>padj</code> / <code>FDR</code>. Seurat <code>FindMarkers</code>, DESeq2, edgeR, limma and MAST outputs work as written by <code>write.csv</code>.</p>
      <p><b>Pathway tables</b>: fgsea (<code>pathway, NES, pval, padj, size, leadingEdge</code>), clusterProfiler <code>gseGO/GSEA</code> (<code>ID, Description, NES, p.adjust, core_enrichment</code>), clusterProfiler <code>enrichGO</code> / Enrichr (no NES; set whether the input genes were up- or down-regulated), Broad GSEA reports (<code>NAME, NES, FDR q-val</code>). Gene lists may be separated by <code>/ ; , |</code> or written as R vectors.</p>
      <p><b>Labelling</b>: either name files <code>CellType__Comparison.csv</code> / <code>CellType__Comparison__Collection.csv</code>, type the labels in after dropping, or provide long tables with <code>celltype</code>, <code>comparison</code> (and <code>collection</code>) columns. The helper script <code>R/export_for_explorer.R</code> in this folder writes these long tables from lists of results.</p>
      <p><b>Direction</b>: positive log2FC / NES must mean “higher in the first group named in the comparison” (e.g. <code>M_KO_vs_M_Ctrl</code> → higher in male KO). Check this matches how your tests were run.</p>` })));
  }

  return { render };
})();
