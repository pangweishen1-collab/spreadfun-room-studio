import {compressDeflate,optimizePngLossless} from './avatar-lossless-codec.mjs?v=20261104-lossless1';
const methods={compressDeflate,optimizePngLossless};
self.onmessage=async event=>{
  const {id,type,bytes}=event.data||{};
  try{
    if(!Object.hasOwn(methods,type)||!(bytes instanceof Uint8Array))throw Error('Invalid compression request.');
    const result=await methods[type](bytes);
    self.postMessage({id,bytes:result},[result.buffer]);
  }catch(error){self.postMessage({id,error:error.message||'Lossless compression failed.'})}
};
