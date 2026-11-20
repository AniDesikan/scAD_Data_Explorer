'use strict';
/* SIMULATED demo dataset for trying the tool. Every number here is made up; it is not derived from any real data. */
const Demo = (() => {
  function rng(seed) {
    return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const THEMES = {
    syn: 'Snap25 Stx1a Vamp2 Syt1 Syn1 Syp Cplx1 Rims1 Nrxn1 Nlgn1 Dlg4 Shank3 Homer1 Cacna1a Slc17a7 Rbfox3 Map2 Nefl',
    plast: 'Camk2a Grin1 Grin2a Grin2b Gria1 Gria2 Gria3 Arc Bdnf Ntrk2 Creb1 Camk4 Nrgn Ppp3ca',
    gaba: 'Gabra1 Gabrb2 Gabrg2 Gad1 Gad2 Slc32a1 Pvalb Sst Vip Cck Npy Slc12a5',
    estro: 'Cyp19a1 Esr1 Esr2 Gper1 Pgr Greb1 Ncoa1 Ncoa3 Oxtr Ar Hsd17b1 Star Tspo Srd5a1',
    ieg: 'Fos Egr1 Npas4 Junb Nr4a1 Dusp1 Ier2 Per1',
    chol: 'Hmgcr Hmgcs1 Ldlr Sqle Dhcr24 Fdft1 Insig1 Srebf2 Cyp51 Idi1 Abca1 Apoe',
    oxphos: 'Ndufa4 Ndufb9 Cox4i1 Cox6c Atp5a1 Atp5b Uqcrc1 Sdha Cs Pdha1 Ppargc1a',
    glyc: 'Ldha Pkm Hk1 Gapdh Pgk1 Slc2a3 Slc2a1',
    oxstress: 'Sod1 Sod2 Gpx1 Gpx4 Cat Txn1 Prdx1 Nfe2l2 Hmox1 Mt1 Mt2',
    micro: 'Cx3cr1 P2ry12 Tmem119 Hexb Csf1r Trem2 Tyrobp Aif1 Itgam Cd68 Spp1 Cst7 Lpl Axl',
    ifn: 'Irf7 Ifit3 Isg15 Stat1 B2m',
    mhc: 'Cd74 H2-Aa H2-Ab1 B2m Psmb8',
    compl: 'C1qa C1qb C1qc C3 C4b Clu',
    infl: 'Il1b Tnf Ccl3 Ccl4 Lcn2 Lyz2',
    astro: 'Gfap Aqp4 Aldh1l1 Slc1a2 Slc1a3 Glul Sparcl1 S100b Vim Serpina3n Gja1',
    myelin: 'Mbp Plp1 Mog Mag Mobp Cnp Olig1 Olig2 Sox10 Opalin Klk6 Enpp6',
    opc: 'Pdgfra Cspg4 Gpr17 Olig2 Sox10',
    endo: 'Cldn5 Flt1 Pecam1 Tek Vwf Ly6c1 Abcb1a Itm2a Slc2a1',
    upr: 'Hspa1a Hspa1b Hspa8 Hsp90aa1 Dnajb1 Hspb1 Atf4 Ddit3 Xbp1 Hspa5',
    autoph: 'Sqstm1 Map1lc3b Becn1 Lamp1 Ctsd Ctsb Ubb',
    ribo: 'Rpl3 Rpl13 Rps6 Rps3 Eef1a1 Eef2 Eif4e',
    mtor: 'Mtor Rptor Rps6kb1 Eif4e Slc2a1 Ldha',
    neurog: 'Dcx Sox11 Prox1 Neurod1 Calb2 Reln Gap43 Tubb3 Calb1 Wfs1',
    ad: 'App Bace1 Psen1 Mapt Adam10 Sorl1 Bin1 Picalm Cd33 Ms4a7 Apoe Trem2 Clu',
    ion: 'Atp1a1 Atp1a3 Atp1b1 Scn1a Scn2a Kcnq2 Kcnj6 Cacna1c Slc12a2',
    circ: 'Per1 Per2 Nr4a1',
  };
  const PATHWAYS = [
    ['GOBP_SYNAPTIC_SIGNALING', 'GO:0099536', ['syn', 'plast', 'gaba']],
    ['GOBP_REGULATION_OF_SYNAPTIC_PLASTICITY', 'GO:0048167', ['plast', 'ieg']],
    ['GOBP_GLUTAMATE_RECEPTOR_SIGNALING_PATHWAY', 'GO:0007215', ['plast']],
    ['GOBP_GAMMA_AMINOBUTYRIC_ACID_SIGNALING_PATHWAY', 'GO:0007214', ['gaba']],
    ['GOBP_RESPONSE_TO_ESTRADIOL', 'GO:0032355', ['estro', 'ieg']],
    ['GOBP_STEROID_BIOSYNTHETIC_PROCESS', 'GO:0006694', ['estro', 'chol']],
    ['GOBP_CHOLESTEROL_BIOSYNTHETIC_PROCESS', 'GO:0006695', ['chol']],
    ['GOBP_OXIDATIVE_PHOSPHORYLATION', 'GO:0006119', ['oxphos']],
    ['GOBP_GLYCOLYTIC_PROCESS', 'GO:0006096', ['glyc']],
    ['GOBP_RESPONSE_TO_OXIDATIVE_STRESS', 'GO:0006979', ['oxstress']],
    ['GOBP_MICROGLIAL_CELL_ACTIVATION', 'GO:0001774', ['micro', 'infl']],
    ['GOBP_INFLAMMATORY_RESPONSE', 'GO:0006954', ['infl', 'compl']],
    ['GOBP_RESPONSE_TO_TYPE_I_INTERFERON', 'GO:0034340', ['ifn']],
    ['GOBP_ANTIGEN_PROCESSING_AND_PRESENTATION', 'GO:0019882', ['mhc']],
    ['GOBP_COMPLEMENT_ACTIVATION', 'GO:0006956', ['compl']],
    ['GOBP_MYELINATION', 'GO:0042552', ['myelin']],
    ['GOBP_OLIGODENDROCYTE_DIFFERENTIATION', 'GO:0048709', ['opc', 'myelin']],
    ['GOBP_ASTROCYTE_ACTIVATION', 'GO:0048143', ['astro']],
    ['GOBP_ANGIOGENESIS', 'GO:0001525', ['endo']],
    ['GOBP_RESPONSE_TO_UNFOLDED_PROTEIN', 'GO:0006986', ['upr']],
    ['GOBP_AUTOPHAGY', 'GO:0006914', ['autoph']],
    ['GOBP_CYTOPLASMIC_TRANSLATION', 'GO:0002181', ['ribo']],
    ['GOBP_NEUROGENESIS', 'GO:0022008', ['neurog']],
    ['GOBP_AMYLOID_BETA_METABOLIC_PROCESS', 'GO:0050435', ['ad']],
    ['GOBP_CIRCADIAN_RHYTHM', 'GO:0007623', ['circ', 'ieg']],
    ['GOBP_REGULATION_OF_MEMBRANE_POTENTIAL', 'GO:0042391', ['ion']],
    ['HALLMARK_ESTROGEN_RESPONSE_EARLY', '', ['estro', 'ieg']],
    ['HALLMARK_OXIDATIVE_PHOSPHORYLATION', '', ['oxphos']],
    ['HALLMARK_INFLAMMATORY_RESPONSE', '', ['infl', 'compl', 'micro']],
    ['HALLMARK_INTERFERON_ALPHA_RESPONSE', '', ['ifn', 'mhc']],
    ['HALLMARK_CHOLESTEROL_HOMEOSTASIS', '', ['chol']],
    ['HALLMARK_UNFOLDED_PROTEIN_RESPONSE', '', ['upr']],
    ['HALLMARK_MTORC1_SIGNALING', '', ['mtor', 'ribo']],
    ['HALLMARK_GLYCOLYSIS', '', ['glyc']],
    ['HALLMARK_REACTIVE_OXYGEN_SPECIES_PATHWAY', '', ['oxstress']],
  ];
  const CTS = ['CA1 pyramidal', 'CA3 pyramidal', 'Dentate gyrus granule', 'Interneurons', 'Astrocytes', 'Microglia', 'Oligodendrocytes', 'OPCs', 'Endothelial'];
  const NEURON = new Set(CTS.slice(0, 4));
  const CMPS = [
    ['M_KO_vs_M_Ctrl', 'Males: brain aromatase KO vs control'],
    ['F_KO_vs_F_Ctrl', 'Females: brain aromatase KO vs control'],
    ['F_Ctrl_vs_M_Ctrl', 'Controls: female vs male'],
    ['F_KO_vs_M_KO', 'Knockouts: female vs male'],
  ];
  function effects(ct, cmp) {
    const E = {}, n = NEURON.has(ct);
    if (cmp === 'M_KO_vs_M_Ctrl') {
      if (n) Object.assign(E, { plast: -0.6, ieg: -0.8, estro: -0.5, syn: -0.3 });
      if (ct === 'Microglia') E.ifn = 0.4;
      if (ct === 'Astrocytes') E.chol = 0.5;
      if (ct === 'Oligodendrocytes') E.chol = 0.3;
    } else if (cmp === 'F_KO_vs_F_Ctrl') {
      if (n) Object.assign(E, { oxphos: -0.5, estro: -0.6, plast: -0.2 });
      if (ct === 'Microglia') Object.assign(E, { micro: 0.7, ifn: 0.8, mhc: 0.6, compl: 0.5 });
      if (ct === 'Astrocytes') Object.assign(E, { astro: 0.6, oxstress: 0.4, chol: -0.3 });
      if (ct === 'Oligodendrocytes' || ct === 'OPCs') E.myelin = -0.6;
      if (ct === 'Endothelial') E.endo = 0.4;
    } else if (cmp === 'F_Ctrl_vs_M_Ctrl') {
      if (n) Object.assign(E, { estro: 0.3, ieg: 0.3 });
      if (ct === 'Microglia') Object.assign(E, { ifn: -0.3, mhc: -0.2 });
    } else if (cmp === 'F_KO_vs_M_KO') {
      if (n) Object.assign(E, { oxphos: -0.4, ieg: 0.5, plast: 0.3 });
      if (ct === 'Microglia') Object.assign(E, { ifn: 0.5, micro: 0.6, compl: 0.4 });
      if (ct === 'Astrocytes') E.astro = 0.4;
      if (ct === 'Oligodendrocytes') E.myelin = -0.4;
    }
    return E;
  }

  function make() {
    const r = rng(20261119);
    const gauss = () => { let u = 0, v = 0; while (!u) u = r(); while (!v) v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
    const themes = Object.fromEntries(Object.entries(THEMES).map(([k, v]) => [k, v.split(' ')]));
    const real = [...new Set(Object.values(themes).flat())];
    const fillers = Array.from({ length: 2400 }, (_, i) => `Gm${10000 + i * 7}`);
    const genes = real.concat(fillers);
    const geneThemes = new Map(genes.map(g => [g, []]));
    for (const [k, gs] of Object.entries(themes)) gs.forEach(g => geneThemes.get(g).push(k));
    const mult = new Map(genes.map(g => [g, 0.3 + r()]));
    const pathways = PATHWAYS.map(([name, id, ths]) => {
      const mem = new Set();
      ths.forEach(t => themes[t].forEach(g => { if (r() < 0.85) mem.add(g); }));
      for (let k = 0; k < 3; k++) mem.add(real[Math.floor(r() * real.length)]);
      for (let k = 0; k < 6; k++) mem.add(fillers[Math.floor(r() * fillers.length)]);
      return { name, id, coll: name.startsWith('HALLMARK') ? 'Hallmark' : 'GO:BP', genes: [...mem] };
    });

    const data = { version: 1, meta: { title: 'DEMO: simulated hippocampus aromatase KO', demo: true }, celltypes: CTS.slice(), comparisons: CMPS.map(c => c[0]), compLabels: Object.fromEntries(CMPS), deg: {}, gsea: {}, refs: {} };
    for (const ct of CTS) for (const [cmp] of CMPS) {
      const E = effects(ct, cmp);
      const noiseThemes = Object.keys(themes).sort(() => r() - 0.5).slice(0, 2);
      noiseThemes.forEach(t => { E[t] = (E[t] || 0) + (r() - 0.5) * 0.3; });
      const t = { celltype: ct, comparison: cmp, source: 'simulated', genes: [], lfc: [], p: [], padj: null };
      for (const g of genes) {
        if (g.startsWith('Gm') && r() < 0.2) continue;
        let tru = 0;
        for (const th of geneThemes.get(g)) tru += (E[th] || 0) * mult.get(g);
        if (g === 'Cyp19a1' && /KO_vs_.*Ctrl/.test(cmp) && NEURON.has(ct)) tru = -2.5;
        const se = 0.05 + 0.12 * r();
        const obs = tru + gauss() * se;
        t.genes.push(g); t.lfc.push(+obs.toPrecision(4)); t.p.push(+U.pnorm2(obs / se).toPrecision(4));
      }
      t.padj = U.bh(t.p).map(v => +v.toPrecision(4));
      data.deg[`${ct}||${cmp}`] = t;

      const rm = new Map(t.genes.map((g, i) => [g, i]));
      const sd = Math.sqrt(t.lfc.reduce((a, x) => a + x * x, 0) / t.lfc.length);
      for (const coll of ['GO:BP', 'Hallmark']) {
        const gt = { celltype: ct, comparison: cmp, collection: coll, source: 'simulated', names: [], ids: [], score: [], nes: [], p: [], padj: null, size: [], genes: [], scoreType: 'NES' };
        for (const pw of pathways.filter(p => p.coll === coll)) {
          const ix = pw.genes.map(g => rm.get(g)).filter(i => i != null);
          if (ix.length < 5) continue;
          const mean = ix.reduce((a, i) => a + t.lfc[i], 0) / ix.length;
          const z = mean / (sd / Math.sqrt(ix.length));
          const nes = Math.sign(z) * (0.8 + Math.min(2.4, Math.abs(z) / 4));
          const le = ix.filter(i => Math.sign(t.lfc[i]) === Math.sign(z)).sort((a, b) => Math.abs(t.lfc[b]) - Math.abs(t.lfc[a]));
          gt.names.push(pw.name); gt.ids.push(pw.id); gt.score.push(+nes.toPrecision(4)); gt.nes.push(+nes.toPrecision(4));
          gt.p.push(+U.pnorm2(z).toPrecision(4)); gt.size.push(ix.length);
          gt.genes.push(le.slice(0, Math.max(3, Math.ceil(le.length * 0.6))).map(i => t.genes[i]));
        }
        gt.padj = U.bh(gt.p).map(v => +v.toPrecision(4));
        data.gsea[`${ct}||${cmp}||${coll}`] = gt;
      }
    }

    // Two simulated "published" datasets.
    const inTheme = (g, ths) => geneThemes.get(g).some(t => ths.includes(t));
    const ref1 = { id: 'demo-ref-1', name: 'DEMO: aged vs young microglia (simulated)', description: 'Simulated reference resembling an aging microglia signature', citation: 'none: simulated', species: 'mouse', celltype: 'Microglia', source: 'simulated', kind: 'deg', genes: [], lfc: [], padj: null, p: [], dir: null };
    for (const g of genes) {
      if (g.startsWith('Gm') && r() < 0.5) continue;
      const tru = inTheme(g, ['micro', 'ifn', 'mhc', 'compl']) ? 0.9 * mult.get(g) : inTheme(g, ['plast']) ? -0.3 : 0;
      const se = 0.15, obs = tru + gauss() * se;
      ref1.genes.push(g); ref1.lfc.push(+obs.toPrecision(4)); ref1.p.push(+U.pnorm2(obs / se).toPrecision(4));
    }
    ref1.padj = U.bh(ref1.p);
    const ref2 = { id: 'demo-ref-2', name: 'DEMO: estradiol-induced genes (simulated list)', description: 'Simulated gene list of estradiol-responsive genes', citation: 'none: simulated', species: 'mouse', celltype: '', source: 'simulated', kind: 'deg', genes: [], lfc: null, padj: null, p: null, dir: [] };
    for (const g of real) if (inTheme(g, ['estro', 'ieg', 'plast']) && r() < 0.7) { ref2.genes.push(g); ref2.dir.push(1); }
    data.refs = { [ref1.id]: ref1, [ref2.id]: ref2 };
    return data;
  }

  return { make };
})();
