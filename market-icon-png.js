/* Exact RGB/RGBA store PNGs. Native, asynchronous, lossless compression. */
(() => {
  'use strict';
  const table=Uint32Array.from({length:256},(_,n)=>{
    for(let bit=0;bit<8;bit++)n=(n>>>1)^((n&1)?0xedb88320:0);
    return n>>>0;
  });
  function chunk(type,data){
    const out=new Uint8Array(data.length+12),view=new DataView(out.buffer);
    view.setUint32(0,data.length);
    for(let i=0;i<4;i++)out[i+4]=type.charCodeAt(i);
    out.set(data,8);let crc=0xffffffff;
    for(let i=4;i<out.length-4;i++)crc=(crc>>>8)^table[(crc^out[i])&255];
    view.setUint32(out.length-4,(crc^0xffffffff)>>>0);return out;
  }
  async function encode(canvas,{alpha=true}={}){
    if(typeof CompressionStream!=='function')throw new Error('marketUnsupported');
    const width=canvas.width,height=canvas.height;
    if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width>4096||height>4096)throw new Error('marketExportError');
    const ctx=canvas.getContext('2d');if(!ctx)throw new Error('marketExportError');
    const pixels=ctx.getImageData(0,0,width,height).data;
    if(pixels.length!==width*height*4)throw new Error('marketExportError');
    const channels=alpha?4:3,stride=width*channels,raw=new Uint8Array((stride+1)*height);
    // PNG Sub filter preserves every pixel while shrinking smooth artwork.
    for(let y=0;y<height;y++){
      const start=y*(stride+1);raw[start]=1;
      for(let x=0;x<width;x++){
        const src=(y*width+x)*4,dst=start+1+x*channels;
        if(!alpha&&pixels[src+3]!==255)throw new Error('marketExportError');
        for(let c=0;c<channels;c++)raw[dst+c]=(pixels[src+c]-(x?pixels[src-4+c]:0))&255;
      }
    }
    let compressor;try{compressor=new CompressionStream('deflate')}catch(error){throw new Error('marketUnsupported')}
    const compressed=new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(compressor)).arrayBuffer());
    const header=new Uint8Array(13),view=new DataView(header.buffer);view.setUint32(0,width);view.setUint32(4,height);header[8]=8;header[9]=alpha?6:2;
    return new Blob([new Uint8Array([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('sRGB',new Uint8Array([0])),chunk('IDAT',compressed),chunk('IEND',new Uint8Array())],{type:'image/png'});
  }
  window.MarketIconPNG={encode};
})();
