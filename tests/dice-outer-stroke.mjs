import assert from 'node:assert/strict';
import {removeOuterStroke} from '../dice/six-face/outer-stroke.mjs';

const width = 32, height = 28;
const green = [80, 190, 48, 255], gold = [225, 171, 66, 255];
const dark = [10, 14, 5, 255], blend = [54, 88, 24, 255];
const create = () => ({width, height, data: new Uint8ClampedArray(width * height * 4)});
const offset = (x, y) => (y * width + x) * 4;
const pixel = (data, x, y) => [...data.subarray(offset(x, y), offset(x, y) + 4)];
const set = (image, x, y, color) => image.data.set(color, offset(x, y));

function fixture(outlined) {
  const image = create();
  for (let y = 3; y <= 24; y++) for (let x = 3; x <= 28; x++) {
    const edge = Math.min(x - 3, y - 3, 28 - x, 24 - y);
    const fill = y < 14 ? green : gold;
    set(image, x, y, outlined && edge < 2 ? (edge ? blend : [...dark.slice(0, 3), 175]) : fill);
  }
  // Both isolated dark art near the edge and an interior alpha hole must survive.
  for (const [x, y] of [[5, 9], [11, 11], [12, 11], [17, 16], [19, 16]]) set(image, x, y, dark);
  set(image, 18, 16, [0, 0, 0, 0]);
  return image;
}

const image = fixture(true), source = image.data.slice();
const changed = removeOuterStroke(image);
assert.ok(changed > 100, 'Coherent dark contour and blended fringe are cleaned');
assert.deepEqual(pixel(image.data, 12, 3), [...green.slice(0, 3), 175]);
assert.deepEqual(pixel(image.data, 12, 4), green);
assert.deepEqual(pixel(image.data, 12, 24), [...gold.slice(0, 3), 175]);
assert.deepEqual(pixel(image.data, 12, 23), gold);
for (let i = 3; i < image.data.length; i += 4) assert.equal(image.data[i], source[i]);
for (const [x, y] of [[5, 9], [11, 11], [12, 11], [17, 16], [18, 16], [19, 16]]) {
  assert.deepEqual(pixel(image.data, x, y), pixel(source, x, y), 'Inner art and enclosed alpha are preserved');
}
assert.equal(removeOuterStroke(image), 0, 'A cleaned outline is not recolored again');

const plain = fixture(false), plainSource = plain.data.slice();
assert.equal(removeOuterStroke(plain), 0, 'Artwork without a dark outer outline is unchanged');
assert.deepEqual(plain.data, plainSource);

const darkFill = create();
for (let y = 3; y <= 24; y++) for (let x = 3; x <= 28; x++) set(darkFill, x, y, dark);
assert.equal(removeOuterStroke(darkFill), 0, 'A naturally dark subject has no brighter local fill to restore');

console.log(JSON.stringify({passed: true, checks: ['outline_and_fringe', 'alpha_and_inner_art', 'idempotence', 'no_outline', 'naturally_dark_fill']}));
