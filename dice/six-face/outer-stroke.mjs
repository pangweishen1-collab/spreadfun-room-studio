// Decontaminate a dark outline on the outside silhouette of dice artwork.
// Preserve the source alpha and derive fill RGB from the nearest inward color.
const UNSEEN = 255;

export function removeOuterStroke({width, height, data}) {
  const length = width * height;
  const luma = new Uint8Array(length);
  let left = width, top = height, right = -1, bottom = -1;
  for (let i = 0; i < length; i++) {
    const p = i * 4;
    if (!data[p + 3]) continue;
    const x = i % width, y = Math.floor(i / width);
    left = Math.min(left, x); right = Math.max(right, x);
    top = Math.min(top, y); bottom = Math.max(bottom, y);
    luma[i] = Math.round(.2126 * data[p] + .7152 * data[p + 1] + .0722 * data[p + 2]);
  }
  if (right < left) return 0;
  const band = Math.max(2, Math.min(6, Math.round(Math.min(right-left+1, bottom-top+1) * .022)));

  // Walk exterior transparent pixels first. An enclosed hole cannot seed the
  // search or cause its outline, or nearby decorations, to be recolored.
  const depth = new Uint8Array(length).fill(UNSEEN);
  const queue = new Int32Array(length);
  let tail = 0;
  const exterior = i => {
    if (depth[i] !== UNSEEN || data[i * 4 + 3]) return;
    depth[i] = 0;
    queue[tail++] = i;
  };
  for (let x = 0; x < width; x++) { exterior(x); exterior((height - 1) * width + x); }
  for (let y = 1; y < height - 1; y++) { exterior(y * width); exterior(y * width + width - 1); }
  for (let head = 0; head < tail; head++) {
    const i = queue[head], x = i % width;
    if (x > 0) exterior(i - 1);
    if (x < width - 1) exterior(i + 1);
    if (i >= width) exterior(i - width);
    if (i < length - width) exterior(i + width);
  }
  const first = tail;
  const dark = i => luma[i] <= 75;
  let perimeter = 0, darkPerimeter = 0;
  for (let head = 0; head < tail; head++) {
    const i = queue[head], x = i % width, y = Math.floor(i / width), level = depth[i] + 1;
    if (level > band) break;
    for (let dy = Math.max(-1, -y); dy <= Math.min(1, height-1-y); dy++) {
      for (let dx = Math.max(-1, -x); dx <= Math.min(1, width-1-x); dx++) {
        const j = i + dy * width + dx;
        if (depth[j] !== UNSEEN || !data[j * 4 + 3]) continue;
        depth[j] = level;
        queue[tail++] = j;
        if (level === 1) { perimeter++; if (dark(j)) darkPerimeter++; }
      }
    }
  }
  // A few dark spots along an otherwise colored edge are usually artwork.
  if (!perimeter || darkPerimeter < perimeter * .6) return 0;

  const core = new Uint8Array(length);
  const donor = new Int32Array(tail - first).fill(-1);
  function touchesCore(i, x, y) {
    for (let dy = Math.max(-1, -y); dy <= Math.min(1, height-1-y); dy++) {
      for (let dx = Math.max(-1, -x); dx <= Math.min(1, width-1-x); dx++) {
        const j = i + dy * width + dx;
        if (depth[j] < depth[i] && core[j]) return true;
      }
    }
    return false;
  }
  for (let at = first; at < tail; at++) {
    const i = queue[at], x = i % width, y = Math.floor(i / width);
    const connected = depth[i] === 1 || touchesCore(i, x, y);
    if (!connected) continue;
    const isCore = dark(i);
    if (!isCore && (depth[i] === 1 || luma[i] > 145)) continue;

    // Follow the local inward direction and look beyond the line's blended
    // edge. Taking an actual nearby pixel retains the surrounding material hue.
    let best = -1, bestDistance = Infinity;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      let previousDepth = depth[i];
      for (let step = 1; step <= band+1; step++) {
        const nx = x + step * dx, ny = y + step * dy;
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) break;
        const j = ny * width + nx, alpha = data[j*4+3];
        if (!alpha || depth[j] < previousDepth) break;
        previousDepth = depth[j];
        if (alpha < 224 || depth[j] < Math.max(3, depth[i]+1) || luma[j] < 84) continue;
        const distance = step * step * (dx*dx + dy*dy);
        if (distance < bestDistance) { best = j; bestDistance = distance; }
        break;
      }
    }
    if (best < 0 || luma[best]-luma[i] < (isCore ? 38 : 36) || luma[i] > luma[best] * (isCore ? .72 : .76)) continue;
    if (isCore) core[i] = 1;
    donor[at - first] = best;
  }

  let changed = 0;
  // The inward donor has already been measured against the unmodified data.
  // Apply in outside-in order so it has not yet been recolored when sampled.
  for (let at = first; at < tail; at++) {
    const source = donor[at - first];
    if (source < 0) continue;
    const p = queue[at] * 4, q = source * 4;
    data[p] = data[q]; data[p+1] = data[q+1]; data[p+2] = data[q+2];
    changed++;
  }
  return changed;
}
