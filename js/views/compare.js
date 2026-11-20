'use strict';
/* Compare two contrasts (e.g. male KO vs control against female KO vs control) per cell type. */
const CompareView = (() => {
  const CAT = {
    shared: { label: 'Shared, same direction', color: '#7c3aed' },
    aOnly: { label: 'Only in A', color: '#ea580c' },
    bOnly: { label: 'Only in B', color: '#059669' },
    opp: { label: 'Opposite directions', color: '#111827' },
    ns: { label: 'Neither', color: '#d1d5db' },
  };
  const ORDER = ['shared', 'aOnly', 'bOnly', 'opp'];

  function defaults(cmps) {
    const find = re => cmps.find(c => re.test(c));
    const A = find(/^m(ale)?[_\- .]*ko.*vs.*m(ale)?/i) || find(/male.*ko|ko.*male/i) || cmps[0];
    const B = find(/^f(emale)?[_\- .]*ko.*vs.*f(emale)?/i) || find(/female.*ko|ko.*female/i) || cmps.find(c => c !== A);
    return { A, B };
  }

  function classify(sa, sb, x, y) {
    if (sa && sb) return Math.sign(x) === Math.sign(y) ? 'shared' : 'opp';
    return sa ? 'aOnly' : sb ? 'bOnly' : 'ns';
  }

  function compute(level, ct, A, B, coll) {
    const pts = [];
    if (level === 'genes') {
      const ta = Store.degTable(ct, A), tb = Store.degTable(ct, B);
      if (!ta && !tb) return null;
      const ga = ta ? Store.rowMap(ta) : new Map(), gb = tb ? Store.rowMap(tb) : new Map();
      for (const g of new Set([...ga.keys(), ...gb.keys()])) {
        const i = ga.get(g), j = gb.get(g);
        const sa = i != null && Store.isSig(ta, i), sb = j != null && Store.isSig(tb, j);
        const x = i != null ? ta.lfc[i] : NaN, y = j != null ? tb.lfc[j] : NaN;
        pts.push({ id: g, x, y, qa: i != null ? Store.degQ(ta, i) : NaN, qb: j != null ? Store.degQ(tb, j) : NaN, cat: classify(sa, sb, x, y) });
      }
    } else {
      const merge = cmp => {
        const m = new Map();
        for (const t of Store.gseaTables(ct, cmp, coll)) t.names.forEach((n, i) => { const q = Store.pathQ(t, i); const cur = m.get(n); if (!cur || q < cur.q) m.set(n, { score: t.score[i], q }); });
        return m;
      };
      const ma = merge(A), mb = merge(B);
      if (!ma.size && !mb.size) return null;
      const thr = Store.settings.gseaPadj;
      for (const n of new Set([...ma.keys(), ...mb.keys()])) {
        const a = ma.get(n), b = mb.get(n);
        const x = a ? a.score : NaN, y = b ? b.score : NaN;
        pts.push({ id: n, x, y, qa: a ? a.q : NaN, qb: b ? b.q : NaN, cat: classify(a && a.q < thr, b && b.q < thr, x, y) });
      }
    }
    return pts;
  }

  function render(root) {
    const d = Store.d(), cmps = d.comparisons;
    root.append(U.h('div', { class: 'view-head' },
      U.h('h2', {}, 'Compare two contrasts'),
      U.h('p', { class: 'muted' }, 'Example: A = males, KO vs control; B = females, KO vs control. This shows which effects of losing brain aromatase are shared by both sexes, which are sex-specific, and which go in opposite directions.')));
    if (cmps.length < 2) { root.append(U.card('Need at least two comparisons', 'Load results for two or more comparisons to use this view.')); return; }
    const def = defaults(cmps);
    const ui = Store.uiGet('compare', { level: 'genes', A: def.A, B: def.B, ct: null, coll: null });
    if (!cmps.includes(ui.A)) ui.A = def.A;
    if (!cmps.includes(ui.B) || ui.B === ui.A) ui.B = cmps.find(c => c !== ui.A);
    if (!d.celltypes.includes(ui.ct)) ui.ct = d.celltypes[0];
    const colls = Store.collections();
    if (!colls.includes(ui.coll)) ui.coll = colls[0] || null;
    const rerender = () => { Store.uiSave(); App.render(); };
    const s = Store.settings;

    root.append(U.card(null, null,
      U.h('div', { class: 'controls' },
        U.h('span', { class: 'pills' }, [['genes', 'Genes'], ['paths', 'Pathways']].map(([v, l]) =>
          U.h('button', { class: 'pill' + (ui.level === v ? ' active' : ''), onclick: () => { ui.level = v; rerender(); } }, l))),
        U.h('label', {}, U.h('span', { class: 'dot', style: { background: CAT.aOnly.color } }), 'A', U.select(cmps.map(c => [c, Store.cmpLabel(c)]), ui.A, v => { ui.A = v; rerender(); })),
        U.h('button', { class: 'small', title: 'swap A and B', onclick: () => { [ui.A, ui.B] = [ui.B, ui.A]; rerender(); } }, '⇄'),
        U.h('label', {}, U.h('span', { class: 'dot', style: { background: CAT.bOnly.color } }), 'B', U.select(cmps.map(c => [c, Store.cmpLabel(c)]), ui.B, v => { ui.B = v; rerender(); })),
        ui.level === 'paths' && colls.length ? U.h('label', {}, 'Collection', U.select(colls, ui.coll, v => { ui.coll = v; rerender(); })) : null),
      U.h('div', { class: 'callout warn' }, U.h('b', {}, 'Read with care: '),
        '“Only in A” means significant in A but not in B. That is not proof that the effect differs between them; B may simply be underpowered. ',
        'Look at the scatter: points near the diagonal behave similarly in both, even if only one passed the threshold. Confirming a sex-specific effect needs a formal interaction test (e.g. ~ sex * genotype) in your DE model.')));

    // Summary across cell types
    const sumDiv = U.h('div');
    root.append(U.card(`How many ${ui.level === 'genes' ? 'DEGs' : 'pathways'} are shared or specific, per cell type`,
      `${ui.level === 'genes' ? `FDR < ${s.degPadj}, |log2FC| ≥ ${s.degLfc}` : `FDR < ${s.gseaPadj}`}. Click a bar to open that cell type below.`, sumDiv));
    const summary = d.celltypes.map(ct => {
      const pts = compute(ui.level, ct, ui.A, ui.B, ui.coll) || [];
      const c = { shared: 0, aOnly: 0, bOnly: 0, opp: 0 };
      pts.forEach(p => { if (c[p.cat] != null) c[p.cat]++; });
      return { ct, c };
    });
    U.plot(sumDiv, ORDER.map(k => ({
      type: 'bar', orientation: 'h', name: CAT[k].label, y: summary.map(r => r.ct), x: summary.map(r => r.c[k]),
      marker: { color: CAT[k].color }, hovertemplate: `%{y}: %{x} ${CAT[k].label.toLowerCase()}<extra></extra>`,
    })), {
      barmode: 'stack', height: 90 + 30 * d.celltypes.length, margin: { l: 170, r: 20, t: 10, b: 40 },
      yaxis: { autorange: 'reversed' }, xaxis: { title: { text: ui.level === 'genes' ? 'number of genes' : 'number of pathways' }, gridcolor: '#f1f2f4' },
      legend: { orientation: 'h', y: 1.12 },
    }, pt => { ui.ct = pt.y; rerender(); });

    // Detail for one cell type
    const pts = compute(ui.level, ui.ct, ui.A, ui.B, ui.coll);
    const pills = U.h('div', { class: 'pills', style: { marginBottom: '10px' } }, d.celltypes.map(ct =>
      U.h('button', { class: 'pill' + (ct === ui.ct ? ' active' : ''), onclick: () => { ui.ct = ct; rerender(); } }, ct)));
    const scDiv = U.h('div'), lists = U.h('div', { class: 'cols4' });
    root.append(U.card(`${ui.ct}: A vs B`, null, pills, scDiv, lists));
    if (!pts) { scDiv.append(U.h('p', { class: 'muted' }, 'No data for this cell type.')); return; }

    const both = pts.filter(p => Number.isFinite(p.x) && Number.isFinite(p.y));
    const { r, n } = U.pearson(both.map(p => p.x), both.map(p => p.y));
    const strength = p => Math.min(Number.isFinite(p.qa) ? p.qa : 1, Number.isFinite(p.qb) ? p.qb : 1);
    const traces = ['ns', ...ORDER].map(k => {
      const ps = both.filter(p => p.cat === k);
      return {
        type: 'scattergl', mode: 'markers', name: `${CAT[k].label} (${pts.filter(p => p.cat === k).length})`,
        x: ps.map(p => p.x), y: ps.map(p => p.y), customdata: ps.map(p => [p.id, U.fmtP(p.qa), U.fmtP(p.qb), ui.level === 'genes' ? p.id : U.trunc(U.pretty(p.id), 60)]),
        hovertemplate: '<b>%{customdata[3]}</b><br>A: %{x:.2f} (FDR %{customdata[1]})<br>B: %{y:.2f} (FDR %{customdata[2]})<extra></extra>',
        marker: { color: CAT[k].color, size: k === 'ns' ? 4 : 7, opacity: k === 'ns' ? 0.5 : 0.85 },
      };
    });
    const annotations = [];
    for (const k of ORDER) both.filter(p => p.cat === k).sort((a, b) => strength(a) - strength(b)).slice(0, ui.level === 'genes' ? 6 : 4).forEach(p =>
      annotations.push({ x: p.x, y: p.y, text: ui.level === 'genes' ? p.id : U.trunc(U.pretty(p.id), 28), showarrow: true, arrowhead: 0, ax: 18, ay: -16, arrowcolor: '#9ca3af', font: { size: 10, color: CAT[k].color }, bgcolor: 'rgba(255,255,255,.75)' }));
    const lim = Math.max(1, ...both.flatMap(p => [Math.abs(p.x), Math.abs(p.y)])) * 1.05;
    const unit = ui.level === 'genes' ? 'log2FC' : 'score';
    U.plot(scDiv, traces, {
      height: 560, margin: { l: 60, r: 10, t: 30, b: 50 }, hovermode: 'closest',
      xaxis: { title: { text: `A: ${ui.A} (${unit})` }, range: [-lim, lim], zeroline: true, zerolinecolor: '#9ca3af', gridcolor: '#f1f2f4' },
      yaxis: { title: { text: `B: ${ui.B} (${unit})` }, range: [-lim, lim], zeroline: true, zerolinecolor: '#9ca3af', gridcolor: '#f1f2f4', scaleanchor: 'x' },
      shapes: [{ type: 'line', x0: -lim, y0: -lim, x1: lim, y1: lim, line: { dash: 'dot', color: '#9ca3af' } }],
      annotations: annotations.concat([{ xref: 'paper', yref: 'paper', x: 0, y: 1.04, showarrow: false, xanchor: 'left', text: `Pearson r = ${U.fmt(r)} across ${n.toLocaleString()} ${ui.level === 'genes' ? 'genes' : 'pathways'} tested in both`, font: { size: 11, color: '#6b7280' } }]),
      legend: { orientation: 'h', y: -0.14 },
    }, pt => open(ui, pt.customdata[0], pt.x, pt.y));

    for (const k of ORDER) {
      const ps = pts.filter(p => p.cat === k).sort((a, b) => strength(a) - strength(b));
      const ids = ps.map(p => p.id);
      const col = U.h('div', {},
        U.h('div', { style: { display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' } },
          U.h('span', { class: 'dot', style: { background: CAT[k].color } }), U.h('b', {}, `${CAT[k].label} (${ps.length})`)),
        ps.length ? U.h('div', { class: 'btnrow', style: { marginBottom: '4px' } },
          U.h('button', { class: 'small', onclick: () => U.copy(ids.join('\n')) }, 'Copy'),
          ui.level === 'genes' ? U.h('button', { class: 'small', onclick: () => highlight(ui, k, ids) }, 'Show on volcano') : null) : null,
        U.h('div', { class: 'chips', style: { maxHeight: '260px', overflow: 'auto' } }, ps.slice(0, 200).map(p => {
          const dir = k === 'bOnly' ? Math.sign(p.y) : Math.sign(p.x);
          const label = ui.level === 'genes' ? p.id : U.trunc(U.pretty(p.id), 42);
          const tip = `A ${U.fmt(p.x)} (FDR ${U.fmtP(p.qa)}) · B ${U.fmt(p.y)} (FDR ${U.fmtP(p.qb)})`;
          return U.h('span', { class: 'chip ' + (k === 'opp' ? 'mixed' : dir > 0 ? 'up' : 'down'), title: tip, onclick: () => open(ui, p.id, p.x, p.y) },
            k === 'opp' ? `${label} ${U.arrow(p.x)}A ${U.arrow(p.y)}B` : `${U.arrow(dir)} ${label}`);
        })));
      lists.append(col);
    }
  }

  function open(ui, id, x, y) {
    const cmp = Number.isFinite(x) ? ui.A : ui.B;
    Drawer.open({ type: ui.level === 'genes' ? 'gene' : 'path', id, ctx: { ct: ui.ct, cmp } });
  }
  function highlight(ui, k, ids) {
    const ex = Store.uiGet('explore', {});
    ex.ct = ui.ct; ex.cmp = k === 'bOnly' ? ui.B : ui.A;
    ex.custom = { label: `${CAT[k].label} (${ui.A} vs ${ui.B})`, genes: ids }; ex.overlay = 'custom';
    Store.uiSave(); App.go('explore');
  }

  return { render };
})();
