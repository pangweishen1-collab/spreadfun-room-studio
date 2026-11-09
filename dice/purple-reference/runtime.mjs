import {decodeFaceFiles} from '../six-face/import-faces.mjs';
import {writeSpineBinary} from '../six-face/spine-binary.mjs';
import {motionAt, exposureSamples, MOTION} from './motion.mjs';
import {settlingGain} from './presentation.mjs';
import {Proxy3DRenderer} from './proxy-3d.mjs';
import {encodeAtlasPng} from './atlas-png.mjs';

export const PURPLE_REFERENCE_MOTION_VERSION='purple05-reference-v7-compact-roll';
const atlasPage = 'dice.png';
const points = [1, 2, 3, 4, 5, 6];
const fps = 60;
const lastRollFrame = 31;
const resultAt = (lastRollFrame + 1) / fps;
const soundNames = ['dice_roll', 'sound_ui_dice6'];
// Sample the fast part at 60 fps and hold the slower poses for two ticks.
const rollFrames = Array.from({length: lastRollFrame + 1}, (_, index) => ({
  time: index / fps,
  name: 'roll_' + index,
})).filter(({time}, index) => index % 2 === 0 || (time >= .08 && time <= .45) || index === lastRollFrame);
// These poses differ from the opening mostly by a small in-plane rotation.
const reusedRollNames = new Set(['roll_2', 'roll_30', 'roll_31']);
const rollTextures = rollFrames.filter(({name}) => !reusedRollNames.has(name));
const canvasOf = (width, height) => Object.assign(document.createElement('canvas'), {width, height});
const pause = () => new Promise(resolve => setTimeout(resolve, 0));

function canvasPixels(image, size = null) {
  const canvas = canvasOf(size ?? image.naturalWidth ?? image.width, size ?? image.naturalHeight ?? image.height);
  try {
    const ctx = canvas.getContext('2d', {willReadFrequently:true});
    if (!ctx) throw Error('浏览器无法读取紫色骰子画布');
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    return ctx.getImageData(0, 0, canvas.width, canvas.height);
  } finally {
    canvas.width = canvas.height = 1;
  }
}

function exposurePixels(renderer, time) {
  const canvas = renderer.render(exposureSamples('E', time, {blur: true}));
  const {width, height} = canvas;
  const {gl} = renderer;
  const bottomUp = new Uint8Array(width * height * 4);
  gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, bottomUp);
  if (gl.isContextLost()) throw Error('紫色骰子的 3D 画布中断，请重新生成');
  const data = new Uint8Array(bottomUp.length);
  for (let y = 0; y < height; y++) {
    const start = (height - 1 - y) * width * 4;
    data.set(bottomUp.subarray(start, start + width * 4), y * width * 4);
  }
  return {width, height, data};
}

function trimRegion(id, image, worldWidth, worldHeight) {
  const {width, height, data} = image;
  // Keep the anchor's complete 30×30 registration even when its source is empty.
  if (id === 'anchor') return {
    id, w:width, h:height, pixels:data,
    attachment:{type:'region',path:id,width:worldWidth,height:worldHeight},
  };
  let left = width, top = height, right = 0, bottom = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] === 0) continue;
      left = Math.min(left, x);
      right = Math.max(right, x + 1);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y + 1);
    }
  }
  if (left >= right || top >= bottom) {
    if (/^sz_/.test(id)) throw Error('骰面完全透明：' + id + '.png');
    // Keep a valid attachment for a subpixel edge-on exposure.
    left = Math.floor(width / 2); top = Math.floor(height / 2);
    right = left + 1; bottom = top + 1;
  }

  // Keep every nonzero alpha pixel and an inner transparent rim for linear filtering.
  left = Math.max(0, left - 1);
  top = Math.max(0, top - 1);
  right = Math.min(width, right + 1);
  bottom = Math.min(height, bottom + 1);
  const w = right - left, h = bottom - top;
  const sx = worldWidth / width, sy = worldHeight / height;
  const pixels = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    const start = ((top + y) * width + left) * 4;
    pixels.set(data.subarray(start, start + w * 4), y * w * 4);
  }
  return {
    id, w, h, pixels,
    attachment: {
      type: 'region', path: id, width: w * sx, height: h * sy,
      x: ((left + right) / 2 - width / 2) * sx,
      y: (height / 2 - (top + bottom) / 2) * sy,
    },
  };
}

function packRegions(regions) {
  // One shelf-packed page to keep atlas support uniform across renderers.
  const ordered = [...regions].sort((a, b) => b.h - a.h || b.w - a.w);
  const pack = width => {
    const shelves = [];
    const positions = [];
    let height = 0;
    for (const region of ordered) {
      if (region.w + 2 > width) return null;
      let shelf = shelves.find(row => row.x + region.w + 2 <= width);
      if (!shelf) {
        shelf = {x: 0, y: height};
        shelves.push(shelf);
        height += region.h + 2;
      }
      if (height > 2048) return null;
      positions.push({...region, x: shelf.x + 1, y: shelf.y + 1});
      shelf.x += region.w + 2;
    }
    return {width, height, positions};
  };
  const page = [1024, 1536, 2048].map(pack).filter(Boolean)
    .sort((a, b) => a.width * a.height - b.width * b.height)[0];
  if (!page) return null;
  const {width, height, positions} = page;
  const rgba = new Uint8Array(width * height * 4);
  for (const {x, y, w, h, pixels} of positions) {
    for (let row = 0; row < h; row++) {
      rgba.set(pixels.subarray(row * w * 4, (row + 1) * w * 4), ((y + row) * width + x) * 4);
    }
  }
  const atlas = [
    atlasPage, 'size: ' + width + ', ' + height, 'filter: Linear, Linear', 'pma: false',
    ...positions.flatMap(({id, x, y, w, h}) => [id, 'bounds: ' + [x, y, w, h].join(', ')]),
    '',
  ].join('\n');
  return {...page, rgba, atlas};
}

function skeletonData(regions) {
  const animations = {};
  const attachments = Object.fromEntries(regions.map(({id, attachment}) => [id, attachment]));
  const opening = attachments.roll_0;
  for (const {name, time} of rollFrames) {
    if (!reusedRollNames.has(name)) continue;
    const [cos, sin] = motionAt('E', time).rotation;
    attachments[name] = {
      ...opening,
      x: opening.x * cos - opening.y * sin,
      y: opening.x * sin + opening.y * cos,
      rotation: Math.atan2(sin, cos) * 180 / Math.PI,
    };
  }
  const keys = [...new Set([
    ...Array.from({length: 73}, (_, i) => i / 120),
    .228, .47, .52, MOTION.shutterClearAt, MOTION.rollEnd, MOTION.zoomEnd, MOTION.settleEnd, MOTION.landAt,
  ])].sort((a, b) => a - b).filter((time, i, times) => i === 0 || Math.fround(time) !== Math.fround(times[i - 1]));
  const scale = keys.map(time => {
    const value = motionAt('E', time).zoom * settlingGain(time);
    return {time, x: value, y: value};
  });
  const translate = keys.map(time => {
    const [x, y] = motionAt('E', time).offset;
    return {time, x, y: -y};
  });
  const settle = {x: settlingGain(MOTION.landAt), y: settlingGain(MOTION.landAt)};
  for (const point of points) {
    const result = 'sz_' + point;
    animations['spin_' + point] = {
      slots: {
        body: {attachment: [...rollFrames, {time: resultAt, name: result}]},
        shadow: {attachment: [{time: 0, name: 'shadow'}, {time: MOTION.rollEnd, name: null}]},
      },
      bones: {body: {scale, translate}, shadow: {scale}},
      events: [{time: 0, name: 'dice_roll'}, ...(point === 6 ? [{time: MOTION.landAt, name: 'sound_ui_dice6'}] : [])],
    };
    animations['standby_' + point] = {
      slots: {body: {attachment: [{time: 0, name: result}]}},
      bones: {body: {scale: [{time: 0, ...settle}, {time: 1, ...settle}]}},
    };
  }
  return {
    skeleton: {spine: '4.2.43', x: -150, y: -150, width: 300, height: 300, fps, images: './res/', audio: './sound/'},
    bones: [{name: 'root'}, {name: 'all', parent: 'root'}, {name: 'body', parent: 'all'}, {name: 'shadow', parent: 'all', y: -59}],
    slots: [
      {name: 'anchor', bone: 'root', attachment: 'anchor', color: 'ffffff00'},
      {name: 'shadow', bone: 'shadow', color: 'ffffff0b'},
      {name: 'body', bone: 'body', attachment: 'sz_1'},
    ],
    skins: [{name: 'default', attachments: {
      body: Object.fromEntries(Object.entries(attachments).filter(([id]) => id !== 'anchor' && id !== 'shadow')),
      shadow: {shadow: attachments.shadow},
      anchor: {anchor: {...attachments.anchor, scaleX: 6, scaleY: 6}},
    }}],
    events: Object.fromEntries(soundNames.map(id => [id, {audio: id + '.mp3'}])),
    animations,
  };
}

function checkAbort(signal) {
  if (signal?.aborted) throw new DOMException('操作已取消','AbortError');
}

function visibleArea({data}) {
  let count=0;
  for (let i=3;i<data.length;i+=4) if (data[i]>=16) count++;
  return count;
}

function hasVisiblePixels({data}) {
  for (let i=3;i<data.length;i+=4) if (data[i]) return true;
  return false;
}

function normalized(image, size, canvases) {
  const w=image.naturalWidth, h=image.naturalHeight;
  if (w===size&&h===size) return image;
  const scale=size/Math.max(w,h);
  const width=Math.max(1,Math.round(w*scale)), height=Math.max(1,Math.round(h*scale));
  const canvas=canvasOf(size,size);
  canvases.push(canvas);
  canvas.getContext('2d').drawImage(image,Math.floor((size-width)/2),Math.floor((size-height)/2),width,height);
  return canvas;
}

function shadowRegion(baseSize, canvases) {
  const canvas=canvasOf(196,36);
  canvases.push(canvas);
  const ctx=canvas.getContext('2d');
  ctx.fillStyle='#301043';
  ctx.beginPath();
  ctx.ellipse(98,18,92,14,0,0,Math.PI*2);
  ctx.fill();
  return trimRegion('shadow',ctx.getImageData(0,0,196,36),baseSize*.49,baseSize*.09);
}

const motionColors = Uint8Array.from({length:256}, (_, channel) => Math.round(channel / 15) * 15);
// Leave room for the source-dependent savings of the lossless export pass.
const atlasTargetBytes = 1.14 * 1024 * 1024;

async function compactExposures(frames, factor, signal) {
  const source = canvasOf(1, 1);
  const target = canvasOf(1, 1);
  const sourceCtx = source.getContext('2d');
  const targetCtx = target.getContext('2d', {willReadFrequently:true});
  try {
    const result = [];
    for (const [index, frame] of frames.entries()) {
      checkAbort(signal);
      // Motion blur hides fine detail in the fast middle of the roll.
      const scale = factor * (frame.time >= .12 && frame.time <= .42 ? .52 : .65);
      const {w, h, pixels} = frame;
      source.width = w;
      source.height = h;
      const image = sourceCtx.createImageData(w, h);
      image.data.set(pixels);
      sourceCtx.putImageData(image, 0, 0);
      target.width = Math.max(1, Math.round(w * scale));
      target.height = Math.max(1, Math.round(h * scale));
      targetCtx.imageSmoothingQuality = 'high';
      targetCtx.drawImage(source, 0, 0, target.width, target.height);
      const sample = targetCtx.getImageData(0, 0, target.width, target.height).data;
      for (let offset = 0; offset < sample.length; offset += 4) {
        const alpha = sample[offset + 3];
        if (alpha === 0) continue;
        sample[offset] = motionColors[sample[offset]];
        sample[offset + 1] = motionColors[sample[offset + 1]];
        sample[offset + 2] = motionColors[sample[offset + 2]];
        if (alpha !== 255) sample[offset + 3] = Math.max(1, motionColors[alpha]);
      }
      // Keep the full-size world coordinates stored in the Spine attachment.
      result.push({...frame, w:target.width, h:target.height, pixels:sample});
      if (index % 8 === 0) await pause();
    }
    return result;
  } finally {
    source.width = source.height = target.width = target.height = 1;
  }
}

async function captureExposures(renderer, baseSize, signal) {
  const size=baseSize*renderer.displayScale;
  const frames=[];
  for (const [index,{time,name}] of rollTextures.entries()) {
    checkAbort(signal);
    const image=exposurePixels(renderer,time);
    frames.push({...trimRegion(name,image,size,size),time});
    if (index%4===0) await pause();
  }
  return frames;
}

export async function generatePurpleReferenceRuntime(files,{
  name='自定义紫色骰子', signal, anchorImage, composition='faces',
}={}) {
  checkAbort(signal);
  if (!['faces','digits','auto'].includes(composition)) throw Error('紫色骰子素材类型无效');
  if (!anchorImage) throw Error('缺少有效的 anchor.png');
  const inputs=Array.from(files||[])
    .filter(file=>/^sz_[0-6]$/.test(file.slot))
    .map(file=>new File([file.blob],file.slot+'.png',{type:'image/png'}));
  const decoded=await decodeFaceFiles(inputs,{signal});
  const canvases=[];
  try {
    checkAbort(signal);
    const warnings=[...decoded.warnings];
    const dimensions=Object.values(decoded.images).map(image=>[image.naturalWidth,image.naturalHeight]);
    const sourceSize=Math.min(320,Math.max(...dimensions.flat()));
    if (dimensions.some(([w,h])=>w!==sourceSize||h!==sourceSize)) {
      warnings.push('已按完整画布等比对齐六张骰面，原始 PNG 保持不变');
    }
    const images=Object.fromEntries(points.map(point=>[point,normalized(decoded.images[point],sourceSize,canvases)]));
    let zero=decoded.zero?normalized(decoded.zero,sourceSize,canvases):null;
    const zeroPixels=zero?canvasPixels(zero):null;
    if (zeroPixels&&!hasVisiblePixels(zeroPixels)) zero=null;
    let resolved=composition;
    if (resolved==='auto') {
      const area=zero?visibleArea(zeroPixels):0;
      const ratios=area?points.map(point=>visibleArea(canvasPixels(images[point]))/area).sort((a,b)=>a-b):null;
      resolved=ratios&&(ratios[2]+ratios[3])/2<.6&&ratios[5]<.85?'digits':'faces';
    }
    if (resolved==='digits') {
      if (!zero) throw Error('分离点数素材需要可见的 sz_0.png 主题底图');
      for (const point of points) {
        const canvas=canvasOf(sourceSize,sourceSize);
        canvases.push(canvas);
        const ctx=canvas.getContext('2d');
        ctx.drawImage(zero,0,0);
        ctx.drawImage(images[point],0,0);
        images[point]=canvas;
      }
      warnings.push('已将 sz_0 与数字组合为骰面，原始 PNG 保持不变');
    }
    const rollImage=zero||images[1];
    if (!zero) warnings.push('未提供可见的 sz_0，翻滚主体使用第 1 点完整图');
    const anchorPixels=canvasPixels(anchorImage,30);
    const anchor=trimRegion('anchor',anchorPixels,30,30);
    let selected;
    for (const size of [320,256,192,128]) {
      checkAbort(signal);
      const renderer=new Proxy3DRenderer(rollImage,{size});
      try {
        const baseSize=200*renderer.contentScale;
        const flat=points.map(point=>trimRegion('sz_'+point,canvasPixels(images[point]),baseSize,baseSize));
        const stills=[...flat,anchor,shadowRegion(baseSize,canvases)];
        const exposures=await captureExposures(renderer,baseSize,signal);
        let factor=1;
        for (let pass=0;pass<3;pass++) {
          const regions=[...await compactExposures(exposures,factor,signal),...stills];
          const page=packRegions(regions);
          if (!page) break;
          const texture=await encodeAtlasPng(page.width,page.height,page.rgba,{signal});
          if (!selected||texture.size<selected.texture.size)
            selected={size,regions,page,texture,rendererMetadata:renderer.metadata};
          if (texture.size<=atlasTargetBytes) break;
          factor*=Math.max(.78,Math.min(.92,Math.sqrt(atlasTargetBytes/texture.size)));
        }
        if (selected) {
          break;
        }
      } finally {
        renderer.dispose();
      }
    }
    if (!selected) throw Error('紫色骰子图集超过 2048×2048，请使用较小画布的素材');
    const {size,regions,page,texture,rendererMetadata}=selected;
    if (size<320) warnings.push('素材轮廓较大，已将翻滚图集采样设为 '+size+' 像素');
    checkAbort(signal);
    const skel=new Blob([writeSpineBinary(skeletonData(regions))],{type:'application/octet-stream'});
    checkAbort(signal);
    return {
      kind:'purple-reference', skel, atlasPage, atlasText:page.atlas, texture,
      geometry:{sourceSize:200,crop:[0,0,200,200],cropOffset:[0,0]},
      warnings:[...new Set(warnings)],
      metadata:{
        name,grade:'purple',variant:'05',motionVersion:PURPLE_REFERENCE_MOTION_VERSION,
        resolvedComposition:resolved,referenceCamera:.86,cycle:MOTION.cycle,rollEnd:MOTION.rollEnd,
        settleEnd:MOTION.settleEnd,landAt:MOTION.landAt,zoomPeak:MOTION.zoomPeak,
        captureSize:size,frameTimes:rollFrames.map(({time})=>time),exposureFrames:rollTextures.length,staticImages:regions.length,
        atlas:{width:page.width,height:page.height},body:rendererMetadata,
        anchor:{slot:'anchor',bone:'root',attachment:'anchor',width:30,height:30,scaleX:6,scaleY:6,opacity:0},
      },
    };
  } finally {
    decoded.dispose();
    for (const canvas of canvases) canvas.width=canvas.height=1;
  }
}
