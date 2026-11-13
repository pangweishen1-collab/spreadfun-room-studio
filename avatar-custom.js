import {readSvga,buildCustomizedSvga,listSvgaImages,previewSvgaImages,svgaBitmapCount,svgaRuntimeBytes,SVGA_MAX_RUNTIME_BYTES} from './avatar-custom-engine.mjs?v=20261110-svga-layout';
import {TEXT_STYLES,defaultTextHighlight,textGradientStops,drawStyledText} from './avatar-text-style.mjs?v=20261113-three-tone-gold';

/* Image and text PNG sprites are embedded in the animation; the final player needs no fonts. */
const $=id=>document.getElementById(id);
const root=$('avatarTool');
const fonts={inter:['FT Inter',600],montserrat:['FT Montserrat',600],bebas:['FT Bebas Neue',400],oswald:['FT Oswald',600],playfair:['FT Playfair Display',600],cinzel:['FT Cinzel',600],pacifico:['FT Pacifico',400],orbitron:['FT Orbitron',600]};
const copy={
  zh:{imageTitle:'添加元素',imageUpload:'上传图片',imageReplace:'替换图片',imageRemove:'移除',imageCenter:'居中图片',imageWidth:'图片宽度',imageLoading:'正在读取图片…',imageDrag:'拖动图片调整位置，方向键微调，右下角缩放',imageResize:'调整图片大小，方向键缩放',imageNeedsSvga:'请先上传头像框 SVGA，再添加图片。',imageType:'请选择 PNG、JPG 或 WebP 图片。',imageSizeError:'请选择 20MB 以内的图片。',imageDimensions:'图片最长边需在 8192px 内，且不超过 3200 万像素。',imageLoadError:'无法读取此图片，请检查文件后重试。',imageWidthError:'请输入有效的图片宽度，保持原始比例。',stylePlain:'纯色',styleBrightGold:'亮金',styleChampagne:'香槟金',styleSilver:'银色',styleRoseGold:'玫瑰金',weightLabel:'字重',strokeLabel:'描边宽度',strokeColorLabel:'描边颜色',strokeError:'描边宽度需在 0–16px 之间。',textTooLarge:'文字过长或字号过大，请减少内容或字号。',fontLibrary:'字体库 ↗',imagesTab:'头像框图片',customTab:'定制头像框',preview:'效果预览',uploadTitle:'点击、拖入或粘贴 SVGA 文件',uploadHint:'保留原动效，添加文字或图片',upload:'上传 SVGA',replace:'替换文件',play:'播放',pause:'暂停',center:'水平居中',textSettings:'定制内容',textLabel:'文字内容',fontLabel:'英文字体',sizeLabel:'文字大小',colorLabel:'文字颜色',svgaLimit:'SVGA · 3MB 内',frameSpec:'首帧 WebP · 240 × 240',export:'导出 SVGA + WebP',exporting:'正在导出…',loading:'正在读取…',empty:'尚未选择文件',ready:'可编辑',fontLoading:'正在载入字体…',fileType:'请选择一个 .svga 文件。',fileSize:'请选择 50MB 以内的 SVGA。',loadError:'无法读取此 SVGA，请检查文件后重试。',exportError:'导出失败，请重试；上次的成品已保留。',fontError:'字体未能载入，请重新选择字体。',textEmpty:'请添加文字或图片。',sizeError:'文字大小需为 8–512 之间的整数。',sizeLimit:'无损压缩后 SVGA 仍超过 3MB，请减少素材或使用较小的源文件。',saved:'已无损打包 SVGA，并生成首帧 WebP。',optimized:'已无损压缩 SVGA，保留原尺寸和全部动画帧。',svgaDownload:'下载 SVGA',frameDownload:'下载首帧 WebP',zipDownload:'下载全部 ZIP',drag:'拖动文字调整位置，方向键微调',changed:'参数已修改，请重新导出。'},
  en:{imageTitle:'Add elements',imageUpload:'Upload image',imageReplace:'Replace image',imageRemove:'Remove',imageCenter:'Center image',imageWidth:'Image width',imageLoading:'Loading image…',imageDrag:'Drag image to move; arrows to nudge; corner to resize',imageResize:'Resize image; arrow keys adjust size',imageNeedsSvga:'Upload an SVGA first, then add your image.',imageType:'Choose a PNG, JPG or WebP image.',imageSizeError:'Choose an image under 20MB.',imageDimensions:'Use an image up to 8192px per side and 32 megapixels.',imageLoadError:'Could not read the image. Check it and retry.',imageWidthError:'Enter a valid image width; the original ratio is preserved.',stylePlain:'Solid',styleBrightGold:'Bright gold',styleChampagne:'Champagne',styleSilver:'Silver',styleRoseGold:'Rose gold',weightLabel:'Weight',strokeLabel:'Outline width',strokeColorLabel:'Outline color',strokeError:'Outline width must be between 0 and 16px.',textTooLarge:'Text is too large. Shorten it or reduce its size.',fontLibrary:'Fonts ↗',imagesTab:'Frame images',customTab:'Custom frames',preview:'Preview',uploadTitle:'Click, drop or paste an SVGA file',uploadHint:'Keep the animation. Add text or an image.',upload:'Upload SVGA',replace:'Replace file',play:'Play',pause:'Pause',center:'Center horizontally',textSettings:'Custom content',textLabel:'Text',fontLabel:'English font',sizeLabel:'Text size',colorLabel:'Text color',svgaLimit:'SVGA · Under 3MB',frameSpec:'First-frame WebP · 240 × 240',export:'Export SVGA + WebP',exporting:'Exporting…',loading:'Loading…',empty:'No file selected',ready:'Ready to edit',fontLoading:'Loading font…',fileType:'Choose one .svga file.',fileSize:'Choose an SVGA under 50MB.',loadError:'Could not read this SVGA. Check the file and retry.',exportError:'Export failed. Retry; the last valid outputs have been kept.',fontError:'This font could not load. Please select it again.',textEmpty:'Add text or an image.',sizeError:'Text size must be a whole number from 8 to 512.',sizeLimit:'Lossless compression still exceeds 3MB. Reduce assets or use a smaller source file.',saved:'SVGA packaged losslessly and first-frame WebP generated.',optimized:'SVGA compressed losslessly; original dimensions and all frames preserved.',svgaDownload:'Download SVGA',frameDownload:'Download first-frame WebP',zipDownload:'Download all ZIP',drag:'Drag text to move; use arrow keys to adjust',changed:'Settings changed. Export again.'}
};
Object.assign(copy.zh,{
  stylePresets:'文字样式预设',styleThreeToneGold:'三色金',
  gradientBaseLabel:'渐变基色',highlightLabel:'高光色',midLabel:'中间色',
  uploadHint:'提取图片素材，或定制文字和图片',assetsTitle:'SVGA 图片素材',assetAdd:'添加图片',assetDelete:'删除选中',assetsRestore:'恢复已删原图',
  assetDownload:'下载',assetEdit:'定位',assetOriginal:'原始素材',assetAdded:'新增图层',assetWorking:'正在处理素材…',
  assetEmpty:'当前没有图片素材。可以添加图片到头像框。',assetCount:'{total} 张图片 · 已选 {selected} 张',assetError:'素材修改失败，已保留之前的画面。',
  assetLimit:'最多可添加 7 张图片。',moveAssets:'在上方画布拖动蓝框可移动选中素材，方向键可微调。',unplacedAssets:'选中素材没有可移动的画面图层。',
  runtimeMemory:'运行内存估算',runtimeLimit:'解码后的图片和画布超过 3 MB，请移除素材或换用较小的图片再导出。',unknownRuntimeSize:'有图片无法计算运行内存，请更换源文件或移除该素材。',
  runtimeHint:'按解码后的 RGBA 图片和一张原尺寸画布计算。实际播放器的总内存因平台而异。',overRuntime:'超出上限',unknownRuntime:'无法估算',
});
Object.assign(copy.en,{
  stylePresets:'Text style presets',styleThreeToneGold:'Tri-tone gold',
  gradientBaseLabel:'Base color',highlightLabel:'Highlight',midLabel:'Midtone',
  uploadHint:'Extract images or customize the frame with text and images.',assetsTitle:'SVGA image assets',assetAdd:'Add image',assetDelete:'Delete selected',assetsRestore:'Restore original images',
  assetDownload:'Download',assetEdit:'Edit',assetOriginal:'Original asset',assetAdded:'Added layer',assetWorking:'Processing assets…',
  assetEmpty:'No image assets. Add an image to this avatar frame.',assetCount:'{total} images · {selected} selected',assetError:'Could not edit these assets. The previous preview has been kept.',
  assetLimit:'You can add up to 7 images.',moveAssets:'Drag the blue outline in the preview to move selected assets. Use arrow keys to nudge.',unplacedAssets:'The selected assets have no movable layer in the animation.',
  runtimeMemory:'Estimated runtime memory',runtimeLimit:'Decoded images and the canvas exceed 3 MB. Remove assets or use smaller images before exporting.',unknownRuntimeSize:'An image could not be measured. Replace the source file or remove that asset.',
  runtimeHint:'Counts decoded RGBA images and one native-size canvas. Total player memory depends on the platform.',overRuntime:'Over limit',unknownRuntime:'Unavailable',
});
const state={mode:'preview',style:'plain',source:null,file:null,video:null,loading:false,imageLoading:false,exporting:false,playing:false,position:{x:.5,y:.82},bitmap:null,image:null,result:null,notice:'',noticeKind:'error',renderId:0,frame:0,
  images:[],sourceAssets:[],removedImages:new Set(),assetSelection:new Set(),assetOffsets:new Map(),assetBusy:false,
  highlightColor:null,midColor:null};
const textColors=[
  ['avatarCustomColor','colorLabel'],
  ['avatarCustomHighlight','highlightLabel','highlightColor'],
  ['avatarCustomMid','midLabel','midColor'],
  ['avatarCustomStrokeColor','strokeColorLabel'],
];
const MAX_ADDED_IMAGES=7;
let player,exportPlayer,exportHost,drag,imageDrag,assetDrag,assetPaint,stageVisible=true;
const isZh=()=>document.documentElement.lang.startsWith('zh');
const t=key=>copy[isZh()?'zh':'en'][key]||key;
const avatarModes = [
  {name:'preview', tab:'avatarSeatPreviewTab', panel:'giftAvatarPreview'},
  {name:'images', tab:'avatarImagesTab', panel:'avatarImagesPanel'},
  {name:'custom', tab:'avatarCustomTab', panel:'avatarCustomPanel'}
];
const selected=()=>state.mode==='custom';
const active=()=>selected()&&!root.classList.contains('hidden');
const busy=()=>state.loading||state.imageLoading||state.exporting||state.assetBusy;
const weights=()=>['bebas','pacifico'].includes($('avatarCustomFont').value)?[400,700]:$('avatarCustomFont').value==='oswald'?[400,500,600,700]:[400,500,600,700,800];
const weight=()=>Number($('avatarCustomWeight').value)||fonts[$('avatarCustomFont').value]?.[1]||600;
const cssFont=(size=Number($('avatarCustomFontSize').value))=>`${weight()} ${size}px "${(fonts[$('avatarCustomFont').value]||fonts.inter)[0]}"`;
const mode=()=>window.FunWebP?.getMode?.()||'high';
const cleanName=name=>name.replace(/\.svga$/i,'').replace(/[\\/:*?"<>|]/g,'-').slice(0,100)||'avatar';
function notice(key='',kind='error'){state.notice=key;state.noticeKind=kind;syncNotice()}
function syncNotice(){const n=$('avatarCustomNotice');n.hidden=!state.notice;n.dataset.state=state.noticeKind;n.textContent=state.notice?t(state.notice):''}
function currentRuntimeBytes(){
  if(!state.source||state.sourceAssets.length!==svgaBitmapCount(state.source))return null;
  const original=state.sourceAssets.filter(asset=>!state.removedImages.has(asset.key));
  const overlays=state.images.map(image=>image.canvas);
  if(state.bitmap&&$('avatarCustomText').value.trim())overlays.push(state.bitmap.canvas);
  return svgaRuntimeBytes(state.source.info,original.concat(overlays));
}
async function measureImage(bytes,type){
  try{
    const image=await createImageBitmap(new Blob([bytes],{type}));
    const size={width:image.width,height:image.height};image.close();return size;
  }catch{return null}
}
function sync(){
  const working=busy(),ready=!!state.source;
  $('avatarCustomFields').disabled=working||!ready;
  const hasText=!!$('avatarCustomText').value.trim();
  const runtimeBytes=currentRuntimeBytes(),overBudget=runtimeBytes!==null&&runtimeBytes>SVGA_MAX_RUNTIME_BYTES;
  const budgetError=ready&&(runtimeBytes===null?'unknownRuntimeSize':overBudget?'runtimeLimit':'');
  const memory=$('avatarCustomRuntimeMeta');
  const label=t('runtimeMemory')+' · '+(runtimeBytes===null?t('unknownRuntime'):(runtimeBytes/1e6).toFixed(2)+' / 3 MB')+(overBudget?' · '+t('overRuntime'):'');
  if(memory.textContent!==label)memory.textContent=label;
  memory.title=t(budgetError||'runtimeHint');memory.dataset.over=String(!!budgetError);
  $('avatarCustomExport').disabled=working||!ready||!!budgetError||(!hasText&&!state.images.length&&!state.removedImages.size&&!state.assetOffsets.size)||(hasText&&(!validSize()||!validStroke()||!weights().includes(weight())))||!validImageWidth();
  $('avatarCustomExport').title=budgetError?t(budgetError):'';
  $('avatarCustomExport').setAttribute('aria-busy',String(state.exporting));
  $('avatarCustomExport').textContent=t(state.exporting?'exporting':'export');
  for(const id of ['avatarCustomUpload','avatarCustomReplace','avatarCustomPlay','avatarCustomCenter'])$(id).disabled=working||(['avatarCustomPlay','avatarCustomCenter'].includes(id)&&!ready);
  $('avatarCustomImageUpload').disabled=working||!ready;
  for(const id of ['avatarCustomImageRemove','avatarCustomImageCenter','avatarCustomImageWidth','avatarCustomImageResize'])$(id).disabled=working||!state.image;
  $('avatarCustomImageInput').disabled=working||!ready;
  $('avatarCustomImageUpload').textContent=t(state.image?'imageReplace':'imageUpload');$('avatarCustomImageUpload').setAttribute('aria-busy',String(state.imageLoading));
  $('avatarCustomUpload').setAttribute('aria-busy',String(state.loading));
  $('avatarCustomStage').setAttribute('aria-busy',String(working));
  $('avatarCustomStatus').textContent=t(state.loading?'loading':state.imageLoading?'imageLoading':state.exporting?'exporting':state.assetBusy?'assetWorking':ready?'ready':'empty');
  $('avatarCustomPlayText').textContent=t(state.playing?'pause':'play');$('avatarCustomPlayIcon').textContent=state.playing?'Ⅱ':'▶';
  $('avatarCustomEmpty').hidden=ready;$('avatarCustomScene').hidden=!ready;
  $('avatarCustomSourcebar').hidden=$('avatarCustomToolbar').hidden=!ready;
  $('avatarCustomStage').classList.toggle('upload-ready',!ready);
  $('avatarCustomTextLayer').style.pointerEvents=working?'none':'';
  $('avatarCustomImageLayer').style.pointerEvents=working?'none':'';
  $('avatarCustomImageControls').hidden=!state.image;$('avatarCustomImageLayer').hidden=!state.image;
  if(state.image){$('avatarCustomImageName').textContent=state.image.name;$('avatarCustomImageName').title=state.image.name;$('avatarCustomImageThumb').src=state.image.url}
  syncTabs();syncNotice();syncStyles();syncAssetControls();
  document.dispatchEvent(new CustomEvent('webp:tool-state',{detail:{tool:'avatar',busy:working}}));
}
function syncStyles(){
  for(const button of root.querySelectorAll('button[data-text-style]'))button.setAttribute('aria-pressed',String(state.style===button.dataset.textStyle));
  const plain=state.style==='plain', colorLabel=plain?'colorLabel':'gradientBaseLabel';
  $('avatarCustomHighlightField').hidden=plain;
  $('avatarCustomMidField').hidden=!TEXT_STYLES[state.style].midColor;
  $('avatarCustomColorLabel').textContent=t(colorLabel);
  for(const [id,label] of textColors)$(id+'Value').setAttribute('aria-label',t(id==='avatarCustomColor'?colorLabel:label)+' HEX');
}
function syncHex(id){
  const hex=$(id+'Value');
  hex.value=$(id).value.toUpperCase();
  hex.setAttribute('aria-invalid','false');
}
function chooseStyle(key){
  if(busy()||!state.source||!Object.hasOwn(TEXT_STYLES,key))return;
  state.style=key;const preset=TEXT_STYLES[key];
  state.highlightColor=null;
  state.midColor=null;
  if(preset.baseColor)$('avatarCustomColor').value=preset.baseColor;
  syncStyles();changed();
}
function syncTabs(){
  const locked=busy()||window.Toolkit?.isAvatarBusy?.();
  for(const {tab,name} of avatarModes){
    const button=$(tab), isSelected=state.mode===name;
    button.disabled=!!locked;
    button.setAttribute('aria-selected',String(isSelected));
    button.tabIndex=isSelected?0:-1;
  }
}
function chooseMode(next){
  if(!avatarModes.some(({name})=>name===next)||busy()||window.Toolkit?.isAvatarBusy?.())return false;
  if(state.mode===next)return true;
  window.Toolkit?.pauseAvatar?.();pause();state.mode=next;
  for(const {name,panel} of avatarModes)$(panel).hidden=name!==next;
  syncTabs();
  if(next==='custom')layout();
  return true;
}
function syncLanguage(){
  root.querySelectorAll('[data-custom-i18n]').forEach(node=>node.textContent=t(node.dataset.customI18n));
  $('avatarCustomStylePresets').setAttribute('aria-label',t('stylePresets'));
  $('avatarCustomStage').setAttribute('aria-label',t('uploadTitle'));$('avatarCustomTextLayer').setAttribute('aria-label',t('drag'));$('avatarCustomImageLayer').setAttribute('aria-label',t('imageDrag'));$('avatarCustomImageResize').setAttribute('aria-label',t('imageResize'));
  $('avatarCustomImageResize').title=t('imageResize');
  $('avatarCustomAssetDrag').setAttribute('aria-label',t('moveAssets'));
  if(state.result)renderDownloads();renderAssets();sync();
}
function validSize(){const n=Number($('avatarCustomFontSize').value);return Number.isInteger(n)&&n>=8&&n<=512}
function validStroke(){const n=Number($('avatarCustomStrokeWidth').value);return Number.isFinite(n)&&n>=0&&n<=16}
function syncWeights(){const allowed=weights();for(const option of Array.from($('avatarCustomWeight').options||[]))option.disabled=!allowed.includes(Number(option.value));if(!allowed.includes(weight()))$('avatarCustomWeight').value=weight()>allowed.at(-1)?allowed.at(-1):fonts[$('avatarCustomFont').value][1]}
function waitForRenderer(target){return new Promise((resolve,reject)=>{const start=performance.now();function check(){if(target._renderer?._prepared){resolve();return}if(performance.now()-start>15000){reject(Error('loadError'));return}setTimeout(check,20)}check()})}
function parse(file){return new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('loadError')),15000);new window.SVGA.Parser().load(file,video=>{clearTimeout(timer);resolve(video)},()=>{clearTimeout(timer);reject(Error('loadError'))})})}
function ensurePlayer(){
  if(player)return;
  player=new window.SVGA.Player($('avatarCustomPlayer'));player.clearsAfterStop=false;player.loops=0;player.setContentMode('AspectFit');
  const draw=player._renderer.drawSprite;
  player._renderer.drawSprite=function(sprite,...args){
    const offset=spriteValue(state.assetOffsets,sprite),frame=sprite.frames[this._owner._currentFrame];
    if(!offset||!frame)return draw.call(this,sprite,...args);
    const transform=frame.transform;
    frame.transform={...transform,tx:transform.tx+offset.x,ty:transform.ty+offset.y};
    try{return draw.call(this,sprite,...args)}finally{frame.transform=transform}
  };
  player.onFrame(frame=>{state.frame=frame;syncTime();if(state.assetSelection.size)placeAssetSelection()});
}
function syncTime(){if(!state.source)return;const info=state.source.info;$('avatarCustomTime').textContent=`${((state.frame||0)/info.fps).toFixed(2)} / ${(info.frames/info.fps).toFixed(2)} s`}
function pause(){if(player&&state.video)player.pauseAnimation();state.playing=false;if($('avatarCustomPlayText')){$('avatarCustomPlayText').textContent=t('play');$('avatarCustomPlayIcon').textContent='▶'}}
function layout(){
  if(!state.source||!active())return;
  const {width,height}=state.source.info,zone=$('avatarCustomStage'),scale=Math.min(360/width,360/height,(zone.clientWidth-40)/width,(zone.clientHeight-40)/height);
  const scene=$('avatarCustomScene');scene.style.width=Math.max(1,width*scale)+'px';scene.style.height=Math.max(1,height*scale)+'px';
  placeText();placeImage();if(player&&state.video&&!state.playing&&!busy())player.stepToFrame(state.frame,false);
}
function placeText(){
  const b=state.bitmap;if(!b||!state.source)return;
  const {width,height}=state.source.info,n=$('avatarCustomTextLayer');
  n.style.width=(b.width/width*100)+'%';n.style.height=(b.height/height*100)+'%';
  n.style.left=(state.position.x-b.width/width/2)*100+'%';n.style.top=(state.position.y-b.height/height/2)*100+'%';
  root.dataset.customTextX=String(state.position.x);root.dataset.customTextY=String(state.position.y);
}
function positionImage(layer,image,{width,height}){
  layer.style.width=image.width/width*100+'%';layer.style.height=image.height/height*100+'%';
  layer.style.left=(image.position.x-image.width/width/2)*100+'%';layer.style.top=(image.position.y-image.height/height/2)*100+'%';
}
function placeImage(){
  if(!state.source)return;
  const info=state.source.info,image=state.image;
  for(const added of state.images)positionImage(added.view,added,info);
  placeAssetSelection();
  if(!image)return;
  positionImage($('avatarCustomImageLayer'),image,info);
  $('avatarCustomImageSize').textContent=`${Math.round(image.width)} × ${Number(image.height.toPrecision(4))} px`;
  root.dataset.customImageX=String(image.position.x);root.dataset.customImageY=String(image.position.y);root.dataset.customImageWidth=String(image.width);root.dataset.customImageHeight=String(image.height);
}
function spriteValue(assets,sprite){
  const key=sprite.imageKey;
  return assets.get(key.replace('.matte',''))||assets.get(key);
}
function pickedAssets(){
  const images=new Map(),added=[];
  for(const asset of state.assetSelection)if(asset.view)added.push(asset);else images.set(asset.key,asset);
  const sprites=[];
  for(const sprite of state.video?.sprites||[]){
    const asset=spriteValue(images,sprite);
    if(asset&&sprite.frames.length)sprites.push({sprite,asset});
  }
  return {added,sprites};
}
function seekSelectedAsset(asset){
  pause();
  if(asset.view)return;
  const candidates=pickedAssets().sprites.filter(item=>item.asset===asset);
  if(candidates.some(({sprite})=>sprite.frames[state.frame]?.alpha>=.05))return;
  const frames=candidates.map(({sprite})=>sprite.frames.findIndex(frame=>frame.alpha>=.05)).filter(frame=>frame>=0);
  if(frames.length){
    state.frame=Math.min(...frames);
    player.stepToFrame(state.frame,false);syncTime();
  }
}
function placeAssetSelection(){
  const layer=$('avatarCustomAssetDrag'),hint=$('avatarCustomAssetHint');
  hint.hidden=!state.assetSelection.size;
  if(!state.source||!state.assetSelection.size){layer.hidden=true;return}
  const {added,sprites}=pickedAssets(),movable=added.length||sprites.length;
  const help=t(movable?'moveAssets':'unplacedAssets');
  if(hint.textContent!==help)hint.textContent=help;
  layer.hidden=!movable||busy();
  if(layer.hidden)return;
  const {width,height}=state.source.info;
  let left=Infinity,top=Infinity,right=-Infinity,bottom=-Infinity;
  const include=(x,y)=>{left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y)};
  for(const image of added){
    const x=image.position.x*width,y=image.position.y*height;
    include(x-image.width/2,y-image.height/2);include(x+image.width/2,y+image.height/2);
  }
  for(const {sprite,asset} of sprites){
    const frame=sprite.frames[state.frame];
    if(!frame||frame.alpha<.05)continue;
    const {a,b,c,d,tx,ty}=frame.transform,offset=spriteValue(state.assetOffsets,sprite);
    const w=asset.width||frame.layout.width,h=asset.height||frame.layout.height;
    for(const x of [0,w])for(const y of [0,h])include(a*x+c*y+tx+(offset?.x||0),b*x+d*y+ty+(offset?.y||0));
  }
  if(!Number.isFinite(left)){left=width*.45;top=height*.45;right=width*.55;bottom=height*.55}
  const x=Math.max(0,Math.min(95,left/width*100)),y=Math.max(0,Math.min(95,top/height*100));
  layer.style.left=x+'%';layer.style.top=y+'%';
  layer.style.width=Math.min(100-x,Math.max(5,right/width*100-x))+'%';
  layer.style.height=Math.min(100-y,Math.max(5,bottom/height*100-y))+'%';
}
function movementSnapshot(){
  const {added,sprites}=pickedAssets();
  const keys=new Set(sprites.map(item=>item.asset.key));
  return {
    original:new Map([...keys].map(key=>[key,state.assetOffsets.get(key)||{x:0,y:0}])),
    added:new Map(added.map(image=>[image,{...image.position}])),
  };
}
function moveAssets(snapshot,dx,dy){
  const {width,height}=state.source.info,clamp=value=>Math.max(-32768,Math.min(32768,value));
  for(const [key,offset] of snapshot.original){
    const x=clamp(offset.x+dx),y=clamp(offset.y+dy);
    if(x||y)state.assetOffsets.set(key,{x,y});else state.assetOffsets.delete(key);
  }
  for(const [image,position] of snapshot.added)image.position={x:Math.max(0,Math.min(1,position.x+dx/width)),y:Math.max(0,Math.min(1,position.y+dy/height))};
  placeImage();
  if(state.result)notice('changed','success');
  if(assetPaint===undefined)assetPaint=requestAnimationFrame(()=>{
    assetPaint=undefined;
    if(!state.playing&&!busy()&&state.video)player.stepToFrame(state.frame,false);
  });
}
const imageAspect=(image=state.image)=>image.aspect||image.canvas.width/image.canvas.height;
function validImageWidth(){if(!state.image)return true;const value=Number($('avatarCustomImageWidth').value);return Number.isInteger(value)&&value>=1&&value<=16384&&value/imageAspect()<=16384}
function resizeImage(value){
  if(busy()||!state.image)return false;
  const width=Number(value),height=width/imageAspect(),valid=Number.isInteger(width)&&width>=1&&width<=16384&&height<=16384;
  $('avatarCustomImageWidth').setAttribute('aria-invalid',String(!valid));if(!valid){notice('imageWidthError');sync();return false}
  state.image.width=width;state.image.height=height;$('avatarCustomImageWidth').value=width;placeImage();if(state.result)notice('changed','success');else if(state.notice==='imageWidthError')notice();sync();return true;
}
function removeImage(){
  if(busy()||!state.image)return;
  discardAddedImages(new Set([state.image]));
  renderAssets();if(state.result)notice('changed','success');sync();
}
function selectImage(image){
  state.image=image;imageDrag=null;
  if(image)$('avatarCustomImageWidth').value=Math.round(image.width);
  else $('avatarCustomImageThumb').removeAttribute('src');
  $('avatarCustomImageWidth').setAttribute('aria-invalid','false');
  placeImage();
}
function discardAddedImages(selected){
  for(const image of state.images)if(selected.has(image)){
    URL.revokeObjectURL(image.url);image.view.remove();state.assetSelection.delete(image);
  }
  state.images=state.images.filter(image=>!selected.has(image));
  if(selected.has(state.image))selectImage(state.images.at(-1)||null);
}
async function loadImageFiles(files,add=false){
  if(busy())return;if(!state.source){notice('imageNeedsSvga');return}
  const file=Array.from(files||[])[0];if(!file)return;
  const previous=add?null:state.image;
  if(!previous&&state.images.length>=MAX_ADDED_IMAGES){notice('assetLimit');return}
  if(!/\.(png|jpe?g|webp)$/i.test(file.name||'')&&!/^image\/(png|jpeg|webp)$/i.test(file.type||'')){notice('imageType');return}
  if(file.size>20*1024*1024){notice('imageSizeError');return}
  const resume=state.playing;pause();state.imageLoading=true;notice();sync();let decoded,committed=false;
  const progress=window.UploadProgress?.begin();
  try{
    decoded=await createImageBitmap(file);const w=decoded.width,h=decoded.height;
    if(!Number.isInteger(w)||!Number.isInteger(h)||w<1||h<1||w>8192||h>8192||w*h>32000000)throw Error('imageDimensions');
    const info=state.source.info,scale=Math.min(1,4096/w,4096/h,Math.max(info.width,info.height)*2/Math.max(w,h),Math.sqrt(8000000/(w*h))),canvas=document.createElement('canvas');
    canvas.width=Math.max(1,Math.round(w*scale));canvas.height=Math.max(1,Math.round(h*scale));const ctx=canvas.getContext('2d');ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(decoded,0,0,canvas.width,canvas.height);
    const blob=await toPng(canvas),bytes=new Uint8Array(await blob.arrayBuffer()),aspect=w/h;
    const width=Math.max(1,Math.min(Math.floor(Math.min(16384,16384*aspect)),Math.round(previous?.width||w*Math.min(1,info.width*.4/w,info.height*.4/h))));
    const view=document.createElement('img');view.alt='';view.draggable=false;
    const image={canvas,blob,bytes,view,url:URL.createObjectURL(blob),name:file.name||'image.png',aspect,width,height:width/aspect,position:previous?{...previous.position}:{x:.5,y:.5}};
    view.src=image.url;
    view.addEventListener('click',()=>{if(!busy()){selectImage(image);sync();$('avatarCustomImageLayer').focus({preventScroll:true})}});
    if(previous){
      state.images.splice(state.images.indexOf(previous),1,image);
      if(state.assetSelection.delete(previous))state.assetSelection.add(image);
      URL.revokeObjectURL(previous.url);
    }else state.images.push(image);
    $('avatarCustomAddedImages').replaceChildren(...state.images.map(added=>added.view));
    selectImage(image);renderAssets();committed=true;
    if(state.result)notice('changed','success');
  }catch(error){notice(['imageDimensions'].includes(error.message)?error.message:'imageLoadError')}
  finally{progress?.finish();decoded?.close?.();state.imageLoading=false;if(committed&&resume&&active()&&!document.hidden&&stageVisible&&!matchMedia('(prefers-reduced-motion: reduce)').matches){state.playing=true;player.stepToFrame(state.frame,true)}sync()}
}
function importFiles(files){const list=Array.from(files||[]),file=list[0];if(!file)return;if(/\.(png|jpe?g|webp)$/i.test(file.name||'')||/^image\/(png|jpeg|webp)$/i.test(file.type||''))return loadImageFiles(list);return loadFiles(list)}
const visibleAssets=()=>state.sourceAssets.filter(asset=>!state.removedImages.has(asset.key)).concat(state.images);
function assetName(asset){
  const extension=asset.extension||'png';
  const base=(asset.key??asset.name).replace(/[\\/:*?"<>|\x00-\x1f]/g,'-').replace(/\.(png|jpe?g|webp|gif|bmp)$/i,'').replace(/^\.+/,'').trim().slice(0,120);
  return (base||'image')+'.'+extension;
}
function syncAssetControls(){
  const working=busy(),total=state.sourceAssets.length-state.removedImages.size+state.images.length;
  $('avatarCustomAssets').hidden=!state.source;
  const count=$('avatarCustomAssetCount'),label=t('assetCount').replace('{total}',total).replace('{selected}',state.assetSelection.size);
  if(count.textContent!==label)count.textContent=label;
  $('avatarCustomAssetEmpty').hidden=total!==0;$('avatarCustomAssetList').hidden=total===0;
  $('avatarCustomAssetAdd').disabled=$('avatarCustomAssetInput').disabled=working||state.images.length>=MAX_ADDED_IMAGES;
  $('avatarCustomAssetDelete').disabled=working||!state.assetSelection.size;
  $('avatarCustomAssetRecovery').hidden=!state.removedImages.size;
  $('avatarCustomAssetsRestore').hidden=!state.removedImages.size;$('avatarCustomAssetsRestore').disabled=working;
  for(const control of $('avatarCustomAssetList').querySelectorAll('button,input')){
    control.disabled=working;
    if(control.dataset.imageIndex!==undefined)control.setAttribute('aria-pressed',String(state.images[Number(control.dataset.imageIndex)]===state.image));
  }
  placeAssetSelection();
}
function renderAssets(){
  const rows=visibleAssets().map(asset=>{
    const row=document.createElement('li'),label=document.createElement('label'),check=document.createElement('input'),thumb=document.createElement('img'),description=document.createElement('span'),name=document.createElement('strong'),meta=document.createElement('small');
    row.className='avatar-custom-asset-row';
    label.className='avatar-custom-asset-select';check.type='checkbox';check.checked=state.assetSelection.has(asset);
    check.addEventListener('change',()=>{if(check.checked){state.assetSelection.add(asset);seekSelectedAsset(asset)}else state.assetSelection.delete(asset);syncAssetControls()});
    const filename=assetName(asset);
    thumb.className='avatar-custom-asset-thumb checkerboard';thumb.src=asset.url;thumb.alt='';thumb.loading='lazy';thumb.decoding='async';
    description.className='avatar-custom-asset-label';name.textContent=asset.name||filename;name.title=name.textContent;
    const width=asset.canvas?.width??asset.width,height=asset.canvas?.height??asset.height;
    meta.className='avatar-custom-asset-meta';meta.textContent=t(asset.view?'assetAdded':'assetOriginal')+(width&&height?' · '+width+' × '+height:'');
    description.append(name,meta);label.append(check,thumb,description);row.append(label);
    if(asset.view){
      const edit=document.createElement('button');edit.type='button';edit.className='avatar-custom-secondary';edit.textContent=t('assetEdit');edit.dataset.imageIndex=state.images.indexOf(asset);
      edit.setAttribute('aria-label',t('assetEdit')+' '+name.textContent);
      edit.addEventListener('click',()=>{selectImage(asset);sync();$('avatarCustomImageLayer').focus()});row.append(edit);
    }
    const getFile=document.createElement('button');getFile.type='button';getFile.className='avatar-custom-secondary';getFile.textContent=t('assetDownload');
    getFile.setAttribute('aria-label',t('assetDownload')+' '+name.textContent);
    getFile.addEventListener('click',()=>download({name:filename,url:asset.url}));row.append(getFile);
    return row;
  });
  $('avatarCustomAssetList').replaceChildren(...rows);syncAssetControls();
}
async function editAssets(restore=false){
  if(busy()||!state.source||(restore?!state.removedImages.size:!state.assetSelection.size))return;
  const selection=new Set(state.assetSelection),removed=restore?new Set():new Set(state.removedImages);
  if(!restore)for(const asset of selection)if(!asset.view)removed.add(asset.key);
  const reload=restore||removed.size!==state.removedImages.size,wasPlaying=state.playing,previous=state.video,frame=state.frame;
  if(reload){pause();state.assetBusy=true;notice();sync()}
  try{
    if(reload){
      const bytes=await previewSvgaImages(state.source,[...removed]),video=await parse(new File([bytes],state.file.name));
      player.setVideoItem(video);await waitForRenderer(player);player.stepToFrame(frame,false);
      state.video=video;state.removedImages=removed;
      for(const key of removed)state.assetOffsets.delete(key);
    }
    if(!restore){discardAddedImages(selection);state.assetSelection.clear()}
    renderAssets();notice(state.result?'changed':'','success');
  }catch{
    if(player&&previous){player.setVideoItem(previous);await waitForRenderer(player).catch(()=>{});player.stepToFrame(frame,false)}
    notice('assetError');
  }finally{
    state.assetBusy=false;
    if(reload&&wasPlaying&&active()&&!document.hidden&&stageVisible&&!matchMedia('(prefers-reduced-motion: reduce)').matches){
      state.playing=true;player.stepToFrame(frame,true);
    }
    sync();
    if(state.notice!=='assetError'){
      const next=$('avatarCustomAssetsRestore').hidden?$('avatarCustomAssetAdd'):$('avatarCustomAssetsRestore');
      next.focus({preventScroll:true});
    }
  }
}
async function rasterText(size=Number($('avatarCustomFontSize').value)){
  const raw=$('avatarCustomText').value.replace(/\r/g,''),color=$('avatarCustomColor').value,fontKey=$('avatarCustomFont').value,font=cssFont(size),fontWeight=weight(),strokeWidth=Number($('avatarCustomStrokeWidth').value),strokeColor=$('avatarCustomStrokeColor').value,styleKey=state.style;
  const {highlightColor,midColor}=state;
  if(!raw.trim())return null;
  if(!Number.isInteger(size)||size<8||size>512)throw Error('sizeError');
  if(!validStroke())throw Error('strokeError');
  try{const loaded=await document.fonts.load(font,raw);if(!loaded.length)throw Error('fontError')}catch(error){throw Error('fontError')}
  const lines=raw.split('\n'),measure=document.createElement('canvas').getContext('2d');measure.font=font;
  const padding=Math.ceil(size*.3+strokeWidth+2),width=Math.ceil(Math.max(...lines.map(line=>measure.measureText(line||' ').width))+padding*2),height=Math.ceil(lines.length*size*1.3+padding*2);
  if(width>16384||height>16384)throw Error('textTooLarge');
  const ratio=Math.min(2,4096/width,4096/height,Math.sqrt(12000000/(width*height))),canvas=document.createElement('canvas');
  canvas.width=Math.max(1,Math.ceil(width*ratio));canvas.height=Math.max(1,Math.ceil(height*ratio));
  const ctx=canvas.getContext('2d');ctx.scale(ratio,ratio);
  drawStyledText(ctx,{lines,size,width,padding,font,color,strokeWidth,strokeColor,styleKey,highlightColor,midColor});return {canvas,width,height,fontKey,color,text:raw,fontWeight,strokeWidth,strokeColor,styleKey};
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
  const preset=TEXT_STYLES[state.style];
  $('avatarCustomHighlight').value=state.highlightColor??preset.highlightColor??defaultTextHighlight($('avatarCustomColor').value);
  $('avatarCustomMid').value=state.midColor??preset.midColor??'#FFFFFF';
  for(const [id] of textColors)syncHex(id);
  if(state.result)notice('changed','success');else notice();
  if($('avatarCustomText').value.trim()&&!validSize()){notice('sizeError');sync();return}
  if($('avatarCustomText').value.trim()&&!validStroke()){notice('strokeError');sync();return}
  const task=renderText(),id=state.renderId;task.catch(error=>{if(id===state.renderId)notice(['strokeError','textTooLarge'].includes(error.message)?error.message:'fontError')});
}
async function loadFiles(files){
  if(busy())return;const file=Array.from(files||[])[0];if(!file)return;
  if(!/\.svga$/i.test(file.name)){notice('fileType');return}if(file.size>50*1024*1024){notice('fileSize');return}
  pause();state.loading=true;++state.renderId;notice();sync();
  const progress=window.UploadProgress?.begin();
  const previous=state.video,previousWidth=state.source?.info.width;let imported=false;
  try{
    const bytes=new Uint8Array(await file.arrayBuffer()),source=await readSvga(bytes,{JSZip:window.JSZip});
    const [video,assets]=await Promise.all([parse(file),listSvgaImages(source,measureImage)]);
    const size=state.source?Number($('avatarCustomFontSize').value):Math.max(8,Math.min(64,Math.round(source.info.width*.095))),bitmap=await rasterText(size);
    ensurePlayer();player.setVideoItem(video);await waitForRenderer(player);
    state.source=source;state.video=video;state.file=file;state.frame=0;$('avatarCustomFontSize').value=size;
    if(previousWidth)for(const image of state.images){
      const aspect=imageAspect(image),width=Math.max(1,Math.min(Math.floor(Math.min(16384,16384*aspect)),Math.round(image.width*source.info.width/previousWidth)));
      image.width=width;image.height=width/aspect;
    }
    for(const asset of state.sourceAssets)URL.revokeObjectURL(asset.url);
    state.sourceAssets=assets.map(asset=>({...asset,url:URL.createObjectURL(new Blob([asset.bytes],{type:asset.type}))}));
    state.removedImages.clear();state.assetSelection.clear();state.assetOffsets.clear();assetDrag=null;selectImage(state.image);renderAssets();
    releaseResult(state.result);state.result=null;$('avatarCustomResult').hidden=true;$('avatarCustomDownloads').replaceChildren();
    $('avatarCustomFileName').textContent=file.name;$('avatarCustomFileMeta').textContent=`${source.info.width} × ${source.info.height} · ${source.info.frames} ${isZh()?'帧':'frames'} · ${source.info.fps} FPS`;
    applyBitmap(bitmap);sync();layout();player.stepToFrame(0,false);syncTime();
    root.dataset.customSource=file.name;root.dataset.customFormat=source.format;
    imported=true;
  }catch(error){if(player&&previous){player.setVideoItem(previous);await waitForRenderer(player).catch(()=>{});player.stepToFrame(state.frame,false)}notice(error.message==='fontError'?'fontError':'loadError')}
  finally{progress?.finish();state.loading=false;if(imported&&active()&&!document.hidden&&stageVisible&&!matchMedia('(prefers-reduced-motion: reduce)').matches){state.playing=true;player.stepToFrame(state.frame,true)}sync();layout()}
}
const toPng=canvas=>new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(Error('exportError')),'image/png'));
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
  if(busy()||!state.source)return;const hasText=!!$('avatarCustomText').value.trim();if(!hasText&&!state.images.length&&!state.removedImages.size&&!state.assetOffsets.size){notice('textEmpty');return}if(hasText&&!validSize()){notice('sizeError');return}if(hasText&&!validStroke()){notice('strokeError');return}if(!validImageWidth()){notice('imageWidthError');return}
  pause();state.exporting=true;notice();sync();const started=performance.now(),compression=mode();
  try{
    const bitmap=await renderText();if(hasText&&!bitmap)throw Error('exportError');
    const info=state.source.info,options={maxBytes:3000000,allowLossyOptimization:false,enforceRuntimeBudget:true},textLayer=bitmap?{image:new Uint8Array(await (await toPng(bitmap.canvas)).arrayBuffer()),x:state.position.x*info.width-bitmap.width/2,y:state.position.y*info.height-bitmap.height/2,width:bitmap.width,height:bitmap.height,key:'text'}:null;
    options.removedImageKeys=[...state.removedImages];
    options.imageOffsets=new Map([...state.assetOffsets].filter(([key])=>!state.removedImages.has(key)));
    options.layers=state.images.map(image=>({image:image.bytes,x:image.position.x*info.width-image.width/2,y:image.position.y*info.height-image.height/2,width:image.width,height:image.height,key:'image'}));
    if(textLayer)options.layers.push(textLayer);
    const result=await buildCustomizedSvga(state.source,options,{JSZip:window.JSZip,measureImage});
    if(result.bytes.byteLength>3000000)throw Error('sizeLimit');
    const name=cleanName(state.file.name),svgaName=name+'-custom.svga',webpName=name+'-preview.webp',frame=await firstFrame(result.bytes,svgaName,compression);
    const svga=new Blob([result.bytes],{type:'application/octet-stream'}),zip=new window.JSZip();zip.file(svgaName,svga);zip.file(webpName,frame.blob);const archive=await zip.generateAsync({type:'blob',compression:'STORE'});if(mode()!==compression)throw Error('modeChanged');
    const files=[{name:svgaName,blob:svga},{name:webpName,blob:frame.blob},{name:name+'-custom.zip',blob:archive}];for(const file of files)file.url=URL.createObjectURL(file.blob);
    releaseResult(state.result);state.result={files};const canvas=$('avatarCustomFirstFrame');canvas.getContext('2d').clearRect(0,0,240,240);canvas.getContext('2d').drawImage(frame.canvas,0,0);frame.canvas.width=frame.canvas.height=1;
    renderDownloads();window.Hub?.record('avatar','generated',2);download(files[2]);notice(result.optimized?'optimized':'saved','success');
    root.dataset.customExportBytes=String(svga.size);root.dataset.customExportMs=(performance.now()-started).toFixed(1);root.dataset.customTextKey=hasText?result.imageKey:'';root.dataset.customOverlayKeys=JSON.stringify(result.imageKeys||[result.imageKey]);
    root.dataset.customCompression='lossless';root.dataset.customCompressionStats=JSON.stringify(result.lossless||{});
    root.dataset.customRuntimeBytes=String(result.runtimeBytes);
  }catch(error){notice(['sizeLimit','runtimeLimit','unknownRuntimeSize'].includes(error.code)?error.code:['sizeLimit','fontError','strokeError','textTooLarge'].includes(error.message)?error.message:'exportError')}
  finally{state.exporting=false;sync()}
}
avatarModes.forEach(({tab,name}, index)=>{
  $(tab).addEventListener('click',()=>chooseMode(name));
  $(tab).addEventListener('keydown',event=>{
    let target;
    switch(event.key){
      case 'Home': target=avatarModes[0];break;
      case 'End': target=avatarModes.at(-1);break;
      case 'ArrowLeft': target=avatarModes[(index+avatarModes.length-1)%avatarModes.length];break;
      case 'ArrowRight': target=avatarModes[(index+1)%avatarModes.length];break;
      default: return;
    }
    event.preventDefault();
    if(chooseMode(target.name))$(target.tab).focus();
  });
});
for(const id of ['avatarCustomText','avatarCustomFontSize','avatarCustomStrokeWidth'])$(id).addEventListener('input',changed);
for(const button of root.querySelectorAll('button[data-text-style]')){
  const key=button.dataset.textStyle;
  const stops=textGradientStops(key);
  if(stops.length)button.style.setProperty('--text-preset-fill',
    `linear-gradient(${stops.map(([offset,color])=>`${color} ${offset*100}%`).join(', ')})`);
  button.addEventListener('click',()=>chooseStyle(key));
}
$('avatarCustomWeight').addEventListener('change',changed);
$('avatarCustomFont').addEventListener('change',()=>{syncWeights();changed()});
for(const [id,,override] of textColors){
  const color=$(id),hex=$(id+'Value');
  const update=()=>{
    if(override)state[override]=color.value;
    changed();
  };
  color.addEventListener('input',update);
  hex.addEventListener('input',()=>{
    const value=hex.value.trim();
    if(!/^#?[a-f0-9]{6}$/i.test(value)){hex.setAttribute('aria-invalid','true');return}
    color.value='#'+value.replace(/^#/,'');
    update();
  });
  hex.addEventListener('blur',()=>syncHex(id));
}
$('avatarCustomImageUpload').addEventListener('click',()=>{if(!busy()&&state.source)$('avatarCustomImageInput').click()});
$('avatarCustomImageInput').addEventListener('change',event=>{loadImageFiles(event.target.files);event.target.value=''});
$('avatarCustomAssetAdd').addEventListener('click',()=>$('avatarCustomAssetInput').click());
$('avatarCustomAssetInput').addEventListener('change',event=>{loadImageFiles(event.target.files,true);event.target.value=''});
$('avatarCustomAssetDelete').addEventListener('click',()=>editAssets());
$('avatarCustomAssetsRestore').addEventListener('click',()=>editAssets(true));
$('avatarCustomImageRemove').addEventListener('click',removeImage);
$('avatarCustomImageCenter').addEventListener('click',()=>{if(busy()||!state.image)return;state.image.position={x:.5,y:.5};placeImage();if(state.result)notice('changed','success')});
$('avatarCustomImageWidth').addEventListener('input',event=>resizeImage(event.target.value));
$('avatarCustomImageWidth').addEventListener('blur',()=>{if(!state.image)return;$('avatarCustomImageWidth').value=Math.round(state.image.width);$('avatarCustomImageWidth').setAttribute('aria-invalid','false');if(state.notice==='imageWidthError')notice(state.result?'changed':'',state.result?'success':'error');sync()});
const imageLayer=$('avatarCustomImageLayer'),imageResize=$('avatarCustomImageResize');
const assetLayer=$('avatarCustomAssetDrag');
assetLayer.addEventListener('pointerdown',event=>{
  if(busy()||assetLayer.hidden||event.button!==0)return;
  event.preventDefault();pause();
  const rect=$('avatarCustomScene').getBoundingClientRect();
  assetDrag={...movementSnapshot(),pointer:event.pointerId,x:event.clientX,y:event.clientY,rect};
  assetLayer.setPointerCapture(event.pointerId);assetLayer.focus({preventScroll:true});
});
assetLayer.addEventListener('pointermove',event=>{
  if(busy()||!assetDrag||event.pointerId!==assetDrag.pointer)return;
  const {width,height}=state.source.info;
  moveAssets(assetDrag,(event.clientX-assetDrag.x)*width/assetDrag.rect.width,(event.clientY-assetDrag.y)*height/assetDrag.rect.height);
});
for(const type of ['pointerup','pointercancel','lostpointercapture'])assetLayer.addEventListener(type,()=>{if(assetDrag){assetDrag=null;sync()}});
assetLayer.addEventListener('keydown',event=>{
  const direction={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[event.key];
  if(busy()||assetLayer.hidden||!direction)return;
  event.preventDefault();pause();
  const step=event.shiftKey?10:1;
  moveAssets(movementSnapshot(),direction[0]*step,direction[1]*step);sync();
});
function startImageDrag(event,kind){
  if(busy()||event.button!==0||!state.image)return;event.preventDefault();event.stopPropagation();
  const rect=$('avatarCustomScene').getBoundingClientRect(),image=state.image,info=state.source.info;
  imageDrag={pointer:event.pointerId,kind,x:event.clientX,y:event.clientY,rect,position:{...image.position},width:image.width,height:image.height,left:image.position.x*info.width-image.width/2,top:image.position.y*info.height-image.height/2};imageLayer.setPointerCapture(event.pointerId);imageLayer.focus();
}
imageLayer.addEventListener('pointerdown',event=>{if(event.target!==imageResize)startImageDrag(event,'move')});
imageResize.addEventListener('pointerdown',event=>startImageDrag(event,'resize'));
imageLayer.addEventListener('pointermove',event=>{
  if(busy()||!imageDrag||!state.image||event.pointerId!==imageDrag.pointer)return;
  const info=state.source.info,dx=(event.clientX-imageDrag.x)/imageDrag.rect.width*info.width,dy=(event.clientY-imageDrag.y)/imageDrag.rect.height*info.height;
  if(imageDrag.kind==='move'){state.image.position.x=Math.max(0,Math.min(1,imageDrag.position.x+dx/info.width));state.image.position.y=Math.max(0,Math.min(1,imageDrag.position.y+dy/info.height));placeImage()}
  else{const aspect=imageAspect(),width=Math.max(1,Math.min(Math.floor(Math.min(16384,16384*aspect)),Math.round(imageDrag.width+(dx+dy/aspect)/(1+1/(aspect*aspect)))));resizeImage(width);state.image.position.x=Math.max(0,Math.min(1,(imageDrag.left+state.image.width/2)/info.width));state.image.position.y=Math.max(0,Math.min(1,(imageDrag.top+state.image.height/2)/info.height));placeImage()}
});
function stopImageDrag(){if(!imageDrag)return;imageDrag=null;if(state.result)notice('changed','success')}
for(const type of ['pointerup','pointercancel','lostpointercapture'])imageLayer.addEventListener(type,stopImageDrag);
imageLayer.addEventListener('keydown',event=>{
  if(busy()||!state.image)return;
  if(['Delete','Backspace'].includes(event.key)){event.preventDefault();removeImage();return}
  if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;event.preventDefault();
  const step=event.shiftKey?10:1,info=state.source.info;state.image.position.x=Math.max(0,Math.min(1,state.image.position.x+({ArrowLeft:-step,ArrowRight:step}[event.key]||0)/info.width));state.image.position.y=Math.max(0,Math.min(1,state.image.position.y+({ArrowUp:-step,ArrowDown:step}[event.key]||0)/info.height));placeImage();if(state.result)notice('changed','success');
});
imageResize.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)||busy()||!state.image)return;event.preventDefault();event.stopPropagation();const step=(event.shiftKey?10:1)*(['ArrowRight','ArrowDown'].includes(event.key)?1:-1);resizeImage(Math.max(1,Math.round(state.image.width)+step))});
imageResize.addEventListener('click',()=>{if(!busy()&&state.image){$('avatarCustomImageWidth').focus();$('avatarCustomImageWidth').select?.()}});
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
window.UploadPaste?.register({zone:$('avatarCustomStage'),isActive:active,isBusy:busy,onFiles:importFiles});
document.addEventListener('dragover',event=>{if(active()&&Array.from(event.dataTransfer?.types||[]).includes('Files')){event.preventDefault();$('avatarCustomStage').classList.add('drag')}});
document.addEventListener('dragleave',event=>{if(!event.relatedTarget)$('avatarCustomStage').classList.remove('drag')});
document.addEventListener('drop',event=>{if(!active()||!event.dataTransfer?.files.length)return;event.preventDefault();$('avatarCustomStage').classList.remove('drag');importFiles(event.dataTransfer.files)});
document.addEventListener('visibilitychange',()=>{if(document.hidden)pause()});window.addEventListener('hashchange',()=>{if(!active())pause();else layout()});
window.addEventListener('pagehide',()=>{pause();releaseResult(state.result)});
matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change',event=>{if(event.matches)pause()});
new ResizeObserver(layout).observe($('avatarCustomStage'));
new IntersectionObserver(entries=>{stageVisible=entries[0].isIntersecting;if(!stageVisible)pause()}).observe($('avatarCustomStage'));
new MutationObserver(syncLanguage).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
new MutationObserver(syncTabs).observe(root,{subtree:true,attributes:true,attributeFilter:['aria-busy']});
window.AvatarCustom={isSelected:selected,syncLanguage,pause};syncWeights();syncLanguage();
