import {darkMatte} from './gift-background-matte.mjs';

let running=false,aiModulePromise=null;
async function loadAI(progress){
  if(!aiModulePromise){
    progress('loading',0);
    aiModulePromise=import('./gift-background-ai.mjs').catch(error=>{aiModulePromise=null;throw error});
  }
  return aiModulePromise;
}

export async function routeBackground(message,{onProgress=()=>{},loadAI:load=loadAI}={}){
  const {width,height,data}=message;
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width>2048||height>2048
    ||!(data instanceof Uint8ClampedArray)||data.length!==width*height*4)throw new Error('图片像素尺寸无效。');
  onProgress('analyzing',0);
  const matte=darkMatte(data,width,height,value=>onProgress('matting',value));
  if(matte){onProgress('processing',1);return matte}
  const ai=await load(onProgress);
  return ai.remove(message,onProgress);
}

async function remove(message){
  if(running){self.postMessage({type:'error',id:message.id,message:'背景移除正在处理中。'});return}
  running=true;
  try{
    const result=await routeBackground(message,{onProgress:(phase,value)=>self.postMessage({type:'progress',id:message.id,phase,progress:Math.max(0,Math.min(1,value))})});
    self.postMessage({type:'result',id:message.id,...result},[result.data.buffer]);
  }catch(error){self.postMessage({type:'error',id:message.id,message:error.message||'本地背景移除失败，请重试。'})}
  finally{running=false}
}
if(typeof self!=='undefined')self.addEventListener('message',event=>{if(event.data?.type==='remove')remove(event.data)});
