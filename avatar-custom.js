import {readSvga,buildCustomizedSvga} from './avatar-custom-engine.mjs';
import {TEXT_STYLES,textStylePadding,drawStyledText} from './avatar-text-style.mjs';

/* Custom text is embedded as a PNG sprite; no fonts are needed by the final player. */
const $=id=>document.getElementById(id);
const root=$('avatarTool');
const fonts={inter:['FT Inter',600],montserrat:['FT Montserrat',600],bebas:['FT Bebas Neue',400],oswald:['FT Oswald',600],playfair:['FT Playfair Display',600],cinzel:['FT Cinzel',600],pacifico:['FT Pacifico',400],orbitron:['FT Orbitron',600]};
const copy={
  zh:{stylePresets:'字体样式预设',stylePlain:'纯色',styleBrightGold:'亮金立体',styleChampagne:'香槟金',styleSilver:'银色金属',styleRoseGold:'玫瑰金',weightLabel:'字重',strokeLabel:'描边宽度',strokeColorLabel:'描边颜色',strokeError:'描边宽度需在 0–16px 之间。',textTooLarge:'文字过长或字号过大，请减少内容或字号。',fontLibrary:'字体库 ↗',imagesTab:'头像框图片',customTab:'定制头像框',preview:'效果预览',uploadTitle:'点击、拖入或粘贴 SVGA 文件',uploadHint:'保留原动效，添加定制文字',upload:'上传 SVGA',replace:'替换文件',play:'播放',pause:'暂停',center:'水平居中',textSettings:'定制文字',textLabel:'文字内容',fontLabel:'英文字体',sizeLabel:'文字大小',colorLabel:'文字颜色',svgaLimit:'SVGA · 3MB 内',frameSpec:'首帧 WebP · 240 × 240',export:'导出 SVGA + WebP',exporting:'正在导出…',loading:'正在读取…',empty:'尚未选择文件',ready:'可编辑',fontLoading:'正在载入字体…',fileType:'请选择一个 .svga 文件。',fileSize:'请选择 50MB 以内的 SVGA。',loadError:'无法读取此 SVGA，请检查文件后重试。',exportError:'导出失败，请重试；上次的成品已保留。',fontError:'字体未能载入，请重新选择字体。',textEmpty:'请输入定制文字。',sizeError:'文字大小需为 8–512 之间的整数。',sizeLimit:'优化后 SVGA 仍超过 3MB，请使用较小的原始素材后重试。',saved:'已生成 SVGA 和首帧 WebP。',optimized:'已优化图片素材，SVGA 保持在 3MB 内。',svgaDownload:'下载 SVGA',frameDownload:'下载首帧 WebP',zipDownload:'下载全部 ZIP',drag:'拖动文字调整位置，方向键微调',changed:'参数已修改，请重新导出。'},
  en:{stylePresets:'Text style presets',stylePlain:'Solid',styleBrightGold:'3D Gold',styleChampagne:'Champagne',styleSilver:'Silver',styleRoseGold:'Rose gold',weightLabel:'Weight',strokeLabel:'Outline width',strokeColorLabel:'Outline color',strokeError:'Outline width must be between 0 and 16px.',textTooLarge:'Text is too large. Shorten it or reduce its size.',fontLibrary:'Fonts ↗',imagesTab:'Frame images',customTab:'Custom frames',preview:'Preview',uploadTitle:'Click, drop or paste an SVGA file',uploadHint:'Keep the animation. Add your text.',upload:'Upload SVGA',replace:'Replace file',play:'Play',pause:'Pause',center:'Center horizontally',textSettings:'Custom text',textLabel:'Text',fontLabel:'English font',sizeLabel:'Text size',colorLabel:'Text color',svgaLimit:'SVGA · Under 3MB',frameSpec:'First-frame WebP · 240 × 240',export:'Export SVGA + WebP',exporting:'Exporting…',loading:'Loading…',empty:'No file selected',ready:'Ready to edit',fontLoading:'Loading font…',fileType:'Choose one .svga file.',fileSize:'Choose an SVGA under 50MB.',loadError:'Could not read this SVGA. Check the file and retry.',exportError:'Export failed. Retry; the last valid outputs have been kept.',fontError:'This font could not load. Please select it again.',textEmpty:'Enter your custom text.',sizeError:'Text size must be a whole number from 8 to 512.',sizeLimit:'The optimized SVGA still exceeds 3MB. Please use a smaller source file.',saved:'SVGA and first-frame WebP are ready.',optimized:'Image assets were optimized to keep the SVGA under 3MB.',svgaDownload:'Download SVGA',frameDownload:'Download first-frame WebP',zipDownload:'Download all ZIP',drag:'Drag text to move; use arrow keys to adjust',changed:'Settings changed. Export again.'}
};
const state={mode:'images',style:'plain',source:null,file:null,video:null,loading:false,exporting:false,playing:false,position:{x:.5,y:.82},bitmap:null,result:null,notice:'',noticeKind:'error',renderId:0,frame:0};
let player,exportPlayer,exportHost,drag,stageVisible=true;
const isZh=()=>document.documentElement.lang.startsWith('zh');
const t=key=>copy[isZh()?'zh':'en'][key]||key;
const selected=()=>state.mode==='custom';
const active=()=>selected()&&!root.classList.contains('hidden');
const busy=()=>state.loading||state.exporting;
const weights=()=>['bebas','pacifico'].includes($('avatarCustomFont').value)?[400,700]:$('avatarCustomFont').value==='oswald'?[400,500,600,700]:[400,500,600,700,800];
const weight=()=>Number($('avatarCustomWeight').value)||fonts[$('avatarCustomFont').value]?.[1]||600;
const cssFont=(size=Number($('avatarCustomFontSize').value))=>`${weight()} ${size}px "${(fonts[$('avatarCustomFont').value]||fonts.inter)[0]}"`;
const mode=()=>window.FunWebP?.getMode?.()||'high';
const cleanName=name=>name.replace(/\.svga$/i,'').replace(/[\\/:*?"<>|]/g,'-').slice(0,100)||'avatar';
function notice(key='',kind='error'){state.notice=key;state.noticeKind=kind;syncNotice()}
function syncNotice(){const n=$('avatarCustomNotice');n.hidden=!state.notice;n.dataset.state=state.noticeKind;n.textContent=state.notice?t(state.notice):''}
function sync(){
  const working=busy(),ready=!!state.source;
  $('avatarCustomFields').disabled=working||!ready;
  $('avatarCustomExport').disabled=working||!ready||!$('avatarCustomText').value.trim()||!validSize()||!validStroke()||!weights().includes(weight());
  $('avatarCustomExport').setAttribute('aria-busy',String(state.exporting));
  $('avatarCustomExport').textContent=t(state.exporting?'exporting':'export');
  for(const id of ['avatarCustomUpload','avatarCustomReplace','avatarCustomPlay','avatarCustomCenter'])$(id).disabled=working||(['avatarCustomPlay','avatarCustomCenter'].includes(id)&&!ready);
  $('avatarCustomUpload').setAttribute('aria-busy',String(state.loading));
  $('avatarCustomStage').setAttribute('aria-busy',String(working));
  $('avatarCustomStatus').textContent=t(state.loading?'loading':state.exporting?'exporting':ready?'ready':'empty');
  $('avatarCustomPlayText').textContent=t(state.playing?'pause':'play');$('avatarCustomPlayIcon').textContent=state.playing?'Ⅱ':'▶';
  $('avatarCustomEmpty').hidden=ready;$('avatarCustomScene').hidden=!ready;
  $('avatarCustomSourcebar').hidden=$('avatarCustomToolbar').hidden=!ready;
  $('avatarCustomStage').classList.toggle('upload-ready',!ready);
  $('avatarCustomTextLayer').style.pointerEvents=working?'none':'';
  syncTabs();syncNotice();syncStyles();
  document.dispatchEvent(new CustomEvent('webp:tool-state',{detail:{tool:'avatar',busy:working}}));
}
function syncStyles(){for(const button of root.querySelectorAll('button[data-text-style]'))button.setAttribute('aria-pressed',String(state.style===button.dataset.textStyle))}
function chooseStyle(key){
  if(busy()||!state.source||!Object.hasOwn(TEXT_STYLES,key))return;
  state.style=key;const preset=TEXT_STYLES[key];
  if(key!=='plain'){$('avatarCustomColor').value=preset.baseColor;$('avatarCustomStrokeColor').value=preset.outlineColor;$('avatarCustomStrokeWidth').value=preset.outlineWidth}
  syncStyles();changed();
}
function syncTabs(){const locked=busy()||window.Toolkit?.isAvatarBusy?.();for(const [id,name] of [['avatarImagesTab','images'],['avatarCustomTab','custom']]){const button=$(id);button.disabled=!!locked;button.setAttribute('aria-selected',String(state.mode===name));button.tabIndex=state.mode===name?0:-1}}
function chooseMode(next){
  if(!['images','custom'].includes(next)||busy()||window.Toolkit?.isAvatarBusy?.())return;
  window.Toolkit?.pauseAvatar?.();pause();state.mode=next;
  $('avatarImagesPanel').hidden=selected();$('avatarCustomPanel').hidden=!selected();syncTabs();layout();
}
function syncLanguage(){
  root.querySelectorAll('[data-custom-i18n]').forEach(node=>node.textContent=t(node.dataset.customI18n));
  root.querySelector('.avatar-subtabs').setAttribute('aria-label',isZh()?'头像框功能':'Avatar frame tools');
  $('avatarCustomColorValue').setAttribute('aria-label',isZh()?'文字颜色 HEX':'Text color HEX');
  $('avatarCustomStrokeColorValue').setAttribute('aria-label',isZh()?'描边颜色 HEX':'Outline color HEX');
  $('avatarCustomStage').setAttribute('aria-label',t('uploadTitle'));$('avatarCustomTextLayer').setAttribute('aria-label',t('drag'));
  if(state.result)renderDownloads();sync();
}
function validSize(){const n=Number($('avatarCustomFontSize').value);return Number.isInteger(n)&&n>=8&&n<=512}
function validStroke(){const n=Number($('avatarCustomStrokeWidth').value);return Number.isFinite(n)&&n>=0&&n<=16}
function syncWeights(){const allowed=weights();for(const option of Array.from($('avatarCustomWeight').options||[]))option.disabled=!allowed.includes(Number(option.value));if(!allowed.includes(weight()))$('avatarCustomWeight').value=weight()>allowed.at(-1)?allowed.at(-1):fonts[$('avatarCustomFont').value][1]}
function waitForRenderer(target){return new Promise((resolve,reject)=>{const start=performance.now();function check(){if(target._renderer?._prepared){resolve();return}if(performance.now()-start>15000){reject(Error('loadError'));return}setTimeout(check,20)}check()})}
function parse(file){return new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('loadError')),15000);new window.SVGA.Parser().load(file,video=>{clearTimeout(timer);resolve(video)},()=>{clearTimeout(timer);reject(Error('loadError'))})})}
function ensurePlayer(){
  if(player)return;
  player=new window.SVGA.Player($('avatarCustomPlayer'));player.clearsAfterStop=false;player.loops=0;player.setContentMode('AspectFit');
  player.onFrame(frame=>{state.frame=frame;syncTime()});
}
function syncTime(){if(!state.source)return;const info=state.source.info;$('avatarCustomTime').textContent=`${((state.frame||0)/info.fps).toFixed(2)} / ${(info.frames/info.fps).toFixed(2)} s`}
function pause(){if(player&&state.video)player.pauseAnimation();state.playing=false;if($('avatarCustomPlayText')){$('avatarCustomPlayText').textContent=t('play');$('avatarCustomPlayIcon').textContent='▶'}}
function layout(){
  if(!state.source||!active())return;
  const {width,height}=state.source.info,zone=$('avatarCustomStage'),scale=Math.min(360/width,360/height,(zone.clientWidth-40)/width,(zone.clientHeight-40)/height);
  const scene=$('avatarCustomScene');scene.style.width=Math.max(1,width*scale)+'px';scene.style.height=Math.max(1,height*scale)+'px';
  placeText();if(player&&state.video&&!state.playing&&!busy())player.stepToFrame(state.frame,false);
}
function placeText(){
  const b=state.bitmap;if(!b||!state.source)return;
  const {width,height}=state.source.info,n=$('avatarCustomTextLayer');
  n.style.width=(b.width/width*100)+'%';n.style.height=(b.height/height*100)+'%';
  n.style.left=(state.position.x-b.width/width/2)*100+'%';n.style.top=(state.position.y-b.height/height/2)*100+'%';
  root.dataset.customTextX=String(state.position.x);root.dataset.customTextY=String(state.position.y);
}
async function rasterText(size=Number($('avatarCustomFontSize').value)){
  const raw=$('avatarCustomText').value.replace(/\r/g,''),color=$('avatarCustomColor').value,fontKey=$('avatarCustomFont').value,font=cssFont(size),fontWeight=weight(),strokeWidth=Number($('avatarCustomStrokeWidth').value),strokeColor=$('avatarCustomStrokeColor').value,styleKey=state.style;
  if(!raw.trim())return null;
  if(!Number.isInteger(size)||size<8||size>512)throw Error('sizeError');
  if(!validStroke())throw Error('strokeError');
  try{const loaded=await document.fonts.load(font,raw);if(!loaded.length)throw Error('fontError')}catch(error){throw Error('fontError')}
  const lines=raw.split('\n'),measure=document.createElement('canvas').getContext('2d');measure.font=font;
  const padding=Math.ceil(size*.3+strokeWidth+2+textStylePadding(styleKey,size,strokeWidth)),width=Math.ceil(Math.max(...lines.map(line=>measure.measureText(line||' ').width))+padding*2),height=Math.ceil(lines.length*size*1.3+padding*2);
  if(width>16384||height>16384)throw Error('textTooLarge');
  const ratio=Math.min(2,4096/width,4096/height,Math.sqrt(12000000/(width*height))),canvas=document.createElement('canvas');
  canvas.width=Math.max(1,Math.ceil(width*ratio));canvas.height=Math.max(1,Math.ceil(height*ratio));
  const ctx=canvas.getContext('2d');ctx.scale(ratio,ratio);
  drawStyledText(ctx,{lines,size,width,padding,font,color,strokeWidth,strokeColor,styleKey});return {canvas,width,height,fontKey,color,text:raw,fontWeight,strokeWidth,strokeColor,styleKey};
}
function applyBitmap(bitmap){
  state.bitmap=bitmap;const layer=$('avatarCustomTextLayer');layer.hidden=!bitmap;
  if(bitmap){layer.dataset.font=bitmap.fontKey;layer.dataset.color=bitmap.color;layer.dataset.weight=String(bitmap.fontWeight);layer.dataset.strokeWidth=String(bitmap.strokeWidth);layer.dataset.textStyle=bitmap.styleKey;layer.width=bitmap.canvas.width;layer.height=bitmap.canvas.height;layer.getContext('2d').drawImage(bitmap.canvas,0,0);placeText()}
}
async function renderText(){
  const id=++state.renderId;
  if(!state.source||!validSize()){applyBitmap(null);sync();return null}
  const bitmap=await rasterText();if(id!==state.renderId)return null;applyBitmap(bitmap);sync();return bitmap;
}
function changed(){
  ++state.renderId;
  $('avatarCustomColorValue').value=$('avatarCustomColor').value.toUpperCase();$('avatarCustomColorValue').setAttribute('aria-invalid','false');
  $('avatarCustomStrokeColorValue').value=$('avatarCustomStrokeColor').value.toUpperCase();$('avatarCustomStrokeColorValue').setAttribute('aria-invalid','false');
  if(state.result)notice('changed','success');else notice();
  if(!validSize()){notice('sizeError');sync();return}
  if(!validStroke()){notice('strokeError');sync();return}
  const task=renderText(),id=state.renderId;task.catch(error=>{if(id===state.renderId)notice(['strokeError','textTooLarge'].includes(error.message)?error.message:'fontError')});
}
async function loadFiles(files){
  if(busy())return;const file=Array.from(files||[])[0];if(!file)return;
  if(!/\.svga$/i.test(file.name)){notice('fileType');return}if(file.size>50*1024*1024){notice('fileSize');return}
  pause();state.loading=true;++state.renderId;notice();sync();
  const previous=state.video;let imported=false;
  try{
    const bytes=new Uint8Array(await file.arrayBuffer()),source=await readSvga(bytes,{JSZip:window.JSZip}),video=await parse(file);
    const size=state.source?Number($('avatarCustomFontSize').value):Math.max(8,Math.min(64,Math.round(source.info.width*.095))),bitmap=await rasterText(size);
    ensurePlayer();player.setVideoItem(video);await waitForRenderer(player);
    state.source=source;state.video=video;state.file=file;state.frame=0;$('avatarCustomFontSize').value=size;
    releaseResult(state.result);state.result=null;$('avatarCustomResult').hidden=true;$('avatarCustomDownloads').replaceChildren();
    $('avatarCustomFileName').textContent=file.name;$('avatarCustomFileMeta').textContent=`${source.info.width} × ${source.info.height} · ${source.info.frames} ${isZh()?'帧':'frames'} · ${source.info.fps} FPS`;
    applyBitmap(bitmap);sync();layout();player.stepToFrame(0,false);syncTime();
    root.dataset.customSource=file.name;root.dataset.customFormat=source.format;
    imported=true;
  }catch(error){if(player&&previous){player.setVideoItem(previous);await waitForRenderer(player).catch(()=>{});player.stepToFrame(state.frame,false)}notice(error.message==='fontError'?'fontError':'loadError')}
  finally{state.loading=false;if(imported&&active()&&!document.hidden&&stageVisible&&!matchMedia('(prefers-reduced-motion: reduce)').matches){state.playing=true;player.stepToFrame(state.frame,true)}sync();layout()}
}
const toPng=canvas=>new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(Error('exportError')),'image/png'));
async function optimizeImage({bytes,width,height,maxWidth,maxHeight,canResize}){
  if(!canResize||!maxWidth||!maxHeight)return null;
  const image=await createImageBitmap(new Blob([bytes],{type:'image/png'}));
  try{const scale=Math.min(1,maxWidth/width,maxHeight/height);if(scale>=1)return null;const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(width*scale));canvas.height=Math.max(1,Math.round(height*scale));const ctx=canvas.getContext('2d');ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(image,0,0,canvas.width,canvas.height);const result=new Uint8Array(await (await toPng(canvas)).arrayBuffer());canvas.width=canvas.height=1;return result.byteLength<bytes.byteLength?result:null}finally{image.close()}
}
async function firstFrame(bytes,name,compression){
  const video=await parse(new File([bytes],name,{type:'application/octet-stream'}));
  if(!exportPlayer){exportHost=document.createElement('div');exportHost.style.cssText='position:fixed;left:-20000px;top:0;visibility:hidden;pointer-events:none';exportHost.setAttribute('aria-hidden','true');document.body.append(exportHost);exportPlayer=new window.SVGA.Player(exportHost);exportPlayer.clearsAfterStop=false;exportPlayer.setContentMode('AspectFit')}
  const side=Math.min(2048,Math.max(240,video.videoSize.width,video.videoSize.height));exportHost.style.width=side+'px';exportHost.style.height=side+'px';
  exportPlayer.setVideoItem(video);await waitForRenderer(exportPlayer);exportPlayer.stepToFrame(0,false);
  const out=document.createElement('canvas');out.width=out.height=240;const ctx=out.getContext('2d');ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(exportHost.querySelector('canvas'),0,0,240,240);
  const blob=await window.canvasToWebP(out,{mode:compression});return {blob,canvas:out};
}
function releaseResult(result){if(result)for(const file of result.files)URL.revokeObjectURL(file.url)}
function download(file){const a=document.createElement('a');a.href=file.url;a.download=file.name;a.hidden=true;document.body.append(a);a.click();a.remove();window.Hub?.record('avatar','download')}
function renderDownloads(){
  $('avatarCustomDownloads').replaceChildren();$('avatarCustomResult').hidden=true;
}
async function exportFiles(){
  if(busy()||!state.source)return;if(!$('avatarCustomText').value.trim()){notice('textEmpty');return}if(!validSize()){notice('sizeError');return}if(!validStroke()){notice('strokeError');return}
  pause();state.exporting=true;notice();sync();const started=performance.now(),compression=mode();
  try{
    const bitmap=await renderText();if(!bitmap)throw Error('exportError');
    const textImage=new Uint8Array(await (await toPng(bitmap.canvas)).arrayBuffer()),info=state.source.info;
    const result=await buildCustomizedSvga(state.source,{textImage,x:state.position.x*info.width-bitmap.width/2,y:state.position.y*info.height-bitmap.height/2,width:bitmap.width,height:bitmap.height,maxBytes:3000000,optimizeImage},{JSZip:window.JSZip});
    if(result.bytes.byteLength>3000000)throw Error('sizeLimit');
    const name=cleanName(state.file.name),svgaName=name+'-custom.svga',webpName=name+'-preview.webp',frame=await firstFrame(result.bytes,svgaName,compression);
    const svga=new Blob([result.bytes],{type:'application/octet-stream'}),zip=new window.JSZip();zip.file(svgaName,svga);zip.file(webpName,frame.blob);const archive=await zip.generateAsync({type:'blob',compression:'STORE'});if(mode()!==compression)throw Error('modeChanged');
    const files=[{name:svgaName,blob:svga},{name:webpName,blob:frame.blob},{name:name+'-custom.zip',blob:archive}];for(const file of files)file.url=URL.createObjectURL(file.blob);
    releaseResult(state.result);state.result={files};const canvas=$('avatarCustomFirstFrame');canvas.getContext('2d').clearRect(0,0,240,240);canvas.getContext('2d').drawImage(frame.canvas,0,0);frame.canvas.width=frame.canvas.height=1;
    renderDownloads();window.Hub?.record('avatar','generated',2);download(files[2]);notice(result.optimized?'optimized':'saved','success');
    root.dataset.customExportBytes=String(svga.size);root.dataset.customExportMs=(performance.now()-started).toFixed(1);root.dataset.customTextKey=result.imageKey;
  }catch(error){notice(error.code==='sizeLimit'||error.message==='sizeLimit'?'sizeLimit':['fontError','strokeError','textTooLarge'].includes(error.message)?error.message:'exportError')}
  finally{state.exporting=false;sync()}
}
for(const [id,name] of [['avatarImagesTab','images'],['avatarCustomTab','custom']]){
  $(id).addEventListener('click',()=>chooseMode(name));
  $(id).addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const next=event.key==='Home'?'images':event.key==='End'?'custom':state.mode==='images'?'custom':'images';chooseMode(next);$(next==='images'?'avatarImagesTab':'avatarCustomTab').focus()});
}
for(const id of ['avatarCustomText','avatarCustomFontSize','avatarCustomColor','avatarCustomStrokeWidth','avatarCustomStrokeColor'])$(id).addEventListener('input',changed);
for(const button of root.querySelectorAll('button[data-text-style]'))button.addEventListener('click',()=>chooseStyle(button.dataset.textStyle));
$('avatarCustomWeight').addEventListener('change',changed);
$('avatarCustomFont').addEventListener('change',()=>{syncWeights();changed()});
$('avatarCustomColorValue').addEventListener('input',event=>{const hex=event.target.value.trim();if(!/^#?[a-f0-9]{6}$/i.test(hex)){event.target.setAttribute('aria-invalid','true');return}$('avatarCustomColor').value='#'+hex.replace(/^#/,'');changed()});
$('avatarCustomColorValue').addEventListener('blur',()=>{$('avatarCustomColorValue').value=$('avatarCustomColor').value.toUpperCase();$('avatarCustomColorValue').setAttribute('aria-invalid','false')});
$('avatarCustomStrokeColorValue').addEventListener('input',event=>{const hex=event.target.value.trim();if(!/^#?[a-f0-9]{6}$/i.test(hex)){event.target.setAttribute('aria-invalid','true');return}$('avatarCustomStrokeColor').value='#'+hex.replace(/^#/,'');changed()});
$('avatarCustomStrokeColorValue').addEventListener('blur',()=>{$('avatarCustomStrokeColorValue').value=$('avatarCustomStrokeColor').value.toUpperCase();$('avatarCustomStrokeColorValue').setAttribute('aria-invalid','false')});
for(const id of ['avatarCustomUpload','avatarCustomReplace'])$(id).addEventListener('click',event=>{event.stopPropagation();if(!busy())$('avatarCustomInput').click()});
$('avatarCustomInput').addEventListener('change',event=>{loadFiles(event.target.files);event.target.value=''});
$('avatarCustomStage').addEventListener('click',()=>{if(!state.source&&!busy())$('avatarCustomInput').click()});
$('avatarCustomPlay').addEventListener('click',()=>{if(!active()||document.hidden||busy()||!state.video)return;if(state.playing){pause();return}state.playing=true;player.stepToFrame(state.frame,true);sync()});
$('avatarCustomCenter').addEventListener('click',()=>{if(busy())return;state.position.x=.5;placeText();if(state.result)notice('changed','success')});
$('avatarCustomExport').addEventListener('click',exportFiles);
const layer=$('avatarCustomTextLayer');
layer.addEventListener('pointerdown',event=>{if(busy()||event.button!==0||!state.source)return;event.preventDefault();event.stopPropagation();const r=$('avatarCustomScene').getBoundingClientRect();drag={pointer:event.pointerId,x:event.clientX,y:event.clientY,position:{...state.position},width:r.width,height:r.height};layer.setPointerCapture(event.pointerId);layer.focus()});
layer.addEventListener('pointermove',event=>{if(!drag||event.pointerId!==drag.pointer)return;state.position.x=Math.max(0,Math.min(1,drag.position.x+(event.clientX-drag.x)/drag.width));state.position.y=Math.max(0,Math.min(1,drag.position.y+(event.clientY-drag.y)/drag.height));placeText()});
function stopDrag(){if(!drag)return;drag=null;if(state.result)notice('changed','success')}
layer.addEventListener('pointerup',stopDrag);layer.addEventListener('pointercancel',stopDrag);
layer.addEventListener('keydown',event=>{if(busy()||!state.source||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;event.preventDefault();const step=event.shiftKey?10:1,info=state.source.info;state.position.x=Math.max(0,Math.min(1,state.position.x+({ArrowLeft:-step,ArrowRight:step}[event.key]||0)/info.width));state.position.y=Math.max(0,Math.min(1,state.position.y+({ArrowUp:-step,ArrowDown:step}[event.key]||0)/info.height));placeText();if(state.result)notice('changed','success')});
window.UploadPaste?.register({zone:$('avatarCustomStage'),isActive:active,isBusy:busy,onFiles:loadFiles});
document.addEventListener('dragover',event=>{if(active()&&Array.from(event.dataTransfer?.types||[]).includes('Files')){event.preventDefault();$('avatarCustomStage').classList.add('drag')}});
document.addEventListener('dragleave',event=>{if(!event.relatedTarget)$('avatarCustomStage').classList.remove('drag')});
document.addEventListener('drop',event=>{if(!active()||!event.dataTransfer?.files.length)return;event.preventDefault();$('avatarCustomStage').classList.remove('drag');loadFiles(event.dataTransfer.files)});
document.addEventListener('visibilitychange',()=>{if(document.hidden)pause()});window.addEventListener('hashchange',()=>{if(!active())pause();else layout()});
window.addEventListener('pagehide',()=>{pause();releaseResult(state.result)});
matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change',event=>{if(event.matches)pause()});
new ResizeObserver(layout).observe($('avatarCustomStage'));
new IntersectionObserver(entries=>{stageVisible=entries[0].isIntersecting;if(!stageVisible)pause()}).observe($('avatarCustomStage'));
new MutationObserver(syncLanguage).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
new MutationObserver(syncTabs).observe(root,{subtree:true,attributes:true,attributeFilter:['aria-busy']});
window.AvatarCustom={isSelected:selected,syncLanguage};syncWeights();syncLanguage();
