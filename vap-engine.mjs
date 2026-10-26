import {computeVapLayout, makeVapc, appendVapcBox, extractVapcBox} from './vap-protocol.mjs';
import {detectVideoSource} from './vap-source-detection.mjs';

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
  const o={sourceKind:'plain_mp4',matteMethod:'black_luma',screenColor:'auto',alphaScale:.5,width:720,height:1560,fps:24,targetBytes:3000000,quality:'balanced',rgbAlphaMode:'straight',keepAudio:true,audioGain:1,confirmedOpaque:false,...options};
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
  if(!['plain_mp4','chroma_mp4'].includes(o.sourceKind))throw new VapError('invalid','请选择普通 MP4 或绿幕／蓝幕 MP4。');
  const methods=o.sourceKind==='chroma_mp4'?['chroma_key']:['black_luma','white_luma','ai_foreground','manual_mask','opaque'];
  if(!methods.includes(o.matteMethod))throw new VapError('invalid','当前输入类型与去背景方式不匹配。');
  if(!['auto','green','blue'].includes(o.screenColor)||![.5,1].includes(o.alphaScale)||!['ultra','quality','balanced','size'].includes(o.quality)||typeof o.keepAudio!=='boolean')throw new VapError('invalid','转换参数无效，请重新选择。');
  if(!['straight','premultiplied'].includes(o.rgbAlphaMode))throw new VapError('invalid','RGB 羽化方式无效。');
  if(!finite(o.audioGain)||o.audioGain<0||o.audioGain>2)throw new VapError('invalid','视频音量须为 0–200%。');
  if(o.matteMethod==='opaque'&&o.confirmedOpaque!==true)throw new VapError('invalid','请先确认保留不透明的矩形背景。');
  if(o.matteMethod==='manual_mask'&&!o.maskFile)throw new VapError('invalid','请先选择与原视频同步的遮罩文件。');
  integer(o.width,16,2048,'宽度');integer(o.height,16,2048,'高度');integer(o.fps,1,60,'帧率');integer(o.targetBytes,1024,500000000,'目标字节数');
  o.targetBytes=Math.min(o.targetBytes,LIMITS.outputBytes);
  const layout=computeVapLayout(o);
  if(Math.max(layout.videoW,layout.videoH)>4096)throw new VapError('limits','打包后的视频尺寸过大，请降低输出尺寸。');
  if(metadata.duration&&(!finite(metadata.duration)||metadata.duration>120))throw new VapError('limits','视频最长支持 120 秒，请先截取所需片段。');
  return o;
}

// H.264 baseline profile, with the smallest level that fits the actual packed frame.
export function avcCodec(width,height,fps,bitrate){
  const blocks=Math.ceil(width/16)*Math.ceil(height/16),rate=blocks*fps;
  const levels=[[31,3600,108000,14000000],[32,5120,216000,20000000],[40,8192,245760,20000000],[41,8192,245760,50000000],[42,8704,522240,50000000],[50,22080,589824,135000000],[51,36864,983040,240000000],[52,36864,2073600,240000000]];
  const level=levels.find(([,frame,mbps,bps])=>blocks<=frame&&rate<=mbps&&bitrate<=bps)?.[0];
  if(!level)throw new VapError('unsupported','该分辨率和帧率超出本工具的 H.264 兼容配置，请降低参数。');
  return 'avc1.4200'+level.toString(16).padStart(2,'0');
}

export function planEncoding(options,metadata){
  const layout=computeVapLayout(options),audioRate=options.keepAudio&&options.audioGain!==0&&metadata.hasAudio?(options.audioGain!==1?128000:metadata.audioBitrate||80000):0;
  // Reserve room for MP4/vapc metadata and the downloadable ZIP/config wrapper.
  const byteLimit=Math.min(options.targetBytes,LIMITS.outputBytes)-Math.min(8192,Math.floor(options.targetBytes*.02));
  const budget=Math.floor(byteLimit*8/metadata.duration-audioRate-40000);
  const pixels=layout.videoW*layout.videoH*options.fps;
  const floor=Math.max(350000,Math.round(pixels*.045)),preferred=Math.max(500000,Math.round(pixels*.10));
  let bitrate=options.quality==='ultra'?Math.max(preferred,Math.round(pixels*.25)):
    options.quality==='quality'?Math.max(preferred,Math.round(pixels*.15)):
    options.quality==='size'?Math.max(150000,Math.min(preferred,budget)):Math.max(floor,Math.min(preferred,budget));
  bitrate=Math.min(options.quality==='ultra'?32000000:24000000,bitrate);
  const qualityBudgetLimited=bitrate>budget;
  bitrate=Math.max(32000,Math.min(bitrate,budget));
  return {layout,bitrate,byteLimit,audioRate,budgetBitrate:budget,qualityBudgetLimited,codec:avcCodec(layout.videoW,layout.videoH,options.fps,bitrate)};
}

function canvas(width,height,{readback=true}={}){
  const c=typeof OffscreenCanvas==='function'?new OffscreenCanvas(width,height):Object.assign(document.createElement('canvas'),{width,height});
  const ctx=c.getContext('2d',{willReadFrequently:readback});
  if(!ctx)throw new VapError('unsupported','此浏览器无法创建视频画布。');
  return {canvas:c,ctx};
}

function prepareNativeOpaque(o,info,matteModule,images){
  if(o.matteMethod!=='opaque'||o.sourceKind!=='plain_mp4')return {enabled:false,reason:null};
  // AVC has no alpha plane. Other source codecs keep their decoded per-frame
  // alpha semantics instead of assuming that the entire clip is opaque.
  if(info.codec!=='avc')return {enabled:false,reason:'source-alpha-not-proven'};
  if(info.nativeOpaqueSource!==true)return {enabled:false,reason:'source-geometry-alpha-not-proven'};
  if(typeof matteModule.applyVerticalMask!=='function')return {enabled:false,reason:'mask-helper-unavailable'};
  const scale=Math.min(o.width/info.width,o.height/info.height),w=info.width*scale,h=info.height*scale,x=(o.width-w)/2,y=(o.height-h)/2;
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
  const o=normalizeOptions(options),layout=computeVapLayout(o);
  const result={secureContext:globalThis.isSecureContext===true,webCodecsEncode:typeof VideoEncoder==='function',webCodecsDecode:typeof VideoDecoder==='function',canEncodeAvc:false,canEncodeAac:false,webGpu:!!globalThis.navigator?.gpu,webGl2:false,limits:LIMITS};
  try{const c=typeof OffscreenCanvas==='function'?new OffscreenCanvas(1,1):document.createElement('canvas');result.webGl2=!!c.getContext('webgl2');}catch(ignored){}
  if(result.webCodecsEncode)try{
    const M=await media();
    [result.canEncodeAvc,result.canEncodeAac]=await Promise.all([
      M.canEncodeVideo('avc',{width:layout.videoW,height:layout.videoH,frameRate:o.fps,fullCodecString:avcCodec(layout.videoW,layout.videoH,o.fps,2000000),quality:new M.Quality({bitrate:2000000})}),
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
  for(let i=0;i<rgba.length;i+=4){const a=rgba[i+3],visible=a!==0;for(let c=0;c<3;c++)rgb[i+c]=premultiplied?Math.round(rgba[i+c]*a/255):visible?rgba[i+c]:0;rgb[i+3]=255;alpha[i]=alpha[i+1]=alpha[i+2]=a;alpha[i+3]=255;}
  return {rgb,alpha};
}

async function encodingProbe(M,plan,fps,signal){
  cancelled(signal);const surface=canvas(plan.layout.videoW,plan.layout.videoH);
  surface.ctx.fillStyle='#000';surface.ctx.fillRect(0,0,surface.canvas.width,surface.canvas.height);
  const target=new M.BufferTarget(),output=new M.Output({format:new M.Mp4OutputFormat({fastStart:'in-memory'}),target});
  const source=new M.CanvasSource(surface.canvas,{codec:'avc',fullCodecString:plan.codec,quality:new M.Quality({bitrate:plan.bitrate}),latencyMode:'quality'});
  output.addVideoTrack(source);let input;
  try{
    await output.start();for(let i=0;i<3;i++){cancelled(signal);await source.add(i/fps,1/fps,{keyFrame:i===0})}source.close();await output.finalize();
    input=new M.Input({source:new M.BufferSource(target.buffer),formats:[M.MP4]});
    const track=await input.getPrimaryVideoTrack(),decoded=track?await new M.CanvasSink(track,{poolSize:1}).getCanvas(0):null;
    if(!decoded||decoded.canvas.width!==plan.layout.videoW||decoded.canvas.height!==plan.layout.videoH)throw new Error('Encoded probe could not be decoded');
  }catch(error){await output.cancel().catch(()=>{});if(error instanceof VapError)throw error;throw new VapError('encode','H.264 编码探针未通过，请降低尺寸或使用最新版 Chrome／Edge。',error)}
  finally{input?.dispose();surface.canvas.width=surface.canvas.height=1;}
}

async function runPass(file,o,plan,{signal,progress,onPreview,pass,totalPasses}){
  const started=clock(),opened=await open(file),{M,input,video,audio,info}=opened;
  const times={decodeMs:0,matteMs:0,packMs:0,opaquePrepareMs:null,previewMs:null,encodeMs:0,muxMs:0,vapcMs:0,wallMs:0};
  let output,processor,videoSource,audioSource,iterator,failed=null,actualCodec=plan.codec,audioMode=audio&&(!o.keepAudio||o.audioGain===0)?'muted':'none';
  const abort=()=>{failed ||= new VapError('cancelled','转换已取消。');input.dispose();void output?.cancel().catch(()=>{})};
  signal?.addEventListener('abort',abort,{once:true});
  const images=[];
  try{
    cancelled(signal);
    let matteModule;
    try{matteModule=await import('./vap-matte.mjs');processor=await matteModule.createMatteProcessor({...o,signal,onProgress:event=>progress({phase:'loading',progress:.03,detail:event})})}
    catch(error){if(signal?.aborted)throw new VapError('cancelled','转换已取消。',error);throw new VapError('matte',error.message||'本地去背景组件未能加载，请重试。',error)}
    cancelled(signal);
    const prepareStart=clock(),native=prepareNativeOpaque(o,info,matteModule,images);
    if(o.matteMethod==='opaque'&&o.sourceKind==='plain_mp4')times.opaquePrepareMs=clock()-prepareStart;
    if(native.enabled)times.matteMs=null;
    // Retain the baseline canvas-to-VideoFrame color conversion/range. The fast
    // path still avoids JavaScript per-frame readback and RGBA plane copying.
    const rgb=native.enabled?null:canvas(o.width,o.height),alpha=native.enabled?null:canvas(o.width,o.height),packed=canvas(plan.layout.videoW,plan.layout.videoH,{readback:true});
    images.push(...[rgb?.canvas,alpha?.canvas,packed.canvas].filter(Boolean));
    const target=new M.BufferTarget();output=new M.Output({format:new M.Mp4OutputFormat({fastStart:'in-memory'}),target});
    videoSource=new M.CanvasSource(packed.canvas,{codec:'avc',fullCodecString:plan.codec,quality:new M.Quality({bitrate:plan.bitrate}),latencyMode:'quality',keyFrameInterval:2,onEncoderConfig:config=>{actualCodec=config.codec}});
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
    const frameCount=Math.max(1,Math.ceil(info.duration*o.fps-1e-7)),videoStart=await video.getFirstTimestamp(),videoEnd=await video.computeDuration();
    const sink=new M.CanvasSink(video,{width:info.width,height:info.height,fit:'contain',poolSize:1,alpha:true});
    function* timestamps(){for(let frame=0;frame<frameCount;frame++)yield Math.max(videoStart,Math.min(frame/o.fps,Math.max(videoStart,videoEnd-1e-6)))}
    iterator=sink.canvasesAtTimestamps(timestamps());
    const rgbPixels=native.enabled?null:new Uint8ClampedArray(o.width*o.height*4),alphaPixels=native.enabled?null:new Uint8ClampedArray(rgbPixels.length);
    const rgbData=native.enabled?null:new ImageData(rgbPixels,o.width,o.height),alphaData=native.enabled?null:new ImageData(alphaPixels,o.width,o.height);
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
      }catch(error){const failure=error instanceof VapError?error:new VapError('audio','音轨处理失败，请先转换为 AAC，或手动取消保留音频。',error);failed ||= failure;void output.cancel().catch(()=>{});throw failure}
      finally{audioSource.close()}
    };
    const videoTask=async()=>{
      try{
        for(let frame=0;frame<frameCount;frame++){
          cancelled(signal);if(failed)throw failed;
          let t=clock(),decoded;
          try{decoded=await iterator.next()}catch(error){if(signal?.aborted)throw new VapError('cancelled','转换已取消。',error);throw new VapError('decode','视频帧解码失败，请检查文件或先转换为 H.264。',error)}
          times.decodeMs+=clock()-t;
          if(decoded.done||!decoded.value)throw new VapError('decode','解码帧不足，未生成截断的视频。请检查原视频。');
          const wantsPreview=onPreview&&(frame===0||frame%o.fps===0||frame===frameCount-1),visible=frame/o.fps>=Math.max(0,videoStart);
          let matte;
          if(!native.enabled||wantsPreview){
            t=clock();
            try{matte=await processor.process(decoded.value.canvas,{timestamp:Math.max(0,Math.min(frame/o.fps,videoEnd-1e-6)),width:o.width,height:o.height})}
            catch(error){if(signal?.aborted)throw new VapError('cancelled','转换已取消。',error);throw new VapError('matte',error.message||'该帧去背景失败，请检查处理方式或遮罩。',error)}
            times.matteMs=(times.matteMs??0)+clock()-t;
            if(!matte||matte.width!==o.width||matte.height!==o.height)throw new VapError('matte','去背景画布与输出尺寸不匹配。');
            if(!visible)matte.data.fill(0);
          }
          t=clock();packed.ctx.fillStyle='#000';packed.ctx.fillRect(0,0,packed.canvas.width,packed.canvas.height);
          const [ax,ay,aw,ah]=plan.layout.aFrame;
          if(native.enabled){
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
          times.packMs+=clock()-t;
          if(wantsPreview){t=clock();await onPreview(matte);times.previewMs=(times.previewMs??0)+clock()-t;}
          t=clock();await videoSource.add(frame/o.fps,Math.min(1/o.fps,info.duration-frame/o.fps),{keyFrame:frame%(o.fps*2)===0});times.encodeMs+=clock()-t;
          progress({phase:'encoding',progress:.05+.90*((pass-1+(frame+1)/frameCount)/totalPasses),frame:frame+1,totalFrames:frameCount,pass});
        }
      }catch(error){failed ||= error;void output.cancel().catch(()=>{});throw error}
      finally{videoSource.close();await iterator.return?.()}
    };
    // Audio and video advance together, respecting muxer backpressure. Neither
    // track is buffered for the entire clip while waiting for the other track.
    const results=await Promise.allSettled([videoTask(),audioTask()]);
    const failure=results.find(result=>result.status==='rejected');if(failure)throw failed||failure.reason;cancelled(signal);
    progress({phase:'packaging',progress:totalPasses===1?.97:.05+.90*pass/totalPasses,frame:frameCount,totalFrames:frameCount,pass});
    let t=clock();await output.finalize();times.muxMs=clock()-t;
    const config=makeVapc({width:o.width,height:o.height,fps:o.fps,frames:frameCount,alphaScale:o.alphaScale});
    config.funToolkit={exportRevision:'rgb-feather-v1',rgbAlphaMode:o.rgbAlphaMode,verticalMask:{...o.verticalMask}};
    t=clock();const bytes=appendVapcBox(new Uint8Array(target.buffer),config);extractVapcBox(bytes);times.vapcMs=clock()-t;
    times.wallMs=clock()-started;
    return {blob:new Blob([bytes],{type:'video/mp4'}),config,frames:frameCount,audioMode,actualCodec,bitrate:plan.bitrate,processingPath:native.enabled?'native-opaque':'matte-processor',nativeOpaqueFallback:native.reason,times};
  }catch(error){await output?.cancel().catch(()=>{});if(error instanceof VapError)throw error;if(signal?.aborted)throw new VapError('cancelled','转换已取消。',error);throw new VapError('encode','视频转换失败；原视频已保留，请调整参数重试。',error)}
  finally{signal?.removeEventListener('abort',abort);await iterator?.return?.().catch(()=>{});try{await processor?.dispose()}catch(ignored){}input.dispose();for(const c of images)c.width=c.height=1;}
}

export async function convertVideo(file,options={}, {signal,onProgress=()=>{},onPreview}={}){
  const started=clock();cancelled(signal);let last=0;
  const progress=event=>{const next=Math.max(last,Math.min(1,event.progress));last=next;onProgress({...event,progress:next})};
  progress({phase:'loading',progress:0});const info=await inspectVideo(file);cancelled(signal);const analysisMs=clock()-started;
  const o=normalizeOptions(options,info),plan=planEncoding(o,info),M=await media();
  const support=await probeSupport(o);if(!support.supported)throw new VapError('unsupported','浏览器不支持所选 H.264 本地转换，请使用最新版 Chrome／Edge 或降低尺寸。');
  let t=clock();await encodingProbe(M,plan,o.fps,signal);const probeMs=clock()-t;cancelled(signal);
  if(plan.budgetBitrate<32000)throw new VapError('budget','当前时长与音轨无法满足体积上限，请缩短视频或关闭声音后重试。');
  const passes=4;
  let selected=await runPass(file,o,plan,{signal,progress,onPreview,pass:1,totalPasses:passes}),attempts=1,lastPass=selected,bitrate=plan.bitrate;
  const timings={...selected.times};
  while(selected.blob.size>plan.byteLimit&&attempts<passes&&bitrate>32000){
    cancelled(signal);
    const fixedBytes=Math.min(plan.byteLimit*.8,plan.audioRate*info.duration/8+Math.min(8192,plan.byteLimit*.02));
    bitrate=Math.max(32000,Math.floor(bitrate*.94*(plan.byteLimit-fixedBytes)/Math.max(1,lastPass.blob.size-fixedBytes)));
    const retry=await runPass(file,o,{...plan,bitrate},{signal,progress,onPreview,pass:++attempts,totalPasses:passes});
    for(const key of Object.keys(timings))timings[key]=timings[key]===null&&retry.times[key]===null?null:(timings[key]??0)+(retry.times[key]??0);
    lastPass=retry;if(retry.blob.size<selected.blob.size)selected=retry;
  }
  cancelled(signal);
  if(selected.blob.size>plan.byteLimit)throw new VapError('budget','已完成有界压缩，但文件仍超过体积上限，未输出超标成品。请缩短视频或调整参数后重试。');
  cancelled(signal);const warnings=[];
  if(plan.layout.legacyDimensionWarning)warnings.push('legacy-size');
  if(['black_luma','white_luma'].includes(o.matteMethod))warnings.push('luma-may-remove-subject');if(o.matteMethod==='opaque')warnings.push('opaque');if(o.matteMethod==='ai_foreground')warnings.push('ai-person-only');if(selected.audioMode==='transcoded')warnings.push('audio-transcoded');if(o.quality==='size')warnings.push('size-priority-loss');
  const report={valid:true,version:2,transparentRGB:'black',rgbAlphaMode:o.rgbAlphaMode,quality:o.quality,qualityBudgetLimited:plan.qualityBudgetLimited,frames:selected.frames,fps:o.fps,width:o.width,height:o.height,packedWidth:plan.layout.videoW,packedHeight:plan.layout.videoH,alphaScale:o.alphaScale,bytes:selected.blob.size,targetBytes:o.targetBytes,maxBytes:LIMITS.outputBytes,budgetExceeded:false,durationSeconds:info.duration,audioKept:selected.audioMode==='copied'||selected.audioMode==='transcoded',audioCodec:info.hasAudio&&o.keepAudio&&o.audioGain>0?'aac':null,audioMode:selected.audioMode,audioGain:o.audioGain,bitrate:selected.bitrate,codec:selected.actualCodec,attempts,processingPath:selected.processingPath,nativeOpaqueFallback:selected.nativeOpaqueFallback,timings:{...timings,analysisMs,probeMs,wallMs:clock()-started},timingNotes:{packMs:'Elapsed Canvas calls/submission, not a GPU timer.',matteMs:'Null when no processor.process call was needed; native-opaque only calls it for requested preview frames.',previewMs:'Null when no preview callback was called; callback elapsed only.'},warnings};
  progress({phase:'packaging',progress:1,frame:selected.frames,totalFrames:selected.frames});
  return {blob:selected.blob,config:selected.config,report};
}
