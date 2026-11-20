'use strict';
/* Shared helpers: DOM building, formatting, statistics, colour, files, plotting. */
const U = (() => {
  function h(tag, attrs, ...kids) {
    const e = document.createElement(tag);
    if (attrs) for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') e.className = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
      else if (k === 'html') e.innerHTML = v;
      else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
      else if (k === 'value' || k === 'checked' || k === 'selected' || k === 'disabled') e[k] = v;
      else e.setAttribute(k, v === true ? '' : v);
    }
    for (const k of kids.flat(Infinity)) if (k != null && k !== false) e.append(k instanceof Node ? k : String(k));
    return e;
  }
  const $ = (s, r = document) => r.querySelector(s);

  /** opts: array of values or [value, label] pairs. */
  function select(opts, value, onchange, attrs) {
    const s = h('select', attrs);
    for (const o of opts) {
      const [v, l] = Array.isArray(o) ? o : [o, o];
      s.append(h('option', { value: String(v) }, l));
    }
    if (value != null) s.value = String(value);
    if (onchange) s.addEventListener('change', () => onchange(s.value));
    return s;
  }

  function card(title, sub, ...kids) {
    return h('section', { class: 'card' }, title ? h('h3', {}, title) : null, sub ? h('div', { class: 'sub' }, sub) : null, ...kids);
  }

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (x, d = 2) => (x == null || !Number.isFinite(+x)) ? '–' : (+x).toFixed(d);
  const fmtP = p => {
    if (p == null || !Number.isFinite(p)) return '–';
    if (p === 0) return '<1e-300';
    return p < 0.001 ? p.toExponential(1) : p.toPrecision(2);
  };
  const signed = (x, d = 2) => !Number.isFinite(x) ? '–' : (x > 0 ? '+' : '') + x.toFixed(d);
  /** Conventional stars; '·' marks "passes your threshold but not 0.05". */
  const stars = (q, thr = 0.05) => !Number.isFinite(q) ? '' : q < 0.001 ? '***' : q < 0.01 ? '**' : q < 0.05 ? '*' : q < thr ? '·' : '';
  const trunc = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
  const arrow = x => (x > 0 ? '↑' : x < 0 ? '↓' : '·');

  /** Compact, always-visible significance thresholds. They are the same settings as on Data & settings and apply everywhere. */
  /** Name of the p-value used for significance right now: 'FDR' or 'p'. */
  const qn = () => (typeof Store !== 'undefined' ? Store.qName() : 'FDR');

  function thresholdBar(keys = ['degPadj', 'degLfc', 'gseaPadj']) {
    const s = Store.settings, q = qn();
    const META = {
      degPadj: [`Genes: ${q} <`, 0.01, 1, `${q === 'p' ? 'Unadjusted' : 'Adjusted'} p-value cutoff for calling a gene differentially expressed`],
      degLfc: ['|log2FC| ≥', 0.05, 10, 'Minimum absolute log2 fold change (0 = no fold-change filter)'],
      gseaPadj: [`Pathways: ${q} <`, 0.01, 1, `${q === 'p' ? 'Unadjusted' : 'Adjusted'} p-value cutoff for calling a pathway enriched`],
    };
    const DEF = { degPadj: 0.05, degLfc: 1, gseaPadj: 0.05 };
    const name = 'pmode-' + Math.random().toString(36).slice(2, 8);
    const radio = (val, label, tip) => h('label', { class: 'thr-radio', title: tip },
      h('input', { type: 'radio', name, value: val, checked: (s.pMode || 'padj') === val, onchange: () => Store.setSetting('pMode', val) }), label);
    const box = h('div', { class: 'thresholds' }, h('span', { class: 'thr-title' }, 'Significance'),
      h('span', { class: 'thr-mode' },
        radio('padj', 'Adjusted p (FDR)', 'Benjamini-Hochberg adjusted p-values: corrected for testing thousands of genes/pathways'),
        radio('p', 'Unadjusted p', 'Raw p-values, not corrected for multiple testing. Exploratory: expect many false positives')));
    for (const k of keys) {
      const [label, step, max, tip] = META[k];
      const i = h('input', { type: 'number', step, min: 0, max, value: s[k], title: tip });
      i.addEventListener('change', () => {
        const v = parseFloat(i.value);
        if (Number.isFinite(v) && v >= 0 && v <= max) Store.setSetting(k, v); else i.value = s[k];
      });
      box.append(h('label', { title: tip }, label, i));
    }
    if (q === 'p') box.append(h('span', { class: 'thr-warn' }, 'Exploratory: not corrected for multiple testing'));
    if (keys.some(k => s[k] !== DEF[k]) || q === 'p')
      box.append(h('button', { class: 'linkish', onclick: () => { keys.forEach(k => Store.setSetting(k, DEF[k])); Store.setSetting('pMode', 'padj'); } }, 'reset to FDR 0.05, |log2FC| 1'));
    return box;
  }

  /** Readable pathway names: GOBP_SYNAPTIC_SIGNALING -> "synaptic signaling (GOBP)". */
  function pretty(name) {
    if (!name) return '';
    if (typeof Store !== 'undefined' && !Store.settings.prettyNames) return name;
    const m = /^(GOBP|GOCC|GOMF|HALLMARK|KEGG_MEDICUS|KEGG|REACTOME|WP|BIOCARTA|PID|HP)_(.+)$/.exec(name);
    if (m && name === name.toUpperCase()) {
      return `${m[2].replace(/_/g, ' ').toLowerCase()} (${m[1] === 'HALLMARK' ? 'Hallmark' : m[1]})`;
    }
    return name;
  }
  /** Pathway name stripped down to a phrase suitable for a literature search. */
  const plainPath = name => pretty(name).replace(/\s*\([A-Za-z_]+\)$/, '').replace(/_/g, ' ');

  /** Parse "a, b; c d" or R-style c("a","b") into tokens. */
  function splitGenes(v) {
    if (v == null) return [];
    if (Array.isArray(v)) return v.map(String).filter(Boolean);
    let s = String(v).trim();
    if (!s || /^(na|nan|null)$/i.test(s)) return [];
    s = s.replace(/^c\(/, '').replace(/\)$/, '');
    return s.split(/[\/;,|\s]+/).map(t => t.replace(/["'\[\]]/g, '').trim()).filter(Boolean);
  }

  // ---------- statistics ----------
  function erf(x) {
    const s = Math.sign(x); x = Math.abs(x);
    const t = 1 / (1 + 0.3275911 * x);
    const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
    return s * y;
  }
  /** Two-sided normal p-value for a z score. */
  function pnorm2(z) {
    const a = Math.abs(z) / Math.SQRT2;
    if (a < 3) return Math.max(1e-300, 1 - erf(a));
    return Math.max(1e-300, Math.exp(-a * a) / (a * Math.sqrt(Math.PI)) * (1 - 1 / (2 * a * a) + 3 / (4 * a ** 4)));
  }
  function bh(p) {
    const n = p.length, idx = [...p.keys()].sort((a, b) => p[a] - p[b]), q = new Array(n);
    let min = 1;
    for (let r = n - 1; r >= 0; r--) { const i = idx[r]; min = Math.min(min, p[i] * n / (r + 1)); q[i] = min; }
    return q;
  }
  function lgamma(x) {
    const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
    if (x < 0.5) return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * x))) - lgamma(1 - x);
    x -= 1; let a = c[0]; const t = x + 7.5;
    for (let i = 1; i < 9; i++) a += c[i] / (x + i);
    return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
  }
  const lchoose = (n, k) => lgamma(n + 1) - lgamma(k + 1) - lgamma(n - k + 1);
  /** Hypergeometric upper tail P(X >= k): universe N, K successes, n draws. */
  function phyper(k, N, K, n) {
    if (k <= 0) return 1;
    const hi = Math.min(K, n);
    if (k > hi) return 0;
    const base = lchoose(N, n); let s = 0;
    for (let i = k; i <= hi; i++) {
      if (n - i > N - K) continue;
      s += Math.exp(lchoose(K, i) + lchoose(N - K, n - i) - base);
    }
    return Math.min(1, Math.max(s, 1e-300));
  }
  function pearson(xs, ys) {
    let n = 0, sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
    for (let i = 0; i < xs.length; i++) {
      const x = xs[i], y = ys[i];
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      n++; sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y;
    }
    if (n < 3) return { r: NaN, n };
    const r = (n * sxy - sx * sy) / Math.sqrt((n * sxx - sx * sx) * (n * syy - sy * sy));
    return { r, n };
  }
  /** Average-linkage hierarchical clustering; returns leaf order. */
  function clusterOrder(mat) {
    const n = mat.length;
    if (n < 3) return [...Array(n).keys()];
    const v = mat.map(r => r.map(x => (Number.isFinite(x) ? x : 0)));
    const D = Array.from({ length: n }, () => new Float64Array(n));
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      let s = 0; for (let c = 0; c < v[i].length; c++) { const d = v[i][c] - v[j][c]; s += d * d; }
      D[i][j] = D[j][i] = Math.sqrt(s);
    }
    const active = new Set([...Array(n).keys()]), size = new Array(n).fill(1), order = [...Array(n).keys()].map(i => [i]);
    while (active.size > 1) {
      const act = [...active]; let best = Infinity, bi = -1, bj = -1;
      for (let a = 0; a < act.length; a++) for (let b = a + 1; b < act.length; b++) {
        const d = D[act[a]][act[b]]; if (d < best) { best = d; bi = act[a]; bj = act[b]; }
      }
      for (const k of active) if (k !== bi && k !== bj) {
        const d = (size[bi] * D[bi][k] + size[bj] * D[bj][k]) / (size[bi] + size[bj]);
        D[bi][k] = D[k][bi] = d;
      }
      order[bi] = order[bi].concat(order[bj]); size[bi] += size[bj]; active.delete(bj);
    }
    return order[[...active][0]];
  }
  function quantile(arr, q) {
    const a = arr.filter(Number.isFinite).sort((x, y) => x - y);
    if (!a.length) return NaN;
    return a[Math.min(a.length - 1, Math.floor(q * a.length))];
  }

  // ---------- colour ----------
  const RED = [178, 24, 43], BLUE = [33, 102, 172], WHITE = [247, 247, 247];
  function divColor(v, max) {
    if (!Number.isFinite(v)) return '#f3f4f6';
    const t = Math.max(-1, Math.min(1, v / max)), c = t >= 0 ? RED : BLUE, a = Math.abs(t);
    return `rgb(${WHITE.map((w, i) => Math.round(w + (c[i] - w) * a)).join(',')})`;
  }
  const textOn = (v, max) => (Number.isFinite(v) && Math.abs(v / max) > 0.6 ? '#fff' : '#1f2933');
  const DIVERGING = [[0, '#2166ac'], [0.25, '#92c5de'], [0.5, '#f7f7f7'], [0.75, '#f4a582'], [1, '#b2182b']];

  // ---------- files ----------
  function download(name, data, type = 'text/plain') {
    const blob = data instanceof Blob ? data : new Blob([data], { type });
    const a = h('a', { href: URL.createObjectURL(blob), download: name });
    document.body.append(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  }
  async function gzipText(text) {
    if (!window.CompressionStream) return null;
    const s = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
    return await new Response(s).blob();
  }
  /** Reads text from a File/Blob, transparently gunzipping. */
  async function blobText(blob) {
    const head = new Uint8Array(await blob.slice(0, 2).arrayBuffer());
    if (head[0] === 0x1f && head[1] === 0x8b) {
      if (!window.DecompressionStream) throw new Error('This browser cannot read .gz files; please unzip first.');
      return await new Response(blob.stream().pipeThrough(new DecompressionStream('gzip'))).text();
    }
    return await blob.text();
  }
  function toCSV(header, rows) {
    const q = v => { const s = v == null || (typeof v === 'number' && !Number.isFinite(v)) ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    return [header.map(q).join(','), ...rows.map(r => r.map(q).join(','))].join('\n');
  }
  async function copy(text) {
    try { await navigator.clipboard.writeText(text); toast('Copied to clipboard'); }
    catch { const ta = h('textarea', { value: text }); document.body.append(ta); ta.select(); document.execCommand('copy'); ta.remove(); toast('Copied to clipboard'); }
  }
  let toastTimer;
  function toast(msg, ms = 2600) {
    const t = $('#toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), ms);
  }

  // ---------- plotting ----------
  const FONT = { family: 'Inter, system-ui, -apple-system, Segoe UI, sans-serif', size: 12, color: '#1f2933' };
  function plot(div, traces, layout, onClick, onSelect) {
    const L = Object.assign({
      margin: { l: 60, r: 20, t: 20, b: 50 }, font: FONT,
      paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: 'rgba(0,0,0,0)',
      hoverlabel: { bgcolor: '#fff', bordercolor: '#d1d5db', font: { size: 12, color: '#1f2933' } },
    }, layout);
    return Plotly.newPlot(div, traces, L, {
      displaylogo: false, responsive: true,
      toImageButtonOptions: { format: 'svg', filename: 'hippo_explorer_plot' },
      modeBarButtonsToRemove: ['autoScale2d', 'toggleSpikelines', 'hoverCompareCartesian'],
    }).then(gd => {
      if (!gd || typeof gd.on !== 'function') return gd;   // view re-rendered before the plot finished
      if (onClick) gd.on('plotly_click', ev => { if (ev && ev.points && ev.points.length) onClick(ev.points[0], ev); });
      if (onSelect) gd.on('plotly_selected', onSelect);
      return gd;
    });
  }

  /** Small coloured HTML heat table. rows/cols are labels; cell(r,c) -> {v, text, title, cls, onclick}. */
  function heatTable(rows, cols, cell, opts = {}) {
    const max = opts.max || 1;
    const t = h('table', { class: 'heat' });
    t.append(h('tr', {}, h('th'), cols.map(c => h('th', { title: c.title || '' }, c.label ?? c))));
    rows.forEach((r, ri) => {
      const tr = h('tr', {}, h('th', { class: 'rowh' + (r.cls ? ' ' + r.cls : ''), onclick: r.onclick, title: r.title || '' }, r.label ?? r));
      cols.forEach((c, ci) => {
        const x = cell(ri, ci);
        if (!x || !Number.isFinite(x.v)) { tr.append(h('td', { class: 'na', title: x?.title || 'not tested' }, x?.text ?? '·')); return; }
        tr.append(h('td', {
          class: x.cls || '', title: x.title || '', onclick: x.onclick,
          style: { background: divColor(x.v, max), color: textOn(x.v, max) },
        }, x.text));
      });
      t.append(tr);
    });
    return t;
  }

  function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

  return {
    h, $, select, card, thresholdBar, qn, esc, fmt, fmtP, signed, stars, trunc, arrow, pretty, plainPath, splitGenes,
    pnorm2, bh, phyper, pearson, clusterOrder, quantile,
    divColor, textOn, DIVERGING, download, gzipText, blobText, toCSV, copy, toast, plot, heatTable, debounce,
  };
})();
