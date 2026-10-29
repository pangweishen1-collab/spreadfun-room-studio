import {prepareLosslessWebP,encodeLosslessWebP} from './webp-encode.mjs?v=20261029-lossless1';

self.onmessage=async({data:message})=>{
  const {id,type,width,height,pixels}=message;
  try{
    if(type==='prepare'){await prepareLosslessWebP();self.postMessage({id});return}
    if(type!=='encode')throw new Error('exportError');
    const encoded=await encodeLosslessWebP(new Uint8ClampedArray(pixels),width,height);
    self.postMessage({id,encoded:encoded.buffer},[encoded.buffer]);
  }catch(error){self.postMessage({id,error:error?.message||'exportError'})}
};
