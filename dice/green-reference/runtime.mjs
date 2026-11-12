import {encodeAtlasPng} from '../purple-reference/atlas-png.mjs';
import {optimizeAtlasPng} from '../atlas-png-optimizer.mjs';
import {removeOuterStroke} from '../six-face/outer-stroke.mjs';

export const GREEN_REFERENCE_VERSION = 'green-reference-4.2.43-v1';
export const GREEN_REFERENCE_ROOT = '/dice/assets/green-reference/';
const ATLAS_WIDTH = 430;
const ATLAS_HEIGHT = 424;
const SOURCE_SIZE = 200;
// The 4.2.43 reference uses these nine region keys, trimmed bounds and offsets.
// Rotated regions are stored 90 degrees counterclockwise on the atlas page.
const REGIONS = [
  {name: '1', x: 2, y: 10, w: 152, h: 164, left: 24, bottom: 18, rotate: true},
  {name: '2', x: 168, y: 2, w: 160, h: 163, left: 20, bottom: 18, rotate: true},
  {name: 'anchor', x: 2, y: 392, w: 30, h: 30, left: 0, bottom: 0, rotate: false},
  ...[[34,294],[166,294],[298,294],[2,164],[134,164],[266,164]].map(([x, y], index) => ({
    name: 'sz_' + (index + 1), x, y, w: 128, h: 130, left: 36, bottom: 35, rotate: true,
  })),
];

function atlasText() {
  const lines = ['preview.png', 'size: 430, 424', 'filter: Linear, Linear', 'pma: false'];
  for (const {name, x, y, w, h, left, bottom, rotate} of REGIONS) {
    const original = name === 'anchor' ? 30 : SOURCE_SIZE;
    lines.push(name, `bounds: ${x}, ${y}, ${w}, ${h}`);
    if (name !== 'anchor') lines.push(`offsets: ${left}, ${bottom}, ${original}, ${original}`);
    if (rotate) lines.push('rotate: 90');
  }
  return lines.join('\n') + '\n';
}

function surface(width, height) {
  if (typeof OffscreenCanvas === 'function') return new OffscreenCanvas(width, height);
  return Object.assign(document.createElement('canvas'), {width, height});
}

function visibleBounds(image, label) {
  const width = image.width || image.naturalWidth;
  const height = image.height || image.naturalHeight;
  const scan = surface(width, height).getContext('2d', {willReadFrequently: true});
  scan.drawImage(image, 0, 0);
  const {data} = scan.getImageData(0, 0, width, height);
  let left = width, top = height, right = 0, bottom = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!data[(y * width + x) * 4 + 3]) continue;
      if (x < left) left = x;
      if (y < top) top = y;
      if (x >= right) right = x + 1;
      if (y >= bottom) bottom = y + 1;
    }
  }
  if (right <= left || bottom <= top) throw new Error(label + '：图片没有可见内容');
  return {left, top, width: right - left, height: bottom - top};
}

function fitArt(context, image, region, x, y) {
  const bounds = visibleBounds(image, region.name + '.png');
  const scale = Math.min(region.w / bounds.width, region.h / bounds.height);
  const width = bounds.width * scale, height = bounds.height * scale;
  context.drawImage(image, bounds.left, bounds.top, bounds.width, bounds.height,
    x + (region.w - width) / 2, y + (region.h - height) / 2, width, height);
}

export async function generateGreenReferenceRuntime(files, {decode, skeleton, anchorImage, signal}) {
  const images = new Map();
  const decoded = [];
  const warnings = [];
  const check = () => signal?.throwIfAborted();
  try {
    for (const file of files) {
      if (!/^(?:sz_[1-6]|[12])$/.test(file.slot)) continue;
      check();
      const loaded = await decode(file.blob, file.name);
      decoded.push(loaded);
      images.set(file.slot, loaded.drawable);
    }
    const faces = {};
    for (let point = 1; point <= 6; point++) {
      const region = REGIONS[point + 2];
      const face = surface(SOURCE_SIZE, SOURCE_SIZE);
      const context = face.getContext('2d', {willReadFrequently: true});
      fitArt(context, images.get(region.name), region, region.left, SOURCE_SIZE - region.bottom - region.h);
      const pixels = context.getImageData(0, 0, SOURCE_SIZE, SOURCE_SIZE);
      if (removeOuterStroke(pixels)) context.putImageData(pixels, 0, 0);
      faces[point] = face;
    }
    if (!images.has('1') || !images.has('2')) {
      const {generateReferenceRollArt} = await import('./roll-art.mjs');
      const rollArt = generateReferenceRollArt(faces);
      for (const name of ['1', '2']) {
        if (!images.has(name)) images.set(name, rollArt[Number(name) - 1]);
      }
      warnings.push('缺少翻滚角度图，已用六张骰面生成。提供 1.png 和 2.png 可直接使用原画。');
    }
    check();
    const sheet = surface(ATLAS_WIDTH, ATLAS_HEIGHT);
    const ctx = sheet.getContext('2d', {willReadFrequently: true});
    for (const region of REGIONS) {
      if (region.name === 'anchor') {
        ctx.drawImage(anchorImage, region.x, region.y, region.w, region.h);
        continue;
      }
      ctx.save();
      ctx.translate(region.x, region.y + region.w);
      ctx.rotate(-Math.PI / 2);
      if (region.name.startsWith('sz_')) {
        ctx.drawImage(faces[Number(region.name.slice(3))], region.left, SOURCE_SIZE - region.bottom - region.h,
          region.w, region.h, 0, 0, region.w, region.h);
      } else {
        fitArt(ctx, images.get(region.name), region, 0, 0);
      }
      ctx.restore();
    }
    const png = await encodeAtlasPng(ATLAS_WIDTH, ATLAS_HEIGHT,
      ctx.getImageData(0, 0, ATLAS_WIDTH, ATLAS_HEIGHT).data, {signal});
    // Match the reference's indexed atlas while leaving original PNGs intact.
    const texture = await optimizeAtlasPng(png, 2, 256);
    check();
    return {
      kind: 'green-reference', skel: skeleton, texture, atlasText: atlasText(), atlasPage: 'preview.png',
      warnings, metadata: {motionVersion: GREEN_REFERENCE_VERSION},
    };
  } finally {
    for (const item of decoded) item.close?.();
  }
}
