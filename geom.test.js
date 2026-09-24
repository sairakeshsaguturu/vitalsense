// Tests the anatomical patch layout end-to-end against FABRICATED landmarks (an ellipse standing in for a real face - this is a
// plumbing/regression test, not a claim about real Face Mesh output). Exercises geom() directly, then the real extract()/onResults()
// against a synthetic uniform-skin image, to catch the specific bug this turn is about: large("L")/medium("M") scale patches must
// land in SEPARATE buffers (pb / pbM) so the diagnostic "M" scale can never silently feed the production measurement.
const fs = require('fs'), vm = require('vm'), assert = require('assert'), D = require('./dsp.js');
const js = fs.readFileSync(__dirname + '/index.html', 'utf8').split('<script>')[1].split('</script>')[0];
function skinCtx() { return { drawImage(){}, clearRect(){}, fillRect(){}, strokeRect(){}, fillText(){}, beginPath(){}, moveTo(){}, lineTo(){}, stroke(){}, strokeStyle:'', fillStyle:'', lineWidth:1, font:'', globalAlpha:1,
  getImageData(x, y, w, h) { const n = Math.max(0, w) * Math.max(0, h) * 4, data = new Array(n);
    for (let i = 0; i < n; i += 4) { data[i] = 150; data[i + 1] = 108; data[i + 2] = 86; data[i + 3] = 255; } return { data }; } }; }
const stub = () => new Proxy(function () {}, { get: (t, p) => p === 'getContext' ? () => skinCtx() : p === 'width' || p === 'clientWidth' ? 300 : p === Symbol.toPrimitive ? () => '' : stub(), set: () => true, apply: () => stub() });
const elVideo = { videoWidth: 640, videoHeight: 480 };
const ctx = vm.createContext({ document: { getElementById: id => id === 'v' ? elVideo : stub(), createElement: () => stub(), body: stub() },
  window: {}, navigator: {}, performance: { now: () => 0 }, devicePixelRatio: 1, getComputedStyle: () => ({ color: '#000' }),
  requestAnimationFrame: () => 0, setInterval: () => 0, setTimeout: () => 0, localStorage: {}, VS: D, console });
vm.runInContext(js, ctx);
const run = c => vm.runInContext(c, ctx);

// Fabricate landmarks on a face-shaped ellipse (wider at cheeks, narrower at chin/forehead), with eyes/brows/lips/nose placed at
// anatomically plausible positions, similar in spirit to a real Face Mesh but NOT validated against one.
const W = 640, H = 480, cx0 = 320, cy0 = 240, lm = Array.from({ length: 468 }, () => ({ x: .5, y: .5 }));
const set = (i, x, y) => lm[i] = { x: x / W, y: y / H };
const OVAL = vm.runInContext('OVAL', ctx), EXCL = vm.runInContext('EXCL', ctx);
OVAL.forEach((id, k) => { const a = 2 * Math.PI * k / OVAL.length; set(id, cx0 + 105 * Math.cos(a), cy0 + 150 * Math.sin(a)); });
set(234, cx0 - 105, cy0); set(454, cx0 + 105, cy0); set(10, cx0, cy0 - 150); set(152, cx0, cy0 + 150);
const ring = (ids, x, y, rx, ry) => ids.forEach((id, k) => { const a = 2 * Math.PI * k / ids.length; set(id, x + rx * Math.cos(a), y + ry * Math.sin(a)); });
ring(EXCL.eyeR, cx0 - 45, cy0 - 34, 16, 7); ring(EXCL.eyeL, cx0 + 45, cy0 - 34, 16, 7);
ring(EXCL.browR, cx0 - 45, cy0 - 58, 20, 5); ring(EXCL.browL, cx0 + 45, cy0 - 58, 20, 5);
ring(EXCL.lips, cx0, cy0 + 75, 30, 12); ring(EXCL.nose, cx0, cy0 + 35, 14, 10);
set(105, cx0 - 45, cy0 - 60); set(334, cx0 + 45, cy0 - 60); set(1, cx0, cy0 + 30); set(2, cx0, cy0 + 45);

const geom = run('geom'); const gm = geom(lm, W, H);
const L = gm.patches.filter(p => p.scale === 'L'), M = gm.patches.filter(p => p.scale === 'M');
console.log('face width', gm.fw.toFixed(0), 'px | L patches', L.length, '| M patches', M.length, '| geom candidates', gm.cand, '| geom-rejected', gm.geomRej);
console.log('geomHist (by exclusion cause):', JSON.stringify(gm.geomHist));
console.log('region counts:', JSON.stringify(gm.regionCounts));
// This ellipse fixture is a crude stand-in for real Face Mesh proportions, so the lower bound here is intentionally below the
// ~25-40 target for a real camera - it only guards against a gross regression (e.g. a shrink/margin change wiping the layout out).
assert(L.length >= 10 && L.length <= 66, 'large-scale patch count sanity check: got ' + L.length);
assert(M.length > 0, 'medium-scale should also produce candidates');
// M is smaller than L at the same anchor, so it can survive containment where L doesn't (and vice versa near a tight boundary) -
// the two sets aren't required to match exactly, but most L survivors should have an M counterpart at the same anchor.
const Lset = new Set(L.map(p => p.id.slice(2))), Mset = new Set(M.map(p => p.id.slice(2)));
const overlap = [...Lset].filter(id => Mset.has(id)).length;
assert(overlap / Lset.size >= 0.5, 'expected most L anchors to have a same-position M patch, got ' + overlap + '/' + Lset.size);
// mouth/nose are deliberately not required here: the region layout (forehead/cheek-upper/cheek-mid/cheek-lateral) is laterally
// offset from the central face and never places candidates near the mouth or nose in the first place on this fixture - zero
// exclusions from those zones is a property of the region placement, not evidence the exclusion hulls are broken (eye/brow sit
// right where cheek-upper/forehead candidates are, so those firing IS a meaningful check).
for (const cause of ['eye', 'brow']) assert((gm.geomHist[cause] || 0) > 0, 'expected some ' + cause + '-caused exclusions on this face layout, got 0 (exclusion zone may be missing/broken)');
assert(L.filter(p => p.reg === 'forehead').length >= 4, 'forehead should keep a meaningful number of patches, not be wiped out');
for (const side of [-1, 1]) for (const reg of ['cheek-upper', 'cheek-mid']) assert(L.some(p => p.reg === reg && p.side === side), 'missing ' + reg + ' side ' + side);

// extract(): a uniform, well-lit synthetic skin image should leave every candidate patch with usable pixels (isolates the
// GEOMETRIC layout from image-quality gating, which is exercised separately in test.js's synthetic-signal tests).
const extract = run('extract'); const ps = extract(gm, W, H);
assert(ps.every(p => p.k > 0 && p.k === p.n), 'a uniform synthetic image should be 100% usable pixels per patch, got some k<n or k=0');
console.log('extract(): all', ps.length, 'candidate patches got usable pixels from the synthetic image');

// onResults(): drives the real per-frame pipeline. The critical regression check - L and M scale patches must land in SEPARATE
// buffers (pb vs pbM) so a smaller/noisier "M" patch can never be mistaken for a production "L" patch.
run('frameT=10.0;'); run(`onResults({multiFaceLandmarks:[${JSON.stringify(lm)}]})`);
const pbKeys = JSON.parse(run('JSON.stringify(Object.keys(pb))')), pbmExists = run('typeof pbM');
assert.strictEqual(pbmExists, 'object', 'pbM (medium-scale diagnostic buffer) must exist as a separate object from pb');
const pbmKeys = JSON.parse(run('JSON.stringify(Object.keys(pbM))'));
console.log('pb (production, L-scale only):', pbKeys.length, '| pbM (diagnostic, M-scale only):', pbmKeys.length);
assert(pbKeys.length > 0 && pbmKeys.length > 0, 'both buffers should have entries after one onResults() call');
assert(pbKeys.every(id => id.startsWith('L:')), 'pb must contain ONLY large-scale ("L:") patches - found a non-L id: ' + pbKeys.find(id => !id.startsWith('L:')));
assert(pbmKeys.every(id => id.startsWith('M:')), 'pbM must contain ONLY medium-scale ("M:") patches - found a non-M id: ' + pbmKeys.find(id => !id.startsWith('M:')));
const anchorsL = new Set(pbKeys.map(id => id.slice(2))), anchorsM = new Set(pbmKeys.map(id => id.slice(2)));
const anchorOverlap = [...anchorsL].filter(a => anchorsM.has(a)).length;
assert(anchorOverlap / anchorsL.size >= 0.5, 'most pb (L) anchors should have a pbM (M) counterpart at the same position: ' + anchorOverlap + '/' + anchorsL.size);
const geomHistStored = run('S.geomHist'), regionCountsStored = run('S.regionCounts');
assert(geomHistStored && Object.keys(geomHistStored).length > 0, 'S.geomHist should be populated for the debug panel after onResults()');
assert(regionCountsStored && Object.keys(regionCountsStored).length > 0, 'S.regionCounts should be populated for the debug panel after onResults()');
console.log('geom.test.js passed');
