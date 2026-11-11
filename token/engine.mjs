const colorNames = Object.freeze({red: '红', green: '绿', blue: '蓝', yellow: '黄'});
const colorKeys = Object.keys(colorNames);
const smokeKeys = Array.from({length: 9}, (_, index) => `yanwu20${index + 1}`);
export const TOKEN_TRAIL_KEYS = Object.freeze(['火1', '火1-红', '火1-蓝', '火1-黄', '火2', '火2-红', '火2-蓝', '火2-黄']);
const filenames = new Map([
  ['大图.png', 'cover'], ['大棋子.png', 'cover'], ['icon.png', 'cover'], ['cover.png', 'cover'],
  ['qz-1.png', 'red'], ['qz-2.png', 'yellow'], ['qz-3.png', 'blue'], ['qz-4.png', 'green'],
]);
for (const [key, name] of Object.entries(colorNames)) {
  for (const alias of [`棋子-${name}`, `棋子-${name}色`, `token-${key}`, key]) {
    filenames.set(`${alias}.png`, key);
  }
}
for (const key of TOKEN_TRAIL_KEYS) {
  filenames.set(`${key}.png`, key);
  if (key.includes('-')) filenames.set(`${key}色.png`, key);
  else for (const alias of ['绿', '绿色']) filenames.set(`${key}-${alias}.png`, key);
}

export function tokenFileKey(name) {
  const filename = String(name || '').split(/[/\\]/).at(-1).normalize('NFKC').trim().toLowerCase()
    .replace(/[\s_–—]+/g, '-');
  return filenames.get(filename) ?? null;
}

export function tokenPackageName(name, grade = 'green') {
  const suffix = Array.from(String(name || '').normalize('NFKC').trim().toLowerCase()
    .replace(/^(?:token_(?:green|purple|perple)_)+/, '').replace(/\.(?:zip|skel|atlas|png)$/, '')
    .replace(/[^\p{L}\p{N}_-]+/gu, '_').replace(/^[_-]+|[_-]+$/g, ''))
    .slice(0, 48).join('').replace(/[_-]+$/, '');
  return `token_${grade === 'purple' ? 'purple' : 'green'}_${suffix || 'token'}`;
}

const templateRequests = new Map();
function loadTemplate(grade) {
  if (!templateRequests.has(grade)) {
    const basename = grade === 'purple' ? 'purple-template' : 'game-template';
    const request = Promise.all(['png', 'atlas', 'skel'].map(async extension => {
      const response = await fetch(new URL(`./assets/${basename}.${extension}`, import.meta.url));
      if (!response.ok) throw new Error('棋子模板加载失败，请重试');
      return extension === 'atlas' ? response.text() : response.blob();
    })).then(([texture, atlas, skel]) => ({texture, atlas, skel})).catch(error => {
      templateRequests.delete(grade);
      throw error;
    });
    templateRequests.set(grade, request);
  }
  return templateRequests.get(grade);
}

async function checkPng(file, size) {
  if (file.size > 8 * 1024 * 1024) throw new Error(`${file.name} 超过 8 MB，请重新导出 PNG`);
  const bytes = await file.slice(0, 24).arrayBuffer();
  const header = new DataView(bytes);
  if (bytes.byteLength < 24 || header.getUint32(0) !== 0x89504e47 ||
      header.getUint32(4) !== 0x0d0a1a0a || header.getUint32(12) !== 0x49484452) {
    throw new Error(`${file.name} 需要是 PNG 图片`);
  }
  const width = header.getUint32(16);
  const height = header.getUint32(20);
  if (size && (width !== size || height !== size)) {
    throw new Error(`${file.name} 需要是 ${size} × ${size} px`);
  }
  if (!width || !height || width > 4096 || height > 4096 || width * height > 4194304) {
    throw new Error(`${file.name} 的尺寸超过棋子工具支持的范围`);
  }
  try {
    return await createImageBitmap(file);
  } catch {
    throw new Error(`无法读取 ${file.name}，请重新导出 PNG`);
  }
}

function checkVisible(context, x, y, width, height, filename) {
  const pixels = context.getImageData(x, y, width, height).data;
  for (let index = 3; index < pixels.length; index += 4) {
    if (pixels[index] !== 0) return;
  }
  throw new Error(`${filename} 没有可见内容`);
}

function templateRegions(atlas) {
  return new Map(Array.from(atlas.matchAll(
    /^([^\s][^\r\n]*)\r?\n[\t ]+bounds: (\d+), (\d+), (\d+), (\d+)(?:\r?\n[\t ]+offsets: ([^\r\n]+))?(?:\r?\n[\t ]+rotate: (90))?/gm,
  ), ([, name, x, y, width, height, offsets, rotate]) =>
    [name, {x: Number(x), y: Number(y), width: Number(width), height: Number(height), offsets, rotate}]));
}

function copyRegion(context, image, atlas, name, region, x, y) {
  // Spine atlas bounds report upright sizes. Rotated pixels stay in their stored order.
  const width = region.rotate ? region.height : region.width;
  const height = region.rotate ? region.width : region.height;
  context.drawImage(image, region.x, region.y, width, height, x, y, width, height);
  atlas.push(name, `\tbounds: ${x}, ${y}, ${region.width}, ${region.height}`);
  if (region.offsets) atlas.push(`\toffsets: ${region.offsets}`);
  if (region.rotate) atlas.push(`\trotate: ${region.rotate}`);
}

function fitTrail(context, atlas, name, region, image, filename, x, y) {
  const [, , width = region.width, height = region.height] = region.offsets?.split(', ').map(Number) || [];
  const scale = Math.min(width / image.width, height / image.height);
  const w = image.width * scale;
  const h = image.height * scale;
  context.imageSmoothingQuality = 'high';
  context.drawImage(image, x + (width - w) / 2, y + (height - h) / 2, w, h);
  checkVisible(context, x, y, width, height, filename);
  atlas.push(name, `\tbounds: ${x}, ${y}, ${width}, ${height}`);
}

async function packPurpleEffects(context, atlas, template, regions, selected, trail) {
  if (!regions.has('anchor') || TOKEN_TRAIL_KEYS.some(key => !regions.has(key))) {
    throw new Error('紫色棋子模板拖尾贴图不完整');
  }
  copyRegion(context, template, atlas, 'anchor', regions.get('anchor'), 406, 226);
  const generic = trail && TOKEN_TRAIL_KEYS.some(key => !selected.has(key)) ? await checkPng(trail) : null;
  try {
    for (const [index, name] of TOKEN_TRAIL_KEYS.entries()) {
      const x = index < 3 ? 166 + index * 110 : 2 + (index - 3) * 101;
      const y = index < 3 ? 286 : 388;
      const region = regions.get(name);
      const custom = selected.get(name);
      if (custom) {
        const bitmap = await checkPng(custom);
        try {
          fitTrail(context, atlas, name, region, bitmap, custom.name, x, y);
        } finally {
          bitmap.close();
        }
      } else if (generic) {
        fitTrail(context, atlas, name, region, generic, trail.name, x, y);
      } else {
        copyRegion(context, template, atlas, name, region, x, y);
      }
    }
  } finally {
    generic?.close();
  }
}

function encodeCanvas(canvas) {
  return new Promise((resolve, reject) => canvas.toBlob(
    blob => blob ? resolve(blob) : reject(new Error('无法生成棋子贴图')),
    'image/png',
  ));
}

export async function prepareToken(files, {grade = 'green', trail = null} = {}) {
  if (grade !== 'green' && grade !== 'purple') throw new Error('棋子等级不可用');
  const selected = new Map();
  for (const file of files) {
    const key = tokenFileKey(file.name);
    if (!key || (grade === 'green' && TOKEN_TRAIL_KEYS.includes(key))) continue;
    if (selected.has(key)) throw new Error(`重复的棋子素材：${file.name}`);
    selected.set(key, file);
  }
  const missing = colorKeys.filter(key => !selected.has(key));
  if (missing.length) {
    throw new Error(`缺少棋子图：${missing.map(key => `棋子-${colorNames[key]}.png`).join('、')}`);
  }

  const template = await loadTemplate(grade);
  const cover = selected.get('cover') ?? null;
  const colors = Object.fromEntries(colorKeys.map(key => [key, selected.get(key)]));
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 512;
  const context = canvas.getContext('2d', {willReadFrequently: true});
  const atlas = ['token.png', '\tsize: 512, 512', '\tfilter: Linear, Linear'];
  if (cover) {
    const bitmap = await checkPng(cover, 240);
    try {
      context.drawImage(bitmap, 0, 0);
      checkVisible(context, 0, 0, 240, 240, cover.name);
      context.clearRect(0, 0, 240, 240);
    } finally {
      bitmap.close();
    }
  }

  const regions = templateRegions(template.atlas);
  if (smokeKeys.some(key => !regions.has(key))) throw new Error('棋子模板烟雾贴图不完整');
  const source = await createImageBitmap(template.texture);
  try {
    for (const [index, name] of smokeKeys.entries()) {
      const x = 166 + index % 5 * 60;
      const y = 166 + Math.floor(index / 5) * 60;
      copyRegion(context, source, atlas, name, regions.get(name), x, y);
    }
    if (grade === 'purple') await packPurpleEffects(context, atlas, source, regions, selected, trail);
  } finally {
    source.close();
  }

  // Keep the full source canvas so transparent padding preserves the Spine attachment origin.
  for (const [index, key] of colorKeys.entries()) {
    const x = 2 + index % 3 * 164;
    const y = 2 + Math.floor(index / 3) * 164;
    const bitmap = await checkPng(colors[key], 160);
    try {
      context.drawImage(bitmap, x, y);
      checkVisible(context, x, y, 160, 160, colors[key].name);
    } finally {
      bitmap.close();
    }
    atlas.push(`棋子-${colorNames[key]}`, `\tbounds: ${x}, ${y}, 160, 160`);
  }
  return {
    texture: await encodeCanvas(canvas),
    atlas: atlas.join('\n') + '\n',
    skel: template.skel,
    grade,
    colors,
    cover,
    warnings: [],
  };
}

export async function makeTokenZip(token, name) {
  const base = tokenPackageName(name, token.grade);
  if (!globalThis.JSZip) throw new Error('打包组件加载失败，请重试');
  const zip = new globalThis.JSZip();
  zip.file(`${base}.atlas`, token.atlas.replace(/^[^\r\n]+/, `${base}.png`));
  zip.file(`${base}.png`, token.texture);
  zip.file(`${base}.skel`, token.skel);
  return zip.generateAsync({type: 'blob'});
}
