export const GIFT_AVATAR_SEATS = [
  {x:270,y:264,size:92}, {x:450,y:264,size:92},
  {x:90,y:436,size:92}, {x:270,y:436,size:92}, {x:450,y:436,size:92}, {x:630,y:436,size:92},
  {x:90,y:608,size:92}, {x:270,y:608,size:92}, {x:450,y:608,size:92}, {x:630,y:608,size:92},
  {x:90,y:780,size:92}, {x:270,y:780,size:92}, {x:450,y:780,size:92}, {x:630,y:780,size:92},
];

const outputSize = 240;
const maxFileBytes = 16 * 1024 * 1024;
const maxPixels = 16 * 1024 * 1024;
const maxSide = 8192;

function avatarError(code, cause) {
  return Object.assign(new Error(code, {cause}), {code});
}

function checkDimensions({width, height}) {
  if (!width || !height) throw avatarError('decode');
  if (width > maxSide || height > maxSide || width * height > maxPixels) throw avatarError('size');
}

function chunkName(bytes, offset) {
  return String.fromCharCode(...bytes.subarray(offset, offset + 4));
}

function readStaticWebP(buffer) {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const tag = offset => chunkName(bytes, offset);
  const uint24 = offset => bytes[offset] | bytes[offset + 1] << 8 | bytes[offset + 2] << 16;
  if (bytes.length < 12 || tag(0) !== 'RIFF' || tag(8) !== 'WEBP') throw avatarError('type');
  if (view.getUint32(4, true) + 8 !== bytes.length) throw avatarError('decode');

  let canvas, frame;
  for (let offset = 12; offset < bytes.length;) {
    if (offset + 8 > bytes.length) throw avatarError('decode');
    const chunk = tag(offset);
    const length = view.getUint32(offset + 4, true);
    const start = offset + 8;
    const next = start + length + (length % 2);
    if (next > bytes.length) throw avatarError('decode');
    if (chunk === 'ANIM' || chunk === 'ANMF') throw avatarError('animated');
    if (chunk === 'VP8X') {
      if (length < 10 || canvas) throw avatarError('decode');
      if (bytes[start] & 0x02) throw avatarError('animated');
      canvas = {width:1 + uint24(start + 4), height:1 + uint24(start + 7)};
      checkDimensions(canvas);
    } else if (chunk === 'VP8 ' || chunk === 'VP8L') {
      if (frame) throw avatarError('decode');
      if (chunk === 'VP8 ') {
        if (length < 10 || uint24(start + 3) !== 0x2a019d) throw avatarError('decode');
        frame = {width:view.getUint16(start + 6, true) & 0x3fff, height:view.getUint16(start + 8, true) & 0x3fff};
      } else {
        if (length < 5 || bytes[start] !== 0x2f) throw avatarError('decode');
        const dimensions = view.getUint32(start + 1, true);
        frame = {width:1 + (dimensions & 0x3fff), height:1 + ((dimensions >>> 14) & 0x3fff)};
      }
      checkDimensions(frame);
    }
    offset = next;
  }
  if (!frame || (canvas && (frame.width !== canvas.width || frame.height !== canvas.height))) throw avatarError('decode');
  return frame;
}

function readStaticPng(view) {
  const bytes = new Uint8Array(view.buffer);
  if (view.byteLength < 45 || view.getUint32(8) !== 13 || chunkName(bytes, 12) !== 'IHDR') throw avatarError('decode');
  const dimensions = {width: view.getUint32(16), height: view.getUint32(20)};
  checkDimensions(dimensions);
  let hasImageData = false;
  for (let offset = 33; offset + 12 <= view.byteLength;) {
    const length = view.getUint32(offset);
    const chunk = chunkName(bytes, offset + 4);
    const next = offset + 12 + length;
    if (next > view.byteLength) throw avatarError('decode');
    if (chunk === 'acTL' || chunk === 'fcTL' || chunk === 'fdAT') throw avatarError('animated');
    if (chunk === 'IDAT') hasImageData = true;
    if (chunk === 'IEND') {
      if (length !== 0 || next !== view.byteLength || !hasImageData) throw avatarError('decode');
      return dimensions;
    }
    offset = next;
  }
  throw avatarError('decode');
}

async function decodeAvatar(blob) {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(blob);
      return {image:bitmap, width:bitmap.width, height:bitmap.height, close:() => bitmap.close()};
    } catch {
      // Some WebKit versions support WebP in <img> before ImageBitmap.
    }
  }
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = reject;
      image.src = url;
    });
    return {image, width:image.naturalWidth, height:image.naturalHeight, close:() => URL.revokeObjectURL(url)};
  } catch (error) {
    URL.revokeObjectURL(url);
    throw avatarError('decode', error);
  }
}

function sharpenUpscaledAvatar(context) {
  const image = context.getImageData(0, 0, outputSize, outputSize);
  const {data} = image;
  const luma = new Float32Array(outputSize * outputSize);
  for (let pixel = 0; pixel < luma.length; pixel++) {
    const i = pixel * 4;
    luma[pixel] = data[i] * .2126 + data[i + 1] * .7152 + data[i + 2] * .0722;
  }
  for (let y = 1; y < outputSize - 1; y++) {
    for (let x = 1; x < outputSize - 1; x++) {
      const pixel = y * outputSize + x;
      const i = pixel * 4;
      const top = pixel - outputSize, bottom = pixel + outputSize;
      // Keep the existing transparency and avoid adding halos at cutout edges.
      if (Math.min(data[i + 3], data[i - 1], data[i + 7], data[top * 4 + 3], data[bottom * 4 + 3]) < 250) continue;
      const detail = luma[pixel] - (luma[pixel - 1] + luma[pixel + 1] + luma[top] + luma[bottom]) / 4;
      if (Math.abs(detail) < 1.5) continue;
      const amount = Math.max(-4, Math.min(4, detail * .25));
      data[i] += amount;
      data[i + 1] += amount;
      data[i + 2] += amount;
    }
  }
  context.putImageData(image, 0, 0);
}

async function prepareImage(file, isFrame) {
  if (!(file instanceof Blob)) throw avatarError('type');
  if (file.size > maxFileBytes) throw avatarError('size');
  let buffer;
  try { buffer = await file.arrayBuffer(); }
  catch (error) { throw avatarError('decode', error); }
  const view = new DataView(buffer);
  const isPng = isFrame && view.byteLength >= 8 && view.getUint32(0) === 0x89504e47 && view.getUint32(4) === 0x0d0a1a0a;
  const dimensions = isPng ? readStaticPng(view) : readStaticWebP(buffer);
  const type = isPng ? 'image/png' : 'image/webp';
  const source = file.type === type ? file : file.slice(0, file.size, type);
  const decoded = await decodeAvatar(source);
  try {
    const {image, width, height} = decoded;
    checkDimensions(decoded);
    if (!isPng && width === outputSize && height === outputSize && dimensions.width === width && dimensions.height === height) return source;
    const canvas = document.createElement('canvas');
    canvas.width = outputSize;
    canvas.height = outputSize;
    const context = canvas.getContext('2d', {willReadFrequently:true});
    try {
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = 'high';
      if (isFrame) {
        const scale = outputSize / Math.max(width, height);
        const scaledWidth = Math.max(1, Math.round(width * scale));
        const scaledHeight = Math.max(1, Math.round(height * scale));
        const x = Math.floor((outputSize - scaledWidth) / 2);
        const y = Math.floor((outputSize - scaledHeight) / 2);
        context.drawImage(image, x, y, scaledWidth, scaledHeight);
      } else {
        const side = Math.min(width, height);
        context.drawImage(image, (width - side) / 2, (height - side) / 2, side, side, 0, 0, outputSize, outputSize);
        if (side < outputSize) sharpenUpscaledAvatar(context);
      }
      return await globalThis.canvasToLosslessWebP(canvas);
    } catch (error) {
      throw avatarError('encode', error);
    }
  } finally {
    decoded.close();
  }
}

export function prepareGiftAvatar(file) {
  return prepareImage(file, false);
}

export function prepareGiftAvatarFrame(file) {
  return prepareImage(file, true);
}
