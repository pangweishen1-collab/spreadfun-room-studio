import {darkBackground} from './gift-background-matte.mjs';
import {createTrimap,composeDarkCutout} from './gift-quality-matte.mjs';

let running=false,aiModulePromise=null,refinerPromise=null;
async function loadAI(progress){
  if(!aiModulePromise){
    progress('loading',0);
    aiModulePromise=import('./gift-background-ai.mjs?v=20261025-speed1').catch(error=>{aiModulePromise=null;throw error});
  }
  return aiModulePromise;
}

async function loadRefiner(){
  if(!refinerPromise)refinerPromise=import('./gift-matting-refine.mjs?v=20261025-speed1').catch(error=>{refinerPromise=null;throw error});
  return refinerPromise;
}

export async function routeBackground(message,{onProgress=()=>{},loadAI:load=loadAI,loadRefiner:loadFine=loadRefiner}={}){
  const {width,height,data}=message;
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width>2048||height>2048
    ||!(data instanceof Uint8ClampedArray)||data.length!==width*height*4)throw new Error('图片像素尺寸无效。');
  onProgress('analyzing',0);
  const background=darkBackground(data,width,height);
  const semanticProgress=(phase,value)=>onProgress(phase,phase==='loading'?.04+.26*value:.30+.25*value);
  const ai=await load(semanticProgress),prior=await ai.remove(message,semanticProgress);
  if(!background){onProgress('processing',1);return prior}
  // A segmentation mask locates the subject, but never fills background holes.
  // The trimap leaves a generous unknown band for the learned edge estimator.
  onProgress('matting',.56);
  const trimap=createTrimap(data,width,height,prior,background),refiner=await loadFine();
  const subject=await refiner.refine(message,trimap,(phase,value)=>onProgress(phase,phase==='loading'?.57+.15*value:.72+.24*value));
  onProgress('matting',.97);
  const result=composeDarkCutout(data,width,height,{subject,trimap,background});
  onProgress('processing',1);return result;
}

async function remove(message){
  if(running){self.postMessage({type:'error',id:message.id,message:'背景移除正在处理中。'});return}
  running=true;
  try{
    const result=await routeBackground(message,{onProgress:(phase,value)=>self.postMessage({type:'progress',id:message.id,phase,progress:Math.max(0,Math.min(1,value))})});
    const transfer=[result.data.buffer];if(result.foreground)transfer.push(result.foreground.buffer);
    self.postMessage({type:'result',id:message.id,...result},transfer);
  }catch(error){self.postMessage({type:'error',id:message.id,message:error.message||'本地背景移除失败，请重试。'})}
  finally{running=false}
}
if(typeof self!=='undefined')self.addEventListener('message',event=>{if(event.data?.type==='remove')remove(event.data)});
