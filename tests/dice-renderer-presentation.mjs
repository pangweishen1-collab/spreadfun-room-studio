import assert from 'node:assert/strict';

const requests = [], managers = [], calls = [];
globalThis.Image = class {
  set src(value) { this._src = value; requests.push(this); }
  get src() { return this._src; }
};
globalThis.document = {hidden: false, addEventListener() {}, createElement() { return {listeners:{},addEventListener(type,listener){this.listeners[type]=listener;}}; }};
globalThis.requestAnimationFrame = () => {};
const context = {
  clearRect(...args) { calls.push(['clear', ...args]); },
  drawImage(image, ...args) { calls.push(['image', image.src || 'layer', ...args]); },
  createLinearGradient() { return {addColorStop() {}}; },
  beginPath() {}, roundRect() {}, fill() {}, arc() {}, moveTo() {}, lineTo() {}, closePath() {},
  strokeText(...args) { calls.push(['strokeText', ...args]); },
  fillText(...args) { calls.push(['fillText', ...args]); },
};
globalThis.spine = {
  ManagedWebGLRenderingContext: class { constructor() { this.gl = {viewport() {}, clearColor() {}, clear() {}}; } },
  SceneRenderer: class {
    constructor() { this.camera = {position: {set() {}}, update() {}}; }
    begin() {} end() {} drawSkeleton() {}
  },
  AssetManager: class {
    constructor() { this.disposed = false; managers.push(this); }
    loadBinary() {} loadTextureAtlas() {} async loadAll() {} hasErrors() { return false; }
    require() { return {}; } dispose() { this.disposed = true; }
  },
  AtlasAttachmentLoader: class {},
  SkeletonBinary: class {
    readSkeletonData() { return {findAnimation() { return {duration: .64, apply() {}}; }}; }
  },
  Skeleton: class { setToSetupPose() {} updateWorldTransform() {} },
  MixBlend: {replace: 1}, MixDirection: {mixIn: 1}, Physics: {update: 1},
};
const canvas = {getContext() { return context; }};
const green = '/dice/assets/ui/bg_绿.webp', purple = '/dice/assets/ui/bg_紫.webp';
const candidate = (id, grade = 'green', extra = {}) => ({
  id, version: 1, name: '仙人掌', template: 'green', previewGrade: grade,
  skel: 'template.skel', atlas: 'stable-atlas', texture: 'stable-texture', atlasPage: 'preview.png',
  png: {'大骰子': 'stable-hero'}, ...extra,
});
async function settle() { for (let index = 0; index < 5; index++) await Promise.resolve(); }
function imageRequest(src, from = 0) {
  const image = requests.slice(from).find(image => image.src === src && !image.settled);
  assert.ok(image, `Pending image request: ${src}`);
  return image;
}
function ready(src, from = 0) { const image = imageRequest(src, from); image.settled = true; image.onload(); }
function reject(src, from = 0) { const image = imageRequest(src, from); image.settled = true; image.onerror(); }
async function initialLoad(GameRenderer, from = 0) {
  const renderer = new GameRenderer(canvas);
  const load = renderer.load(candidate('initial'));
  ready(green, from); await settle(); ready('stable-hero', from);
  assert.equal(await load, true);
  return renderer;
}

const {GameRenderer,purplePresentationGain} = await import('../dice/renderer.js?presentation-test');
for(const [time,gain] of [[0,1],[.3,1],[.47,1],[.535,1.075],[.6,1.15],[1.9,1.15],[2.3,1]])
  assert.ok(Math.abs(purplePresentationGain(time)-gain)<1e-10,'Purple settles to its larger display size without enlarging the fast turn');
const renderer = await initialLoad(GameRenderer);
assert.equal(requests.filter(image => image.src === green).length, 1);
assert.equal(requests.filter(image => image.src === purple).length, 1, 'Both backgrounds are preloaded');
const originalAssets = renderer.assets, originalData = renderer.data, originalIcon = renderer.icon, originalSkeletons = renderer.skeletons;
Object.assign(renderer, {mode: 'continuous', target: 6, elapsed: .8, sequence: 3, playing: true, stopAfterRound: true, wasPlaying: true});
const before = calls.length, managerCount = managers.length;
const next = candidate('new-revision', 'purple', {version: 2, name: '草莓冰淇淋'});
const patch = renderer.patchPresentation(next);
await settle();
assert.equal(calls.length, before, 'No draw or blank canvas while the background is pending');
assert.equal(renderer.candidate.id, 'initial', 'Presentation commits only after its image is ready');
renderer.elapsed = 1.15; renderer.sequence = 4; // Playback can keep advancing while waiting.
ready(purple);
assert.equal(await patch, true);
assert.equal(renderer.candidate, next, 'Complete candidate identity/revision is replaced');
assert.equal(renderer.background.src, purple);
assert.equal(renderer.elapsed, 1.15); assert.equal(renderer.sequence, 4); assert.equal(renderer.playing, true);
assert.equal(renderer.target, 6); assert.equal(renderer.mode, 'continuous');
assert.equal(renderer.stopAfterRound, true); assert.equal(renderer.wasPlaying, true);
assert.equal(renderer.assets, originalAssets); assert.equal(renderer.data, originalData);
assert.equal(renderer.icon, originalIcon); assert.equal(renderer.skeletons, originalSkeletons);
assert.equal(managers.length, managerCount, 'Presentation changes do not reload a skeleton or atlas');
assert.deepEqual(calls.slice(before, before + 2).map(call => call.slice(0, 2)), [['clear', 0], ['image', purple]], 'The new background immediately follows the synchronous clear');
assert.deepEqual(calls.filter(call => call[0] === 'fillText').at(-1), ['fillText', '草莓冰淇淋', 412, 468, 232]);
assert.deepEqual(calls.filter(call => call[0] === 'strokeText').at(-1), ['strokeText', '草莓冰淇淋', 412, 468, 232]);
assert.ok(!calls.some(call => call[0] === 'fillText' && /等级/.test(call[1])), 'No grade subtitle is drawn');
const requestCount = requests.length;
assert.equal(await renderer.patchPresentation(candidate('name-only', 'purple', {version: 3, name: '居中标题'})), true);
assert.equal(requests.length, requestCount, 'Ready backgrounds are reused');
const older = renderer.patchPresentation(candidate('older', 'green'));
const newerCandidate = candidate('newer', 'purple');
const newer = renderer.patchPresentation(newerCandidate);
assert.deepEqual(await Promise.all([older, newer]), [false, true]);
assert.equal(renderer.candidate, newerCandidate, 'Late older updates cannot overwrite the latest presentation');
for (const key of ['skel','atlas','texture','atlasPage']) {
  assert.equal(await renderer.patchPresentation(candidate('different-assets', 'green', {[key]: 'different'})), false);
}
assert.equal(await renderer.patchPresentation(candidate('different-hero', 'green', {png: {'大骰子': 'different'}})), false);
renderer.recording = true;
assert.equal(await renderer.patchPresentation(candidate('during-recording', 'green')), false);
renderer.recording = false;
const clearing = renderer.patchPresentation(candidate('cleared', 'green'));
renderer.clear();
assert.equal(await clearing, false); assert.equal(renderer.candidate, null);
assert.equal(originalAssets.disposed, true);

// A failed preload remains retryable and does not remove the last complete frame.
const failureStart = requests.length;
const failureModule = await import('../dice/renderer.js?presentation-failure-test');
const retained = await initialLoad(failureModule.GameRenderer, failureStart);
const failedBefore = calls.length, oldCandidate = retained.candidate;
const failing = retained.patchPresentation(candidate('bad-background', 'purple'));
reject(purple, failureStart);
await assert.rejects(failing, /图片加载失败/);
assert.equal(retained.candidate, oldCandidate); assert.equal(calls.length, failedBefore);
const retry = retained.patchPresentation(candidate('retried', 'purple'));
ready(purple, failureStart);
assert.equal(await retry, true);

// A new full load invalidates any pending grade change for the previous assets.
const raceStart = requests.length;
const raceModule = await import('../dice/renderer.js?presentation-load-race-test');
const racing = await initialLoad(raceModule.GameRenderer, raceStart);
const stalePatch = racing.patchPresentation(candidate('stale-patch', 'purple'));
const fullCandidate = candidate('new-full-assets', 'green', {atlas: 'new-atlas', texture: 'new-texture', png: {'大骰子': 'new-hero'}});
const full = racing.load(fullCandidate);
await settle(); ready(purple, raceStart);
assert.equal(await stalePatch, false);
ready('new-hero', raceStart);
assert.equal(await full, true); assert.equal(racing.candidate, fullCandidate);

// A missing hero must not be replaced by a flat result face.
const noHeroStart=requests.length;
const noHero=new GameRenderer(canvas);
await noHero.load(candidate('without-hero','green',{icon:null,png:{sz_1:'flat-result-face'}}));
assert.equal(noHero.icon,null);
assert.ok(!requests.slice(noHeroStart).some(image=>image.src==='flat-result-face'));
noHero.clear();

// Context loss must keep generated purple/green animation on the same native
// geometry, while legacy template candidates retain their pause behavior.
for(const kind of ['six-face','purple-gyro']){
 let softwareCalls=0,prevented=false;
 retained.candidate={...retained.candidate,kind,geometry:{sourceSize:200,crop:[35,35,130,130],cropOffset:[0,0]}};
 retained.mode='all';retained.playing=true;retained.gpuLost=false;retained.software={draw(_ctx,skeleton,height){assert.equal(height,1600);assert.ok(skeleton.scaleX>0);softwareCalls++;}};
 retained.layer.listeners.webglcontextlost({preventDefault(){prevented=true;}});
 assert.equal(prevented,true);assert.equal(retained.gpuLost,true);assert.equal(retained.playing,true,kind+' must not pause when its Canvas fallback exists');
 retained.draw(.2283);assert.equal(softwareCalls,6,'All six generated faces draw through Canvas after GPU loss');
 for(const [grade,gain] of [['green',1],['purple',1.15]]){
  retained.candidate.previewGrade=grade;retained.draw(.6);
  assert.ok(retained.skeletons.every(s=>Math.abs(s.scaleX-.86*gain)<1e-10),'Both native backends use the grade presentation size');
 }
}
retained.candidate={...retained.candidate,kind:'template'};retained.playing=true;retained.layer.listeners.webglcontextlost({preventDefault(){}});assert.equal(retained.playing,false,'Legacy template cannot silently claim a software fallback');
console.log(JSON.stringify({passed: true, checks: ['preload/cache', 'no pending blank frame', 'playback continuity', 'no runtime reload', 'identity/revision commit', 'centered title', 'subtitle removed', 'latest update wins', 'asset mismatch', 'recording guard', 'clear/full-load races', 'failure/retry', 'native green/purple context loss retains six-face Canvas fallback']}));
