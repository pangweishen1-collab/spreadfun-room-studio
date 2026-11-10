const assert = require('node:assert/strict');

(async () => {
  const {REVIEW_FPS, reviewLayout, giftRect, defaultReviewSlot, normalizeReviewTemplate, createReviewRenderer} = await import('../vap-review-engine.mjs');
  assert.equal(REVIEW_FPS, 30);
  for (let count = 1; count <= 6; count++) {
    const layout = reviewLayout(count);
    assert.equal(layout.tiles.length, count);
    assert.equal(layout.width % 2, 0);
    assert.equal(layout.height % 2, 0);
    for (const tile of layout.tiles) {
      assert.ok(tile.x + tile.w < layout.width);
      assert.ok(tile.y + tile.label + tile.h < layout.height);
    }
  }
  assert.throws(() => reviewLayout(7), /number of gifts/);
  const tiles = reviewLayout(3).tiles;
  const slots = [0, 1, 2].map(defaultReviewSlot);
  assert.deepEqual(slots.map(slot => slot.scale), [100, 100, 100]);
  for (const [index, slot] of slots.entries()) {
    const rect = giftRect(tiles[index], 720, 1560, slot.scale);
    assert.ok(Math.abs(rect.w / rect.h - 720 / 1560) < .004);
  }
  const room = tiles[0], centered = giftRect(room, 720, 1560, 100);
  assert.ok(Math.abs(giftRect(room, 720, 1560, 100, -20).y - centered.y + room.h * .2) < .001);
  assert.ok(Math.abs(giftRect(room, 720, 1560, 100, 20).y - centered.y - room.h * .2) < .001);
  const wide = giftRect(room, 1920, 40, 25, 50);
  assert.ok(wide.y < room.y + room.h);
  slots[0].offsetY = -20;
  slots[1].offsetY = 14;
  slots[0].mask.topEnd = .37;
  slots[1].mask.bottomStart = .7;
  slots[1].mask.enabled = false;
  const backgroundFile = new Blob(['test image'], {type: 'image/png'});
  const saved = normalizeReviewTemplate({background:'custom', backgroundFile, slots});
  assert.equal(saved.backgroundFile, backgroundFile);
  assert.deepEqual(saved.slots, slots);
  assert.notEqual(saved.slots[0].mask, slots[0].mask);
  const {offsetY, ...legacy} = slots[0];
  assert.equal(normalizeReviewTemplate({background:'ludo', slots:[legacy]}).slots[0].offsetY, 0);
  assert.throws(() => normalizeReviewTemplate({background:'ludo', slots:[{...legacy, offsetY:51}]}), /video position/);
  assert.throws(() => normalizeReviewTemplate({background:'custom', slots}), /review background/);
  slots[0].mask.topEnd = .95;
  assert.throws(() => normalizeReviewTemplate({background:'ludo', slots}), /遮罩/);
  const layout = reviewLayout(3), painted = [], paintAlphas = [], savedAlphas = [];
  const context = {
    globalAlpha: 1,
    fillRect() {}, fillText() {}, beginPath() {}, rect() {}, clip() {}, setTransform() {},
    save() {savedAlphas.push(this.globalAlpha);},
    restore() {this.globalAlpha = savedAlphas.pop();},
    drawImage(image, x) {painted.push(x); paintAlphas.push(this.globalAlpha);},
  };
  const canvas = {getContext: () => context};
  const renderer = createReviewRenderer(canvas, layout);
  const preview = {background:{width:720,height:1560}, clips:[null, {}, null], settings:slots, sources:[], labels:['L', 'M', 'S']};
  renderer.draw({...preview, showEmptyRooms:false});
  assert.deepEqual(painted, [layout.tiles[1].x], 'only the uploaded middle slot shows a room in preview');
  painted.length = 0;
  renderer.draw(preview);
  assert.deepEqual(painted, layout.tiles.map(tile => tile.x), 'the exported comparison still draws all rooms');

  const maskDraws = [], maskPixels = [], sourceDraws = [];
  const source = {};
  globalThis.ImageData = class {
    constructor(data) { this.data = data; }
  };
  globalThis.OffscreenCanvas = class {
    getContext() {
      return {
        clearRect() {}, save() {}, restore() { this.globalCompositeOperation = 'source-over'; },
        putImageData(image) { maskPixels.push(image.data); },
        getImageData(x, y, width, height) {return {data: new Uint8ClampedArray(width * height * 4)};},
        drawImage(image, x, y, width, height) {
          if (image === source) sourceDraws.push(image);
          if (this.globalCompositeOperation === 'destination-in') maskDraws.push({image, y, height});
        },
      };
    }
  };
  const gift = {...defaultReviewSlot(), scale:48, key:'opaque'};
  const clip = {width:720, height:1560, meta:{}};
  const frame = {clips:[clip], settings:[gift], sources:[source], labels:preview.labels};
  const fixedRoom = {...room, y:room.y + room.label};
  for (const [offsetY, scale] of [[0,48], [24,48], [-19,80]]) {
    Object.assign(gift, {offsetY, scale});
    renderer.draw(frame);
    const rect = giftRect(fixedRoom, clip.width, clip.height, scale, offsetY);
    const mask = maskDraws.at(-1);
    assert.equal(mask.height, fixedRoom.h, 'mask height follows the room, independent of gift size');
    assert.equal(mask.y + rect.y, fixedRoom.y, 'video moves under the fixed mask');
  }
  assert.equal(maskPixels.length, 1, 'moving or resizing a gift reuses the room mask');
  assert.ok(maskDraws.every(draw => draw.image === maskDraws[0].image));
  const before = sourceDraws.length;
  renderer.draw({...frame, frameTimes:[0]});
  gift.offsetY = 5;
  renderer.draw({...frame, frameTimes:[0]});
  assert.equal(sourceDraws.length, before + 1, 'moving a paused video reuses its prepared frame');
  renderer.draw({...frame, frameTimes:[.5]});
  assert.equal(sourceDraws.length, before + 2, 'seeking refreshes the prepared frame');
  renderer.draw({...frame, pixelScale:.5});
  assert.equal(canvas.width, layout.width / 2, 'playback reduces the canvas backing resolution');
  renderer.draw(frame);
  assert.equal(canvas.width, layout.width, 'full-size rendering remains the default');

  const timed = {...frame, background:preview.background, clips:[{...clip, duration:4}, {...clip, duration:2}],
    settings:[gift, gift], sources:[source, source]};
  const roomAlphas = [1, 1, 1];
  const expectAlphas = (input, timelineTime, opacity, message) => {
    paintAlphas.length = 0;
    renderer.draw({...input, timelineTime});
    assert.deepEqual(paintAlphas.slice(0, 3), roomAlphas, 'room backdrop retains its original opacity');
    assert.equal(paintAlphas.length, 3 + opacity.length, message);
    for (const [index, expected] of opacity.entries()) assert.ok(Math.abs(paintAlphas[index + 3] - expected) < 1e-7, message);
  };
  expectAlphas(timed, 0, [], 'both gifts start transparent');
  expectAlphas(timed, .5, [.5, .5], 'each gift fades in over its own interval');
  expectAlphas(timed, 59 / 30, [1], 'the shorter gift fades out while the longer one stays visible');
  expectAlphas(timed, 119 / 30, [], 'the longer gift fades out on its last frame');
  expectAlphas(timed, undefined, [1, 1], 'template adjustment uses the unattenuated gift layer');
  const short = {...timed, clips:[{...clip, duration:7/30}, {...clip, duration:2/30}]};
  expectAlphas(short, 0, [1], 'a two-frame gift stays visible');
  expectAlphas({...short, sources:[source]}, .1, [1], 'compressed short fades meet at full opacity');
  const fourFrames = {...short, clips:[{...clip, duration:4/30}], sources:[source]};
  expectAlphas(fourFrames, 0, [], 'a four-frame gift starts transparent');
  expectAlphas(fourFrames, 2/30, [1], 'a four-frame gift reaches full opacity on a real frame');
  expectAlphas(fourFrames, 3/30, [], 'a four-frame gift ends transparent');
  const {makeVapc} = await import('../vap-protocol.mjs');
  const config = makeVapc({width:16, height:16, fps:24, frames:96, alphaScale:1});
  config.funToolkit = {rgbAlphaMode:'straight', giftFade:{enabled:true, fadeIn:1, fadeOut:0}};
  const native = {...timed, clips:[{...timed.clips[0], config}], sources:[source]};
  expectAlphas(native, .5, [1], 'the native gift keeps its baked fade-in');
  expectAlphas(native, 3.5, [14 / 30], 'the native gift gets the missing fade-out');
  config.funToolkit.giftFade.fadeOut = 1;
  expectAlphas(native, 3.5, [1], 'the native gift keeps its baked fade-out');
  console.log('vap-review: cached frames, scaled preview, room mask, per-clip fades, 30 FPS and template compatibility passed.');
})().catch(error => {console.error(error); process.exitCode = 1;});
