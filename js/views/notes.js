'use strict';
/* Notebook: starred genes/pathways with notes. Exportable to share back. */
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
        Store.saveNotes(); App.render(); U.toast(`Merged ${n} notes`);
      } catch (e) { U.toast('Could not read that notes file: ' + e.message, 5000); }
      input.value = '';
    };
    return U.h('span', {}, input, U.h('button', { onclick: () => input.click() }, 'Import & merge notes'));
  }

  function exportMarkdown() {
    const N = Store.notes, d = Store.d();
    const L = [`# ${d.meta.title || 'Hippocampus scRNA-seq'}: notebook`, '', `Exported ${new Date().toLocaleString()}`, ''];
    for (const [type, label] of [['gene', 'Genes'], ['path', 'Pathways']]) {
      const list = Object.values(N.items).filter(x => x.type === type);
      if (!list.length) continue;
      L.push(`## ${label}`, '');
      for (const it of list) {
        L.push(`### ${it.starred ? '★ ' : ''}${type === 'gene' ? it.id : U.pretty(it.id)}`);
        if (type === 'gene') {
          const hits = [];
          for (const t of Object.values(d.deg)) { const i = Store.rowMap(t).get(it.id); if (i != null && Store.isSig(t, i)) hits.push(`${t.celltype} ${t.comparison} ${U.signed(t.lfc[i])} (${U.qn()} ${U.fmtP(Store.degQ(t, i))})`); }
          if (hits.length) L.push('', `Significant in: ${hits.join('; ')}`);
        } else {
          const hits = [];
          for (const t of Object.values(d.gsea)) t.names.forEach((n, i) => { if (n === it.id && Store.pathSig(t, i)) hits.push(`${t.celltype} ${t.comparison} ${U.fmt(t.score[i])} (${U.qn()} ${U.fmtP(Store.pathQ(t, i))})`); });
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
