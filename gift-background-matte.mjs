const MAX_SIDE = 2048;

function median(histogram, count) {
  let total = 0;
  for (let value = 0; value < 256; value++) {
    total += histogram[value];
    if (total > count / 2) return value;
  }
  return 0;
}

// Bright wisps may cross an edge. Require the dominant colour on every edge,
// and almost all of each corner patch, to agree on one nearly black backdrop.
function darkBackground(rgba, width, height) {
  const sides = [];
  for (let side = 0; side < 4; side++) {
    const length = side < 2 ? width : height;
    const count = Math.min(512, length);
    const pixels = [];
    const histograms = [new Uint32Array(256), new Uint32Array(256), new Uint32Array(256)];
    for (let sample = 0; sample < count; sample++) {
      const position = count === 1 ? 0 : Math.round(sample * (length - 1) / (count - 1));
      const x = side < 2 ? position : side === 2 ? 0 : width - 1;
      const y = side < 2 ? side === 0 ? 0 : height - 1 : position;
      const index = (y * width + x) * 4;
      if (rgba[index + 3] !== 255) return null;
      pixels.push(index);
      for (let channel = 0; channel < 3; channel++) histograms[channel][rgba[index + channel]]++;
    }
    const colour = histograms.map(histogram => median(histogram, count));
    if (Math.max(...colour) > 8 || Math.max(...colour) - Math.min(...colour) > 3) return null;
    sides.push({pixels, colour});
  }
  const background = [0, 1, 2].map(channel => {
    const values = sides.map(side => side.colour[channel]).sort((a, b) => a - b);
    return Math.round((values[1] + values[2]) / 2);
  });
  const matches = index => Math.abs(rgba[index] - background[0]) <= 3
    && Math.abs(rgba[index + 1] - background[1]) <= 3
    && Math.abs(rgba[index + 2] - background[2]) <= 3;
  let matching = 0, sampled = 0;
  for (const side of sides) {
    if (side.colour.some((value, channel) => Math.abs(value - background[channel]) > 2)) return null;
    let count = 0;
    for (const index of side.pixels) if (matches(index)) count++;
    if (count / side.pixels.length < .7) return null;
    matching += count;
    sampled += side.pixels.length;
  }
  if (matching / sampled < .85) return null;

  const patch = Math.max(1, Math.min(16, Math.floor(Math.min(width, height) / 32)));
  for (const startY of [0, height - patch]) for (const startX of [0, width - patch]) {
    let count = 0;
    for (let y = startY; y < startY + patch; y++) for (let x = startX; x < startX + patch; x++) {
      const index = (y * width + x) * 4;
      if (rgba[index + 3] !== 255) return null;
      if (matches(index)) count++;
    }
    if (count / (patch * patch) < .96) return null;
  }
  return background;
}

// Thin light rings should not enclose a false subject. Open the bright mask,
// flood its outside, then retain only enclosed holes containing actual shading.
function protectEnclosedShading(rgba, data, density, width, height, background) {
  const stride = width + 1, length = width * height;
  const solid = new Uint8Array(length);
  const radius = Math.max(1, Math.round(Math.min(width, height) / 640));
  const size = radius * 2 + 1, area = size * size;
  // Erosion removes narrow particles and glow strands from the barrier.
  for (let y = radius; y < height - radius; y++) for (let x = radius; x < width - radius; x++) {
    const top = y - radius, bottom = y + radius + 1, left = x - radius, right = x + radius + 1;
    const count = density[bottom * stride + right] - density[top * stride + right]
      - density[bottom * stride + left] + density[top * stride + left];
    if (count === area) solid[y * width + x] = 1;
  }
  // Reuse the integral storage for the dilation half of the opening.
  density.fill(0);
  for (let y = 0; y < height; y++) {
    let row = 0;
    for (let x = 0; x < width; x++) {
      row += solid[y * width + x];
      density[(y + 1) * stride + x + 1] = density[y * stride + x + 1] + row;
    }
  }
  for (let y = 0; y < height; y++) {
    const top = Math.max(0, y - radius), bottom = Math.min(height, y + radius + 1);
    for (let x = 0; x < width; x++) {
      const left = Math.max(0, x - radius), right = Math.min(width, x + radius + 1);
      const count = density[bottom * stride + right] - density[top * stride + right]
        - density[bottom * stride + left] + density[top * stride + left];
      solid[y * width + x] = count > 0 ? 1 : 0;
    }
  }

  const queue = new Int32Array(length);
  let tail = 0;
  const enqueue = pixel => {
    if (solid[pixel] === 0) { solid[pixel] = 2; queue[tail++] = pixel; }
  };
  const flood = () => {
    for (let head = 0; head < tail; head++) {
      const pixel = queue[head], x = pixel % width;
      if (x > 0) enqueue(pixel - 1);
      if (x + 1 < width) enqueue(pixel + 1);
      if (pixel >= width) enqueue(pixel - width);
      if (pixel + width < length) enqueue(pixel + width);
    }
  };
  for (let x = 0; x < width; x++) { enqueue(x); enqueue((height - 1) * width + x); }
  for (let y = 0; y < height; y++) { enqueue(y * width); enqueue(y * width + width - 1); }
  flood();

  const base = Math.max(...background);
  for (let pixel = 0; pixel < length; pixel++) {
    if (solid[pixel] !== 0) continue;
    tail = 0; enqueue(pixel); flood();
    let sum = 0, positive = 0, textured = 0;
    for (let index = 0; index < tail; index++) {
      const offset = queue[index] * 4;
      const maximum = Math.max(rgba[offset], rgba[offset + 1], rgba[offset + 2]);
      const signal = Math.max(rgba[offset] - background[0], rgba[offset + 1] - background[1], rgba[offset + 2] - background[2]);
      sum += Math.max(0, maximum - base);
      if (signal > 0) positive++;
      if (maximum - base >= 8) textured++;
    }
    // A truly black or barely glowing enclosed void remains transparent.
    // Allow some exact black pixels so noses, teeth gaps and eye shadows stay whole.
    if (sum / tail >= 12 && positive / tail >= .85 && textured / tail >= .55) {
      for (let index = 0; index < tail; index++) data[queue[index]] = 255;
    }
  }
}

/**
 * Fast, conservative matte for opaque artwork rendered over a flat black base.
 * Returns null for other backgrounds, so callers can use their semantic model.
 * data is one alpha byte per source pixel; RGB is intentionally left untouched.
 * recoverBlack tells the renderer to unpremultiply original RGB by this alpha.
 * onProgress receives .1 after detection, .6 after the matte, and 1 on completion.
 */
export function darkMatte(rgba, width, height, onProgress = () => {}) {
  if (!(rgba instanceof Uint8ClampedArray) || !Number.isInteger(width) || !Number.isInteger(height)
    || width < 1 || height < 1 || width > MAX_SIDE || height > MAX_SIDE
    || rgba.length !== width * height * 4) throw new Error('图片像素尺寸无效。');
  if (width < 16 || height < 16) return null;
  const background = darkBackground(rgba, width, height);
  if (!background) return null;
  onProgress(.1);

  const data = new Uint8ClampedArray(width * height);
  const stride = width + 1;
  const density = new Uint32Array(stride * (height + 1));
  const strong = 48 + Math.max(...background);
  for (let y = 0; y < height; y++) {
    let row = 0;
    for (let x = 0; x < width; x++) {
      const pixel = y * width + x, index = pixel * 4;
      // Existing transparency should retain its original compositing semantics.
      if (rgba[index + 3] !== 255) return null;
      const maximum = Math.max(rgba[index], rgba[index + 1], rgba[index + 2]);
      const signal = Math.max(rgba[index] - background[0], rgba[index + 1] - background[1], rgba[index + 2] - background[2]);
      // No light threshold: even a single positive byte survives. Using the
      // original maximum also permits lossless RGB recovery on a black canvas.
      data[pixel] = signal > 0 ? maximum : 0;
      if (maximum >= strong) row++;
      density[(y + 1) * stride + x + 1] = density[y * stride + x + 1] + row;
    }
  }
  onProgress(.6);

  // Protect dark facial details and shading only inside locally solid artwork.
  // A box density is linear-time and does not fill large holes inside light rings.
  const radius = Math.max(2, Math.round(Math.min(width, height) * .028));
  for (let y = 0; y < height; y++) {
    const top = Math.max(0, y - radius), bottom = Math.min(height, y + radius + 1);
    for (let x = 0; x < width; x++) {
      const left = Math.max(0, x - radius), right = Math.min(width, x + radius + 1);
      const count = density[bottom * stride + right] - density[top * stride + right]
        - density[bottom * stride + left] + density[top * stride + left];
      const coverage = count / ((right - left) * (bottom - top));
      if (coverage <= .65) continue;
      const t = Math.min(1, (coverage - .65) / .23);
      const protection = Math.round(255 * t * t * (3 - 2 * t));
      const pixel = y * width + x;
      if (protection > data[pixel]) data[pixel] = protection;
    }
  }
  protectEnclosedShading(rgba, data, density, width, height, background);
  onProgress(1);
  return {width, height, data, recoverBlack: true, method: 'dark-matte'};
}
