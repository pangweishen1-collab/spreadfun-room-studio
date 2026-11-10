// The rounded body and independent ears from the approved red panda study.
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const faces = [
  {key:'front', n:[0,0,1], u:[1,0,0], v:[0,1,0]},
  {key:6, n:[0,0,-1], u:[-1,0,0], v:[0,1,0]},
  {key:3, n:[1,0,0], u:[0,0,-1], v:[0,1,0]},
  {key:4, n:[-1,0,0], u:[0,0,1], v:[0,1,0]},
  {key:2, n:[0,1,0], u:[1,0,0], v:[0,0,-1]},
  {key:5, n:[0,-1,0], u:[1,0,0], v:[0,0,1]},
];
const proportions = [.98, .9, .8];
const quad = [[0,0], [1,0], [1,1], [0,0], [1,1], [0,1]];

function vertex(face, u, v) {
  const position = face.n.map((n, axis) => n * .5 + face.u[axis] * (u - .5) + face.v[axis] * (v - .5));
  const core = position.map(value => clamp(value, -.285, .285));
  const bevel = position.map((value, axis) => value - core[axis]);
  const distance = Math.hypot(...bevel);
  const direction = bevel.map(value => value / distance);
  const rounded = core.map((value, axis) => (value + direction[axis] * .215) * proportions[axis]);
  rounded[1] -= .06;
  const normal = direction.map((value, axis) => value / proportions[axis]);
  const normalLength = Math.hypot(...normal);
  return [...rounded, ...normal.map(value => value / normalLength), u, v];
}

function triangle(a, b, c, uvs) {
  const ab = b.map((value, axis) => value - a[axis]);
  const ac = c.map((value, axis) => value - a[axis]);
  const normal = [ab[1]*ac[2]-ab[2]*ac[1], ab[2]*ac[0]-ab[0]*ac[2], ab[0]*ac[1]-ab[1]*ac[0]];
  const length = Math.hypot(...normal) || 1;
  return [a,b,c].flatMap((point, index) => [...point, ...normal.map(value => value / length), ...uvs[index]]);
}

function earGeometry(sign) {
  const outline = [[-.1,-.08], [.1,-.08], [.11,.045], [.055,.145], [-.04,.16], [-.105,.065]];
  const center = [sign * .325, .39, .015];
  const front = .105, back = -.105;
  const data = [];
  const position = (point, z, scale = 1) => [center[0] + point[0] * scale, center[1] + point[1] * scale, z + center[2]];
  const uv = point => [(point[0] + .12) / .24, (point[1] + .08) / .24];
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i], b = outline[(i + 1) % outline.length];
    const a0 = position(a, front, .82), b0 = position(b, front, .82);
    const a1 = position(a, 0), b1 = position(b, 0);
    const a2 = position(a, back, .78), b2 = position(b, back, .78);
    data.push(...triangle([center[0],center[1]+.025,front+.018], a0,b0, [[.5,.44],uv(a),uv(b)]));
    data.push(...triangle(a0,a1,b1, [uv(a),uv(a),uv(b)]), ...triangle(a0,b1,b0, [uv(a),uv(b),uv(b)]));
    data.push(...triangle(a1,a2,b2, [uv(a),uv(a),uv(b)]), ...triangle(a1,b2,b1, [uv(a),uv(b),uv(b)]));
    data.push(...triangle([center[0],center[1]+.025,back], b2,a2, [[.5,.44],uv(b),uv(a)]));
  }
  return new Float32Array(data);
}

export function buildProxyGeometry({steps = 14} = {}) {
  if (!Number.isInteger(steps) || steps < 2 || steps > 40) throw Error('3D 网格分段无效');
  const meshes = faces.map(face => {
    const data = [];
    for (let y = 0; y < steps; y++) {
      for (let x = 0; x < steps; x++) {
        for (const [dx, dy] of quad) data.push(...vertex(face, (x + dx) / steps, (y + dy) / steps));
      }
    }
    return {key:face.key, ear:false, data:new Float32Array(data)};
  });
  for (const sign of [-1, 1]) meshes.push({key:'ear', ear:true, data:earGeometry(sign)});
  return meshes;
}

export function fillPandaTexture({width, height, data}) {
  let maxAlpha = 0;
  for (let i = 3; i < data.length; i += 4) maxAlpha = Math.max(maxAlpha, data[i]);
  if (!maxAlpha) throw Error('3D 贴图完全透明');

  let left = width, top = height, right = -1, bottom = -1;
  const edgeAlpha = Math.min(8, maxAlpha);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] < edgeAlpha) continue;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
  }

  const w = right - left + 1, h = bottom - top + 1;
  const pixels = new Uint8ClampedArray(w * h * 4);
  const nearest = new Int32Array(w * h).fill(-1);
  const queue = new Int32Array(w * h);
  let head = 0, tail = 0;
  const seedAlpha = Math.min(230, maxAlpha);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const source = ((y + top) * width + x + left) * 4;
      pixels.set(data.subarray(source, source + 4), i * 4);
      if (pixels[i * 4 + 3] >= seedAlpha) {
        nearest[i] = i;
        queue[tail++] = i;
      }
    }
  }

  // Extend the nearest face color into transparent UVs on the closed model.
  while (head < tail) {
    const i = queue[head++];
    const x = i % w, y = Math.floor(i / w);
    for (const neighbor of [x ? i - 1 : -1, x + 1 < w ? i + 1 : -1, y ? i - w : -1, y + 1 < h ? i + w : -1]) {
      if (neighbor < 0 || nearest[neighbor] >= 0) continue;
      nearest[neighbor] = nearest[i];
      queue[tail++] = neighbor;
    }
  }
  for (let i = 0; i < w * h; i++) {
    const alpha = pixels[i * 4 + 3] / 255;
    const source = nearest[i] * 4;
    for (let channel = 0; channel < 3; channel++) {
      const offset = i * 4 + channel;
      pixels[offset] = pixels[offset] * alpha + pixels[source + channel] * (1 - alpha);
    }
    pixels[i * 4 + 3] = 255;
  }

  const cropped = Object.assign(document.createElement('canvas'), {width:w, height:h});
  cropped.getContext('2d').putImageData(new ImageData(pixels, w, h), 0, 0);
  const texture = Object.assign(document.createElement('canvas'), {width:256, height:256});
  texture.getContext('2d').drawImage(cropped, 0, 0, w, h, 0, 0, 256, 256);
  return texture;
}
