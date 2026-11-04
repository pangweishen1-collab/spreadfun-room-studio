// Independent PNG encoder/decoder fixtures: optimization must preserve every RGBA
// sample, including color under zero alpha. Production code is not used to decode.
const assert=require('node:assert/strict');
const zlib=require('node:zlib');

const signature=Buffer.from([137,80,78,71,13,10,26,10]);
function crc32(bytes){let crc=0xffffffff;for(const byte of bytes){crc^=byte;for(let n=0;n<8;n++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return (crc^0xffffffff)>>>0;}
function chunk(type,data){data=Buffer.from(data);const head=Buffer.alloc(8),tail=Buffer.alloc(4);head.writeUInt32BE(data.length,0);head.write(type,4);tail.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type),data])));return Buffer.concat([head,data,tail]);}
function paeth(a,b,c){const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);return pa<=pb&&pa<=pc?a:pb<=pc?b:c;}
function predictor(filter,a,b,c){return [0,a,b,Math.floor((a+b)/2),paeth(a,b,c)][filter];}
const channels=type=>({0:1,2:3,3:1,4:2,6:4})[type];
function pixelGrid(width,height,kind='rgba'){
  const out=new Uint8Array(width*height*4);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const i=(y*width+x)*4,v=(x*11+y*7)%256,gray=kind.includes('gray'),opaque=kind.includes('opaque');
    out[i]=v;out[i+1]=gray?v:(x*5+y*19+37)%256;out[i+2]=gray?v:(x*17+y*3+91)%256;out[i+3]=opaque?255:[0,1,64,128,254,255][(x+y)%6];
  }
  return out;
}
function png({width=64,height=48,type=6,depth=8,interlace=0,rgba=pixelGrid(width,height),filters=[0],metadata=[],after=[],idatParts=1,compressed}={}){
  const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(width,0);ihdr.writeUInt32BE(height,4);ihdr[8]=depth;ihdr[9]=type;ihdr[12]=interlace;
  const c=channels(type),bpp=c*depth/8,raw=[];
  const passes=interlace?[[0,0,8,8],[4,0,8,8],[0,4,4,8],[2,0,4,4],[0,2,2,4],[1,0,2,2],[0,1,1,2]]:[[0,0,1,1]];
  for(const [sx,sy,dx,dy] of passes){
    if(sx>=width||sy>=height)continue;
    const rowWidth=Math.ceil((width-sx)/dx);let previous=new Uint8Array(rowWidth*bpp),rowNumber=0;
    for(let y=sy;y<height;y+=dy){
      const row=new Uint8Array(rowWidth*bpp);let at=0;
      for(let x=sx;x<width;x+=dx){const p=(y*width+x)*4,values=type===0?[rgba[p]]:type===2?[rgba[p],rgba[p+1],rgba[p+2]]:type===3?[rgba[p]%8]:type===4?[rgba[p],rgba[p+3]]:[rgba[p],rgba[p+1],rgba[p+2],rgba[p+3]];for(const v of values){if(depth===16)row[at++]=v;row[at++]=v;}}
      const filter=filters[rowNumber++%filters.length],encoded=new Uint8Array(row.length+1);encoded[0]=filter;
      for(let i=0;i<row.length;i++)encoded[i+1]=(row[i]-predictor(filter,i>=bpp?row[i-bpp]:0,previous[i],i>=bpp?previous[i-bpp]:0))&255;
      raw.push(encoded);previous=row;
    }
  }
  const packed=compressed||zlib.deflateSync(Buffer.concat(raw.map(Buffer.from)),{level:0}),parts=[];
  for(let n=0;n<idatParts;n++){const start=Math.floor(n*packed.length/idatParts),end=Math.floor((n+1)*packed.length/idatParts);parts.push(chunk('IDAT',packed.subarray(start,end)));}
  return new Uint8Array(Buffer.concat([signature,chunk('IHDR',ihdr),...metadata.map(([t,d])=>chunk(t,d)),...parts,...after.map(([t,d])=>chunk(t,d)),chunk('IEND',[])]));
}
function parse(bytes){
  bytes=Buffer.from(bytes);assert.deepEqual(bytes.subarray(0,8),signature);const chunks=[];let at=8;
  while(at<bytes.length){const length=bytes.readUInt32BE(at),type=bytes.toString('ascii',at+4,at+8),data=bytes.subarray(at+8,at+8+length);assert.ok(at+length+12<=bytes.length);assert.equal(bytes.readUInt32BE(at+8+length),crc32(bytes.subarray(at+4,at+8+length)),'valid '+type+' CRC');chunks.push({type,data});at+=length+12;}
  assert.equal(chunks.at(-1).type,'IEND');const h=chunks[0].data;
  return {width:h.readUInt32BE(0),height:h.readUInt32BE(4),depth:h[8],type:h[9],interlace:h[12],chunks};
}
function decode(bytes){
  const image=parse(bytes),{width,height,type,depth,interlace,chunks}=image;assert.equal(depth,8);assert.equal(interlace,0);assert.ok([0,2,4,6].includes(type));
  const c=channels(type),stride=width*c,raw=zlib.inflateSync(Buffer.concat(chunks.filter(x=>x.type==='IDAT').map(x=>x.data)));assert.equal(raw.length,(stride+1)*height);
  const rgba=new Uint8Array(width*height*4);let previous=new Uint8Array(stride),at=0;
  for(let y=0;y<height;y++){const filter=raw[at++];assert.ok(filter<=4);const row=new Uint8Array(stride);
    for(let x=0;x<stride;x++)row[x]=(raw[at++]+predictor(filter,x>=c?row[x-c]:0,previous[x],x>=c?previous[x-c]:0))&255;
    for(let x=0;x<width;x++){const p=(y*width+x)*4,q=x*c;if(type===0){rgba[p]=rgba[p+1]=rgba[p+2]=row[q];rgba[p+3]=255;}else if(type===2){rgba.set(row.subarray(q,q+3),p);rgba[p+3]=255;}else if(type===4){rgba[p]=rgba[p+1]=rgba[p+2]=row[q];rgba[p+3]=row[q+1];}else rgba.set(row.subarray(q,q+4),p);}
    previous=row;
  }
  return {...image,rgba};
}
function metadataOf(bytes){return parse(bytes).chunks.filter(x=>!['IHDR','IDAT','IEND'].includes(x.type)).map(x=>[x.type,Buffer.from(x.data)]);}

(async()=>{
  const {compressDeflate,optimizePngLossless}=await import('../avatar-lossless-codec.mjs');
  let checks=0;
  for(const input of [Buffer.from('lossless SVGA '.repeat(400)),Buffer.from(Array.from({length:4096},(_,i)=>i%256)),Buffer.alloc(65536,0)]){
    const packed=compressDeflate(new Uint8Array(input));assert.deepEqual(zlib.inflateSync(packed),input,'native zlib decodes the browser compressor exactly');checks++;
  }
  const cases=[
    ['gray',0,'gray-opaque',0],['rgb',2,'rgb-opaque',2],['gray-alpha',4,'gray',4],['rgba',6,'rgba',6],
    ['opaque-rgba',6,'rgb-opaque',2],['gray-rgba',6,'gray',4],['opaque-gray-rgba',6,'gray-opaque',0],['opaque-gray-alpha',4,'gray-opaque',0],['gray-rgb',2,'gray-opaque',0]
  ];
  for(const [name,type,kind,expectedType] of cases){
    const source=png({type,rgba:pixelGrid(64,48,kind),filters:[0,1,2,3,4],idatParts:5}),original=decode(source),optimized=optimizePngLossless(source),decoded=decode(optimized);
    assert.ok(optimized.length<source.length,name+' should improve an intentionally uncompressed valid PNG');assert.equal(decoded.width,original.width);assert.equal(decoded.height,original.height);assert.equal(decoded.type,expectedType,name+' uses only a sample-exact channel reduction');assert.deepEqual(decoded.rgba,original.rgba,name+' keeps all RGBA bytes');checks++;
  }
  for(const filter of [0,1,2,3,4]){
    const source=png({width:37,height:19,filters:[filter],idatParts:3});assert.deepEqual(decode(optimizePngLossless(source)).rgba,decode(source).rgba,'PNG filter '+filter+' is reversed exactly');checks++;
  }
  // Distinct RGB under zero alpha and small fractional-alpha samples must survive.
  const hidden=png({width:41,height:23,rgba:pixelGrid(41,23,'rgba'),filters:[4,3,2,1,0]}),hiddenBefore=decode(hidden).rgba,hiddenAfter=decode(optimizePngLossless(hidden)).rgba;
  assert.ok(hiddenBefore.some((v,i)=>i%4===3&&v===0));assert.ok(hiddenBefore.some((v,i)=>i%4===3&&v>0&&v<255));assert.deepEqual(hiddenAfter,hiddenBefore,'never zero or unpremultiply hidden/semitransparent RGB');checks++;
  const gamma=Buffer.alloc(4);gamma.writeUInt32BE(45455);const profile=Buffer.concat([Buffer.from('fixture-profile\0\0'),zlib.deflateSync(Buffer.from('opaque ICC payload preserved byte for byte'))]);
  for(const metadata of [[['gAMA',gamma]],[['iCCP',profile]],[['sRGB',Buffer.from([0])]]]){
    const source=png({metadata}),optimized=optimizePngLossless(source);assert.deepEqual(metadataOf(optimized),metadataOf(source),'color metadata payload and ordering stay byte-exact');assert.deepEqual(decode(optimized).rgba,decode(source).rgba);checks++;
  }
  for(const metadata of [[['gAMA',gamma]],[['iCCP',profile]]]){
    const source=png({rgba:pixelGrid(64,48,'gray-opaque'),metadata}),optimized=optimizePngLossless(source);assert.equal(parse(optimized).type,2,'an RGB color profile prevents converting equal RGB samples into a grayscale color space');assert.deepEqual(metadataOf(optimized),metadataOf(source));assert.deepEqual(decode(optimized).rgba,decode(source).rgba);checks++;
  }
  for(const metadata of [[['vpAg',Buffer.from([3,5,8,13])]],[['sBIT',Buffer.from([8,8,8,8])]],[['bKGD',Buffer.from([0,1,0,2,0,3])]]]){
    const source=png({rgba:pixelGrid(64,48,'gray-opaque'),metadata}),optimized=optimizePngLossless(source);assert.deepEqual(metadataOf(optimized),metadataOf(source));assert.equal(parse(optimized).type,6,'unknown or channel-dependent metadata prevents structural color conversion');assert.deepEqual(decode(optimized).rgba,decode(source).rgba);checks++;
  }
  const palette=Buffer.from(Array.from({length:24},(_,i)=>(i*11)&255)),trns=Buffer.from([0,0,0,0,0,0]),actl=Buffer.alloc(8);actl.writeUInt32BE(1,0);
  const fctl=Buffer.alloc(26);fctl.writeUInt32BE(64,4);fctl.writeUInt32BE(48,8);fctl.writeUInt16BE(1,20);fctl.writeUInt16BE(10,22);
  const unsupported=[
    ['palette',png({type:3,metadata:[['PLTE',palette]]})],['PLTE-on-truecolor',png({metadata:[['PLTE',palette]]})],['transparent-key',png({type:2,rgba:pixelGrid(64,48,'rgb-opaque'),metadata:[['tRNS',trns]]})],
    ['APNG',png({metadata:[['acTL',actl],['fcTL',fctl]]})],['16-bit',png({depth:16})],['Adam7',png({width:16,height:16,interlace:1,rgba:pixelGrid(16,16)})],['unknown-critical',png({metadata:[['VpAG',Buffer.from([1,2,3])]]})]
  ];
  for(const [name,source] of unsupported){assert.deepEqual(optimizePngLossless(source),source,name+' remains untouched when unsupported');checks++;}
  const valid=png(),badCrc=new Uint8Array(valid);badCrc[29]^=1;
  for(const source of [new Uint8Array([1,2,3]),badCrc,valid.subarray(0,valid.length-5)]){assert.deepEqual(optimizePngLossless(source),source,'invalid PNGs retain original bytes without throwing');checks++;}
  const badFilterRaw=Buffer.alloc((64*4+1)*48);badFilterRaw[0]=5;const badFilter=png({compressed:zlib.deflateSync(badFilterRaw)});assert.deepEqual(optimizePngLossless(badFilter),badFilter,'an invalid scanline filter cannot produce an altered PNG');checks++;
  const wrongAdler=Buffer.from(zlib.deflateSync(Buffer.alloc((64*4+1)*48),{level:9}));wrongAdler[wrongAdler.length-1]^=1;const adlerPng=png({compressed:wrongAdler});assert.deepEqual(optimizePngLossless(adlerPng),adlerPng,'an invalid zlib Adler checksum cannot be accepted after a valid PNG chunk CRC');checks++;
  const bomb=png({width:1,height:1,rgba:pixelGrid(1,1),compressed:zlib.deflateSync(Buffer.alloc(2*1024*1024,0),{level:9})});assert.deepEqual(optimizePngLossless(bomb),bomb,'inflation cannot exceed the exact dimensions-derived output limit');checks++;
  const tiny=png({width:1,height:1,rgba:new Uint8Array([41,77,123,255]),compressed:zlib.deflateSync(Buffer.from([0,41,77,123,255]),{level:9})});assert.ok(optimizePngLossless(tiny).length<=tiny.length,'optimization never grows an already small valid PNG');checks++;
  console.log('avatar-lossless: '+checks+' independent zlib/PNG checks passed; filters, color types, exact hidden RGBA, metadata, conservative skips, CRC/Adler and inflation bounds.');
})().catch(error=>{console.error(error);process.exitCode=1;});
