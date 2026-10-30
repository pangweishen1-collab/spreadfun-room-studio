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
  const worker=new Worker('./webp-encoder-worker.mjs?v=20261030-webp2',{type:'module'}),pending=new Map();
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
      const module=await import('./webp-encode.mjs?v=20261030-webp2');
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
async function canvasToWebP(canvas,{mode=webpSettings.getMode()}={}){
  const {width,height}=canvas;
  if(!['high','lossless'].includes(mode)||!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width>16383||height>16383||width*height>40000000)throw new Error('exportError');
  const data=canvas.getContext('2d').getImageData(0,0,width,height).data;
  const pixels=data.byteOffset||data.byteLength!==data.buffer.byteLength?data.slice():data;
  webpPending++;webpEvent('webp:activity-change',{pending:webpPending});
  try{
    const backend=await prepareBannerWebP(),encoded=await backend.encode(pixels,width,height,mode);
    if(!encoded?.byteLength)throw new Error('exportError');
    return new Blob([encoded],{type:'image/webp'});
  }finally{webpPending--;webpEvent('webp:activity-change',{pending:webpPending});}
}
// Keep the explicit exact API exact for integrations and pixel-roundtrip tests.
function canvasToLosslessWebP(canvas){return canvasToWebP(canvas,{mode:'lossless'});}
