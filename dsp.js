(function (g) {
'use strict';
// All tunables live here.
const CFG = {
  fs: 30, bufSec: 40, hrWinSec: 20, rrWinSec: 30, minHrSec: 12, measureSec: 30, reacquireSec: 3,
  segFrac: 0.6, sigHalfBw: 0.1, subHarmFrac: 0.5, edgeHz: 0.05, agreeK: 1,   // agreeK: tolerance = max(agreeBpm, agreeK * spectral resolution)
  hrBand: [0.7, 3.0], rrBand: [0.1, 0.5],
  minSnrDb: 1, agreeBpm: 5, stabBpm: 8, rrAgreeBpm: 3, minRrSnrDb: 0,
  motion: { minor: 0.3, major: 0.9 },           // face-widths / second (EMA)
  light: { lo: 70, hi: 200, jump: 0.08 },       // ROI mean luminance, relative change
  minFps: 12, goodFps: 20,
  q: { good: 0.75, fair: 0.55, poor: 0.35 },
  // patch: lumLo/lumHi mean-luminance limits; minUse usable-skin-pixel fraction; minCover fraction of the analysis window a patch must span;
  // motionMax face-widths/s; jumpMax max single-frame relative change of patch green; budget ms of patch scoring per tick; capK weight cap;
  // minAccepted patches that must contribute; refresh s between re-scores; chromaTol Cr/Cb distance from the median patch; gapReset below.
  // minCover 0.75 (not ~1.0): resample() already linearly interpolates gaps, so a patch needs a sufficiently long span, not
  // near-zero missing samples - requiring near-total continuity discarded good history on every ordinary camera/tracker hiccup.
  // jumpMax is a max OUTLIER-FRAME FRACTION (median-based, see gate()), not a raw one-frame ceiling, so a single AE/AWB step
  // doesn't disqualify an otherwise good 20s window. gapReset: a per-patch buffer is cleared only after this many seconds
  // with no update (was 0.3s - shorter than typical MediaPipe jitter on a loaded main thread, so buffers rarely reached minCover).
  patch: { lumLo: 45, lumHi: 235, minUse: 0.5, minCover: 0.75, motionMax: 0.9, jumpMax: 0.08, budget: 60, capK: 2.5, minAccepted: 5, refresh: 1.5, chromaTol: 18, gapReset: 1.2,
    // Multi-scale, anatomically-quota'd patches (replaces the old uniform grid): 'L' for spatial averaging/SNR, 'M' (68% linear size) for spatial
    // diversity at the same anatomical spot. baseSize is the 'L' patch side as a fraction of face width (~30px at a ~200px-wide webcam face).
    scales: [{ tag: 'L', mult: 1 }, { tag: 'M', mult: 0.68 }], baseSize: 0.15,
    // Region quotas in face-aligned (u,v) units of face width; v is measured from the eyebrow line (negative = up/forehead, positive = down/chin).
    // rows x cols candidates are generated per region per scale; geometric pruning (oval boundary, eye/brow/lips/nose exclusion) then removes the rest.
    regions: [
      { name: 'forehead', side: 0, uR: [-.34, .34], vR: [-.46, -.06], rows: 3, cols: 3 },
      { name: 'cheek-upper', side: -1, uR: [.13, .34], vR: [.02, .24], rows: 2, cols: 2 },
      { name: 'cheek-upper', side: 1, uR: [.13, .34], vR: [.02, .24], rows: 2, cols: 2 },
      { name: 'cheek-mid', side: -1, uR: [.14, .38], vR: [.20, .44], rows: 2, cols: 2 },
      { name: 'cheek-mid', side: 1, uR: [.14, .38], vR: [.20, .44], rows: 2, cols: 2 },
      { name: 'cheek-lateral', side: -1, uR: [.34, .54], vR: [.02, .40], rows: 2, cols: 2 },
      { name: 'cheek-lateral', side: 1, uR: [.34, .54], vR: [.02, .40], rows: 2, cols: 2 },
    ] },
  patchNfft: 2048, minFacePx: 120,
};
const mean = a => a.reduce((s, v) => s + v, 0) / (a.length || 1);
const std = a => { const m = mean(a); return Math.sqrt(mean(a.map(v => (v - m) ** 2))); };
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));

function resample(t, x, fs, t0, t1) {   // irregular camera timestamps -> uniform grid (optionally a shared window [t0,t1])
  const out = []; if (t.length < 2) return out;
  const a = t0 == null ? t[0] : t0, b = t1 == null ? t[t.length - 1] : t1, n = Math.floor((b - a) * fs + 1e-9) + 1; let j = 0;
  for (let i = 0; i < n; i++) {
    const s = a + i / fs;
    while (j < t.length - 2 && t[j + 1] < s) j++;
    const w = (s - t[j]) / ((t[j + 1] - t[j]) || 1);
    out.push(x[j] + clamp(w, 0, 1) * (x[j + 1] - x[j]));
  }
  return out;
}
function detrend(x) {
  const n = x.length; if (n < 2) return x.slice();
  const mx = (n - 1) / 2, my = mean(x); let sxy = 0, sxx = 0;
  for (let i = 0; i < n; i++) { sxy += (i - mx) * (x[i] - my); sxx += (i - mx) ** 2; }
  const b = sxy / sxx; return x.map((v, i) => v - my - b * (i - mx));
}
const zscore = x => { const s = std(x), m = mean(x); return s > 1e-12 ? x.map(v => (v - m) / s) : x.map(() => 0); };

function fft(re, im) {                   // in-place radix-2
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let b = n >> 1; for (; j & b; b >>= 1) j ^= b; j ^= b;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const a = -2 * Math.PI / len;
    for (let i = 0; i < n; i += len) for (let k = 0; k < len / 2; k++) {
      const c = Math.cos(a * k), s = Math.sin(a * k), u = i + k, v = u + len / 2;
      const xr = re[v] * c - im[v] * s, xi = re[v] * s + im[v] * c;
      re[v] = re[u] - xr; im[v] = im[u] - xi; re[u] += xr; im[u] += xi;
    }
  }
}
function biquad(type, fc, fs) {          // RBJ Butterworth-Q biquad
  const w = 2 * Math.PI * fc / fs, c = Math.cos(w), al = Math.sin(w) / (2 * Math.SQRT1_2), a0 = 1 + al;
  const b = type === 'lp' ? [(1 - c) / 2, 1 - c, (1 - c) / 2] : [(1 + c) / 2, -(1 + c), (1 + c) / 2];
  return { b: b.map(v => v / a0), a: [-2 * c / a0, (1 - al) / a0] };
}
function runBq(f, x) {
  let z1 = 0, z2 = 0;
  return x.map(v => { const y = f.b[0] * v + z1; z1 = f.b[1] * v - f.a[0] * y + z2; z2 = f.b[2] * v - f.a[1] * y; return y; });
}
// Zero-phase band-pass (forward-backward, odd-extension padding). Returns null instead of throwing.
function bandpass(x, fs, lo, hi) {
  hi = Math.min(hi, 0.45 * fs);
  if (x.length < 16 || !(lo > 0) || !(lo < hi) || x.some(v => !isFinite(v))) return null;
  const n = x.length, p = Math.min(n - 2, Math.round(2 * fs));
  const ext = [...Array.from({ length: p }, (_, i) => 2 * x[0] - x[p - i]), ...x,
               ...Array.from({ length: p }, (_, i) => 2 * x[n - 1] - x[n - 2 - i])];
  const fl = [biquad('hp', lo, fs), biquad('lp', hi, fs)];
  let y = ext; for (const f of fl) y = runBq(f, y);
  y = y.reverse(); for (const f of fl) y = runBq(f, y); y = y.reverse();
  y = y.slice(p, p + n);
  return y.every(isFinite) ? y : null;
}
function welch(x, fs, segFrac = 0.6, nfft = 4096) {
  const n = x.length; if (n < 32) return null;
  const L = Math.max(16, Math.round(n * segFrac)), step = Math.max(1, L >> 1);
  const win = Array.from({ length: L }, (_, i) => 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (L - 1)));
  const P = new Float64Array(nfft / 2 + 1); let k = 0;
  for (let s = 0; s + L <= n; s += step) {
    const re = new Float64Array(nfft), im = new Float64Array(nfft), seg = x.slice(s, s + L), m = mean(seg);
    for (let i = 0; i < L; i++) re[i] = (seg[i] - m) * win[i];
    fft(re, im); for (let i = 0; i <= nfft / 2; i++) P[i] += re[i] ** 2 + im[i] ** 2; k++;
  }
  return { f: Array.from(P, (_, i) => i * fs / nfft), p: Array.from(P, v => v / (k || 1)), L };
}
// Dominant in-band peak. Signal power = +-hw around f0 and 2*f0 (hw >= main-lobe scale). Returns diagnostics too.
function spectralPeak(x, fs, band, o = {}) {
  const s = welch(x, fs, o.segFrac || CFG.segFrac, o.nfft); if (!s) return null;
  const { f, p, L } = s, df = f[1]; let bi = -1, bp = 0, tot = 0, i0 = -1, i1 = -1;
  for (let i = 0; i < f.length; i++) {
    if (f[i] < band[0] || f[i] > band[1]) continue;
    if (i0 < 0) i0 = i; i1 = i; tot += p[i]; if (p[i] > bp) { bp = p[i]; bi = i; }
  }
  if (bi < 0 || tot <= 0) return null;
  const pmax = bp;
  if (o.harmonics !== false) {            // octave guard: prefer f0/2 if it carries comparable power
    const h = Math.round(f[bi] / 2 / df), w = Math.round(0.1 / df); let m = 0, mi = -1;
    for (let i = Math.max(i0, h - w); i <= Math.min(i1, h + w); i++) if (p[i] > m) { m = p[i]; mi = i; }
    if (mi >= 0 && m >= CFG.subHarmFrac * pmax) { bi = mi; bp = m; }
  }
  let fi = f[bi];                          // parabolic interpolation of the peak
  if (bi > 0 && bi < p.length - 1) { const a = p[bi - 1], b = p[bi], c = p[bi + 1], d = a - 2 * b + c; if (d < 0) fi += 0.5 * (a - c) / d * df; }
  const hw = Math.max(CFG.sigHalfBw, 1.5 * fs / L), f0 = f[bi]; let sig = 0;
  for (let i = i0; i <= i1; i++) if (Math.abs(f[i] - f0) <= hw || (o.harmonics !== false && Math.abs(f[i] - 2 * f0) <= hw)) sig += p[i];
  const pk = []; for (let i = i0 + 1; i < i1; i++) if (p[i] > p[i - 1] && p[i] >= p[i + 1] && p[i] > 0.15 * pmax) pk.push({ bpm: f[i] * 60, rel: p[i] / pmax });
  pk.sort((a, b) => b.rel - a.rel);
  return { hz: fi, bpm: fi * 60, conc: sig / tot, snr: 10 * Math.log10(sig / Math.max(tot - sig, 1e-30)), power: bp, res: 60 * fs / L,
           edge: f0 < band[0] + CFG.edgeHz || f0 > band[1] - CFG.edgeHz, peaks: pk.slice(0, 3), spec: o.keep ? { f, p, i0, i1 } : null };
}

// R,G,B: uniformly sampled arrays. Returns band-passed pulse signals per method (null if unstable).
function methods(R, G, B, fs, band) {
  const bp = x => bandpass(detrend(x), fs, band[0], band[1]);
  const nz = a => { const m = mean(a) || 1; return a.map(v => v / m); };
  const Rn = nz(R), Gn = nz(G), Bn = nz(B);
  const green = bp(Gn);
  const Xf = bp(Rn.map((r, i) => 3 * r - 2 * Gn[i])), Yf = bp(Rn.map((r, i) => 1.5 * r + Gn[i] - 1.5 * Bn[i]));
  let chrom = null;
  if (Xf && Yf) { const a = std(Xf) / (std(Yf) || 1); chrom = Xf.map((v, i) => v - a * Yf[i]); }
  // POS (Wang et al. 2016): 1.6 s windows, per-window mean normalisation, projections [0 1 -1] and [-2 1 1], alpha = std ratio,
  // std-normalised overlap-add. Written without per-window allocations (it runs for every skin patch).
  const l = Math.max(8, Math.round(1.6 * fs)), N = R.length, H = new Float64Array(N), s1 = new Float64Array(l), s2 = new Float64Array(l);
  for (let t = 0; t + l <= N; t++) {
    let mr = 0, mg = 0, mb = 0; for (let i = 0; i < l; i++) { mr += R[t + i]; mg += G[t + i]; mb += B[t + i]; }
    mr = mr / l || 1; mg = mg / l || 1; mb = mb / l || 1;
    let a1 = 0, a2 = 0, q1 = 0, q2 = 0;
    for (let i = 0; i < l; i++) { const x = G[t + i] / mg - B[t + i] / mb, y = -2 * R[t + i] / mr + G[t + i] / mg + B[t + i] / mb; s1[i] = x; s2[i] = y; a1 += x; a2 += y; q1 += x * x; q2 += y * y; }
    a1 /= l; a2 /= l;
    const al = Math.sqrt(Math.max(q1 / l - a1 * a1, 0)) / (Math.sqrt(Math.max(q2 / l - a2 * a2, 0)) || 1);
    let hs = 0, hq = 0; for (let i = 0; i < l; i++) { const h = s1[i] + al * s2[i]; s1[i] = h; hs += h; hq += h * h; }
    const hm = hs / l, sh = Math.sqrt(Math.max(hq / l - hm * hm, 0)) || 1;
    for (let i = 0; i < l; i++) H[t + i] += (s1[i] - hm) / sh;
  }
  return { green, chrom, pos: N >= l ? bp(Array.from(H)) : null };
}
// Two separate questions:  (1) AGREEMENT - do the methods point at the same BPM (within max(agreeBpm, agreeK*resolution))?
// (2) TRUST - is each method's spectral SNR above the gate?  Only trusted, agreeing methods vote for the reported HR.
// Every method gets an explicit ACCEPTED / REJECTED reason. Conflicting results are never averaged.
function consensus(est) {
  const tol = (a, b) => Math.max(CFG.agreeBpm, CFG.agreeK * Math.max(a.res || 0, b.res || 0));
  const sc = c => c.reduce((s, [, e]) => s + e.conc, 0);
  const cluster = arr => {
    let best = [];
    for (const [, a] of arr) {
      const cl = arr.filter(([, b]) => Math.abs(a.bpm - b.bpm) <= tol(a, b));
      if (cl.length > best.length || (cl.length === best.length && sc(cl) > sc(best))) best = cl;
    }
    return best;
  };
  const g = 10 ** (CFG.minSnrDb / 10), gate = g / (1 + g), live = [], voters = [], reasons = {};
  for (const [k, e] of Object.entries(est)) {
    if (!e) reasons[k] = 'REJECTED: no estimate (insufficient data / filter guard)';
    else if (e.edge) reasons[k] = 'REJECTED: EDGE - peak at the HR-band limit (illumination leakage); cannot vote';
    else {
      live.push([k, e]);
      if (e.snr >= CFG.minSnrDb) voters.push([k, e]);
      else reasons[k] = `REJECTED: SNR ${e.snr.toFixed(1)} dB < +${CFG.minSnrDb.toFixed(1)} dB trust gate (quality ${e.conc.toFixed(2)}, needs >= ${gate.toFixed(2)})`;
    }
  }
  const agree = cluster(live), best = cluster(voters);
  for (const [k] of voters) reasons[k] = 'REJECTED: outlier - BPM differs from the trusted cluster by more than the tolerance';
  for (const [k] of best) reasons[k] = 'ACCEPTED';
  for (const [k] of agree) if (reasons[k] !== 'ACCEPTED') reasons[k] += ' | BPM itself agrees with the other methods';
  const t = Math.max(CFG.agreeBpm, CFG.agreeK * Math.max(0, ...live.map(([, e]) => e.res || 0)));
  const base = { spread: 0, tol: t, res: 0, reasons, agreeN: agree.length, agreeMethods: agree.map(x => x[0]),
                 agreeBpm: agree.length ? agree.reduce((s, [, e]) => s + e.bpm * e.conc, 0) / sc(agree) : null };
  if (!best.length) return { ...base, bpm: null, n: 0, conc: 0, methods: [] };
  const w = sc(best), b = best.map(([, e]) => e.bpm);
  return { ...base, bpm: best.reduce((s, [, e]) => s + e.bpm * e.conc, 0) / w, n: best.length, conc: w / best.length, methods: best.map(x => x[0]),
           spread: Math.max(...b) - Math.min(...b), res: Math.max(...best.map(([, e]) => e.res || 0)) };
}
function estimateHR(R, G, B, fs, keep) {
  const sigs = methods(R, G, B, fs, CFG.hrBand), est = {};
  for (const k in sigs) est[k] = sigs[k] ? spectralPeak(sigs[k], fs, CFG.hrBand, { keep }) : null;
  return { sigs, est, cons: consensus(est) };
}
// Patch quality 0..1 from a patch estimate; a patch whose own Green and POS spectra disagree only gets half credit.
const patchQuality = r => !r || r.bpm == null ? 0 : clamp(((r.n >= 2 ? r.conc : 0.5 * r.conc) - 0.2) / 0.35);
function patchEstimate(R, G, B, fs) {   // cheap per-patch score (Green + POS)
  const m = methods(R, G, B, fs, CFG.hrBand), o = { nfft: CFG.patchNfft };
  const est = ['green', 'pos'].map(k => m[k] && spectralPeak(m[k], fs, CFG.hrBand, o)).filter(e => e && !e.edge);
  const amp = m.green ? std(m.green) * 100 : 0;
  if (!est.length) return { bpm: null, conc: 0, n: 0, res: 0, snr: -99, amp };
  const [a, b] = est, top = est.reduce((x, y) => y.conc > x.conc ? y : x);
  if (b && Math.abs(a.bpm - b.bpm) <= Math.max(CFG.agreeBpm, CFG.agreeK * Math.max(a.res, b.res)))
    return { bpm: (a.bpm * a.conc + b.bpm * b.conc) / (a.conc + b.conc), conc: (a.conc + b.conc) / 2, n: 2, res: Math.max(a.res, b.res), snr: Math.min(a.snr, b.snr), amp };
  return { bpm: top.bpm, conc: top.conc, n: 1, res: top.res, snr: top.snr, amp };
}
// Robust quality-weighted fusion weights: w ~ quality^2, patches whose BPM disagrees with the (quality-positive) median get 0,
// and no patch may exceed capK x the median positive weight. ok=false: nothing passed -> equal weights (the trust gate then decides).
function fuseWeights(list) {
  const w = list.map(r => patchQuality(r) ** 2), idx = w.map((v, i) => v > 0 ? i : -1).filter(i => i >= 0);
  let med = null;
  if (idx.length >= 2) {
    const b = idx.map(i => list[i].bpm).sort((x, y) => x - y); med = b[b.length >> 1];
    idx.forEach(i => { if (Math.abs(list[i].bpm - med) > Math.max(CFG.agreeBpm, CFG.agreeK * (list[i].res || 0))) w[i] = 0; });
  } else if (idx.length === 1) med = list[idx[0]].bpm;
  const pos = w.filter(v => v > 0).sort((x, y) => x - y);
  if (!pos.length) return { w: list.map(() => 1 / list.length), ok: false, med };
  const cap = CFG.patch.capK * pos[pos.length >> 1], c = w.map(v => Math.min(v, cap)), s = c.reduce((x, y) => x + y, 0);
  return { w: c.map(v => v / s), ok: true, med };
}
// RR from two independent low-frequency cues; reported only if both agree.
function respiratory(G, pulse, fs) {
  const b = CFG.rrBand;
  const base = bandpass(detrend(G), fs, b[0], b[1]);
  const env = pulse && bandpass(detrend(runBq(biquad('lp', 0.6, fs), pulse.map(Math.abs))), fs, b[0], b[1]);
  const o = { harmonics: false, segFrac: 0.7 };
  const a = base && spectralPeak(base, fs, b, o), c = env && spectralPeak(env, fs, b, o);
  if (!a || !c || Math.abs(a.bpm - c.bpm) > CFG.rrAgreeBpm || Math.min(a.snr, c.snr) < CFG.minRrSnrDb) return null;
  return { rr: (a.bpm + c.bpm) / 2, snr: Math.min(a.snr, c.snr) };
}
// Signal Quality / Trust engine. Every term derives from measured quantities.
function assess(i) {
  if (i.face !== 'ok') return { score: 0, state: 'INVALID', reasons: [i.face === 'multi' ? 'Multiple faces detected' : i.face === 'small' ? 'Face too small - move closer' : 'Face not detected'] };
  if (i.patchesOk === false) return { score: 0, state: 'INVALID', reasons: ['Too few reliable skin patches (' + (i.patchN || 0) + ' < ' + CFG.patch.minAccepted + ')'] };
  const M = CFG.motion, L = CFG.light, why = [];
  const ms = i.motion <= M.minor ? 1 - 0.3 * i.motion / M.minor : 0.7 * (1 - clamp((i.motion - M.minor) / (M.major - M.minor)));
  const lumS = i.lum >= L.lo && i.lum <= L.hi ? 1 : i.lum < L.lo ? clamp(i.lum / L.lo) : clamp(1 - (i.lum - L.hi) / (255 - L.hi));
  const ls = lumS * (1 - clamp(i.lightJump / (2 * L.jump)));
  const fpsS = clamp((i.fps - CFG.minFps) / (CFG.goodFps - CFG.minFps));
  const sigS = clamp((i.cons.conc - 0.2) / 0.35);
  const agS = [0, 0.25, 0.75, 1][i.cons.n] || 0;
  const stS = i.range == null ? 0.5 : clamp(1 - (i.range - 2) / (2 * CFG.stabBpm));
  const score = clamp(fpsS * (0.4 + 0.6 * ls) * (0.35 * sigS + 0.2 * agS + 0.15 * stS + 0.15 * ms + 0.15 * ls));
  if (i.motion >= M.major) why.push('Major motion detected. Please remain still.');
  else if (i.motion > M.minor) why.push('Minor motion detected');
  if (lumS < 0.7) why.push(i.lum < L.lo ? 'Lighting too dark. Move to a brighter environment.' : 'Lighting too bright / overexposed');
  if (i.lightJump > L.jump) why.push('Sudden lighting change');
  if (i.fps < CFG.minFps) why.push('Camera FPS too low (' + i.fps.toFixed(0) + ')');
  if (i.cons.n < 2) why.push(i.cons.agreeN >= 2 ? `Methods agree near ${Math.round(i.cons.agreeBpm)} BPM (${i.cons.agreeN}/3) but the pulse SNR is below the trust gate - insufficient signal` : 'Algorithms disagree - measurement unreliable');
  if (sigS < 0.3) why.push('Weak pulse signal');
  if (i.range != null && i.range > CFG.stabBpm) why.push('Heart-rate estimates unstable');
  let state = score >= CFG.q.good ? 'GOOD' : score >= CFG.q.fair ? 'FAIR' : score >= CFG.q.poor ? 'POOR' : 'INVALID';
  if (i.motion >= M.major || i.cons.n < 2 || i.fps < CFG.minFps) state = 'INVALID';
  else if (i.range != null && i.range > CFG.stabBpm && (state === 'GOOD' || state === 'FAIR')) state = 'POOR';
  return { score, state, reasons: why, parts: { ms, ls, fpsS, sigS, agS, stS } };
}
function summarize(recs) {
  const ok = recs.filter(r => r && Number.isFinite(r.heart_rate) && Number.isFinite(r.timestamp));
  if (!ok.length) return null;
  const hr = ok.map(r => r.heart_rate), rr = ok.map(r => r.respiratory_rate).filter(Number.isFinite);
  return { n: ok.length, avgHr: mean(hr), minHr: Math.min(...hr), maxHr: Math.max(...hr),
           avgRr: rr.length ? mean(rr) : null, avgQ: mean(ok.map(r => r.signal_quality).filter(Number.isFinite)) };
}
// Validation statistics from paired (reference, vitalsense) values.
function agreementStats(pairs) {
  const p = pairs.filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b)); if (!p.length) return null;
  const e = p.map(([r, v]) => v - r), me = mean(e), sd = std(e);
  const rm = mean(p.map(x => x[0])), vm = mean(p.map(x => x[1]));
  const cov = mean(p.map(([r, v]) => (r - rm) * (v - vm))), sr = std(p.map(x => x[0])), sv = std(p.map(x => x[1]));
  return { n: p.length, mae: mean(e.map(Math.abs)), rmse: Math.sqrt(mean(e.map(v => v * v))), bias: me,
           loaLo: me - 1.96 * sd, loaHi: me + 1.96 * sd, r: p.length > 2 && sr * sv > 0 ? cov / (sr * sv) : null };
}
const api = { CFG, mean, std, clamp, resample, detrend, zscore, fft, bandpass, welch, spectralPeak, methods, consensus,
              estimateHR, fuseWeights, patchEstimate, patchQuality, respiratory, assess, summarize, agreementStats };
if (typeof module !== 'undefined') module.exports = api; else g.VS = api;
})(typeof window !== 'undefined' ? window : globalThis);
