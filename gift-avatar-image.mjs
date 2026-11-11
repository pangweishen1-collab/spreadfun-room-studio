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

function readStaticWebP(buffer) {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const tag = offset => String.fromCharCode(...bytes.subarray(offset, offset + 4));
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

export async function prepareGiftAvatar(file) {
  if (!(file instanceof Blob)) throw avatarError('type');
  if (file.size > maxFileBytes) throw avatarError('size');
  let buffer;
  try { buffer = await file.arrayBuffer(); }
  catch (error) { throw avatarError('decode', error); }
  const dimensions = readStaticWebP(buffer);
  const source = file.type === 'image/webp' ? file : file.slice(0, file.size, 'image/webp');
  const decoded = await decodeAvatar(source);
  try {
    const {image, width, height} = decoded;
    checkDimensions(decoded);
    if (width === outputSize && height === outputSize && dimensions.width === width && dimensions.height === height) return source;
    const canvas = document.createElement('canvas');
    canvas.width = outputSize;
    canvas.height = outputSize;
    const context = canvas.getContext('2d', {willReadFrequently:true});
    const side = Math.min(width, height);
    try {
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = 'high';
      context.drawImage(image, (width - side) / 2, (height - side) / 2, side, side, 0, 0, outputSize, outputSize);
      if (side < outputSize) sharpenUpscaledAvatar(context);
      return await globalThis.canvasToLosslessWebP(canvas);
    } catch (error) {
      throw avatarError('encode', error);
    }
  } finally {
    decoded.close();
  }
}
