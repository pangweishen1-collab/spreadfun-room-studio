// Local files only. No uploads or retained theme state.
export const FACE_IMPORT_LIMITS=Object.freeze({maxFiles:256,maxFileBytes:8*1024*1024,maxTotalBytes:48*1024*1024,maxDimension:4096,maxPixels:4*1024*1024,maxTotalPixels:16*1024*1024,decodeTimeoutMs:8000});
function issue(message,code,details={}){return Object.assign(Error(message),{code,...details});}
const optionalLabels={hero:'大图',zero:'主题面sz_0'};
function classify(file){
 const parts=String(file.webkitRelativePath||file.name||'').normalize('NFKC').replace(/\\/g,'/').split('/');
 if(parts.some(s=>s.startsWith('.')||s.toLowerCase()==='__macosx'))return null;
 const name=parts[parts.length-1].trim().toLowerCase();if(!name.endsWith('.png'))return null;
 const stem=name.slice(0,-4);let m;
 if((m=/^sz_([1-6])$/.exec(stem)))return {point:Number(m[1]),priority:0};
 if((m=/^(?:sz[ -]?|face[_ -]?)([1-6])$/.exec(stem)))return {point:Number(m[1]),priority:1};
 if((m=/^([1-6])$/.exec(stem)))return {point:Number(m[1]),priority:2};
 if(/^sz_?0$/.test(stem))return {point:'zero',priority:stem==='sz_0'?0:1};
 if(stem==='icon'||stem==='大骰子')return {point:'hero',priority:stem==='大骰子'?0:1};
 return {unknown:true};
}
export function selectFaceFiles(files){
 if(Number.isSafeInteger(files?.length)&&files.length>FACE_IMPORT_LIMITS.maxFiles)throw issue('文件数量超过256个，请只选择这一套骰子素材','too_many_files');
 const list=Array.from(files||[]);if(list.length>FACE_IMPORT_LIMITS.maxFiles)throw issue('文件数量超过256个，请只选择这一套骰子素材','too_many_files');
 const groups=new Map(),warnings=[];
 for(const file of list){
  if(!file||typeof file.name!=='string')throw issue('文件列表无效，请重新选择PNG','invalid_file');
  const kind=classify(file);if(!kind)continue;
  if(kind.unknown){warnings.push('已忽略未识别的PNG：'+file.name);continue;}
  const group=groups.get(kind.point)||[];group.push({file,...kind});groups.set(kind.point,group);
 }
 const chosen={};
 for(const [point,group]of groups){
  const priority=Math.min(...group.map(x=>x.priority)),best=group.filter(x=>x.priority===priority);
  if(optionalLabels[point]&&best.length!==1){warnings.push(optionalLabels[point]+'存在重复文件，已忽略该可选素材'+(point==='hero'?'；请补传大骰子.png':''));continue;}
  if(best.length!==1)throw issue((point==='hero'?'大图':'第'+point+'面')+'有重复文件：'+best.map(x=>x.file.name).join('、'),'duplicate_faces',{duplicates:best.map(x=>x.file.name)});
  chosen[point]=best[0].file;
  if(priority===2)warnings.push('已按数字文件名将'+best[0].file.name+'作为第'+point+'面；请确认它不是旧滚动角度图');
  for(const x of group)if(x!==best[0])warnings.push('已优先采用'+best[0].file.name+'，忽略较低优先级的'+x.file.name+(optionalLabels[point]?'':'（可能是旧角度图）'));
 }
 const missing=[1,2,3,4,5,6].filter(p=>!chosen[p]);
 if(missing.length)throw issue('缺少骰面：'+missing.map(p=>'sz_'+p+'.png').join('、'),'missing_faces',{missing});
 const faces=Object.fromEntries([1,2,3,4,5,6].map(p=>[p,chosen[p]])),selected=Object.values(faces);let bytes=0;
 for(const f of selected){
  if(!Number.isSafeInteger(f.size)||f.size<=0)throw issue('文件为空或无法读取：'+f.name,'empty_file');
  if(f.size>FACE_IMPORT_LIMITS.maxFileBytes)throw issue('单张PNG不能超过8 MiB：'+f.name,'file_too_large');bytes+=f.size;
 }
 if(bytes>FACE_IMPORT_LIMITS.maxTotalBytes)throw issue('所选PNG合计不能超过48 MiB','total_too_large');
 for(const key of ['hero','zero'])if(chosen[key]){
  const f=chosen[key];
  if(!Number.isSafeInteger(f.size)||f.size<=0||f.size>FACE_IMPORT_LIMITS.maxFileBytes||bytes+f.size>FACE_IMPORT_LIMITS.maxTotalBytes){
   warnings.push(optionalLabels[key]+'为空或超过读取限制，已忽略该可选素材'+(key==='hero'?'；请补传大骰子.png':''));delete chosen[key];
  }else bytes+=f.size;
 }
 return {faces,hero:chosen.hero||null,extras:chosen.zero?[chosen.zero]:[],warnings};
}
function aborted(){return Object.assign(issue('已取消素材读取','aborted'),{name:'AbortError'});}
function checkAbort(signal){if(signal?.aborted)throw aborted();}
function boundedRead(promise,signal){
 return new Promise((resolve,reject)=>{
  if(signal?.aborted){reject(aborted());return;}
  const done=(error,value)=>{clearTimeout(timer);signal?.removeEventListener('abort',cancel);error?reject(error):resolve(value);};
  const cancel=()=>done(aborted()),timer=setTimeout(()=>done(issue('PNG读取超时，请重新选择文件','decode_timeout')),FACE_IMPORT_LIMITS.decodeTimeoutMs);
  signal?.addEventListener('abort',cancel,{once:true});promise.then(value=>done(null,value),error=>done(error));
 });
}
async function pngHeader(file,signal){
 checkAbort(signal);let raw;
 try{raw=await file.slice(0,33).arrayBuffer();}catch{throw issue('无法读取PNG：'+file.name,'invalid_png');}
 checkAbort(signal);const b=new Uint8Array(raw),sig=[137,80,78,71,13,10,26,10];
 if(b.length<33||sig.some((v,i)=>b[i]!==v))throw issue('不是有效PNG：'+file.name,'invalid_png');
 const d=new DataView(raw),width=d.getUint32(16),height=d.getUint32(20);
 if(d.getUint32(8)!==13||String.fromCharCode(...b.slice(12,16))!=='IHDR'||!width||!height)throw issue('PNG尺寸头无效：'+file.name,'invalid_png');
 if(width>FACE_IMPORT_LIMITS.maxDimension||height>FACE_IMPORT_LIMITS.maxDimension||width*height>FACE_IMPORT_LIMITS.maxPixels)throw issue('PNG尺寸过大（单边最多4096、单张最多4MP）：'+file.name,'image_too_large');
 return {width,height};
}
function decodeImage(file,header,signal,urls,images){
 return new Promise((resolve,reject)=>{
  if(signal?.aborted){reject(aborted());return;}
  const image=new Image(),url=URL.createObjectURL(file);urls.add(url);images.add(image);let settled=false;
  const finish=(error)=>{
   if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',cancel);image.onload=image.onerror=null;
   if(error){image.src='';URL.revokeObjectURL(url);urls.delete(url);images.delete(image);reject(error);}else resolve(image);
  };
  const loaded=()=>{if(image.naturalWidth!==header.width||image.naturalHeight!==header.height){finish(issue('PNG解码尺寸不一致：'+file.name,'invalid_png'));return;}finish();};
  const cancel=()=>finish(aborted()),timer=setTimeout(()=>finish(issue('PNG解码超时，请换用较小文件：'+file.name,'decode_timeout')),FACE_IMPORT_LIMITS.decodeTimeoutMs);
  signal?.addEventListener('abort',cancel,{once:true});image.onload=loaded;image.onerror=()=>finish(issue('PNG损坏或无法解码：'+file.name,'invalid_png'));
  image.src=url;if(typeof image.decode==='function')image.decode().then(loaded,()=>finish(issue('PNG损坏或无法解码：'+file.name,'invalid_png')));
 });
}
export async function decodeFaceFiles(files,{signal}={}){
 checkAbort(signal);const selected=selectFaceFiles(files),entries=Object.entries(selected.faces);
 const headers=await boundedRead(Promise.all(entries.map(async([key,file])=>[key,await pngHeader(file,signal)])),signal);
 const facePixels=headers.reduce((n,[,h])=>n+h.width*h.height,0);
 if(facePixels>FACE_IMPORT_LIMITS.maxTotalPixels)throw issue('所选PNG解码总像素不能超过16MP','total_pixels_too_large');
 const optional={hero:selected.hero,zero:selected.extras[0]||null};let pixels=facePixels;
 for(const key of ['hero','zero'])if(optional[key]){
  try{
   const h=await boundedRead(pngHeader(optional[key],signal),signal);
   if(pixels+h.width*h.height>FACE_IMPORT_LIMITS.maxTotalPixels)throw issue(optionalLabels[key]+'超过剩余解码像素限制','total_pixels_too_large');
   pixels+=h.width*h.height;headers.push([key,h]);entries.push([key,optional[key]]);
  }catch(error){if(error.name==='AbortError')throw error;selected.warnings.push(optionalLabels[key]+'无法读取：'+error.message+'；已忽略该可选素材'+(key==='hero'?'；请补传大骰子.png':''));optional[key]=null;}
 }
 checkAbort(signal);const byKey=Object.fromEntries(headers),urls=new Set(),liveImages=new Set();let disposed=false;
 const dispose=()=>{if(disposed)return;disposed=true;for(const img of liveImages)img.src='';for(const u of urls)URL.revokeObjectURL(u);liveImages.clear();urls.clear();};
 const settled=await Promise.allSettled(entries.map(async([key,file])=>[key,await decodeImage(file,byKey[key],signal,urls,liveImages)]));
 if(signal?.aborted){dispose();throw aborted();}
 const failed=settled.find((x,i)=>!optionalLabels[entries[i][0]]&&x.status==='rejected');if(failed){dispose();throw failed.reason;}
 for(const key of ['hero','zero']){
  const i=entries.findIndex(([name])=>name===key);
  if(i>=0&&settled[i].status==='rejected'){selected.warnings.push(optionalLabels[key]+'解码失败，已忽略该可选素材'+(key==='hero'?'；请补传大骰子.png':''));optional[key]=null;}
 }
 const result=Object.fromEntries(settled.filter(x=>x.status==='fulfilled').map(x=>x.value));
 const extras=optional.zero?[optional.zero]:[],sources=[...Object.values(selected.faces),...(optional.hero?[optional.hero]:[]),...extras];
 return {images:Object.fromEntries([1,2,3,4,5,6].map(p=>[p,result[p]])),hero:optional.hero?result.hero:null,files:{faces:selected.faces,hero:optional.hero,extras},sources,warnings:selected.warnings,dispose};
}
