import factory from './vendor/webp/webp_enc.mjs';
import {defaultOptions} from './vendor/webp/meta.mjs';

let codecPromise;
export function prepareLosslessWebP(){
  return codecPromise ||= factory().catch(error=>{codecPromise=null;throw error});
}

// All candidates preserve the exact input RGBA. Search effort affects size,
// never fidelity. Keep the smallest measured result instead of assuming that
// a larger quality number always produces fewer bytes for every image.
const searches=[{quality:0,method:1},{quality:75,method:6},{quality:100,method:4}];
export async function encodeWebP(data,width,height,{mode='high'}={}){
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width>16383||height>16383||width*height>40000000||!ArrayBuffer.isView(data)||data.BYTES_PER_ELEMENT!==1||data.length!==width*height*4)throw new Error('exportError');
  if(!['high','lossless'].includes(mode))throw new Error('exportError');
  const codec=await prepareLosslessWebP();
  function encode(options){
    const encoded=codec.encode(data,width,height,{...defaultOptions,near_lossless:100,exact:1,alpha_quality:100,...options});
    if(!encoded?.byteLength)throw new Error('exportError');
    return new Uint8Array(encoded);
  }
  if(mode==='lossless'){
    let best;
    for(const search of searches){const encoded=encode({...search,lossless:1});if(!best||encoded.byteLength<best.byteLength)best=encoded;}
    return best;
  }
  // Photos benefit from high-quality perceptual coding; flat logos and text
  // often compress better with exact pixels. Measure both instead of guessing
  // from the tool name, and keep alpha lossless in every high-quality result.
  let exact=encode({quality:0,method:1,lossless:1});
  const refine=()=>{const next=encode({quality:75,method:3,lossless:1});if(next.byteLength<exact.byteLength)exact=next;};
  if(exact.byteLength<=65536){refine();return exact;}
  const high=encode({quality:94,method:3,lossless:0,use_sharp_yuv:1});
  if(exact.byteLength<=high.byteLength*1.5)refine();
  return exact.byteLength<=high.byteLength*1.05?exact:high;
}
export function encodeLosslessWebP(data,width,height){return encodeWebP(data,width,height,{mode:'lossless'});}
