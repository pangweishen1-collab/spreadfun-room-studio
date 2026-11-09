// Upload-only browser sessions. Original PNG Blobs are never rewritten or uploaded.
import { VIDEO_SPEC } from './video-export.mjs?v=20261109-dice-hd2';
import {generateSixFaceRuntime} from './six-face/runtime.mjs';
import {SIX_FACE_MOTION_VERSION} from './six-face/spine-builder.mjs';
import {selectFaceFiles} from './six-face/import-faces.mjs';
import {PURPLE_GYRO_MOTION_VERSION} from './purple-gyro/motion.mjs';
import {generatePurpleReferenceRuntime,PURPLE_REFERENCE_MOTION_VERSION} from './purple-reference/runtime.mjs';
import {optimizeAtlasPng} from './atlas-png-optimizer.mjs';
export const SLOTS = ['大骰子', '1', '2', ...Array.from({length:7}, (_, i) => `sz_${i}`)];
export const GREEN_SLOTS = Array.from({length:6},(_,i)=>`sz_${i+1}`);
export const VIDEO_PROFILE = VIDEO_SPEC.profile;
const REGIONS = ['1', '2', 'anchor', ...Array.from({length:6}, (_, i) => `sz_${i+1}`)];
const SETTING_KEYS = ['name', 'grade', 'previewGrade', 'mode', 'point', 'composition', 'soundEnabled'];
const settingValue=(record,key)=>key==='soundEnabled'?record[key]!==false:key==='previewGrade'?(record.previewGrade||record.grade):record[key];
const MAX_PNG = 12 * 1024 * 1024;
const SOUND_NAMES=['dice_roll','sound_ui_dice6'];
const DEFAULT_AUDIO=Object.fromEntries(SOUND_NAMES.map(name=>[name,`/dice/assets/audio/${name}.mp3`]));
const DEFAULT_ANCHOR='/dice/assets/anchor.png';
const referenceRuntime=runtime=>runtime?.kind==='purple-reference';
const generatedRuntime=runtime=>runtime?.kind==='six-face'||runtime?.kind==='purple-gyro'||referenceRuntime(runtime);
const hasReferenceBinary=runtime=>runtime?.skel instanceof Blob&&runtime.skel.size>0;

export function resourceName(name,grade){
  const suffix=Array.from(String(name||'').normalize('NFKC').trim()
    .replace(/^(?:dice_(?:green|purple)_)+/i,'').replace(/\.(?:zip|skel|atlas|png|json)$/i,'')
    .toLowerCase().replace(/[^\p{L}\p{N}_-]+/gu,'_').replace(/^[_-]+|[_-]+$/g,''))
    .slice(0,48).join('').replace(/[_-]+$/,'');
  return 'dice_'+(grade==='purple'?'purple':'green')+'_'+(suffix||'custom');
}

export class PreviewError extends Error {
  constructor(message, status=400, details={}) {
    super(message); this.name='PreviewError'; this.status=status; this.payload={error:message, ...details};
  }
}

export function slotFor(name) {
  if(typeof name!=='string')return null;
  name=name.normalize('NFKC').trim();
  if (/[/\\]/.test(name) || !/\.png$/i.test(name)) return null;
  const stem=name.slice(0,-4).toLowerCase(), slot=stem==='icon'?'大骰子':stem;
  return SLOTS.includes(slot)?slot:null;
}

export function validateFiles(entries) {
  if (!Array.isArray(entries) || entries.length>30) throw new PreviewError('请上传完整的十张 PNG',400,{missing:SLOTS.map(s=>s+'.png'),extra:[],duplicates:[]});
  const groups=new Map(),mapped=new Map(), extra=[], duplicates=[];
  for (const entry of entries) {
    if (!entry || typeof entry.name!=='string') throw new PreviewError('上传文件信息不完整');
    const slot=slotFor(entry.name);
    if (!slot) extra.push(entry.name);
    else {const list=groups.get(slot)||[];list.push({...entry,slot});groups.set(slot,list);}
  }
  for(const [slot,list]of groups){
    const priority=entry=>entry.name.normalize('NFKC').trim().toLowerCase()==='大骰子.png'?0:1;
    const best=slot==='大骰子'?list.filter(entry=>priority(entry)===Math.min(...list.map(priority))):list;
    if(best.length>1)duplicates.push(slot+'.png');
    mapped.set(slot,best[0]);
  }
  const missing=SLOTS.filter(s=>!mapped.has(s)).map(s=>s+'.png');
  if (missing.length || extra.length || duplicates.length) {
    const pieces=[];
    if(missing.length) pieces.push('缺少：'+missing.join('、'));
    if(extra.length) pieces.push('多余：'+extra.join('、'));
    if(duplicates.length) pieces.push('重复：'+duplicates.join('、'));
    throw new PreviewError(pieces.join('；'),400,{missing,extra,duplicates});
  }
  return SLOTS.map(s=>mapped.get(s));
}

export function validateSettings(payload, previous={name:'骰子预览',grade:'green',mode:'all',point:1,composition:'auto',soundEnabled:true}) {
  if (!payload || typeof payload!=='object' || Array.isArray(payload)) throw new PreviewError('请求内容需要是对象');
  const result=Object.fromEntries(SETTING_KEYS.map(k=>[k,Object.hasOwn(payload,k)?payload[k]:k==='soundEnabled'?(previous[k]??true):k==='previewGrade'?(previous.previewGrade??payload.grade??previous.grade):previous[k]]));
  if(typeof result.name!=='string' || !result.name.trim() || result.name.trim().length>80) throw new PreviewError('请填写 1～80 字的预览名称');
  result.name=result.name.trim();
  if(!['green','purple'].includes(result.grade)) throw new PreviewError('请选择绿色或紫色等级背景');
  if(!['green','purple'].includes(result.previewGrade)) throw new PreviewError('请选择绿色或紫色预览背景');
  if(!['all','single','continuous'].includes(result.mode)) throw new PreviewError('预览模式需为 all、single 或 continuous');
  if(!Number.isInteger(result.point) || result.point<1 || result.point>6) throw new PreviewError('点数需为 1～6 的整数');
  if(!['auto','faces','digits'].includes(result.composition)) throw new PreviewError('素材类型需为 auto、faces 或 digits');
  if(typeof result.soundEnabled!=='boolean')throw new PreviewError('声音设置需要是布尔值');
  result.mode='all'; result.point=1;
  return result;
}

const CRC_TABLE=Array.from({length:256},(_,n)=>{for(let i=0;i<8;i++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
export function inspectPNG(bytes,slot,name=slot+'.png',{flexible=false}={}) {
  if (!(bytes instanceof Uint8Array) || !bytes.length || bytes.length>MAX_PNG) throw new PreviewError(`${name}：PNG 大小不合法`);
  if(![137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v)) throw new PreviewError(`${name}：需要有效 PNG`);
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  let offset=8, dimensions=null, data=false, end=false;
  while(offset+12<=bytes.length) {
    const length=view.getUint32(offset), stop=offset+12+length;
    if(stop>bytes.length) throw new PreviewError(`${name}：PNG 数据损坏`);
    const type=String.fromCharCode(...bytes.subarray(offset+4,offset+8));
    let crc=0xffffffff;
    for(let i=offset+4;i<offset+8+length;i++) crc=CRC_TABLE[(crc^bytes[i])&255]^(crc>>>8);
    if(((crc^0xffffffff)>>>0)!==view.getUint32(offset+8+length)) throw new PreviewError(`${name}：PNG 数据损坏`);
    if(offset===8 && (type!=='IHDR'||length!==13)) throw new PreviewError(`${name}：PNG 数据损坏`);
    if(type==='IHDR') {
      if(dimensions) throw new PreviewError(`${name}：PNG 数据损坏`);
      dimensions={width:view.getUint32(offset+8),height:view.getUint32(offset+12)};
    }
    if(type==='acTL') throw new PreviewError(`${name}：需要单帧 PNG`);
    if(type==='IDAT') data=true;
    if(type==='IEND') {end=length===0;break;}
    offset=stop;
  }
  if(!dimensions||!data||!end) throw new PreviewError(`${name}：PNG 数据损坏`);
  if(flexible){
    if(!dimensions.width||!dimensions.height||dimensions.width>4096||dimensions.height>4096||dimensions.width*dimensions.height>4*1024*1024)
      throw new PreviewError(`${name}：单边最多4096、单张最多4MP`);
    return dimensions;
  }
  const size=slot==='大骰子'?240:200;
  if(dimensions.width!==size||dimensions.height!==size) throw new PreviewError(`${name}：尺寸需为 ${size}×${size}`);
  return dimensions;
}

function decodeDataURL(data,name) {
  const prefix='data:image/png;base64,';
  if(typeof data!=='string'||!data.startsWith(prefix)) throw new PreviewError(`${name}：请选择有效 PNG`);
  const encoded=data.slice(prefix.length);
  if(encoded.length>Math.ceil(MAX_PNG/3)*4||encoded.length%4||!/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) throw new PreviewError(`${name}：PNG 数据损坏或超过 12 MB`);
  try {return Uint8Array.from(atob(encoded),c=>c.charCodeAt(0));}
  catch {throw new PreviewError(`${name}：PNG 数据损坏`);}
}

function importEntries(value) {
  const list=Array.isArray(value)?value:value instanceof Map?[...value].map(([name,file])=>({name,file})):
    value&&typeof value==='object'?Object.entries(value).map(([name,file])=>({name,file})):null;
  if(!list||list.length>30)throw new PreviewError('请选择这一套骰子的 PNG 与可选 MP3');
  return list.map(entry=>{
    if(entry instanceof Blob)return {name:entry.name,blob:entry};
    if(!entry||typeof entry!=='object')throw new PreviewError('上传文件信息不完整');
    const blob=entry.blob instanceof Blob?entry.blob:entry.file instanceof Blob?entry.file:null;
    const nested=entry.file&&typeof entry.file==='object'&&!(entry.file instanceof Blob)?entry.file:null;
    const name=blob?.name||nested?.name||entry.name;
    return {...(nested||entry),name,blob:blob||nested?.blob};
  });
}
export function validateSixFaceFiles(entries) {
  const anchors=entries.filter(entry=>String(entry?.name||'').normalize('NFKC').trim().toLowerCase()==='anchor.png');
  if(anchors.length>1)throw new PreviewError('重复：anchor.png');
  const candidates=entries.filter(entry=>!anchors.includes(entry)).map(entry=>{
    const blob=entry instanceof Blob?entry:entry?.blob||entry?.file;
    const encoded=typeof entry?.data==='string'?entry.data.split(',')[1]:null;
    const size=blob?.size??entry?.size??(encoded?Math.max(1,Math.floor(encoded.length*3/4)):0);
    return {name:entry?.name,size,webkitRelativePath:blob?.webkitRelativePath||entry?.webkitRelativePath||'',upload:entry};
  });
  let selected;
  try{selected=selectFaceFiles(candidates);}catch(error){throw new PreviewError(error.message,400,
    {code:error.code,missing:error.missing?.map(point=>'sz_'+point+'.png'),duplicates:error.duplicates,required:GREEN_SLOTS.map(slot=>slot+'.png')});}
  const upload=(file,slot)=>{const entry=file.upload||file;return {...entry,name:entry.name,...(entry instanceof Blob?{blob:entry}:{}),slot};};
  const result=Object.entries(selected.faces).map(([point,file])=>upload(file,'sz_'+point));
  if(selected.hero)result.push(upload(selected.hero,'大骰子'));
  if(selected.extras[0])result.push(upload(selected.extras[0],'sz_0'));
  if(anchors[0])result.push(upload(anchors[0],'anchor'));
  Object.defineProperty(result,'warnings',{value:selected.warnings});
  return result;
}
export function validatePurpleFiles(entries) {
  const normalized=entry=>String(entry?.name||'').normalize('NFKC').trim().toLowerCase();
  const canonical=new Set(entries.flatMap(entry=>{
    const match=/^(?:sz[_ -]?|face[_ -]?)([12])\.png$/.exec(normalized(entry));return match?[match[1]]:[];
  }));
  // Old folders use 1/2 for angle art. Keep them as source extras when a
  // canonical face for that point exists; bare 1..6 can still be face aliases.
  const angles=entries.filter(entry=>{const match=/^([12])\.png$/.exec(normalized(entry));return match&&canonical.has(match[1]);});
  const result=validateSixFaceFiles(entries.filter(entry=>!angles.includes(entry)));
  for(const slot of ['1','2']){
    const matches=angles.filter(entry=>normalized(entry)===slot+'.png');
    if(matches.length>1)throw new PreviewError('重复：'+slot+'.png',400,{duplicates:[slot+'.png']});
    if(matches[0]){const entry=matches[0];result.push({...entry,name:entry.name,...(entry instanceof Blob?{blob:entry}:{}),slot});}
  }
  return result;
}
async function originalBlob(entry,audio=false) {
  if(entry.blob instanceof Blob)return entry.blob;
  if(audio){
    const match=/^data:audio\/(?:mpeg|mp3);base64,([A-Za-z0-9+/]*={0,2})$/.exec(entry.data||'');
    if(!match||match[1].length>12*1024*1024)throw new PreviewError(`${entry.name}：请选择有效 MP3`);
    try{return new Blob([Uint8Array.from(atob(match[1]),c=>c.charCodeAt(0))],{type:'audio/mpeg'});}catch{throw new PreviewError(`${entry.name}：MP3 无法读取`);}
  }
  return new Blob([decodeDataURL(entry.data,entry.name)],{type:'image/png'});
}

export function detectComposition(files,requested='auto') {
  if(!files.some(file=>file.slot==='sz_0')){
    if(requested==='digits')throw new PreviewError('分离点数素材需要 sz_0.png 底图');
    return {resolvedComposition:'faces',compositionDetection:{method:'six_faces_without_sz_0',detected:'faces',ratios:{}}};
  }
  const faces=files.filter(file=>/^sz_[0-6]$/.test(file.slot));
  const sized=faces.every(file=>Number.isFinite(file.width)&&file.width>0&&Number.isFinite(file.height)&&file.height>0);
  // Match prepareFaces' square contain normalization before comparing opacity.
  // Keep dimensionless legacy records/tests in their original shared units.
  const areas=Object.fromEntries(faces.map(file=>[file.slot,file.alphaArea/(sized?Math.max(file.width,file.height)**2:1)]));
  const ratios=Array.from({length:6},(_,i)=>areas[`sz_${i+1}`]/Math.max(Number.EPSILON,areas.sz_0));
  const sorted=[...ratios].sort((a,b)=>a-b);
  const detected=(sorted[2]+sorted[3])/2<.6&&Math.max(...ratios)<.85?'digits':'faces';
  return {resolvedComposition:requested==='auto'?detected:requested,
    compositionDetection:{method:'alpha_area_relative_to_sz_0',detected,ratios:Object.fromEntries(ratios.map((v,i)=>[String(i+1),Number(v.toFixed(4))]))}};
}

export function atlasText() {
  const lines=['preview.png','size: 612, 612','format: RGBA8888','filter: Linear, Linear','repeat: none','pma: false'];
  REGIONS.forEach((name,i)=>{const size=name==='anchor'?30:200;lines.push(name,`  bounds: ${(i%3)*204+2}, ${Math.floor(i/3)*204+2}, ${size}, ${size}`,`  offsets: 0, 0, ${size}, ${size}`,'  rotate: 0');});
  return lines.join('\n')+'\n';
}

function canvas(width,height) {
  const value=typeof OffscreenCanvas==='function'?new OffscreenCanvas(width,height):Object.assign(document.createElement('canvas'),{width,height});
  return value;
}
async function canvasBlob(value) {
  if(value.convertToBlob) return value.convertToBlob({type:'image/png'});
  return new Promise((resolve,reject)=>value.toBlob(b=>b?resolve(b):reject(new PreviewError('预览图集生成失败')),'image/png'));
}
async function decodePNG(blob,name,{allowEmpty=false}={}) {
  let drawable, cleanup=()=>{};
  try {
    if(typeof createImageBitmap==='function') {drawable=await createImageBitmap(blob);cleanup=()=>drawable.close();}
    else {
      const url=URL.createObjectURL(blob);drawable=new Image();
      try {await new Promise((resolve,reject)=>{drawable.onload=resolve;drawable.onerror=reject;drawable.src=url;});}
      finally {URL.revokeObjectURL(url);}
    }
    const value=canvas(drawable.width,drawable.height),ctx=value.getContext('2d',{willReadFrequently:true});
    ctx.drawImage(drawable,0,0);
    const pixels=ctx.getImageData(0,0,value.width,value.height).data;
    let alphaArea=0,visible=false;
    for(let i=3;i<pixels.length;i+=4) {if(pixels[i])visible=true;if(pixels[i]>=16)alphaArea++;}
    if(!visible&&!allowEmpty) throw new PreviewError(`${name}：图片没有可见内容`);
    return {drawable,alphaArea,close:cleanup};
  } catch(error) {cleanup();if(error instanceof PreviewError)throw error;throw new PreviewError(`${name}：PNG 读取失败`);}
}
async function renderRuntime(files,composition,decode) {
  const images=new Map(),value=canvas(612,612),ctx=value.getContext('2d');
  ctx.imageSmoothingEnabled=false;
  try {
    for(const file of files) if(file.slot!=='大骰子') images.set(file.slot,await decode(file.blob,file.name));
    REGIONS.forEach((name,i)=>{
      if(name==='anchor') return; // Original template's anchor is invisible; retain its 30px region and pivot.
      const x=(i%3)*204+2,y=Math.floor(i/3)*204+2;
      if(composition==='digits'&&name.startsWith('sz_')) ctx.drawImage(images.get('sz_0').drawable,x,y);
      ctx.drawImage(images.get(name).drawable,x,y);
    });
    return {texture:await canvasBlob(value),atlasText:atlasText()};
  } finally {for(const image of images.values())image.close?.();}
}

function createSessionStorage() {
  const records=new Map();
  return {
    async get(id) {return records.get(id);},
    async put(record,expected=null) {
      const before=records.get(record.id);
      if(expected===null?Boolean(before):!before||before.revision!==expected.revision||before.candidateId!==expected.candidateId)
        throw new PreviewError('预览已更新，请刷新后重试',409);
      records.set(record.id,record);
    },
    delete(id) {records.delete(id);}
  };
}

export function clearLegacyPreviewHistory() {
  // The old database held only transient dice previews. Storage access may be blocked in an iframe.
  try {globalThis.indexedDB?.deleteDatabase('fun-toolkit-dice-preview');} catch {}
}

function validVideo(video,record) {
  const {maxBytes,profile,duration,fps,frameCount,width,height}=VIDEO_SPEC;
  return video?.blob instanceof Blob&&video.blob.size>0&&video.blob.size<=maxBytes&&video.profile===profile&&
    video.duration===duration&&video.fps===fps&&video.frameCount===frameCount&&video.width===width&&video.height===height&&
    video.revision===record.revision&&video.candidate===record.candidateId;
}
async function sha256(blob,bytes) {return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes||await blob.arrayBuffer()))].map(v=>v.toString(16).padStart(2,'0')).join('');}
let zipLoading;
async function zipFactory() {
  if(!globalThis.JSZip) {
    if(!zipLoading) zipLoading=new Promise((resolve,reject)=>{
      const script=document.createElement('script');script.src=new URL('../vendor/jszip-3.10.1.min.js',import.meta.url).href;
      script.onload=resolve;script.onerror=()=>{zipLoading=null;script.remove();reject(new PreviewError('本地打包组件加载失败，请重试'));};document.head.append(script);
    });
    await zipLoading;
  }
  if(!globalThis.JSZip) throw new PreviewError('本地打包组件加载失败，请重试');
  return new globalThis.JSZip();
}

export function createLocalPreview(dependencies={}) {
  const storage=dependencies.storage||createSessionStorage();
  const decode=dependencies.decodePNG||decodePNG;
  const render=dependencies.renderRuntime||((files,composition)=>renderRuntime(files,composition,decode));
  const renderSix=dependencies.renderSixFace||generateSixFaceRuntime;
  const renderReference=dependencies.renderPurpleReference||generatePurpleReferenceRuntime;
  const renderPurpleRuntime=dependencies.renderPurpleGyro||renderReference;
  const purpleVersion=dependencies.renderPurpleGyro?PURPLE_GYRO_MOTION_VERSION:PURPLE_REFERENCE_MOTION_VERSION;
  const purpleKind=dependencies.renderPurpleGyro?'purple-gyro':'purple-reference';
  const hash=dependencies.hash||sha256, uuid=dependencies.uuid||(()=>crypto.randomUUID().replaceAll('-',''));
  const objectURL=dependencies.createObjectURL||(blob=>URL.createObjectURL(blob));
  const revoke=dependencies.revokeObjectURL||(url=>URL.revokeObjectURL(url));
  const urls=new Map();
  const defaultAssets=new Map();
  function url(key,blob) {if(!urls.has(key))urls.set(key,objectURL(blob));return urls.get(key);}
  function audioURLs(record){return Object.fromEntries(SOUND_NAMES.map(name=>[name,record.audio?.[name]?.blob?
    url(`${record.id}/audio/${name}/${record.audio[name].sha256}`,record.audio[name].blob):DEFAULT_AUDIO[name]]));}
  async function defaultAsset(path){
    if(!defaultAssets.has(path))defaultAssets.set(path,(async()=>{
      if(dependencies.fetchAsset)return dependencies.fetchAsset(path);
      const response=await fetch(path);if(!response.ok)throw new PreviewError('默认交付素材读取失败，请重试');return response.blob();
    })().catch(error=>{defaultAssets.delete(path);throw error;}));
    const blob=await defaultAssets.get(path);if(!(blob instanceof Blob)||!blob.size)throw new PreviewError('默认交付素材为空');return blob;
  }
  async function renderGreen(files,options={}){
    const anchor=files.find(file=>file.slot==='anchor');
    const image=await decode(anchor?.blob||await defaultAsset(DEFAULT_ANCHOR),'anchor.png',{allowEmpty:true});
    try{return await renderSix(files,{...options,anchorImage:image.drawable});}
    finally{image.close?.();}
  }
  async function renderPurple(files,options={}){
    const anchor=files.find(file=>file.slot==='anchor');
    const image=await decode(anchor?.blob||await defaultAsset(DEFAULT_ANCHOR),'anchor.png',{allowEmpty:true});
    try{
      const runtime=await renderPurpleRuntime(files,{...options,anchorImage:image.drawable});
      if(runtime?.kind!==purpleKind||!runtime?.texture||!runtime?.atlasText||
          (referenceRuntime(runtime)?!hasReferenceBinary(runtime):!runtime?.json)){
        throw new PreviewError('紫色动画资源生成不完整');
      }
      return runtime;
    }
    finally{image.close?.();}
  }
  async function renderNative(record,options={}){
    if(record.grade!=='purple')return renderGreen(record.files,{name:record.name,...options});
    const runtime=await renderPurple(record.files,{name:record.name,composition:record.resolvedComposition,...options});
    if(referenceRuntime(runtime))runtime.assetRevision=record.revision;
    return runtime;
  }
  async function resolveComposition(files,requested){
    if(!files.some(file=>file.slot==='sz_0'))return detectComposition(files,requested);
    const missing=files.filter(file=>/^sz_[0-6]$/.test(file.slot)&&!Number.isFinite(file.alphaArea));
    if(requested!=='auto'&&missing.length)return {resolvedComposition:requested,compositionDetection:{method:'explicit_'+requested,detected:requested,ratios:{}}};
    for(const file of missing){
      const image=await decode(file.blob,file.name);
      try{file.alphaArea=image.alphaArea;}finally{image.close?.();}
    }
    return detectComposition(files,requested);
  }
  async function read(id) {
    const record=await storage.get(id);
    if(!record)throw new PreviewError('预览会话不存在',404);
    const anchor=record.runtime.metadata?.anchor;
    const migrateAnchor=generatedRuntime(record.runtime)&&!(anchor?.bone==='root'&&anchor.scaleX===6&&anchor.scaleY===6&&anchor.opacity===0);
    const migrateMotion=record.grade==='purple'
      ?record.runtime.kind!==purpleKind||record.runtime.metadata?.motionVersion!==purpleVersion||
        (referenceRuntime(record.runtime)&&!hasReferenceBinary(record.runtime))
      :record.runtime.kind==='six-face'&&record.runtime.metadata?.motionVersion!==SIX_FACE_MOTION_VERSION;
    if(record.mode==='all' && record.point===1&&!migrateAnchor&&!migrateMotion)return record;
    const migrated={...record,mode:'all',point:1,revision:record.revision+1,candidateId:uuid()};
    if(migrateAnchor||migrateMotion){
      migrated.runtime=await renderNative(migrated);
      migrated.runtime.warnings=[...new Set([...(record.runtime.warnings||[]),...(migrated.runtime.warnings||[])])];
    }
    // Uploaded PNGs and old video Blobs remain stored; binding/profile hides old output.
    await storage.put(migrated,{revision:record.revision,candidateId:record.candidateId});
    return migrated;
  }
  function publicSession(record) {
    const files=record.files.map(({blob,alphaArea,...file})=>({...file,url:url(`${record.id}/file/${file.slot}/${file.sha256||record.revision}`,blob)}));
    const audio=audioURLs(record),audioFiles=Object.fromEntries(SOUND_NAMES.map(name=>{const item=record.audio?.[name];return [name,{name:item?.name||name+'.mp3',size:item?.blob?.size??null,sha256:item?.sha256||null,url:audio[name],default:!item?.blob}];}));
    const anchor=record.anchor?{...Object.fromEntries(Object.entries(record.anchor).filter(([k])=>k!=='blob'&&k!=='alphaArea')),url:url(`${record.id}/file/anchor/${record.anchor.sha256||record.revision}`,record.anchor.blob)}:
      {name:'anchor.png',url:DEFAULT_ANCHOR,default:true,hidden:true};
    anchor.hidden=true;
    const generated=generatedRuntime(record.runtime),reference=referenceRuntime(record.runtime),png=Object.fromEntries(files.map(f=>[f.slot,f.url]));
    const runtimeKey=generated?(record.runtime.kind+'/'+(record.runtime.metadata?.motionVersion||'legacy')+
      (record.grade==='purple'?'/'+record.resolvedComposition:'')+
      (reference?'/'+(record.runtime.assetRevision??1):'')):record.resolvedComposition;
    const icon=png['大骰子']||null;png.anchor??=anchor.url;
    const skeleton=reference
      ?{skel:url(`${record.id}/runtime/${runtimeKey}/skel`,record.runtime.skel)}
      :generated?{json:record.runtime.json,geometry:record.runtime.geometry}
        :{skel:dependencies.templateURL||'/dice/assets/template.skel'};
    const candidate={id:record.candidateId,version:record.revision,name:record.name,template:record.grade,previewGrade:settingValue(record,'previewGrade'),
      kind:generated?record.runtime.kind:'template',...skeleton,...(generated?{warnings:record.runtime.warnings||[]}:{}),
      atlasPage:record.runtime.atlasPage||'preview.png',
      atlas:url(`${record.id}/runtime/${runtimeKey}/atlas`,new Blob([record.runtime.atlasText],{type:'text/plain'})),
      texture:url(`${record.id}/runtime/${runtimeKey}/texture`,record.runtime.texture),png,icon,anchor,audio,soundEnabled:record.soundEnabled!==false};
    let video=null;
    if(validVideo(record.video,record)) {const {blob,...metadata}=record.video;video={...metadata,url:url(`${record.id}/video/${metadata.sha256}`,blob)};}
    const videoAvailable=dependencies.videoAvailable??Boolean(globalThis.VideoEncoder||globalThis.MediaRecorder);
    return {id:record.id,revision:record.revision,resourceName:resourceName(record.name,record.grade),...Object.fromEntries(SETTING_KEYS.map(k=>[k,settingValue(record,k)])),
      created:record.created,files,candidate,video,videoAvailable,videoUnavailableReason:videoAvailable?null:'当前浏览器不支持视频导出，请使用 Chrome',
      resolvedComposition:record.resolvedComposition,compositionDetection:record.compositionDetection,
      kind:candidate.kind,warnings:record.runtime.warnings||[],anchor,audio:audioFiles,audioURLs:audio,
      heroMissing:!icon,needsUpload:record.grade==='green'&&record.runtime.kind!=='six-face'};
  }
  async function importSession(payload,{signal}={}) {
    const aborted=()=>{if(signal?.aborted)throw new DOMException('操作已取消','AbortError');};aborted();
    const settings=validateSettings(payload),input=importEntries(payload.files),files=[],audio={};
    if(payload.audio)for(const [name,value]of Object.entries(payload.audio))input.push({name:name+'.mp3',blob:value instanceof Blob?value:value?.blob||value?.file,data:value?.data});
    const audioEntries=[],pngEntries=[];
    for(const entry of input){
      const name=String(entry.name||''),match=/^(dice_roll|sound_ui_dice6)\.mp3$/i.exec(name);
      if(match)audioEntries.push({...entry,sound:match[1].toLowerCase()});else pngEntries.push(entry);
    }
    const anchors=pngEntries.filter(entry=>/^anchor\.png$/i.test(entry.name||''));
    if(anchors.length>1)throw new PreviewError('重复：anchor.png');
    const entries=settings.grade==='green'?validateSixFaceFiles(pngEntries):validatePurpleFiles(pngEntries);
    const importWarnings=[...(entries.warnings||[])];
    if(settings.grade==='green'&&settings.composition==='digits')throw new PreviewError('绿色六面需要完整骰面，请选择 faces 或 auto');
    const needsFaceAlpha=settings.grade==='purple'&&settings.composition==='auto'&&entries.some(entry=>entry.slot==='sz_0');
    const inspect=async entry=>{
      const blob=await originalBlob(entry);
      if(!blob.size||blob.size>MAX_PNG)throw new PreviewError(`${entry.name}：PNG 大小不合法`);
      const bytes=new Uint8Array(await blob.arrayBuffer());
      aborted();
      const dimensions=inspectPNG(bytes,entry.slot,entry.name,{flexible:true});
      let alphaArea=settings.grade==='purple'&&GREEN_SLOTS.includes(entry.slot)?null:0;
      // Explicit full faces are decoded and validated by the native generator.
      // Only automatic composition with a base needs a second alpha-area read.
      if(!GREEN_SLOTS.includes(entry.slot)||needsFaceAlpha){
        const image=await decode(blob,entry.name,{allowEmpty:entry.slot==='anchor'});try{alphaArea=image.alphaArea;}finally{image.close?.();}
      }
      aborted();
      return {name:entry.name,slot:entry.slot,blob,...dimensions,alphaArea,sha256:await hash(blob,bytes)};
    };
    let totalBytes=0;
    // Keep pending buffers bounded and apply the total size limit in source order.
    for(let offset=0;offset<entries.length;offset+=3) {
      aborted();
      const batch=entries.slice(offset,offset+3);
      const results=await Promise.allSettled(batch.map(inspect));
      aborted();
      for(const [index,result] of results.entries()){
        const entry=batch[index];
        try{
          if(result.status==='rejected')throw result.reason;
          const file=result.value;
          if(totalBytes+file.blob.size>48*1024*1024)throw new PreviewError('所选 PNG 合计不能超过48 MiB');
          files.push(file);
          totalBytes+=file.blob.size;
        }catch(error){
          const optional=['大骰子','sz_0','1','2'].includes(entry.slot)&&!(settings.grade==='purple'&&settings.composition==='digits'&&entry.slot==='sz_0');
          if(!optional||error.name==='AbortError')throw error;
          importWarnings.push(`${entry.name}：${error.message||'可选素材无法读取'}；已忽略${entry.slot==='大骰子'?'并使用主题面或第1面作为封面':''}`);
        }
      }
    }
    for(const entry of audioEntries){
      aborted();
      if(audio[entry.sound])throw new PreviewError('重复：'+entry.sound+'.mp3');
      const blob=await originalBlob(entry,true);if(!blob.size||blob.size>8*1024*1024)throw new PreviewError(entry.name+'：MP3 需在8 MiB以内');
      const head=new Uint8Array(await blob.slice(0,10).arrayBuffer());
      if(!(head[0]===73&&head[1]===68&&head[2]===51)&&!(head[0]===255&&(head[1]&224)===224))throw new PreviewError(entry.name+'：需要有效 MP3');
      audio[entry.sound]={name:entry.name,blob,size:blob.size,sha256:await hash(blob)};
    }
    const detection=settings.grade==='green'?{resolvedComposition:'faces',compositionDetection:{method:'six_original_flat_faces',detected:'faces'}}:await resolveComposition(files,settings.composition);
    const record={id:uuid(),candidateId:uuid(),revision:1,...settings,...detection,files,audio,anchor:files.find(file=>file.slot==='anchor')||null,video:null,created:Math.floor(Date.now()/1000)};
    try{record.runtime=await renderNative(record,{signal});}
    catch(error){throw error instanceof PreviewError||error.name==='AbortError'?error:new PreviewError(error.message||'六面资源生成失败');}
    if(!record.runtime?.texture||!record.runtime?.atlasText||
        (referenceRuntime(record.runtime)?!hasReferenceBinary(record.runtime):!record.runtime?.json))throw new PreviewError('六面资源生成不完整');
    record.runtime.warnings=[...importWarnings,...(record.runtime.warnings||[])];
    aborted();
    await storage.put(record);
    return publicSession(record);
  }
  async function settings(id,payload) {
    const record=await read(id);
    if(!payload||!Number.isInteger(payload.expectedRevision)||payload.expectedRevision!==record.revision)throw new PreviewError('预览已更新，请刷新后重试',409);
    const settings=validateSettings(payload,record);
    if(settings.grade!==record.grade)throw new PreviewError(settings.grade==='green'?'绿色等级需要上传六张完整骰面':'紫色等级需要上传六张完整骰面',409,
      {needsUpload:true,grade:settings.grade,required:GREEN_SLOTS.map(slot=>slot+'.png')});
    if(record.runtime.kind==='six-face'&&settings.composition==='digits')throw new PreviewError('绿色六面需要完整骰面，请选择 faces 或 auto');
    if(SETTING_KEYS.every(k=>settings[k]===settingValue(record,k)))return publicSession(record);
    const detection=record.runtime.kind==='six-face'?{resolvedComposition:'faces',compositionDetection:record.compositionDetection}:await resolveComposition(record.files,settings.composition);
    const next={...record,...settings,revision:record.revision+1,candidateId:uuid(),...detection};
    if(next.resolvedComposition!==record.resolvedComposition)next.runtime=generatedRuntime(record.runtime)
      ?await renderNative(next):await render(next.files,next.resolvedComposition);
    await storage.put(next,{revision:record.revision,candidateId:record.candidateId});
    return publicSession(next);
  }
  async function updateHero(id,payload) {
    const record=await read(id);
    if(!payload||!Number.isInteger(payload.expectedRevision)||payload.expectedRevision!==record.revision)throw new PreviewError('预览已更新，请刷新后重试',409);
    const file=payload.file;
    if(typeof File!=='function'||!(file instanceof File))throw new PreviewError('请选择大骰子.png或icon.png原文件');
    const name=file.name.normalize('NFKC').trim().toLowerCase();
    if(!['大骰子.png','icon.png'].includes(name))throw new PreviewError('大图文件名需为大骰子.png或icon.png');
    if(!file.size||file.size>MAX_PNG)throw new PreviewError('大图PNG为空或超过12 MiB');
    if(record.files.filter(item=>item.slot!=='大骰子').reduce((sum,item)=>sum+item.blob.size,0)+file.size>48*1024*1024)throw new PreviewError('所选 PNG 合计不能超过48 MiB');
    const bytes=new Uint8Array(await file.arrayBuffer()),dimensions=inspectPNG(bytes,'大骰子',file.name);
    const image=await decode(file,file.name);let alphaArea;
    try{alphaArea=image.alphaArea;if(!(alphaArea>0))throw new PreviewError('大图PNG没有清晰可见的内容');}finally{image.close?.();}
    const replacement={name:file.name,slot:'大骰子',blob:file,...dimensions,alphaArea,sha256:await hash(file,bytes)};
    const next={...record,files:[...record.files.filter(item=>item.slot!=='大骰子'),replacement],revision:record.revision+1,candidateId:uuid()};
    await storage.put(next,{revision:record.revision,candidateId:record.candidateId});
    return publicSession(next);
  }
  async function video(id,options) {
    const record=await read(id),headers=new Headers(options.headers),revision=Number(headers.get('X-Preview-Revision'));
    if(!Number.isInteger(revision)||revision!==record.revision||headers.get('X-Candidate-Id')!==record.candidateId)throw new PreviewError('预览已更新，请重新录制当前版本',409);
    if(!(options.body instanceof Blob)||!options.body.size||options.body.size>90*1024*1024)throw new PreviewError('视频大小不合法');
    const started=performance.now(),module=dependencies.prepareVideo?null:await import('./video-export.mjs?v=20261109-dice-hd2');
    const blob=await (dependencies.prepareVideo||module.prepareVideo)(options.body,{audio:audioURLs(record),soundEnabled:record.soundEnabled!==false});
    if(!(blob instanceof Blob)||!blob.size)throw new PreviewError('视频校验失败，请重新导出');
    const {maxBytes,profile,width,height,duration,fps,frameCount}=VIDEO_SPEC;
    if(blob.size>maxBytes)throw new PreviewError(`视频超过 ${maxBytes/1_000_000} MB，请重新生成`);
    const info=blob.videoInfo||(module?.inspectVideo?await module.inspectVideo(blob):null);
    if(!info||info.width!==width||info.height!==height||Math.abs(info.duration-duration)>.02||Math.abs(info.fps-fps)>.01||info.frameCount!==frameCount)
      throw new PreviewError(`视频规格需为 ${duration} 秒、${fps} 帧/秒、${width}×${height}，共 ${frameCount} 帧`);
    const stored={blob,profile,width,height,duration,fps,frameCount,
      revision,candidate:record.candidateId,sha256:await hash(blob),fileName:'preview.mp4',size:blob.size,
      method:info.method||'browser_mp4',processingMs:Math.round(performance.now()-started)};
    await storage.put({...record,video:stored},{revision,candidateId:record.candidateId});
    return publicSession({...record,video:stored}).video;
  }
  async function bundle(id) {
    const record=await read(id),zip=await (dependencies.zipFactory||zipFactory)();
    const name=resourceName(record.name,record.grade);
    const add=(path,content)=>zip.file(name+'/'+path,content);
    // Only game runtime files, canonical source PNGs and the two audio files.
    for(const file of record.files)if(file.slot!=='anchor')
      add('res/'+(file.slot==='大骰子'?'icon':file.slot)+'.png',file.blob);
    let skeleton;
    if(referenceRuntime(record.runtime)){
      skeleton=record.runtime.skel;
    }else if(generatedRuntime(record.runtime)){
      const {writeSpineBinary}=await import('./six-face/spine-binary.mjs');
      const json=structuredClone(record.runtime.json);
      json.skeleton.images='./res/';json.skeleton.audio='./sound/';
      skeleton=writeSpineBinary(json);
    }else{
      const {patchTemplateSounds}=await import('./template-sounds.mjs');
      const original=await defaultAsset(dependencies.templateURL||'/dice/assets/template.skel');
      skeleton=await patchTemplateSounds(new Uint8Array(await original.arrayBuffer()));
    }
    add(name+'.skel',skeleton instanceof Blob?skeleton:new Blob([skeleton],{type:'application/octet-stream'}));
    add(name+'.atlas',record.runtime.atlasText.replace(/^[^\r\n]+/,name+'.png'));
    const isGreen = record.grade === 'green';
    const losslessLevel = isGreen ? 2 : 3;
    const paletteLimit = isGreen ? 256 : 192;
    const texture = await optimizeAtlasPng(record.runtime.texture, losslessLevel, paletteLimit);
    add(name+'.png',texture);
    for(const sound of SOUND_NAMES)
      add('sound/'+sound+'.mp3',record.audio?.[sound]?.blob||await defaultAsset(DEFAULT_AUDIO[sound]));
    const blob=await zip.generateAsync({type:'blob',compression:'DEFLATE',compressionOptions:{level:6}}),latest=await read(id);
    if(latest.revision!==record.revision||latest.candidateId!==record.candidateId)
      throw new PreviewError('打包期间预览已更新，请重新打包',409);
    return {name,url:url(id+'/bundle/compact-v1/'+record.revision,blob)};
  }
  async function api(path,options={}) {
    const method=(options.method||'GET').toUpperCase();
    let match;
    if(method==='POST'&&(match=/^\/api\/preview\/([a-f0-9]{32})\/video$/.exec(path)))return video(match[1],options);
    if(method==='GET'&&(match=/^\/api\/preview\/([a-f0-9]{32})(\/bundle)?$/.exec(path)))return match[2]?bundle(match[1]):publicSession(await read(match[1]));
    if(method==='POST') {
      let payload;try{payload=typeof options.body==='string'?JSON.parse(options.body):options.body;}catch{throw new PreviewError('请求内容需要是对象');}
      if(path==='/api/preview/import')return importSession(payload,options);
      if((match=/^\/api\/preview\/([a-f0-9]{32})\/hero$/.exec(path)))return updateHero(match[1],payload);
      if((match=/^\/api\/preview\/([a-f0-9]{32})\/settings$/.exec(path)))return settings(match[1],payload);
    }
    throw new PreviewError('预览接口不存在',404);
  }
  function forget(id) {
    storage.delete?.(id);
    for(const [key,value] of urls) {
      if(!key.startsWith(id+'/'))continue;
      revoke(value);
      urls.delete(key);
    }
  }
  return {api,forget,dispose(){for(const value of urls.values())revoke(value);urls.clear();}};
}

let singleton;
export function localApi(path,options={}) {singleton??=createLocalPreview();return singleton.api(path,options);}
export function forgetLocalPreview(id) {singleton?.forget(id);}
export const api=localApi;
