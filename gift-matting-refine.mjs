import {ort} from './gift-matting-runtime.mjs?v=20261025-speed1';

const SIDE=512,MODEL_BYTES=27499369;
const MODEL_SHA='8216103d998864e122333e17d7d346feb1d6558d96bf08695a9838dba4f114e0';
const assetBase=new URL('./assets/vitmatte/',import.meta.url);
let sessionPromise=null;

function validate(message,trimap){
  const {data,width,height}=message||{};
  if(!(data instanceof Uint8ClampedArray)||!Number.isInteger(width)||!Number.isInteger(height)
    ||width<1||height<1||width>2048||height>2048||data.length!==width*height*4
    ||!(trimap instanceof Uint8Array||trimap instanceof Uint8ClampedArray)||trimap.length!==width*height)throw new Error('精细抠图的图片或三分图尺寸无效。');
  for(const value of trimap)if(value!==0&&value!==127&&value!==128&&value!==255)throw new Error('三分图必须为背景、未知边缘和主体三种标记。');
}

// Match the upstream processor: normalize only RGB to [-1,1], append the
// trimap / 255 as channel 4, then zero-pad right/bottom to a multiple of 32.
// Keep aspect ratio. Never stretch a portrait/landscape source into a square.
export function preprocess(message,trimap){
  validate(message,trimap);
  const {data:rgba,width,height}=message;
  const ratio=Math.min(1,SIDE/Math.max(width,height));
  const scaledWidth=Math.max(1,Math.round(width*ratio)),scaledHeight=Math.max(1,Math.round(height*ratio));
  const paddedWidth=Math.ceil(scaledWidth/32)*32,paddedHeight=Math.ceil(scaledHeight/32)*32;
  const plane=paddedWidth*paddedHeight,data=new Float32Array(plane*4);
  for(let y=0;y<scaledHeight;y++){
    const sy=Math.max(0,Math.min(height-1,(y+.5)*height/scaledHeight-.5)),y0=Math.floor(sy),y1=Math.min(height-1,y0+1),fy=sy-y0;
    const ty=Math.min(height-1,Math.floor((y+.5)*height/scaledHeight));
    for(let x=0;x<scaledWidth;x++){
      const sx=Math.max(0,Math.min(width-1,(x+.5)*width/scaledWidth-.5)),x0=Math.floor(sx),x1=Math.min(width-1,x0+1),fx=sx-x0;
      const a=(y0*width+x0)*4,b=(y0*width+x1)*4,c=(y1*width+x0)*4,d=(y1*width+x1)*4,target=y*paddedWidth+x;
      for(let channel=0;channel<3;channel++){
        const top=rgba[a+channel]+(rgba[b+channel]-rgba[a+channel])*fx;
        const bottom=rgba[c+channel]+(rgba[d+channel]-rgba[c+channel])*fx;
        data[channel*plane+target]=(top+(bottom-top)*fy)/127.5-1;
      }
      const tx=Math.min(width-1,Math.floor((x+.5)*width/scaledWidth));
      data[plane*3+target]=trimap[ty*width+tx]/255;
    }
  }
  return {data,dims:[1,4,paddedHeight,paddedWidth],scaledWidth,scaledHeight,paddedWidth,paddedHeight};
}

export function restoreAlpha(output,prepared,width,height,trimap){
  if(!output||output.type!=='float32'||!Array.isArray(output.dims)||output.dims.length!==4||output.dims[0]!==1||output.dims[1]!==1
    ||output.dims[2]!==prepared.paddedHeight||output.dims[3]!==prepared.paddedWidth
    ||!(output.data instanceof Float32Array)||output.data.length!==prepared.paddedHeight*prepared.paddedWidth)throw new Error('精细抠图模型返回了无效的透明度尺寸。');
  const alpha=new Uint8ClampedArray(width*height),{scaledWidth,scaledHeight,paddedWidth}=prepared;
  for(let y=0;y<height;y++){
    const sy=Math.max(0,Math.min(scaledHeight-1,(y+.5)*scaledHeight/height-.5)),y0=Math.floor(sy),y1=Math.min(scaledHeight-1,y0+1),fy=sy-y0;
    for(let x=0;x<width;x++){
      const target=y*width+x,label=trimap[target];
      // The learned matte may refine UNKNOWN pixels only. Reapply the native
      // trimap after upsampling, so resampling never weakens known constraints.
      if(label===0||label===255){alpha[target]=label;continue}
      const sx=Math.max(0,Math.min(scaledWidth-1,(x+.5)*scaledWidth/width-.5)),x0=Math.floor(sx),x1=Math.min(scaledWidth-1,x0+1),fx=sx-x0;
      const top=output.data[y0*paddedWidth+x0]+(output.data[y0*paddedWidth+x1]-output.data[y0*paddedWidth+x0])*fx;
      const bottom=output.data[y1*paddedWidth+x0]+(output.data[y1*paddedWidth+x1]-output.data[y1*paddedWidth+x0])*fx;
      const value=top+(bottom-top)*fy;
      if(!Number.isFinite(value))throw new Error('精细抠图模型返回了无效透明度。');
      alpha[target]=Math.round(Math.max(0,Math.min(1,value))*255);
    }
  }
  return alpha;
}

async function checksum(data){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',data)),byte=>byte.toString(16).padStart(2,'0')).join('')}
async function loadModel(progress){
  progress('loading',0);
  const response=await fetch(new URL('manifest.json',assetBase));
  if(!response.ok)throw new Error('精细抠图模型清单未能加载，请重试。');
  const manifest=await response.json();
  if(manifest.sha256!==MODEL_SHA||manifest.bytes!==MODEL_BYTES||!Array.isArray(manifest.chunks)||manifest.chunks.length!==2)throw new Error('精细抠图模型版本不匹配，请刷新后重试。');
  let cache=null;try{cache=await caches.open('fun-toolkit-vitmatte-'+MODEL_SHA.slice(0,16))}catch(ignored){}
  const model=new Uint8Array(MODEL_BYTES);let offset=0;
  for(const chunk of manifest.chunks){
    if(!/^[a-z0-9-]+\.bin$/.test(chunk.file)||!Number.isInteger(chunk.bytes)||chunk.bytes<1||chunk.bytes>20*1024*1024
      ||offset+chunk.bytes>model.length||!/^[0-9a-f]{64}$/.test(chunk.sha256))throw new Error('精细抠图模型分块无效。');
    const url=new URL(chunk.file,assetBase);let data=null;
    if(cache)try{
      const cached=await cache.match(url);
      if(cached){const bytes=await cached.arrayBuffer();if(bytes.byteLength===chunk.bytes&&await checksum(bytes)===chunk.sha256)data=bytes;else await cache.delete(url)}
    }catch(ignored){}
    if(!data){
      const result=await fetch(url);if(!result.ok)throw new Error('精细抠图模型未能下载，请重试。');
      data=await result.arrayBuffer();
      if(data.byteLength!==chunk.bytes||await checksum(data)!==chunk.sha256)throw new Error('精细抠图模型校验失败，请重试。');
      if(cache)try{await cache.put(url,new Response(data,{headers:{'Content-Type':'application/octet-stream'}}))}catch(ignored){}
    }
    model.set(new Uint8Array(data),offset);offset+=data.byteLength;progress('loading',offset/model.length*.85);
  }
  if(offset!==model.length||await checksum(model)!==MODEL_SHA)throw new Error('精细抠图模型不完整，请重试。');
  progress('loading',.9);
  try{return await ort.InferenceSession.create(model,{executionProviders:['wasm'],graphOptimizationLevel:'all'})}
  catch(error){throw new Error('精细抠图模型无法运行，请关闭其他页面后重试。')}
}
async function getSession(progress){
  if(!sessionPromise)sessionPromise=loadModel(progress).catch(error=>{sessionPromise=null;throw error});
  return sessionPromise;
}

// Returns native-size alpha only. RGB unmatting and additive light/particle
// recovery belong to the caller; multiplying black-backed RGB by alpha again
// would reintroduce dark fringes. Output is ALPHA, so do not apply sigmoid.
export async function refine(message,trimap,onProgress=()=>{}){
  const prepared=preprocess(message,trimap);
  const session=await getSession(onProgress);onProgress('processing',0);
  const input=new ort.Tensor('float32',prepared.data,prepared.dims);let result;
  try{
    result=await session.run({pixel_values:input});
    const data=restoreAlpha(result.alphas,prepared,message.width,message.height,trimap);
    onProgress('processing',1);
    return {width:message.width,height:message.height,data};
  }finally{input.dispose();if(result)for(const output of Object.values(result))output.dispose()}
}
