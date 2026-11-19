// PNG's reflected IEEE CRC-32, with eight bytes folded per iteration.
// DataView's explicit little endian reads preserve unaligned subarray offsets
// and do not depend on the machine's native byte order.
const tables=Array.from({length:8},()=>new Uint32Array(256));
for(let byte=0;byte<256;byte++){
  let crc=byte;
  for(let bit=0;bit<8;bit++)crc=crc&1?0xedb88320^(crc>>>1):crc>>>1;
  tables[0][byte]=crc>>>0;
}
for(let slice=1;slice<8;slice++)for(let byte=0;byte<256;byte++){
  const crc=tables[slice-1][byte];
  tables[slice][byte]=tables[0][crc&255]^(crc>>>8);
}
const [t0,t1,t2,t3,t4,t5,t6,t7]=tables;

/** Read every byte of a Uint8Array/Uint8ClampedArray, without modifying it. */
export function crc32Png(bytes){
  if(!ArrayBuffer.isView(bytes)||bytes.BYTES_PER_ELEMENT!==1)throw new TypeError('PNG CRC32 requires a byte typed array');
  const length=bytes.byteLength;
  let crc=0xffffffff,offset=0;
  if(length>=8){
    const view=new DataView(bytes.buffer,bytes.byteOffset,length);
    for(;offset+8<=length;offset+=8){
      const first=view.getUint32(offset,true)^crc;
      const second=view.getUint32(offset+4,true);
      crc=t7[first&255]^t6[(first>>>8)&255]^t5[(first>>>16)&255]^t4[first>>>24]^
        t3[second&255]^t2[(second>>>8)&255]^t1[(second>>>16)&255]^t0[second>>>24];
    }
  }
  for(;offset<length;offset++)crc=t0[(crc^bytes[offset])&255]^(crc>>>8);
  return (crc^0xffffffff)>>>0;
}
