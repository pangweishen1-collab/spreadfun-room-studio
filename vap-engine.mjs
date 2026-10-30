import {computeVapLayout, makeVapc, appendVapcBox, extractVapcBox, validateVapc} from './vap-protocol.mjs?v=20261028-resources1';
import {detectVideoSource, SCREEN_COLORS} from './vap-source-detection.mjs?v=20261029-auto-method2';
import {inspectImageSequence, sequenceMetadata, decodeSequenceFrame} from './vap-sequence.mjs?v=20261029-sequence-speed1';
export {inspectImageSequence, sequenceMetadata, decodeSequenceFrame};
import {normalizeResources, computeResourceLayout, addResourceConfig, createResourceRenderer, createVapUnpacker} from './vap-resources.mjs?v=20261030-avatar-motion1';
import {normalizeGiftFade, giftFadeOpacity, applyGiftFade} from './vap-gift-fade.mjs?v=20261029-gift-fade1';

export const LIMITS = Object.freeze({fileBytes:200*1024*1024,outputBytes:3000000,durationSeconds:120,sourceMaxSide:4096,outputMinSide:16,outputMaxSide:2048,fps:60,packedMaxSide:4096});
export class VapError extends Error {
  constructor(code,message,cause){super(message,{cause});this.name='VapError';this.code=code;}
}
let mediaPromise;
const media = () => mediaPromise ||= import('./vendor/mediabunny/mediabunny.mjs').catch(error=>{mediaPromise=null;throw new VapError('unsupported','视频处理组件未能加载，请重试。',error)});
const clock = () => performance.now();
const cancelled = signal => {if(signal?.aborted)throw new VapError('cancelled','转换已取消。')};
const finite = value => typeof value==='number'&&Number.isFinite(value);
function integer(value,min,max,label){if(!Number.isSafeInteger(value)||value<min||value>max)throw new VapError('invalid',`${label}须为 ${min}–${max} 之间的整数。`);return value;}
function fileCheck(file){
  if(!(file instanceof Blob)||file.size<8)throw new VapError('file','请选择有效的 MP4 视频。');
  if(file.size>LIMITS.fileBytes)throw new VapError('limits','视频不能超过 200 MiB，请先截取所需片段。');
  if(file.name&&!/\.mp4$/i.test(file.name))throw new VapError('file','请使用 MP4 格式视频。');
}

export function normalizeOptions(options={},metadata={}){
  const o={sourceKind:'plain_mp4',matteMethod:'black_luma',screenColor:'auto',alphaScale:.5,width:720,height:1560,fps:24,targetBytes:3000000,quality:'balanced',rgbAlphaMode:'straight',keepAudio:true,audioGain:1,confirmedOpaque:false,lightRecovery:false,videoOffsetY:0,...options};
  if(!finite(o.videoOffsetY)||o.videoOffsetY< -1||o.videoOffsetY>1)throw new VapError('invalid','视频位置须在画布高度的 -100%–100% 内。');
  try{o.giftFade=normalizeGiftFade(o.giftFade)}catch(error){throw new VapError('invalid',error.message,error)}
  if(o.verticalMask===undefined)o.verticalMask={enabled:false};
  else{
    const m=o.verticalMask;
    if(!m||typeof m!=='object'||Array.isArray(m)||typeof m.enabled!=='boolean')throw new VapError('invalid','上下渐变遮罩设置无效。');
    if(m.enabled){
      const {topStart,topEnd,bottomStart,bottomEnd}=m;
      if(![topStart,topEnd,bottomStart,bottomEnd].every(value=>finite(value)&&value>=0&&value<=1)
        ||!(topStart<topEnd&&topEnd<=bottomStart&&bottomStart<bottomEnd))throw new VapError('invalid','渐变范围须按顶部起点、顶部终点、底部起点、底部终点依次排列。');
      o.verticalMask={enabled:true,topStart,topEnd,bottomStart,bottomEnd};
    }else o.verticalMask={enabled:false};
  }
  if(!['plain_mp4','chroma_mp4'].includes(o.sourceKind))throw new VapError('invalid','请选择普通 MP4 或纯色幕布 MP4。');
  const methods=o.sourceKind==='chroma_mp4'?['chroma_key']:['black_luma','white_luma','ai_foreground','manual_mask','opaque'];
  if(!methods.includes(o.matteMethod))throw new VapError('invalid','当前输入类型与去背景方式不匹配。');
  if(!['auto',...SCREEN_COLORS].includes(o.screenColor)||![.5,1].includes(o.alphaScale)||!['ultra','quality','balanced','size'].includes(o.quality)||typeof o.keepAudio!=='boolean')throw new VapError('invalid','转换参数无效，请重新选择。');
  if(o.background!==undefined){
    if(!Array.isArray(o.background)||o.background.length!==3||!o.background.every(value=>Number.isInteger(value)&&value>=0&&value<=255))throw new VapError('invalid','幕布颜色须为有效的 RGB 数值。');
    o.background=o.background.slice();
  }
  if(o.sourceKind==='chroma_mp4'&&o.screenColor==='custom'&&!o.background)throw new VapError('invalid','自定义幕色需要有效的 RGB 数值。');
  if(!['straight','premultiplied'].includes(o.rgbAlphaMode))throw new VapError('invalid','RGB 羽化方式无效。');
  if(typeof o.lightRecovery!=='boolean')throw new VapError('invalid','光效透明修复参数无效。');
  if(!finite(o.audioGain)||o.audioGain<0||o.audioGain>2)throw new VapError('invalid','视频音量须为 0–200%。');
  o.packageReserveBytes ??= 0;
  if(!Number.isSafeInteger(o.packageReserveBytes)||o.packageReserveBytes<0)throw new VapError('invalid','资源包预留体积无效。');
  if(o.packageReserveBytes>2000000)throw new VapError('budget','默认资源过大，无法将完整包控制在 3 MB 以内，请减小头像尺寸。');
  if(o.matteMethod==='opaque'&&o.confirmedOpaque!==true)throw new VapError('invalid','请先确认保留不透明的矩形背景。');
  if(o.matteMethod==='manual_mask'&&!o.maskFile)throw new VapError('invalid','请先选择与原视频同步的遮罩文件。');
  integer(o.width,16,2048,'宽度');integer(o.height,16,2048,'高度');integer(o.fps,1,60,'帧率');integer(o.targetBytes,1024,500000000,'目标字节数');
  o.targetBytes=Math.min(o.targetBytes,LIMITS.outputBytes);
  if(!['dynamic','baked'].includes(o.resourceMode??'dynamic'))throw new VapError('invalid','资源导出方式无效。');
  o.resourceMode ??= 'dynamic';
  if(o.sourceVapConfig){
    try{validateVapc(o.sourceVapConfig)}catch(error){throw new VapError('invalid','原 VAP 配置无效，无法读取头像或文字动画。',error)}
    if(metadata.width&&(metadata.width!==o.sourceVapConfig.info.videoW||metadata.height!==o.sourceVapConfig.info.videoH))throw new VapError('invalid','原 VAP 配置与视频实际尺寸不符。');
  }
  try{o.resources=normalizeResources(o.resources||[],{width:o.width,height:o.height,duration:metadata.duration||120,sourceVapConfig:o.sourceVapConfig})}
  catch(error){throw new VapError('invalid',error.message,error)}
  // Tencent's native mix shader accumulates premultiplied resource colors.
  if(o.resources.length&&o.resourceMode==='dynamic')o.rgbAlphaMode='premultiplied';
  const layout=o.resourceMode==='dynamic'?computeResourceLayout(computeVapLayout(o),o.resources,{sourceVapConfig:o.sourceVapConfig}):computeVapLayout(o);
  if(Math.max(layout.videoW,layout.videoH)>4096)throw new VapError('limits','打包后的视频尺寸过大，请降低输出尺寸。');
  if(metadata.duration&&(!finite(metadata.duration)||metadata.duration>120))throw new VapError('limits','视频最长支持 120 秒，请先截取所需片段。');
  return o;
}

// Keep the public baseline default; the encoder negotiates a more efficient
// profile when the browser can encode AND decode the exact packed geometry.
export function avcCodec(width,height,fps,bitrate,profile='baseline'){
  const blocks=Math.ceil(width/16)*Math.ceil(height/16),rate=blocks*fps;
  const levels=[[31,3600,108000,14000000],[32,5120,216000,20000000],[40,8192,245760,20000000],[41,8192,245760,50000000],[42,8704,522240,50000000],[50,22080,589824,135000000],[51,36864,983040,240000000],[52,36864,2073600,240000000]];
  const level=levels.find(([,frame,mbps,bps])=>blocks<=frame&&rate<=mbps&&bitrate<=bps)?.[0];
  if(!level)throw new VapError('unsupported','该分辨率和帧率超出本工具的 H.264 兼容配置，请降低参数。');
  const prefix={high:'6400',main:'4d00',baseline:'4200'}[profile];
  if(!prefix)throw new VapError('invalid','H.264 编码配置无效。');
  return 'avc1.'+prefix+level.toString(16).padStart(2,'0');
}

export function planEncoding(options,metadata){
  const layout=options.resourceMode==='dynamic'?computeResourceLayout(computeVapLayout(options),options.resources||[],{sourceVapConfig:options.sourceVapConfig}):computeVapLayout(options),audioRate=options.keepAudio&&options.audioGain!==0&&metadata.hasAudio?(options.audioGain!==1?128000:metadata.audioBitrate||80000):0;
  let resourceConfigBytes=0;
  if(options.resources?.length&&options.resourceMode==='dynamic'){
    const frames=Math.max(1,Math.ceil(metadata.duration*options.fps-1e-7));
    const config=makeVapc({width:options.width,height:options.height,fps:options.fps,frames,alphaScale:options.alphaScale,packedLayout:layout});
    addResourceConfig(config,{resources:options.resources,layout,fps:options.fps,frames,duration:metadata.duration,sourceVapConfig:options.sourceVapConfig});
    resourceConfigBytes=new TextEncoder().encode(JSON.stringify(config)).length;
    if(resourceConfigBytes>1000000)throw new VapError('limits','资源动画配置过大，请缩短视频或减少资源。');
  }
  // Reserve room for MP4/vapc metadata and the downloadable ZIP/config wrapper.
  const byteLimit=Math.min(options.targetBytes,LIMITS.outputBytes)-Math.min(8192,Math.floor(options.targetBytes*.02))-(options.packageReserveBytes||0)-resourceConfigBytes;
  const budget=Math.floor((byteLimit-resourceConfigBytes)*8/metadata.duration-audioRate-40000);
  const pixels=layout.videoW*layout.videoH*options.fps;
  const floor=Math.max(350000,Math.round(pixels*.045)),preferred=Math.max(500000,Math.round(pixels*.10));
  let bitrate=options.quality==='ultra'?Math.max(preferred,Math.round(pixels*.25)):
    options.quality==='quality'?Math.max(preferred,Math.round(pixels*.15)):
    options.quality==='size'?Math.max(150000,Math.min(preferred,budget)):Math.max(floor,Math.min(preferred,budget));
  bitrate=Math.min(options.quality==='ultra'?32000000:24000000,bitrate);
  const qualityBudgetLimited=bitrate>budget;
  bitrate=Math.max(32000,Math.min(bitrate,budget));
  return {layout,bitrate,byteLimit,audioRate,resourceConfigBytes,budgetBitrate:budget,qualityBudgetLimited,maxBitrate:options.quality==='ultra'?32000000:24000000,codec:avcCodec(layout.videoW,layout.videoH,options.fps,bitrate)};
}

function canvas(width,height,{readback=true}={}){
  const c=typeof OffscreenCanvas==='function'?new OffscreenCanvas(width,height):Object.assign(document.createElement('canvas'),{width,height});
  const ctx=c.getContext('2d',{willReadFrequently:readback});
  if(!ctx)throw new VapError('unsupported','此浏览器无法创建视频画布。');
  ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
  return {canvas:c,ctx};
}

function videoEncodingSettings(M,plan){
  return {fullCodecString:plan.codec,quality:new M.Quality({bitrate:plan.bitrate}),bitrateMode:'variable',latencyMode:'quality',hardwareAcceleration:'no-preference'};
}

function prepareNativeOpaque(o,info,matteModule,images){
  if(o.sourceVapConfig||(o.resources?.length&&o.resourceMode==='baked'))return {enabled:false,reason:'resource-composition'};
  if(o.matteMethod!=='opaque'||o.sourceKind!=='plain_mp4')return {enabled:false,reason:null};
  // AVC has no alpha plane. Other source codecs keep their decoded per-frame
  // alpha semantics instead of assuming that the entire clip is opaque.
  if(info.codec!=='avc')return {enabled:false,reason:'source-alpha-not-proven'};
  if(info.nativeOpaqueSource!==true)return {enabled:false,reason:'source-geometry-alpha-not-proven'};
  if(typeof matteModule.applyVerticalMask!=='function')return {enabled:false,reason:'mask-helper-unavailable'};
  const scale=Math.min(o.width/info.width,o.height/info.height),w=info.width*scale,h=info.height*scale,x=(o.width-w)/2,y=(o.height-h)/2+o.videoOffsetY*o.height;
  const white=canvas(info.width,info.height),coverage=canvas(o.width,o.height);
  images.push(white.canvas,coverage.canvas);white.ctx.fillStyle='#fff';white.ctx.fillRect(0,0,info.width,info.height);
  // Use the original readback canvas settings once to preserve contain coverage
  // and the exact mask round/downsample order, including transparent letterboxes.
  coverage.ctx.drawImage(white.canvas,x,y,w,h);
  const base=coverage.ctx.getImageData(0,0,o.width,o.height);
  for(let i=3;i<base.data.length;i+=4)if(base.data[i]!==0&&base.data[i]!==255){
    white.canvas.width=white.canvas.height=coverage.canvas.width=coverage.canvas.height=1;
    // The old path unpremultiplies partially covered edge pixels before making
    // RGB opaque. Drawing them over black would darken them, so keep that path.
    return {enabled:false,reason:'fractional-contain-coverage'};
  }
  const weighted=matteModule.applyVerticalMask(base.data,o.width,o.height,o.verticalMask);
  let hasClearPixels=false,hasNonOpaquePixels=false;
  for(let i=0;i<weighted.length;i+=4){const alpha=weighted[i+3];hasClearPixels ||= alpha===0;hasNonOpaquePixels ||= alpha!==255;weighted[i]=weighted[i+1]=weighted[i+2]=alpha;weighted[i+3]=255;}
  coverage.ctx.putImageData(new ImageData(weighted,o.width,o.height),0,0);
  const [, ,aw,ah]=computeVapLayout(o).aFrame,alpha=canvas(aw,ah);images.push(alpha.canvas);
  alpha.ctx.drawImage(coverage.canvas,0,0,aw,ah);
  // Keep Alpha continuous and independent of RGB. Reference-style exports
  // multiply RGB by full-resolution alpha; straight mode only clears hidden RGB.
  const needsRGBMask=o.rgbAlphaMode==='premultiplied'?hasNonOpaquePixels:hasClearPixels;
  if(needsRGBMask&&o.rgbAlphaMode==='straight'){
    for(let i=0;i<weighted.length;i+=4)weighted[i]=weighted[i+1]=weighted[i+2]=weighted[i]===0?0:255;
    coverage.ctx.putImageData(new ImageData(weighted,o.width,o.height),0,0);
  }
  if(!needsRGBMask)coverage.canvas.width=coverage.canvas.height=1;
  white.canvas.width=white.canvas.height=1;
  return {enabled:true,reason:null,alpha:alpha.canvas,rgbMask:needsRGBMask?coverage.canvas:null,rect:[x,y,w,h]};
}
async function open(file){
  fileCheck(file);const M=await media();
  const input=new M.Input({source:new M.BlobSource(file),formats:[M.MP4]});
  try{
    if(!await input.canRead())throw new VapError('file','无法识别此 MP4，请检查文件是否完整。');
    const video=await input.getPrimaryVideoTrack(),audio=await input.getPrimaryAudioTrack();
    if(!video)throw new VapError('file','文件中没有可读取的视频轨道。');
    const [width,height,duration,metrics,codec,canDecode,hdr]=await Promise.all([video.getDisplayWidth(),video.getDisplayHeight(),input.computeDuration(),video.computeFrameRateMetrics(),video.getCodec(),video.canDecode(),video.hasHighDynamicRange()]);
    if(!canDecode)throw new VapError('decode','浏览器无法解码此视频，请先转为 H.264 MP4。');
    if(!finite(duration)||duration<=0||duration>120||!finite(width)||!finite(height)||Math.max(width,height)>4096)throw new VapError('limits','请使用 120 秒以内、最长边不超过 4096px 的视频。');
    if(hdr)throw new VapError('unsupported','此版本仅支持 SDR 视频，请先将 HDR 视频转换为 SDR。');
    let nativeOpaqueSource=false;
    if(codec==='avc')try{
      const [codedWidth,codedHeight,sar,rotation,flip]=await Promise.all([video.getCodedWidth(),video.getCodedHeight(),video.getPixelAspectRatio(),video.getRotation(),video.getFlip()]);
      // These metadata constraints keep CanvasSink's fixed output from adding
      // transparent contain padding of its own. Unknown/transformed sources use
      // the original processor, without requiring a per-frame alpha readback.
      nativeOpaqueSource=codedWidth===width&&codedHeight===height&&Number.isSafeInteger(sar?.num)&&sar.num>0&&sar.num===sar.den&&rotation===0&&flip===false;
    }catch(ignored){}
    const audioCodec=audio?await audio.getCodec():null;
    const audioStats=audio?await audio.computePacketStats(100):null;
    const info={width:Math.round(width),height:Math.round(height),duration,fps:metrics.bestGuessFrameRate||24,hasAudio:!!audio,audioCodec,audioBitrate:audioStats?.averageBitrate||0,codec,nativeOpaqueSource};
    return {M,input,video,audio,info};
  }catch(error){input.dispose();if(error instanceof VapError)throw error;throw new VapError('file','视频读取失败，请使用完整的 MP4 文件。',error)}
}

async function detectSampledSource({M,video,info}){
  let surface;
  try{
    const scale=Math.min(1,128/Math.max(info.width,info.height));
    const width=Math.max(1,Math.round(info.width*scale)),height=Math.max(1,Math.round(info.height*scale));
    surface=canvas(width,height);const sink=new M.CanvasSink(video,{poolSize:1}),frames=[];
    for(const fraction of [.12,.5,.85]){
      const frame=await sink.getCanvas(info.duration*fraction);if(!frame)continue;
      surface.ctx.clearRect(0,0,width,height);surface.ctx.drawImage(frame.canvas,0,0,width,height);
      frames.push(surface.ctx.getImageData(0,0,width,height));
    }
    return detectVideoSource(frames);
  }catch(ignored){return {sourceKind:'plain_mp4',screenColor:'auto',confidence:0}}
  finally{if(surface)surface.canvas.width=surface.canvas.height=1}
}

export async function inspectVideo(file,{detectSource=false}={}){
  const opened=await open(file);
  try{return detectSource?{...opened.info,sourceDetection:await detectSampledSource(opened)}:opened.info}
  finally{opened.input.dispose()}
}

export async function probeSupport(options={}){
  const o=normalizeOptions(options),layout=o.resourceMode==='dynamic'?computeResourceLayout(computeVapLayout(o),o.resources,{sourceVapConfig:o.sourceVapConfig}):computeVapLayout(o);
  const result={secureContext:globalThis.isSecureContext===true,webCodecsEncode:typeof VideoEncoder==='function',webCodecsDecode:typeof VideoDecoder==='function',canEncodeAvc:false,canEncodeAac:false,webGpu:!!globalThis.navigator?.gpu,webGl2:false,limits:LIMITS};
  try{const c=typeof OffscreenCanvas==='function'?new OffscreenCanvas(1,1):document.createElement('canvas');result.webGl2=!!c.getContext('webgl2');}catch(ignored){}
  if(result.webCodecsEncode)try{
    const M=await media();
    [result.canEncodeAvc,result.canEncodeAac]=await Promise.all([
      (async()=>{for(const profile of ['high','main','baseline'])if(await M.canEncodeVideo('avc',{width:layout.videoW,height:layout.videoH,frameRate:o.fps,...videoEncodingSettings(M,{codec:avcCodec(layout.videoW,layout.videoH,o.fps,2000000,profile),bitrate:2000000})}))return true;return false})(),
      M.canEncodeAudio('aac',{numberOfChannels:2,sampleRate:48000,quality:new M.Quality({bitrate:80000})})
    ]);
  }catch(ignored){}
  return {...result,supported:result.secureContext&&result.webCodecsDecode&&result.webCodecsEncode&&result.canEncodeAvc};
}

/** Pack either reference-style feathered RGB or legacy straight RGB with independent alpha. */
export function splitPlanes(rgba,width,height,rgb,alpha,rgbAlphaMode='straight'){
  if(!(rgba instanceof Uint8ClampedArray)||rgba.length!==width*height*4)throw new VapError('matte','前景处理返回的像素尺寸不匹配。');
  if(!rgb)rgb=new Uint8ClampedArray(rgba.length);if(!alpha)alpha=new Uint8ClampedArray(rgba.length);
  if(rgb.length!==rgba.length||alpha.length!==rgba.length)throw new VapError('matte','打包缓冲区尺寸不匹配。');
  if(!['straight','premultiplied'].includes(rgbAlphaMode))throw new VapError('invalid','RGB 羽化方式无效。');
  const premultiplied=rgbAlphaMode==='premultiplied';
  for(let i=0;i<rgba.length;i+=4){
    const a=rgba[i+3];
    if(a===0)rgb[i]=rgb[i+1]=rgb[i+2]=0;
    else if(a===255||!premultiplied){rgb[i]=rgba[i];rgb[i+1]=rgba[i+1];rgb[i+2]=rgba[i+2];}
    else{rgb[i]=Math.round(rgba[i]*a/255);rgb[i+1]=Math.round(rgba[i+1]*a/255);rgb[i+2]=Math.round(rgba[i+2]*a/255);}
    rgb[i+3]=255;alpha[i]=alpha[i+1]=alpha[i+2]=a;alpha[i+3]=255;
  }
  return {rgb,alpha};
}

async function encodingProbe(M,plan,fps,signal){
  cancelled(signal);const surface=canvas(plan.layout.videoW,plan.layout.videoH);
  surface.ctx.fillStyle='#000';surface.ctx.fillRect(0,0,surface.canvas.width,surface.canvas.height);
  const target=new M.BufferTarget(),output=new M.Output({format:new M.Mp4OutputFormat({fastStart:'in-memory'}),target});
  const source=new M.CanvasSource(surface.canvas,{codec:'avc',...videoEncodingSettings(M,plan)});
  output.addVideoTrack(source);let input;
  try{
    await output.start();for(let i=0;i<3;i++){cancelled(signal);await source.add(i/fps,1/fps,{keyFrame:i===0})}source.close();await output.finalize();
    input=new M.Input({source:new M.BufferSource(target.buffer),formats:[M.MP4]});
    const track=await input.getPrimaryVideoTrack(),decoded=track?await new M.CanvasSink(track,{poolSize:1}).getCanvas(0):null;
    if(!decoded||decoded.canvas.width!==plan.layout.videoW||decoded.canvas.height!==plan.layout.videoH)throw new Error('Encoded probe could not be decoded');
  }catch(error){await output.cancel().catch(()=>{});if(error instanceof VapError)throw error;throw new VapError('encode','H.264 编码探针未通过，请降低尺寸或使用最新版 Chrome／Edge。',error)}
  finally{input?.dispose();surface.canvas.width=surface.canvas.height=1;}
}

async function selectEncodingPlan(M,plan,fps,signal){
  let lastError;
  for(const profile of ['high','main','baseline']){
    cancelled(signal);
    const candidate={...plan,codec:avcCodec(plan.layout.videoW,plan.layout.videoH,fps,plan.bitrate,profile),profile};
    try{
      if(!await M.canEncodeVideo('avc',{width:plan.layout.videoW,height:plan.layout.videoH,frameRate:fps,...videoEncodingSettings(M,candidate)}))continue;
      await encodingProbe(M,candidate,fps,signal);return candidate;
    }catch(error){if(signal?.aborted||error?.code==='cancelled')throw error;lastError=error}
  }
  throw new VapError('unsupported','当前浏览器无法可靠编码此 H.264 尺寸与码率，请降低参数后重试。',lastError);
}

// The source already carries alpha. Canvas source-in extracts that alpha as a
// white image; drawing over the black packed canvas yields grayscale alpha.
// RGB over black is the corresponding premultiplied RGB, avoiding per-frame
// readback and JavaScript pixel copies at the default export mode.
function prepareSequenceRgba(o,info,matteModule,images){
  if(info.codec!=='image_sequence'||o.matteMethod!=='opaque'||o.rgbAlphaMode!=='premultiplied'||o.resources.length&&o.resourceMode==='baked')return {enabled:false};
  const frame=canvas(o.width,o.height,{readback:false}),alpha=canvas(o.width,o.height,{readback:false});images.push(frame.canvas,alpha.canvas);
  if(!('globalCompositeOperation' in frame.ctx)||!('globalCompositeOperation' in alpha.ctx))return {enabled:false};
  let mask=null;
  if(o.verticalMask.enabled){
    if(typeof matteModule.applyVerticalMask!=='function')return {enabled:false};
    mask=canvas(1,o.height);images.push(mask.canvas);const rgba=new Uint8ClampedArray(o.height*4);rgba.fill(255);
    mask.ctx.putImageData(new ImageData(matteModule.applyVerticalMask(rgba,1,o.height,o.verticalMask),1,o.height),0,0);
  }
  const scale=Math.min(o.width/info.width,o.height/info.height),w=info.width*scale,h=info.height*scale,rect=[(o.width-w)/2,(o.height-h)/2+o.videoOffsetY*o.height,w,h];
  return {enabled:true,draw(source,packed,layout){
    frame.ctx.clearRect(0,0,o.width,o.height);frame.ctx.drawImage(source,...rect);
    if(mask){frame.ctx.globalCompositeOperation='destination-in';frame.ctx.drawImage(mask.canvas,0,0,o.width,o.height);frame.ctx.globalCompositeOperation='source-over';}
    packed.ctx.drawImage(frame.canvas,0,0);
    alpha.ctx.clearRect(0,0,o.width,o.height);alpha.ctx.drawImage(frame.canvas,0,0);alpha.ctx.globalCompositeOperation='source-in';alpha.ctx.fillStyle='#fff';alpha.ctx.fillRect(0,0,o.width,o.height);alpha.ctx.globalCompositeOperation='source-over';
    packed.ctx.drawImage(alpha.canvas,...layout.aFrame);
  }};
}
function sequenceCanvases(source,signal){
  const hardware=Number(globalThis.navigator?.hardwareConcurrency)||4,memory=Number(globalThis.navigator?.deviceMemory);
  // Budget includes the current bitmap, completed future bitmaps and active
  // decodes. Keep compressed source blobs, never the whole decoded animation.
  const capacity=Math.max(1,Math.min(source.frameCount,3,Math.max(1,Math.floor(hardware)-1),memory>0&&memory<=4?2:3,Math.floor(32*1024*1024/(source.width*source.height*4))));
  const pending=[];let nextIndex=0,current=null,active=null,closed=false,closedError=null,decodeFailed=false,notifyStop;
  const stopped=new Promise(resolve=>{notifyStop=resolve});
  const release=slot=>{if(slot?.bitmap){slot.bitmap.close();slot.bitmap=null;}};
  function stop(error=null){
    if(closed)return;closed=true;closedError=error;
    current?.close();current=null;release(active);for(const slot of pending)release(slot);pending.length=0;
    signal?.removeEventListener('abort',onAbort);notifyStop({stopped:true,error});
  }
  function onAbort(){stop(new VapError('cancelled','转换已取消。'));}
  function fill(){
    while(!closed&&!decodeFailed&&pending.length<capacity&&nextIndex<source.frameCount){
      const slot={bitmap:null,error:null};pending.push(slot);
      // Observe every rejection immediately. A late native decode is not
      // cancellable, but its bitmap must still be closed after return/abort.
      slot.promise=decodeSequenceFrame(source,nextIndex++,{signal}).then(bitmap=>{
        if(closed){bitmap.close();return {stopped:true,error:closedError};}
        slot.bitmap=bitmap;return slot;
      },error=>{slot.error=error;decodeFailed=true;return slot;});
    }
  }
  if(signal?.aborted)onAbort();else signal?.addEventListener('abort',onAbort,{once:true});
  return {
    capacity,
    [Symbol.asyncIterator](){return this;},
    async next(){
      if(closed){if(closedError)throw closedError;return {done:true};}
      // The previous frame's resources, preview and encoder have all finished
      // before runPass asks for the next one, so it is now safe to close it.
      current?.close();current=null;fill();
      if(!pending.length){stop();return {done:true};}
      active=pending.shift();const slot=await Promise.race([active.promise,stopped]);
      if(closed||slot.stopped){if(closedError||slot.error)throw closedError||slot.error;return {done:true};}
      if(slot.error){stop(slot.error);throw slot.error;}
      current=slot.bitmap;slot.bitmap=null;active=null;
      return {done:false,value:{canvas:current}};
    },
    async return(){stop();return {done:true};}
  };
}

function fadePackedFrame(ctx,layout,opacity,mode){
  if(opacity===1)return;
  // Packed planes are opaque RGB over black. Blend black instead of reading
  // pixels back; native/sequence fast paths and worker processing stay intact.
  ctx.save();ctx.fillStyle='#000';ctx.globalAlpha=1-opacity;
  ctx.fillRect(...layout.aFrame);
  if(mode==='premultiplied'||opacity===0){ctx.globalAlpha=mode==='premultiplied'?1-opacity:1;ctx.fillRect(...layout.rgbFrame);}
  // Resource masks are independent top layers and are drawn after this fade.
  ctx.restore();
}

async function runPass(file,o,plan,{signal,progress,onPreview,pass,totalPasses}){
  const sequence=file?.kind==='image_sequence',started=clock(),opened=sequence?{M:await media(),input:{dispose(){}},video:null,audio:null,info:sequenceMetadata(file,o.fps)}:await open(file),{M,input,video,audio,info}=opened;
  const times={decodeMs:0,matteMs:0,packMs:0,opaquePrepareMs:null,previewMs:null,encodeMs:0,muxMs:0,vapcMs:0,wallMs:0};
  let output,processor,workerPool,resourceRenderer,unpacker,videoSource,audioSource,iterator,failed=null,actualCodec=plan.codec,audioMode=audio&&(!o.keepAudio||o.audioGain===0)?'muted':'none';
  const abort=()=>{failed ||= new VapError('cancelled','转换已取消。');workerPool?.dispose();input.dispose();void output?.cancel().catch(()=>{})};
  signal?.addEventListener('abort',abort,{once:true});
  const images=[];
  try{
    cancelled(signal);
    let matteModule;
    try{matteModule=await import('./vap-matte.mjs?v=20261030-vap-position2');processor=await matteModule.createMatteProcessor({...o,signal,onProgress:event=>progress({phase:'loading',progress:.03,detail:event})})}
    catch(error){if(signal?.aborted)throw new VapError('cancelled','转换已取消。',error);throw new VapError('matte',error.message||'本地去背景组件未能加载，请重试。',error)}
    cancelled(signal);
    // Only independent chroma frames with a fixed measured plate enter the
    // bounded worker pipeline. Unknown plates, native VAP, resources and
    // stateful/masked providers retain their existing path.
    if(typeof Worker==='function'&&!sequence&&!o.sourceVapConfig&&!o.resources.length&&o.matteMethod==='chroma_key'&&Array.isArray(o.background)&&typeof processor.readFrame==='function'){
      try{const module=await import('./vap-matte-workers.mjs?v=20261029-detail1');workerPool=await module.createChromaWorkerPool(o,{signal});}
      catch(error){if(signal?.aborted||error?.code==='cancelled')throw new VapError('cancelled','转换已取消。',error);workerPool=null;}
    }
    cancelled(signal);
    if(o.sourceVapConfig)unpacker=createVapUnpacker({width:o.width,height:o.height,sourceVapConfig:o.sourceVapConfig,verticalMask:o.verticalMask,videoOffsetY:o.videoOffsetY});
    if(o.resources.length)try{resourceRenderer=await createResourceRenderer(o.resources,{width:o.width,height:o.height,duration:info.duration,fps:o.fps,verticalMask:o.verticalMask,sourceVapConfig:o.sourceVapConfig,signal,includeDefaultAvatars:false})}catch(error){if(signal?.aborted)throw new VapError('cancelled','转换已取消。',error);throw new VapError('invalid',error.message,error)}
    const prepareStart=clock(),native=prepareNativeOpaque(o,info,matteModule,images),sequenceRgba=prepareSequenceRgba(o,info,matteModule,images);
    if(o.matteMethod==='opaque'&&o.sourceKind==='plain_mp4')times.opaquePrepareMs=clock()-prepareStart;
    if(native.enabled||sequenceRgba.enabled)times.matteMs=null;
    // Retain the canvas-to-VideoFrame color conversion/range. The fast
    // path still avoids JavaScript per-frame readback and RGBA plane copying.
    const fast=native.enabled||sequenceRgba.enabled,rgb=fast?null:canvas(o.width,o.height),alpha=fast?null:canvas(o.width,o.height),packed=canvas(plan.layout.videoW,plan.layout.videoH,{readback:true});
    images.push(...[rgb?.canvas,alpha?.canvas,packed.canvas].filter(Boolean));
    const target=new M.BufferTarget();output=new M.Output({format:new M.Mp4OutputFormat({fastStart:'in-memory'}),target});
    videoSource=new M.CanvasSource(packed.canvas,{codec:'avc',...videoEncodingSettings(M,plan),keyFrameInterval:2,onEncoderConfig:config=>{actualCodec=config.codec}});
    output.addVideoTrack(videoSource);
    if(audio&&o.keepAudio&&o.audioGain>0){
      if(info.audioCodec==='aac'&&o.audioGain===1){audioMode='copied';audioSource=new M.EncodedAudioPacketSource('aac');}
      else{
        const channels=await audio.getNumberOfChannels(),sampleRate=await audio.getSampleRate(),bitrate=o.audioGain===1?80000:128000;
        if(!await audio.canDecode()||!await M.canEncodeAudio('aac',{numberOfChannels:channels,sampleRate,quality:new M.Quality({bitrate})}))throw new VapError('audio',o.audioGain===1?'浏览器无法将此音轨转换为 AAC；请先转换音轨，或手动取消保留音频。':'当前浏览器无法编码调整后的音量；请将音量恢复为 100%，或取消保留音频。');
        audioMode='transcoded';audioSource=new M.AudioSampleSource({codec:'aac',quality:new M.Quality({bitrate})});
      }
      output.addAudioTrack(audioSource);
    }
    await output.start();
    const frameCount=sequence?file.frameCount:Math.max(1,Math.ceil(info.duration*o.fps-1e-7)),videoStart=sequence?0:await video.getFirstTimestamp(),videoEnd=sequence?info.duration:await video.computeDuration();
    const sink=sequence?null:new M.CanvasSink(video,{width:info.width,height:info.height,fit:'contain',poolSize:1,alpha:true});
    function* timestamps(){for(let frame=0;frame<frameCount;frame++)yield Math.max(videoStart,Math.min(frame/o.fps,Math.max(videoStart,videoEnd-1e-6)))}
    iterator=sequence?sequenceCanvases(file,signal):sink.canvasesAtTimestamps(timestamps());
    async function decodeNext(){
      const t=clock();let decoded;
      try{decoded=await iterator.next()}catch(error){if(signal?.aborted)throw new VapError('cancelled','转换已取消。',error);if(sequence&&error?.code)throw new VapError(error.code,error.message,error);throw new VapError('decode','视频帧解码失败，请检查文件或先转换为 H.264。',error)}
      times.decodeMs+=clock()-t;
      if(decoded.done||!decoded.value)throw new VapError('decode','解码帧不足，未生成截断的视频。请检查原视频。');
      return decoded;
    }
    const prepared=[];let scheduled=0;
    async function fillMattePipeline(){
      while(workerPool&&prepared.length<workerPool.size&&scheduled<frameCount){
        if(failed)throw failed;
        cancelled(signal);const decoded=await decodeNext(),t=clock();
        if(failed)throw failed;
        const image=processor.readFrame(decoded.value.canvas,{width:o.width,height:o.height});times.matteMs+=clock()-t;
        const promise=workerPool.process(image);promise.catch(()=>{});prepared.push(promise);scheduled++;
      }
    }
    const rgbPixels=fast?null:new Uint8ClampedArray(o.width*o.height*4),alphaPixels=fast?null:new Uint8ClampedArray(rgbPixels.length);
    const rgbData=fast?null:new ImageData(rgbPixels,o.width,o.height),alphaData=fast?null:new ImageData(alphaPixels,o.width,o.height);
    const audioTask=async()=>{
      if(!audioSource)return;
      try{
        if(audioMode==='copied'){
          const config=await audio.getDecoderConfig();if(!config)throw new VapError('audio','无法读取原 AAC 音轨配置。');
          let first=true;for await(const packet of new M.EncodedPacketSink(audio).packets()){
            cancelled(signal);await audioSource.add(packet,first?{decoderConfig:config}:undefined);first=false;
          }
        }else for await(const sample of new M.AudioSampleSink(audio).samples()){
          let adjusted;
          try{
            cancelled(signal);
            if(o.audioGain!==1){
              const pcm=new Float32Array(sample.numberOfFrames*sample.numberOfChannels);
              sample.copyTo(pcm,{format:'f32',planeIndex:0});
              for(let i=0;i<pcm.length;i++)pcm[i]=Math.max(-1,Math.min(1,pcm[i]*o.audioGain));
              adjusted=new M.AudioSample({data:pcm,format:'f32',numberOfChannels:sample.numberOfChannels,sampleRate:sample.sampleRate,timestamp:sample.timestamp});
            }
            await audioSource.add(adjusted||sample);
          }finally{adjusted?.close();sample.close()}
        }
      }catch(error){const failure=error instanceof VapError?error:new VapError('audio','音轨处理失败，请先转换为 AAC，或手动取消保留音频。',error);failed ||= failure;workerPool?.dispose();void output.cancel().catch(()=>{});throw failure}
      finally{audioSource.close()}
    };
    const videoTask=async()=>{
      try{
        if(workerPool)await fillMattePipeline();
        for(let frame=0;frame<frameCount;frame++){
          cancelled(signal);if(failed)throw failed;
          let t,decoded,matte;
          if(workerPool){
            t=clock();let result;
            try{result=await prepared.shift()}catch(error){if(signal?.aborted||error?.code==='cancelled')throw new VapError('cancelled','转换已取消。',error);throw new VapError('matte',error.message||'后台抠像失败。',error)}
            times.matteMs+=clock()-t;times.workerMs=(times.workerMs??0)+(result.workerMs||0);matte=result.image;
            if(!matte||matte.width!==o.width||matte.height!==o.height)throw new VapError('matte','去背景画布与输出尺寸不匹配。');
            await fillMattePipeline();
          }else decoded=await decodeNext();
          const wantsPreview=onPreview&&(frame===0||frame%o.fps===0||frame===frameCount-1),visible=frame/o.fps>=Math.max(0,videoStart);
          if((!fast||wantsPreview)&&!workerPool){
            t=clock();
            try{
              matte=unpacker?unpacker.process(decoded.value.canvas):await processor.process(decoded.value.canvas,{timestamp:Math.max(0,Math.min(frame/o.fps,videoEnd-1e-6)),width:o.width,height:o.height});
              if(resourceRenderer&&o.resourceMode==='baked')matte=resourceRenderer.apply(matte,frame/o.fps,{sourceCanvas:decoded.value.canvas,includeStatic:true,includeDefaults:false});
            }
            catch(error){if(signal?.aborted)throw new VapError('cancelled','转换已取消。',error);throw new VapError('matte',error.message||'该帧去背景失败，请检查处理方式或遮罩。',error)}
            times.matteMs=(times.matteMs??0)+clock()-t;
            if(!matte||matte.width!==o.width||matte.height!==o.height)throw new VapError('matte','去背景画布与输出尺寸不匹配。');
            if(!visible)matte.data.fill(0);
          }
          if(workerPool&&!visible)matte.data.fill(0);
          t=clock();packed.ctx.fillStyle='#000';packed.ctx.fillRect(0,0,packed.canvas.width,packed.canvas.height);
          const [ax,ay,aw,ah]=plan.layout.aFrame;
          if(sequenceRgba.enabled){sequenceRgba.draw(decoded.value.canvas,packed,plan.layout);}
          else if(native.enabled){
            if(visible){
              packed.ctx.save();packed.ctx.beginPath();packed.ctx.rect(0,0,o.width,o.height);packed.ctx.clip();packed.ctx.drawImage(decoded.value.canvas,...native.rect);packed.ctx.restore();
              // Cached full-resolution mask: continuous RGB feather or legacy clear-only
              // packing, with no per-frame JavaScript pixel readback.
              if(native.rgbMask){packed.ctx.globalCompositeOperation='multiply';packed.ctx.drawImage(native.rgbMask,0,0);packed.ctx.globalCompositeOperation='source-over';}
              packed.ctx.drawImage(native.alpha,ax,ay);
            }
          }else{
            splitPlanes(matte.data,o.width,o.height,rgbPixels,alphaPixels,o.rgbAlphaMode);rgb.ctx.putImageData(rgbData,0,0);alpha.ctx.putImageData(alphaData,0,0);
            packed.ctx.drawImage(rgb.canvas,0,0);packed.ctx.drawImage(alpha.canvas,ax,ay,aw,ah);
          }
          const opacity=giftFadeOpacity(frame/o.fps,info.duration,o.fps,o.giftFade);
          fadePackedFrame(packed.ctx,plan.layout,opacity,o.rgbAlphaMode);
          if(resourceRenderer&&o.resourceMode==='dynamic'){
            if(resourceRenderer.hasStaticLayers)resourceRenderer.drawStaticPlanes(packed.ctx,plan.layout,frame/o.fps,{resourceOpacity:opacity});
            resourceRenderer.drawMasks(packed.ctx,plan.layout,frame/o.fps,decoded.value.canvas,{resourceOpacity:opacity});
          }
          times.packMs+=clock()-t;
          if(wantsPreview){t=clock();const faded=applyGiftFade(matte,opacity);await onPreview(resourceRenderer&&o.resourceMode==='dynamic'?resourceRenderer.apply(faded,frame/o.fps,{sourceCanvas:decoded.value.canvas,resourceOpacity:opacity,includeStatic:true,includeDefaults:false}):faded);times.previewMs=(times.previewMs??0)+clock()-t;}
          t=clock();await videoSource.add(frame/o.fps,Math.min(1/o.fps,info.duration-frame/o.fps),{keyFrame:frame%(o.fps*2)===0});times.encodeMs+=clock()-t;
          progress({phase:'encoding',progress:.05+.90*((pass-1+(frame+1)/frameCount)/totalPasses),frame:frame+1,totalFrames:frameCount,pass});
        }
      }catch(error){failed ||= error;void output.cancel().catch(()=>{});throw error}
      finally{workerPool?.dispose();prepared.length=0;videoSource.close();await iterator.return?.()}
    };
    // Audio and video advance together, respecting muxer backpressure. Neither
    // track is buffered for the entire clip while waiting for the other track.
    const results=await Promise.allSettled([videoTask(),audioTask()]);
    const failure=results.find(result=>result.status==='rejected');if(failure)throw failed||failure.reason;cancelled(signal);
    progress({phase:'packaging',progress:totalPasses===1?.97:.05+.90*pass/totalPasses,frame:frameCount,totalFrames:frameCount,pass});
    let t=clock();await output.finalize();times.muxMs=clock()-t;
    const config=makeVapc({width:o.width,height:o.height,fps:o.fps,frames:frameCount,alphaScale:o.alphaScale,packedLayout:plan.layout});
    config.funToolkit={exportRevision:'rgb-feather-v1',rgbAlphaMode:o.rgbAlphaMode,verticalMask:{...o.verticalMask},videoOffsetY:o.videoOffsetY,giftFade:{...o.giftFade}};
    if(o.lightRecovery&&o.matteMethod==='chroma_key')config.funToolkit.lightRecovery=true;
    if(o.resources.length&&o.resourceMode==='dynamic')addResourceConfig(config,{resources:o.resources,layout:plan.layout,fps:o.fps,frames:frameCount,duration:info.duration,sourceVapConfig:o.sourceVapConfig});
    else if(o.resources.length)config.funToolkit.resourceMode='baked';
    t=clock();const bytes=appendVapcBox(new Uint8Array(target.buffer),config);extractVapcBox(bytes);times.vapcMs=clock()-t;
    times.wallMs=clock()-started;
    return {blob:new Blob([bytes],{type:'video/mp4'}),config,frames:frameCount,audioMode,actualCodec,requestedCodec:plan.codec,bitrate:plan.bitrate,processingPath:workerPool?'matte-workers':sequenceRgba.enabled?'sequence-rgba-canvas':sequence?'sequence-rgba-processor':native.enabled?'native-opaque':'matte-processor',matteWorkerCount:workerPool?.size||0,sequenceDecodeSlots:sequence?iterator.capacity:0,nativeOpaqueFallback:native.reason,times};
  }catch(error){await output?.cancel().catch(()=>{});if(error instanceof VapError)throw error;if(signal?.aborted)throw new VapError('cancelled','转换已取消。',error);throw new VapError('encode','视频转换失败；原视频已保留，请调整参数重试。',error)}
  finally{signal?.removeEventListener('abort',abort);workerPool?.dispose();await iterator?.return?.().catch(()=>{});try{await processor?.dispose()}catch(ignored){}resourceRenderer?.dispose();unpacker?.dispose();input.dispose();for(const c of images)c.width=c.height=1;}
}

export async function convertVideo(file,options={}, {signal,onProgress=()=>{},onPreview}={}){
  const started=clock();cancelled(signal);let last=0;
  const progress=event=>{const next=Math.max(last,Math.min(1,event.progress));last=next;onProgress({...event,progress:next})};
  progress({phase:'loading',progress:0});const sequence=file?.kind==='image_sequence',info=sequence?sequenceMetadata(file,options.fps??24):await inspectVideo(file);cancelled(signal);const analysisMs=clock()-started;
  const o=normalizeOptions(sequence?{...options,sourceKind:'plain_mp4',matteMethod:'opaque',confirmedOpaque:true,sourceVapConfig:undefined}:options,info),plan=planEncoding(o,info),M=await media();
  if(globalThis.isSecureContext!==true||typeof VideoEncoder!=='function'||typeof VideoDecoder!=='function')throw new VapError('unsupported','浏览器不支持所选 H.264 本地转换，请使用最新版 Chrome／Edge 或降低尺寸。');
  if(plan.budgetBitrate<32000)throw new VapError('budget','当前时长与音轨无法满足体积上限，请缩短视频或关闭声音后重试。');
  const passes=4,timings={};let attempts=0,probeMs=0,qualityPasses=0,refinementSkipped=false;
  async function pass(bitrate,reason){
    const startedProbe=clock(),encoding=await selectEncodingPlan(M,{...plan,bitrate},o.fps,signal);probeMs+=clock()-startedProbe;cancelled(signal);
    const result=await runPass(file,o,encoding,{signal,progress:event=>progress({...event,reason}),onPreview,pass:++attempts,totalPasses:passes});
    for(const [key,value] of Object.entries(result.times))timings[key]=!(key in timings)?value:timings[key]===null&&value===null?null:(timings[key]??0)+(value??0);
    return result;
  }
  let lastPass=await pass(plan.bitrate,'initial'),selected=lastPass.blob.size<=plan.byteLimit?lastPass:null,triedQuality=false;
  while(attempts<passes){
    cancelled(signal);let bitrate,reason;
    const fixedBytes=Math.min(plan.byteLimit*.95,plan.audioRate*info.duration/8+plan.resourceConfigBytes+Math.min(8192,plan.byteLimit*.02));
    if(lastPass.blob.size>plan.byteLimit&&lastPass.bitrate>32000){
      bitrate=Math.max(32000,Math.floor(lastPass.bitrate*.94*(plan.byteLimit-fixedBytes)/Math.max(1,lastPass.blob.size-fixedBytes)));reason='budget';
      if(selected&&bitrate<=selected.bitrate*1.02)break;
    }else if(!triedQuality&&selected&&['ultra','quality'].includes(o.quality)&&selected.blob.size<plan.byteLimit*.82&&selected.bitrate<plan.maxBitrate){
      triedQuality=true;
      bitrate=Math.min(plan.maxBitrate,Math.ceil(selected.bitrate*Math.min(4,.92*(plan.byteLimit-fixedBytes)/Math.max(1,selected.blob.size-fixedBytes))));reason='quality';
      if(bitrate<=selected.bitrate*1.10)break;
    }else break;
    try{lastPass=await pass(bitrate,reason);if(reason==='quality')qualityPasses++}
    catch(error){if(signal?.aborted||error?.code==='cancelled'||!selected)throw error;refinementSkipped=true;break}
    if(lastPass.blob.size<=plan.byteLimit&&(!selected||lastPass.bitrate>selected.bitrate))selected=lastPass;
  }
  cancelled(signal);
  if(!selected)throw new VapError('budget','已完成有界压缩，但文件仍超过体积上限，未输出超标成品。请缩短视频或调整参数后重试。');
  cancelled(signal);const warnings=[];
  if(refinementSkipped)warnings.push('quality-refinement-skipped');
  if(plan.layout.legacyDimensionWarning)warnings.push('legacy-size');
  if(['black_luma','white_luma'].includes(o.matteMethod))warnings.push('luma-may-remove-subject');if(o.matteMethod==='opaque'&&!sequence)warnings.push('opaque');if(o.matteMethod==='ai_foreground')warnings.push('ai-person-only');if(selected.audioMode==='transcoded')warnings.push('audio-transcoded');if(o.quality==='size')warnings.push('size-priority-loss');
  const report={valid:true,version:2,transparentRGB:'black',rgbAlphaMode:o.rgbAlphaMode,giftFade:{...o.giftFade},resourceMode:o.resourceMode,resourceCount:o.resources.length,sourceVap:!!o.sourceVapConfig,inputKind:sequence?'image_sequence':'mp4',quality:o.quality,lightRecovery:o.lightRecovery&&o.matteMethod==='chroma_key',qualityBudgetLimited:plan.qualityBudgetLimited,frames:selected.frames,fps:o.fps,width:o.width,height:o.height,packedWidth:plan.layout.videoW,packedHeight:plan.layout.videoH,alphaScale:o.alphaScale,bytes:selected.blob.size,targetBytes:o.targetBytes,maxBytes:LIMITS.outputBytes,budgetExceeded:false,durationSeconds:info.duration,audioKept:selected.audioMode==='copied'||selected.audioMode==='transcoded',audioCodec:info.hasAudio&&o.keepAudio&&o.audioGain>0?'aac':null,audioMode:selected.audioMode,audioGain:o.audioGain,bitrate:selected.bitrate,codec:selected.actualCodec,requestedCodec:selected.requestedCodec,codecProfile:({64:'high','4d':'main',42:'baseline'}[selected.actualCodec?.slice(5,7)]||'unknown'),qualityPasses,attempts,processingPath:selected.processingPath,matteWorkerCount:selected.matteWorkerCount,sequenceDecodeSlots:selected.sequenceDecodeSlots,nativeOpaqueFallback:selected.nativeOpaqueFallback,timings:{...timings,analysisMs,probeMs,wallMs:clock()-started},timingNotes:{decodeMs:'Wait for the next decoded frame; sequence prefetch overlaps future decoding with current drawing/encoding, so this is stall time rather than aggregate decode work.',packMs:'Elapsed Canvas calls/submission, not a GPU timer.',matteMs:'CPU processing elapsed, or main-thread readback plus ordered worker wait; workerMs is parallel aggregate work and is not additive wall time. Null for native paths without preview processing.',previewMs:'Null when no preview callback was called; callback elapsed only.'},warnings};
  progress({phase:'packaging',progress:1,frame:selected.frames,totalFrames:selected.frames});
  return {blob:selected.blob,config:selected.config,report};
}
