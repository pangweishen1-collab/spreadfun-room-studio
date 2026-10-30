import {prepareLosslessWebP,encodeWebP} from './webp-encode.mjs?v=20261030-webp2';

self.onmessage=async({data:message})=>{
  const {id,type,width,height,pixels,mode}=message;
  try{
    if(type==='prepare'){await prepareLosslessWebP();self.postMessage({id});return}
    if(type!=='encode')throw new Error('exportError');
    const encoded=await encodeWebP(new Uint8ClampedArray(pixels),width,height,{mode});
    self.postMessage({id,encoded:encoded.buffer},[encoded.buffer]);
  }catch(error){self.postMessage({id,error:error?.message||'exportError'})}
};
