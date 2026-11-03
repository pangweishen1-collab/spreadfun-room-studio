/* Local SVGA text packaging. Schema: https://github.com/svga/SVGA-Format/blob/master/proto/svga.proto
 * Original protobuf records are retained verbatim unless an oversized raster asset
 * is explicitly optimized. PNG text is one additional sprite, not flattened frames.
 */
const MAX_INPUT_BYTES=50*1024*1024,MAX_DECODED_BYTES=150*1024*1024,MAX_FIELDS=1000000;
const encoder=new TextEncoder(),decoder=new TextDecoder('utf-8',{fatal:true});
const parsedMarker=Symbol('parsedSvga');
export const SVGA_MAX_OUTPUT_BYTES=3000000;
export class SvgaCustomizeError extends Error {
  constructor(code,message=code,details={}){super(message);this.name='SvgaCustomizeError';this.code=code;Object.assign(this,details)}
}
const fail=(code,message,details)=>{throw new SvgaCustomizeError(code,message,details)};
function asBytes(input){
  if(input instanceof Uint8Array)return new Uint8Array(input);
  if(input instanceof ArrayBuffer)return new Uint8Array(input.slice(0));
  if(ArrayBuffer.isView(input))return new Uint8Array(input.buffer.slice(input.byteOffset,input.byteOffset+input.byteLength));
  fail('invalidSvga','Expected SVGA bytes.');
}
function join(parts){const length=parts.reduce((n,p)=>n+p.length,0);if(length>MAX_DECODED_BYTES)fail('tooLarge','Decoded SVGA exceeds the processing limit.');const out=new Uint8Array(length);let at=0;for(const part of parts){out.set(part,at);at+=part.length}return out}
function uint(value){if(!Number.isSafeInteger(value)||value<0)fail('invalidSvga','Invalid protobuf integer.');const out=[];do{const low=value%128;value=Math.floor(value/128);out.push(low|(value?128:0))}while(value);return Uint8Array.from(out)}
function readUInt(bytes,cursor){let value=0,scale=1;for(let count=0;count<10;count++){if(cursor.at>=bytes.length)fail('invalidSvga','Truncated protobuf integer.');const b=bytes[cursor.at++];value+=(b&127)*scale;if(!Number.isSafeInteger(value))fail('invalidSvga','Protobuf length is too large.');if(!(b&128))return value;scale*=128}fail('invalidSvga','Invalid protobuf integer.')}
function skipUInt(bytes,cursor){for(let count=0;count<10;count++){if(cursor.at>=bytes.length)fail('invalidSvga','Truncated protobuf field.');const b=bytes[cursor.at++];if(!(b&128)){if(count===9&&b>1)fail('invalidSvga','Invalid 64-bit field.');return}}fail('invalidSvga','Invalid 64-bit field.')}
function records(bytes){
  const out=[],cursor={at:0};
  while(cursor.at<bytes.length){
    if(out.length>=MAX_FIELDS)fail('tooLarge','SVGA contains too many records.');
    const start=cursor.at,tag=readUInt(bytes,cursor),id=Math.floor(tag/8),wire=tag%8;
    if(!id||id>536870911)fail('invalidSvga','Invalid protobuf field tag.');
    let valueStart=cursor.at;
    if(wire===0)skipUInt(bytes,cursor);
    else if(wire===1)cursor.at+=8;
    else if(wire===2){const size=readUInt(bytes,cursor);valueStart=cursor.at;cursor.at+=size}
    else if(wire===5)cursor.at+=4;
    else fail('invalidSvga','Unsupported protobuf wire type.');
    if(cursor.at>bytes.length)fail('invalidSvga','Truncated protobuf field.');
    out.push({id,wire,raw:bytes.subarray(start,cursor.at),data:bytes.subarray(valueStart,cursor.at)});
  }
  return out;
}
const last=(rs,id)=>rs.findLast(r=>r.id===id);
function f32(rs,id,fallback=0){const r=last(rs,id);if(!r)return fallback;if(r.wire!==5)fail('invalidSvga','Invalid SVGA float.');return new DataView(r.data.buffer,r.data.byteOffset,4).getFloat32(0,true)}
function integer(rs,id){const r=last(rs,id);if(!r)return 0;if(r.wire!==0)fail('invalidSvga','Invalid SVGA integer.');return readUInt(r.data,{at:0})}
function text(rs,id){const r=last(rs,id);if(!r)return '';if(r.wire!==2)fail('invalidSvga','Invalid SVGA string.');try{return decoder.decode(r.data)}catch{fail('invalidSvga','Invalid SVGA string encoding.')}}
function field(id,wire,data){return join([uint(id*8+wire),...(wire===2?[uint(data.length)]:[]),data])}
const message=(id,data)=>field(id,2,data);
const str=(id,value)=>message(id,encoder.encode(value));
function float(id,value){if(!Number.isFinite(value)||Math.abs(value)>3.402823466e38)fail('invalidPlacement','Invalid text or image transform.');const b=new Uint8Array(4);new DataView(b.buffer).setFloat32(0,value,true);return field(id,5,b)}
function patch(rs,changes){const emitted=new Set(),out=[];for(const r of rs){if(changes.has(r.id)){if(!emitted.has(r.id)){out.push(changes.get(r.id));emitted.add(r.id)}}else out.push(r.raw)}for(const [id,value] of changes)if(!emitted.has(id))out.push(value);return join(out)}
function infoOf(width,height,fps,frames,format,imageCount){
  if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0||width>8192||height>8192||!Number.isInteger(frames)||frames<1||frames>20000||!Number.isFinite(fps)||fps<=0||fps>240)fail('invalidSvga','SVGA has invalid dimensions, duration or frame rate.');
  return {width,height,fps,frames,format,imageCount};
}
function pngInfo(bytes){
  if(bytes.length<33||bytes[0]!==137||bytes[1]!==80||bytes[2]!==78||bytes[3]!==71||bytes[4]!==13||bytes[5]!==10||bytes[6]!==26||bytes[7]!==10||bytes[12]!==73||bytes[13]!==72||bytes[14]!==68||bytes[15]!==82)return null;
  const dv=new DataView(bytes.buffer,bytes.byteOffset,bytes.length),width=dv.getUint32(16),height=dv.getUint32(20);
  return width>0&&height>0&&width<=32768&&height<=32768?{width,height}:null;
}
async function transform(bytes,kind){
  const Stream=kind==='inflate'?globalThis.DecompressionStream:globalThis.CompressionStream;
  if(typeof Stream!=='function')fail('unsupportedBrowser','This browser cannot process local SVGA compression.');
  const reader=new Blob([bytes]).stream().pipeThrough(new Stream('deflate')).getReader(),chunks=[];let total=0;
  try{for(;;){const {done,value}=await reader.read();if(done)break;total+=value.length;if(total>MAX_DECODED_BYTES){await reader.cancel();fail('tooLarge','SVGA exceeds the processing limit.')}chunks.push(value)}return join(chunks)}
  catch(error){if(error instanceof SvgaCustomizeError)throw error;fail('invalidSvga','SVGA compression is damaged or unsupported.')}
  finally{reader.releaseLock()}
}
function inspectZip(bytes){
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let eocd=-1;
  for(let at=bytes.length-22;at>=Math.max(0,bytes.length-65557);at--)if(view.getUint32(at,true)===0x06054b50&&at+22+view.getUint16(at+20,true)===bytes.length){eocd=at;break}
  if(eocd<0)fail('invalidSvga','SVGA archive directory is missing.');
  const disk=view.getUint16(eocd+4,true),directoryDisk=view.getUint16(eocd+6,true),entries=view.getUint16(eocd+10,true),size=view.getUint32(eocd+12,true),offset=view.getUint32(eocd+16,true);
  if(disk||directoryDisk||entries===65535||entries>10000||offset===0xffffffff||size===0xffffffff||offset+size>eocd)fail('invalidSvga','Unsupported SVGA archive directory.');
  let at=offset,total=0;const names=new Set();
  for(let count=0;count<entries;count++){
    if(at+46>offset+size||view.getUint32(at,true)!==0x02014b50)fail('invalidSvga','SVGA archive entry is damaged.');
    const unpacked=view.getUint32(at+24,true),nameLength=view.getUint16(at+28,true),extra=view.getUint16(at+30,true),comment=view.getUint16(at+32,true),end=at+46+nameLength+extra+comment;
    if(end>offset+size||unpacked===0xffffffff)fail('invalidSvga','Invalid SVGA archive entry.');
    total+=unpacked;if(total>MAX_DECODED_BYTES)fail('tooLarge','Decoded SVGA archive exceeds the processing limit.');
    let name;try{name=decoder.decode(bytes.subarray(at+46,at+46+nameLength))}catch{fail('invalidSvga','Invalid SVGA archive filename.')}
    if(names.has(name)||name.includes('\\')||name.split('/').includes('..'))fail('invalidSvga','Unsafe or duplicate SVGA archive filename.');names.add(name);at=end;
  }
  return names;
}
function zipEntryBytes(entry,limit=MAX_DECODED_BYTES){
  return new Promise((resolve,reject)=>{
    const chunks=[];let total=0,settled=false;const stream=entry.internalStream('uint8array');
    stream.on('data',chunk=>{if(settled)return;total+=chunk.length;if(total>limit){settled=true;stream.pause();reject(new SvgaCustomizeError('tooLarge','SVGA archive entry exceeds the processing limit.'));return}chunks.push(chunk)});
    stream.on('error',error=>{if(!settled){settled=true;reject(new SvgaCustomizeError('invalidSvga','SVGA archive entry could not be read.',{cause:error}))}});
    stream.on('end',()=>{if(!settled){settled=true;try{resolve(join(chunks))}catch(error){reject(error)}}});stream.resume();
  });
}
async function readZip(bytes,JSZip){
  if(!JSZip||typeof JSZip.loadAsync!=='function')fail('unsupportedBrowser','The SVGA archive library is unavailable.');
  const names=inspectZip(bytes);
  if(!names.has('movie.spec'))fail('invalidSvga','SVGA archive is missing movie.spec.');
  // The old binary dialect has a second timeline; do not silently export mismatched JSON and binary timelines.
  if(names.has('movie.binary'))fail('unsupportedLegacyBinary','Legacy movie.binary files must first be converted to SVGA 2.0.');
  let zip,spec;
  try{zip=await JSZip.loadAsync(bytes);const specBytes=await zipEntryBytes(zip.file('movie.spec'),50*1024*1024);spec=JSON.parse(decoder.decode(specBytes))}catch(error){if(error instanceof SvgaCustomizeError)throw error;fail('invalidSvga','SVGA movie.spec is damaged.')}
  if(!spec||typeof spec!=='object'||!spec.movie||typeof spec.movie!=='object'||!Array.isArray(spec.sprites)||!spec.images||typeof spec.images!=='object'||Array.isArray(spec.images))fail('invalidSvga','SVGA movie.spec has invalid animation data.');
  const images=[];
  for(const [key,name] of Object.entries(spec.images)){
    if(typeof name!=='string'||!name||name.includes('/')||name.includes('\\'))fail('invalidSvga','Invalid SVGA image filename.');
    const path=name.endsWith('.png')?name:name+'.png',entry=zip.file(path);
    if(!entry)fail('invalidSvga','SVGA image is missing.');images.push({key,path});
  }
  const info=infoOf(Number(spec.movie.viewBox?.width),Number(spec.movie.viewBox?.height),Number(spec.movie.fps),Number(spec.movie.frames),'zip',images.length);
  return {[parsedMarker]:true,format:'zip',info,images,spec,zip,JSZip,sourceBytes:bytes};
}
/** Read an uploaded SVGA without decoding or flattening its animation frames. */
export async function readSvga(input,{JSZip=globalThis.JSZip}={}){
  if(input?.[parsedMarker])return input;
  const bytes=asBytes(input);
  if(bytes.length<4)fail('invalidSvga','SVGA is empty or truncated.');if(bytes.length>MAX_INPUT_BYTES)fail('tooLarge','Choose an SVGA under 50 MB.');
  if(bytes[0]===80&&bytes[1]===75)return readZip(bytes,JSZip);
  const body=await transform(bytes,'inflate'),root=records(body),params=last(root,2);
  if(!params||params.wire!==2)fail('invalidSvga','SVGA is missing movie parameters.');
  const pr=records(params.data),images=[];
  for(let index=0;index<root.length;index++)if(root[index].id===3){
    if(root[index].wire!==2)fail('invalidSvga','Invalid SVGA image map.');const entry=records(root[index].data),key=text(entry,1),data=last(entry,2);
    if(!key||!data||data.wire!==2)fail('invalidSvga','Invalid SVGA image entry.');images.push({key,bytes:data.data,index,entry});
  }
  const info=infoOf(f32(pr,1),f32(pr,2),integer(pr,3),integer(pr,4),'protobuf',images.length);
  if(!root.some(r=>r.id===4))fail('invalidSvga','SVGA has no animation sprites.');
  return {[parsedMarker]:true,format:'protobuf',info,images,root,sourceBytes:bytes};
}
export const readSvgaInfo=async(input,options)=>(await readSvga(input,options)).info;
function uniqueKey(model){const used=new Set(model.images.map(i=>i.key));if(model.format==='zip')for(const sprite of model.spec.sprites)used.add(sprite.imageKey);else for(const r of model.root)if(r.id===4&&r.wire===2)used.add(text(records(r.data),1));let key='fun_custom_text',number=2;while(used.has(key))key='fun_custom_text_'+number++;return key}
function textPlacement(options){
  const bytes=asBytes(options.textImage),png=pngInfo(bytes);if(!png)fail('invalidTextImage','Text must be a valid PNG bitmap.');
  const {x,y,width,height}=options;
  if(![x,y,width,height].every(Number.isFinite)||width<=0||height<=0||width>16384||height>16384||Math.abs(x)>32768||Math.abs(y)>32768)fail('invalidPlacement','Invalid text position or size.');
  return {bytes,png,x,y,width,height};
}
function textSpriteData(key,placement,frames){
  const {png,x,y,width,height}=placement;
  const layout=join([float(1,0),float(2,0),float(3,png.width),float(4,png.height)]);
  const matrix=join([float(1,width/png.width),float(2,0),float(3,0),float(4,height/png.height),float(5,x),float(6,y)]);
  const frame=message(2,join([float(1,1),message(2,layout),message(3,matrix)]));
  return join([str(1,key),...Array(frames).fill(frame)]);
}
function frameCanResize(frame){
  const clip=last(frame,4);if(clip&&clip.data.length)return false;
  return !frame.some(r=>r.id===5&&r.data.length);
}
function canResizeImage(model,key){
  if(model.format==='zip')return model.spec.sprites.filter(s=>String(s.imageKey).replace('.matte','')===key).every(s=>Array.isArray(s.frames)&&s.frames.every(f=>!f.clipPath&&(!Array.isArray(f.shapes)||f.shapes.length===0)));
  return model.root.filter(r=>r.id===4).every(r=>{const sprite=records(r.data);if(text(sprite,1).replace('.matte','')!==key)return true;return sprite.filter(r=>r.id===2).every(r=>frameCanResize(records(r.data)))});
}
function scaleFrame(frame,sx,sy){
  const lr=last(frame,2),tr=last(frame,3),layout=lr?records(lr.data):[],matrix=tr?records(tr.data):[];
  const a=f32(matrix,1,1),b=f32(matrix,2),c=f32(matrix,3),d=f32(matrix,4,1);
  const updatedMatrix=patch(matrix,new Map([[1,float(1,a*sx)],[2,float(2,b*sx)],[3,float(3,c*sy)],[4,float(4,d*sy)]]));
  const updatedLayout=patch(layout,new Map([[1,float(1,f32(layout,1)/sx)],[2,float(2,f32(layout,2)/sy)],[3,float(3,f32(layout,3)/sx)],[4,float(4,f32(layout,4)/sy)]]));
  return patch(frame,new Map([[2,message(2,updatedLayout)],[3,message(3,updatedMatrix)]]));
}
function scaledSprite(raw,sx,sy){const rs=records(raw);return join(rs.map(r=>r.id===2?message(2,scaleFrame(records(r.data),sx,sy)):r.raw))}
function protobufBytes(model,key,placement,replacements){
  const imagesByIndex=new Map(model.images.map(i=>[i.index,i]));
  const parts=model.root.map((r,index)=>{
    if(r.id===3){const image=imagesByIndex.get(index),replacement=replacements.get(image.key);if(replacement)return message(3,patch(image.entry,new Map([[2,message(2,replacement.bytes)]])))}
    if(r.id===4){const rs=records(r.data),replacement=replacements.get(text(rs,1).replace('.matte',''));if(replacement&&(replacement.sx!==1||replacement.sy!==1))return message(4,scaledSprite(r.data,replacement.sx,replacement.sy))}
    return r.raw;
  });
  return join([...parts,message(3,join([str(1,key),message(2,placement.bytes)])),message(4,textSpriteData(key,placement,model.info.frames))]);
}
function cloneSpec(spec){return JSON.parse(JSON.stringify(spec))}
async function zipBytes(model,key,placement,replacements){
  // JSZip instances own mutable file maps, so every build starts from the retained input bytes.
  const zip=await model.JSZip.loadAsync(model.sourceBytes),spec=cloneSpec(model.spec),{png,x,y,width,height}=placement;
  const reserved=new Set(Object.keys(zip.files));let path=key+'.png',index=2;while(reserved.has(path))path=key+'_'+(index++)+'.png';
  spec.images[key]=path.slice(0,-4);
  spec.sprites.push({imageKey:key,frames:Array.from({length:model.info.frames},()=>({alpha:1,layout:{x:0,y:0,width:png.width,height:png.height},transform:{a:width/png.width,b:0,c:0,d:height/png.height,tx:x,ty:y}}))});
  for(const image of model.images){const replacement=replacements.get(image.key);if(!replacement)continue;zip.file(image.path,replacement.bytes);if(replacement.sx===1&&replacement.sy===1)continue;
    for(const sprite of spec.sprites)if(String(sprite.imageKey).replace('.matte','')===image.key)for(const frame of sprite.frames){
      const matrix=frame.transform||{a:1,b:0,c:0,d:1,tx:0,ty:0},layout=frame.layout||{x:0,y:0,width:0,height:0};
      frame.transform={...matrix,a:(matrix.a??1)*replacement.sx,b:(matrix.b??0)*replacement.sx,c:(matrix.c??0)*replacement.sy,d:(matrix.d??1)*replacement.sy};
      frame.layout={...layout,x:(layout.x??0)/replacement.sx,y:(layout.y??0)/replacement.sy,width:(layout.width??0)/replacement.sx,height:(layout.height??0)/replacement.sy};
    }
  }
  zip.file(path,placement.bytes);zip.file('movie.spec',JSON.stringify(spec));
  return zip.generateAsync({type:'uint8array',compression:'DEFLATE',compressionOptions:{level:9}});
}
async function assetBytes(model,image){return image.bytes||zipEntryBytes(model.zip.file(image.path))}
/**
 * Add one topmost static text PNG. x/y and width/height are logical SVGA pixels,
 * independent of PNG resolution (a 2x bitmap is supported).
 * optimizeImage({bytes,key,width,height,maxWidth,maxHeight,pass,canResize}) may
 * return smaller PNG bytes or null. Only called when the complete file is too large.
 * Images with vector/clip geometry cannot be resized, but same-size PNG optimization
 * is safe. Original timeline/audio are retained, never frame-dropped to meet budget.
 */
export async function buildCustomizedSvga(input,options={},runtime={}){
  const model=await readSvga(input,runtime),placement=textPlacement(options),key=uniqueKey(model),replacements=new Map();
  const maxBytes=options.maxBytes??SVGA_MAX_OUTPUT_BYTES;
  if(!Number.isInteger(maxBytes)||maxBytes<1024||maxBytes>SVGA_MAX_OUTPUT_BYTES)fail('invalidSizeLimit','The SVGA size limit must be between 1 KB and 3 MB.');
  const progress=value=>runtime.onProgress?.(value);
  progress({phase:'packaging',progress:10});
  const encode=async()=>model.format==='protobuf'?transform(protobufBytes(model,key,placement,replacements),'deflate'):zipBytes(model,key,placement,replacements);
  let bytes=await encode(),passes=0;
  if(bytes.length>maxBytes&&typeof options.optimizeImage==='function'){
    const assets=[],seenPaths=new Set();
    for(const image of model.images){if(model.format==='zip'&&seenPaths.has(image.path))continue;seenPaths.add(image.path);const original=await assetBytes(model,image),dimensions=pngInfo(original);if(dimensions){const aliases=model.format==='zip'?model.images.filter(other=>other.path===image.path):[image];assets.push({image,aliases,bytes:original,...dimensions,canResize:aliases.every(alias=>canResizeImage(model,alias.key))})}}
    assets.sort((a,b)=>b.bytes.length-a.bytes.length);
    const scales=[.9,.75,.6];
    for(let pass=0;pass<scales.length&&bytes.length>maxBytes;pass++){
      let changed=false;
      for(let index=0;index<assets.length;index++){
        const asset=assets[index],scale=asset.canResize?scales[pass]:1;
        progress({phase:'optimizing',progress:20+Math.round((pass+index/Math.max(1,assets.length))/scales.length*65),pass:pass+1});
        const result=await options.optimizeImage({key:asset.image.key,bytes:new Uint8Array(asset.bytes),width:asset.width,height:asset.height,maxWidth:Math.max(1,Math.round(asset.width*scale)),maxHeight:Math.max(1,Math.round(asset.height*scale)),pass:pass+1,canResize:asset.canResize});
        if(result==null)continue;
        const optimized=asBytes(result),dimensions=pngInfo(optimized);if(!dimensions)fail('invalidOptimizedImage','Image optimization must return PNG data.');
        if((!asset.canResize&&(dimensions.width!==asset.width||dimensions.height!==asset.height))||dimensions.width>asset.width||dimensions.height>asset.height)continue;
        const current=replacements.get(asset.image.key)?.bytes||asset.bytes;if(optimized.length>=current.length)continue;
        // Keep one canonical geometry change relative to the untouched original.
        for(const alias of asset.aliases)replacements.set(alias.key,{bytes:optimized,sx:asset.width/dimensions.width,sy:asset.height/dimensions.height});changed=true;
      }
      passes=pass+1;if(changed)bytes=await encode();
    }
  }
  if(bytes.length>maxBytes)fail('sizeLimit','The customized SVGA cannot fit within the selected size limit without further source optimization.',{actualBytes:bytes.length,maxBytes});
  progress({phase:'done',progress:100});
  return {bytes,mime:'application/octet-stream',info:{...model.info,imageCount:model.info.imageCount+1},imageKey:key,optimized:replacements.size>0,optimizedImages:replacements.size,optimizationPasses:passes,size:bytes.length};
}
