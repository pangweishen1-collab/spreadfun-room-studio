import {avcCodec, inspectVideo} from './vap-engine.mjs?v=20261110-custom-plate';
import {applyVerticalMask, keyPixels, normalizeVerticalMask} from './vap-matte.mjs';
import {readSourceVapConfig} from './vap-protocol.mjs';
import {createVapUnpacker} from './vap-resources.mjs';

export const REVIEW_FPS = 30;
export const MAX_REVIEW_SLOTS = 6;
export const REVIEW_POSITION_LIMIT = 50;
export const REVIEW_BACKGROUNDS = Object.freeze({
  ludo: 'assets/vap-review-room.webp',
  dark: null,
});
const keyModes = new Set(['auto', 'opaque', 'black_luma', 'white_luma', 'chroma_key']);
const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));

export function defaultReviewSlot() {
  return {
    scale: 100,
    offsetY: 0,
    key: 'auto',
    mask: {enabled: true, topStart: 0, topEnd: .12, bottomStart: .88, bottomEnd: 1},
  };
}

export function normalizeReviewTemplate(value) {
  if (!value || !Array.isArray(value.slots) || !value.slots.length || value.slots.length > MAX_REVIEW_SLOTS)
    throw new Error('Invalid review template');
  const background = value.background;
  if (!Object.hasOwn(REVIEW_BACKGROUNDS, background) && (background !== 'custom' || !(value.backgroundFile instanceof Blob)))
    throw new Error('Invalid review background');
  return {
    background, backgroundFile: background === 'custom' ? value.backgroundFile : null,
    slots: value.slots.map(slot => {
      if (!slot || !Number.isInteger(slot.scale) || slot.scale < 25 || slot.scale > 110 || !keyModes.has(slot.key))
        throw new Error('Invalid review slot');
      if (typeof slot.mask?.enabled !== 'boolean') throw new Error('Invalid review mask');
      const offsetY = slot.offsetY ?? 0;
      if (!Number.isFinite(offsetY) || Math.abs(offsetY) > REVIEW_POSITION_LIMIT)
        throw new Error('Invalid review video position');
      const mask = normalizeVerticalMask({...slot.mask, enabled: true});
      return {scale: slot.scale, offsetY, key: slot.key, mask: {...mask, enabled: slot.mask.enabled}};
    }),
  };
}

export function reviewLayout(count, tileWidth = 432) {
  if (!Number.isInteger(count) || count < 1 || count > MAX_REVIEW_SLOTS) throw new Error('Invalid number of gifts');
  const columns = Math.min(count, 3), rows = Math.ceil(count / columns);
  const tileHeight = Math.round(tileWidth * 13 / 6), gap = Math.round(tileWidth / 20);
  const label = Math.round(tileWidth * .09), step = tileHeight + label + gap;
  const even = value => Math.ceil(value / 2) * 2;
  return {
    width: even(columns * (tileWidth + gap) + gap),
    height: even(rows * step + gap),
    tiles: Array.from({length: count}, (_, index) => ({
      x: gap + index % columns * (tileWidth + gap),
      y: gap + Math.floor(index / columns) * step,
      w: tileWidth, h: tileHeight, label,
    })),
  };
}

export function giftRect(tile, width, height, percent, offsetY = 0) {
  const scale = Math.min(tile.w / width, tile.h / height) * percent / 100;
  const w = Math.max(1, Math.round(width * scale)), h = Math.max(1, Math.round(height * scale));
  const visible = Math.min(h, tile.h) / 4;
  const y = clamp((tile.h - h) * .53 + tile.h * offsetY / 100, visible - h, tile.h - visible);
  return {x: tile.x + (tile.w - w) / 2, y: tile.y + y, w, h};
}

export async function inspectReviewClip(file, {allowCustomScreen = false} = {}) {
  const config = await readSourceVapConfig(file);
  const meta = await inspectVideo(file, {detectSource: !config, videoTrackOnly: true, allowCustomScreen});
  if (config && (meta.width !== config.info.videoW || meta.height !== config.info.videoH))
    throw new Error('VAP frame geometry does not match its metadata');
  const declared = config ? config.info.f / config.info.fps : Infinity;
  const duration = Math.min(meta.videoDuration, declared);
  if (!Number.isFinite(duration) || duration <= 0) throw new Error('No video frames');
  return {file, config, meta, duration, start: meta.videoStart, width: config?.info.w || meta.width, height: config?.info.h || meta.height};
}

function surface(width, height, readback = false) {
  const canvas = typeof OffscreenCanvas === 'function' ? new OffscreenCanvas(width, height) : document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d', {willReadFrequently: readback});
  if (!ctx) throw new Error('Canvas 2D unavailable');
  ctx.imageSmoothingQuality = 'high';
  return {canvas, ctx};
}

function cover(ctx, image, tile) {
  const ratio = Math.max(tile.w / image.width, tile.h / image.height);
  const w = image.width * ratio, h = image.height * ratio;
  ctx.drawImage(image, tile.x + (tile.w - w) / 2, tile.y + (tile.h - h) / 2, w, h);
}

function matteOptions(clip, key) {
  const detected = clip.meta.sourceDetection;
  const method = key !== 'auto' ? key : detected?.sourceKind === 'chroma_mp4' ? 'chroma_key' : detected?.matteMethod || 'opaque';
  return {
    matteMethod: method,
    screenColor: detected?.screenColor || 'auto',
    background: method === 'chroma_key' && detected?.sourceKind === 'chroma_mp4' ? detected.background : undefined,
    adaptiveChroma: method === 'chroma_key' && detected?.backgroundVariation === true,
  };
}

function paintGift(gift, source, clip, settings, rect, room) {
  const {w, h} = rect;
  if (!gift.surface || gift.surface.canvas.width !== w || gift.surface.canvas.height !== h || gift.config !== clip.config) {
    gift.unpacker?.dispose();
    if (gift.surface) gift.surface.canvas.width = gift.surface.canvas.height = 1;
    gift.surface = surface(w, h, true);
    gift.config = clip.config;
    gift.unpacker = clip.config ? createVapUnpacker({width: w, height: h, sourceVapConfig: clip.config}) : null;
    gift.workspace = {};
  }
  const {canvas, ctx} = gift.surface;
  if (gift.unpacker) {
    ctx.putImageData(gift.unpacker.process(source), 0, 0);
  } else {
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(source, 0, 0, w, h);
    const options = matteOptions(clip, settings.key);
    if (options.matteMethod !== 'opaque') {
      const frame = ctx.getImageData(0, 0, w, h);
      frame.data.set(keyPixels(frame.data, w, h, options, gift.workspace));
      ctx.putImageData(frame, 0, 0);
    }
  }
  if (settings.mask.enabled) {
    const maskKey = room.h + ':' + JSON.stringify(settings.mask);
    if (maskKey !== gift.maskKey) {
      gift.mask ||= surface(1, room.h);
      gift.mask.canvas.height = room.h;
      const alpha = new Uint8ClampedArray(4 * room.h);
      for (let y = 0; y < room.h; y++) alpha[y * 4 + 3] = 255;
      gift.mask.ctx.putImageData(new ImageData(applyVerticalMask(alpha, 1, room.h, settings.mask), 1, room.h), 0, 0);
      gift.maskKey = maskKey;
    }
    ctx.save();
    ctx.globalCompositeOperation = 'destination-in';
    // Translate the room-space mask into this video's local surface.
    ctx.drawImage(gift.mask.canvas, 0, room.y - rect.y, w, room.h);
    ctx.restore();
  }
  return canvas;
}

export function createReviewRenderer(canvas, layout) {
  canvas.width = layout.width; canvas.height = layout.height;
  const ctx = canvas.getContext('2d', {alpha: false});
  const gifts = layout.tiles.map(() => ({}));
  if (!ctx) throw new Error('Canvas 2D unavailable');
  ctx.imageSmoothingQuality = 'high';
  return {
    draw({background, clips, settings, sources, labels, showEmptyRooms = true}) {
      ctx.fillStyle = '#111b2b'; ctx.fillRect(0, 0, layout.width, layout.height);
      for (const [index, tile] of layout.tiles.entries()) {
        const {x, y, w, h, label} = tile;
        ctx.fillStyle = '#233247'; ctx.fillRect(x, y, w, label);
        ctx.font = '600 ' + Math.round(label * .43) + 'px system-ui, sans-serif';
        ctx.textBaseline = 'middle'; ctx.fillStyle = '#f1f6ff';
        ctx.fillText(labels[index], x + label * .38, y + label / 2, w - label * .76);
        if (!clips[index] && !showEmptyRooms) continue;
        const room = {...tile, y: y + label};
        ctx.save();
        ctx.beginPath(); ctx.rect(room.x, room.y, w, h); ctx.clip();
        if (background) cover(ctx, background, room);
        else {ctx.fillStyle = '#17243a'; ctx.fillRect(room.x, room.y, w, h);}
        if (sources[index] && clips[index]) {
          const {scale, offsetY} = settings[index];
          const rect = giftRect(room, clips[index].width, clips[index].height, scale, offsetY);
          const frame = paintGift(gifts[index], sources[index], clips[index], settings[index], rect, room);
          ctx.drawImage(frame, rect.x, rect.y);
        }
        ctx.restore();
      }
    },
    dispose() {
      for (const gift of gifts) {
        gift.unpacker?.dispose();
        for (const item of [gift.surface, gift.mask]) if (item) item.canvas.width = item.canvas.height = 1;
      }
      canvas.width = canvas.height = 1;
    },
  };
}

const checkAbort = signal => {
  if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
};

export async function exportReviewMp4({background, clips, settings, labels}, {signal, onProgress = () => {}} = {}) {
  const M = await import('./vendor/mediabunny/mediabunny.mjs');
  const layout = reviewLayout(settings.length);
  const duration = Math.max(0, ...clips.map(clip => clip?.duration || 0));
  const frameCount = Math.ceil(duration * REVIEW_FPS);
  if (!frameCount) throw new Error('No review clips');
  const readers = clips.map(() => null);
  const target = new M.BufferTarget();
  let output, renderer;
  try {
    const bitrate = clamp(Math.round(layout.width * layout.height * REVIEW_FPS * .15), 1800000, 12000000);
    const quality = new M.Quality({bitrate, bitrateMode: 'variable'});
    let codec;
    for (const profile of ['high', 'main', 'baseline']) {
      const candidate = avcCodec(layout.width, layout.height, REVIEW_FPS, bitrate, profile);
      if (await M.canEncodeVideo('avc', {width: layout.width, height: layout.height, frameRate: REVIEW_FPS, fullCodecString: candidate, quality})) {
        codec = candidate; break;
      }
    }
    if (!codec) throw Object.assign(new Error('H.264 encoder unavailable'), {code: 'encoder'});
    checkAbort(signal);
    const opened = await Promise.allSettled(clips.map(async (clip, index) => {
      if (!clip) return;
      const input = new M.Input({source: new M.BlobSource(clip.file), formats: [M.MP4]});
      const reader = readers[index] = {input};
      const track = await input.getPrimaryVideoTrack();
      const [first, end] = await Promise.all([track.getFirstTimestamp(), track.computeDuration()]);
      const count = Math.ceil(clip.duration * REVIEW_FPS);
      const resolution = giftRect(layout.tiles[index], clip.width, clip.height, settings[index].scale);
      // Packed VAP keeps the encoded dimensions so its RGB/alpha coordinates remain valid.
      const sizing = clip.config ? {} : {width: resolution.w, height: resolution.h, fit: 'fill'};
      const sink = new M.CanvasSink(track, {poolSize: 2, ...sizing});
      reader.iterator = sink.canvasesAtTimestamps(Array.from({length: count}, (_, i) => Math.min(first + (i + .5) / REVIEW_FPS, end - .000001)));
      reader.count = count;
    }));
    const failed = opened.find(result => result.status === 'rejected');
    if (failed) throw failed.reason;
    const {canvas} = surface(layout.width, layout.height);
    renderer = createReviewRenderer(canvas, layout);
    output = new M.Output({format: new M.Mp4OutputFormat({fastStart: 'in-memory'}), target});
    const source = new M.CanvasSource(canvas, {codec: 'avc', fullCodecString: codec, quality, latencyMode: 'quality', keyFrameInterval: 2});
    output.addVideoTrack(source, {frameRate: REVIEW_FPS});
    await output.start();
    for (let i = 0; i < frameCount; i++) {
      checkAbort(signal);
      const sources = await Promise.all(readers.map(async reader => {
        if (!reader || i >= reader.count) return null;
        const next = await reader.iterator.next();
        if (next.value) reader.last = next.value.canvas;
        if (!reader.last) throw new Error('The video has no decodable frame');
        return reader.last;
      }));
      renderer.draw({background, clips, settings, sources, labels});
      await source.add(i / REVIEW_FPS, 1 / REVIEW_FPS, {keyFrame: i % (REVIEW_FPS * 2) === 0});
      onProgress((i + 1) / frameCount);
      if (i % 12 === 11) await new Promise(resolve => setTimeout(resolve, 0));
    }
    checkAbort(signal);
    source.close(); await output.finalize();
    checkAbort(signal);
    return {blob: new Blob([target.buffer], {type: 'video/mp4'}), layout, duration: frameCount / REVIEW_FPS};
  } catch (error) {
    await output?.cancel().catch(() => {});
    throw error;
  } finally {
    await Promise.allSettled(readers.map(async reader => {
      if (!reader) return;
      try {await reader.iterator?.return?.();} finally {reader.input.dispose();}
    }));
    renderer?.dispose();
  }
}
