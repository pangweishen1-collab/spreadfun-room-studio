// Local image sequences. Compressed frames are retained; decoded bitmaps are
// short-lived and owned by the caller, never cached for the whole animation.
const MAX_BYTES=200*1024*1024,MAX_FRAMES=7200;
const extensions=/\.(png|webp|jpe?g)$/i;
const fail=(code,message)=>Object.assign(new Error(message),{code});
const abort=signal=>{if(signal?.aborted)throw fail('cancelled','转换已取消。');};
const ignored=name=>/(^|\/)(__MACOSX|\.[^/]*)(\/|$)/.test(name)||/(^|\/)Thumbs\.db$/i.test(name);
const natural=new Intl.Collator('en',{numeric:true,sensitivity:'base'});
function fpsCheck(fps){if(!Number.isInteger(fps)||fps<1||fps>60)throw fail('invalid','帧率须为 1–60 的整数。');return fps;}
function sizeCheck(width,height){if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1||width>4096||height>4096||width*height>8388608)throw fail('limits','序列帧最长边不能超过 4096px，单帧不能超过 800 万像素。');}
function imageType(name){const ext=name.split('.').pop().toLowerCase();return ext==='png'?'image/png':ext==='webp'?'image/webp':'image/jpeg';}
async function imageDimensions(file,name){
  // ponytail: cap header probing at 256 KiB; unusually large JPEG metadata must
  // be stripped before import instead of scanning an unbounded image header.
  const bytes=new Uint8Array(await file.slice(0,262144).arrayBuffer()),view=new DataView(bytes.buffer);let w=0,h=0;
  if(bytes.length>=24&&view.getUint32(0)===0x89504e47&&view.getUint32(4)===0x0d0a1a0a&&view.getUint32(12)===0x49484452){w=view.getUint32(16);h=view.getUint32(20);}
  else if(bytes.length>=30&&view.getUint32(0)===0x52494646&&view.getUint32(8)===0x57454250){
    const kind=view.getUint32(12);
    if(kind===0x56503858){w=1+bytes[24]+(bytes[25]<<8)+(bytes[26]<<16);h=1+bytes[27]+(bytes[28]<<8)+(bytes[29]<<16);}
    else if(kind===0x5650384c&&bytes[20]===0x2f){const bits=view.getUint32(21,true);w=(bits&0x3fff)+1;h=((bits>>>14)&0x3fff)+1;}
    else if(kind===0x56503820&&bytes[23]===0x9d&&bytes[24]===1&&bytes[25]===0x2a){w=view.getUint16(26,true)&0x3fff;h=view.getUint16(28,true)&0x3fff;}
  }else if(bytes.length>=4&&bytes[0]===0xff&&bytes[1]===0xd8){
    for(let p=2;p+3<bytes.length;){if(bytes[p++]!==0xff)break;while(bytes[p]===0xff)p++;const marker=bytes[p++];if(marker===0xd9||marker===0xda)break;if(marker===0x01||marker>=0xd0&&marker<=0xd7)continue;if(p+2>bytes.length)break;const length=view.getUint16(p);if(length<2||p+length>bytes.length)break;if([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)){if(length<8)break;h=view.getUint16(p+3);w=view.getUint16(p+5);break;}p+=length;}
  }
  if(!w||!h)throw fail('file','序列帧不是有效的 PNG、WebP 或 JPG：'+name);
  sizeCheck(w,h);return {width:w,height:h};
}
function zipDirectory(bytes){
  const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let e=-1;
  for(let p=bytes.length-22;p>=Math.max(0,bytes.length-65557);p--)if(v.getUint32(p,true)===0x06054b50&&p+22+v.getUint16(p+20,true)===bytes.length){e=p;break;}
  if(e<0||v.getUint16(e+4,true)||v.getUint16(e+6,true)||v.getUint16(e+8,true)!==v.getUint16(e+10,true))throw fail('file','请选择完整、非分卷的序列帧 ZIP。');
  const count=v.getUint16(e+10,true),size=v.getUint32(e+12,true),start=v.getUint32(e+16,true);
  if(count===65535||start===0xffffffff||size===0xffffffff||start+size!==e||count>12000)throw fail('limits','ZIP 帧数或目录超出本机处理范围。');
  let p=start,total=0;const names=[];
  for(let i=0;i<count;i++){
    if(p+46>e||v.getUint32(p,true)!==0x02014b50)throw fail('file','ZIP 目录损坏。');
    const flags=v.getUint16(p+8,true),method=v.getUint16(p+10,true),unpacked=v.getUint32(p+24,true),length=v.getUint16(p+28,true),extra=v.getUint16(p+30,true),comment=v.getUint16(p+32,true),next=p+46+length+extra+comment;
    if(next>e)throw fail('file','ZIP 目录损坏。');
    const name=new TextDecoder().decode(bytes.subarray(p+46,p+46+length)).replace(/\\/g,'/');
    if(extensions.test(name)&&!ignored(name)){
      if(flags&1||![0,8].includes(method))throw fail('file','不支持加密或特殊压缩格式的 ZIP。');
      if(unpacked===0xffffffff||unpacked<8||unpacked>MAX_BYTES)throw fail('limits','ZIP 中的图片体积无效。');
      if(name.split('/').includes('..')||name.startsWith('/'))throw fail('file','ZIP 中存在无效路径。');
      total+=unpacked;names.push({name,bytes:unpacked});if(total>MAX_BYTES||names.length>MAX_FRAMES)throw fail('limits','序列帧合计不能超过 200 MiB 或 7200 帧。');
    }
    p=next;
  }
  if(p!==e)throw fail('file','ZIP 目录长度无效。');
  return names;
}
async function inflateFrame(record,limit,signal){
  if(typeof record.internalStream!=='function')throw fail('unsupported','ZIP 组件不支持有界解压，请刷新后重试。');
  return new Promise((resolve,reject)=>{
    const chunks=[];let length=0,settled=false;const stream=record.internalStream('uint8array');
    const finish=error=>{if(settled)return;settled=true;signal?.removeEventListener('abort',cancel);if(error){stream.pause();chunks.length=0;reject(error);}else{const data=new Uint8Array(length);let offset=0;for(const chunk of chunks){data.set(chunk,offset);offset+=chunk.length;}resolve(data);}};
    const cancel=()=>finish(fail('cancelled','转换已取消。'));signal?.addEventListener('abort',cancel,{once:true});
    stream.on('data',chunk=>{if(settled)return;length+=chunk.length;if(length>limit){finish(fail('limits','ZIP 实际解压体积超过声明大小。'));return;}chunks.push(chunk);}).on('error',()=>finish(fail('file','ZIP 图片解压失败。'))).on('end',()=>finish());
    if(signal?.aborted)cancel();else stream.resume();
  });
}
export function sequenceMetadata(source,fps=24){
  fpsCheck(fps);
  if(!source||source.kind!=='image_sequence'||!Array.isArray(source.frames)||source.frameCount!==source.frames.length||source.frameCount<1||source.frameCount>MAX_FRAMES)throw fail('file','序列帧输入无效，请重新选择。');
  if(source.frames.some(frame=>!(frame.file instanceof Blob)||frame.file.size<8||!extensions.test(frame.name||''))||source.frames.reduce((sum,frame)=>sum+frame.file.size,0)>MAX_BYTES)throw fail('limits','序列帧文件或合计体积无效。');
  sizeCheck(source.width,source.height);const duration=source.frameCount/fps;if(duration>120)throw fail('limits','当前序列帧按所选帧率超过 120 秒，请提高帧率或减少帧数。');
  return {width:source.width,height:source.height,frameCount:source.frameCount,duration,fps,hasAudio:false,audioCodec:null,audioBitrate:0,codec:'image_sequence',nativeOpaqueSource:false};
}
export async function decodeSequenceFrame(source,index,{signal}={}){
  abort(signal);if(!Number.isSafeInteger(index)||index<0||index>=source.frameCount)throw fail('file','序列帧位置无效。');
  const frame=source.frames[index];let bitmap;
  try{bitmap=await createImageBitmap(frame.file);abort(signal);sizeCheck(bitmap.width,bitmap.height);if(bitmap.width!==source.width||bitmap.height!==source.height)throw fail('file','所有序列帧的宽高必须一致：'+frame.name);return bitmap;}
  catch(error){bitmap?.close();if(error.code)throw error;throw fail('decode','序列帧解码失败：'+frame.name);}
}
export async function inspectImageSequence(files,{fps=24,signal,Zip,onProgress=()=>{}}={}){
  fpsCheck(fps);abort(signal);files=Array.from(files||[]);if(!files.length)throw fail('file','请选择序列帧图片或一个 ZIP。');
  let frames=[],name='sequence',size=0,fromZip=false;
  if(files.length===1&&/\.zip$/i.test(files[0].name||'')){
    fromZip=true;const file=files[0];if(!(file instanceof Blob)||file.size<22||file.size>MAX_BYTES)throw fail('limits','ZIP 不能超过 200 MiB。');
    if(typeof Zip?.loadAsync!=='function')throw fail('unsupported','ZIP 组件未能加载，请重试。');
    const entries=zipDirectory(new Uint8Array(await file.arrayBuffer()));abort(signal);
    if(!entries.length)throw fail('file','ZIP 中没有 PNG、WebP 或 JPG 序列帧。');
    const zip=await Zip.loadAsync(file,{createFolders:false});abort(signal);name=file.name.replace(/\.zip$/i,'');
    for(let i=0;i<entries.length;i++){
      const entry=entries[i],record=zip.files[entry.name];if(!record||record.dir)throw fail('file','ZIP 中的序列帧目录不一致。');
      const data=await inflateFrame(record,entry.bytes,signal);abort(signal);if(data.length!==entry.bytes)throw fail('file','ZIP 中的图片长度无效。');
      size+=data.length;if(size>MAX_BYTES)throw fail('limits','解压后的序列帧不能超过 200 MiB。');
      frames.push({name:entry.name,file:new Blob([data],{type:imageType(entry.name)})});onProgress({phase:'loading',progress:.5*(i+1)/entries.length});
    }
  }else{
    if(files.some(file=>!(file instanceof Blob)||!extensions.test(file.name||'')||file.size<8))throw fail('file','序列帧仅支持 PNG、WebP、JPG 图片；ZIP 请单独上传。');
    frames=files.filter(file=>!ignored(file.webkitRelativePath||file.name)).map(file=>({name:file.webkitRelativePath||file.name,file}));
    size=frames.reduce((sum,frame)=>sum+frame.file.size,0);name=(frames[0]?.name.split('/').slice(-2,-1)[0]||frames[0]?.name.replace(/\.[^.]+$/,'')||'sequence');
  }
  if(!frames.length||frames.length>MAX_FRAMES||size>MAX_BYTES)throw fail('limits','序列帧合计不能超过 200 MiB 或 7200 帧。');
  frames.sort((a,b)=>natural.compare(a.name,b.name)||a.name.localeCompare(b.name));
  const seen=new Set();let dimensions;
  for(let i=0;i<frames.length;i++){
    abort(signal);const frame=frames[i],key=frame.name.normalize('NFC').toLowerCase();if(seen.has(key))throw fail('file','序列帧文件名重复：'+frame.name);seen.add(key);
    const shape=await imageDimensions(frame.file,frame.name);abort(signal);dimensions ||= shape;
    if(shape.width!==dimensions.width||shape.height!==dimensions.height)throw fail('file','所有序列帧的宽高必须一致：'+frame.name);
    onProgress({phase:'loading',progress:(fromZip?.5:0)+(fromZip?.5:1)*(i+1)/frames.length});
  }
  const source={kind:'image_sequence',name:name+'.sequence',size,frameCount:frames.length,...dimensions,frames};sequenceMetadata(source,fps);
  const first=await decodeSequenceFrame(source,0,{signal});first.close();return source;
}
