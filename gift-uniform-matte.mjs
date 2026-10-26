const clamp = value => Math.max(0, Math.min(1, value));

function validateBackground(background) {
  if (!Array.isArray(background) || background.length !== 3
    || [0, 1, 2].some(channel => !Number.isFinite(background[channel]) || background[channel] < 0 || background[channel] > 255)) throw new Error('背景颜色无效。');
}

function coverageAt(rgb, offset, background) {
  let minimum = 0;
  for (let channel = 0; channel < 3; channel++) {
    const delta = rgb[offset + channel] - background[channel];
    const denominator = delta >= 0 ? 255 - background[channel] : background[channel];
    if (denominator > 0) minimum = Math.max(minimum, Math.abs(delta) / denominator);
  }
  return clamp(minimum);
}

export function minimumCoverage(rgb, background) {
  validateBackground(background);
  if (!(Array.isArray(rgb) || ArrayBuffer.isView(rgb)) || rgb.length !== 3
    || [0, 1, 2].some(channel => !Number.isFinite(rgb[channel]) || rgb[channel] < 0 || rgb[channel] > 255)) throw new Error('像素颜色无效。');
  return coverageAt(rgb, 0, background);
}

// A learned native-sized matte supplies material coverage. The RGB gamut
// bound retains weak light; only colour-matching exterior tails are cleared.
// A flat composite cannot uniquely recover the original alpha or emission.
export function composeUniformMatte(rgba, width, height, prior, background = [0, 0, 0]) {
  if (!(rgba instanceof Uint8ClampedArray) || !Number.isInteger(width) || !Number.isInteger(height)
    || width < 1 || height < 1 || width > 2048 || height > 2048 || rgba.length !== width * height * 4) throw new Error('图片像素尺寸无效。');
  validateBackground(background);
  if (!(prior instanceof Float32Array || prior instanceof Float64Array) || prior.length !== width * height) throw new Error('主体透明度须为原生尺寸的归一浮点数组。');
  for (const alpha of prior) if (!Number.isFinite(alpha) || alpha < 0 || alpha > 1) throw new Error('主体透明度须在 0 到 1 之间。');

  const count = width * height, outside = new Uint8Array(count), queue = new Int32Array(count);
  let tail = 0;
  const enqueue = pixel => {
    if (outside[pixel] || prior[pixel] >= .97) return;
    const offset = pixel * 4;
    if (Math.max(Math.abs(rgba[offset] - background[0]), Math.abs(rgba[offset + 1] - background[1]), Math.abs(rgba[offset + 2] - background[2])) > 1) return;
    outside[pixel] = 1; queue[tail++] = pixel;
  };
  for (let x = 0; x < width; x++) { enqueue(x); enqueue((height - 1) * width + x); }
  for (let y = 0; y < height; y++) { enqueue(y * width); enqueue(y * width + width - 1); }
  for (let head = 0; head < tail; head++) {
    const pixel = queue[head], x = pixel % width;
    if (x) enqueue(pixel - 1); if (x + 1 < width) enqueue(pixel + 1);
    if (pixel >= width) enqueue(pixel - width); if (pixel + width < count) enqueue(pixel + width);
  }

  const data = new Uint8ClampedArray(count), foreground = new Uint8ClampedArray(rgba.length);
  for (let pixel = 0; pixel < count; pixel++) {
    const offset = pixel * 4, minimum = coverageAt(rgba, offset, background);
    const alpha = outside[pixel] ? minimum : Math.max(prior[pixel], minimum);
    const encoded = Math.round(alpha * rgba[offset + 3]);
    data[pixel] = encoded; foreground[offset + 3] = encoded;
    for (let channel = 0; channel < 3; channel++) {
      const colour = alpha ? (rgba[offset + channel] - (1 - alpha) * background[channel]) / alpha : 0;
      foreground[offset + channel] = Math.round(Math.max(0, Math.min(255, colour)));
    }
  }
  return { width, height, data, foreground, background: background.slice(), recoverBlack: false, method: 'uniform-matte' };
}
