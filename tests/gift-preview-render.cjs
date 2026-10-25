'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
require('node:vm').runInThisContext(fs.readFileSync(path.join(__dirname, '../gift-preview-render.js'), 'utf8'));
const renderer = globalThis.GiftPreviewRenderer;

function pixel(rgba, settings) {
  const data = Uint8ClampedArray.from(rgba);
  renderer.applyPixels(data, 1, 1, {mode: 'transparent', ...settings});
  return Array.from(data);
}

assert.deepEqual(pixel([210, 90, 25, 61], {}), [210, 90, 25, 61], 'neutral transparent mode preserves all channels');
assert.deepEqual(pixel([210, 90, 25, 61], {saturation: 0}), [111, 111, 111, 61], 'zero saturation uses equal gray channels');
assert.deepEqual(pixel([90, 100, 110, 127], {brightness: 150}), [135, 150, 165, 127], 'brightness multiplies RGB only');
assert.deepEqual(pixel([90, 100, 110, 127], {contrast: 0}), [128, 128, 128, 127], 'zero contrast yields midpoint gray');
assert.deepEqual(pixel([80, 128, 180, 255], {contrast: 200}), [33, 129, 233, 255], 'contrast pivots around the channel midpoint');
assert.deepEqual(pixel([90, 100, 110, 127], {brightness: 0}), [0, 0, 0, 127]);
assert.deepEqual(pixel([240, 200, 180, 0], {brightness: 200}), [255, 255, 255, 0], 'fully transparent pixels stay transparent');
const alphaSweep = new Uint8ClampedArray(16 * 16 * 4);
for (let alpha = 0; alpha <= 255; alpha++) alphaSweep.set([30, 120, 240, alpha], alpha * 4);
renderer.applyPixels(alphaSweep, 16, 16, {mode: 'transparent', saturation: 170, brightness: 130, contrast: 80, feather: 50, radius: 50});
for (let alpha = 0; alpha <= 255; alpha++) assert.equal(alphaSweep[alpha * 4 + 3], alpha, 'all source alpha values survive transparent-mode color edits');

const side = 200;
const featherSettings = {mode: 'feather', radius: 22, feather: 10};
const mask = renderer.createMask(side, featherSettings);
const at = (x, y) => mask[y * side + x];
assert.equal(at(100, 100), 255);
assert.equal(at(0, 0), 0);
assert.equal(at(0, 100), 0);
assert.ok(at(5, 100) > 0 && at(5, 100) < at(10, 100));
assert.ok(at(10, 100) < at(15, 100) && at(15, 100) < 255);
assert.equal(at(20, 100), 255);
for (let p = 0; p < side; p++) {
  assert.equal(at(p, 100), at(199 - p, 100), 'left and right feather symmetrically');
  assert.equal(at(100, p), at(100, 199 - p), 'top and bottom feather symmetrically');
  assert.equal(at(p, 100), at(100, p), 'all four feather edges match');
}
assert.ok(at(19, 19) > 60 && at(19, 19) < 160, 'rounded corner has a smooth partial alpha');
const opaqueMask = renderer.createMask(10, {mode: 'transparent', radius: 50, feather: 50});
assert.ok(opaqueMask.every(value => value === 255), 'transparent mode never masks source alpha');
const hardSquare = renderer.createMask(10, {mode: 'feather', radius: 0, feather: 0});
assert.ok(hardSquare.every(value => value === 255), 'zero feather and radius preserve a full square');
const doubleMask = renderer.createMask(400, featherSettings);
assert.ok(Math.abs(doubleMask[200 * 400 + 20] - at(10, 100)) <= 7, 'feather scales with output size');

const alphaFixture = new Uint8ClampedArray(side * side * 4);
for (let i = 0; i < alphaFixture.length; i += 4) alphaFixture.set([120, 180, 240, 128], i);
renderer.applyPixels(alphaFixture, side, side, featherSettings);
const cornerIndex = (19 * side + 19) * 4;
assert.deepEqual(Array.from(alphaFixture.slice(cornerIndex, cornerIndex + 3)), [120, 180, 240], 'feather never blends RGB with black or white');
assert.equal(alphaFixture[cornerIndex + 3], Math.min(128, at(19, 19)), 'mask caps source alpha without compounding softness');
assert.equal(alphaFixture[(100 * side + 100) * 4 + 3], 128, 'center source alpha is unchanged');
const featheredFixture = new Uint8ClampedArray(side * side * 4);
for (let i = 0; i < featheredFixture.length; i += 4) featheredFixture.set([120, 180, 240, mask[i / 4]], i);
const originalFeather = featheredFixture.slice();
renderer.applyPixels(featheredFixture, side, side, featherSettings);
assert.deepEqual(featheredFixture, originalFeather, 'matching existing feather is not applied twice');
for (let i = 3; i < featheredFixture.length; i += 4) featheredFixture[i] = Math.floor(featheredFixture[i] / 2);
const softerFeather = featheredFixture.slice();
renderer.applyPixels(featheredFixture, side, side, featherSettings);
assert.deepEqual(featheredFixture, softerFeather, 'more translucent existing edges are retained exactly');

function oldPlacement(width, height, output, settings) {
  const {x, y, width: placedWidth, height: placedHeight, scale} = renderer.getPlacement(width, height, output, settings);
  return {x, y, width: placedWidth, height: placedHeight, scale};
}
assert.deepEqual(oldPlacement(400, 200, 200, {mode: 'feather'}), {x: -100, y: 0, width: 400, height: 200, scale: 1}, 'landscape scene covers the output');
assert.deepEqual(oldPlacement(400, 200, 200, {mode: 'transparent'}), {x: 0, y: 50, width: 200, height: 100, scale: 0.5}, 'transparent artwork fits without cropping');
assert.deepEqual(oldPlacement(100, 200, 200, {mode: 'transparent', zoom: 2, offsetX: 0.1, offsetY: -0.2}), {x: 20, y: -140, width: 200, height: 400, scale: 2}, 'zoom and offsets stay centered and use output-relative coordinates');
assert.throws(() => renderer.getPlacement(0, 200, 200), RangeError);
assert.throws(() => renderer.applyPixels(new Uint8ClampedArray(16), 2, 1), RangeError);

function close(actual, expected, message) { assert.ok(Math.abs(actual - expected) < 1e-10, `${message}: ${actual} versus ${expected}`); }
for (const rotation of [-180, -90, -37, 0, 23, 90, 180]) {
  for (const flipX of [false, true]) for (const flipY of [false, true]) {
    for (const output of [200, 400, 2048]) {
      const settings = {mode: 'transparent', rotation, flipX, flipY, zoom: 1.7, offsetX: -0.17, offsetY: 0.24};
      for (const point of [{x: 0, y: 0}, {x: 1, y: 1}, {x: -0.2, y: 1.3}, {x: 0.43, y: 0.62}]) {
        const canvasPoint = renderer.toCanvasPoint(640, 320, output, settings, point);
        const sourcePoint = renderer.toSourcePoint(640, 320, output, settings, canvasPoint);
        close(sourcePoint.x, point.x, 'inverse transform retains source x');
        close(sourcePoint.y, point.y, 'inverse transform retains source y');
      }
    }
  }
  for (const point of [{x: 0, y: 0}, {x: 1, y: 0}, {x: 0, y: 1}, {x: 1, y: 1}]) {
    const fitted = renderer.toCanvasPoint(640, 320, 200, {mode: 'transparent', rotation}, point);
    assert.ok(fitted.x >= -1e-10 && fitted.x <= 1 + 1e-10 && fitted.y >= -1e-10 && fitted.y <= 1 + 1e-10, 'rotated non-square artwork stays contained');
  }
}
assert.deepEqual(renderer.toCanvasPoint(200, 200, 200, {mode: 'transparent', rotation: 90}, {x: 1, y: 0.5}), {x: 0.5, y: 1}, 'positive rotation is clockwise');
assert.deepEqual(renderer.toCanvasPoint(200, 200, 200, {mode: 'transparent', flipX: true}, {x: 1, y: 0.5}), {x: 0, y: 0.5}, 'horizontal flip mirrors the source');
assert.deepEqual(renderer.toCanvasPoint(200, 200, 200, {mode: 'transparent', flipY: true}, {x: 0.5, y: 1}), {x: 0.5, y: 0}, 'vertical flip mirrors the source');
const rotatedPoint = renderer.toCanvasPoint(400, 200, 200, {mode: 'transparent', rotation: 90}, {x: 0.25, y: 0.2});
const horizontallyFlippedPoint = renderer.toCanvasPoint(400, 200, 200, {mode: 'transparent', rotation: 90, flipX: true}, {x: 0.25, y: 0.2});
close(horizontallyFlippedPoint.x, 1 - rotatedPoint.x, 'horizontal flip after rotation mirrors the canvas x');
close(horizontallyFlippedPoint.y, rotatedPoint.y, 'horizontal flip after rotation preserves the canvas y');

const eraseStroke = {mode: 'erase', size: 0.2, hardness: 1, opacity: 1, points: [{x: 0.5, y: 0.5}]};
function brush(strokes, extra = {}, sourceWidth = 200, sourceHeight = 200, output = 200) {
  return renderer.createBrushMask(sourceWidth, sourceHeight, output, {mode: 'transparent', strokes, ...extra});
}
const brushAt = (data, x, y, output = 200) => data[y * output + x];
const erased = brush([eraseStroke]);
assert.equal(brushAt(erased, 100, 100), 0, 'hard brush fully erases its center');
assert.equal(brushAt(erased, 140, 100), 255, 'brush does not affect outside pixels');
const softBrush = brush([{...eraseStroke, hardness: 0}]);
assert.ok(brushAt(softBrush, 105, 100) < brushAt(softBrush, 110, 100) && brushAt(softBrush, 110, 100) < brushAt(softBrush, 115, 100), 'soft brush fades continuously from center to boundary');
assert.equal(renderer.brushCoverage(0, 20, 0), 1);
assert.equal(renderer.brushCoverage(21, 20, 1), 0);
assert.equal(renderer.brushCoverage(0, 0, 1), 0);
const halfErase = {...eraseStroke, opacity: 0.5};
assert.equal(brushAt(brush([halfErase]), 100, 100), 128, 'stroke opacity controls alpha once');
assert.deepEqual(brush([{...halfErase, points: [...halfErase.points, ...halfErase.points, ...halfErase.points]}]), brush([halfErase]), 'sampling the same point repeatedly within a stroke does not compound opacity');
assert.equal(brushAt(brush([halfErase, halfErase]), 100, 100), 64, 'separate strokes deliberately accumulate');
assert.equal(brushAt(brush([halfErase, {...eraseStroke, mode: 'restore', opacity: 0.5}]), 100, 100), 192, 'partial restore restores part of the erased mask');
assert.equal(brushAt(brush([eraseStroke, {...eraseStroke, mode: 'restore'}]), 100, 100), 255, 'restore fully recovers the hard brush center');
assert.ok(brush([eraseStroke, {...eraseStroke, mode: 'restore', size: 0.3}]).every(alpha => alpha === 255), 'restore can fully recover the undamaged source mask');
const alphaOnlyPixels = new Uint8ClampedArray(200 * 200 * 4);
for (let index = 0; index < 200 * 200; index++) alphaOnlyPixels.set([120, 80, 40, index === 20100 ? 0 : 61], index * 4);
const originalBrushPixels = alphaOnlyPixels.slice();
renderer.applyBrushMask(alphaOnlyPixels, brush([halfErase]));
for (let index = 0; index < 200 * 200; index++) {
  assert.deepEqual(alphaOnlyPixels.slice(index * 4, index * 4 + 3), originalBrushPixels.slice(index * 4, index * 4 + 3), 'brush does not alter RGB');
  assert.ok(alphaOnlyPixels[index * 4 + 3] <= originalBrushPixels[index * 4 + 3], 'brush never introduces source opacity');
}
const restoredPixels = originalBrushPixels.slice();
renderer.applyBrushMask(restoredPixels, brush([eraseStroke, {...eraseStroke, mode: 'restore', size: 0.3}]));
assert.deepEqual(restoredPixels, originalBrushPixels, 'restoring after erase preserves original transparent pixels and partial source alpha');
assert.throws(() => renderer.applyBrushMask(new Uint8ClampedArray(8), new Uint8ClampedArray(1)), RangeError);
const continuous = {...eraseStroke, size: 0.08, points: [{x: 0.2, y: 0.5}, {x: 0.8, y: 0.5}]};
assert.equal(brushAt(brush([continuous]), 100, 100), 0, 'a sampled segment paints continuously between pointer events');
assert.equal(brushAt(brush([{...continuous, points: [{x: 0.2, y: 0.5}, {x: 0.8, y: 0.5, break: true}]}]), 100, 100), 255, 'a break keeps separated stamps unconnected');
assert.ok(brush([{...eraseStroke, points: [{x: -0.4, y: -0.4}]}]).every(alpha => alpha === 255), 'brush completely outside the image does not affect pixels');
assert.ok(brush([{...eraseStroke, size: 0}, {...eraseStroke, opacity: 0}, {mode: 'unknown', points: []}]).every(alpha => alpha === 255), 'disabled and malformed strokes have no effect');
const sourceMark = {...eraseStroke, points: [{x: 0.2, y: 0.7}], size: 0.12};
const transformedSettings = {rotation: 67, flipX: true, flipY: true, zoom: 1.3, offsetX: 0.08, offsetY: -0.03};
const transformedMark = brush([sourceMark], transformedSettings);
const expectedMark = renderer.toCanvasPoint(200, 200, 200, {mode: 'transparent', ...transformedSettings}, sourceMark.points[0]);
assert.equal(brushAt(transformedMark, Math.floor(expectedMark.x * 200), Math.floor(expectedMark.y * 200)), 0, 'brush follows transformed source coordinates');
const doubledBrush = brush([sourceMark], {}, 200, 200, 400);
assert.equal(brushAt(doubledBrush, 80, 280, 400), 0, 'brush scales with the requested output size');
assert.equal(brushAt(doubledBrush, 112, 280, 400), 255);
assert.equal(brush([sourceMark], {}, 8000, 5000, 200).length, 40000, 'large source images still allocate only output-sized masks');

// Neural alpha is a source-space starting mask that manual erase/restore can refine.
const initialAlpha = {width: 4, height: 4, data: Uint8ClampedArray.from({length: 16}, (_, index) => index * 17)};
assert.deepEqual(brush([], {baseMask: initialAlpha}, 4, 4, 4), initialAlpha.data, 'initial model alpha is preserved at matching pixel centers');
const initialAlphaCopy = initialAlpha.data.slice();
const uniformAI = {width: 2, height: 2, data: new Uint8ClampedArray(4).fill(128)};
assert.equal(brushAt(brush([], {baseMask: uniformAI}), 100, 100), 128, 'partial model alpha is kept as the starting value');
assert.equal(brushAt(brush([eraseStroke], {baseMask: uniformAI}), 100, 100), 0, 'erase can remove pixels retained by the model');
assert.equal(brushAt(brush([{...eraseStroke, mode: 'restore', opacity: .5}], {baseMask: uniformAI}), 100, 100), 192, 'partial restore interpolates from the AI mask toward original alpha');
const missedAI = {width: 2, height: 2, data: new Uint8ClampedArray(4)};
const repairedAI = brush([{...eraseStroke, mode: 'restore'}], {baseMask: missedAI});
assert.equal(brushAt(repairedAI, 100, 100), 255, 'restore recovers a detail that the model removed');
assert.equal(brushAt(repairedAI, 140, 100), 0, 'restoring a detail leaves unpainted model background removed');
const originalAIAlpha = new Uint8ClampedArray(200 * 200 * 4);
for (let index = 0; index < 200 * 200; index++) originalAIAlpha.set([90, 130, 180, index === 20100 ? 0 : 61], index * 4);
renderer.applyBrushMask(originalAIAlpha, repairedAI);
assert.equal(originalAIAlpha[20100 * 4 + 3], 0, 'restoring AI pixels never fills an original transparent hole');
assert.equal(originalAIAlpha[20099 * 4 + 3], 61, 'restoring AI pixels remains capped by original source opacity');
assert.deepEqual(initialAlpha.data, initialAlphaCopy, 'mask generation never mutates the immutable AI result');
for (const badMask of [{width: 0, height: 2, data: []}, {width: 2049, height: 1, data: new Uint8ClampedArray(2049)}, {width: 2, height: 2, data: new Uint8ClampedArray(3)}]) {
  assert.throws(() => brush([], {baseMask: badMask}), RangeError, 'invalid source masks are rejected');
}
const sourceAI = {width: 4, height: 2, data: Uint8ClampedArray.from([10, 20, 30, 40, 50, 60, 70, 80])};
assert.deepEqual(Array.from(brush([], {baseMask: sourceAI}, 4, 2, 4)), [0,0,0,0, 10,20,30,40, 50,60,70,80, 0,0,0,0], 'a non-square AI mask shares the contained source bounds');
assert.deepEqual(Array.from(brush([], {baseMask: sourceAI, rotation: 90}, 4, 2, 4)), [0,50,10,0, 0,60,20,0, 0,70,30,0, 0,80,40,0], 'AI alpha follows the same clockwise source rotation');
assert.deepEqual(Array.from(brush([], {baseMask: sourceAI, rotation: 90, flipX: true}, 4, 2, 4)), [0,10,50,0, 0,20,60,0, 0,30,70,0, 0,40,80,0], 'AI alpha mirrors on the visible horizontal axis after rotation');
assert.deepEqual(Array.from(brush([], {baseMask: sourceAI, rotation: 90, flipY: true}, 4, 2, 4)), [0,80,40,0, 0,70,30,0, 0,60,20,0, 0,50,10,0], 'AI alpha mirrors on the visible vertical axis after rotation');

// Unmatting recovers straight RGB before the alpha mask is composited on black.
const blackRGB = Uint8ClampedArray.from([255,120,30,255, 32,64,16,255, 1,2,1,255, 0,1,0,255, 0,0,0,255]);
const blackAlpha = Uint8ClampedArray.from([255,64,2,1,0]);
const recoveredRGB = blackRGB.slice();
assert.equal(renderer.recoverBlackPixels(recoveredRGB, blackAlpha), recoveredRGB, 'black recovery returns the same pixel buffer');
assert.deepEqual(Array.from(recoveredRGB.filter((_, index) => index % 4 === 3)), [255,255,255,255,255], 'black recovery leaves original source alpha untouched');
assert.deepEqual(Array.from(recoveredRGB.slice(8, 15)), [128,255,128,255,0,255,0], 'faint light and one-level particles retain their color');
renderer.applyBrushMask(recoveredRGB, blackAlpha);
for (let index = 0; index < blackAlpha.length; index++) for (let channel = 0; channel < 3; channel++) {
  assert.ok(Math.abs(recoveredRGB[index * 4 + channel] * recoveredRGB[index * 4 + 3] / 255 - blackRGB[index * 4 + channel]) <= 0.51, 'recompositing recovered light on black reproduces original RGB within quantization');
}
const zeroMaskRGB = Uint8ClampedArray.from([10,20,30,61]);
renderer.recoverBlackPixels(zeroMaskRGB, Uint8ClampedArray.of(0));
assert.deepEqual(Array.from(zeroMaskRGB), [0,0,0,61], 'zero base and edited alpha clears hidden RGB without changing source alpha');
const clippedRecoveryRGB = Uint8ClampedArray.from([200,100,25,61]);
renderer.recoverBlackPixels(clippedRecoveryRGB, Uint8ClampedArray.of(64));
assert.deepEqual(Array.from(clippedRecoveryRGB), [255,255,100,61], 'recovered RGB is clamped to valid channel values');
const erasedLightRGB = Uint8ClampedArray.from([128,64,32,61]);
renderer.recoverBlackPixels(erasedLightRGB, Uint8ClampedArray.of(128), Uint8ClampedArray.of(64));
assert.deepEqual(Array.from(erasedLightRGB), [255,128,64,61], 'erasing uses original matte alpha so light color is not amplified a second time');
const restoredLightRGB = Uint8ClampedArray.from([128,64,32,61]);
renderer.recoverBlackPixels(restoredLightRGB, Uint8ClampedArray.of(128), Uint8ClampedArray.of(192));
assert.deepEqual(Array.from(restoredLightRGB), [170,85,43,61], 'restoring uses the larger edited alpha while preserving source alpha');
const restoredMissedRGB = Uint8ClampedArray.from([12,3,1,61]);
renderer.recoverBlackPixels(restoredMissedRGB, Uint8ClampedArray.of(0), Uint8ClampedArray.of(255));
assert.deepEqual(Array.from(restoredMissedRGB), [12,3,1,61], 'restore can recover original RGB even when the base matte removed the pixel');

// A quality matte already contains straight, decontaminated RGBA. Erasing fades
// that alpha without recovering RGB again; restoring adds only the newly
// revealed original pixels, leaving the existing cutout contribution intact.
const retouchOriginal = Uint8ClampedArray.from([120,60,30,255]);
const retouchOriginalBefore = retouchOriginal.slice();
const cleanCutout = Uint8ClampedArray.from([240,120,60,128]);
const eraseTarget = Uint8ClampedArray.of(64);
assert.equal(renderer.retouchForeground(cleanCutout, retouchOriginal, eraseTarget), cleanCutout,
  'foreground retouch returns its edited pixel buffer');
assert.deepEqual(Array.from(cleanCutout), [240,120,60,64], 'erase preserves decontaminated RGB and changes alpha only');
assert.deepEqual(Array.from(eraseTarget), [64], 'retouch does not mutate the brush target');
const restoredCutout = Uint8ClampedArray.from([240,120,60,128]);
renderer.retouchForeground(restoredCutout, retouchOriginal, Uint8ClampedArray.of(192));
assert.deepEqual(Array.from(restoredCutout), [200,100,50,192], 'partial restore mixes existing straight colour with only the original alpha increment');
for (let channel = 0; channel < 3; channel++) {
  close(restoredCutout[channel] * restoredCutout[3],
    [240,120,60][channel] * 128 + retouchOriginal[channel] * 64,
    'restore preserves the previous premultiplied cutout contribution');
}
const whollyRemoved = Uint8ClampedArray.from([99,88,77,0]);
renderer.retouchForeground(whollyRemoved, retouchOriginal, Uint8ClampedArray.of(128));
assert.deepEqual(Array.from(whollyRemoved), [120,60,30,128], 'a zero-alpha cutout can recover original colour on restore');
const fullyRestored = Uint8ClampedArray.from([0,0,0,0]);
renderer.retouchForeground(fullyRestored, retouchOriginal, Uint8ClampedArray.of(255));
assert.deepEqual(fullyRestored, retouchOriginal, 'full restore from zero alpha reproduces the original RGBA');
const zeroTarget = Uint8ClampedArray.from([240,120,60,128]);
renderer.retouchForeground(zeroTarget, retouchOriginal, Uint8ClampedArray.of(0));
assert.deepEqual(Array.from(zeroTarget), [240,120,60,0], 'full erase does not divide by zero or change hidden colour');
const untouchedCutout = Uint8ClampedArray.from([240,120,60,128]);
renderer.retouchForeground(untouchedCutout, retouchOriginal, Uint8ClampedArray.of(128));
assert.deepEqual(Array.from(untouchedCutout), [240,120,60,128], 'an unchanged mask is a no-op');
assert.deepEqual(retouchOriginal, retouchOriginalBefore, 'restoring never changes the saved original pixels');
assert.throws(() => renderer.retouchForeground(new Uint8ClampedArray(3), retouchOriginal, Uint8ClampedArray.of(128)), RangeError);
assert.throws(() => renderer.retouchForeground(new Uint8ClampedArray(4), new Uint8ClampedArray(8), Uint8ClampedArray.of(128)), RangeError);
assert.throws(() => renderer.retouchForeground(new Uint8ClampedArray(4), retouchOriginal, new Uint8ClampedArray(2)), RangeError);

const calls = [];
const canvasPixels = Uint8ClampedArray.from([210, 90, 25, 128]);
const context = {
  save() { calls.push('save'); }, restore() { calls.push('restore'); },
  setTransform(...args) { calls.push(['transform', ...args]); },
  clearRect(...args) { calls.push(['clear', ...args]); },
  drawImage(image, ...args) { calls.push(['draw', ...args]); },
  getImageData() { calls.push('readPixels'); return {data: canvasPixels}; },
  putImageData(pixels, ...args) { calls.push(['pixels', ...args]); }
};
const canvas = {width: 1, height: 1, getContext(type) { assert.equal(type, '2d'); return context; }};
renderer.render(canvas, {naturalWidth: 2, naturalHeight: 1}, {mode: 'transparent', saturation: 0});
assert.equal(canvas.width, 1);
assert.equal(canvas.height, 1);
assert.deepEqual(canvasPixels, Uint8ClampedArray.from([111, 111, 111, 128]));
assert.deepEqual(calls.find(call => Array.isArray(call) && call[0] === 'draw'), ['draw', 0, 0.25, 1, 0.5]);
assert.deepEqual(calls.at(-1), ['pixels', 0, 0]);
calls.length = 0;
renderer.render(canvas, {naturalWidth: 2, naturalHeight: 1}, {mode: 'transparent'});
assert.ok(!calls.includes('readPixels'), 'neutral transparent artwork draws directly without a redundant pixel round trip');
calls.length = 0;
renderer.render(canvas, {naturalWidth: 2, naturalHeight: 1}, {mode: 'transparent', rotation: 90, flipX: true});
assert.ok(!calls.includes('readPixels'), 'rotation and flips keep the neutral transparent fast path');
assert.deepEqual(calls.filter(call => Array.isArray(call) && call[0] === 'transform').at(-1), ['transform', -0, 1, 1, 0, 0.5, 0.5], 'draw transform applies rotation then canvas-horizontal reflection around the center');
calls.length = 0;
canvasPixels.set([210, 90, 25, 128]);
renderer.render(canvas, {naturalWidth: 1, naturalHeight: 1}, {mode: 'transparent', baseMask: {width: 1, height: 1, data: Uint8ClampedArray.of(128)}});
assert.ok(calls.includes('readPixels'), 'an AI mask leaves the neutral no-mask fast path');
assert.deepEqual(Array.from(canvasPixels), [210, 90, 25, 64], 'render combines AI alpha with original alpha and keeps RGB unchanged');
calls.length = 0;
canvasPixels.set([128, 64, 32, 255]);
const blackMask = {width: 1, height: 1, data: Uint8ClampedArray.of(128), recoverBlack: true};
renderer.render(canvas, {width: 1, height: 1}, {mode: 'transparent', baseMask: blackMask});
assert.deepEqual(Array.from(canvasPixels), [255,128,64,128], 'render removes black matte before applying its alpha');
const originalGlow = canvasPixels.slice();
canvasPixels.set([128, 64, 32, 255]);
renderer.render(canvas, {width: 1, height: 1}, {mode: 'transparent', baseMask: {...blackMask, recoverBlack: false}});
assert.deepEqual(Array.from(canvasPixels), [128,64,32,128], 'explicitly disabled black recovery retains ordinary alpha-mask RGB semantics');
canvasPixels.set([128, 64, 32, 255]);
renderer.render(canvas, {width: 1, height: 1}, {mode: 'transparent', baseMask: blackMask, strokes: [{...halfErase, size: 1}]});
assert.deepEqual(Array.from(canvasPixels), [255,128,64,64], 'brush erase fades light alpha while retaining recovered color');
for (let channel = 0; channel < 3; channel++) {
  close(canvasPixels[channel] * canvasPixels[3] / 255, originalGlow[channel] * originalGlow[3] / 255 / 2, 'half erase halves the light contribution on black');
}
canvasPixels.set([128, 64, 32, 255]);
renderer.render(canvas, {width: 1, height: 1}, {mode: 'transparent', baseMask: blackMask, strokes: [{...halfErase, mode: 'restore', size: 1}]});
assert.deepEqual(Array.from(canvasPixels), [170,85,43,192], 'partial restore adjusts recovered RGB for the increased alpha');
for (let channel = 0; channel < 3; channel++) {
  assert.ok(Math.abs(canvasPixels[channel] * canvasPixels[3] / 255 - [128,64,32][channel]) <= 0.51, 'partial restore retains the original black-background light color');
}
canvasPixels.set([128, 64, 32, 255]);
renderer.render(canvas, {width: 1, height: 1}, {mode: 'transparent', baseMask: blackMask, strokes: [{...eraseStroke, size: 1}, {...eraseStroke, mode: 'restore', size: 1}]});
assert.deepEqual(Array.from(canvasPixels), [128,64,32,255], 'full restore reproduces original black-background RGB');
for (const sourceAlpha of [0,61,128]) {
  canvasPixels.set([128,64,32,sourceAlpha]);
  renderer.render(canvas, {width: 1, height: 1}, {mode: 'transparent', baseMask: blackMask, strokes: [{...eraseStroke, mode: 'restore', size: 1}]});
  assert.equal(canvasPixels[3], sourceAlpha, 'black recovery and full restore stay capped by original source opacity');
}
canvasPixels.set([128,64,32,255]);
renderer.render(canvas, {width: 1, height: 1}, {mode: 'transparent', brightness: 50, baseMask: blackMask});
assert.deepEqual(Array.from(canvasPixels), [128,64,32,128], 'color adjustments run after black recovery');
calls.length = 0;
canvasPixels.set([210, 90, 25, 128]);
renderer.render(canvas, {naturalWidth: 1, naturalHeight: 1}, {mode: 'transparent', strokes: [{...eraseStroke, size: 1}]});
assert.ok(calls.includes('readPixels'), 'brush render reads source pixels once to preserve source alpha');
assert.equal(canvasPixels[3], 0);
assert.throws(() => renderer.render({...canvas, height: 2}, {width: 1, height: 1}), RangeError);

for (const fixture of [
  {sourceWidth: 4, sourceHeight: 2, baseMask: {...sourceAI, recoverBlack: true}, rotation: 90, alpha: [0,50,10,0, 0,60,20,0, 0,70,30,0, 0,80,40,0]},
  {sourceWidth: 2, sourceHeight: 1, baseMask: {width: 2, height: 1, data: Uint8ClampedArray.of(32,128), recoverBlack: true}, alpha: [0,0,0,0, 32,56,104,128, 32,56,104,128, 0,0,0,0]}
]) {
  const fixturePixels = new Uint8ClampedArray(4 * 4 * 4);
  fixture.alpha.forEach((alpha, index) => fixturePixels.set([alpha,0,0,255], index * 4));
  const fixtureContext = {...context, getImageData() { return {data: fixturePixels}; }, putImageData() {}};
  renderer.render({width: 4, height: 4, getContext() { return fixtureContext; }}, {width: fixture.sourceWidth, height: fixture.sourceHeight}, {mode: 'transparent', baseMask: fixture.baseMask, rotation: fixture.rotation});
  fixture.alpha.forEach((alpha, index) => {
    assert.deepEqual(Array.from(fixturePixels.slice(index * 4, index * 4 + 4)), [alpha ? 255 : 0,0,0,alpha], 'black recovery uses the rotated or interpolated output alpha plane');
  });
}

// Compare cached interactive renders against a fresh mask through editing history.
let renderPixels;
const cacheContext = {
  save() {}, restore() {}, setTransform() {}, clearRect() {},
  drawImage() {
    renderPixels = new Uint8ClampedArray(cacheCanvas.width * cacheCanvas.height * 4);
    for (let index = 0; index < renderPixels.length; index += 4) renderPixels.set([90, 130, 180, (index / 4) % 256], index);
  },
  getImageData() { return {data: renderPixels}; }, putImageData() {}
};
const cacheCanvas = {width: 70, height: 70, getContext() { return cacheContext; }};
const cacheSettings = {mode: 'transparent', strokes: [{...halfErase, points: [{x: 0.2, y: 0.4}]}]};
function checkCachedRender() {
  renderer.render(cacheCanvas, {width: 200, height: 100}, cacheSettings);
  const freshMask = renderer.createBrushMask(200, 100, cacheCanvas.width, cacheSettings);
  const edgeMask = cacheSettings.mode === 'feather' ? renderer.createMask(cacheCanvas.width, cacheSettings) : null;
  for (let index = 0; index < freshMask.length; index++) {
    const sourceAlpha = edgeMask ? Math.min(index % 256, edgeMask[index]) : index % 256;
    assert.equal(renderPixels[index * 4 + 3], Math.round(sourceAlpha * freshMask[index] / 255), 'interactive cache matches a freshly recomputed mask');
  }
}
checkCachedRender();
cacheSettings.strokes[0].points.push({x: 0.6, y: 0.6}); checkCachedRender();
cacheSettings.strokes.push({...eraseStroke, points: [{x: 0.7, y: 0.5}]}); checkCachedRender();
cacheSettings.strokes[1].points.push({x: 0.3, y: 0.5}); checkCachedRender();
const undoneStroke = cacheSettings.strokes.pop(); checkCachedRender();
cacheSettings.strokes.push(undoneStroke); checkCachedRender();
cacheSettings.strokes[0].opacity = 0.23; checkCachedRender();
cacheSettings.strokes[1].size = 0.3; checkCachedRender();
cacheSettings.rotation = 35; cacheSettings.flipX = true; checkCachedRender();
cacheSettings.zoom = 2.4; cacheSettings.offsetX = -0.18; checkCachedRender();
cacheSettings.saturation = 0; cacheSettings.brightness = 130; checkCachedRender();
cacheCanvas.width = cacheCanvas.height = 80; checkCachedRender();
cacheSettings.mode = 'feather'; checkCachedRender();
cacheSettings.strokes = []; checkCachedRender();
cacheSettings.strokes.push(undoneStroke); checkCachedRender();
cacheSettings.baseMask = uniformAI; checkCachedRender();
cacheSettings.baseMask = {width: 2, height: 2, data: new Uint8ClampedArray(4).fill(192)}; checkCachedRender();
cacheSettings.baseMask = missedAI; checkCachedRender();
cacheSettings.strokes.push({...eraseStroke, mode: 'restore'}); checkCachedRender();
cacheSettings.baseMask = uniformAI; checkCachedRender();
cacheSettings.baseMask = null; checkCachedRender();
cacheSettings.strokes = []; cacheSettings.mode = 'transparent'; cacheSettings.saturation = 100; cacheSettings.brightness = 100;
let reads = 0;
const readPixels = cacheContext.getImageData;
cacheContext.getImageData = function () { reads++; return readPixels.call(this); };
renderer.render(cacheCanvas, {width: 200, height: 100}, cacheSettings);
assert.equal(reads, 0, 'removing the AI mask and strokes restores the neutral transparent fast path');

console.log('gift-preview-render: color, alpha, feather, canvas-axis transforms, black-light recovery, AI source alpha/refinement, immutable mask/cache changes, erase/restore and neutral fast-path checks passed');
