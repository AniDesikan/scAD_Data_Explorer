'use strict';
/* Router, header, global search, startup. */
const App = (() => {
  const VIEWS = { atlas: AtlasView, explore: ExploreView, compare: CompareView, refs: RefsView, notes: NotesView, data: DataView };
  const NEEDS_DATA = new Set(['atlas', 'explore', 'compare']);
  const tab = () => { const t = location.hash.slice(1); return VIEWS[t] ? t : 'atlas'; };

  function render() {
    const t = tab(), root = U.$('#view');
    document.querySelectorAll('#tabs a').forEach(a => a.classList.toggle('active', a.dataset.tab === t));
    const y = window.scrollY;
    root.querySelectorAll('.js-plotly-plot').forEach(p => Plotly.purge(p));
    root.innerHTML = '';
    if (NEEDS_DATA.has(t) && !Store.hasData()) { root.append(welcome()); return; }
    try { VIEWS[t].render(root); }
    catch (e) { console.error(e); root.append(U.card('Something went wrong drawing this page', String(e && e.message || e))); }
    if (t === lastTab) window.scrollTo(0, y);
    lastTab = t;
  }
  let lastTab = null;

  function go(t) {
    if (location.hash.slice(1) === t) render();
    else location.hash = t;
  }
  function openExplore(ct, cmp, genes) {
    const ui = Store.uiGet('explore', {});
    ui.ct = ct; ui.cmp = cmp;
    if (genes) ui.find = genes.join(', ');
    Store.uiSave();
    if (tab() === 'explore') { render(); window.scrollTo(0, 0); } else go('explore');
  }

  function welcome() {
    return U.h('div', { class: 'welcome' }, U.card('Welcome', null, U.h('div', { html: `
      <p>This explorer helps you browse differential expression and pathway results from single-cell RNA-seq of the mouse hippocampus, cell type by cell type, and turn interesting patterns into hypotheses.</p>
      <ol>
        <li><b>Overview</b>: which cell types change the most, and which pathways move where.</li>
        <li><b>Cell type</b>: volcano plot, gene table and pathways for one cell type and comparison.</li>
        <li><b>Compare contrasts</b>: e.g. what aromatase knockout does in males vs. in females.</li>
        <li><b>Published data</b>: overlap with gene lists from other hippocampus studies.</li>
        <li>Click any gene or pathway to open a <b>detail panel</b> with its pattern across all cell types, its driver genes, database links and literature. Star (★) anything interesting; it is collected in the <b>Notebook</b>.</li>
      </ol>
      <p class="muted">No data is loaded in this browser yet. If someone sent you a bundle file, load it below. To try the tool first, load the simulated demo (made-up numbers, clearly labelled).</p>` }),
      U.h('div', { class: 'btnrow' },
        (() => {
          const input = U.h('input', { type: 'file', accept: '.json,.gz', class: 'hidden' });
          input.onchange = async () => { try { await Store.importBundleFile(input.files[0]); } catch (e) { U.toast('Could not load bundle: ' + e.message, 5000); } };
          return U.h('span', {}, input, U.h('button', { class: 'primary', onclick: () => input.click() }, 'Load a bundle file…'));
        })(),
        U.h('button', { onclick: () => Store.loadDemo() }, 'Load simulated demo data'),
        U.h('button', { onclick: () => go('data') }, 'Upload result tables'))));
  }

  function updateHeader() {
    const d = Store.d();
    U.$('#app-title').textContent = d.meta.title || 'Hippocampus scRNA-seq Explorer';
    document.title = d.meta.title || 'Hippocampus scRNA Explorer';
    U.$('#demo-badge').classList.toggle('hidden', !d.meta.demo);
    updateNotesCount();
  }
  function updateNotesCount() {
    const n = Object.values(Store.notes.items).filter(x => x.starred || x.note).length + Store.notes.hypotheses.length;
    U.$('#notes-count').textContent = n ? n : '';
  }

  function setupSearch() {
    const input = U.$('#global-search'), box = U.$('#search-results');
    let items = [], sel = 0;
    const hide = () => box.classList.add('hidden');
    const choose = it => { hide(); input.value = ''; input.blur(); Drawer.open({ type: it.type, id: it.id, ctx: null }); };
    function draw() {
      box.innerHTML = '';
      if (!items.length) { box.append(U.h('div', { class: 'item muted' }, 'No matches')); }
      let lastType = null;
      items.forEach((it, k) => {
        if (it.type !== lastType) { box.append(U.h('div', { class: 'head' }, it.type === 'gene' ? 'Genes' : 'Pathways')); lastType = it.type; }
        box.append(U.h('div', { class: 'item' + (k === sel ? ' sel' : ''), onmousedown: e => { e.preventDefault(); choose(it); } },
          U.h('span', {}, it.label), U.h('span', { class: 'kind' }, it.extra || '')));
      });
      box.classList.remove('hidden');
    }
    input.addEventListener('input', () => {
      const q = input.value.trim().toLowerCase();
      if (q.length < 2) { hide(); return; }
      const idx = Store.index();
      const gs = idx.genes.filter(g => g.toLowerCase().startsWith(q)).sort((a, b) => a.length - b.length).slice(0, 8);
      if (gs.length < 8) gs.push(...idx.genes.filter(g => !g.toLowerCase().startsWith(q) && g.toLowerCase().includes(q)).slice(0, 8 - gs.length));
      const ps = idx.pathNames.filter(n => n.toLowerCase().includes(q) || U.pretty(n).toLowerCase().includes(q)).slice(0, 10);
      items = [
        ...gs.map(g => { let n = 0; for (const t of Object.values(Store.d().deg)) { const i = Store.rowMap(t).get(g); if (i != null && Store.isSig(t, i)) n++; } return { type: 'gene', id: g, label: g, extra: n ? `DEG in ${n} test${n === 1 ? '' : 's'}` : '' }; }),
        ...ps.map(n => ({ type: 'path', id: n, label: U.trunc(U.pretty(n), 52), extra: `${idx.paths.get(n).filter(e => Store.pathSig(Store.d().gsea[e.k], e.i)).length} sig.` })),
      ];
      sel = 0; draw();
    });
    input.addEventListener('keydown', e => {
      if (box.classList.contains('hidden')) return;
      if (e.key === 'ArrowDown') { sel = Math.min(items.length - 1, sel + 1); draw(); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { sel = Math.max(0, sel - 1); draw(); e.preventDefault(); }
      else if (e.key === 'Enter' && items[sel]) choose(items[sel]);
      else if (e.key === 'Escape') hide();
    });
    input.addEventListener('blur', () => setTimeout(hide, 150));
  }

  async function init() {
    Drawer.init();
    setupSearch();
    Store.on('data', () => { updateHeader(); render(); Drawer.refresh(); });
    Store.on('settings', () => { render(); Drawer.refresh(); });
    Store.on('notes', updateNotesCount);
    window.addEventListener('hashchange', render);
    if (typeof Plotly === 'undefined' || typeof Papa === 'undefined') {
      U.$('#view').append(U.card('Plotting libraries did not load', 'This page loads Plotly and PapaParse from cdnjs.cloudflare.com. Check the internet connection (your data is still never uploaded) and reload.'));
      return;
    }
    await Store.init();
    updateHeader();
    render();
  }

  return { render, go, openExplore, init };
})();

document.addEventListener('DOMContentLoaded', App.init);
