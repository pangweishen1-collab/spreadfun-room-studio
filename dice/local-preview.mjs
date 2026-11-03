// Upload-only browser sessions. Original PNG Blobs are never rewritten or uploaded.
export const SLOTS = ['大骰子', '1', '2', ...Array.from({length:7}, (_, i) => `sz_${i}`)];
export const VIDEO_PROFILE = 'loop6-v1';
const REGIONS = ['1', '2', 'anchor', ...Array.from({length:6}, (_, i) => `sz_${i+1}`)];
const SETTING_KEYS = ['name', 'grade', 'mode', 'point', 'composition'];
const MAX_PNG = 12 * 1024 * 1024;

export class PreviewError extends Error {
  constructor(message, status=400, details={}) {
    super(message); this.name='PreviewError'; this.status=status; this.payload={error:message, ...details};
  }
}

export function slotFor(name) {
  if (typeof name !== 'string' || /[/\\]/.test(name) || !/\.png$/i.test(name)) return null;
  const stem=name.slice(0,-4).toLowerCase(), slot=stem==='icon'?'大骰子':stem;
  return SLOTS.includes(slot)?slot:null;
}

export function validateFiles(entries) {
  if (!Array.isArray(entries) || entries.length>30) throw new PreviewError('请上传完整的十张 PNG',400,{missing:SLOTS.map(s=>s+'.png'),extra:[],duplicates:[]});
  const mapped=new Map(), extra=[], duplicates=[];
  for (const entry of entries) {
    if (!entry || typeof entry.name!=='string') throw new PreviewError('上传文件信息不完整');
    const slot=slotFor(entry.name);
    if (!slot) extra.push(entry.name);
    else if (mapped.has(slot)) duplicates.push(slot+'.png');
    else mapped.set(slot,{...entry,slot});
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

export function validateSettings(payload, previous={name:'骰子预览',grade:'green',mode:'all',point:1,composition:'auto'}) {
  if (!payload || typeof payload!=='object' || Array.isArray(payload)) throw new PreviewError('请求内容需要是对象');
  const result=Object.fromEntries(SETTING_KEYS.map(k=>[k,Object.hasOwn(payload,k)?payload[k]:previous[k]]));
  if(typeof result.name!=='string' || !result.name.trim() || result.name.trim().length>80) throw new PreviewError('请填写 1～80 字的预览名称');
  result.name=result.name.trim();
  if(!['green','purple'].includes(result.grade)) throw new PreviewError('请选择绿色或紫色等级背景');
  if(!['all','single','continuous'].includes(result.mode)) throw new PreviewError('预览模式需为 all、single 或 continuous');
  if(!Number.isInteger(result.point) || result.point<1 || result.point>6) throw new PreviewError('点数需为 1～6 的整数');
  if(!['auto','faces','digits'].includes(result.composition)) throw new PreviewError('素材类型需为 auto、faces 或 digits');
  return result;
}

const CRC_TABLE=Array.from({length:256},(_,n)=>{for(let i=0;i<8;i++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
export function inspectPNG(bytes,slot,name=slot+'.png') {
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

export function detectComposition(files,requested='auto') {
  const areas=Object.fromEntries(files.map(f=>[f.slot,f.alphaArea]));
  const ratios=Array.from({length:6},(_,i)=>areas[`sz_${i+1}`]/Math.max(1,areas.sz_0));
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
async function decodePNG(blob,name) {
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
    if(!visible) throw new PreviewError(`${name}：图片没有可见内容`);
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

export function createIndexedDBStorage(indexedDB=globalThis.indexedDB) {
  let opening;
  function database() {
    if(!indexedDB) return Promise.reject(new PreviewError('此浏览器无法保存本地会话，请启用网站存储'));
    if(!opening) opening=new Promise((resolve,reject)=>{
      const request=indexedDB.open('fun-toolkit-dice-preview',1);
      request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains('sessions'))request.result.createObjectStore('sessions',{keyPath:'id'});};
      request.onsuccess=()=>{request.result.onversionchange=()=>request.result.close();resolve(request.result);};
      request.onerror=()=>reject(new PreviewError('本地会话存储不可用，请检查浏览器网站存储权限'));
      request.onblocked=()=>reject(new PreviewError('本地会话存储正在更新，请关闭其他骰子页面后重试'));
    });
    return opening;
  }
  return {
    async get(id) {const db=await database();return new Promise((resolve,reject)=>{const r=db.transaction('sessions','readonly').objectStore('sessions').get(id);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(new PreviewError('本地会话读取失败'));});},
    async put(record,expected=null) {
      const db=await database();
      return new Promise((resolve,reject)=>{
        const tx=db.transaction('sessions','readwrite'),store=tx.objectStore('sessions'),read=store.get(record.id);let failure;
        read.onsuccess=()=>{
          const before=read.result;
          if(expected===null?Boolean(before):!before||before.revision!==expected.revision||before.candidateId!==expected.candidateId) {
            failure=new PreviewError('预览已更新，请刷新后重试',409);tx.abort();return;
          }
          store.put(record);
        };
        tx.oncomplete=()=>resolve();
        tx.onabort=()=>reject(failure||new PreviewError('本地存储空间不足或不可用，原会话已保留'));
        tx.onerror=()=>{};
      });
    }
  };
}

function validVideo(video,record) {
  return video?.blob instanceof Blob&&video.profile===VIDEO_PROFILE&&video.duration===6&&video.fps===30&&video.frameCount===180&&video.width===720&&video.height===1600&&video.revision===record.revision&&video.candidate===record.candidateId;
}
async function sha256(blob) {return [...new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer()))].map(v=>v.toString(16).padStart(2,'0')).join('');}
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
  const storage=dependencies.storage||createIndexedDBStorage();
  const decode=dependencies.decodePNG||decodePNG;
  const render=dependencies.renderRuntime||((files,composition)=>renderRuntime(files,composition,decode));
  const hash=dependencies.hash||sha256, uuid=dependencies.uuid||(()=>crypto.randomUUID().replaceAll('-',''));
  const objectURL=dependencies.createObjectURL||(blob=>URL.createObjectURL(blob));
  const revoke=dependencies.revokeObjectURL||(url=>URL.revokeObjectURL(url));
  const urls=new Map();
  function url(key,blob) {if(!urls.has(key))urls.set(key,objectURL(blob));return urls.get(key);}
  async function read(id) {const record=await storage.get(id);if(!record)throw new PreviewError('预览会话不存在',404);return record;}
  function publicSession(record) {
    const files=record.files.map(({blob,alphaArea,...file})=>({...file,url:url(`${record.id}/file/${file.slot}`,blob)}));
    const candidate={id:record.candidateId,version:record.revision,name:record.name,template:'green',previewGrade:record.grade,
      skel:dependencies.templateURL||'/dice/assets/template.skel',atlasPage:'preview.png',
      atlas:url(record.candidateId+'/atlas',new Blob([record.runtime.atlasText],{type:'text/plain'})),
      texture:url(record.candidateId+'/texture',record.runtime.texture),png:Object.fromEntries(files.map(f=>[f.slot,f.url]))};
    let video=null;
    if(validVideo(record.video,record)) {const {blob,...metadata}=record.video;video={...metadata,url:url(`${record.id}/video/${metadata.sha256}`,blob)};}
    const videoAvailable=dependencies.videoAvailable??Boolean(globalThis.VideoEncoder||globalThis.MediaRecorder);
    return {id:record.id,revision:record.revision,...Object.fromEntries(SETTING_KEYS.map(k=>[k,record[k]])),
      created:record.created,files,candidate,video,videoAvailable,videoUnavailableReason:videoAvailable?null:'当前浏览器不支持视频导出，请使用 Chrome',
      resolvedComposition:record.resolvedComposition,compositionDetection:record.compositionDetection};
  }
  async function importSession(payload) {
    const settings=validateSettings(payload),entries=validateFiles(payload.files),files=[];
    for(const entry of entries) {
      const bytes=decodeDataURL(entry.data,entry.name),dimensions=inspectPNG(bytes,entry.slot,entry.name),blob=new Blob([bytes],{type:'image/png'});
      const image=await decode(blob,entry.name);
      try {files.push({name:entry.name,slot:entry.slot,blob,...dimensions,alphaArea:image.alphaArea,sha256:await hash(blob)});}
      finally {image.close?.();}
    }
    const detection=detectComposition(files,settings.composition);
    const record={id:uuid(),candidateId:uuid(),revision:1,...settings,...detection,files,video:null,created:Math.floor(Date.now()/1000)};
    record.runtime=await render(files,record.resolvedComposition);
    await storage.put(record);
    return publicSession(record);
  }
  async function settings(id,payload) {
    const record=await read(id);
    if(!payload||!Number.isInteger(payload.expectedRevision)||payload.expectedRevision!==record.revision)throw new PreviewError('预览已更新，请刷新后重试',409);
    const settings=validateSettings(payload,record);
    if(SETTING_KEYS.every(k=>settings[k]===record[k]))return publicSession(record);
    const next={...record,...settings,revision:record.revision+1,candidateId:uuid(),video:null,...detectComposition(record.files,settings.composition)};
    if(next.resolvedComposition!==record.resolvedComposition)next.runtime=await render(next.files,next.resolvedComposition);
    await storage.put(next,{revision:record.revision,candidateId:record.candidateId});
    return publicSession(next);
  }
  async function video(id,options) {
    const record=await read(id),headers=new Headers(options.headers),revision=Number(headers.get('X-Preview-Revision'));
    if(!Number.isInteger(revision)||revision!==record.revision||headers.get('X-Candidate-Id')!==record.candidateId)throw new PreviewError('预览已更新，请重新录制当前版本',409);
    if(!(options.body instanceof Blob)||!options.body.size||options.body.size>90*1024*1024)throw new PreviewError('视频大小不合法');
    const started=performance.now(),module=dependencies.prepareVideo?null:await import('./video-export.mjs');
    const blob=await (dependencies.prepareVideo||module.prepareVideo)(options.body);
    if(!(blob instanceof Blob)||!blob.size)throw new PreviewError('视频校验失败，请重新导出');
    const info=blob.videoInfo||(module?.inspectVideo?await module.inspectVideo(blob):null);
    if(!info||info.width!==720||info.height!==1600||Math.abs(info.duration-6)>.02||Math.abs(info.fps-30)>.01||info.frameCount!==180)throw new PreviewError('视频规格需为 6 秒、30 帧/秒、720×1600，共 180 帧');
    const stored={blob,profile:VIDEO_PROFILE,width:720,height:1600,duration:6,fps:30,frameCount:180,
      revision,candidate:record.candidateId,sha256:await hash(blob),fileName:'preview.mp4',size:blob.size,
      method:info.method||'browser_mp4',processingMs:Math.round(performance.now()-started)};
    await storage.put({...record,video:stored},{revision,candidateId:record.candidateId});
    return publicSession({...record,video:stored}).video;
  }
  async function bundle(id) {
    const record=await read(id),zip=await (dependencies.zipFactory||zipFactory)();
    const config={id,revision:record.revision,...Object.fromEntries(SETTING_KEYS.map(k=>[k,record[k]])),
      resolvedComposition:record.resolvedComposition,compositionDetection:record.compositionDetection,
      files:record.files.map(({blob,alphaArea,...file})=>file),video:null};
    for(const file of record.files) zip.file('res/'+file.name,file.blob);
    if(validVideo(record.video,record)) {
      zip.file('preview.mp4',record.video.blob);
      config.video={file:'preview.mp4',...Object.fromEntries(['sha256','profile','duration','fps','frameCount','width','height','method','processingMs'].map(k=>[k,record.video[k]]))};
    }
    zip.file('preview.json',JSON.stringify(config,null,2));
    const blob=await zip.generateAsync({type:'blob',compression:'DEFLATE',compressionOptions:{level:6}}),latest=await read(id);
    if(latest.revision!==record.revision||latest.candidateId!==record.candidateId||latest.video?.sha256!==record.video?.sha256)throw new PreviewError('打包期间预览已更新，请重新打包',409);
    return {url:url(`${id}/bundle/${record.revision}/${record.video?.sha256||'none'}`,blob)};
  }
  async function api(path,options={}) {
    const method=(options.method||'GET').toUpperCase();
    let match;
    if(method==='POST'&&(match=/^\/api\/preview\/([a-f0-9]{32})\/video$/.exec(path)))return video(match[1],options);
    if(method==='GET'&&(match=/^\/api\/preview\/([a-f0-9]{32})(\/bundle)?$/.exec(path)))return match[2]?bundle(match[1]):publicSession(await read(match[1]));
    if(method==='POST') {
      let payload;try{payload=typeof options.body==='string'?JSON.parse(options.body):options.body;}catch{throw new PreviewError('请求内容需要是对象');}
      if(path==='/api/preview/import')return importSession(payload);
      if((match=/^\/api\/preview\/([a-f0-9]{32})\/settings$/.exec(path)))return settings(match[1],payload);
    }
    throw new PreviewError('预览接口不存在',404);
  }
  return {api,dispose(){for(const value of urls.values())revoke(value);urls.clear();}};
}

let singleton;
export function localApi(path,options={}) {singleton??=createLocalPreview();return singleton.api(path,options);}
export const api=localApi;
