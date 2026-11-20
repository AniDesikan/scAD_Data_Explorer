'use strict';
/* Notebook: starred genes/pathways with notes, and free-text hypotheses. Exportable to share back. */
const NotesView = (() => {
  function render(root) {
    const N = Store.notes;
    root.append(U.h('div', { class: 'view-head' },
      U.h('h2', {}, 'Notebook'),
      U.h('p', { class: 'muted' }, 'Everything you star (★) or annotate lands here. Notes are saved in this browser only. Use “Export notes” to send them to a colleague, or “Download as text” for a lab-meeting summary.')));

    root.append(U.card(null, null, U.h('div', { class: 'btnrow' },
      U.h('button', { class: 'primary', onclick: exportMarkdown }, 'Download as text (Markdown)'),
      U.h('button', { onclick: () => U.download('explorer_notes.json', JSON.stringify(N, null, 1), 'application/json') }, 'Export notes (JSON)'),
      importButton())));

    // Hypotheses
    const hypWrap = U.h('div');
    const title = U.h('input', { type: 'text', placeholder: 'Hypothesis, e.g. “Aromatase loss drives a microglial interferon response in females only”', style: { width: '100%' } });
    const text = U.h('textarea', { placeholder: 'Evidence, genes, pathways, next experiments…', style: { width: '100%', minHeight: '70px', marginTop: '6px' } });
    root.append(U.card('Hypotheses', null, title, text,
      U.h('div', { style: { marginTop: '6px' } }, U.h('button', { class: 'primary', onclick: () => {
        if (!title.value.trim()) return U.toast('Give it a title first');
        N.hypotheses.unshift({ id: Date.now(), title: title.value.trim(), text: text.value, ts: Date.now() });
        Store.saveNotes(); App.render();
      } }, 'Add hypothesis')), hypWrap));
    N.hypotheses.forEach((h, k) => {
      const ta = U.h('textarea', { class: 'note', value: h.text });
      ta.addEventListener('input', U.debounce(() => { h.text = ta.value; Store.saveNotes(true); }, 400));
      hypWrap.append(U.h('div', { class: 'noteitem', style: { marginTop: '10px' } },
        U.h('div', { class: 'btnrow' }, U.h('b', {}, h.title), U.h('span', { class: 'muted small-text' }, new Date(h.ts).toLocaleDateString()),
          U.h('button', { class: 'small danger', style: { marginLeft: 'auto' }, onclick: () => { if (confirm('Delete this hypothesis?')) { N.hypotheses.splice(k, 1); Store.saveNotes(); App.render(); } } }, 'Delete')),
        ta));
    });

    const items = Object.values(N.items).sort((a, b) => b.ts - a.ts);
    for (const [type, label] of [['gene', 'Genes'], ['path', 'Pathways']]) {
      const list = items.filter(x => x.type === type);
      const wrap = U.h('div');
      root.append(U.card(`${label} (${list.length})`, list.length ? null : `Nothing yet. Open a ${type === 'gene' ? 'gene' : 'pathway'} and click ★.`, wrap));
      list.forEach(it => {
        const ta = U.h('textarea', { class: 'note', value: it.note || '', placeholder: 'notes…' });
        ta.addEventListener('input', U.debounce(() => Store.setNoteText(it.type, it.id, ta.value, it.ctx), 400));
        wrap.append(U.h('div', { class: 'noteitem' },
          U.h('div', { class: 'btnrow' },
            U.h('span', { class: 't', onclick: () => Drawer.open({ type: it.type, id: it.id, ctx: it.ctx }) }, type === 'gene' ? it.id : U.pretty(it.id)),
            it.starred ? U.h('span', { style: { color: '#f59e0b' } }, '★') : null,
            it.ctx ? U.h('span', { class: 'muted small-text' }, `seen in ${it.ctx.ct} · ${it.ctx.cmp}`) : null,
            U.h('button', { class: 'small', style: { marginLeft: 'auto' }, onclick: () => { Store.setStar(it.type, it.id, false); Store.setNoteText(it.type, it.id, '', it.ctx); App.render(); } }, 'Remove')),
          ta));
      });
    }
  }

  function importButton() {
    const input = U.h('input', { type: 'file', accept: '.json', class: 'hidden' });
    input.onchange = async () => {
      try {
        const obj = JSON.parse(await input.files[0].text());
        const N = Store.notes; let n = 0;
        for (const [k, v] of Object.entries(obj.items || {})) {
          const cur = N.items[k];
          if (!cur) { N.items[k] = v; n++; }
          else { cur.starred = cur.starred || v.starred; if (v.note && !cur.note.includes(v.note)) cur.note = cur.note ? `${cur.note}\n---\n${v.note}` : v.note; n++; }
        }
        for (const h of obj.hypotheses || []) if (!N.hypotheses.some(x => x.id === h.id)) { N.hypotheses.push(h); n++; }
        Store.saveNotes(); App.render(); U.toast(`Merged ${n} notes`);
      } catch (e) { U.toast('Could not read that notes file: ' + e.message, 5000); }
      input.value = '';
    };
    return U.h('span', {}, input, U.h('button', { onclick: () => input.click() }, 'Import & merge notes'));
  }

  function exportMarkdown() {
    const N = Store.notes, d = Store.d();
    const L = [`# ${d.meta.title || 'Hippocampus scRNA-seq'}: notebook`, '', `Exported ${new Date().toLocaleString()}`, ''];
    if (N.hypotheses.length) { L.push('## Hypotheses', ''); N.hypotheses.forEach(h => L.push(`### ${h.title}`, '', h.text || '', '')); }
    for (const [type, label] of [['gene', 'Genes'], ['path', 'Pathways']]) {
      const list = Object.values(N.items).filter(x => x.type === type);
      if (!list.length) continue;
      L.push(`## ${label}`, '');
      for (const it of list) {
        L.push(`### ${it.starred ? '★ ' : ''}${type === 'gene' ? it.id : U.pretty(it.id)}`);
        if (type === 'gene') {
          const hits = [];
          for (const t of Object.values(d.deg)) { const i = Store.rowMap(t).get(it.id); if (i != null && Store.isSig(t, i)) hits.push(`${t.celltype} ${t.comparison} ${U.signed(t.lfc[i])} (FDR ${U.fmtP(Store.degQ(t, i))})`); }
          if (hits.length) L.push('', `Significant in: ${hits.join('; ')}`);
        } else {
          const hits = [];
          for (const t of Object.values(d.gsea)) t.names.forEach((n, i) => { if (n === it.id && Store.pathSig(t, i)) hits.push(`${t.celltype} ${t.comparison} ${U.fmt(t.score[i])} (FDR ${U.fmtP(Store.pathQ(t, i))})`); });
          if (hits.length) L.push('', `Significant in: ${hits.join('; ')}`);
        }
        if (it.note) L.push('', it.note);
        L.push('');
      }
    }
    U.download('explorer_notebook.md', L.join('\n'), 'text/markdown');
  }

  return { render };
})();
