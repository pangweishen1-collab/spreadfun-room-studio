// RGBA8 PNG without a Canvas encoding round trip. PNG chunks/CRC and the IDAT
// zlib stream follow https://www.w3.org/TR/png/ and Compression Standard.
const CRC_TABLE=Uint32Array.from({length:256},(_,n) => {
  let c=n; for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;
  return c>>>0;
});
export function crc32(bytes) {
  let crc=0xffffffff;
  for(const byte of bytes)crc=CRC_TABLE[(crc^byte)&255]^(crc>>>8);
  return (crc^0xffffffff)>>>0;
}
function abortIf(signal) {
  if(signal?.aborted)throw new DOMException('操作已取消','AbortError');
}
function chunk(type,data) {
  const result=new Uint8Array(data.length+12),view=new DataView(result.buffer);
  view.setUint32(0,data.length);
  for(let i=0;i<4;i++)result[4+i]=type.charCodeAt(i);
  result.set(data,8);view.setUint32(data.length+8,crc32(result.subarray(4,data.length+8)));
  return result;
}
function storedZlib(bytes,signal) {
  const blocks=Math.ceil(bytes.length/65535),output=new Uint8Array(2+bytes.length+blocks*5+4);
  output.set([0x78,0x01]);let at=2;
  for(let offset=0;offset<bytes.length;offset+=65535) {
    abortIf(signal);
    const length=Math.min(65535,bytes.length-offset),inverse=(~length)&65535;
    output.set([offset+length===bytes.length?1:0,length&255,length>>>8,inverse&255,inverse>>>8],at);at+=5;
    output.set(bytes.subarray(offset,offset+length),at);at+=length;
  }
  let a=1,b=0;
  for(let offset=0;offset<bytes.length;offset+=5552) {
    const end=Math.min(bytes.length,offset+5552);
    for(let i=offset;i<end;i++){a+=bytes[i];b+=a;}
    a%=65521;b%=65521;
  }
  new DataView(output.buffer).setUint32(at,((b<<16)|a)>>>0);
  return output;
}
async function nativeDeflate(bytes,compression,{signal,timeoutMs}) {
  const stream=new Blob([bytes]).stream().pipeThrough(compression),reader=stream.getReader();
  return new Promise((resolve,reject) => {
    let settled=false,timer;
    const finish=(error,result) => {
      if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',onAbort);
      if(error){reader.cancel(error).catch(()=>{});reject(error);}else resolve(result);
    };
    const onAbort=() => finish(new DOMException('操作已取消','AbortError'));
    signal?.addEventListener('abort',onAbort,{once:true});
    timer=setTimeout(()=>finish(Error('骰面 PNG 压缩超时，请重试')),timeoutMs);
    (async()=>{
      try {
        const parts=[];let length=0;
        while(true){const {value,done}=await reader.read();if(done)break;parts.push(value);length+=value.length;}
        const result=new Uint8Array(length);let at=0;
        for(const part of parts){result.set(part,at);at+=part.length;}
        finish(null,result);
      } catch(error){finish(error);} finally {reader.releaseLock();}
    })();
  });
}

export async function encodeRgbaPng(width,height,rgba,{signal,compression='auto',timeoutMs=15000}={}) {
  abortIf(signal);
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width>8192||height>8192||width*height>16777216||
     !ArrayBuffer.isView(rgba)||rgba.BYTES_PER_ELEMENT!==1||rgba.byteLength!==width*height*4)
    throw Error('PNG RGBA 数据或尺寸无效');
  const pixels=new Uint8Array(rgba.buffer,rgba.byteOffset,rgba.byteLength),stride=width*4;
  const scanlines=new Uint8Array((stride+1)*height);
  for(let y=0;y<height;y++)scanlines.set(pixels.subarray(y*stride,(y+1)*stride),y*(stride+1)+1);
  let native;
  if(compression!=='stored'&&typeof globalThis.CompressionStream==='function') {
    try{native=new CompressionStream('deflate');}catch{/* Stored zlib remains a standard PNG fallback. */}
  }
  const compressed=native?await nativeDeflate(scanlines,native,{signal,timeoutMs}):storedZlib(scanlines,signal);
  abortIf(signal);
  const header=new Uint8Array(13),view=new DataView(header.buffer);
  view.setUint32(0,width);view.setUint32(4,height);header.set([8,6,0,0,0],8);
  return {blob:new Blob([new Uint8Array([137,80,78,71,13,10,26,10]),chunk('IHDR',header),
    chunk('IDAT',compressed),chunk('IEND',new Uint8Array())],{type:'image/png'}),
    method:native?'rgba8-native-deflate':'rgba8-stored-zlib'};
}
