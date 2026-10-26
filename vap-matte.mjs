// Local frame-to-alpha providers. No image, frame, or mask leaves this device.
const clamp = value => Math.max(0, Math.min(1, value));
const byte = value => Math.max(0, Math.min(255, Math.round(value)));
const smooth = (low, high, value) => { const t=clamp((value-low)/(high-low));return t*t*(3-2*t); };
const methods = new Set(['chroma_key','black_luma','white_luma','manual_mask','ai_foreground','opaque']);
const vendorBase = new URL('./vendor/vap-matte/', import.meta.url);
export const AI_SCOPE = 'person';
const defaultVerticalMask = Object.freeze({enabled:false,topStart:0,topEnd:.15,bottomStart:.85,bottomEnd:1});

function dimensions(width,height){
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width>4096||height>4096||width*height>8388608)throw new Error('视频画面尺寸超出本地处理范围。');
}
function pixels(data,width,height){dimensions(width,height);if(!(data instanceof Uint8ClampedArray)||data.length!==width*height*4)throw new Error('视频帧像素无效。');}
export function normalizeVerticalMask(value){
  if(value==null)return defaultVerticalMask;
  if(typeof value!=='object'||Array.isArray(value)||typeof value.enabled!=='boolean')throw new Error('上下渐变遮罩参数无效。');
  if(!value.enabled)return defaultVerticalMask;
  const mask={enabled:true,topStart:value.topStart,topEnd:value.topEnd,bottomStart:value.bottomStart,bottomEnd:value.bottomEnd};
  for(const key of ['topStart','topEnd','bottomStart','bottomEnd'])if(!Number.isFinite(mask[key])||mask[key]<0||mask[key]>1)throw new Error('上下渐变遮罩位置必须是 0–1 之间的数值。');
  if(!(mask.topStart<mask.topEnd&&mask.topEnd<=mask.bottomStart&&mask.bottomStart<mask.bottomEnd))throw new Error('上下渐变遮罩位置顺序无效。');
  return Object.freeze(mask);
}
/** Multiply the fresh base alpha once in output-canvas coordinates; straight RGB stays intact. */
export function applyVerticalMask(data,width,height,value){
  pixels(data,width,height);const mask=normalizeVerticalMask(value);if(!mask.enabled)return data;
  const out=data.slice();
  for(let y=0;y<height;y++){
    const position=height===1?.5:y/(height-1),weight=smooth(mask.topStart,mask.topEnd,position)*(1-smooth(mask.bottomStart,mask.bottomEnd,position));
    for(let x=0;x<width;x++){const offset=(y*width+x)*4+3;out[offset]=byte(data[offset]*weight);}
  }
  return out;
}
function setting(value,fallback){return Number.isFinite(value)?clamp(value):fallback;}
function physicalAlpha(r,g,b,background,noise=0){
  let minimum=0;const rgb=[r,g,b];
  for(let c=0;c<3;c++){const bg=background[c],v=rgb[c];if(bg>0)minimum=Math.max(minimum,1-(v+noise)/bg);if(bg<255)minimum=Math.max(minimum,(v-noise-bg)/(255-bg));}
  return clamp(minimum);
}
function recover(out,offset,r,g,b,alpha,background,originalAlpha){
  if(alpha<=0){out[offset]=out[offset+1]=out[offset+2]=out[offset+3]=0;return;}
  const rgb=[r,g,b];for(let c=0;c<3;c++)out[offset+c]=alpha>=.999?rgb[c]:byte((rgb[c]-(1-alpha)*background[c])/alpha);
  out[offset+3]=byte(alpha*originalAlpha);
}
function chromaPixels(data,width,height,screen,tolerance,softness,despill){
  const count=width*height,bg=screen.background,keyChannel=screen.color==='green'?1:2;
  const alpha=new Float32Array(count),reference=new Int32Array(count),distance=new Uint16Array(count),out=new Uint8ClampedArray(data.length);
  reference.fill(-1);distance.fill(65535);
  const noise=.001+tolerance*.008,noiseBytes=1+tolerance*8;
  for(let p=0;p<count;p++){
    const o=p*4,r=data[o],g=data[o+1],b=data[o+2];let minimum=0;
    // The small red/blue components of a green plate can move by several codec
    // levels. Dividing their downward noise by a near-zero plate channel would
    // invent a high-alpha rectangle. Use the dominant channel's downward bound
    // and the other channels' upward bounds instead.
    for(let c=0;c<3;c++){const value=data[o+c];if(c===keyChannel&&bg[c]>0)minimum=Math.max(minimum,1-(value+noiseBytes)/bg[c]);else if(c!==keyChannel&&bg[c]<255)minimum=Math.max(minimum,(value-noiseBytes-bg[c])/(255-bg[c]));}minimum=clamp(minimum);
    if(minimum<=noise||data[o+3]===0)continue;
    alpha[p]=minimum;
    const channel=data[o+keyChannel],other=keyChannel===1?Math.max(r,b):Math.max(r,g),spread=Math.max(r,g,b)-Math.min(r,g,b);
    // Confident non-screen colours anchor the colour of nearby mixed pixels.
    // Neutral dark material is an opaque foreground anchor too.
    if(minimum>=.85||(channel-other< -65&&minimum>.3)||(spread<10&&Math.max(r,g,b)<80&&minimum>.4)){reference[p]=p;distance[p]=0;}
  }
  // ponytail: bound colour propagation to 64 pixels. Detached effects retain
  // physical alpha; a wider/GPU distance field needs its own quality baseline.
  const take=(p,neighbor)=>{if(alpha[neighbor]>0&&reference[neighbor]>=0&&distance[neighbor]+1<distance[p]&&distance[neighbor]<64){reference[p]=reference[neighbor];distance[p]=distance[neighbor]+1;}};
  for(let p=0;p<count;p++)if(alpha[p]>0&&distance[p]!==0){if(p%width)take(p,p-1);if(p>=width)take(p,p-width);}
  for(let p=count-1;p>=0;p--)if(alpha[p]>0&&distance[p]!==0){if(p%width<width-1)take(p,p+1);if(p+width<count)take(p,p+width);}
  for(let p=0;p<count;p++){
    const o=p*4;let a=alpha[p];
    if(a>0){
      if(reference[p]===p)a=1;
      else if(reference[p]>=0){const r=reference[p]*4;let numerator=0,denominator=0;for(let c=0;c<3;c++){const foreground=data[r+c]-bg[c];numerator+=(data[o+c]-bg[c])*foreground;denominator+=foreground*foreground;}if(denominator>16)a=Math.max(a,clamp(numerator/denominator));}
      // Suppress codec-level screen noise, without widening the cut into the
      // visible soft ribbon, hair, or independent coloured particles.
      a*=smooth(noise,noise*2,a);a=Math.pow(a,1+softness*.5);
    }
    recover(out,o,data[o],data[o+1],data[o+2],a,bg,data[o+3]);
    if(a>0&&a<.999){const other=keyChannel===1?Math.max(out[o],out[o+2]):Math.max(out[o],out[o+1]);out[o+keyChannel]=byte(out[o+keyChannel]-Math.max(0,out[o+keyChannel]-other)*despill*(1-a));}
  }
  return out;
}

/** Estimate from the outer border only; a manual green/blue selection stays authoritative. */
export function detectScreenColor(data,width,height,requested='auto'){
  pixels(data,width,height);if(!['auto','green','blue'].includes(requested))throw new Error('请选择自动、绿色或蓝色幕。');
  const samples=[],step=Math.max(1,Math.floor(Math.min(width,height)/32));let green=0,blue=0;
  for(let y=0;y<height;y+=step)for(let x=0;x<width;x+=step){if(x>width*.08&&x<width*.92&&y>height*.08&&y<height*.92)continue;const o=(y*width+x)*4;if(data[o+3]<16)continue;const r=data[o],g=data[o+1],b=data[o+2];samples.push([r,g,b]);green+=Math.max(0,g-Math.max(r,b));blue+=Math.max(0,b-Math.max(r,g));}
  const color=requested==='auto'?(blue>green?'blue':'green'):requested,channel=color==='green'?1:2;
  const matching=samples.filter(rgb=>rgb[channel]-Math.max(...rgb.filter((_,i)=>i!==channel))>12);
  const background=matching.length<3?(color==='green'?[0,255,0]:[0,0,255]):[0,1,2].map(c=>{const values=matching.map(rgb=>rgb[c]).sort((a,b)=>a-b);return values[Math.floor(values.length/2)];});
  return {color,background,confidence:matching.length/Math.max(1,samples.length)};
}

/** Straight RGB + alpha, shared by live preview and the exported packed frame. */
export function keyPixels(data,width,height,{matteMethod='black_luma',keyTolerance=.25,edgeSoftness=.08,spill=.7,background,screenColor='auto'}={}){
  pixels(data,width,height);if(!['black_luma','white_luma','chroma_key','opaque'].includes(matteMethod))throw new Error('此抠像方式需要独立的本地模型或遮罩。');
  const out=new Uint8ClampedArray(data.length),tolerance=setting(keyTolerance,.25),softness=setting(edgeSoftness,.08),despill=setting(spill,.7);
  if(matteMethod==='opaque'){out.set(data);return out;}
  const screen=matteMethod==='chroma_key'?(background?{color:screenColor==='blue'?'blue':'green',background}:detectScreenColor(data,width,height,screenColor)):null;
  const bg=screen?.background||(matteMethod==='white_luma'?[255,255,255]:[0,0,0]);
  if(screen)return chromaPixels(data,width,height,screen,tolerance,softness,despill);
  for(let o=0;o<data.length;o+=4){
    const r=data[o],g=data[o+1],b=data[o+2];let alpha;
    {const difference=matteMethod==='black_luma'?Math.max(r,g,b)/255:1-Math.min(r,g,b)/255;
      const low=tolerance*.025;alpha=smooth(low,Math.max(low+.005,.25+softness*.5),difference);
      if(alpha>0)alpha=Math.max(alpha,physicalAlpha(r,g,b,bg));
    }
    recover(out,o,r,g,b,alpha,bg,data[o+3]);
  }
  return out;
}

/** Grayscale masks use luminance; masks with transparency use their alpha channel. */
export function applyMaskPixels(source,mask,width,height,{useAlpha=false}={}){
  pixels(source,width,height);pixels(mask,width,height);const out=source.slice();
  for(let o=0;o<out.length;o+=4){const a=useAlpha?mask[o+3]:.2126*mask[o]+.7152*mask[o+1]+.0722*mask[o+2];out[o+3]=byte(source[o+3]*a/255);if(out[o+3]===0)out[o]=out[o+1]=out[o+2]=0;}
  return out;
}

function canvas(width,height){const target=typeof OffscreenCanvas==='function'?new OffscreenCanvas(width,height):document.createElement('canvas');target.width=width;target.height=height;const context=target.getContext('2d',{willReadFrequently:true});if(!context)throw new Error('此浏览器无法读取视频帧。');return {target,context};}
function abort(signal){if(signal?.aborted)throw new DOMException('操作已取消。','AbortError');}
function framePixels(source,width,height,surface){
  if(surface.target.width!==width||surface.target.height!==height){surface.target.width=width;surface.target.height=height;}
  surface.context.clearRect(0,0,width,height);
  const sw=source.videoWidth||source.width,sh=source.videoHeight||source.height;dimensions(sw,sh);
  const scale=Math.min(width/sw,height/sh),w=sw*scale,h=sh*scale,x=(width-w)/2,y=(height-h)/2;
  if(typeof ImageData==='function'&&source instanceof ImageData){const temporary=canvas(source.width,source.height);temporary.context.putImageData(source,0,0);surface.context.drawImage(temporary.target,x,y,w,h);}
  else surface.context.drawImage(source,x,y,w,h);
  return surface.context.getImageData(0,0,width,height);
}
function event(target,name,errorName='error'){
  return new Promise((resolve,reject)=>{const finish=()=>{target.removeEventListener(name,yes);target.removeEventListener(errorName,no);};const yes=()=>{finish();resolve();};const no=()=>{finish();reject(new Error('遮罩文件无法读取，请选择有效图片或 MP4。'));};target.addEventListener(name,yes,{once:true});target.addEventListener(errorName,no,{once:true});});
}
async function maskSource(file){
  if(!file||typeof file.arrayBuffer!=='function')throw new Error('请先选择一张遮罩图片或同步遮罩视频。');
  if(file.size>200*1024*1024)throw new Error('遮罩文件不能超过 200 MB。');
  if(file.type?.startsWith('image/')||/\.(png|webp|jpe?g)$/i.test(file.name||'')){
    const bitmap=await createImageBitmap(file);try{dimensions(bitmap.width,bitmap.height);const probe=canvas(bitmap.width,bitmap.height);probe.context.drawImage(bitmap,0,0);const raw=probe.context.getImageData(0,0,bitmap.width,bitmap.height).data;let useAlpha=false;for(let i=3;i<raw.length;i+=4)if(raw[i]<255){useAlpha=true;break;}probe.target.width=probe.target.height=1;return {kind:'image',source:bitmap,useAlpha,dispose(){bitmap.close();}};}catch(error){bitmap.close();throw error;}
  }
  if(typeof document==='undefined')throw new Error('当前环境不支持读取遮罩视频。');
  const video=document.createElement('video'),url=URL.createObjectURL(file);video.preload='auto';video.muted=true;video.playsInline=true;
  const ready=event(video,'loadeddata');video.src=url;
  try{await ready;if(!Number.isFinite(video.duration)||video.duration<=0)throw new Error('遮罩视频时长无效。');dimensions(video.videoWidth,video.videoHeight);}
  catch(error){URL.revokeObjectURL(url);video.removeAttribute('src');video.load();throw error;}
  return {kind:'video',source:video,async seek(timestamp){if(timestamp>video.duration+.001)throw new Error('遮罩视频短于原片，请使用同步且时长足够的遮罩。');const at=Math.min(timestamp,Math.max(0,video.duration-.0001));if(Math.abs(video.currentTime-at)>.0005){const done=event(video,'seeked');video.currentTime=at;await done;}},dispose(){video.pause();video.removeAttribute('src');video.load();URL.revokeObjectURL(url);}};
}

let visionPromise=null;
async function vision(){
  if(!visionPromise)visionPromise=import(new URL('vision_bundle.mjs',vendorBase)).then(async module=>({module,files:await module.FilesetResolver.forVisionTasks(new URL('wasm',vendorBase).href)})).catch(error=>{visionPromise=null;throw error;});
  return visionPromise;
}
async function personSegmenter(options){
  if(options.subjectType&&options.subjectType!=='person')throw new Error('AI 模型仅适用于人像；其它素材请选择色幕、黑白底或手动遮罩。');
  options.onProgress?.({phase:'loading',progress:0});const {module,files}=await vision();abort(options.signal);
  const config={baseOptions:{modelAssetPath:new URL('selfie_segmenter.tflite',vendorBase).href,delegate:'GPU'},runningMode:'VIDEO',outputCategoryMask:false,outputConfidenceMasks:true};
  let task,backend;try{task=await module.ImageSegmenter.createFromOptions(files,config);backend='mediapipe-gpu';}
  catch(gpuError){config.baseOptions.delegate='CPU';task=await module.ImageSegmenter.createFromOptions(files,config);backend='mediapipe-cpu';}
  options.onProgress?.({phase:'loading',progress:1});return {task,backend};
}

export async function createMatteProcessor(options={}){
  const method=options.sourceKind==='chroma_mp4'?'chroma_key':options.matteMethod||'black_luma';
  if(!methods.has(method))throw new Error('请选择有效的抠像方式。');
  if(options.sourceKind==='chroma_mp4'&&options.matteMethod&&options.matteMethod!=='chroma_key')throw new Error('绿蓝幕输入需要使用色键抠像。');
  if(method==='opaque'&&options.confirmedOpaque!==true)throw new Error('保留原背景会生成不透明 VAP，请先确认。');
  const verticalMask=normalizeVerticalMask(options.verticalMask);
  const input=canvas(1,1),maskSurface=canvas(1,1);let mask=null,ai=null,disposed=false,lastTime=-1,screen=null,previous=null,previousTime=-1;
  try{if(method==='manual_mask')mask=await maskSource(options.maskFile);if(method==='ai_foreground')ai=await personSegmenter(options);abort(options.signal);}
  catch(error){mask?.dispose();ai?.task?.close();throw error;}
  const processor={backend:ai?.backend||'cpu',scope:method==='ai_foreground'?'person':null,detectedScreen:null,
    async process(source,{timestamp=0,width=source.width||source.videoWidth,height=source.height||source.videoHeight,verticalMask:frameMask}={}){
      if(disposed)throw new Error('抠像任务已结束。');abort(options.signal);dimensions(width,height);if(!Number.isFinite(timestamp)||timestamp<0)throw new Error('视频帧时间无效。');
      const activeVerticalMask=frameMask===undefined?verticalMask:normalizeVerticalMask(frameMask);
      const image=framePixels(source,width,height,input);let data;
      if(mask){await mask.seek?.(timestamp);abort(options.signal);const mw=mask.source.videoWidth||mask.source.width,mh=mask.source.videoHeight||mask.source.height,sw=source.videoWidth||source.width,sh=source.videoHeight||source.height;if(Math.abs((mw/mh)/(sw/sh)-1)>.01)throw new Error('遮罩比例必须与原片一致。');const frame=framePixels(mask.source,width,height,maskSurface);data=applyMaskPixels(image.data,frame.data,width,height,{useAlpha:mask.useAlpha===true});}
      else if(ai){
        const time=Math.max(timestamp*1000,lastTime+1);lastTime=time;const result=ai.task.segmentForVideo(input.target,time);
        try{const confidence=result.confidenceMasks;if(!confidence?.length)throw new Error('人像模型未返回有效透明度。');const person=confidence[confidence.length-1],values=person.getAsFloat32Array(),mw=person.width,mh=person.height;if(values.length!==mw*mh)throw new Error('人像模型透明度尺寸无效。');
          const small=canvas(mw,mh),rgba=new Uint8ClampedArray(values.length*4);for(let i=0;i<values.length;i++){let a=values[i];if(!Number.isFinite(a))throw new Error('人像模型透明度无效。');a=smooth(.05,.95,a);rgba[i*4]=rgba[i*4+1]=rgba[i*4+2]=byte(a*255);rgba[i*4+3]=255;}
          small.context.putImageData(new ImageData(rgba,mw,mh),0,0);maskSurface.target.width=width;maskSurface.target.height=height;maskSurface.context.imageSmoothingEnabled=true;maskSurface.context.imageSmoothingQuality='high';maskSurface.context.drawImage(small.target,0,0,width,height);const alpha=maskSurface.context.getImageData(0,0,width,height).data;
          // Only damp small confidence flicker. Large changes pass through so
          // motion is not smeared by a persistent frame-history blend.
          if(previous?.length===alpha.length&&timestamp>=previousTime&&timestamp-previousTime<.2){for(let i=0;i<alpha.length;i+=4)if(Math.abs(alpha[i]-previous[i])<24)alpha[i]=alpha[i+1]=alpha[i+2]=byte(alpha[i]*.85+previous[i]*.15);}
          previous=alpha.slice();previousTime=timestamp;data=applyMaskPixels(image.data,alpha,width,height);
        }finally{result.close();}
      }else{
        if(method==='chroma_key'&&!screen){screen=detectScreenColor(image.data,width,height,options.screenColor||'auto');processor.detectedScreen=screen;}
        data=keyPixels(image.data,width,height,{...options,matteMethod:method,...(screen?{background:screen.background,screenColor:screen.color}:{})});
      }
      abort(options.signal);return new ImageData(applyVerticalMask(data,width,height,activeVerticalMask),width,height);
    },
    dispose(){if(disposed)return;disposed=true;mask?.dispose();ai?.task?.close();previous=null;input.target.width=input.target.height=maskSurface.target.width=maskSurface.target.height=1;}
  };
  return processor;
}
