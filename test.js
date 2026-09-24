// Run: node test.js  -- synthetic algorithm tests only, NOT physiological validation.
const assert = require('assert'); const D = require('./dsp.js'); const { CFG } = D;
let fails = 0; const T = (n, f) => { try { f(); console.log('ok   ' + n); } catch (e) { fails++; console.log('FAIL ' + n + ' -> ' + e.message); } };
const rng = s => () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const gauss = r => Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r());
function synth({ bpm = 72, sec = 30, fs = 30, noise = 0.0015, artifact = false, seed = 1, rr = 0, pulse = true } = {}) {
  const r = rng(seed), f = bpm / 60, R = [], G = [], B = [];
  for (let i = 0; i < sec * fs; i++) {
    const t = i / fs, am = rr ? 1 + 0.3 * Math.sin(2 * Math.PI * rr / 60 * t + 0.5) : 1;
    const p = pulse ? (Math.sin(2 * Math.PI * f * t) + 0.3 * Math.sin(4 * Math.PI * f * t + 1)) * am : 0;
    const common = 0.02 * Math.sin(2 * Math.PI * 0.05 * t) + (rr ? 0.008 * Math.sin(2 * Math.PI * rr / 60 * t) : 0) +
      (artifact && t > 10 && t < 12 ? 0.03 * Math.sin(2 * Math.PI * 0.8 * (t - 10)) : 0);
    R.push(150 * (1 + common + 0.002 * p + noise * gauss(r)));
    G.push(100 * (1 + common + 0.006 * p + noise * gauss(r)));
    B.push(80 * (1 + common + 0.003 * p + noise * gauss(r)));
  }
  return { R, G, B };
}
const good = { face: 'ok', fps: 30, motion: 0.05, lum: 130, lightJump: 0.01, range: 1 };

T('fft recovers a sinusoid', () => {
  const n = 256, re = Float64Array.from({ length: n }, (_, i) => Math.sin(2 * Math.PI * 8 * i / n)), im = new Float64Array(n);
  D.fft(re, im); const mag = re.map((v, i) => Math.hypot(v, im[i])); assert.strictEqual(mag.indexOf(Math.max(...mag.slice(0, 128))), 8);
});
T('detrend removes linear trend', () => { const y = D.detrend(Array.from({ length: 100 }, (_, i) => 3 + 0.5 * i)); assert(Math.max(...y.map(Math.abs)) < 1e-9); });
T('zscore normalises', () => { const z = D.zscore([1, 2, 3, 4, 9]); assert(Math.abs(D.mean(z)) < 1e-9 && Math.abs(D.std(z) - 1) < 1e-9); });
T('bandpass attenuates out-of-band, keeps in-band', () => {
  const fs = 30, x = Array.from({ length: 450 }, (_, i) => Math.sin(2 * Math.PI * 1.2 * i / fs) + Math.sin(2 * Math.PI * 0.05 * i / fs) + Math.sin(2 * Math.PI * 8 * i / fs));
  const y = D.bandpass(x, fs, 0.7, 3), s = y.slice(60, 390), e = D.std(s);
  assert(e > 0.6 && e < 0.8, 'rms ' + e);
});
T('bandpass edge cases return null, never throw', () => {
  assert.strictEqual(D.bandpass([], 30, 0.7, 3), null); assert.strictEqual(D.bandpass([1, 2, NaN, 4].concat(new Array(30).fill(1)), 30, 0.7, 3), null);
  assert.strictEqual(D.bandpass(new Array(100).fill(1), 30, 3, 0.7), null);
});
T('resample handles irregular timestamps', () => {
  const t = [], x = []; let s = 0; const r = rng(3); for (let i = 0; i < 300; i++) { s += 0.025 + 0.02 * r(); t.push(s); x.push(Math.sin(2 * Math.PI * 1 * s)); }
  const y = D.resample(t, x, 30); assert(Math.abs(y[100] - Math.sin(2 * Math.PI * (t[0] + 100 / 30))) < 0.05);
});
for (const bpm of [55, 72, 100, 140]) T('green/CHROM/POS + consensus recover ' + bpm + ' BPM', () => {
  const { R, G, B } = synth({ bpm, sec: 12 }), o = D.estimateHR(R, G, B, 30);
  for (const k of ['green', 'chrom', 'pos']) assert(Math.abs(o.est[k].bpm - bpm) <= 3, k + ' got ' + o.est[k].bpm.toFixed(1));
  assert(o.cons.n === 3 && Math.abs(o.cons.bpm - bpm) <= 2);
});
T('CHROM and POS cancel a common-mode motion artifact; consensus never confidently wrong', () => {
  for (let seed = 1; seed <= 5; seed++) {
    const { R, G, B } = synth({ bpm: 80, sec: 12, artifact: true, seed }), c = D.estimateHR(R.slice(200), G.slice(200), B.slice(200), 30).cons;
    assert(c.bpm === null || Math.abs(c.bpm - 80) <= 3, 'seed ' + seed + ' -> ' + c.bpm);
  }
});
T('noise only (no pulse) is rejected by the quality engine', () => {
  let accepted = 0;
  for (let seed = 1; seed <= 20; seed++) {
    const { R, G, B } = synth({ pulse: false, noise: 0.003, sec: 12, seed }), cons = D.estimateHR(R, G, B, 30).cons;
    const st = D.assess({ ...good, cons }).state; if (st === 'GOOD' || st === 'FAIR') accepted++;
  }
  assert(accepted <= 1, accepted + '/20 noise windows accepted');
});
T('respiratory rate recovered (15/min) from baseline + amplitude modulation', () => {
  const { R, G, B } = synth({ bpm: 72, sec: 40, rr: 15 }), o = D.estimateHR(R, G, B, 30), r = D.respiratory(G, o.sigs.pos, 30);
  assert(r && Math.abs(r.rr - 15) <= 2, 'rr ' + (r && r.rr));
});
T('respiratory rate refuses when there is no respiratory cue', () => {
  const { R, G, B } = synth({ bpm: 72, sec: 40, rr: 0, noise: 0.004 }), o = D.estimateHR(R, G, B, 30), r = D.respiratory(G, o.sigs.pos, 30);
  assert(r === null || r.rr > 0);   // must not throw; value (if any) is gated by two-cue agreement
});
T('consensus refuses to average conflicting methods', () => {
  const e = b => ({ bpm: b, conc: 0.5, snr: 5 });
  const c = D.consensus({ green: e(73), chrom: e(112), pos: e(141) }); assert(c.n === 1);
  assert(D.assess({ ...good, cons: c }).state === 'INVALID');
  const c2 = D.consensus({ green: e(73), chrom: e(74), pos: e(141) }); assert(c2.n === 2 && Math.abs(c2.bpm - 73.5) < 0.1);
});
T('quality: good / minor motion / major motion / no face / multi face / dark / low fps', () => {
  const cons = { n: 3, conc: 0.7, bpm: 72 };
  assert.strictEqual(D.assess({ ...good, cons }).state, 'GOOD');
  const minor = D.assess({ ...good, cons, motion: 0.5 }); assert(['FAIR', 'GOOD'].includes(minor.state) && minor.score < D.assess({ ...good, cons }).score);
  assert.strictEqual(D.assess({ ...good, cons, motion: 1.2 }).state, 'INVALID');
  assert.strictEqual(D.assess({ ...good, cons, face: 'none' }).state, 'INVALID');
  assert.strictEqual(D.assess({ ...good, cons, face: 'multi' }).reasons[0], 'Multiple faces detected');
  assert(D.assess({ ...good, cons, lum: 25 }).score < 0.7 && D.assess({ ...good, cons, lum: 25 }).reasons.some(r => /dark/i.test(r)));
  assert(D.assess({ ...good, cons, lightJump: 0.2 }).reasons.some(r => /lighting/i.test(r)));
  assert.strictEqual(D.assess({ ...good, cons, fps: 8 }).state, 'INVALID');
  assert.notStrictEqual(D.assess({ ...good, cons, range: 30 }).state, 'GOOD');
});
T('summary + validation statistics', () => {
  const s = D.summarize([{ timestamp: 1, heart_rate: 70, respiratory_rate: 14, signal_quality: 90 }, { timestamp: 2, heart_rate: 80, respiratory_rate: null, signal_quality: 70 }, { bad: 1 }]);
  assert(s.n === 2 && s.avgHr === 75 && s.minHr === 70 && s.maxHr === 80 && s.avgRr === 14 && s.avgQ === 80);
  assert.strictEqual(D.summarize([]), null); assert.strictEqual(D.agreementStats([]), null);
  const a = D.agreementStats([[70, 72], [80, 79], [90, 93]]); assert(Math.abs(a.mae - 2) < 1e-9 && Math.abs(a.bias - 4 / 3) < 1e-9 && a.r > 0.97);
});
T('HRV-broadened pulse + jittered timestamps: methods converge within resolution-based tolerance', () => {
  for (let seed = 1; seed <= 5; seed++) {
    const r = rng(seed), F = 30, t = [], R = [], G = [], B = []; let ph = 0, s = 0;
    for (let i = 0; i < 20 * F; i++) {
      s += 1 / F + (r() - 0.5) * 0.01; ph += 2 * Math.PI * 1.3 * (1 + 0.04 * Math.sin(2 * Math.PI * 0.1 * s)) / F;
      const p = Math.sin(ph) + 0.3 * Math.sin(2 * ph + 1), c = 0.02 * Math.sin(2 * Math.PI * 0.05 * s); t.push(s);
      R.push(150 * (1 + c + 0.002 * p + 0.0015 * gauss(r))); G.push(100 * (1 + c + 0.006 * p + 0.0015 * gauss(r))); B.push(80 * (1 + c + 0.003 * p + 0.0015 * gauss(r)));
    }
    const rs = a => D.resample(t, a, 30), o = D.estimateHR(rs(R), rs(G), rs(B), 30);
    assert(o.cons.n >= 2 && Math.abs(o.cons.bpm - 78) <= 4, 'seed ' + seed + ' n=' + o.cons.n + ' bpm=' + (o.cons.bpm && o.cons.bpm.toFixed(1)));
  }
});
T('fuseWeights suppresses weak / disagreeing ROIs', () => {
  const ok = { bpm: 75, conc: .6, n: 3, res: 5 }, bad = { bpm: 75, conc: .22, n: 1, res: 5 }, off = { bpm: 130, conc: .5, n: 2, res: 5 };
  const f = D.fuseWeights([ok, ok, bad]); assert(f.ok && f.w[2] < 0.01 && Math.abs(f.w[0] - .5) < .01);
  assert.strictEqual(D.fuseWeights([ok, ok, off]).w[2], 0); assert(!D.fuseWeights([bad, bad, bad]).ok);
});
T('band-edge (illumination) peaks are flagged; octave guard prefers the fundamental', () => {
  const F = 30, n = 600, mk = f => Array.from({ length: n }, (_, i) => Math.sin(2 * Math.PI * f * i / F));
  assert(D.spectralPeak(mk(0.72), F, CFG.hrBand).edge);
  const oct = D.spectralPeak(mk(0.95).map((v, i) => 0.85 * v + Math.sin(2 * Math.PI * 1.9 * i / F)), F, CFG.hrBand);
  assert(Math.abs(oct.bpm - 57) <= 2, 'got ' + oct.bpm);
});
T('consensus trace: methods AGREE (66.6/65.7/68.6) but SNR is below the gate -> untrusted, explicit reasons, not "disagree"', () => {
  const e = (bpm, conc) => ({ bpm, conc, snr: 10 * Math.log10(conc / (1 - conc)), res: 5 });
  const c = D.consensus({ green: e(66.6, .37), chrom: e(65.7, .28), pos: e(68.6, .25) });
  assert(c.n === 0 && c.bpm === null && c.agreeN === 3 && Math.abs(c.agreeBpm - 66.9) < 0.5);
  for (const k of ['green', 'chrom', 'pos']) assert(/REJECTED: SNR .* trust gate/.test(c.reasons[k]) && /agrees/.test(c.reasons[k]), c.reasons[k]);
  const a = D.assess({ ...good, cons: c }); assert(a.state === 'INVALID' && a.reasons.some(r => /agree near 67/.test(r)) && !a.reasons.some(r => /disagree/.test(r)));
  assert(/EDGE/.test(D.consensus({ green: { bpm: 43, conc: .8, snr: 6, res: 5, edge: true } }).reasons.green));
});
T('noise-only windows sit near/below the SNR gate (documents the metric noise floor)', () => {
  const snr = []; for (let seed = 1; seed <= 40; seed++) { const { R, G, B } = synth({ pulse: false, noise: 0.003, sec: 20, seed }), o = D.estimateHR(R, G, B, 30); for (const k in o.est) if (o.est[k]) snr.push(o.est[k].snr); }
  snr.sort((a, b) => a - b); const med = snr[snr.length >> 1], p90 = snr[Math.floor(snr.length * .9)];
  console.log('     noise-only peak SNR: median ' + med.toFixed(1) + ' dB, 90th pct ' + p90.toFixed(1) + ' dB, gate +' + CFG.minSnrDb + ' dB'); assert(med < CFG.minSnrDb && p90 < CFG.minSnrDb + 2);
});
T('resample onto a shared window gives equal lengths', () => {
  const t1 = Array.from({ length: 300 }, (_, i) => i / 30), t2 = t1.map(v => v + 0.01);
  assert.strictEqual(D.resample(t1, t1, 30, 1, 9).length, D.resample(t2, t2, 30, 1, 9).length);
});
T('patchEstimate: pulse patch scores high; noise patch scores low', () => {
  const p = synth({ bpm: 75, sec: 20, seed: 3 }), n = synth({ pulse: false, noise: 0.003, sec: 20, seed: 4 });
  const a = D.patchEstimate(p.R, p.G, p.B, 30), b = D.patchEstimate(n.R, n.G, n.B, 30);
  assert(a.n === 2 && Math.abs(a.bpm - 75) <= 3 && D.patchQuality(a) > 0.6, JSON.stringify(a)); assert(D.patchQuality(b) < 0.3, JSON.stringify(b));
});
T('quality-weighted patch fusion rejects a coherent artifact minority that equal averaging would follow', () => {
  const list = [], P = [];
  for (let i = 0; i < 12; i++) {
    const art = i >= 8, s = synth({ bpm: 75, sec: 20, seed: 10 + i, pulse: !art, noise: 0.002 });
    if (art) for (let j = 0; j < s.R.length; j++) { const a = Math.sin(2 * Math.PI * 1.9 * j / 30); s.R[j] *= 1 + 0.02 * a; s.G[j] *= 1 + 0.012 * a; s.B[j] *= 1 + 0.022 * a; }
    P.push(s); list.push(D.patchEstimate(s.R, s.G, s.B, 30));
  }
  const f = D.fuseWeights(list); assert(f.ok && f.w.slice(8).every(w => w === 0) && f.w.slice(0, 8).every(w => w > 0), JSON.stringify(f.w.map(v => +v.toFixed(2))));
  const mix = c => P[0][c].map((_, j) => P.reduce((s, p, i) => s + f.w[i] * p[c][j] / D.mean(p[c]), 0)), h = D.estimateHR(mix('R'), mix('G'), mix('B'), 30);
  assert(h.cons.n >= 2 && Math.abs(h.cons.bpm - 75) <= 3, 'fused ' + h.cons.bpm);
});
// ---- Is "the methods agree" evidence? Is the SNR gate justified? Does dense-patch pooling help without cherry-picking noise? (synthetic) ----
function patchSet(amp, seed, { n = 30, noise = 0.003, art = 0 } = {}) {
  const r = rng(seed), F = 30, common = [], PH = []; let ph = r() * 6;
  for (let i = 0; i < 20 * F; i++) { ph += 2 * Math.PI * 70 / 60 * (1 + 0.04 * Math.sin(2 * Math.PI * 0.1 * i / F)) / F; PH.push(ph); common.push(0.015 * Math.sin(2 * Math.PI * 0.05 * i / F + 1) + art * Math.sin(2 * Math.PI * 1.9 * i / F)); }
  return Array.from({ length: n }, () => { const R = [], G = [], B = []; PH.forEach((q, i) => { const p = Math.sin(q) + 0.3 * Math.sin(2 * q + 1), c = common[i];
    R.push(150 * (1 + c + 0.33 * amp * p + noise * gauss(r))); G.push(100 * (1 + c + amp * p + noise * gauss(r))); B.push(80 * (1 + c + 0.5 * amp * p + noise * gauss(r))); }); return { R, G, B }; });
}
function patchPipe(P) {                      // same chain as the app: per-patch score -> robust weights -> fused RGB -> Green/CHROM/POS -> consensus
  const est = P.map(p => D.patchEstimate(p.R, p.G, p.B, 30)), fw = D.fuseWeights(est), m = P.map(p => ({ R: D.mean(p.R), G: D.mean(p.G), B: D.mean(p.B) }));
  const mix = c => P[0][c].map((_, j) => P.reduce((a, p, i) => a + fw.w[i] * p[c][j] / m[i][c], 0)), cont = fw.w.filter(w => w > 0).length;
  const h = D.estimateHR(mix('R'), mix('G'), mix('B'), 30); return { trusted: fw.ok && cont >= CFG.patch.minAccepted && h.cons.n >= 2, bpm: h.cons.bpm, cont };
}
T('pure noise: the three methods often "agree" by chance, but almost never pass the trust gate', () => {
  let agree3 = 0, trusted = 0; const N = 60;
  for (let seed = 1; seed <= N; seed++) { const { R, G, B } = synth({ pulse: false, noise: 0.003, sec: 20, seed: 100 + seed }), c = D.estimateHR(R, G, B, 30).cons; if (c.agreeN === 3) agree3++; if (c.n >= 2) trusted++; }
  console.log('     noise-only: 3/3 agree ' + Math.round(agree3 / N * 100) + '% of windows, trusted ' + Math.round(trusted / N * 100) + '%'); assert(trusted <= 3, trusted + '/60 noise windows trusted');
});
T('dense patches: pure noise (no pulse) is never trusted - quality weighting does not cherry-pick noise', () => {
  let tr = 0; for (let s = 1; s <= 15; s++) if (patchPipe(patchSet(0, 200 + s)).trusted) tr++; assert(tr <= 1, tr + '/15 noise sets trusted');
});
T('dense patches: coherent intensity-only artifact in every patch is not reported as a heart rate', () => {
  for (let s = 1; s <= 8; s++) { const r = patchPipe(patchSet(0, 300 + s, { art: 0.01 })); assert(!r.trusted, 'artifact accepted as ' + r.bpm); }
});
T('dense patches: pooling many independent noisy patches lifts a weak pulse over the gate (synthetic, independent per-patch noise)', () => {
  let ok = 0; for (let s = 1; s <= 10; s++) { const r = patchPipe(patchSet(0.001, 400 + s)); if (r.trusted && Math.abs(r.bpm - 70) <= 4) ok++; }
  console.log('     weak pulse (0.10% green amplitude, 0.3% noise per patch): trusted & correct ' + ok + '/10'); assert(ok >= 8, ok + '/10');
});
T('robust jump test: a single AE/AWB step does not fail a 20s window; sustained instability does', () => {
  const F = 30, n = 600, med = a => { const v = [...a].sort((x, y) => x - y); return v[v.length >> 1]; };
  const jr = x => { const gn = x.map((v, i) => v / (D.mean(x.slice(Math.max(0, i - 30), i + 1)) || v)); const d = gn.slice(1).map((v, i) => Math.abs(v - gn[i])), md = Math.max(med(d), 2e-4); return d.filter(v => v > 8 * md).length / d.length; };
  const step = Array.from({ length: n }, (_, i) => 100 * (1 + 0.002 * Math.sin(2 * Math.PI * 1.2 * i / F)) * (i > 300 ? 1.15 : 1));   // one brightness step at 10s
  const noisy = Array.from({ length: n }, (_, i) => 100 * (1 + 0.002 * Math.sin(2 * Math.PI * 1.2 * i / F) + 0.05 * (Math.random() - 0.5)));   // continuous jitter
  console.log('     outlier-frame fraction: one-off AE step ' + (jr(step) * 100).toFixed(2) + '%, continuous jitter ' + (jr(noisy) * 100).toFixed(2) + '% (gate ' + (CFG.patch.jumpMax * 100) + '%)');
  assert(jr(step) < CFG.patch.jumpMax, 'a single step must not exceed the outlier-fraction gate');
});
T('patch.minCover reflects that resample() interpolates gaps, not raw continuity', () => {
  const t1 = [], x1 = []; for (let i = 0; i < 600; i++) if (i % 4 !== 1) { t1.push(i / 30); x1.push(Math.sin(2 * Math.PI * 1.2 * i / 30)); }   // 25% of frames missing
  const y = D.resample(t1, x1, 30, 0, 19.9); assert(y.length > 550 && y.every(Number.isFinite), 'resample should densely fill an intermittently-sampled 20s span');
});
console.log(fails ? fails + ' test(s) FAILED' : 'all tests passed'); process.exit(fails ? 1 : 0);
