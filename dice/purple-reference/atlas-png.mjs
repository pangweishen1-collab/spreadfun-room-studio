import {crc32, encodeRgbaPng} from '../six-face/png-rgba.mjs';

function chunk(type, bytes) {
  const output = new Uint8Array(bytes.length + 12);
  const view = new DataView(output.buffer);
  view.setUint32(0, bytes.length);
  for (let i = 0; i < 4; i++) output[4 + i] = type.charCodeAt(i);
  output.set(bytes, 8);
  view.setUint32(bytes.length + 8, crc32(output.subarray(4, bytes.length + 8)));
  return output;
}

function paeth(left, above, diagonal) {
  const a = Math.abs(above - diagonal);
  const b = Math.abs(left - diagonal);
  const c = Math.abs(left + above - diagonal * 2);
  if (a <= b && a <= c) return left;
  return b <= c ? above : diagonal;
}

// Choose the reversible PNG row predictor with the smallest signed residuals.
function filterRows(width, height, rgba) {
  const stride = width * 4;
  const rows = new Uint8Array((stride + 1) * height);
  const scores = new Uint32Array(5);
  const candidates = Array.from({length: 5}, () => new Uint8Array(stride));
  const [none, sub, up, average, paethRow] = candidates;
  for (let y = 0; y < height; y++) {
    const start = y * stride;
    const last = start - stride;
    for (let i = 0; i < stride; i++) {
      const value = rgba[start + i];
      const left = i >= 4 ? rgba[start + i - 4] : 0;
      const above = y > 0 ? rgba[last + i] : 0;
      const diagonal = y > 0 && i >= 4 ? rgba[last + i - 4] : 0;
      none[i] = value;
      sub[i] = value - left;
      up[i] = value - above;
      average[i] = value - ((left + above) >>> 1);
      paethRow[i] = value - paeth(left, above, diagonal);
    }
    scores.fill(0);
    for (let filter = 0; filter < candidates.length; filter++) {
      for (const value of candidates[filter]) scores[filter] += value < 128 ? value : 256 - value;
    }
    let selected = 0;
    for (let filter = 1; filter < scores.length; filter++) {
      if (scores[filter] < scores[selected]) selected = filter;
    }
    const offset = y * (stride + 1);
    rows[offset] = selected;
    rows.set(candidates[selected], offset + 1);
  }
  return rows;
}

export async function encodeAtlasPng(width, height, rgba, {signal} = {}) {
  if (typeof CompressionStream !== 'function') return (await encodeRgbaPng(width, height, rgba, {signal})).blob;
  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  header.set([8, 6, 0, 0, 0], 8);
  const compressed = new Blob([filterRows(width, height, rgba)]).stream()
    .pipeThrough(new CompressionStream('deflate'), {signal});
  const data = new Uint8Array(await new Response(compressed).arrayBuffer());
  return new Blob([
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header),
    chunk('IDAT', data), chunk('IEND', new Uint8Array()),
  ], {type: 'image/png'});
}
