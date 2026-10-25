'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const {pathToFileURL} = require('node:url');

function image(width, height, colour = [0, 0, 0]) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let pixel = 0; pixel < width * height; pixel++) data.set([...colour, 255], pixel * 4);
  return data;
}
function set(data, width, x, y, colour) { data.set([...colour, 255], (y * width + x) * 4); }
function rectangle(data, width, left, top, right, bottom, colour) {
  for (let y = top; y < bottom; y++) for (let x = left; x < right; x++) set(data, width, x, y, colour);
}

async function tests() {
  const {darkMatte} = await import(pathToFileURL(path.resolve(__dirname, '../gift-background-matte.mjs')));
  assert.throws(() => darkMatte(new Uint8ClampedArray(4), 0, 1), /尺寸/);
  assert.throws(() => darkMatte(new Uint8ClampedArray(4), 1, 2), /尺寸/);
  assert.throws(() => darkMatte(new Uint8ClampedArray(2049 * 4), 2049, 1), /尺寸/);
  assert.equal(darkMatte(image(8, 8), 8, 8), null, 'tiny inputs do not provide reliable backdrop evidence');

  const width = 128, height = 128, source = image(width, height);
  rectangle(source, width, 28, 28, 100, 100, [192, 60, 12]);
  rectangle(source, width, 61, 61, 64, 64, [0, 0, 0]);
  for (let value = 1; value <= 20; value++) set(source, width, 5 + value, 10, [value, Math.floor(value / 2), 0]);
  const before = source.slice(), progress = [];
  const result = darkMatte(source, width, height, value => progress.push(value));
  assert.deepEqual(progress, [.1, .6, 1], 'optional progress follows completed detection, matte and protection stages');
  assert.ok(result); assert.equal(result.width, width); assert.equal(result.height, height);
  assert.equal(result.method, 'dark-matte'); assert.equal(result.recoverBlack, true);
  assert.ok(result.data instanceof Uint8ClampedArray); assert.equal(result.data.length, width * height);
  assert.deepEqual(source, before, 'matting does not mutate source RGB or alpha');
  assert.equal(result.data[0], 0, 'the flat black backdrop is transparent');
  assert.equal(result.data[62 * width + 62], 255, 'small black facial details inside solid artwork remain opaque');
  assert.equal(result.data[40 * width + 40], 255, 'coloured body shading remains opaque');
  for (let value = 1; value <= 20; value++) {
    const pixel = 10 * width + 5 + value, alpha = result.data[pixel];
    assert.equal(alpha, value, 'faint isolated particles have continuous, non-thresholded alpha');
    const original = source[pixel * 4], recovered = Math.min(255, Math.round(original * 255 / alpha));
    assert.ok(Math.abs(recovered * alpha / 255 - original) <= .5, 'RGB unpremultiplication preserves light on a black room');
  }

  const halo = image(width, height);
  for (let y = 12; y < 116; y++) for (let x = 12; x < 116; x++) {
    const distance = Math.hypot(x - 64, y - 64);
    if (distance > 38 && distance < 41) set(halo, width, x, y, [255, 172, 25]);
  }
  const ring = darkMatte(halo, width, height);
  assert.ok(ring); assert.equal(ring.data[64 * width + 64], 0, 'large black holes inside light rings are never globally filled');
  assert.equal(ring.data[64 * width + 90], 0, 'the open area near a ring also stays transparent');

  const shaded = image(width, height);
  rectangle(shaded, width, 28, 28, 100, 100, [192, 60, 12]);
  rectangle(shaded, width, 44, 44, 84, 84, [20, 4, 1]);
  rectangle(shaded, width, 61, 61, 64, 64, [0, 0, 0]);
  const shading = darkMatte(shaded, width, height);
  assert.equal(shading.data[60 * width + 60], 255, 'large enclosed dark-red subject shading remains opaque on light rooms');
  assert.equal(shading.data[62 * width + 62], 255, 'black details within an enclosed textured shadow also remain whole');
  const darkVoid = image(width, height);
  rectangle(darkVoid, width, 28, 28, 100, 100, [255, 180, 20]);
  rectangle(darkVoid, width, 38, 38, 90, 90, [0, 0, 0]);
  assert.equal(darkMatte(darkVoid, width, height).data[64 * width + 64], 0, 'even a thick light ring must not fill its pure-black centre');
  rectangle(darkVoid, width, 38, 38, 90, 90, [3, 1, 0]);
  assert.equal(darkMatte(darkVoid, width, height).data[64 * width + 64], 3, 'an enclosed faint ambient glow stays translucent');

  const nearBlack = image(width, height, [4, 4, 5]);
  set(nearBlack, width, 64, 64, [5, 4, 5]);
  const near = darkMatte(nearBlack, width, height);
  assert.ok(near); assert.equal(near.data[0], 0); assert.ok(near.data[64 * width + 64] > 0, 'even faint signal above a near-black base survives');

  for (const colour of [[255, 255, 255], [28, 28, 28], [0, 0, 6]]) {
    assert.equal(darkMatte(image(width, height, colour), width, height), null, 'bright, grey or tinted backgrounds fall back to the semantic model');
  }
  const inconsistent = image(width, height);
  for (let y = 0; y < height; y++) set(inconsistent, width, width - 1, y, [8, 8, 8]);
  assert.equal(darkMatte(inconsistent, width, height), null, 'all four sides must agree');
  const textured = image(width, height);
  for (let x = 0; x < width; x++) set(textured, width, x, 0, x % 2 ? [0, 0, 0] : [20, 18, 16]);
  const fallbackProgress = [];
  assert.equal(darkMatte(textured, width, height, value => fallbackProgress.push(value)), null, 'a textured or photographic edge is not a flat black backdrop');
  assert.deepEqual(fallbackProgress, [], 'rejected backgrounds do not report matting progress');
  const photo = image(width, height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) set(photo, width, x, y, [Math.floor(x / 4), Math.floor(y / 4), Math.floor((x + y) / 8)]);
  assert.equal(darkMatte(photo, width, height), null, 'a nonuniform photographic-style background falls back');
  const transparent = source.slice(); transparent[(60 * width + 60) * 4 + 3] = 120;
  assert.equal(darkMatte(transparent, width, height), null, 'existing transparency is left to the normal image path');

  const edgeGlow = source.slice();
  for (let y = 50; y < 65; y++) set(edgeGlow, width, width - 1, y, [67, 20, 0]);
  assert.ok(darkMatte(edgeGlow, width, height), 'sparse genuine glows touching one edge do not invalidate an otherwise flat black base');
  console.log('gift-background-matte: conservative backdrop detection, continuous faint light, RGB recovery, solid dark details, open halo centres, source immutability and fallbacks passed');
}
tests().catch(error => { console.error(error); process.exitCode = 1; });
