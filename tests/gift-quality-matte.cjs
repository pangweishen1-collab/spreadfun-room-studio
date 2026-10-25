'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const {pathToFileURL} = require('node:url');

// Author foreground colour and alpha first, then flatten. Expected output must
// not be inferred from the flattened image: that would miss the old black-fill
// bug and make an opaque copy of the source look like a correct cutout.
function scene(width, height, background = [0, 0, 0]) {
  return {
    width, height, background,
    colour: new Uint8ClampedArray(width * height * 4),
    alpha: new Uint8ClampedArray(width * height),
    subject: new Uint8ClampedArray(width * height),
  };
}
function pixel(fixture, x, y, colour, alpha = 255, subject = 0) {
  const index = y * fixture.width + x;
  fixture.colour.set([...colour, alpha], index * 4);
  fixture.alpha[index] = alpha;
  fixture.subject[index] = subject;
}
function rectangle(fixture, left, top, right, bottom, colour, alpha = 255, subject = 0) {
  for (let y = top; y < bottom; y++) for (let x = left; x < right; x++) pixel(fixture, x, y, colour, alpha, subject);
}
function composite(colour, alpha, background) {
  const result = new Uint8ClampedArray(alpha.length * 4);
  for (let index = 0; index < alpha.length; index++) {
    for (let channel = 0; channel < 3; channel++) {
      result[index * 4 + channel] = Math.round((colour[index * 4 + channel] * alpha[index]
        + background[channel] * (255 - alpha[index])) / 255);
    }
    result[index * 4 + 3] = 255;
  }
  return result;
}
function source(fixture) { return composite(fixture.colour, fixture.alpha, fixture.background); }
function maximumDifference(actual, expected) {
  assert.equal(actual.length, expected.length);
  let maximum = 0;
  for (let index = 0; index < actual.length; index++) maximum = Math.max(maximum, Math.abs(actual[index] - expected[index]));
  return maximum;
}
function verifyResult(result, fixture) {
  assert.equal(result.width, fixture.width);
  assert.equal(result.height, fixture.height);
  assert.equal(result.method, 'quality-matte');
  assert.equal(result.recoverBlack, false, 'colour has already been decontaminated; the renderer must not recover it again');
  assert.ok(result.data instanceof Uint8ClampedArray);
  assert.equal(result.data.length, fixture.width * fixture.height);
  assert.ok(result.foreground instanceof Uint8ClampedArray);
  assert.equal(result.foreground.length, fixture.width * fixture.height * 4);
  assert.deepEqual([...result.background], fixture.background);
  for (let index = 0; index < result.data.length; index++) {
    assert.equal(result.foreground[index * 4 + 3], result.data[index], 'foreground RGBA alpha agrees with the exported mask');
  }
}
function verifyComposites(result, fixture, tolerance = 2) {
  for (const background of [[255, 255, 255], [127, 127, 127], [25, 180, 220], [0, 0, 0]]) {
    const actual = composite(result.foreground, result.data, background);
    const expected = composite(fixture.colour, fixture.alpha, background);
    assert.ok(maximumDifference(actual, expected) <= tolerance,
      `independent truth must match on RGB(${background}); a black-background-only check is insufficient`);
  }
}

async function tests() {
  const {composeDarkCutout, createTrimap} = await import(pathToFileURL(path.resolve(__dirname, '../gift-quality-matte.mjs')));
  assert.equal(typeof composeDarkCutout, 'function');
  assert.equal(typeof createTrimap, 'function');

  const fixture = scene(128, 128);
  rectangle(fixture, 16, 20, 70, 108, [220, 80, 10], 255, 255);
  rectangle(fixture, 30, 44, 40, 56, [0, 0, 0], 255, 255);
  rectangle(fixture, 29, 76, 43, 90, [12, 3, 1], 255, 255);
  // This background slit has the same black RGB as the subject shadow, but it
  // enters from outside and must not be filled by nearby bright-pixel density.
  rectangle(fixture, 49, 20, 50, 100, [0, 0, 0], 0, 0);
  pixel(fixture, 15, 65, [100, 50, 20], 128, 128);
  // Neither the light ring nor its faint centre is present in the subject mask.
  // A thick closed ring must not turn the centre into an opaque dark region.
  for (let y = 22; y < 72; y++) for (let x = 74; x < 123; x++) {
    const distance = Math.hypot(x - 98, y - 47);
    if (distance < 15) pixel(fixture, x, y, [255, 160, 32], 20);
    else if (distance < 23) pixel(fixture, x, y, [255, 160, 32], 255);
  }
  const particles = [1, 2, 4, 8, 12, 20, 40, 96, 180];
  particles.forEach((alpha, offset) => pixel(fixture, 78 + offset * 5, 96, [255, 160, 32], alpha));
  const rgba = source(fixture), before = rgba.slice(), subjectBefore = fixture.subject.slice();
  const subject = {width: fixture.width, height: fixture.height, data: fixture.subject};
  // Deliberately supply a coarse prior that cannot see the thin black slit.
  // Colour-connected exterior background may veto that mistaken foreground,
  // while the enclosed, equally black nose remains protected foreground.
  const coarsePrior = fixture.subject.slice();
  for (let y = 20; y < 100; y++) coarsePrior[y * fixture.width + 49] = 255;
  const priorBefore = coarsePrior.slice();
  const prior = {width: fixture.width, height: fixture.height, data: coarsePrior};
  const withoutColour = createTrimap(rgba, fixture.width, fixture.height, prior);
  const trimap = createTrimap(rgba, fixture.width, fixture.height, prior, fixture.background);
  assert.ok(trimap instanceof Uint8ClampedArray);
  assert.equal(trimap.length, fixture.width * fixture.height);
  assert.deepEqual([...new Set(trimap)].sort((a, b) => a - b), [0, 128, 255]);
  assert.equal(withoutColour[64 * fixture.width + 49], 255, 'the semantic prior alone cannot resolve a thin black background slit');
  assert.equal(trimap[64 * fixture.width + 49], 0, 'known background RGB connected to the canvas outside vetoes a false foreground slit');
  assert.equal(trimap[50 * fixture.width + 35], 255, 'an enclosed pure-black subject nose is not treated as outside background');
  for (const x of [15, 16, 17]) assert.equal(withoutColour[64 * fixture.width + x], 128, 'an uncertain band straddles the coarse subject boundary');
  for (const x of [16, 17]) assert.equal(trimap[64 * fixture.width + x], 128, 'colour evidence does not remove the uncertain subject-side edge');
  assert.equal(trimap[64 * fixture.width + 20], 255, 'erosion leaves a definite subject interior');
  assert.equal(trimap[64 * fixture.width + 10], 0, 'remote exterior is definite background');
  assert.deepEqual(rgba, before, 'trimap generation does not mutate the image');
  assert.deepEqual(coarsePrior, priorBefore, 'trimap generation does not mutate the prior');
  const result = composeDarkCutout(rgba, fixture.width, fixture.height, {subject, background: fixture.background});
  verifyResult(result, fixture);
  assert.deepEqual(rgba, before, 'matting must not mutate the flattened source');
  assert.deepEqual(fixture.subject, subjectBefore, 'matting must not mutate the semantic/refined subject alpha');
  assert.equal(result.data[50 * fixture.width + 35], 255, 'pure-black solid subject detail remains opaque');
  assert.equal(result.data[82 * fixture.width + 35], 255, 'dark coloured subject shading remains opaque');
  assert.equal(result.data[64 * fixture.width + 49], 0, 'a narrow background slit stays clear beside a bright body');
  assert.equal(result.data[0], 0, 'flat exterior background becomes transparent');
  assert.equal(result.data[47 * fixture.width + 98], 20, 'closed light-ring centre keeps its known faint alpha');
  assert.equal(result.data[65 * fixture.width + 15], 128, 'refined semitransparent subject edge remains continuous');
  particles.forEach((alpha, offset) => {
    assert.equal(result.data[96 * fixture.width + 78 + offset * 5], alpha, 'isolated low-alpha particles survive outside the subject mask');
  });
  verifyComposites(result, fixture);

  const nearBlack = scene(64, 64, [4, 4, 5]);
  rectangle(nearBlack, 20, 20, 36, 36, [0, 0, 0], 255, 255);
  rectangle(nearBlack, 22, 38, 34, 46, [24, 8, 2], 255, 255);
  pixel(nearBlack, 8, 8, [255, 128, 32], 128);
  pixel(nearBlack, 12, 8, [255, 128, 32], 8);
  const nearSource = source(nearBlack), nearBefore = nearSource.slice();
  const nearResult = composeDarkCutout(nearSource, nearBlack.width, nearBlack.height, {
    subject: {width: nearBlack.width, height: nearBlack.height, data: nearBlack.subject},
    background: nearBlack.background,
  });
  verifyResult(nearResult, nearBlack);
  assert.deepEqual(nearSource, nearBefore);
  assert.equal(nearResult.data[0], 0, 'uniform near-black background is cleared rather than retained as a dark alpha veil');
  assert.equal(nearResult.data[28 * nearBlack.width + 28], 255, 'solid black subject is protected on a near-black backdrop');
  assert.ok(Math.abs(nearResult.data[8 * nearBlack.width + 8] - 128) <= 1);
  assert.ok(Math.abs(nearResult.data[8 * nearBlack.width + 12] - 8) <= 1);
  const brightParticle = (8 * nearBlack.width + 8) * 4;
  for (let channel = 0; channel < 3; channel++) {
    assert.ok(Math.abs(nearResult.foreground[brightParticle + channel] - nearBlack.colour[brightParticle + channel]) <= 2,
      'near-black background RGB must be removed from foreground colour, not only its alpha');
  }
  verifyComposites(nearResult, nearBlack);

  // Independently authored gold body and translucent glow have the same straight
  // foreground colour. Deliberately wrong model alpha calls the entire glow
  // opaque; only the body interior is certain foreground in the trimap.
  const gold = scene(80, 64), goldTrimap = new Uint8ClampedArray(80 * 64);
  const falloff = [120, 80, 40, 20, 10, 5];
  for (let y = 14; y < 50; y++) for (let x = 18; x < 62; x++) {
    const distance = Math.max(24 - x, x - 55, 20 - y, y - 43, 0);
    if (distance > falloff.length) continue;
    const core = distance === 0;
    pixel(gold, x, y, [204, 102, 51], core ? 255 : falloff[distance - 1], 255);
    goldTrimap[y * gold.width + x] = core ? 255 : 128;
  }
  rectangle(gold, 30, 27, 36, 33, [0, 0, 0], 255, 255);
  rectangle(gold, 40, 27, 46, 33, [12, 3, 1], 255, 255);
  const goldSource = source(gold), goldBefore = goldSource.slice(), goldTrimapBefore = goldTrimap.slice(), goldSubjectBefore = gold.subject.slice();
  const goldSubject = {width: gold.width, height: gold.height, data: gold.subject};
  const overestimated = composeDarkCutout(goldSource, gold.width, gold.height, {subject: goldSubject, background: gold.background});
  assert.equal(overestimated.data[30 * gold.width + 61], 255, 'the fixture exposes a wrongly opaque model prediction at the faint gold edge');
  const guidedGold = composeDarkCutout(goldSource, gold.width, gold.height, {
    subject: goldSubject, trimap: goldTrimap, background: gold.background,
  });
  verifyResult(guidedGold, gold);
  assert.deepEqual(guidedGold.data, gold.alpha, 'uncertain glow retains authored alpha despite a falsely opaque semantic prediction');
  assert.equal(guidedGold.data[30 * gold.width + 33], 255, 'known pure-black body core is never weakened by nearby colour guidance');
  assert.equal(guidedGold.data[30 * gold.width + 43], 255, 'known dark body shading remains opaque');
  assert.deepEqual([...guidedGold.foreground.slice((30 * gold.width + 61) * 4, (30 * gold.width + 61) * 4 + 4)], [204, 102, 51, 5],
    'the faint edge restores the independent foreground colour instead of retaining an opaque brown fringe');
  verifyComposites(guidedGold, gold);
  assert.deepEqual(goldSource, goldBefore); assert.deepEqual(goldTrimap, goldTrimapBefore); assert.deepEqual(gold.subject, goldSubjectBefore);

  // A Manhattan-radius-30 solid has a genuine diagonal interior that a square
  // radius-2 erosion wrongly removes. The enclosed black detail at (78, 78)
  // is two pixels inside that silhouette and must remain known foreground.
  const diamond = scene(128, 128);
  for (let y = 0; y < diamond.height; y++) for (let x = 0; x < diamond.width; x++) {
    if (Math.abs(x - 64) + Math.abs(y - 64) <= 30) pixel(diamond, x, y, [210, 80, 20], 255, 255);
  }
  pixel(diamond, 78, 78, [0, 0, 0], 255, 255);
  assert.equal(diamond.subject[80 * diamond.width + 80], 0, 'a square-kernel diagonal corner crosses the authored solid boundary');
  assert.equal(diamond.subject[78 * diamond.width + 80], 255);
  assert.equal(diamond.subject[80 * diamond.width + 78], 255, 'two-pixel axial neighbours remain inside the authored solid');
  const diamondSource = source(diamond), diamondBefore = diamondSource.slice(), diamondPriorBefore = diamond.subject.slice();
  const diamondTrimap = createTrimap(diamondSource, diamond.width, diamond.height,
    {width: diamond.width, height: diamond.height, data: diamond.subject}, diamond.background);
  assert.equal(diamondTrimap[78 * diamond.width + 78], 255,
    'diamond erosion protects an enclosed pure-black detail near a diagonal solid corner');
  assert.deepEqual(diamondSource, diamondBefore); assert.deepEqual(diamond.subject, diamondPriorBefore);

  for (const invalid of [
    {width: 0, height: 1, data: new Uint8ClampedArray(0)},
    {width: NaN, height: 1, data: new Uint8ClampedArray(1)},
    {width: 1, height: NaN, data: new Uint8ClampedArray(1)},
    {width: 2, height: 2, data: new Uint8ClampedArray(3)},
    {width: 2, height: 2, data: new Uint8Array(4)},
  ]) {
    assert.throws(() => createTrimap(rgba, fixture.width, fixture.height, invalid), /无效/,
      'an invalid semantic prior must be rejected before sampling');
    assert.throws(() => composeDarkCutout(rgba, fixture.width, fixture.height, {subject: invalid, background: fixture.background}), /无效/,
      'an invalid refined subject must be rejected before sampling');
  }

  console.log('gift-quality-matte: independent alpha truth, colour-connected slit veto, enclosed dark subject, uncertain trimap band, closed glow rings, faint particles, near-black RGB decontamination, overestimated gold-glow refinement, mask validation, input immutability and multi-background composites passed');
}
tests().catch(error => { console.error(error); process.exitCode = 1; });
