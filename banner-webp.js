/* Lossless Banner encoding. The codec is loaded locally on the first upload. */
'use strict';
let bannerWebPCodec;
async function canvasToLosslessWebP(canvas){
  if(!bannerWebPCodec){
    bannerWebPCodec=Promise.all([
      import('./vendor/webp/webp_enc.mjs'),import('./vendor/webp/meta.mjs')
    ]).then(async([codec,meta])=>({encoder:await codec.default(),options:meta.defaultOptions}));
  }
  let codec;
  try{codec=await bannerWebPCodec}catch(error){bannerWebPCodec=null;throw new Error('encoderError')}
  const pixels=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height);
  const encoded=codec.encoder.encode(pixels.data,canvas.width,canvas.height,{
    ...codec.options,lossless:1,near_lossless:100,quality:100,method:4,exact:1,alpha_quality:100
  });
  if(!encoded)throw new Error('exportError');
  return new Blob([encoded],{type:'image/webp'});
}
