import {listSvgaImages, readSvga} from './avatar-custom-engine.mjs?v=20261110-svga-layout';

const SIDE = 240;
const MAX_FILE_BYTES = 50 * 1024 * 1024;
// There can be twenty simultaneous players. Limit decoded sprites, which
// occupy more memory than their compressed SVGA bytes or 240px canvases.
const MAX_BITMAP_BYTES = 8 * 1024 * 1024;
const active = new Set();
let animationRequest = null;

function tick(now) {
  animationRequest = null;
  for (const advance of active) advance(now);
  if (active.size) animationRequest = requestAnimationFrame(tick);
}

function svgaError(code, cause) {
  return Object.assign(new Error(code, {cause}), {code});
}

async function measureImage(bytes, type) {
  const image = await createImageBitmap(new Blob([bytes], {type}));
  const size = {width: image.width, height: image.height};
  image.close();
  return size;
}

async function verifyFile(file) {
  if (!(file instanceof File) || file.size < 4) throw svgaError('decode');
  if (file.size > MAX_FILE_BYTES) throw svgaError('size');
  const model = await readSvga(await file.arrayBuffer());
  const bitmaps = await listSvgaImages(model, measureImage);
  let bytes = 0;
  for (const {width, height} of bitmaps) {
    if (!width || !height) throw svgaError('decode');
    bytes += width * height * 4;
    if (bytes > MAX_BITMAP_BYTES) throw svgaError('size');
  }
  if (model.format === 'zip') {
    const images = Object.fromEntries(Object.entries(model.spec.images).map(([key, name]) => [key, name.replace(/\.png$/, '')]));
    // The pinned player appends .png to names in a legacy movie.spec.
    if (Object.entries(images).some(([key, name]) => name !== model.spec.images[key])) {
      model.zip.file('movie.spec', JSON.stringify({...model.spec, images}));
      const normalized = await model.zip.generateAsync({type: 'blob'});
      file = new File([normalized], file.name);
    }
  }
  return file;
}

function parse(file) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(svgaError('decode')), 8000);
    try {
      new window.SVGA.Parser().load(file, video => {
        clearTimeout(timeout);
        resolve(video);
      }, error => {
        clearTimeout(timeout);
        reject(svgaError('decode', error));
      });
    } catch (error) {
      clearTimeout(timeout);
      reject(svgaError('decode', error));
    }
  });
}

function waitUntilPrepared(player) {
  return new Promise((resolve, reject) => {
    const deadline = performance.now() + 8000;
    const check = () => {
      if (player._renderer._prepared) resolve();
      else if (performance.now() >= deadline) reject(svgaError('decode'));
      else setTimeout(check, 20);
    };
    check();
  });
}

function firstVisibleFrame(player, canvas, frames) {
  const sample = document.createElement('canvas');
  sample.width = sample.height = 24;
  const context = sample.getContext('2d', {willReadFrequently: true});
  // Seek through a short blank intro, then probe longer animations sparingly.
  const earlyFrames = Math.min(12, frames);
  const step = Math.max(1, Math.ceil((frames - earlyFrames) / 12));
  for (let frame = 0; frame < frames; frame += frame < earlyFrames ? 1 : step) {
    player.stepToFrame(frame, false);
    context.clearRect(0, 0, sample.width, sample.height);
    context.drawImage(canvas, 0, 0, sample.width, sample.height);
    const pixels = context.getImageData(0, 0, sample.width, sample.height).data;
    for (let alpha = 3; alpha < pixels.length; alpha += 4) if (pixels[alpha] > 0) return frame;
  }
  player.stepToFrame(0, false);
  return 0;
}

export async function prepareSeatSvga(file) {
  let player;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIDE;
  canvas.setAttribute('aria-hidden', 'true');
  try {
    const video = await parse(await verifyFile(file));
    const {frames, FPS: fps, sprites, videoSize: {width, height}} = video;
    if (!frames || !fps || !width || !height || sprites.some(sprite =>
      typeof sprite.imageKey !== 'string' || sprite.frames.length < frames)) throw svgaError('decode');

    // A room can play many seats at once. Strip audio data from the preview
    // entity before the renderer has a chance to instantiate a sound.
    for (const {audioKey} of video.audios || []) delete video.images[audioKey];
    for (const [key, data] of Object.entries(video.images)) {
      if (data.startsWith('SUQz')) delete video.images[key];
    }
    video.audios = [];

    player = new window.SVGA.Player(canvas);
    const scale = Math.min(SIDE / width, SIDE / height);
    const transform = {
      a: scale, b: 0, c: 0, d: scale,
      tx: (SIDE - width * scale) / 2,
      ty: (SIDE - height * scale) / 2
    };
    // SVGA 2.3.2 normally measures clientWidth/Height each frame. The seat
    // canvas must keep this backing size even while detached or CSS-scaled.
    player._resize = () => { player._globalTransform = transform; };
    player.setVideoItem(video);
    // Draw the first frame ourselves, so a malformed frame rejects the upload
    // instead of throwing from the vendor's asynchronous bitmap callback.
    player._renderer._undrawFrame = undefined;
    await waitUntilPrepared(player);
    let frame = firstVisibleFrame(player, canvas, frames);
    let elapsed = frame * 1000 / fps;
    let started = null;
    let disposed = false;
    function advance(now) {
      const next = Math.floor((elapsed + Math.max(0, now - started)) * fps / 1000) % frames;
      if (next === frame) return;
      try {
        player.stepToFrame(next, false);
        frame = next;
      } catch {
        pause();
      }
    }
    function play() {
      if (disposed || frames === 1 || active.has(advance)) return;
      started = performance.now();
      active.add(advance);
      if (animationRequest === null) animationRequest = requestAnimationFrame(tick);
    }
    function pause() {
      if (!active.delete(advance)) return;
      elapsed = (elapsed + performance.now() - started) % (frames * 1000 / fps);
      started = null;
      if (!active.size && animationRequest !== null) {
        cancelAnimationFrame(animationRequest);
        animationRequest = null;
      }
    }
    function drawAt(seconds, draw) {
      const exportFrame = Math.floor(seconds * fps + 1e-9) % frames;
      if (exportFrame === frame) return draw(canvas);
      // Sample and restore within one synchronous task so the live preview
      // keeps its phase and never paints the seek used for the export.
      try {
        player.stepToFrame(exportFrame, false);
        return draw(canvas);
      } finally {
        player.stepToFrame(frame, false);
      }
    }
    function dispose() {
      if (disposed) return;
      pause();
      disposed = true;
      player = null;
      canvas.width = canvas.height = 1;
    }
    return {element: canvas, canvas, play, pause, drawAt, dispose};
  } catch (error) {
    canvas.width = canvas.height = 1;
    throw svgaError(['size', 'tooLarge'].includes(error?.code) ? 'size' : 'decode', error);
  }
}
