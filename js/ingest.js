'use strict';
/* File parsing, column auto-detection and conversion into explorer tables. Runs locally in the browser. */
const Ingest = (() => {
  const FIELDS = {
    deg: [
      ['gene', 'Gene', true], ['lfc', 'log2 fold change', true], ['p', 'p-value', false], ['padj', 'Adjusted p / FDR', false],
      ['celltype', 'Cell type column (long format)', false], ['comparison', 'Comparison column (long format)', false],
    ],
    gsea: [
      ['pathway', 'Pathway / term name', true], ['id', 'Pathway ID (e.g. GO:…)', false], ['nes', 'NES (GSEA)', false],
      ['p', 'p-value', false], ['padj', 'Adjusted p / FDR', false], ['size', 'Set size / count', false],
      ['genes', 'Leading-edge / overlap genes', false], ['direction', 'Direction column (ORA up/down)', false],
      ['celltype', 'Cell type column (long format)', false], ['comparison', 'Comparison column (long format)', false],
      ['collection', 'Collection column (e.g. GO:BP)', false],
    ],
    ref: [
      ['gene', 'Gene', true], ['lfc', 'log2 fold change', false], ['padj', 'Adjusted p / FDR', false], ['p', 'p-value', false],
      ['direction', 'Direction column (up/down)', false],
    ],
  };
  const SYN = {
    gene: ['gene', 'genes', 'symbol', 'gene_symbol', 'genesymbol', 'gene_name', 'gene.name', 'gene name', 'feature', 'features', 'primerid', 'rownames', 'names', 'x', 'mgi_symbol', 'external_gene_name', 'gene_id'],
    lfc: ['avg_log2fc', 'log2foldchange', 'logfc', 'avg_logfc', 'log2fc', 'lfc', 'log2_fc', 'log2_fold_change', 'log2 fold change', 'avg_log2fc_1', 'coef', 'estimate'],
    p: ['p_val', 'pvalue', 'p.value', 'pval', 'p_value', 'p-value', 'nom p-val', 'nom_p_val', 'p'],
    padj: ['p_val_adj', 'padj', 'fdr', 'adj.p.val', 'p.adjust', 'qvalue', 'qvalues', 'q_value', 'qval', 'fdr q-val', 'adj_pval', 'p_adj', 'adjusted.p.value', 'adjusted p-value', 'adjusted_p_value', 'bh'],
    celltype: ['celltype', 'cell_type', 'cell.type', 'cell type', 'cluster', 'celltypes', 'annotation', 'cell_class', 'subclass'],
    comparison: ['comparison', 'contrast', 'test'],
    pathway: ['pathway', 'description', 'name', 'term', 'geneset', 'gene_set', 'term_name', 'pathway_name', 'go_term'],
    id: ['id', 'go_id', 'term_id', 'pathway_id', 'goid', 'go.id'],
    nes: ['nes'],
    size: ['size', 'setsize', 'set_size', 'count', 'overlap_size', 'term_size'],
    genes: ['leadingedge', 'leading_edge', 'core_enrichment', 'geneid', 'genes', 'gene_list', 'overlap_genes', 'intersection', 'leading edge genes', 'overlap'],
    collection: ['collection', 'database', 'category', 'ontology', 'source', 'gs_cat', 'gs_subcat'],
    direction: ['direction', 'regulation', 'dir', 'sign'],
  };

  function parseArrays(data) {
    data = data.filter(r => r && r.some(v => v != null && String(v).trim() !== ''));
    if (!data.length) return { headers: [], rows: [] };
    let head = data[0].map(x => String(x ?? '').trim());
    // R's write.table(row.names=TRUE) writes one fewer header field than data fields.
    if (data.length > 1 && data[1].length === head.length + 1) head = ['rownames', ...head];
    head = head.map((x, i) => (x === '' ? (i === 0 ? 'rownames' : `col${i + 1}`) : x));
    const seen = {};
    head = head.map(x => { if (seen[x]) { seen[x]++; return `${x}.${seen[x]}`; } seen[x] = 1; return x; });
    const rows = [];
    for (let r = 1; r < data.length; r++) {
      const a = data[r], o = {};
      for (let c = 0; c < head.length; c++) o[head[c]] = a[c] === undefined ? null : a[c];
      rows.push(o);
    }
    return { headers: head, rows };
  }

  /** Returns one entry per table (one per sheet for Excel workbooks). */
  async function parseFile(file) {
    const name = file.name, lower = name.toLowerCase();
    const stem = name.replace(/\.gz$/i, '').replace(/\.(csv|tsv|txt|xlsx|xls)$/i, '');
    if (/\.(xlsx|xls)$/.test(lower)) {
      if (typeof XLSX === 'undefined') throw new Error('Excel reader did not load (offline?). Save as CSV instead.');
      const wb = XLSX.read(await file.arrayBuffer());
      return wb.SheetNames.map(sn => {
        const arr = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, defval: null, raw: true });
        return Object.assign({ source: `${name} [${sn}]`, stem: wb.SheetNames.length > 1 ? sn : stem }, parseArrays(arr));
      }).filter(t => t.rows.length);
    }
    const text = (await U.blobText(file)).replace(/^﻿/, '');
    const res = Papa.parse(text, { header: false, skipEmptyLines: 'greedy', delimiter: '' });
    return [Object.assign({ source: name, stem }, parseArrays(res.data))];
  }

  const lowerSet = headers => new Set(headers.map(x => x.toLowerCase().trim()));
  const has = (L, f) => SYN[f].some(s => L.has(s));
  function detectKind(headers) {
    const L = lowerSet(headers);
    if (L.has('nes') || L.has('core_enrichment') || L.has('leadingedge')) return 'gsea';
    if (has(L, 'lfc')) return 'deg';
    if (has(L, 'pathway') && (has(L, 'padj') || has(L, 'p'))) return 'gsea';
    return 'deg';
  }
  function autoMap(headers, kind) {
    const map = {}, used = new Set(), lower = headers.map(x => x.toLowerCase().trim());
    for (const [f] of FIELDS[kind]) {
      for (const s of SYN[f]) {
        const i = lower.indexOf(s);
        if (i >= 0 && !used.has(headers[i])) { map[f] = headers[i]; used.add(headers[i]); break; }
      }
    }
    return map;
  }
  /** "CellType__Comparison__Collection" naming convention; also matches known comparison names. */
  function inferNames(stem) {
    const dirM = /(^|[_\-. ])(up|down)([_\-. ]|$)/i.exec(stem);
    const dir = dirM ? dirM[2].toLowerCase() : '';
    const parts = stem.split('__');
    if (parts.length >= 2) return { ct: parts[0], cmp: parts[1], coll: parts[2] || '', dir };
    const known = Store.d().comparisons.slice().sort((a, b) => b.length - a.length).find(c => stem.includes(c));
    if (known) return { ct: stem.replace(known, '').replace(/^[_\-. ]+|[_\-. ]+$/g, ''), cmp: known, coll: '', dir };
    return { ct: stem, cmp: '', coll: '', dir };
  }
  function guessCollection(it) {
    const col = it.map.id || it.map.pathway;
    const v = String((it.rows.find(r => r[col]) || {})[col] || '');
    if (/^GO:\d/.test(v)) return 'GO';
    const m = /^(GOBP|GOCC|GOMF)_/.exec(v); if (m) return 'GO:' + m[1].slice(2);
    if (/^HALLMARK_/.test(v)) return 'Hallmark';
    if (/^REACTOME_|^R-(MMU|HSA)-/.test(v)) return 'Reactome';
    if (/^KEGG_|^mmu\d|^hsa\d/.test(v)) return 'KEGG';
    if (/^WP_|^WP\d/.test(v)) return 'WikiPathways';
    return 'Pathways';
  }

  function num(v) {
    if (v == null || v === '') return NaN;
    if (typeof v === 'number') return v;
    const s = String(v).trim();
    if (/^-?inf$/i.test(s)) return s[0] === '-' ? -Infinity : Infinity;
    return parseFloat(s);
  }
  const r4 = v => (Number.isFinite(v) ? +v.toPrecision(4) : v);
  function dirOf(v) {
    if (typeof v === 'number') return Math.sign(v);
    const s = String(v ?? '').trim().toLowerCase();
    if (/^(up|pos|\+|1|increase|upreg|higher|enriched)/.test(s)) return 1;
    if (/^(down|neg|-|-1|decrease|downreg|lower|depleted)/.test(s)) return -1;
    return 0;
  }

  function validate(it) {
    if (it.kind === 'skip') return [];
    const m = it.map, errs = [];
    if (it.kind === 'deg') {
      if (!m.gene) errs.push('Choose the gene column.');
      if (!m.lfc) errs.push('Choose the log2 fold-change column.');
      if (!m.padj && !m.p) errs.push('Choose an adjusted p-value (or p-value) column.');
    } else {
      if (!m.pathway && !m.id) errs.push('Choose the pathway name column.');
      if (!m.nes && !m.padj && !m.p) errs.push('Need an NES or a p-value column.');
    }
    if (!m.celltype && !String(it.celltype || '').trim()) errs.push('Enter the cell type.');
    if (!m.comparison && !String(it.comparison || '').trim()) errs.push('Enter the comparison.');
    return errs;
  }

  /** Convert a staged item into {deg:[tables], gsea:[tables]}. */
  function build(it) {
    const m = it.map, out = { deg: [], gsea: [], skipped: 0 };
    const getCt = m.celltype ? r => String(r[m.celltype] ?? '').trim() : () => String(it.celltype).trim();
    const getCmp = m.comparison ? r => String(r[m.comparison] ?? '').trim() : () => String(it.comparison).trim();
    const getColl = m.collection ? r => String(r[m.collection] ?? '').trim() || 'Pathways' : () => String(it.collection || '').trim() || 'Pathways';
    const groups = new Map();
    for (const r of it.rows) {
      const ct = getCt(r), cmp = getCmp(r), coll = it.kind === 'gsea' ? getColl(r) : '';
      if (!ct || !cmp) { out.skipped++; continue; }
      const k = [ct, cmp, coll].join('||');
      if (!groups.has(k)) groups.set(k, { ct, cmp, coll, rows: [] });
      groups.get(k).rows.push(r);
    }
    for (const g of groups.values()) {
      if (it.kind === 'deg') {
        const t = { celltype: g.ct, comparison: g.cmp, source: it.source, genes: [], lfc: [], p: m.p ? [] : null, padj: m.padj ? [] : null };
        const seen = new Set();
        for (const r of g.rows) {
          const gene = String(r[m.gene] ?? '').trim();
          if (!gene || seen.has(gene)) continue;
          const lfc = num(r[m.lfc]);
          if (!Number.isFinite(lfc)) continue;
          seen.add(gene);
          t.genes.push(gene); t.lfc.push(r4(lfc));
          if (t.p) t.p.push(r4(num(r[m.p])));
          if (t.padj) t.padj.push(r4(num(r[m.padj])));
        }
        if (t.genes.length) out.deg.push(t);
      } else {
        const t = {
          celltype: g.ct, comparison: g.cmp, collection: g.coll, source: it.source,
          names: [], ids: m.id && m.pathway ? [] : null, score: [], nes: m.nes ? [] : null,
          p: m.p ? [] : null, padj: m.padj ? [] : null, size: m.size ? [] : null, genes: m.genes ? [] : null, scoreType: 'NES',
        };
        let anyNes = false;
        for (const r of g.rows) {
          const name = String(r[m.pathway || m.id] ?? '').trim();
          if (!name) continue;
          const nes = m.nes ? num(r[m.nes]) : NaN, p = m.p ? num(r[m.p]) : NaN, padj = m.padj ? num(r[m.padj]) : NaN;
          let score;
          if (Number.isFinite(nes)) { score = nes; anyNes = true; }
          else {
            const q = Number.isFinite(padj) ? padj : p;
            const d = m.direction ? dirOf(r[m.direction]) : dirOf(it.direction);
            score = Number.isFinite(q) ? -Math.log10(Math.max(q, 1e-300)) * (d || 1) : NaN;
          }
          t.names.push(name);
          if (t.ids) t.ids.push(String(r[m.id] ?? ''));
          t.score.push(r4(score));
          if (t.nes) t.nes.push(r4(nes));
          if (t.p) t.p.push(r4(p));
          if (t.padj) t.padj.push(r4(padj));
          if (t.size) t.size.push(num(r[m.size]));
          if (t.genes) t.genes.push(U.splitGenes(r[m.genes]));
        }
        t.scoreType = anyNes ? 'NES' : 'signed −log10 FDR';
        if (t.names.length) out.gsea.push(t);
      }
    }
    return out;
  }

  const toMouse = g => (g ? g[0].toUpperCase() + g.slice(1).toLowerCase() : g);
  function buildRef(it) {
    const m = it.map, convert = it.species && it.species !== 'mouse';
    const ref = {
      id: 'ref' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      name: it.name.trim(), description: (it.description || '').trim(), citation: (it.citation || '').trim(),
      species: it.species || 'mouse', celltype: (it.celltype || '').trim(), source: it.source,
      genes: [], lfc: m.lfc ? [] : null, padj: m.padj ? [] : null, p: m.p ? [] : null, dir: m.direction ? [] : null,
    };
    const seen = new Set();
    for (const r of it.rows) {
      let g = String(r[m.gene] ?? '').trim();
      if (!g) continue;
      if (convert) g = toMouse(g);
      if (seen.has(g)) continue;
      seen.add(g);
      ref.genes.push(g);
      if (ref.lfc) ref.lfc.push(r4(num(r[m.lfc])));
      if (ref.padj) ref.padj.push(r4(num(r[m.padj])));
      if (ref.p) ref.p.push(r4(num(r[m.p])));
      if (ref.dir) ref.dir.push(dirOf(r[m.direction]));
    }
    ref.kind = ref.lfc || ref.dir ? 'deg' : 'list';
    return ref;
  }

  /** Grid of <select>s to map columns to fields. */
  function mappingUI(it, kind, onChange) {
    const grid = U.h('div', { class: 'map-grid' });
    for (const [f, label, req] of FIELDS[kind]) {
      const s = U.select([['', '— none —'], ...it.headers.map(x => [x, x])], it.map[f] || '', v => {
        if (v) it.map[f] = v; else delete it.map[f];
        onChange && onChange();
      });
      grid.append(U.h('label', {}, label + (req ? ' *' : ''), s));
    }
    return grid;
  }
  function previewTable(it, n = 3) {
    const cols = it.headers.slice(0, 9);
    return U.h('div', { class: 'hscroll' }, U.h('table', { class: 'preview' },
      U.h('tr', {}, cols.map(c => U.h('th', {}, c))),
      it.rows.slice(0, n).map(r => U.h('tr', {}, cols.map(c => U.h('td', { title: String(r[c] ?? '') }, String(r[c] ?? '')))))));
  }

  return { FIELDS, parseFile, detectKind, autoMap, inferNames, guessCollection, validate, build, buildRef, mappingUI, previewTable };
})();
