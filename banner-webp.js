/* Shared on-device WebP output. High quality by default; exact lossless opt-in. */
'use strict';
let webpBackend,webpPending=0,webpMode='high';
const webpModeKey='fun-toolkit-webp-mode';
try{const saved=globalThis.localStorage?.getItem(webpModeKey);if(['high','lossless'].includes(saved))webpMode=saved}catch(ignored){}
function webpEvent(name,detail){if(typeof document!=='undefined'&&typeof CustomEvent==='function')document.dispatchEvent(new CustomEvent(name,{detail}));}
const webpSettings={
  getMode:()=>webpMode,
  getPending:()=>webpPending,
  setMode(mode){
    if(!['high','lossless'].includes(mode)||webpPending)return false;
    if(mode===webpMode)return true;
    const previous=webpMode;webpMode=mode;
    try{globalThis.localStorage?.setItem(webpModeKey,mode)}catch(ignored){}
    webpEvent('webp:mode-change',{mode,previous});return true;
  }
};
if(typeof window!=='undefined')window.FunWebP=webpSettings;
function createWebPWorker(){
  const worker=new Worker('./webp-encoder-worker.mjs?v=20261112-webp-clarity',{type:'module'}),pending=new Map();
  let serial=0,failed=false;
  function fail(error){
    if(failed)return;failed=true;worker.terminate();
    for(const job of pending.values()){clearTimeout(job.timer);job.reject(error)}pending.clear();
  }
  worker.onmessage=({data})=>{
    const job=pending.get(data.id);if(!job)return;pending.delete(data.id);clearTimeout(job.timer);
    if(data.error){const error=new Error(data.error);job.reject(error);fail(error);return}
    job.resolve(data.encoded?new Uint8Array(data.encoded):undefined);
  };
  worker.onerror=()=>fail(new Error('encoderError'));
  worker.onmessageerror=()=>fail(new Error('encoderError'));
  function request(type,fields={},transfer=[]){
    if(failed)return Promise.reject(new Error('encoderError'));
    return new Promise((resolve,reject)=>{
      const id=++serial,timer=setTimeout(()=>fail(new Error('encoderError')),type==='prepare'?20000:180000);
      pending.set(id,{resolve,reject,timer});
      try{worker.postMessage({id,type,...fields},transfer)}catch(error){fail(error)}
    });
  }
  return {prepare:()=>request('prepare'),encode:(data,width,height,mode)=>request('encode',{pixels:data.buffer,width,height,mode},[data.buffer]),dispose:()=>fail(new Error('encoderError'))};
}
function createWebPPool(){
  const hardware=Number(globalThis.navigator?.hardwareConcurrency)||2,memory=Number(globalThis.navigator?.deviceMemory);
  let limit=hardware>=4&&!(memory>0&&memory<=2)?2:1,creating=false;
  const slots=[],queue=[],pixelBudget=64*1024*1024;
  async function addSlot(){
    let backend;
    if(typeof Worker==='function'){
      try{backend=createWebPWorker();await backend.prepare();}
      catch(error){
        backend?.dispose();backend=null;limit=1;
        // Keep a functioning primary if a secondary worker cannot start.
        if(slots.length)return null;
      }
    }
    if(!backend){
      limit=1;
      const module=await import('./webp-encode.mjs?v=20261112-webp-clarity');
      await module.prepareLosslessWebP();
      backend={encode:(data,width,height,mode)=>module.encodeWebP(data,width,height,{mode}),dispose(){}};
    }
    const slot={backend,busy:false,bytes:0};slots.push(slot);return slot;
  }
  function drain(){
    while(queue.length){
      const slot=slots.find(value=>!value.busy),active=slots.reduce((n,value)=>n+(value.busy?value.bytes:0),0),job=queue[0];
      if(!slot){
        if(!creating&&slots.length<limit){
          creating=true;
          addSlot().catch(error=>{for(const waiting of queue.splice(0))waiting.reject(error);webpBackend=null}).finally(()=>{creating=false;drain()});
        }
        return;
      }
      if(active&&active+job.pixels.byteLength>pixelBudget)return;
      queue.shift();slot.busy=true;slot.bytes=job.pixels.byteLength;
      Promise.resolve().then(()=>slot.backend.encode(job.pixels,job.width,job.height,job.mode)).then(job.resolve,error=>{
        slot.backend.dispose();const index=slots.indexOf(slot);if(index>=0)slots.splice(index,1);job.reject(error);
      }).finally(()=>{
        slot.busy=false;
        // Retire unusually large heaps; ordinary batches keep warmed codecs.
        if(slot.bytes>32*1024*1024){slot.backend.dispose();const index=slots.indexOf(slot);if(index>=0)slots.splice(index,1);}
        slot.bytes=0;drain();
      });
    }
  }
  return {
    async prepare(){await addSlot();},
    encode(pixels,width,height,mode){return new Promise((resolve,reject)=>{queue.push({pixels,width,height,mode,resolve,reject});drain();});}
  };
}
function prepareBannerWebP(){
  if(!webpBackend)webpBackend=(async()=>{const pool=createWebPPool();await pool.prepare();return pool;})().catch(error=>{webpBackend=null;throw new Error('encoderError',{cause:error})});
  return webpBackend;
}
// Reuse only simple still WebP containers. Keep the usual static, metadata-free
// output even if the uploaded file carries animation, profiles or other data.
function isCleanStillWebP(buffer){
  const view=new DataView(buffer),bytes=new Uint8Array(buffer);
  const tag=offset=>String.fromCharCode(...bytes.subarray(offset,offset+4));
  if(bytes.length<20||tag(0)!=='RIFF'||tag(8)!=='WEBP'||view.getUint32(4,true)!==bytes.length-8)return false;
  const chunks=[];
  for(let offset=12;offset<bytes.length;){
    if(offset+8>bytes.length||chunks.length===3)return false;
    const type=tag(offset),size=view.getUint32(offset+4,true),end=offset+8+size;
    if(!size||end+(size%2)>bytes.length||(size%2&&bytes[end]!==0))return false;
    if(type==='VP8X'&&(size!==10||bytes[offset+8]!==0x10))return false;
    chunks.push(type);offset=end+(size%2);
  }
  const layout=chunks.join(',');
  return layout==='VP8 '||layout==='VP8L'||layout==='VP8X,ALPH,VP8 ';
}
async function matchingOriginalWebP(canvas,context,original,pixels,width,height){
  if(!original?.size||original.size>=pixels.byteLength||
    !(original.type==='image/webp'||(!original.type&&/\.webp$/i.test(original.name||''))))return null;
  let url,reference;
  try{
    if(!isCleanStillWebP(await original.arrayBuffer()))return null;
    const doc=canvas.ownerDocument,image=doc.createElement('img');
    url=URL.createObjectURL(original);image.src=url;await image.decode();
    if(image.naturalWidth!==width||image.naturalHeight!==height)return null;
    reference=doc.createElement('canvas');reference.width=width;reference.height=height;
    // Decode and draw through the same browser path used by the upload tools.
    const ctx=reference.getContext('2d',context.getContextAttributes?.());
    ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
    ctx.drawImage(image,0,0,width,height);
    const decoded=ctx.getImageData(0,0,width,height).data;
    const a=new Uint32Array(pixels.buffer),b=new Uint32Array(decoded.buffer,decoded.byteOffset,decoded.length/4);
    for(let i=0;i<a.length;i++)if(a[i]!==b[i])return null;
    return original.type?original:original.slice(0,original.size,'image/webp');
  }catch(error){return null}
  finally{if(url)URL.revokeObjectURL(url);if(reference)reference.width=reference.height=1}
}
async function canvasToWebP(canvas,{mode=webpSettings.getMode(),original}={}){
  const {width,height}=canvas;
  if(!['high','lossless'].includes(mode)||!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width>16383||height>16383||width*height>40000000)throw new Error('exportError');
  const context=canvas.getContext('2d'),data=context.getImageData(0,0,width,height).data;
  const pixels=data.byteOffset||data.byteLength!==data.buffer.byteLength?data.slice():data;
  webpPending++;webpEvent('webp:activity-change',{pending:webpPending});
  try{
    // Compare against this render before the worker takes ownership of its pixels.
    const reusable=mode==='high'&&original?await matchingOriginalWebP(canvas,context,original,pixels,width,height):null;
    const backend=await prepareBannerWebP(),encoded=await backend.encode(pixels,width,height,mode);
    if(!encoded?.byteLength)throw new Error('exportError');
    if(reusable&&reusable.size<=encoded.byteLength)return reusable;
    return new Blob([encoded],{type:'image/webp'});
  }finally{webpPending--;webpEvent('webp:activity-change',{pending:webpPending});}
}
// Keep the explicit exact API exact for integrations and pixel-roundtrip tests.
function canvasToLosslessWebP(canvas){return canvasToWebP(canvas,{mode:'lossless'});}
