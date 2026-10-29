import {normalizeVerticalMask} from './vap-matte.mjs?v=20261029-detail1';

const START_TIMEOUT_MS=2000;
const WORK_PIXEL_BUDGET=96*1024*1024;

function cancelled(message='Chroma processing cancelled'){
  const error=new Error(message);error.name='AbortError';error.code='cancelled';return error;
}
function failure(message){const error=new Error(message||'Chroma worker failed');error.code='worker';return error;}
function dimensions(width,height){
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width>4096||height>4096||width*height>8388608)throw new RangeError('Chroma frame dimensions exceed the local processing limit');
}
function settings(options){
  const {width,height}=options||{};dimensions(width,height);
  const result={width,height,matteMethod:'chroma_key',verticalMask:{...normalizeVerticalMask(options.verticalMask)}};
  if(options.screenColor!==undefined){if(typeof options.screenColor!=='string')throw new TypeError('Invalid screen color');result.screenColor=options.screenColor;}
  if(options.background!==undefined){
    if(!Array.isArray(options.background)||options.background.length!==3||!options.background.every(v=>Number.isInteger(v)&&v>=0&&v<=255))throw new TypeError('Invalid screen RGB');
    result.background=options.background.slice();
  }
  if(options.lightRecovery!==undefined){if(typeof options.lightRecovery!=='boolean')throw new TypeError('Invalid light recovery mode');result.lightRecovery=options.lightRecovery;}
  for(const key of ['keyTolerance','edgeSoftness','spill'])if(Number.isFinite(options[key]))result[key]=options[key];
  return result;
}
function workerCount(width,height){
  const hardware=Number(globalThis.navigator?.hardwareConcurrency);
  let count=Math.max(1,Math.min(4,(Number.isFinite(hardware)?Math.floor(hardware):2)-1));
  const deviceMemory=Number(globalThis.navigator?.deviceMemory);
  if(Number.isFinite(deviceMemory)&&deviceMemory>0&&deviceMemory<=4)count=Math.min(count,2);
  // Bounds estimated working pixels, not the browser's total process memory.
  const memoryCount=Math.max(1,Math.floor(WORK_PIXEL_BUDGET/(width*height*26)));
  return Math.min(count,memoryCount);
}
function observed(promise){promise.catch(()=>{});return promise;}

/**
 * Each worker owns one reusable chroma workspace. In-flight work is limited to
 * size active frames plus size waiting frames; callers should keep <=size total.
 * An idle worker takes ownership of input.data.buffer synchronously. Never read
 * or reuse that ImageData after process(); queued inputs are reserved as well.
 */
export async function createChromaWorkerPool(options,{signal}={}){
  if(signal?.aborted)throw cancelled();
  const config=settings(options),WorkerType=globalThis.Worker;
  if(typeof WorkerType!=='function'||typeof globalThis.ImageData!=='function')return null;
  const size=workerCount(config.width,config.height);
  return new Promise((resolveStartup,rejectStartup)=>{
    const entries=[],waiting=[],reserved=new Set();
    let disposed=false,started=false,startupSettled=false,startTimer=null,nextId=1,closedError=null;

    function stop(error,fallback=false){
      if(disposed)return;disposed=true;closedError=error;
      clearTimeout(startTimer);startTimer=null;signal?.removeEventListener('abort',onAbort);
      const pending=waiting.splice(0);
      for(const entry of entries){
        if(entry.job){pending.push(entry.job);entry.job=null;}
        try{entry.worker.removeEventListener('message',entry.message);entry.worker.removeEventListener('error',entry.error);entry.worker.removeEventListener('messageerror',entry.messageerror);}catch(ignored){}
        try{entry.worker.terminate();}catch(ignored){}
      }
      reserved.clear();
      for(const job of pending)job.reject(error);
      if(!startupSettled){startupSettled=true;fallback&&error.name!=='AbortError'&&error.code!=='cancelled'?resolveStartup(null):rejectStartup(error);}
    }
    function onAbort(){stop(cancelled());}
    function send(entry,job){
      if(disposed)return;entry.job=job;
      try{entry.worker.postMessage({type:'frame',id:job.id,width:config.width,height:config.height,byteOffset:job.byteOffset,buffer:job.buffer},[job.buffer]);}
      catch(error){stop(failure(error?.message));}
    }
    function drain(){
      if(disposed)return;
      for(const entry of entries)if(entry.ready&&!entry.job&&waiting.length){send(entry,waiting.shift());if(disposed)return;}
    }
    function ready(){
      if(disposed||started||entries.length!==size||entries.some(entry=>!entry.ready))return;
      started=true;startupSettled=true;clearTimeout(startTimer);startTimer=null;resolveStartup(api);
    }
    function message(entry,event){
      if(disposed)return;
      const value=event?.data;
      if(value?.type==='error'){stop(failure(value.message),!started);return;}
      if(value?.type==='ready'&&!entry.ready&&!started){entry.ready=true;ready();return;}
      const job=entry.job;
      if(!started||value?.type!=='result'||!job||value.id!==job.id||value.width!==config.width||value.height!==config.height||!(value.buffer instanceof ArrayBuffer)||value.buffer.byteLength!==config.width*config.height*4||!Number.isFinite(value.workerMs)||value.workerMs<0){stop(failure('Invalid chroma worker response'),!started);return;}
      let image;
      try{image=new ImageData(new Uint8ClampedArray(value.buffer),config.width,config.height);}
      catch(error){stop(failure(error?.message));return;}
      entry.job=null;reserved.delete(job.buffer);job.resolve({image,workerMs:value.workerMs});drain();
    }
    const api={
      size,
      process(image){
        if(disposed)return observed(Promise.reject(closedError||cancelled('Chroma worker pool disposed')));
        let data;
        try{
          if(!image||image.width!==config.width||image.height!==config.height||!(image.data instanceof Uint8ClampedArray)||image.data.length!==config.width*config.height*4||!(image.data.buffer instanceof ArrayBuffer))throw new TypeError('Chroma ImageData dimensions or RGBA pixels do not match the pool');
          data=image.data;
          if(reserved.has(data.buffer))throw new TypeError('Chroma ImageData is already in flight');
          if(waiting.length>=size&&entries.every(entry=>entry.job))throw Object.assign(new Error('Chroma worker queue is full'),{code:'busy'});
        }catch(error){return observed(Promise.reject(error));}
        const promise=new Promise((resolve,reject)=>{
          const job={id:nextId++,buffer:data.buffer,byteOffset:data.byteOffset,resolve,reject};reserved.add(job.buffer);
          const idle=entries.find(entry=>entry.ready&&!entry.job);
          if(idle)send(idle,job);else waiting.push(job);
        });
        return observed(promise);
      },
      dispose(){stop(cancelled('Chroma worker pool disposed'));}
    };
    signal?.addEventListener('abort',onAbort,{once:true});
    if(signal?.aborted){onAbort();return;}
    startTimer=setTimeout(()=>stop(failure('Chroma worker startup timed out'),true),START_TIMEOUT_MS);
    try{
      for(let index=0;index<size;index++){
        if(disposed)return;
        const worker=new WorkerType(new URL('./vap-matte-worker.mjs?v=20261029-detail1',import.meta.url),{type:'module',name:'vap-chroma-'+(index+1)});
        const entry={worker,ready:false,job:null};entries.push(entry);
        entry.message=event=>message(entry,event);
        entry.error=event=>{event?.preventDefault?.();stop(failure(event?.message),!started);};
        entry.messageerror=()=>stop(failure('Chroma worker message could not be decoded'),!started);
        worker.addEventListener('message',entry.message);worker.addEventListener('error',entry.error);worker.addEventListener('messageerror',entry.messageerror);
        worker.postMessage({type:'init',options:config});
      }
      ready();
    }catch(error){stop(failure(error?.message),!started);}
  });
}
