'use strict';
/* Data store. Everything lives in this browser (IndexedDB + localStorage). Nothing is uploaded. */

const IDB = (() => {
  let dbp = null;
  function db() {
    if (!dbp) dbp = new Promise((res, rej) => {
      const r = indexedDB.open('hippo-explorer', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('kv');
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    return dbp;
  }
  async function get(k) {
    const d = await db();
    return new Promise((res, rej) => { const q = d.transaction('kv').objectStore('kv').get(k); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
  }
  async function set(k, v) {
    const d = await db();
    return new Promise((res, rej) => { const tx = d.transaction('kv', 'readwrite'); tx.objectStore('kv').put(v, k); tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); });
  }
  return { get, set };
})();

const Store = (() => {
  const LS = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
  };
  const DEFAULTS = { degPadj: 0.05, degLfc: 0.25, gseaPadj: 0.05, refPadj: 0.05, autoAnnot: false, prettyNames: true };
  const settings = Object.assign({}, DEFAULTS, LS.get('hx-settings') || {});
  const notes = Object.assign({ items: {}, hypotheses: [] }, LS.get('hx-notes') || {});
  const ui = LS.get('hx-ui') || {};
  const listeners = {};
  let data = empty();
  let idx = null;
  let rowMaps = new WeakMap(), lowerMaps = new WeakMap(), refSigCache = new WeakMap();

  function empty() {
    return { version: 1, meta: { title: '', demo: false }, celltypes: [], comparisons: [], compLabels: {}, deg: {}, gsea: {}, refs: {} };
  }
  const on = (ev, fn) => (listeners[ev] = listeners[ev] || []).push(fn);
  const emit = (ev, x) => (listeners[ev] || []).forEach(fn => fn(x));
  const key = (...a) => a.join('||');

  let saveTimer = null;
  function persist() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => IDB.set('data', data).catch(e => { console.warn('save failed', e); U.toast('Could not save to browser storage (dataset too large?). Use Export bundle instead.'); }), 400);
  }
  function resetCaches() { idx = null; rowMaps = new WeakMap(); lowerMaps = new WeakMap(); refSigCache = new WeakMap(); }
  function changed() { resetCaches(); rebuildMeta(); persist(); emit('data'); }

  function rebuildMeta() {
    const cts = new Set(), cmps = new Set();
    for (const t of [...Object.values(data.deg), ...Object.values(data.gsea)]) { cts.add(t.celltype); cmps.add(t.comparison); }
    data.celltypes = data.celltypes.filter(c => cts.has(c)).concat([...cts].filter(c => !data.celltypes.includes(c)));
    data.comparisons = data.comparisons.filter(c => cmps.has(c)).concat([...cmps].filter(c => !data.comparisons.includes(c)));
  }

  // ---------- accessors ----------
  const hasData = () => Object.keys(data.deg).length > 0 || Object.keys(data.gsea).length > 0;
  const degTable = (ct, cmp) => data.deg[key(ct, cmp)];
  const gseaTables = (ct, cmp, coll) => Object.values(data.gsea).filter(t => t.celltype === ct && t.comparison === cmp && (!coll || coll === '(all)' || t.collection === coll));
  const collections = () => [...new Set(Object.values(data.gsea).map(t => t.collection))];
  const cmpLabel = c => (data.compLabels[c] ? `${c} — ${data.compLabels[c]}` : c);

  function rowMap(t) {
    let m = rowMaps.get(t);
    if (!m) { m = new Map(); (t.genes || t.names).forEach((g, i) => { if (!m.has(g)) m.set(g, i); }); rowMaps.set(t, m); }
    return m;
  }
  /** Exact lookup, then case-insensitive. */
  function lookup(t, g) {
    const i = rowMap(t).get(g);
    if (i != null) return i;
    let m = lowerMaps.get(t);
    if (!m) { m = new Map(); (t.genes || t.names).forEach((x, j) => { const k = String(x).toLowerCase(); if (!m.has(k)) m.set(k, j); }); lowerMaps.set(t, m); }
    return m.get(String(g).toLowerCase());
  }

  const degQ = (t, i) => (t.padj && Number.isFinite(t.padj[i]) ? t.padj[i] : t.p ? t.p[i] : NaN);
  const isSig = (t, i) => degQ(t, i) < settings.degPadj && Math.abs(t.lfc[i]) >= settings.degLfc;
  function degCounts(t) {
    let up = 0, down = 0;
    for (let i = 0; i < t.genes.length; i++) if (isSig(t, i)) { if (t.lfc[i] > 0) up++; else down++; }
    return { up, down };
  }
  function sigGenes(t) {
    const m = new Map();
    for (let i = 0; i < t.genes.length; i++) if (isSig(t, i)) m.set(t.genes[i], Math.sign(t.lfc[i]));
    return m;
  }
  const pathQ = (t, i) => (t.padj && Number.isFinite(t.padj[i]) ? t.padj[i] : t.p ? t.p[i] : NaN);
  const pathSig = (t, i) => pathQ(t, i) < settings.gseaPadj;

  /** Map gene -> direction (1/-1/0) of a reference's significant genes. */
  function refSig(ref) {
    let m = refSigCache.get(ref);
    if (m) return m;
    m = new Map();
    // A reference may carry its own rule, e.g. { p: 0.01 } = nominal p < 0.01 (for small studies with no FDR hits).
    const own = ref.hit && ref.hit.p && ref.p;
    const q = own ? ref.p : ref.padj || ref.p, cut = own ? ref.hit.p : settings.refPadj;
    for (let i = 0; i < ref.genes.length; i++) {
      if (q && !(q[i] < cut)) continue;
      const d = ref.lfc ? Math.sign(ref.lfc[i]) || 0 : ref.dir ? ref.dir[i] || 0 : 0;
      m.set(ref.genes[i], d);
    }
    refSigCache.set(ref, m);
    return m;
  }

  /** Cross-table indices, rebuilt lazily after any change. */
  function index() {
    if (idx) return idx;
    const genes = new Set(), paths = new Map(), gene2paths = new Map();
    for (const t of Object.values(data.deg)) for (const g of t.genes) genes.add(g);
    for (const [k, t] of Object.entries(data.gsea)) {
      t.names.forEach((n, i) => {
        if (!paths.has(n)) paths.set(n, []);
        paths.get(n).push({ k, i });
        const gl = t.genes && t.genes[i];
        if (gl && pathSig(t, i)) for (const g of gl) {
          let a = gene2paths.get(g); if (!a) gene2paths.set(g, (a = []));
          a.push({ k, i });
        }
      });
    }
    idx = { genes: [...genes].sort(), geneSet: genes, paths, pathNames: [...paths.keys()].sort(), gene2paths };
    return idx;
  }

  // ---------- mutations ----------
  function addTables(degs = [], gseas = []) {
    if (data.meta.demo) data = empty(); // never mix real results with the simulated demo
    for (const t of degs) data.deg[key(t.celltype, t.comparison)] = t;
    for (const t of gseas) data.gsea[key(t.celltype, t.comparison, t.collection)] = t;
    changed();
  }
  function removeTable(kind, k) { delete data[kind][k]; changed(); }
  function addRef(ref) { data.refs[ref.id] = ref; changed(); }
  function removeRef(id) { delete data.refs[id]; changed(); }
  function rekey() {
    data.deg = Object.fromEntries(Object.values(data.deg).map(t => [key(t.celltype, t.comparison), t]));
    data.gsea = Object.fromEntries(Object.values(data.gsea).map(t => [key(t.celltype, t.comparison, t.collection), t]));
  }
  function renameCelltype(oldN, newN) {
    if (!newN || oldN === newN) return;
    for (const t of [...Object.values(data.deg), ...Object.values(data.gsea)]) if (t.celltype === oldN) t.celltype = newN;
    data.celltypes = [...new Set(data.celltypes.map(c => (c === oldN ? newN : c)))];
    rekey(); changed();
  }
  function renameComparison(oldN, newN) {
    if (!newN || oldN === newN) return;
    for (const t of [...Object.values(data.deg), ...Object.values(data.gsea)]) if (t.comparison === oldN) t.comparison = newN;
    data.comparisons = [...new Set(data.comparisons.map(c => (c === oldN ? newN : c)))];
    if (data.compLabels[oldN]) { data.compLabels[newN] = data.compLabels[oldN]; delete data.compLabels[oldN]; }
    rekey(); changed();
  }
  function move(list, name, delta) {
    const a = data[list], i = a.indexOf(name), j = i + delta;
    if (i < 0 || j < 0 || j >= a.length) return;
    [a[i], a[j]] = [a[j], a[i]]; changed();
  }
  function setCompLabel(c, label) { data.compLabels[c] = label; persist(); emit('data'); }
  function setTitle(t) { data.meta.title = t; persist(); emit('data'); }
  function clearAll() { data = empty(); changed(); }

  function setSetting(k, v) {
    settings[k] = v; LS.set('hx-settings', settings); resetCaches(); emit('settings');
  }

  // ---------- notes / stars ----------
  const nk = (type, id) => `${type}:${id}`;
  const getNote = (type, id) => notes.items[nk(type, id)];
  const isStarred = (type, id) => !!notes.items[nk(type, id)]?.starred;
  function touch(type, id, ctx) {
    const k = nk(type, id);
    const it = notes.items[k] || { type, id, note: '', starred: false, ctx: ctx || null, ts: Date.now() };
    if (ctx && !it.ctx) it.ctx = ctx;
    notes.items[k] = it;
    return it;
  }
  function prune(type, id) { const k = nk(type, id); const it = notes.items[k]; if (it && !it.starred && !it.note) delete notes.items[k]; }
  function toggleStar(type, id, ctx) {
    const it = touch(type, id, ctx); it.starred = !it.starred; it.ts = Date.now();
    prune(type, id); saveNotes(); return it.starred;
  }
  function setStar(type, id, val, ctx) { const it = touch(type, id, ctx); it.starred = val; prune(type, id); }
  function setNoteText(type, id, text, ctx) {
    const it = touch(type, id, ctx); it.note = text; it.ts = Date.now(); prune(type, id); saveNotes(true);
  }
  const starred = type => Object.values(notes.items).filter(x => x.starred && (!type || x.type === type)).map(x => x.id);
  function saveNotes(quiet) { LS.set('hx-notes', notes); emit('notes', quiet); }

  // ---------- per-view UI state ----------
  function uiGet(view, defaults) { ui[view] = Object.assign({}, defaults, ui[view] || {}); return ui[view]; }
  function uiSave() { LS.set('hx-ui', ui); }

  // ---------- bundles ----------
  function fixNums(d) {
    const fix = a => (Array.isArray(a) ? a.map(v => (v == null ? NaN : v)) : a);
    for (const t of Object.values(d.deg)) for (const f of ['lfc', 'p', 'padj']) t[f] = fix(t[f]);
    for (const t of Object.values(d.gsea)) for (const f of ['score', 'nes', 'p', 'padj', 'size']) t[f] = fix(t[f]);
    for (const r of Object.values(d.refs || {})) for (const f of ['lfc', 'p', 'padj', 'dir']) r[f] = fix(r[f]);
    if (d.bulk) {
      for (const t of Object.values(d.bulk.deg || {})) for (const f of ['lfc', 'p', 'padj']) t[f] = fix(t[f]);
      for (const t of Object.values(d.bulk.gsea || {})) for (const f of ['nes', 'p', 'padj', 'size']) t[f] = fix(t[f]);
    }
  }
  function loadBundleObj(obj) {
    if (!obj || obj.format !== 'hx-bundle' || !obj.data) throw new Error('Not an explorer bundle file.');
    const d = Object.assign(empty(), obj.data);
    fixNums(d); data = d; changed();
  }
  async function exportBundle() {
    const obj = { format: 'hx-bundle', version: 1, exportedAt: new Date().toISOString(), data };
    const text = JSON.stringify(obj);
    const gz = await U.gzipText(text);
    if (gz) U.download('explorer_bundle.json.gz', gz);
    else U.download('explorer_bundle.json', text, 'application/json');
  }
  async function importBundleFile(file) { loadBundleObj(JSON.parse(await U.blobText(file))); }
  function loadDemo() { data = Demo.make(); changed(); }

  async function init() {
    try { const saved = await IDB.get('data'); if (saved && saved.version === 1) data = Object.assign(empty(), saved); }
    catch (e) { console.warn('Could not read saved data', e); }
    // When hosted on a web server, a bundle placed at data/bundle.json(.gz) is loaded automatically.
    if (location.protocol.startsWith('http')) {
      for (const f of ['data/bundle.json.gz', 'data/bundle.json']) {
        try {
          const r = await fetch(f, { cache: 'no-cache' });
          if (!r.ok) continue;
          const obj = JSON.parse(await U.blobText(await r.blob()));
          const stamp = obj.exportedAt || f;
          if (!hasData() || LS.get('hx-server-bundle') !== stamp) { loadBundleObj(obj); LS.set('hx-server-bundle', stamp); }
          break;
        } catch { /* no bundle on server */ }
      }
      // Encrypted default data: ask for the passphrase only when this browser doesn't already hold this version.
      try {
        const r = await fetch('data/bundle.enc.json', { cache: 'no-cache' });
        if (r.ok) {
          const enc = await r.json();
          if (enc.format === 'hx-encrypted' && (!hasData() || LS.get('hx-server-bundle') !== enc.exportedAt)) {
            const obj = await Lock.ask(enc);
            if (obj) { loadBundleObj(obj); LS.set('hx-server-bundle', enc.exportedAt); }
          }
        }
      } catch (e) { console.warn('No encrypted bundle', e); }
    }
    resetCaches(); rebuildMeta();
  }

  return {
    get settings() { return settings; }, get notes() { return notes; },
    d: () => data, on, emit, key, init, hasData, degTable, gseaTables, collections, cmpLabel, rowMap, lookup,
    degQ, isSig, degCounts, sigGenes, pathQ, pathSig, refSig, index,
    addTables, removeTable, addRef, removeRef, renameCelltype, renameComparison, move, setCompLabel, setTitle, clearAll, setSetting,
    getNote, isStarred, toggleStar, setStar, setNoteText, starred, saveNotes,
    uiGet, uiSave, exportBundle, importBundleFile, loadDemo,
  };
})();
