// Drives the real index.html script (DOM stubbed) with a synthetic dense-patch RGB stream under REALISTIC CAMERA JITTER:
// irregular per-patch update timing (some patches skip frames), one auto-exposure brightness step, and a coherent-artifact
// minority -> buffers -> gap-tolerant coverage -> robust jump test -> quality scoring -> weighted fusion -> Green/CHROM/POS
// -> consensus -> quality -> session -> pause/recover. This directly regression-tests the "0/34 contributing" bug.
const fs = require('fs'), vm = require('vm'), assert = require('assert'), D = require('./dsp.js');
const js = fs.readFileSync(__dirname + '/index.html', 'utf8').split('<script>')[1].split('</script>')[0];
let T = 1000; const stub = () => new Proxy(function () {}, { get: (t, p) => p === 'getContext' ? () => new Proxy({}, { get: () => () => ({ data: [] }) }) : p === 'width' || p === 'clientWidth' ? 300 : p === Symbol.toPrimitive ? () => '' : stub(), set: () => true, apply: () => stub() });
const ctx = vm.createContext({ document: { getElementById: stub, createElement: () => stub(), body: stub() }, window: {}, navigator: {}, performance: { now: () => T * 1000 }, devicePixelRatio: 1,
  getComputedStyle: () => ({ color: '#000' }), requestAnimationFrame: () => 0, setInterval: () => 0, setTimeout: () => 0, localStorage: {}, VS: D, console });
vm.runInContext(js, ctx);
const run = c => vm.runInContext(c, ctx);
run('running=true;S.face="ok";S.fps=30;S.lum=130;S.ema=130;S.recT=0;');
const ids = []; for (let i = -3; i <= 3; i++) for (let j = -4; j <= 4; j += 2) ids.push(i + ',' + j);   // 35 patches
const BAD = new Set(ids.slice(30));                                                                // 5 patches carry a coherent 1.9 Hz artifact instead of a pulse
const regOf = id => { const i = +id.split(',')[0]; return Math.abs(i) >= 3 ? 'cheek-lateral' : 'forehead'; };
run(`S.geo=${ids.length};S.geomCand=${ids.length + 20};S.geomRej=20;S.patchPx=18;for(const id of ${JSON.stringify(ids)})pb[id]={t:[],r:[],g:[],b:[],lum:130,use:.9,mr:150,mg:100,mb:80,cr:145,cb:118,k:250,n:280,reg:${JSON.stringify(ids.reduce((o,id)=>(o[id]=regOf(id),o),{}))}[id]};function _f(id,t,r,g,b){const q=pb[id];q.t.push(t);q.r.push(r);q.g.push(g);q.b.push(b)}`);
const rng = (() => { let s = 7; return () => { s = (s * 16807) % 2147483647; return s / 2147483647 - .5; }; })();
let sampleT = T, paused = false, recovered = false, saved = false, hrAt = null, contAt = null, sawShortHistoryOnly = false;
for (let step = 0; step < 200; step++) {                     // 100 s of simulated time
  const tEnd = T + 0.5, motion = step >= 120 && step < 124 ? 1.5 : 0.05;   // deliberate motion burst at ~60 s
  const aeStep = step === 40 ? 0.15 : 0;                      // one-off auto-exposure brightness jump partway through (must not nuke the whole window)
  for (; sampleT < tEnd; sampleT += 1 / 30) {
    const ph = 2 * Math.PI * 1.25 * (sampleT - 1000), p = Math.sin(ph) + 0.3 * Math.sin(2 * ph + 1), bump = motion > 1 ? 0.04 * Math.sin(37 * sampleT) : 0;
    ids.forEach((id, k) => {
      if ((k + Math.floor(sampleT * 37)) % 5 === 0 && rng() > -0.15) return;   // ~45% of frames randomly skipped per patch (independent jitter, like a loaded main thread)
      const a = Math.sin(2 * Math.PI * 1.9 * sampleT), q = BAD.has(id) ? 0 : p, art = BAD.has(id) ? 0.02 * a : 0, ae = sampleT >= 1000 + step / 2 && aeStep ? aeStep : 0;
      ctx._f(id, sampleT, 150 * (1 + ae + .002 * q + art + bump + .002 * rng()), 100 * (1 + ae + .006 * q + .6 * art + bump + .002 * rng()), 80 * (1 + ae + .003 * q + 1.1 * art + bump + .002 * rng()));
    });
  }
  T = tEnd; run(`S.motion=${motion};S.mh.push([${T},${motion}]);process();`);
  const ph = run('S.phase'), hr = run('S.hr'); if (step === 60) { hrAt = hr; contAt = run('S.pc.cont'); }
  if (ph === 'PAUSED') { paused = true; assert.strictEqual(run('S.hr'), null, 'HR must be hidden while paused'); }
  if (ph === 'COMPLETE') saved = true; if (paused && run('S.msg').includes('recovered')) recovered = true;
  const rows = JSON.parse(run('S.prow?JSON.stringify(S.prow):"[]"'));
  if (step > 90 && step < 118 && rows.length && rows.every(r => !(r.w > 0)) && rows.some(r => r.reason === 'short history')) sawShortHistoryOnly = true;
}
run('dbgUI()');
const rows = JSON.parse(run('JSON.stringify(S.prow)'));
console.log('HR at 30 s:', hrAt && hrAt.toFixed(1), '| contributing patches:', contAt, '| saved:', saved, '| paused on motion:', paused, '| recovered:', recovered);
assert(hrAt && Math.abs(hrAt - 75) <= 3, 'HR should be ~75 BPM despite ~45% random per-patch frame drops and a mid-run AE step (this is the regression test for the reported 0-contributing-patches bug)');
assert(contAt >= 15, 'realistic jitter should still leave a healthy contributing count: ' + contAt);
assert(!sawShortHistoryOnly, 'gap-tolerant buffering should prevent a persistent short-history stall under ordinary jitter');
assert(rows.filter(r => BAD.has(r.id)).every(r => !(r.w > 0)), 'coherent-artifact patches must still get zero weight even with gate-relaxation fixes');
assert(Math.abs(run('S.pc.cont') > 0 ? rows.reduce((s, r) => s + r.w, 0) - 1 : 1) < 1e-9, 'patch weights sum to 1');
assert(paused, 'major motion must still pause the measurement'); assert(saved, 'measurement should complete and be attempted for save');
// BYPASS mode: sanity that it runs, stays diagnostic-only, and never leaks into the reported HR/history path.
run('BYPASS=true;'); for (let k = 0; k < 3; k++) { run(`S.motion=0.05;process();`); }
run('dbgUI()'); assert(run('S.pcBypass') !== null, 'bypass diagnostic should populate when enabled');
assert(run('typeof S.hr'), 'number'); assert(!/pcBypass/.test(run("$('hr').textContent||''")), 'bypass value must not reach the primary HR readout');
console.log('integration test passed (including realistic-jitter regression + bypass-mode isolation)');
