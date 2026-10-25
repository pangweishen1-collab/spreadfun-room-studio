const clamp = value => Math.max(0, Math.min(1, value));

function validate(rgba, width, height) {
  if (!(rgba instanceof Uint8ClampedArray) || !Number.isInteger(width) || !Number.isInteger(height)
    || width < 1 || height < 1 || width > 2048 || height > 2048 || rgba.length !== width * height * 4) throw new Error('图片像素尺寸无效。');
}

function validateMask(mask) {
  if (!mask || !Number.isInteger(mask.width) || !Number.isInteger(mask.height) || mask.width < 1 || mask.height < 1
    || mask.width > 2048 || mask.height > 2048 || !(mask.data instanceof Uint8ClampedArray) || mask.data.length !== mask.width * mask.height) throw new Error('主体蒙版无效。');
}

function alphaAt(mask, x, y, width, height) {
  const sx = Math.max(0, Math.min(mask.width - 1, (x + .5) * mask.width / width - .5));
  const sy = Math.max(0, Math.min(mask.height - 1, (y + .5) * mask.height / height - .5));
  const x0 = Math.floor(sx), y0 = Math.floor(sy), x1 = Math.min(mask.width - 1, x0 + 1), y1 = Math.min(mask.height - 1, y0 + 1);
  const fx = sx - x0, fy = sy - y0;
  return ((mask.data[y0 * mask.width + x0] * (1 - fx) + mask.data[y0 * mask.width + x1] * fx) * (1 - fy)
    + (mask.data[y1 * mask.width + x0] * (1 - fx) + mask.data[y1 * mask.width + x1] * fx) * fy) / 255;
}

function erode(binary, width, height, radius) {
  const stride = width + 1, integral = new Uint32Array(stride * (height + 1)), result = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    let row = 0;
    for (let x = 0; x < width; x++) { row += binary[y * width + x]; integral[(y + 1) * stride + x + 1] = integral[y * stride + x + 1] + row; }
  }
  for (let y = radius; y < height - radius; y++) for (let x = radius; x < width - radius; x++) {
    const left = x - radius, right = x + radius + 1, top = y - radius, bottom = y + radius + 1;
    const count = integral[bottom * stride + right] - integral[top * stride + right] - integral[bottom * stride + left] + integral[top * stride + left];
    result[y * width + x] = count === (radius * 2 + 1) ** 2 ? 1 : 0;
  }
  return result;
}

function erodeDiamond(binary, width, height, radius) {
  // Manhattan distance gives the usual cross-kernel erosion without removing
  // diagonal material corners as aggressively as a square kernel would.
  const distance = new Uint16Array(binary.length), result = new Uint8Array(binary.length);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = y * width + x;
    if (!binary[i]) continue;
    distance[i] = Math.min(x + 1, y + 1, width - x, height - y);
    if (x) distance[i] = Math.min(distance[i], distance[i - 1] + 1);
    if (y) distance[i] = Math.min(distance[i], distance[i - width] + 1);
  }
  for (let y = height - 1; y >= 0; y--) for (let x = width - 1; x >= 0; x--) {
    const i = y * width + x;
    if (!binary[i]) continue;
    if (x + 1 < width) distance[i] = Math.min(distance[i], distance[i + 1] + 1);
    if (y + 1 < height) distance[i] = Math.min(distance[i], distance[i + width] + 1);
    result[i] = distance[i] > radius ? 1 : 0;
  }
  return result;
}

export function createTrimap(rgba, width, height, prior, background = null) {
  validate(rgba, width, height); validateMask(prior);
  const foreground = new Uint8Array(width * height), outside = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const pixel = y * width + x, alpha = alphaAt(prior, x, y, width, height);
    foreground[pixel] = alpha >= .98 ? 1 : 0; outside[pixel] = alpha <= .02 ? 1 : 0;
  }
  const shortSide = Math.min(width, height);
  const core = erodeDiamond(foreground, width, height, Math.max(1, Math.round(shortSide * .014)));
  const empty = erode(outside, width, height, Math.max(1, Math.round(shortSide * .005)));
  const trimap = new Uint8ClampedArray(width * height).fill(128);
  for (let i = 0; i < trimap.length; i++) { if (empty[i]) trimap[i] = 0; if (core[i]) trimap[i] = 255; }
  if (background) {
    // Only background-colour pixels connected to the actual canvas outside are
    // hard background. Closed subject shadows never become background by colour alone.
    const visited = new Uint8Array(width * height), queue = new Int32Array(width * height); let tail = 0;
    const enqueue = pixel => {
      if (visited[pixel]) return;
      const offset = pixel * 4;
      if (Math.max(...background.map((value, channel) => Math.abs(rgba[offset + channel] - value))) > 1) return;
      visited[pixel] = 1; queue[tail++] = pixel; trimap[pixel] = 0;
    };
    for (let x = 0; x < width; x++) { enqueue(x); enqueue((height - 1) * width + x); }
    for (let y = 0; y < height; y++) { enqueue(y * width); enqueue(y * width + width - 1); }
    for (let head = 0; head < tail; head++) {
      const pixel = queue[head], x = pixel % width;
      if (x) enqueue(pixel - 1); if (x + 1 < width) enqueue(pixel + 1);
      if (pixel >= width) enqueue(pixel - width); if (pixel + width < visited.length) enqueue(pixel + width);
    }
  }
  return trimap;
}

function nearestCore(trimap, width, height) {
  if (!trimap) return null;
  const owners = new Int32Array(width * height).fill(-1), queue = new Int32Array(width * height); let tail = 0;
  for (let i = 0; i < trimap.length; i++) if (trimap[i] === 255) { owners[i] = i; queue[tail++] = i; }
  if (!tail) return null;
  const visit = (pixel, owner) => { if (owners[pixel] < 0) { owners[pixel] = owner; queue[tail++] = pixel; } };
  for (let head = 0; head < tail; head++) {
    const pixel = queue[head], x = pixel % width, owner = owners[pixel];
    if (x) visit(pixel - 1, owner); if (x + 1 < width) visit(pixel + 1, owner);
    if (pixel >= width) visit(pixel - width, owner); if (pixel + width < owners.length) visit(pixel + width, owner);
  }
  return owners;
}

export function composeDarkCutout(rgba, width, height, {subject, trimap, background = [0, 0, 0]} = {}) {
  validate(rgba, width, height); validateMask(subject);
  if (!Array.isArray(background) || background.length !== 3 || background.some(value => !Number.isFinite(value) || value < 0 || value > 255)) throw new Error('背景颜色无效。');
  if (trimap && (!(trimap instanceof Uint8ClampedArray) || trimap.length !== width * height)) throw new Error('边缘标记无效。');
  const data = new Uint8ClampedArray(width * height), foreground = new Uint8ClampedArray(rgba.length), owners = nearestCore(trimap, width, height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const pixel = y * width + x, offset = pixel * 4;
    let body = alphaAt(subject, x, y, width, height);
    if (trimap?.[pixel] === 255) body = 1;
    if (trimap?.[pixel] === 0) body = 0;
    const channels = [0, 1, 2].map(channel => Math.max(0, (rgba[offset + channel] - background[channel]) / (255 - background[channel] || 1)));
    const light = Math.max(...channels);
    if (owners && trimap[pixel] === 128) {
      const owner = owners[pixel] * 4;
      const reference = Math.max(.15, ...background.map((value, channel) => Math.max(0, (rgba[owner + channel] - value) / (255 - value || 1))));
      // ponytail: bounded local foreground-colour guidance for the uncertain
      // band only. Known dark subject pixels stay opaque. A semantic model can
      // otherwise mistake a faint light ring for an opaque brown outline.
      body = Math.min(body, light / reference);
    }
    // A separate emissive layer keeps faint light and disconnected particles,
    // without turning enclosed black holes back into solid subject pixels.
    // The source already contains both body and light. Taking their maximum
    // avoids counting the same edge twice; a union would create a dark fringe.
    const alpha = clamp(Math.max(body, light)), encoded = Math.round(alpha * rgba[offset + 3]);
    data[pixel] = encoded; foreground[offset + 3] = encoded;
    for (let channel = 0; channel < 3; channel++) {
      const value = alpha ? (rgba[offset + channel] - (1 - alpha) * background[channel]) / alpha : 0;
      foreground[offset + channel] = Math.round(Math.max(0, Math.min(255, value)));
    }
  }
  return {width, height, data, foreground, background: background.slice(), recoverBlack: false, method: 'quality-matte'};
}
