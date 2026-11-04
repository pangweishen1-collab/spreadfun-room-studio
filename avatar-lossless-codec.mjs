import {zlibSync,Unzlib} from './vendor/fflate/browser.mjs';

// Keep decoded scanlines bounded. Unsupported PNG dialects are returned untouched.
const MAX_RAW=32*1024*1024,MAX_INPUT=64*1024*1024,MAX_CHUNKS=10000;
const SIGNATURE=[137,80,78,71,13,10,26,10];
const CHANNELS={0:1,2:3,4:2,6:4};
const COLOR_CHUNKS=new Set(['cHRM','gAMA','iCCP','sRGB','cICP','mDCV','cLLI']);
const INDEPENDENT_CHUNKS=new Set(['pHYs','tIME','tEXt','zTXt','iTXt']);
const TYPED_CHUNKS=new Set(['sBIT','bKGD','sPLT','hIST','eXIf']);
const UNSUPPORTED_CHUNKS=new Set(['PLTE','tRNS','acTL','fcTL','fdAT']);
const CRC_TABLE=Uint32Array.from({length:256},(_,value)=>{for(let bit=0;bit<8;bit++)value=value&1?0xedb88320^(value>>>1):value>>>1;return value>>>0});
function bytesOf(input){
  if(input instanceof Uint8Array)return input;
  if(input instanceof ArrayBuffer)return new Uint8Array(input);
  if(ArrayBuffer.isView(input))return new Uint8Array(input.buffer,input.byteOffset,input.byteLength);
  throw new TypeError('Expected bytes.');
}
function crc32(bytes,start=0,end=bytes.length){let crc=0xffffffff;for(let at=start;at<end;at++)crc=CRC_TABLE[(crc^bytes[at])&255]^(crc>>>8);return (crc^0xffffffff)>>>0}
function adler32(bytes){let a=1,b=0;for(let at=0;at<bytes.length;){const end=Math.min(at+5552,bytes.length);while(at<end){a+=bytes[at++];b+=a}a%=65521;b%=65521}return ((b<<16)|a)>>>0}
function uint32(bytes,at){return new DataView(bytes.buffer,bytes.byteOffset+at,4).getUint32(0)}
function parsePng(bytes){
  if(bytes.length<57||bytes.length>MAX_INPUT||SIGNATURE.some((value,index)=>bytes[index]!==value))return null;
  const chunks=[];let at=8,idatBytes=0,idatLength=0,seenData=false,dataEnded=false,ended=false,allowTypeChange=true,allowGray=true;
  while(at<bytes.length){
    if(chunks.length>=MAX_CHUNKS||at+12>bytes.length)return null;
    const length=uint32(bytes,at),end=at+12+length;if(end>bytes.length)return null;
    const letters=bytes.subarray(at+4,at+8);if([...letters].some(value=>value<65||value>122||value>90&&value<97)||letters[2]&32)return null;
    const type=String.fromCharCode(...letters);
    if(uint32(bytes,at+8+length)!==crc32(bytes,at+4,at+8+length))return null;
    if(!chunks.length&&(type!=='IHDR'||length!==13)||chunks.length&&type==='IHDR')return null;
    if(UNSUPPORTED_CHUNKS.has(type))return null;
    if(!(letters[0]&32)&&!['IHDR','IDAT','IEND'].includes(type))return null;
    if(type==='IDAT'){
      if(dataEnded)return null;seenData=true;idatBytes+=length;idatLength+=length+12;
    }else if(seenData)dataEnded=true;
    if(type==='IEND'){if(length||!seenData||end!==bytes.length)return null;ended=true}
    if(letters[0]&32){
      if(COLOR_CHUNKS.has(type))allowGray=false;
      else if(TYPED_CHUNKS.has(type))allowTypeChange=false;
      else if(!INDEPENDENT_CHUNKS.has(type)){
        // Unknown unsafe-to-copy chunks may depend on encoded image bytes.
        if(!(letters[3]&32))return null;
        allowTypeChange=false;
      }
    }
    chunks.push({type,start:at,end,data:bytes.subarray(at+8,at+8+length)});at=end;
  }
  if(!ended||!idatBytes)return null;
  const header=chunks[0].data,width=uint32(header,0),height=uint32(header,4),depth=header[8],colorType=header[9],channels=CHANNELS[colorType];
  if(!width||!height||width>32768||height>32768||depth!==8||!channels||header[10]||header[11]||header[12])return null;
  const stride=width*channels,rawLength=(stride+1)*height;if(rawLength>MAX_RAW)return null;
  return {chunks,width,height,colorType,channels,stride,rawLength,idatBytes,idatLength,allowTypeChange,allowGray};
}
function inflateExact(compressed,length){
  if(compressed.length<6)return null;
  const first=compressed[0],second=compressed[1];
  if((first&15)!==8||first>>>4>7||((first<<8)|second)%31||second&32)return null;
  const output=new Uint8Array(length);let written=0;
  const stream=new Unzlib((chunk)=>{if(written+chunk.length>length)throw new Error('PNG decoded length exceeds its header.');output.set(chunk,written);written+=chunk.length});
  // A small compressed push bounds temporary streaming output as well as our buffer.
  for(let at=0;at<compressed.length;at+=1024)stream.push(compressed.subarray(at,Math.min(at+1024,compressed.length)),at+1024>=compressed.length);
  // These fields belong to the pinned fflate 0.8.3 stream. Reject unfinished or extra streams.
  if(written!==length||!stream.s.f||stream.s.l||stream.p.length!==(stream.s.p?1:0))return null;
  return adler32(output)===uint32(compressed,compressed.length-4)?output:null;
}
function paeth(left,up,upperLeft){const prediction=left+up-upperLeft,a=Math.abs(prediction-left),b=Math.abs(prediction-up),c=Math.abs(prediction-upperLeft);return a<=b&&a<=c?left:b<=c?up:upperLeft}
function predictor(filter,left,up,upperLeft){return filter===0?0:filter===1?left:filter===2?up:filter===3?(left+up)>>>1:paeth(left,up,upperLeft)}
function unfilterInPlace(raw,stride,channels,height){
  for(let y=0;y<height;y++){
    const row=y*(stride+1),filter=raw[row];if(filter>4)return false;
    for(let x=0;x<stride;x++){
      const at=row+1+x,left=x>=channels?raw[at-channels]:0,up=y?raw[at-stride-1]:0,upperLeft=y&&x>=channels?raw[at-stride-1-channels]:0;
      raw[at]=(raw[at]+predictor(filter,left,up,upperLeft))&255;
    }
  }
  return true;
}
function convertedType(model,raw){
  if(!model.allowTypeChange)return model.colorType;
  const alpha=model.colorType===4||model.colorType===6;
  let opaque=alpha,gray=model.channels>=3&&model.allowGray;
  for(let y=0;y<model.height&&(opaque||gray);y++)for(let x=0,at=y*(model.stride+1)+1;x<model.width;x++,at+=model.channels){
    if(alpha&&raw[at+model.channels-1]!==255)opaque=false;
    if(model.channels>=3&&(raw[at]!==raw[at+1]||raw[at]!==raw[at+2]))gray=false;
  }
  if(model.colorType===0)return 0;
  if(model.colorType===4)return opaque?0:4;
  return gray?alpha&&!opaque?4:0:alpha&&!opaque?6:2;
}
function rowFor(raw,model,y,targetType,row){
  const source=y*(model.stride+1)+1,targetChannels=CHANNELS[targetType];
  if(model.colorType===targetType){row.set(raw.subarray(source,source+model.stride));return}
  for(let x=0;x<model.width;x++){
    const from=source+x*model.channels,to=x*targetChannels;row[to]=raw[from];
    if(targetType===2){row[to+1]=raw[from+1];row[to+2]=raw[from+2]}
    else if(targetType===4)row[to+1]=raw[from+model.channels-1];
  }
}
function filterRow(row,previous,channels,target,at){
  let best=0,bestScore=Infinity;
  for(let filter=0;filter<5;filter++){
    let score=0;
    for(let x=0;x<row.length;x++){
      const value=(row[x]-predictor(filter,x>=channels?row[x-channels]:0,previous[x],x>=channels?previous[x-channels]:0))&255;
      score+=value<128?value:256-value;if(score>=bestScore)break;
    }
    if(score<bestScore){bestScore=score;best=filter;if(!score)break}
  }
  target[at++]=best;
  for(let x=0;x<row.length;x++)target[at+x]=(row[x]-predictor(best,x>=channels?row[x-channels]:0,previous[x],x>=channels?previous[x-channels]:0))&255;
}
function filteredBytes(raw,model,colorType,workspace){
  const channels=CHANNELS[colorType],stride=model.width*channels;let row=new Uint8Array(stride),previous=new Uint8Array(stride);
  for(let y=0;y<model.height;y++){rowFor(raw,model,y,colorType,row);filterRow(row,previous,channels,workspace,y*(stride+1));[previous,row]=[row,previous]}
  return workspace.subarray(0,(stride+1)*model.height);
}
function chunk(type,data){
  const output=new Uint8Array(data.length+12),view=new DataView(output.buffer);view.setUint32(0,data.length);
  for(let at=0;at<4;at++)output[4+at]=type.charCodeAt(at);output.set(data,8);view.setUint32(output.length-4,crc32(output,4,output.length-4));return output;
}
function rebuild(bytes,model,payload,colorType){
  const header=new Uint8Array(model.chunks[0].data);header[9]=colorType;
  const parts=[bytes.subarray(0,8)];let added=false;
  for(const item of model.chunks){
    if(item.type==='IHDR')parts.push(colorType===model.colorType?bytes.subarray(item.start,item.end):chunk('IHDR',header));
    else if(item.type==='IDAT'){if(!added){parts.push(chunk('IDAT',payload));added=true}}
    else parts.push(bytes.subarray(item.start,item.end));
  }
  const output=new Uint8Array(parts.reduce((sum,part)=>sum+part.length,0));let at=0;for(const part of parts){output.set(part,at);at+=part.length}return output;
}

/** Zlib DEFLATE with the strongest fflate level; the caller compares whole-file sizes. */
export function compressDeflate(input){return zlibSync(bytesOf(input),{level:9})}

/** Return a smaller PNG with identical decoded RGBA, or the untouched original bytes. */
export function optimizePngLossless(input){
  const bytes=bytesOf(input);
  try{
    const model=parsePng(bytes);if(!model)return bytes;
    const compressed=new Uint8Array(model.idatBytes);let at=0;
    for(const item of model.chunks)if(item.type==='IDAT'){compressed.set(item.data,at);at+=item.data.length}
    const raw=inflateExact(compressed,model.rawLength);if(!raw)return bytes;
    let bestPayload=null,bestType=model.colorType,bestSize=bytes.length;
    const consider=(payload,colorType)=>{const size=bytes.length-model.idatLength+payload.length+12;if(size<bestSize){bestPayload=payload;bestType=colorType;bestSize=size}};
    consider(compressDeflate(raw),model.colorType);
    if(!unfilterInPlace(raw,model.stride,model.channels,model.height))return bytes;
    // Reuse one full scanline workspace for both original and reduced channel layouts.
    const workspace=new Uint8Array(model.rawLength);
    consider(compressDeflate(filteredBytes(raw,model,model.colorType,workspace)),model.colorType);
    const reduced=convertedType(model,raw);
    if(reduced!==model.colorType)consider(compressDeflate(filteredBytes(raw,model,reduced,workspace)),reduced);
    return bestPayload?rebuild(bytes,model,bestPayload,bestType):bytes;
  }catch{return bytes}
}
