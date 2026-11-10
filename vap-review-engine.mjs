import {avcCodec, inspectVideo} from './vap-engine.mjs?v=20261110-review-preview-perf';
import {applyVerticalMask, keyPixels, normalizeVerticalMask} from './vap-matte.mjs?v=20261110-luma-cache';
import {readSourceVapConfig} from './vap-protocol.mjs';
import {createVapUnpacker} from './vap-resources.mjs?v=20261110-unpack-cache';

export const REVIEW_FPS = 30;
export const MAX_REVIEW_SLOTS = 6;
export const REVIEW_POSITION_LIMIT = 50;
const REVIEW_HD_TILE_WIDTH = 576;
const REVIEW_STANDARD_TILE_WIDTH = 512;
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

function paintGift(gift, source, clip, settings, rect, room, pixelScale, frameTime, fixedMask) {
  const w = Math.max(1, Math.round(rect.w * pixelScale)), h = Math.max(1, Math.round(rect.h * pixelScale));
  const options = clip.config ? null : matteOptions(clip, settings.key);
  const readback = options !== null && options.matteMethod !== 'opaque';
  if (!gift.surface || gift.surface.canvas.width !== w || gift.surface.canvas.height !== h || gift.config !== clip.config || gift.readback !== readback) {
    gift.unpacker?.dispose();
    if (gift.surface) gift.surface.canvas.width = gift.surface.canvas.height = 1;
    gift.surface = surface(w, h, readback);
    gift.readback = readback;
    gift.config = clip.config;
    gift.unpacker = clip.config ? createVapUnpacker({width: w, height: h, sourceVapConfig: clip.config}) : null;
    gift.workspace = {};
    gift.frameTime = undefined;
  }
  const {canvas, ctx} = gift.surface;
  const cacheFrame = frameTime !== undefined;
  const repaint = !cacheFrame || frameTime !== gift.frameTime || source !== gift.source || settings.key !== gift.key;
  if (repaint) {
    if (gift.unpacker) {
      ctx.putImageData(gift.unpacker.process(source), 0, 0);
    } else {
      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(source, 0, 0, w, h);
      if (readback) {
        const frame = ctx.getImageData(0, 0, w, h);
        frame.data.set(keyPixels(frame.data, w, h, options, gift.workspace));
        ctx.putImageData(frame, 0, 0);
      }
    }
    gift.frameTime = frameTime;
    gift.source = cacheFrame ? source : null;
    gift.key = settings.key;
    gift.compositeKey = null;
  }
  if (!settings.mask.enabled || (fixedMask && !repaint)) return canvas;
  const maskKey = room.h + ':' + JSON.stringify(settings.mask);
  if (maskKey !== gift.maskKey) {
    gift.mask ||= surface(1, room.h);
    gift.mask.canvas.height = room.h;
    const alpha = new Uint8ClampedArray(4 * room.h);
    for (let y = 0; y < room.h; y++) alpha[y * 4 + 3] = 255;
    gift.mask.ctx.putImageData(new ImageData(applyVerticalMask(alpha, 1, room.h, settings.mask), 1, room.h), 0, 0);
    gift.maskKey = maskKey;
  }
  let composite = gift.surface;
  if (cacheFrame && !fixedMask) {
    // Keep the paused, keyed source intact while the editor moves the room mask over it.
    const compositeKey = maskKey + ':' + rect.y + ':' + rect.h;
    if (compositeKey === gift.compositeKey) return gift.composite.canvas;
    if (!gift.composite || gift.composite.canvas.width !== w || gift.composite.canvas.height !== h) {
      if (gift.composite) gift.composite.canvas.width = gift.composite.canvas.height = 1;
      gift.composite = surface(w, h);
    }
    composite = gift.composite;
    composite.ctx.clearRect(0, 0, w, h);
    composite.ctx.drawImage(canvas, 0, 0);
    gift.compositeKey = compositeKey;
  }
  composite.ctx.save();
  composite.ctx.globalCompositeOperation = 'destination-in';
  // Translate the room-space mask into the local preview or export surface.
  const heightRatio = h / rect.h;
  composite.ctx.drawImage(gift.mask.canvas, 0, (room.y - rect.y) * heightRatio, w, room.h * heightRatio);
  composite.ctx.restore();
  return composite.canvas;
}

function disposeGift(gift) {
  gift.unpacker?.dispose();
  for (const item of [gift.surface, gift.mask, gift.composite]) if (item) item.canvas.width = item.canvas.height = 1;
}

function paintRoom(ctx, room, background) {
  if (background) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(room.x, room.y, room.w, room.h);
    ctx.clip();
    cover(ctx, background, room);
    ctx.restore();
  } else {
    ctx.fillStyle = '#17243a';
    ctx.fillRect(room.x, room.y, room.w, room.h);
  }
}

function paintBackdrop(ctx, layout, rooms, background, clips, labels, showEmptyRooms) {
  ctx.fillStyle = '#111b2b'; ctx.fillRect(0, 0, layout.width, layout.height);
  for (const [index, tile] of layout.tiles.entries()) {
    const {x, y, w, label} = tile;
    ctx.fillStyle = '#233247'; ctx.fillRect(x, y, w, label);
    ctx.font = '600 ' + Math.round(label * .43) + 'px system-ui, sans-serif';
    ctx.textBaseline = 'middle'; ctx.fillStyle = '#f1f6ff';
    ctx.fillText(labels[index], x + label * .38, y + label / 2, w - label * .76);
    if (clips[index] || showEmptyRooms) paintRoom(ctx, rooms[index], background);
  }
}

export function createReviewRenderer(canvas, layout, {exportBackdrop} = {}) {
  canvas.width = layout.width; canvas.height = layout.height;
  const ctx = canvas.getContext('2d', {alpha: false});
  const gifts = layout.tiles.map(() => ({}));
  const rooms = layout.tiles.map(tile => ({...tile, y: tile.y + tile.label}));
  if (!ctx) throw new Error('Canvas 2D unavailable');
  ctx.imageSmoothingQuality = 'high';
  // The room artwork and labels are fixed throughout an export.
  const backdrop = exportBackdrop && surface(layout.width, layout.height);
  if (backdrop) paintBackdrop(backdrop.ctx, layout, rooms, exportBackdrop.background, [], exportBackdrop.labels, true);
  return {
    draw({background, clips, settings, sources, labels, showEmptyRooms = true, pixelScale = 1, frameTimes = []}) {
      const width = Math.max(1, Math.round(layout.width * pixelScale));
      const height = Math.max(1, Math.round(layout.height * pixelScale));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
        ctx.setTransform(width / layout.width, 0, 0, height / layout.height, 0, 0);
        ctx.imageSmoothingQuality = 'high';
      }
      if (backdrop) ctx.drawImage(backdrop.canvas, 0, 0);
      else paintBackdrop(ctx, layout, rooms, background, clips, labels, showEmptyRooms);
      for (const [index, room] of rooms.entries()) {
        const clip = clips[index];
        if (!clip && gifts[index].surface) {
          disposeGift(gifts[index]);
          gifts[index] = {};
        }
        if (sources[index] && clip) {
          ctx.save();
          ctx.beginPath(); ctx.rect(room.x, room.y, room.w, room.h); ctx.clip();
          const {scale, offsetY} = settings[index];
          const rect = giftRect(room, clip.width, clip.height, scale, offsetY);
          const frame = paintGift(gifts[index], sources[index], clip, settings[index], rect, room, pixelScale, frameTimes[index], !!backdrop);
          ctx.drawImage(frame, rect.x, rect.y, rect.w, rect.h);
          ctx.restore();
        }
      }
    },
    dispose() {
      for (const gift of gifts) disposeGift(gift);
      if (backdrop) backdrop.canvas.width = backdrop.canvas.height = 1;
      canvas.width = canvas.height = 1;
    },
  };
}

const checkAbort = signal => {
  if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
};

async function chooseReviewEncoding(M, count, signal) {
  const widths = count <= 3
    ? [REVIEW_HD_TILE_WIDTH, REVIEW_STANDARD_TILE_WIDTH, 432]
    : [REVIEW_STANDARD_TILE_WIDTH, 432];
  const bitsPerPixelPerFrame = count === 2 ? .10 : .17;
  for (const tileWidth of widths) {
    const layout = reviewLayout(count, tileWidth);
    const bitrate = clamp(Math.round(layout.width * layout.height * REVIEW_FPS * bitsPerPixelPerFrame), 2000000, 16000000);
    const quality = new M.Quality({bitrate, bitrateMode: 'variable'});
    for (const profile of ['high', 'main', 'baseline']) {
      checkAbort(signal);
      const codec = avcCodec(layout.width, layout.height, REVIEW_FPS, bitrate, profile);
      if (await M.canEncodeVideo('avc', {width: layout.width, height: layout.height, frameRate: REVIEW_FPS, fullCodecString: codec, quality})) {
        return {layout, codec, quality};
      }
    }
  }
  throw Object.assign(new Error('H.264 encoder unavailable'), {code: 'encoder'});
}

export async function exportReviewMp4({background, clips, settings, labels}, {signal, onProgress = () => {}} = {}) {
  const M = await import('./vendor/mediabunny/mediabunny.mjs');
  const duration = Math.max(0, ...clips.map(clip => clip?.duration || 0));
  const frameCount = Math.ceil(duration * REVIEW_FPS);
  if (!frameCount) throw new Error('No review clips');
  const readers = clips.map(() => null);
  const target = new M.BufferTarget();
  let output, renderer, pendingFrame;
  try {
    const {layout, codec, quality} = await chooseReviewEncoding(M, settings.length, signal);
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
    renderer = createReviewRenderer(canvas, layout, {exportBackdrop: {background, labels}});
    output = new M.Output({format: new M.Mp4OutputFormat({fastStart: 'in-memory'}), target});
    const source = new M.CanvasSource(canvas, {codec: 'avc', fullCodecString: codec, quality, latencyMode: 'quality', keyFrameInterval: 2});
    output.addVideoTrack(source, {frameRate: REVIEW_FPS});
    await output.start();
    const readFrame = i => Promise.allSettled(readers.map(async reader => {
      if (!reader || i >= reader.count) return null;
      const next = await reader.iterator.next();
      // The sink cycles its canvases even when two requested times select
      // the same decoded frame. Keep the prepared frame until its timestamp changes.
      if (next.value && (!Number.isFinite(next.value.timestamp) || next.value.timestamp !== reader.last?.timestamp))
        reader.last = next.value;
      if (!reader.last) throw new Error('The video has no decodable frame');
      return reader.last;
    }));
    pendingFrame = readFrame(0);
    for (let i = 0; i < frameCount; i++) {
      checkAbort(signal);
      const frames = await pendingFrame;
      checkAbort(signal);
      const failed = frames.find(result => result.status === 'rejected');
      if (failed) throw failed.reason;
      const decoded = frames.map(result => result.value);
      renderer.draw({clips, settings, sources: decoded.map(frame => frame?.canvas), frameTimes: decoded.map(frame => frame?.timestamp)});
      // Only prefetch after composition has finished reading the current source canvases.
      pendingFrame = i + 1 < frameCount ? readFrame(i + 1) : null;
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
    await pendingFrame;
    await Promise.allSettled(readers.map(async reader => {
      if (!reader) return;
      try {await reader.iterator?.return?.();} finally {reader.input.dispose();}
    }));
    renderer?.dispose();
  }
}
