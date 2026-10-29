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
export async function encodeLosslessWebP(data,width,height){
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width>16383||height>16383||width*height>40000000||!ArrayBuffer.isView(data)||data.BYTES_PER_ELEMENT!==1||data.length!==width*height*4)throw new Error('exportError');
  const codec=await prepareLosslessWebP();
  let best;
  for(const search of searches){
    const encoded=codec.encode(data,width,height,{
      ...defaultOptions,...search,lossless:1,near_lossless:100,exact:1,alpha_quality:100
    });
    if(!encoded?.byteLength)throw new Error('exportError');
    if(!best||encoded.byteLength<best.byteLength)best=new Uint8Array(encoded);
  }
  return best;
}
