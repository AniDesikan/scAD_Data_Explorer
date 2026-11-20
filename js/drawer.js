'use strict';
/* Side panel with gene / pathway details ("zoom in to the biology"). */
const Drawer = (() => {
  let stack = [];
  const el = () => U.$('#drawer');
  const body = () => U.$('#drawer-body');

  function open(item) {
    const top = stack[stack.length - 1];
    if (top && top.type === item.type && top.id === item.id) stack[stack.length - 1] = item;
    else stack.push(item);
    if (stack.length > 30) stack.shift();
    render();
  }
  function back() { stack.pop(); if (stack.length) render(); else close(); }
  function close() { stack = []; purge(); el().classList.add('hidden'); }
  function refresh() { if (stack.length) render(); }
  function purge() { body().querySelectorAll('.js-plotly-plot').forEach(p => Plotly.purge(p)); body().innerHTML = ''; }
  const label = it => (it.type === 'gene' ? it.id : U.trunc(U.pretty(it.id), 30));

  function render() {
    const it = stack[stack.length - 1];
    el().classList.remove('hidden');
    U.$('#drawer-back').disabled = stack.length < 2;
    U.$('#drawer-crumbs').textContent = stack.slice(-4).map(label).join('  ›  ');
    purge();
    const b = body();
    if (it.type === 'gene') renderGene(b, it); else renderPath(b, it);
    b.scrollTop = 0;
  }

  // ---------- public annotation services (only the gene symbol / GO ID is sent) ----------
  const cache = new Map();
  function getJSON(url) {
    if (cache.has(url)) return cache.get(url);
    const p = fetch(url).then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); });
    cache.set(url, p); p.catch(() => cache.delete(url));
    return p;
  }
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const EU = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/';
  const pubmedURL = term => `https://pubmed.ncbi.nlm.nih.gov/?term=${encodeURIComponent(term)}`;
  async function pmCount(term) { const j = await getJSON(`${EU}esearch.fcgi?db=pubmed&retmode=json&retmax=0&term=${encodeURIComponent(term)}`); return +j.esearchresult.count; }
  async function pmTop(term, n = 5) {
    const j = await getJSON(`${EU}esearch.fcgi?db=pubmed&retmode=json&sort=relevance&retmax=${n}&term=${encodeURIComponent(term)}`);
    const ids = j.esearchresult.idlist || [];
    if (!ids.length) return [];
    await sleep(350);
    const s = await getJSON(`${EU}esummary.fcgi?db=pubmed&retmode=json&id=${ids.join(',')}`);
    return ids.map(id => s.result[id]).filter(Boolean).map(r => ({
      id: r.uid, title: r.title, journal: r.source, year: (r.pubdate || '').slice(0, 4),
      first: (r.authors || [])[0]?.name || '', etal: (r.authors || []).length > 1,
    }));
  }
  async function geneAnnot(g) {
    const f = s => `https://mygene.info/v3/query?q=symbol:${encodeURIComponent(s)}&species=`;
    const [m, hu] = await Promise.all([
      getJSON(f(g) + 'mouse&fields=name,summary,go.BP,entrezgene,alias&size=1'),
      getJSON(f(g.toUpperCase()) + 'human&fields=name,summary,entrezgene&size=1').catch(() => null),
    ]);
    return { mouse: m.hits && m.hits[0], human: hu && hu.hits && hu.hits[0] };
  }
  async function goInfo(id) {
    const j = await getJSON(`https://www.ebi.ac.uk/QuickGO/services/ontology/go/terms/${encodeURIComponent(id)}`);
    const r = j.results && j.results[0];
    return r ? { id: r.id, name: r.name, def: r.definition && r.definition.text, obsolete: r.isObsolete } : null;
  }
  async function goSearch(q) {
    const j = await getJSON(`https://www.ebi.ac.uk/QuickGO/services/ontology/go/search?query=${encodeURIComponent(q)}&limit=10`);
    const res = j.results || [];
    const exact = res.find(r => r.name.toLowerCase() === q.toLowerCase());
    return { hit: exact || res[0] || null, exact: !!exact };
  }

  // ---------- shared bits ----------
  function starBtn(type, id, ctx) {
    const b = U.h('button', { class: 'star' + (Store.isStarred(type, id) ? ' on' : ''), title: 'Star: save to your notebook' }, '★');
    b.onclick = () => b.classList.toggle('on', Store.toggleStar(type, id, ctx));
    return b;
  }
  function noteBox(type, id, ctx) {
    const n = Store.getNote(type, id);
    const ta = U.h('textarea', { class: 'note', placeholder: 'Your notes about this… (saved automatically, shown in Notebook)', value: n ? n.note : '' });
    ta.addEventListener('input', U.debounce(() => Store.setNoteText(type, id, ta.value, ctx), 400));
    return ta;
  }
  const links = arr => U.h('div', { class: 'links' }, arr.map(([l, u]) => U.h('a', { href: u, target: '_blank', rel: 'noopener noreferrer' }, l + ' ↗')));
  const ctxChip = (ctx, extra) => U.h('span', { class: 'badge', style: { background: '#f3f4f6', color: '#374151' } }, `${ctx.ct} · ${ctx.cmp}${extra || ''}`);

  // ================= GENE =================
  function geneHits(g) {
    const d = Store.d(), out = [];
    for (const t of Object.values(d.deg)) {
      const i = Store.rowMap(t).get(g);
      if (i != null) out.push({ ct: t.celltype, cmp: t.comparison, lfc: t.lfc[i], q: Store.degQ(t, i), sig: Store.isSig(t, i) });
    }
    return out;
  }

  function renderGene(b, it) {
    const g = it.id, d = Store.d(), s = Store.settings;
    const hits = geneHits(g);
    let ctx = it.ctx && Store.degTable(it.ctx.ct, it.ctx.cmp) ? it.ctx : null;
    if (!ctx && hits.length) { const best = hits.slice().sort((a, b2) => a.q - b2.q)[0]; ctx = { ct: best.ct, cmp: best.cmp }; }
    ctx = ctx || it.ctx || { ct: d.celltypes[0], cmp: d.comparisons[0] };

    b.append(U.h('h2', {}, g, starBtn('gene', g, ctx), U.h('span', { class: 'muted', style: { fontSize: '13px', fontWeight: 400 } }, 'gene')));
    const bulkSection = () => [U.h('h4', {}, d.bulk.title || 'Bulk RNA-seq'), BulkView.geneTable(d.bulk, g)];
    if (d.bulk && it.from === 'bulk') b.append(...bulkSection());

    // Plain-language summary
    const sig = hits.filter(h => h.sig);
    const lede = U.h('p', { class: 'lede' });
    if (!hits.length) lede.append('This gene is not in any of your DEG tables (not detected or filtered out).');
    else if (!sig.length) lede.append(`Tested in ${hits.length} cell type × comparison combinations; not significant in any (${U.qn()} < ${s.degPadj}, |log2FC| ≥ ${s.degLfc}).`);
    else {
      lede.append(`Significant in ${sig.length} of ${hits.length} tests: `);
      sig.sort((a, b2) => a.q - b2.q).slice(0, 6).forEach((h, k) => {
        if (k) lede.append(', ');
        lede.append(U.h('b', { style: { color: h.lfc > 0 ? 'var(--up)' : 'var(--down)' } }, `${U.arrow(h.lfc)} ${h.ct}`), ` (${h.cmp}, ${U.signed(h.lfc)})`);
      });
      if (sig.length > 6) lede.append(`, and ${sig.length - 6} more`);
      lede.append('.');
    }
    b.append(lede);

    b.append(links([
      ['NCBI Gene', `https://www.ncbi.nlm.nih.gov/gene/?term=${encodeURIComponent(g)}%5Bsym%5D+AND+mouse%5Borgn%5D`],
      ['MGI', `https://www.informatics.jax.org/quicksearch/summary?queryType=exactPhrase&query=${encodeURIComponent(g)}`],
      ['UniProt', `https://www.uniprot.org/uniprotkb?query=gene_exact:${encodeURIComponent(g)}+AND+organism_id:10090`],
      ['GeneCards (human)', `https://www.genecards.org/cgi-bin/carddisp.pl?gene=${encodeURIComponent(g.toUpperCase())}`],
      ['Allen Brain ISH', `https://mouse.brain-map.org/search/show?search_term=${encodeURIComponent(g)}&search_type=gene`],
      ['Protein Atlas (brain)', `https://www.proteinatlas.org/search/${encodeURIComponent(g)}`],
      ['Alliance', `https://www.alliancegenome.org/search?q=${encodeURIComponent(g)}`],
    ]));

    // Across the dataset
    b.append(U.h('h4', {}, 'In your data: log2FC across cell types and comparisons'));
    if (hits.length) {
      const H = new Map(hits.map(h => [h.ct + '||' + h.cmp, h]));
      const max = Math.max(0.5, ...hits.map(h => Math.abs(h.lfc)).filter(Number.isFinite));
      b.append(U.h('div', { class: 'hscroll' }, U.heatTable(d.celltypes, d.comparisons.map(c => ({ label: c, title: d.compLabels[c] || c })), (ri, ci) => {
        const h = H.get(d.celltypes[ri] + '||' + d.comparisons[ci]);
        if (!h) return null;
        const here = d.celltypes[ri] === ctx.ct && d.comparisons[ci] === ctx.cmp;
        return {
          v: h.lfc, text: U.signed(h.lfc, 2) + U.stars(h.q, s.degPadj), cls: here ? 'cur' : '',
          title: `${h.ct} · ${h.cmp}\nlog2FC ${U.fmt(h.lfc, 3)}, ${U.qn()} ${U.fmtP(h.q)}${h.sig ? '' : ' (not significant at your thresholds)'}\nClick to open the volcano`,
          onclick: () => { close(); App.openExplore(h.ct, h.cmp, [g]); },
        };
      }, { max })),
      U.h('div', { class: 'muted small-text' }, `Stars = ${U.qn()} (* <0.05, ** <0.01, *** <0.001). Outlined = the context you came from. Click a cell to see the gene on that volcano.`));
    } else b.append(U.h('p', { class: 'muted' }, 'No data.'));

    // Pathways containing the gene
    b.append(U.h('h4', {}, 'Significant pathways in which this gene is a driver'));
    const g2p = Store.index().gene2paths.get(g) || [];
    const anyGenes = Object.values(d.gsea).some(t => t.genes);
    if (!anyGenes) b.append(U.h('p', { class: 'muted small-text' }, 'Your pathway tables have no leading-edge / gene column, so gene→pathway links are unavailable. Include the leadingEdge or core_enrichment column when exporting.'));
    else if (!g2p.length) b.append(U.h('p', { class: 'muted small-text' }, `Not a driver gene of any pathway passing ${U.qn()} < ${s.gseaPadj}.`));
    else {
      const byName = new Map();
      for (const { k, i } of g2p) {
        const t = d.gsea[k];
        if (!byName.has(t.names[i])) byName.set(t.names[i], []);
        byName.get(t.names[i]).push({ ct: t.celltype, cmp: t.comparison, score: t.score[i], q: Store.pathQ(t, i) });
      }
      const list = [...byName.entries()].sort((a, b2) => b2[1].length - a[1].length).slice(0, 25);
      b.append(U.h('div', {}, list.map(([name, ctxs]) => U.h('div', { class: 'insight', onclick: () => open({ type: 'path', id: name, ctx: { ct: ctxs[0].ct, cmp: ctxs[0].cmp } }) },
        U.h('div', {}, U.pretty(name)),
        U.h('div', {}, ctxs.slice(0, 8).map(c => U.h('span', { class: 'chip ' + (c.score > 0 ? 'up' : 'down'), title: `${U.qn()} ${U.fmtP(c.q)}` }, `${U.arrow(c.score)} ${c.ct} · ${c.cmp}`)), ctxs.length > 8 ? ` +${ctxs.length - 8}` : '')))));
      if (byName.size > 25) b.append(U.h('div', { class: 'muted small-text' }, `…and ${byName.size - 25} more.`));
    }

    // Published datasets
    const refs = Object.values(d.refs);
    if (d.bulk && it.from !== 'bulk') b.append(...bulkSection());
    if (refs.length || !d.bulk) b.append(U.h('h4', {}, 'In published datasets'));
    if (!refs.length) { if (!d.bulk) b.append(U.h('p', { class: 'muted small-text' }, 'No published datasets loaded yet (see the Published data tab).')); }
    else {
      b.append(U.h('table', { class: 'tbl' },
        U.h('tr', {}, U.h('th', {}, 'Dataset'), U.h('th', { class: 'num' }, 'log2FC / dir'), U.h('th', { class: 'num' }, 'FDR'), U.h('th', {}, '')),
        refs.map(r => {
          const i = Store.rowMap(r).get(g), sigM = Store.refSig(r);
          const dir = i == null ? null : r.lfc ? r.lfc[i] : r.dir ? r.dir[i] : null;
          return U.h('tr', {},
            U.h('td', { title: r.description || '' }, r.name, r.celltype ? U.h('span', { class: 'muted' }, ` (${r.celltype})`) : ''),
            U.h('td', { class: 'num' }, i == null ? '—' : r.lfc ? U.signed(r.lfc[i]) : dir != null ? U.arrow(dir) : 'listed'),
            U.h('td', { class: 'num' }, i == null || !(r.padj || r.p) ? '' : U.fmtP((r.padj || r.p)[i])),
            U.h('td', {}, sigM.has(g) ? U.h('span', { class: 'chip ' + (sigM.get(g) > 0 ? 'up' : sigM.get(g) < 0 ? 'down' : '') }, 'significant') : i == null ? U.h('span', { class: 'muted' }, 'absent') : ''));
        })));
    }

    // Public knowledge
    b.append(U.h('h4', {}, 'What is known about it'));
    const annot = U.h('div', { class: 'annot' });
    const lit = U.h('div');
    b.append(annot, U.h('h4', {}, 'Literature'), lit);
    const ctWords = (ctx.ct || '').replace(/[^A-Za-z0-9 ]/g, ' ').split(/\s+/).filter(w => w.length >= 3 && !/^(cells?|type|other)$/i.test(w));
    const queries = [
      [`${g} + hippocampus`, `${g}[tiab] AND hippocampus[tiab]`],
      [`${g} + estrogen / aromatase`, `${g}[tiab] AND (estrogen*[tiab] OR estradiol[tiab] OR aromatase[tiab])`],
      [`${g} + sex differences`, `${g}[tiab] AND ("sex difference*"[tiab] OR "sexually dimorphic"[tiab] OR "sex-specific"[tiab])`],
      ctWords.length ? [`${g} + ${ctWords.join(' ')}`, `${g}[tiab] AND ${ctWords.map(w => w + '[tiab]').join(' AND ')}`] : null,
      [`${g} + Alzheimer's`, `${g}[tiab] AND alzheimer*[tiab]`],
    ].filter(Boolean);
    const countCells = queries.map(() => U.h('span', { class: 'muted' }, ''));
    lit.append(U.h('table', { class: 'tbl' }, queries.map(([l, q], k) => U.h('tr', {},
      U.h('td', {}, l), U.h('td', { class: 'num' }, countCells[k]),
      U.h('td', {}, U.h('a', { href: pubmedURL(q), target: '_blank', rel: 'noopener noreferrer' }, 'PubMed ↗'))))));
    const topBox = U.h('div');
    lit.append(topBox);

    const loadAnnot = async () => {
      annot.innerHTML = ''; annot.append(U.h('span', { class: 'muted' }, 'Loading from MyGene.info…'));
      try {
        const a = await geneAnnot(g);
        annot.innerHTML = '';
        if (!a.mouse && !a.human) { annot.append(U.h('span', { class: 'muted' }, 'No record found for this symbol.')); return; }
        if (a.mouse) annot.append(U.h('div', {}, U.h('b', {}, a.mouse.name || g), a.mouse.alias ? U.h('span', { class: 'muted' }, ` · aliases: ${[].concat(a.mouse.alias).slice(0, 6).join(', ')}`) : ''));
        const summ = (a.mouse && a.mouse.summary) || (a.human && a.human.summary);
        if (summ) annot.append(U.h('p', { style: { margin: '6px 0' } }, summ, U.h('span', { class: 'muted' }, a.mouse && a.mouse.summary ? ' (mouse)' : ' (RefSeq summary of the human ortholog)')));
        const bp = a.mouse && a.mouse.go ? [].concat(a.mouse.go.BP || []) : [];
        const terms = [...new Map(bp.map(x => [x.term, x])).values()].slice(0, 18);
        if (terms.length) {
          const known = Store.index().paths;
          annot.append(U.h('div', { class: 'muted small-text', style: { marginTop: '4px' } }, 'GO biological processes (click to look up):'),
            U.h('div', { class: 'chips' }, terms.map(x => {
              const match = [...known.keys()].find(n => U.plainPath(n).toLowerCase() === x.term.toLowerCase());
              return U.h('span', { class: 'chip' + (match ? ' mixed' : ''), title: match ? 'Also in your pathway results; click to open' : `${x.id}: open in QuickGO`, onclick: () => match ? open({ type: 'path', id: match, ctx }) : window.open(`https://www.ebi.ac.uk/QuickGO/term/${x.id}`, '_blank', 'noopener') }, x.term);
            })));
        }
      } catch (e) { annot.innerHTML = ''; annot.append(U.h('span', { class: 'muted' }, `Could not reach MyGene.info (${e.message}). Use the links above.`)); }
    };
    const loadLit = async () => {
      topBox.innerHTML = ''; topBox.append(U.h('span', { class: 'muted small-text' }, 'Querying PubMed…'));
      try {
        for (let k = 0; k < queries.length; k++) {
          countCells[k].textContent = '…';
          const n = await pmCount(queries[k][1]);
          countCells[k].textContent = `${n.toLocaleString()} papers`;
          await sleep(350);
        }
        // Prefer the most specific search that has hits: cell type, then hippocampus, then estrogen.
        const n = k => parseInt(countCells[k].textContent.replace(/,/g, '')) || 0;
        const order = (ctWords.length ? [3] : []).concat([0, 1, 2]);
        const pick = queries[order.find(k => n(k) > 0) ?? 0];
        const top = await pmTop(pick[1]);
        topBox.innerHTML = '';
        if (top.length) topBox.append(U.h('div', { class: 'muted small-text', style: { marginTop: '6px' } }, `Most relevant for “${pick[0]}”:`),
          U.h('ol', { class: 'lit' }, top.map(p => U.h('li', {}, U.h('a', { href: `https://pubmed.ncbi.nlm.nih.gov/${p.id}/`, target: '_blank', rel: 'noopener noreferrer' }, p.title), U.h('span', { class: 'muted' }, ` ${p.first}${p.etal ? ' et al.' : ''}, ${p.journal} ${p.year}`)))));
      } catch (e) { topBox.innerHTML = ''; topBox.append(U.h('span', { class: 'muted small-text' }, `PubMed not reachable (${e.message}); the links still work.`)); }
    };
    if (s.autoAnnot) { loadAnnot(); loadLit(); }
    else {
      annot.append(U.h('div', { class: 'small-text muted', style: { marginBottom: '6px' } }, 'Fetch a gene summary and GO terms from MyGene.info. Only the gene symbol is sent; none of your results are.'),
        U.h('button', { class: 'small', onclick: loadAnnot }, 'Load gene summary'));
      topBox.append(U.h('button', { class: 'small', style: { marginTop: '6px' }, onclick: loadLit }, 'Count papers & show top hits'));
    }

    b.append(U.h('h4', {}, 'Your notes'), noteBox('gene', g, ctx));
  }

  // ================= PATHWAY =================
  function pathEntries(name) {
    const d = Store.d(), out = [];
    for (const { k, i } of Store.index().paths.get(name) || []) {
      const t = d.gsea[k];
      out.push({ ct: t.celltype, cmp: t.comparison, coll: t.collection, t, i, score: t.score[i], q: Store.pathQ(t, i), genes: t.genes ? t.genes[i] : null, id: t.ids ? t.ids[i] : '', size: t.size ? t.size[i] : NaN, type: t.scoreType });
    }
    return out;
  }

  function renderPath(b, it) {
    const name = it.id, d = Store.d(), s = Store.settings;
    const entries = pathEntries(name);
    const E = new Map();
    for (const e of entries) { const k = e.ct + '||' + e.cmp; if (!E.has(k) || e.q < E.get(k).q) E.set(k, e); }
    let cur = it.ctx && E.get(it.ctx.ct + '||' + it.ctx.cmp);
    if (!cur && entries.length) cur = entries.slice().sort((a, b2) => a.q - b2.q)[0];
    const ctx = cur ? { ct: cur.ct, cmp: cur.cmp } : it.ctx;
    const id = (entries.find(e => e.id) || {}).id || '';
    const goid = /^GO:\d{7}$/.test(id) ? id : (name.match(/GO:\d{7}/) || [])[0];

    b.append(U.h('h2', {}, U.pretty(name), starBtn('path', name, ctx)));
    b.append(U.h('div', { class: 'muted small-text' }, [name !== U.pretty(name) ? name : null, id, cur ? cur.coll : null].filter(Boolean).join(' · ')));

    const sigE = entries.filter(e => e.q < s.gseaPadj);
    const lede = U.h('p', { class: 'lede' });
    if (!sigE.length) lede.append(`Not significant (${U.qn()} < ${s.gseaPadj}) in any cell type × comparison.`);
    else {
      const up = sigE.filter(e => e.score > 0), dn = sigE.filter(e => e.score < 0);
      lede.append(`Significant in ${sigE.length} of ${E.size} tests. `);
      if (up.length) lede.append(U.h('b', { style: { color: 'var(--up)' } }, '↑ '), up.map(e => `${e.ct} (${e.cmp})`).slice(0, 6).join(', '), up.length > 6 ? ` +${up.length - 6}` : '', '. ');
      if (dn.length) lede.append(U.h('b', { style: { color: 'var(--down)' } }, '↓ '), dn.map(e => `${e.ct} (${e.cmp})`).slice(0, 6).join(', '), dn.length > 6 ? ` +${dn.length - 6}` : '', '.');
    }
    b.append(lede);

    const plain = U.plainPath(name);
    const L = [];
    if (goid) L.push(['QuickGO', `https://www.ebi.ac.uk/QuickGO/term/${goid}`], ['AmiGO', `https://amigo.geneontology.org/amigo/term/${goid}`]);
    const rid = (id.match(/R-(MMU|HSA)-\d+/) || [])[0]; if (rid) L.push(['Reactome', `https://reactome.org/content/detail/${rid}`]);
    const kid = (id.match(/^(mmu|hsa)\d{5}$/) || [])[0]; if (kid) L.push(['KEGG', `https://www.kegg.jp/pathway/${kid}`]);
    if (/^[A-Z0-9]+_[A-Z0-9_]+$/.test(name)) L.push(['MSigDB', `https://www.gsea-msigdb.org/gsea/msigdb/mouse/geneset/${name}.html`]);
    L.push(['PubMed: + hippocampus', pubmedURL(`"${plain}" AND hippocampus`)], ['PubMed: + estrogen', pubmedURL(`"${plain}" AND (estrogen OR estradiol OR aromatase)`)]);
    b.append(links(L));

    // Definition
    const def = U.h('div', { class: 'annot', style: { marginTop: '8px' } });
    b.append(def);
    const loadDef = async () => {
      def.innerHTML = ''; def.append(U.h('span', { class: 'muted' }, 'Looking up the Gene Ontology…'));
      try {
        let info = null, note = '';
        if (goid) info = await goInfo(goid);
        else { const r = await goSearch(plain); if (r.hit) { info = await goInfo(r.hit.id); if (!r.exact) note = 'Closest GO term by name (check it matches): '; } }
        def.innerHTML = '';
        if (!info) { def.append(U.h('span', { class: 'muted' }, 'No Gene Ontology definition found.')); return; }
        def.append(U.h('div', {}, U.h('span', { class: 'muted' }, note), U.h('b', {}, info.name), ' ', U.h('a', { href: `https://www.ebi.ac.uk/QuickGO/term/${info.id}`, target: '_blank', rel: 'noopener noreferrer' }, info.id)), U.h('p', { style: { margin: '6px 0 0' } }, info.def || ''));
      } catch (e) { def.innerHTML = ''; def.append(U.h('span', { class: 'muted' }, `Could not reach QuickGO (${e.message}).`)); }
    };
    if (s.autoAnnot) loadDef();
    else def.append(U.h('div', { class: 'small-text muted', style: { marginBottom: '6px' } }, 'Fetch the definition from the Gene Ontology (QuickGO). Only the term name / ID is sent.'), U.h('button', { class: 'small', onclick: loadDef }, 'Load definition'));

    // Score across contexts
    b.append(U.h('h4', {}, 'Enrichment across cell types and comparisons'));
    if (E.size) {
      const max = Math.max(1, ...[...E.values()].map(e => Math.abs(e.score)).filter(Number.isFinite));
      b.append(U.h('div', { class: 'hscroll' }, U.heatTable(d.celltypes, d.comparisons.map(c => ({ label: c, title: d.compLabels[c] || c })), (ri, ci) => {
        const e = E.get(d.celltypes[ri] + '||' + d.comparisons[ci]);
        if (!e) return null;
        const here = ctx && e.ct === ctx.ct && e.cmp === ctx.cmp;
        return {
          v: e.score, text: U.fmt(e.score, 1) + U.stars(e.q, s.gseaPadj), cls: here ? 'cur' : '',
          title: `${e.ct} · ${e.cmp}\n${e.type === 'NES' ? 'NES' : 'score'} ${U.fmt(e.score)}, ${U.qn()} ${U.fmtP(e.q)}\nClick to show its driver genes`,
          onclick: () => open({ type: 'path', id: name, ctx: { ct: e.ct, cmp: e.cmp } }),
        };
      }, { max })), U.h('div', { class: 'muted small-text' }, 'Outlined = the context shown below. Click another cell to switch.'));
    }

    // Driver genes in this context
    if (cur) {
      b.append(U.h('h4', {}, `Driver genes in ${cur.ct} · ${cur.cmp}`));
      const t = Store.degTable(cur.ct, cur.cmp);
      if (!cur.genes || !cur.genes.length) b.append(U.h('p', { class: 'muted small-text' }, 'No leading-edge / gene list for this pathway in your table.'));
      else {
        const rows = cur.genes.map(g => { const i = t ? Store.rowMap(t).get(g) : null; return { g, lfc: i != null ? t.lfc[i] : NaN, q: i != null ? Store.degQ(t, i) : NaN, sig: i != null && Store.isSig(t, i) }; })
          .sort((a, b2) => (Number.isFinite(b2.lfc) ? b2.lfc : -99) - (Number.isFinite(a.lfc) ? a.lfc : -99));
        const shown = rows.filter(r => Number.isFinite(r.lfc)).slice(0, 60);
        b.append(U.h('div', { class: 'muted small-text' }, `${cur.genes.length} genes drive this enrichment (leading edge / overlap); ${rows.filter(r => r.sig).length} are individually significant DEGs. Click a bar to open the gene.`));
        const div = U.h('div'); b.append(div);
        if (shown.length) U.plot(div, [{
          type: 'bar', orientation: 'h', y: shown.map((_, i) => i), x: shown.map(r => r.lfc),
          marker: { color: shown.map(r => (r.lfc > 0 ? '#b2182b' : '#2166ac')), opacity: shown.map(r => (r.sig ? 0.95 : 0.35)) },
          customdata: shown.map(r => [r.g, U.fmtP(r.q)]), hovertemplate: `<b>%{customdata[0]}</b><br>log2FC %{x:.3f}<br>${U.qn()} %{customdata[1]}<extra></extra>`,
        }], {
          height: 50 + shown.length * 16, margin: { l: 90, r: 10, t: 6, b: 34 },
          yaxis: { tickvals: shown.map((_, i) => i), ticktext: shown.map(r => r.g), autorange: 'reversed', tickfont: { size: 10.5 } },
          xaxis: { title: { text: 'log2FC (solid = significant DEG)' }, zeroline: true, zerolinecolor: '#9ca3af', gridcolor: '#f1f2f4' },
        }, pt => open({ type: 'gene', id: pt.customdata[0], ctx: { ct: cur.ct, cmp: cur.cmp } }));
        const missing = rows.filter(r => !Number.isFinite(r.lfc)).map(r => r.g);
        if (missing.length) b.append(U.h('div', { class: 'muted small-text' }, `Not in the DEG table: ${missing.slice(0, 30).join(', ')}${missing.length > 30 ? '…' : ''}`));
        b.append(U.h('div', { class: 'btnrow', style: { marginTop: '6px' } },
          U.h('button', { class: 'small', onclick: () => U.copy(cur.genes.join('\n')) }, 'Copy genes'),
          U.h('button', { class: 'small', onclick: () => { const ex = Store.uiGet('explore', {}); ex.overlay = 'path::' + name; close(); App.openExplore(cur.ct, cur.cmp); } }, 'Highlight on volcano')));
      }

      // Driver genes across contexts
      const sigCtx = sigE.filter(e => e.genes && e.genes.length).slice(0, 16);
      if (sigCtx.length > 1) {
        b.append(U.h('h4', {}, 'Which genes drive it where?'));
        b.append(U.h('div', { class: 'muted small-text', style: { marginBottom: '4px' } }, 'Columns = contexts where this pathway is significant. Values = gene log2FC there; boxed = gene is in that context’s driver list. Different drivers in different cell types or sexes can point to different mechanisms.'));
        const freq = new Map();
        sigCtx.forEach(e => e.genes.forEach(g => freq.set(g, (freq.get(g) || 0) + 1)));
        const genes = [...freq.entries()].sort((a, b2) => b2[1] - a[1]).slice(0, 30).map(x => x[0]);
        const sets = sigCtx.map(e => new Set(e.genes)), tabs = sigCtx.map(e => Store.degTable(e.ct, e.cmp));
        b.append(U.h('div', { class: 'hscroll' }, U.heatTable(
          genes.map(g => ({ label: g, cls: 'gene', onclick: () => open({ type: 'gene', id: g, ctx }) })),
          sigCtx.map(e => ({ label: `${U.trunc(e.ct, 12)} ${e.cmp.replace(/_vs_/, '/')}`.slice(0, 26), title: `${e.ct} · ${e.cmp}` })),
          (ri, ci) => {
            const t = tabs[ci], i = t ? Store.rowMap(t).get(genes[ri]) : null;
            if (i == null) return null;
            return { v: t.lfc[i], text: U.fmt(t.lfc[i], 1), cls: sets[ci].has(genes[ri]) ? 'le' : '', title: `${genes[ri]} in ${sigCtx[ci].ct} · ${sigCtx[ci].cmp}: log2FC ${U.fmt(t.lfc[i], 3)}, ${U.qn()} ${U.fmtP(Store.degQ(t, i))}`, onclick: () => open({ type: 'gene', id: genes[ri], ctx: { ct: sigCtx[ci].ct, cmp: sigCtx[ci].cmp } }) };
          }, { max: 1 })));
      }
    }

    // Published overlap
    const refs = Object.values(d.refs);
    if (refs.length && cur && cur.genes) {
      b.append(U.h('h4', {}, 'Driver genes also changed in published datasets'));
      b.append(U.h('div', {}, refs.map(r => {
        const m = Store.refSig(r), ov = cur.genes.filter(g => m.has(g));
        return U.h('div', { class: 'small-text', style: { marginBottom: '6px' } }, U.h('b', {}, `${ov.length}/${cur.genes.length}`), ` — ${r.name}`,
          ov.length ? U.h('div', { class: 'chips' }, ov.slice(0, 40).map(g => U.h('span', { class: 'chip ' + (m.get(g) > 0 ? 'up' : m.get(g) < 0 ? 'down' : ''), onclick: () => open({ type: 'gene', id: g, ctx }) }, g))) : null);
      })));
    }

    b.append(U.h('h4', {}, 'Your notes'), noteBox('path', name, ctx));
  }

  function init() {
    U.$('#drawer-close').onclick = close;
    U.$('#drawer-back').onclick = back;
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && stack.length && !e.target.closest('input,textarea')) close(); });
  }

  return { open, close, back, refresh, init };
})();
