import {DICE_SIZE_SCALE} from '../presentation-scale.mjs';
import {decodeFaceFiles} from '../six-face/import-faces.mjs';
import {writeSpineBinary} from '../six-face/spine-binary.mjs';
import {motionAt, exposureSamples, MOTION} from './motion.mjs';
import {settlingGain} from './presentation.mjs';
import {Proxy3DRenderer} from './proxy-3d.mjs';
import {encodeAtlasPng} from './atlas-png.mjs';

export const PURPLE_REFERENCE_MOTION_VERSION='purple05-reference-v9-settle-face';
export const PURPLE_PLAN_02_MOTION_VERSION='purple02-reference-v10-compact-aligned';
export const DEFAULT_PURPLE_VARIANT='02';
const motions = new Map([['01', 'A'], ['02', 'B'], ['05', 'E']]);
const atlasPage = 'dice.png';
const points = [1, 2, 3, 4, 5, 6];
const fps = 60;
const lastRollFrame = 31;
// Finish with the existing landing cue so spin-to-standby playback also stays smooth.
const revealStart = 27;
const revealEnd = Math.round(MOTION.landAt * fps);
const frontAt = (lastRollFrame + 1) / fps;
// Preserve the review page's two unsnapped times in Spine. The numbered
// frames between them use the result image instead of another material pass.
const plan02 = Object.freeze({
  pointAt:.47, flatAt:MOTION.rollEnd,
  firstPointFrame:Math.ceil(.47 * fps), handoffFrame:Math.ceil(MOTION.rollEnd * fps),
  narrowShutterAt:.4, singleExposureAt:.45,
  zoomPeakAt:MOTION.zoomPeakAt, settledScale:settlingGain(MOTION.landAt),
});
const pandaSourceHash='7170fdf8d46568fad5fd560b4d34cf740983dfe0a734abb293b6ecc451d5b6be';
const plan02SharedOpening=new Set([1]);
const soundNames = ['dice_roll', 'sound_ui_dice6'];
// Sample the fast part at 60 fps and hold the slower poses for two ticks.
const rollFrames = Array.from({length: lastRollFrame + 1}, (_, index) => ({
  time: index / fps,
  name: 'roll_' + index,
})).filter(({time}, index) => index % 2 === 0 || (time >= .08 && time <= .45) || index === lastRollFrame);
// These poses differ from the opening mostly by a small in-plane rotation.
const reusedRollNames = new Set(['roll_2', 'roll_30', 'roll_31']);
const compactGyroFrames = rollFrames.filter(({name}) => !reusedRollNames.has(name));
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

function exposurePixels(renderer, motion, time, frontPoint=0, samples=exposureSamples(motion,time)) {
  const canvas = renderer.render(samples,{frontPoint});
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

function packRegions(regions, compact) {
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
    return {width:compact?Math.max(...shelves.map(row=>row.x)):width,height,positions};
  };
  const widths=compact?[384,512,640,768,896,1024,1280,1536,1792,2048]:[1024,1536,2048];
  const page = widths.map(pack).filter(Boolean)
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

function revealKeys(opacity) {
  return [{time: 0, color: opacity(0) ? 'ffffffff' : 'ffffff00'},
    ...Array.from({length: revealEnd - revealStart + 1}, (_, i) => {
      const progress = i / (revealEnd - revealStart);
      const reveal = progress * progress * (3 - 2 * progress);
      const alpha = Math.round(opacity(reveal) * 255).toString(16).padStart(2, '0');
      return {time: (revealStart + i) / fps, color: 'ffffff' + alpha};
    })];
}

function plan02Attachment(point, frame) {
  return 'roll_'+(frame<plan02.firstPointFrame?1:point)+'_'+frame;
}

function plan02RollKeys(point) {
  return [
    ...Array.from({length:plan02.firstPointFrame},(_,frame)=>({time:frame/fps,name:plan02Attachment(point,frame)})),
    {time:plan02.pointAt,name:'roll_'+point+'_front'},
    ...Array.from({length:plan02.handoffFrame-plan02.firstPointFrame},(_,index)=>{
      const frame=index+plan02.firstPointFrame;
      return {time:frame/fps,name:plan02Attachment(point,frame)};
    }),
  ];
}

function nearFrontAttachment(attachment, rotation) {
  const [a,b,,c,d]=rotation;
  const scaleX=Math.hypot(a,b),scaleY=Math.hypot(c,d),angle=Math.atan2(b,a);
  const cos=Math.cos(angle),sin=Math.sin(angle),x=attachment.x*scaleX,y=attachment.y*scaleY;
  return {...attachment,x:x*cos-y*sin,y:x*sin+y*cos,width:attachment.width*scaleX,
    height:attachment.height*scaleY,rotation:angle*180/Math.PI};
}

function skeletonData(regions, motion, usePlan02, panda, landing) {
  const animations = {};
  const attachments = Object.fromEntries(regions.map(({id, attachment}) => [id, attachment]));
  if(usePlan02)for(const frame of plan02SharedOpening){
    attachments[plan02Attachment(1,frame)]=nearFrontAttachment(attachments.roll_1_0,motionAt(motion,frame/fps).rotation);
  }
  if(usePlan02)for(const point of points){
    if(point!==1)attachments['roll_'+point+'_front']={...attachments.roll_1_front};
    // A single atlas region supplies both sides of the handoff. Keep the
    // existing roll/result slot names for the preview and game integrations.
    for(let frame=plan02.firstPointFrame;frame<plan02.handoffFrame;frame++){
      const attachment={...attachments['sz_'+point]};
      // At 60 fps the first numbered frame is already almost frontal. Use
      // the complete authored face at that frame and preserve the final tilt.
      // No patch of the previous face may remain behind the number.
      if(frame<=plan02.firstPointFrame+1){
        const [a,b,,c,d]=motionAt(motion,frame/fps).rotation;
        const scaleX=Math.hypot(a,b),scaleY=Math.hypot(c,d),rotation=Math.atan2(b,a);
        const x=attachment.x*scaleX,y=attachment.y*scaleY;
        attachment.x=x*Math.cos(rotation)-y*Math.sin(rotation);
        attachment.y=x*Math.sin(rotation)+y*Math.cos(rotation);
        attachment.width*=scaleX;
        attachment.height*=scaleY;
        attachment.rotation=rotation*180/Math.PI;
        // Keep the existing motion path, and only absorb the local registration
        // jump caused by replacing the 3D silhouette with the authored face.
        const target=landing?.targets[point-1];
        if(landing?.entry&&target){
          const tx=target.x*scaleX,ty=target.y*scaleY;
          const dx=landing.entry.x-(tx*Math.cos(rotation)-ty*Math.sin(rotation));
          const dy=landing.entry.y-(tx*Math.sin(rotation)+ty*Math.cos(rotation));
          const remaining=frame===plan02.firstPointFrame ? .78 : .39;
          const factor=remaining*Math.min(1,landing.maxShift/(Math.hypot(dx,dy)||1));
          attachment.x+=dx*factor;
          attachment.y+=dy*factor;
        }
      }
      attachments[plan02Attachment(point,frame)]=attachment;
    }
  }
  const opening = attachments.roll_0;
  for (const {name, time} of usePlan02?[]:rollFrames) {
    if (attachments[name]) continue;
    const [cos, sin] = motionAt(motion, time).rotation;
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
    const value = motionAt(motion, time).zoom * settlingGain(time);
    return {time, x: value, y: value};
  });
  const translate = keys.map(time => {
    const [x, y] = motionAt(motion, time).offset;
    return {time, x, y: -y};
  });
  const endScale=settlingGain(MOTION.landAt);
  const settle = {x:endScale,y:endScale};
  const resultFade = revealKeys(reveal => reveal);
  // Keep the solid face beneath the reveal while the new face gains coverage.
  const rollFade = revealKeys(reveal => 1 - reveal ** 7);
  const rollEnd = revealEnd / fps;
  const rollAttachments = [...rollFrames, {time: frontAt, name: 'roll_0'}, {time: rollEnd, name: null}];
  for (const point of points) {
    const result = 'sz_' + point;
    animations['spin_' + point] = {
      slots: {
        roll: usePlan02?{attachment:[...plan02RollKeys(point),{time:plan02.flatAt,name:null}]}:{attachment:rollAttachments,rgba:rollFade},
        body: usePlan02?{attachment:[{time:0,name:null},{time:plan02.flatAt,name:result}]}:{attachment:[{time:0,name:result}],rgba:resultFade},
        shadow: {attachment: [{time: 0, name: 'shadow'}, {time: MOTION.rollEnd, name: null}]},
      },
      bones: {body: {scale, translate}, shadow: {scale}},
      events: [{time: 0, name: 'dice_roll'}, ...(point === 6 ? [{time: MOTION.landAt, name: 'sound_ui_dice6'}] : [])],
    };
    animations['standby_' + point] = {
      slots: {
        roll: {attachment: [{time: 0, name: null}]},
        body: {attachment: [{time: 0, name: result}], rgba: [{time: 0, color: 'ffffffff'}]},
      },
      bones: {body: {scale: [{time: 0, ...settle}, {time: 1, ...settle}]}},
    };
  }
  return {
    skeleton: {spine: '4.2.43', x: -150, y: -150, width: 300, height: 300, fps, images: './res/', audio: './sound/'},
    bones: [{name: 'root'}, {name: 'all', parent: 'root', scaleX: DICE_SIZE_SCALE, scaleY: DICE_SIZE_SCALE}, {name: 'body', parent: 'all'}, {name: 'shadow', parent: 'all', y: -59}],
    slots: [
      {name: 'anchor', bone: 'root', attachment: 'anchor', color: 'ffffff00'},
      {name: 'shadow', bone: 'shadow', color: panda?'ffffff1c':'ffffff0b'},
      {name: 'roll', bone: 'body'},
      {name: 'body', bone: 'body', attachment: 'sz_1'},
    ],
    skins: [{name: 'default', attachments: {
      roll: usePlan02?Object.fromEntries(Object.entries(attachments).filter(([name])=>name.startsWith('roll_')))
        :Object.fromEntries(rollFrames.map(({name}) => [name, attachments[name]])),
      body: Object.fromEntries(points.map(point => ['sz_' + point, attachments['sz_' + point]])),
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

async function compactExposures(frames, factor, signal, plan02Motion) {
  const source = canvasOf(1, 1);
  const target = canvasOf(1, 1);
  const sourceCtx = source.getContext('2d');
  const targetCtx = target.getContext('2d', {willReadFrequently:true});
  try {
    const result = [];
    for (const [index, frame] of frames.entries()) {
      checkAbort(signal);
      // Motion blur hides fine detail in the fast middle of the roll.
      const fast=frame.time>=.12&&frame.time<=.42;
      const scale=factor*(fast?(plan02Motion ? .46 : .52):.65);
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
      for (let offset = 0; !plan02Motion && offset < sample.length; offset += 4) {
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

async function captureExposures(renderer, baseSize, motion, frames, signal) {
  const size=baseSize*renderer.displayScale;
  const exposures=[];
  for (const [index,{time,name}] of frames.entries()) {
    checkAbort(signal);
    const image=exposurePixels(renderer,motion,time);
    exposures.push({...trimRegion(name,image,size,size),time});
    if (index%4===0) await pause();
  }
  return exposures;
}

function plan02Exposures(motion,time){
  if(time>=plan02.singleExposureAt)return exposureSamples(motion,time,{blur:false});
  const original=exposureSamples(motion,time);
  if(time<=plan02.narrowShutterAt)return original;
  const progress=(time-plan02.narrowShutterAt)/(plan02.singleExposureAt-plan02.narrowShutterAt);
  const width=1-progress*progress*(3-2*progress);
  return original.map(({time:sample,weight})=>({...motionAt(motion,time+(sample-time)*width),weight}));
}

function visibleCenter({data,width,height},worldSize){
  let x=0,y=0,count=0;
  for(let row=0;row<height;row++)for(let col=0;col<width;col++){
    if(data[(row*width+col)*4+3]<96)continue;
    x+=col+.5;y+=row+.5;count++;
  }
  return count?{x:(x/count/width-.5)*worldSize,y:(.5-y/count/height)*worldSize}:null;
}

async function capturePlan02(renderer, baseSize, motion, signal) {
  const worldSize=baseSize*renderer.displayScale;
  const exposures=[];
  let entry;
  const capture=({name,time},last=false)=> {
    checkAbort(signal);
    const image=exposurePixels(renderer,motion,time,0,plan02Exposures(motion,time));
    if(last)entry=visibleCenter(image,worldSize);
    exposures.push({...trimRegion(name,image,worldSize,worldSize),time});
  };
  for (const [index,key] of plan02RollKeys(1).slice(0,plan02.firstPointFrame).entries()) {
    if(plan02SharedOpening.has(index))continue;
    capture(key,index===plan02.firstPointFrame-1);
    if (index%4===0) await pause();
  }
  // Before the numbered image appears, clear the remaining numbered sides
  // without changing the original fast turn.
  for(const mesh of renderer.meshes)if(Number.isInteger(mesh.key))mesh.key='body';
  capture({name:'roll_1_front',time:plan02.pointAt});
  return {exposures,entry};
}

async function isReferencePanda(files) {
  const source=Array.from(files||[]).find(file=>file.slot==='sz_0');
  if (source?.blob?.size!==40790) return false;
  const hash=source.sha256??Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await source.blob.arrayBuffer())),
    byte=>byte.toString(16).padStart(2,'0')).join('');
  return hash===pandaSourceHash;
}

export async function generatePurpleReferenceRuntime(files,{
  name='自定义紫色骰子', signal, anchorImage, composition='faces', variant=DEFAULT_PURPLE_VARIANT,
}={}) {
  checkAbort(signal);
  const motion=motions.get(variant);
  if (!motion) throw Error('紫色骰子动画方案无效');
  const usePlan02=variant==='02';
  const rollTextures=variant==='05'?compactGyroFrames:rollFrames;
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
    const originals=points.map(point=>canvasPixels(images[point]));
    const panda=usePlan02&&Boolean(zero)&&await isReferencePanda(files);
    let selected;
    for (const size of [320,256,192,128]) {
      checkAbort(signal);
      const renderer=new Proxy3DRenderer(rollImage,{size,numberedFaces:panda?images:null,panda});
      try {
        const baseSize=200*renderer.contentScale;
        const flat=originals.map((image,index)=>trimRegion('sz_'+(index+1),image,baseSize,baseSize));
        const stills=[...flat,anchor,shadowRegion(baseSize,canvases)];
        const {exposures,entry}=usePlan02
          ?await capturePlan02(renderer,baseSize,motion,signal)
          :{exposures:await captureExposures(renderer,baseSize,motion,rollTextures,signal)};
        const landing=usePlan02?{entry,targets:originals.map(image=>visibleCenter(image,baseSize)),maxShift:baseSize*.04}:null;
        let factor=1;
        for (let pass=0;pass<3;pass++) {
          const regions=[...await compactExposures(exposures,factor,signal,usePlan02),...stills];
          const page=packRegions(regions,usePlan02);
          if (!page) {
            if (!usePlan02) break;
            factor*=.80;
            continue;
          }
          const texture=await encodeAtlasPng(page.width,page.height,page.rgba,{signal});
          if (!selected||texture.size<selected.texture.size)
            selected={size,regions,page,texture,rendererMetadata:renderer.metadata,landing};
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
    const {size,regions,page,texture,rendererMetadata,landing}=selected;
    if (size<320) warnings.push('素材轮廓较大，已将翻滚图集采样设为 '+size+' 像素');
    checkAbort(signal);
    const skel=new Blob([writeSpineBinary(skeletonData(regions,motion,usePlan02,panda,landing))],{type:'application/octet-stream'});
    checkAbort(signal);
    return {
      kind:'purple-reference', skel, atlasPage, atlasText:page.atlas, texture,
      geometry:{sourceSize:200,crop:[0,0,200,200],cropOffset:[0,0]},
      warnings:[...new Set(warnings)],
      metadata:{
        name,grade:'purple',variant,motionVersion:usePlan02?PURPLE_PLAN_02_MOTION_VERSION:PURPLE_REFERENCE_MOTION_VERSION,
        resolvedComposition:resolved,referenceCamera:.86,cycle:MOTION.cycle,rollEnd:MOTION.rollEnd,
        settleEnd:MOTION.settleEnd,landAt:MOTION.landAt,zoomPeak:MOTION.zoomPeak,
        ...(usePlan02?{...plan02,zoomPeakFrame:Math.round(plan02.zoomPeakAt*fps),exposuresPerFrame:MOTION.samples,
          motionBlur:true,sharedOpeningFrames:[...plan02SharedOpening]}:{}),
        captureSize:size,frameTimes:(usePlan02?plan02RollKeys(1):rollFrames).map(({time})=>time),
        exposureFrames:usePlan02?regions.length-points.length-2:rollTextures.length,staticImages:regions.length,
        atlas:{width:page.width,height:page.height},body:rendererMetadata,
        anchor:{slot:'anchor',bone:'root',attachment:'anchor',width:30,height:30,scaleX:6,scaleY:6,opacity:0},
      },
    };
  } finally {
    decoded.dispose();
    for (const canvas of canvases) canvas.width=canvas.height=1;
  }
}
