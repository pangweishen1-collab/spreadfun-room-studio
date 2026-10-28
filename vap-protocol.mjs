/**
 * Browser-compatible VAP v2 layout, JSON,
 * and MP4 top-level 'vapc' box append/inspect.
 *
 * Adapted from the supplied protocol reference. Format: Tencent VAP v2.
 * This module operates on finalized MP4 bytes. It is not device certification.
 */

const utf8Encoder = new TextEncoder();
const utf8Decoder = new TextDecoder('utf-8', { fatal: true });
const REQUIRED_INFO_FIELDS = [
  'v', 'f', 'w', 'h', 'fps', 'videoW', 'videoH',
  'aFrame', 'rgbFrame', 'isVapx', 'orien',
];

export function align16(n) {
  if (!Number.isSafeInteger(n) || n <= 0) throw new RangeError('dimension must be a positive safe integer');
  return Math.ceil(n / 16) * 16;
}

function checkInt(name, val, min, max = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(val) || val < min || val > max) {
    throw new RangeError(`${name} must be an integer in [${min}, ${max}]`);
  }
}

export function computeVapLayout({
  width = 720, height = 1560, alphaScale = 0.5, gap = 8,
  orientation = 'horizontal',
} = {}) {
  checkInt('width', width, 1, 8192);
  checkInt('height', height, 1, 8192);
  checkInt('gap', gap, 4, 256);
  if (![0.5, 1].includes(alphaScale)) throw new RangeError('alphaScale must be 0.5 or 1');
  if (!['horizontal', 'vertical'].includes(orientation)) throw new RangeError('unknown orientation');

  const aw = Math.floor(width * alphaScale);
  const ah = Math.floor(height * alphaScale);
  if (aw <= 0 || ah <= 0) throw new RangeError('alpha rectangle would be empty');

  const rgbFrame = [0, 0, width, height];
  const aFrame = orientation === 'horizontal'
    ? [width + gap, 0, aw, ah]
    : [0, height + gap, aw, ah];
  const unalignedWidth = orientation === 'horizontal'
    ? width + gap + aw : Math.max(width, aw);
  const unalignedHeight = orientation === 'horizontal'
    ? Math.max(height, ah) : height + gap + ah;
  const videoW = align16(unalignedWidth);
  const videoH = align16(unalignedHeight);

  return {
    w: width, h: height, videoW, videoH,
    rgbFrame, aFrame,
    alphaScale, gap, orientation,
    legacyDimensionWarning: Math.max(videoW, videoH) > 1504,
  };
}

export function makeVapc({
  width = 720, height = 1560, fps = 24, frames = 240,
  alphaScale = 0.5, gap = 8, orientation = 'horizontal', packedLayout,
} = {}) {
  checkInt('fps', fps, 1, 120);
  checkInt('frames', frames, 1, 100_000);
  const layout = packedLayout || computeVapLayout({width, height, alphaScale, gap, orientation});
  const vapc = {
    info: {
      v: 2,
      f: frames,
      w: layout.w,
      h: layout.h,
      fps,
      videoW: layout.videoW,
      videoH: layout.videoH,
      aFrame: layout.aFrame,
      rgbFrame: layout.rgbFrame,
      isVapx: 0,
      orien: 0,
    }
  };
  validateVapc(vapc);
  return vapc;
}

function rectsOverlap(a, b) {
  return a[0] < b[0] + b[2] && b[0] < a[0] + a[2]
    && a[1] < b[1] + b[3] && b[1] < a[1] + a[3];
}

export function validateVapc(config) {
  const i = config?.info;
  if (!i || typeof i !== 'object') throw new TypeError('vapc.info missing');
  for (const k of REQUIRED_INFO_FIELDS) {
    if (!Object.hasOwn(i, k)) throw new TypeError(`vapc.info.${k} missing`);
  }
  if (i.v !== 2) throw new Error('legacy Tencent SDK requires vapc.info.v = 2');
  checkInt('f', i.f, 1, 100_000);
  checkInt('w', i.w, 1, 8192);
  checkInt('h', i.h, 1, 8192);
  checkInt('fps', i.fps, 1, 120);
  checkInt('videoW', i.videoW, 1, 16384);
  checkInt('videoH', i.videoH, 1, 16384);
  if (i.videoW % 16 !== 0 || i.videoH % 16 !== 0) {
    throw new Error('reference exporter expects packed dimensions aligned to 16');
  }
  if (![0, 1].includes(i.isVapx) || i.orien !== 0) {
    throw new Error('VAP requires isVapx 0/1 and default orientation');
  }
  for (const key of ['rgbFrame', 'aFrame']) {
    const r = i[key];
    if (!Array.isArray(r) || r.length !== 4) throw new TypeError(`${key} must be [x,y,w,h]`);
    r.forEach((x, j) => checkInt(`${key}[${j}]`, x, j < 2 ? 0 : 1));
    if (r[0] + r[2] > i.videoW || r[1] + r[3] > i.videoH) {
      throw new Error(`${key} exceeds packed video dimension`);
    }
  }
  if (i.rgbFrame[2] !== i.w || i.rgbFrame[3] !== i.h) {
    throw new Error('RGB rectangle must match visible content dimensions');
  }
  if (rectsOverlap(i.rgbFrame, i.aFrame)) throw new Error('RGB/alpha rectangles overlap');
  if(i.isVapx===1){
    if(!Array.isArray(config.src)||!config.src.length||config.src.length>64||!Array.isArray(config.frame)||config.frame.length>i.f) throw new Error('Vapx source/frame declarations missing or too large');
    const ids=new Set(),tags=new Set();
    for(const src of config.src){
      if(!src||typeof src.srcId!=='string'||!src.srcId||src.srcId.length>64||ids.has(src.srcId)||typeof src.srcTag!=='string'||!src.srcTag||src.srcTag.length>200||tags.has(src.srcTag))throw new Error('Vapx source IDs and tags must be unique strings');
      if(!['img','txt'].includes(src.srcType)||!['net','local'].includes(src.loadType))throw new Error('Unknown Vapx resource type');
      checkInt('source.w',src.w,1,8192);checkInt('source.h',src.h,1,8192);ids.add(src.srcId);tags.add(src.srcTag);
    }
    const seen=new Set();
    for(const frame of config.frame){
      checkInt('frame.i',frame?.i,0,i.f-1);if(seen.has(frame.i))throw new Error('Duplicate Vapx frame index');seen.add(frame.i);
      if(!Array.isArray(frame.obj)||frame.obj.length>config.src.length)throw new Error('Invalid Vapx frame objects');
      const frameIds=new Set();
      for(const obj of frame.obj){
        if(!ids.has(obj?.srcId)||frameIds.has(obj.srcId))throw new Error('Unknown or duplicate Vapx source in frame');frameIds.add(obj.srcId);
        checkInt('object.z',obj.z,0,100000);if(![0,90].includes(obj.mt))throw new Error('Unsupported Vapx mask transform');
        for(const key of ['frame','mFrame']){
          const r=obj[key];if(!Array.isArray(r)||r.length!==4)throw new Error('Invalid Vapx rectangle');
          r.forEach((value,index)=>checkInt(`object.${key}[${index}]`,value,index<2?(key==='frame'?-16384:0):1,16384));
        }
        const m=obj.mFrame;
        if(m[0]+m[2]>i.videoW||m[1]+m[3]>i.videoH||rectsOverlap(m,i.rgbFrame)||rectsOverlap(m,i.aFrame))throw new Error('Vapx resource mask overlaps base planes or exceeds video');
      }
    }
  }
  return true;
}

export function parseMp4TopLevelBoxes(bytes) {
  if (!(bytes instanceof Uint8Array)) throw new TypeError('pass MP4 bytes as Uint8Array');
  const boxes = [];
  let offset = 0;
  while (offset < bytes.byteLength) {
    if (offset + 8 > bytes.byteLength) throw new Error('truncated MP4 box header');
    const view = new DataView(bytes.buffer, bytes.byteOffset + offset, bytes.byteLength - offset);
    let len = view.getUint32(0, false);
    const type = String.fromCharCode(bytes[offset + 4], bytes[offset + 5], bytes[offset + 6], bytes[offset + 7]);
    let headerSize = 8;
    let extendsToEof = false;
    if (len === 1) {
      if (offset + 16 > bytes.byteLength) throw new Error('truncated extended MP4 box');
      const largeSize = view.getBigUint64(8, false);
      if (largeSize > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('box size exceeds JS safe integer');
      len = Number(largeSize);
      headerSize = 16;
    } else if (len === 0) {
      len = bytes.byteLength - offset;
      extendsToEof = true;
    }
    if (len < headerSize || len > bytes.byteLength - offset) throw new Error(`invalid MP4 ${type} box size`);
    boxes.push({ type, offset, size: len, headerSize, extendsToEof });
    offset += len;
  }
  return boxes;
}

export function appendVapcBox(mp4Bytes, config, {maxJsonBytes = 1_000_000} = {}) {
  validateVapc(config);
  const boxes = parseMp4TopLevelBoxes(mp4Bytes);
  for (const type of ['ftyp', 'moov', 'mdat']) {
    if (!boxes.some(b => b.type === type)) throw new Error(`finalized MP4 missing ${type}`);
  }
  if (boxes.some(b => b.type === 'vapc')) throw new Error('MP4 already contains vapc');
  if (boxes.some(b => b.extendsToEof)) {
    throw new Error('cannot append a box after an MP4 atom with size=0 extending to EOF');
  }
  const payload = utf8Encoder.encode(JSON.stringify(config));
  if (payload.byteLength > maxJsonBytes) throw new Error('vapc JSON exceeds configured limit');
  const boxLength = payload.byteLength + 8;
  if (boxLength > 0xffff_ffff) throw new Error('vapc box too large');

  const result = new Uint8Array(mp4Bytes.byteLength + boxLength);
  result.set(mp4Bytes, 0);
  const pos = mp4Bytes.byteLength;
  const dv = new DataView(result.buffer, pos, 8);
  dv.setUint32(0, boxLength, false);
  result.set([0x76, 0x61, 0x70, 0x63], pos + 4); // 'vapc'
  result.set(payload, pos + 8);
  return result;
}

export function extractVapcBox(mp4Bytes) {
  const boxes = parseMp4TopLevelBoxes(mp4Bytes).filter(b => b.type === 'vapc');
  if (boxes.length !== 1) throw new Error(`expected exactly 1 vapc, found ${boxes.length}`);
  const box = boxes[0];
  const payload = mp4Bytes.subarray(box.offset + box.headerSize, box.offset + box.size);
  const config = JSON.parse(utf8Decoder.decode(payload));
  validateVapc(config);
  return config;
}

/** Inspect only MP4 atom headers and the bounded vapc payload, not video bytes. */
export async function readSourceVapConfig(blob,{maxJsonBytes=1_000_000}={}){
  if(!(blob instanceof Blob)||!Number.isSafeInteger(blob.size)||blob.size<8||blob.size>200*1024*1024)throw new TypeError('Invalid MP4 source');
  checkInt('maxJsonBytes',maxJsonBytes,1,1_000_000);
  let offset=0,config=null;
  while(offset<blob.size){
    if(offset+8>blob.size)throw new Error('truncated MP4 box header');
    const head=new Uint8Array(await blob.slice(offset,Math.min(blob.size,offset+16)).arrayBuffer());
    const view=new DataView(head.buffer,head.byteOffset,head.byteLength);
    let size=view.getUint32(0,false),headerSize=8;
    const type=String.fromCharCode(...head.subarray(4,8));
    if(size===1){
      if(head.byteLength<16)throw new Error('truncated extended MP4 box');
      const extended=view.getBigUint64(8,false);if(extended>BigInt(Number.MAX_SAFE_INTEGER))throw new Error('MP4 box too large');
      size=Number(extended);headerSize=16;
    }else if(size===0)size=blob.size-offset;
    if(size<headerSize||size>blob.size-offset)throw new Error('invalid MP4 box size');
    if(type==='vapc'){
      if(config)throw new Error('duplicate vapc box');
      if(size-headerSize>maxJsonBytes)throw new Error('vapc JSON exceeds configured limit');
      config=JSON.parse(utf8Decoder.decode(await blob.slice(offset+headerSize,offset+size).arrayBuffer()));
      validateVapc(config);
    }
    offset+=size;
  }
  return config;
}
