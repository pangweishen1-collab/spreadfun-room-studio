import {ort} from './gift-matting-runtime.mjs?v=20261025-speed1';

const SIDE=512,MODEL_SHA='eff9216bb2f9d3f023d9c2b7196845a7485739ab1f231593633e4d2344ffc516';
const assetBase=new URL('./assets/matting/',import.meta.url);
let sessionPromise=null;

export function preprocess(rgba,width=SIDE,height=SIDE){
  if(!(rgba instanceof Uint8ClampedArray)||!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||rgba.length!==width*height*4)throw new Error('图片像素尺寸无效。');
  const plane=width*height,data=new Float32Array(plane*3),mean=[.485,.456,.406],std=[.229,.224,.225];
  for(let pixel=0;pixel<plane;pixel++)for(let channel=0;channel<3;channel++)data[channel*plane+pixel]=(rgba[pixel*4+channel]/255-mean[channel])/std[channel];
  return data;
}
// A worker does not need OffscreenCanvas: sample the native bitmap once at each
// model pixel, preserving the existing 512-square model input coordinates.
export function resizeRGBA(rgba,width,height,side=SIDE){
  if(!(rgba instanceof Uint8ClampedArray)||!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1
    ||width>2048||height>2048||rgba.length!==width*height*4||!Number.isInteger(side)||side<1||side>SIDE)throw new Error('图片像素尺寸无效。');
  if(width===side&&height===side)return rgba;
  const resized=new Uint8ClampedArray(side*side*4),ratioX=width/side,ratioY=height/side;
  for(let y=0;y<side;y++){
    const sourceY=Math.max(0,Math.min(height-1,(y+.5)*ratioY-.5)),y0=Math.floor(sourceY),y1=Math.min(height-1,y0+1),fy=sourceY-y0;
    for(let x=0;x<side;x++){
      const sourceX=Math.max(0,Math.min(width-1,(x+.5)*ratioX-.5)),x0=Math.floor(sourceX),x1=Math.min(width-1,x0+1),fx=sourceX-x0;
      const top=(y0*width+x0)*4,right=(y0*width+x1)*4,bottom=(y1*width+x0)*4,bottomRight=(y1*width+x1)*4,target=(y*side+x)*4;
      for(let channel=0;channel<4;channel++){
        const a=rgba[top+channel]+(rgba[right+channel]-rgba[top+channel])*fx;
        const b=rgba[bottom+channel]+(rgba[bottomRight+channel]-rgba[bottom+channel])*fx;
        resized[target+channel]=a+(b-a)*fy;
      }
    }
  }
  return resized;
}

export function logitsToAlpha(logits){
  const alpha=new Uint8ClampedArray(logits.length);
  for(let index=0;index<logits.length;index++){
    const value=logits[index];if(Number.isNaN(value))throw new Error('抠图模型返回了无效像素。');
    alpha[index]=Math.round(255/(1+Math.exp(-value)));
  }
  return alpha;
}
async function checksum(data){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',data)),byte=>byte.toString(16).padStart(2,'0')).join('')}
async function loadModel(progress){
  progress('loading',0);
  const response=await fetch(new URL('manifest.json',assetBase));if(!response.ok)throw new Error('抠图模型清单未能加载，请检查网络后重试。');
  const manifest=await response.json();
  if(manifest.sha256!==MODEL_SHA||manifest.bytes!==98484532||!Array.isArray(manifest.chunks)||manifest.chunks.length!==5)throw new Error('抠图模型版本不匹配，请刷新后重试。');
  let cache=null;try{cache=await caches.open('fun-toolkit-matting-'+MODEL_SHA.slice(0,16))}catch(ignored){}
  const model=new Uint8Array(manifest.bytes);let offset=0;
  for(const chunk of manifest.chunks){
    if(!/^[a-z0-9-]+\.bin$/.test(chunk.file)||!Number.isInteger(chunk.bytes)||chunk.bytes<1||chunk.bytes>20*1024*1024||offset+chunk.bytes>model.length)throw new Error('抠图模型分块无效。');
    const url=new URL(chunk.file,assetBase);let data=null;
    if(cache)try{const cached=await cache.match(url);if(cached){const bytes=await cached.arrayBuffer();if(bytes.byteLength===chunk.bytes&&await checksum(bytes)===chunk.sha256)data=bytes;else await cache.delete(url)}}catch(ignored){}
    if(!data){
      const result=await fetch(url);if(!result.ok)throw new Error('抠图模型未能下载，请检查网络后重试。');
      data=await result.arrayBuffer();
      if(data.byteLength!==chunk.bytes||await checksum(data)!==chunk.sha256)throw new Error('抠图模型校验失败，请重试。');
      if(cache)try{await cache.put(url,new Response(data,{headers:{'Content-Type':'application/octet-stream'}}))}catch(ignored){}
    }
    model.set(new Uint8Array(data),offset);offset+=data.byteLength;progress('loading',offset/model.length*.85);
  }
  if(offset!==model.length||await checksum(model)!==MODEL_SHA)throw new Error('抠图模型不完整，请重试。');
  progress('loading',.9);
  try{return await ort.InferenceSession.create(model,{executionProviders:['wasm'],graphOptimizationLevel:'all'})}
  catch(error){throw new Error('本地抠图模型无法运行，可能是可用内存不足，请关闭其他页面后重试。')}
}
async function getSession(progress){
  if(!sessionPromise)sessionPromise=loadModel(progress).catch(error=>{sessionPromise=null;throw error});
  return sessionPromise;
}
export async function remove(message,progress=()=>{}){
  const rgba=resizeRGBA(message.data,message.width,message.height);
  const session=await getSession(progress);progress('processing',0);
  const input=new ort.Tensor('float32',preprocess(rgba),[1,3,SIDE,SIDE]);let output;
  try{
    const result=await session.run({input_image:input});output=result[session.outputNames[0]];
    if(!output||output.type!=='float32'||output.data.length!==SIDE*SIDE)throw new Error('抠图模型返回的尺寸无效。');
    const data=logitsToAlpha(output.data);progress('processing',1);
    return {width:SIDE,height:SIDE,data,recoverBlack:false,method:'ai'};
  }finally{input.dispose();output?.dispose()}
}
