'use strict';
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const root = path.resolve(__dirname, '..');
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

function image(width, height, colour = [255, 0, 128]) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < width * height; index++) data.set([...colour, 255], index * 4);
  return {width, height, data};
}
function approximately(actual, expected, note) { assert.ok(Math.abs(actual - expected) < 1e-6, note); }

async function tests() {
  const {preprocess, restoreAlpha} = await import(pathToFileURL(path.join(root, 'gift-matting-refine.mjs')));
  const tiny = image(3, 2), trimap = Uint8ClampedArray.from([0, 128, 255, 127, 0, 255]);
  tiny.data[3] = 0;
  const sourceBefore = tiny.data.slice(), trimapBefore = trimap.slice();
  const prepared = preprocess(tiny, trimap), plane = 32 * 32;
  assert.deepEqual(prepared.dims, [1, 4, 32, 32]);
  assert.equal(prepared.scaledWidth, 3); assert.equal(prepared.scaledHeight, 2);
  assert.equal(prepared.paddedWidth, 32); assert.equal(prepared.paddedHeight, 32);
  assert.ok(prepared.data instanceof Float32Array); assert.equal(prepared.data.length, plane * 4);
  approximately(prepared.data[0], 1, 'red byte 255 normalizes to 1');
  approximately(prepared.data[plane], -1, 'green byte 0 normalizes to -1');
  approximately(prepared.data[plane * 2], 128 / 127.5 - 1, 'RGB uses the upstream [-1, 1] normalization');
  approximately(prepared.data[plane * 3 + 1], 128 / 255, 'unknown trimap remains an unnormalized fourth channel');
  approximately(prepared.data[plane * 3 + 32], 127 / 255, 'both conventional unknown labels are supported');
  assert.equal(prepared.data[plane * 3 + 2], 1);
  for (let channel = 0; channel < 4; channel++) {
    assert.equal(prepared.data[channel * plane + 3], 0, 'right padding is zero after normalization');
    assert.equal(prepared.data[channel * plane + 64], 0, 'bottom padding is zero after normalization');
  }
  assert.deepEqual(tiny.data, sourceBefore); assert.deepEqual(trimap, trimapBefore);

  for (const [width, height, scaledWidth, scaledHeight, paddedWidth, paddedHeight] of [
    [1000, 2000, 256, 512, 256, 512],
    [1000, 333, 512, 170, 512, 192],
    [31, 37, 31, 37, 32, 64],
  ]) {
    const input = image(width, height), labels = new Uint8ClampedArray(width * height).fill(128);
    const result = preprocess(input, labels);
    assert.deepEqual([result.scaledWidth, result.scaledHeight, result.paddedWidth, result.paddedHeight],
      [scaledWidth, scaledHeight, paddedWidth, paddedHeight], 'keep aspect ratio, never upscale small images, and pad each dimension to 32');
    assert.deepEqual(result.dims, [1, 4, paddedHeight, paddedWidth]);
  }
  assert.throws(() => preprocess({...tiny, width: 0}, trimap));
  assert.throws(() => preprocess({...tiny, width: 2049}, trimap));
  assert.throws(() => preprocess({...tiny, data: new Uint8Array(tiny.data)}, trimap));
  assert.throws(() => preprocess(tiny, new Uint8ClampedArray(5)));
  assert.throws(() => preprocess(tiny, Uint8ClampedArray.from([0, 128, 255, 4, 0, 255])));

  // The model returns alpha, not logits. A second sigmoid would turn exact 0/1
  // into 128/186 and damage the edges. Padding is deliberately nonzero to make
  // an incorrect crop or an accidental square stretch observable.
  const output = {type: 'float32', dims: [1, 1, 32, 32], data: new Float32Array(plane).fill(.99)};
  [0, .25, 1].forEach((value, index) => { output.data[index] = value; });
  [-.2, 1.2, .5].forEach((value, index) => { output.data[32 + index] = value; });
  const outputBefore = output.data.slice();
  const unknown = new Uint8ClampedArray(6).fill(128);
  assert.deepEqual([...restoreAlpha(output, prepared, 3, 2, unknown)], [0, 64, 255, 0, 255, 128],
    'alpha is cropped from padded output, clamped, and encoded directly without sigmoid');
  const nativeLabels = new Uint8ClampedArray(6 * 4).fill(128); nativeLabels[7] = 0; nativeLabels[8] = 255;
  const nativeBefore = nativeLabels.slice();
  const native = restoreAlpha(output, prepared, 6, 4, nativeLabels);
  assert.equal(native.length, 6 * 4); assert.equal(native[0], 0); assert.equal(native.at(-1), 128);
  assert.equal(native[7], 0); assert.equal(native[8], 255, 'native hard trimap constraints survive resampling');
  assert.deepEqual(output.data, outputBefore); assert.deepEqual(nativeLabels, nativeBefore);

  const invalidOutputs = [
    null,
    {...output, type: 'float64'},
    {...output, dims: [1, 1, 16, 32]},
    {...output, dims: [1, 2, 32, 32]},
    {...output, dims: [1, 1, 32, 32, 1]},
    {...output, data: new Float32Array(plane - 1)},
    {...output, data: new Uint8ClampedArray(plane)},
    {...output, data: undefined},
  ];
  // Even an all-known trimap must not permit a malformed model tensor through.
  for (const [index, invalid] of invalidOutputs.entries()) {
    assert.throws(() => restoreAlpha(invalid, prepared, 3, 2, new Uint8ClampedArray(6).fill(255)),
      `malformed model shape/type/buffer case ${index} must fail before traversing known constraints`);
  }
  for (const invalid of [NaN, Infinity, -Infinity]) {
    const nonFinite = {...output, data: output.data.slice()}; nonFinite.data[0] = invalid;
    assert.throws(() => restoreAlpha(nonFinite, prepared, 3, 2, unknown), /无效/);
  }

  const assetRoot = path.join(root, 'assets/vitmatte');
  const manifest = JSON.parse(fs.readFileSync(path.join(assetRoot, 'manifest.json')));
  assert.equal(manifest.schema, 1);
  assert.equal(manifest.revision, '6bc1297f6140f055a227b6d2cfe8c093281f35d2');
  assert.equal(manifest.bytes, 27499369);
  assert.equal(manifest.sha256, '8216103d998864e122333e17d7d346feb1d6558d96bf08695a9838dba4f114e0');
  assert.equal(manifest.input.name, 'pixel_values'); assert.equal(manifest.input.type, 'float32');
  assert.deepEqual(manifest.input.shape, [1, 4, 'H', 'W']);
  assert.equal(manifest.output.name, 'alphas'); assert.equal(manifest.output.type, 'float32');
  assert.deepEqual(manifest.output.shape, [1, 1, 'H', 'W']);
  assert.equal(manifest.chunks.length, 2);
  const chunks = [];
  for (const entry of manifest.chunks) {
    assert.match(entry.file, /^[a-z0-9-]+\.bin$/);
    const bytes = fs.readFileSync(path.join(assetRoot, entry.file));
    assert.equal(bytes.length, entry.bytes);
    assert.ok(bytes.length <= 20 * 1024 * 1024, 'static chunks fit the existing Pages asset limit');
    assert.equal(sha256(bytes), entry.sha256, 'every checked-in model chunk matches its declared digest');
    chunks.push(bytes);
  }
  const model = Buffer.concat(chunks);
  assert.equal(model.length, manifest.bytes); assert.equal(sha256(model), manifest.sha256);
  console.log('gift-matting-refine: ratio-preserving pad32 preprocessing, upstream RGB/trimap normalization, native alpha restoration without sigmoid, hard constraints, malformed-tensor protection and model chunk hashes passed');
}
tests().catch(error => { console.error(error); process.exitCode = 1; });
