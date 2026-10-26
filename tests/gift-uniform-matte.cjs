'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

function fixture(width, height, background, tail = .2) {
  const rgba = new Uint8ClampedArray(width * height * 4), prior = new Float64Array(width * height).fill(tail);
  for (let pixel = 0; pixel < prior.length; pixel++) rgba.set([...background, 255], pixel * 4);
  return { width, height, background, rgba, prior };
}
function put(scene, x, y, foreground, alpha, sourceAlpha = 255) {
  const pixel = y * scene.width + x;
  for (let channel = 0; channel < 3; channel++) scene.rgba[pixel * 4 + channel] = Math.round(foreground[channel] * alpha + scene.background[channel] * (1 - alpha));
  scene.rgba[pixel * 4 + 3] = sourceAlpha; scene.prior[pixel] = alpha;
  return pixel;
}
function rgb(result, pixel) { return [...result.foreground.slice(pixel * 4, pixel * 4 + 3)]; }
function approximately(actual, expected, tolerance, message) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${message}: ${actual} vs ${expected}`);
}
function recompose(result, scene, pixel) {
  const a = result.data[pixel] / 255;
  return rgb(result, pixel).map((colour, channel) => Math.round(colour * a + scene.background[channel] * (1 - a)));
}

(async () => {
  const { composeUniformMatte, minimumCoverage } = await import(pathToFileURL(path.join(__dirname, '..', 'gift-uniform-matte.mjs')).href);
  assert.equal(minimumCoverage([64, 16, 0], [0, 0, 0]), 64 / 255, 'black background uses brighter signed differences');
  assert.equal(minimumCoverage([191, 239, 255], [255, 255, 255]), 64 / 255, 'white background uses darker signed differences');
  assert.equal(minimumCoverage([64, 96, 191], [0, 128, 255]), 64 / 255, 'blue background handles positive and negative differences together');
  assert.equal(minimumCoverage([0, 128, 255], [0, 128, 255]), 0, 'exact background needs no coverage, including endpoint channels');

  // Foreground colours/coverage are authored before flattening. These checks
  // would reject an opaque source copy or a global luminance-key substitute.
  for (const background of [[0, 0, 0], [255, 255, 255], [0, 128, 255]]) {
    const scene = fixture(7, 5, background), opaque = put(scene, 3, 2, [11, 7, 3], 1);
    const edge = put(scene, 4, 2, [210, 50, 130], .5);
    const original = scene.rgba.slice(), originalPrior = scene.prior.slice();
    const result = composeUniformMatte(scene.rgba, scene.width, scene.height, scene.prior, background);
    assert.equal(result.width, scene.width); assert.equal(result.height, scene.height);
    assert.equal(result.method, 'uniform-matte'); assert.equal(result.recoverBlack, false);
    assert.ok(result.data instanceof Uint8ClampedArray); assert.ok(result.foreground instanceof Uint8ClampedArray);
    assert.deepEqual(result.background, background); assert.notEqual(result.background, background);
    assert.equal(result.data[0], 0, 'exterior exact-background model tails are removed');
    assert.equal(result.data[opaque], 255, 'dark material remains opaque on every background');
    assert.deepEqual(rgb(result, opaque), [11, 7, 3]);
    approximately(result.data[edge], 128, 0, 'known half-transparent edge retains coverage');
    rgb(result, edge).forEach((colour, channel) => approximately(colour, [210, 50, 130][channel], 1, 'edge foreground recovered'));
    for (let pixel = 0; pixel < result.data.length; pixel++) {
      assert.equal(result.foreground[pixel * 4 + 3], result.data[pixel]);
      recompose(result, scene, pixel).forEach((colour, channel) => approximately(colour, scene.rgba[pixel * 4 + channel], 1, 'flattened source signal retained'));
    }
    assert.deepEqual(scene.rgba, original, 'source pixels are not mutated');
    assert.deepEqual(scene.prior, originalPrior, 'model alpha is not mutated');
  }

  // An actual black material pixel can be identical to B. Learned confident
  // material stops the outside flood; a subthreshold background tail does not.
  const dark = fixture(5, 5, [0, 0, 0]); dark.prior[12] = .97; dark.prior[13] = .969;
  const protectedDark = composeUniformMatte(dark.rgba, 5, 5, dark.prior);
  assert.equal(protectedDark.data[12], Math.round(.97 * 255), 'the fixed confidence boundary protects genuine dark material');
  assert.deepEqual(rgb(protectedDark, 12), [0, 0, 0]);
  assert.equal(protectedDark.data[13], 0, 'a nearby exterior tail is still removed');

  // No foreground core and disconnected one-byte particles are valid. Even
  // a near-background flood pixel keeps its physical colour signal.
  for (const [background, particle] of [
    [[0, 0, 0], [1, 0, 0]], [[255, 255, 255], [254, 255, 255]], [[0, 128, 255], [1, 127, 254]],
  ]) {
    const scene = fixture(5, 5, background, .3); scene.rgba.set([...particle, 255], 0);
    const result = composeUniformMatte(scene.rgba, 5, 5, new Float32Array(scene.prior), background);
    assert.equal(result.data[12], 0, 'lack of any foreground core does not retain background');
    assert.ok(result.data[0] > 0 && result.data[0] <= 2, 'one-byte light is neither deleted nor inflated into an opaque dot');
    recompose(result, scene, 0).forEach((colour, channel) => approximately(colour, particle[channel], 1, 'weak particle signal survives'));
  }
  const empty = composeUniformMatte(new Uint8ClampedArray([0, 0, 0, 255]), 1, 1, new Float32Array([0]));
  assert.deepEqual([...empty.data], [0], 'a one-pixel empty canvas is supported');

  const alphaSource = new Uint8ClampedArray([80, 20, 5, 0, 64, 32, 0, 128]);
  const alphaResult = composeUniformMatte(alphaSource, 2, 1, new Float32Array([1, .5]));
  assert.equal(alphaResult.data[0], 0, 'already transparent source remains transparent');
  assert.equal(alphaResult.data[1], 64, 'source alpha multiplies recovered coverage exactly once');
  assert.deepEqual(rgb(alphaResult, 1), [128, 64, 0]);

  const rgba = new Uint8ClampedArray([0, 0, 0, 255]), prior = new Float32Array([0]);
  for (const dimensions of [[0, 1], [1.5, 1], [1, 2049], [NaN, 1]]) assert.throws(() => composeUniformMatte(rgba, ...dimensions, prior));
  assert.throws(() => composeUniformMatte(new Uint8Array(rgba), 1, 1, prior));
  assert.throws(() => composeUniformMatte(rgba, 2, 1, prior));
  assert.throws(() => composeUniformMatte(rgba, 1, 1, new Uint8Array([0])));
  assert.throws(() => composeUniformMatte(rgba, 1, 1, new Float32Array(0)));
  for (const value of [NaN, Infinity, -.01, 1.01]) assert.throws(() => composeUniformMatte(rgba, 1, 1, new Float32Array([value])));
  for (const background of [null, Array(3), [0, , 0], [0, 0], [0, 0, NaN], [0, -1, 0], [0, 0, 256]]) assert.throws(() => composeUniformMatte(rgba, 1, 1, prior, background));
  assert.throws(() => minimumCoverage([0, NaN, 0], [0, 0, 0]));
  assert.throws(() => minimumCoverage([0, 0, 0], [0, 0, Infinity]));
  console.log('gift-uniform-matte: passed flat-colour recovery, dark core, exterior cleanup, weak particles, source transparency, empty-core and validation checks');
})().catch(error => { console.error(error); process.exitCode = 1; });
