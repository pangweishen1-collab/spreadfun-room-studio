// Controller behavior only. Real alpha, image quality and timing need browser/file checks.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const elements=new Map(),urls=new Map(),downloads=[],revoked=[],images=[],renders=[],encodes=[],feedback=[],reveals=[],cleanup=[],contextDraws=[],contextClears=[];
const documentListeners=new Map(),windowListeners=new Map(),timers=new Map(),mattingCalls=[];
let serial=0,holdLoads=false,holdEncode=null,encodeError=false,wrongMime=false,downloadError=false;
let mattingRun=async()=>({width:2,height:2,data:new Uint8ClampedArray([0,255,255,0])});
function element(tag='div'){
  const classes=new Set(),listeners=new Map(),listenerOptions=new Map(),attributes=new Map();let value='';
  const properties=new Map();
  return {tagName:tag.toUpperCase(),dataset:{},children:[],hidden:false,disabled:false,width:200,height:200,textContent:'',files:[],scrollTop:0,scrollHeight:1600,listenerOptions,style:{setProperty(name,value){properties.set(name,String(value))},getPropertyValue(name){return properties.get(name)||''}},
    get value(){return value},set value(next){value=String(next);if(this.clearFilesOnEmpty&&value==='')this.files.length=0},
    classList:{add:name=>classes.add(name),remove:name=>classes.delete(name),contains:name=>classes.has(name),toggle(name,on){if(on)classes.add(name);else classes.delete(name)}},
    setAttribute(name,v){attributes.set(name,String(v))},getAttribute:name=>attributes.get(name),removeAttribute:name=>attributes.delete(name),
    append(...nodes){this.children.push(...nodes)},replaceChildren(...nodes){this.children=nodes},remove(){},
    addEventListener(name,handler,options){listeners.set(name,handler);listenerOptions.set(name,options)},fire(name,event={}){return listeners.get(name)?.(event)},
    click(){this.clickCount=(this.clickCount||0)+1;if(this.download){if(downloadError)throw Error('download blocked');downloads.push({name:this.download,url:this.href})}listeners.get('click')?.({preventDefault(){}})},
    querySelectorAll(){return []},focus(options){this.focused=true;(this.focusCalls??=[]).push(options);document.activeElement=this},setPointerCapture(id){this.pointer=id},hasPointerCapture(id){return this.pointer===id},releasePointerCapture(){this.pointer=null},
    getBoundingClientRect(){return {left:0,top:0,width:200,height:200}},
    getContext(){return this.context??={clearRect(...args){contextClears.push(args)},drawImage(image,...args){this.image=image;contextDraws.push({image,args,settings:image.renderedSettings&&{...image.renderedSettings},sequence:image.renderSequence})},getImageData(){const data=new Uint8ClampedArray(32*32*4).fill(255);for(let i=0;i<Math.round((this.image?.file.alphaClear||0)*1024);i++)data[i*4+3]=0;return {data}}}}
  };
}
function get(selector){if(!elements.has(selector))elements.set(selector,element());return elements.get(selector)}
for(const id of ['Width','Height'])get('#giftPreview'+id).value=200;
for(const [id,value,min,max] of [['Zoom',100,25,300],['Feather',10,0,20],['Radius',22,0,50],['Saturation',100,0,200],['Brightness',100,0,200],['Contrast',100,0,200],['Rotation',0,-180,180],['BrushSize',20,1,100],['BrushHardness',70,0,100],['BrushOpacity',100,1,100],['SafeInset',10,5,25]])Object.assign(get('#giftPreview'+id),{value,min,max});
get('#giftPreviewInput').clearFilesOnEmpty=true;
const toggleIcon=element('svg'),toggleLabel=element('span'),toggleControl=get('#giftPreviewContextToggle');toggleLabel.dataset.giftToggleLabel='';toggleControl.children=[toggleIcon,toggleLabel];
Object.defineProperty(toggleControl,'textContent',{get(){return this.children.map(child=>child.textContent).join('')},set(value){this.children=[];this.clearedText=value}});
toggleControl.querySelector=selector=>selector==='[data-gift-toggle-label]'?toggleControl.children.find(child=>'giftToggleLabel' in child.dataset):null;
const mattingIcon=element('svg'),mattingLabel=element('span'),mattingControl=get('#giftPreviewRemoveBackground');mattingLabel.dataset.giftMattingLabel='';mattingControl.children=[mattingIcon,mattingLabel];
Object.defineProperty(mattingControl,'textContent',{get(){return this.children.map(child=>child.textContent).join('')},set(value){this.children=[];this.clearedText=value}});
mattingControl.querySelector=selector=>selector==='[data-gift-matting-label]'?mattingControl.children.find(child=>'giftMattingLabel' in child.dataset):null;
const heading=element();heading.dataset.giftI18n='title';get('#giftPreviewTool').querySelectorAll=()=>[heading];
const document={body:element('body'),querySelector:get,createElement:element,addEventListener(name,handler){documentListeners.set(name,handler)}};
class MockImage {
  constructor(){images.push(this)}
  set src(url){this.url=url;this.file=urls.get(url);if(!holdLoads)queueMicrotask(()=>this.complete())}
  complete(){if(this.file.bad){this.onerror();return}this.naturalWidth=this.file.width||400;this.naturalHeight=this.file.height||300;this.onload()}
}
const sandbox={document,language:'zh',location:{hash:'#gift-previews'},Image:MockImage,Blob,Uint8ClampedArray,
  URL:{createObjectURL(value){const url='blob:gift-'+(++serial);urls.set(url,value);return url},revokeObjectURL(url){revoked.push(url)}},
  requestAnimationFrame(callback){const id=++serial;queueMicrotask(()=>callback(1));return id},cancelAnimationFrame(){},setTimeout(callback,delay){const id=++serial;timers.set(id,{callback,delay});cleanup.push(()=>{if(timers.has(id)){timers.delete(id);callback()}});return id},clearTimeout(id){timers.delete(id)},
  canvasToLosslessWebP:async canvas=>{encodes.push({width:canvas.width,height:canvas.height});if(holdEncode)await holdEncode;if(encodeError)throw Error('encode failed');return new Blob(['gift pixels'],{type:wrongMime?'image/png':'image/webp'})},
  window:{addEventListener(name,handler){windowListeners.set(name,handler)},GiftBackground:{remove(image,options){mattingCalls.push({image,options});return mattingRun(image,options)}},FunToolkitUI:{setState(tool,value){assert.equal(tool,'gift-preview');feedback.push({...value})},reveal(node){reveals.push(node)}}}
};
let source=fs.readFileSync(path.join(__dirname,'../gift-preview.js'),'utf8');
const marker='window.GiftPreviewTool={activate,syncLanguage};';assert.ok(source.includes(marker),'test injection point must match the public API');
source=source.replace(marker,marker+'window.test={state,loadFiles,chooseMode,changeSize,center,download,removeBackground,setBackground,pointerDown,pointerMove,stopDrag,align,zoomWheel,setView,syncContextPreview,history,commitEdit,historyStep,setTool,rotate};');
vm.createContext(sandbox);
for(const module of ['gift-preview-history.js','gift-preview-render.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'..',module),'utf8'),sandbox);
sandbox.window.GiftPreviewRenderer.render=(canvas,image,settings)=>{renders.push({canvas,image,width:canvas.width,height:canvas.height,settings:{...settings}});canvas.renderedSettings={...settings};canvas.renderSequence=renders.length};
vm.runInContext(source,sandbox);
const api=sandbox.window.test,canvas=get('#giftPreviewCanvas');
const file=(name='scene.webp',extra={})=>({name,type:'image/webp',size:100,width:400,height:300,alphaClear:0,...extra});
const flush=()=>new Promise(resolve=>setImmediate(resolve));
const input=(id,value)=>{const target=get('#giftPreview'+id);target.value=value;target.fire('input',{target})};
const pointer=(extra={})=>({button:0,pointerId:7,clientX:20,clientY:20,preventDefault(){},...extra});
const click=id=>get('#giftPreview'+id).fire('click');
const commit=id=>get('#giftPreview'+id).fire('change');
const runTimers=max=>{for(const [id,{callback,delay}] of [...timers])if(delay<=max){timers.delete(id);callback()}};
const assertMattingProgress=(percent,visible=true)=>{const progress=get('#giftPreviewMattingProgress');assert.equal(progress.hidden,!visible);assert.equal(progress.getAttribute('aria-valuenow'),String(percent));assert.equal(progress.style.getPropertyValue('--gift-progress'),String(percent/100));assert.equal(get('#giftPreviewMattingPercent').textContent,percent+'%')};
const key=(key,extra={})=>{const event={key,target:canvas,prevented:false,preventDefault(){this.prevented=true},...extra};get('#giftPreviewTool').fire('keydown',event);return event};
const stroke=(points=[{clientX:80,clientY:80},{clientX:120,clientY:100}])=>{canvas.fire('pointerdown',pointer(points[0]));for(const point of points.slice(1))canvas.fire('pointermove',pointer(point));canvas.fire('pointerup',pointer(points.at(-1)))};
const wheel=(extra={})=>{const event={deltaY:-100,deltaMode:0,prevented:false,preventDefault(){this.prevented=true},...extra};canvas.fire('wheel',event);return event};
async function freshDownload(){const before=encodes.length,count=downloads.length;await api.download();assert.equal(encodes.length,before+1);assert.equal(downloads.length,count+1);assert.ok(api.state.download);return api.state.download}
async function cachedDownload(){const before=encodes.length,count=downloads.length,blob=api.state.download.blob;await api.download();assert.equal(encodes.length,before);assert.equal(downloads.length,count+1);assert.equal(api.state.download.blob,blob);return api.state.download}
(async()=>{
  const markup=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
  assert.match(markup,/id="giftPreviewTitle" data-gift-i18n="title">礼物&amp;座驾预览图生产工具<\/h1>/);assert.equal(heading.textContent,'礼物&座驾预览图生产工具');assertMattingProgress(0,false);
  assert.match(markup,/gift-preview\.js\?v=20261025-quality1/);assert.match(markup,/toolkit\.js\?v=20261025-gift-nav1/);
  const edgeTag=markup.match(/<details\b[^>]*\bid="giftPreviewFeatherField"[^>]*>/)?.[0],colorTag=markup.match(/<details\b[^>]*\bid="giftPreviewColorField"[^>]*>/)?.[0],advancedTag=markup.match(/<details\b[^>]*\bid="giftPreviewAdvanced"[^>]*>/)?.[0];
  const compositionTag=markup.match(/<details\b[^>]*\bid="giftPreviewCompositionField"[^>]*>/)?.[0];
  assert.ok(compositionTag&&!/\sopen(?:\s|=|>)/.test(compositionTag),'position controls use a native disclosure and start collapsed');
  const toggleMarkup=markup.match(/<button\b[^>]*\bid="giftPreviewContextToggle"[^>]*>([\s\S]*?)<\/button>/)?.[1];assert.match(toggleMarkup,/<svg\b[^>]*class="gift-switch-icon"[\s\S]*?<\/svg>\s*<span data-gift-toggle-label>/,'the switch icon precedes its separately translated label');
  assert.ok(edgeTag,'edge controls use a native disclosure');assert.ok(!/\sopen(?:\s|=|>)/.test(edgeTag),'edge controls start collapsed');assert.ok(colorTag&&/\sopen(?:\s|=|>)/.test(colorTag),'color controls start expanded');
  assert.ok(advancedTag&&!/\sopen(?:\s|=|>)/.test(advancedTag),'retouch and transform controls start collapsed');
  assert.equal(api.state.side,200);assert.equal(get('#giftPreviewWidth').value,'200');assert.equal(get('#giftPreviewHeight').value,'200');assert.equal(api.state.settings.offsetX,0);assert.equal(get('#giftPreviewDownload').disabled,true);assert.equal(feedback.at(-1).phase,'empty');
  assert.equal(canvas.listenerOptions.get('wheel').passive,false,'the canvas wheel handler can prevent page scroll while it zooms');
  for(const id of ['AlignHorizontal','AlignVertical','ContextToggle'])assert.equal(get('#giftPreview'+id).disabled,true,'image actions are disabled before import');
  assert.equal(get('#giftPreviewRemoveBackground').disabled,true);assert.equal(get('#giftPreviewRemoveBackground').textContent,'一键抠图');assert.equal(get('#giftPreviewRemoveBackground').getAttribute('aria-busy'),'false');await api.removeBackground();assert.equal(mattingCalls.length,0,'background removal cannot start without a source');
  assert.equal(toggleLabel.textContent,'礼物栏效果图');assert.equal(toggleControl.children[0],toggleIcon,'initial localization preserves the leading switch icon');
  const emptyRevision=api.state.revision;assert.equal(wheel().prevented,false);api.align('horizontal');api.align('vertical');api.setView('context');assert.equal(api.state.view,'edit');assert.equal(api.state.settings.zoom,1);assert.equal(api.state.revision,emptyRevision,'empty-image gestures do not change pixels');
  assert.equal(get('#giftPreviewStage').getAttribute('role'),'group');assert.equal(get('#giftPreviewStage').getAttribute('tabindex'),undefined,'upload contains one native button, without a nested button role');assert.equal(get('#giftPreviewStage').getAttribute('aria-label'),'点击或拖入礼物图片');assert.match(canvas.getAttribute('aria-label'),/方向键调整位置/);
  await api.download();assert.equal(downloads.length,0);assert.equal(encodes.length,0);
  const uploadButton=get('#giftPreviewUpload');uploadButton.focus();await api.loadFiles([file('initial-broken.webp',{bad:true})]);assert.equal(document.activeElement,uploadButton,'failed initial imports do not move focus');assert.equal(canvas.focusCalls,undefined);assert.equal(api.state.image,null);

  // Emulate a live FileList which clears as soon as the native input value resets.
  const original=file();holdLoads=true;const upload=get('#giftPreviewInput');uploadButton.focus();upload.files.push(original);upload.value='C:\\fakepath\\scene.webp';upload.fire('change',{target:upload});
  assert.equal(upload.value,'');assert.equal(upload.files.length,0);assert.equal(api.state.loading,true);assert.equal(get('#giftPreviewInput').disabled,true);assert.equal(get('#giftPreviewDownload').disabled,true);assert.equal(feedback.at(-1).phase,'loading');
  const loadingImages=images.length;await api.loadFiles([file('ignored.webp')]);assert.equal(images.length,loadingImages,'busy imports cannot start another decode');api.chooseMode('transparent');assert.equal(api.state.mode,'feather');
  assert.equal(wheel().prevented,false);api.align('horizontal');api.setView('context');assert.equal(api.state.view,'edit');assert.equal(api.state.settings.zoom,1,'loading blocks canvas gestures');
  images.at(-1).complete();holdLoads=false;await flush();assert.equal(api.state.file,original,'snapshot survives the native input clearing');assert.equal(api.state.mode,'feather');assert.equal(api.state.loading,false);assert.equal(canvas.hidden,false);assert.equal(get('#giftPreviewDownload').disabled,false);assert.equal(feedback.at(-1).phase,'ready');
  assert.equal(document.activeElement,canvas,'successful initial upload restores keyboard focus to the visible canvas');assert.equal(canvas.focusCalls.length,1);assert.equal(canvas.focusCalls[0].preventScroll,true);assert.equal(get('#giftPreviewStage').getAttribute('aria-label'),'效果预览');
  assert.ok(revoked.includes(images.at(-1).url),'temporary source URL is released after image decoding');

  const saturationControl=get('#giftPreviewSaturation');saturationControl.focus();await api.loadFiles([file('cutout.webp',{alphaClear:.6})]);assert.equal(api.state.mode,'transparent','mostly transparent alpha suggests the artwork treatment');assert.equal(get('#giftPreviewFeatherField').hidden,true);assert.equal(document.activeElement,saturationControl,'an import initiated outside the upload area does not steal focus');assert.equal(canvas.focusCalls.length,1);
  api.chooseMode('feather');assert.equal(api.state.mode,'feather');assert.equal(get('#giftPreviewFeatherField').hidden,false);const replaceButton=get('#giftPreviewReplace');replaceButton.focus();await api.loadFiles([file('manual.webp',{alphaClear:.7})]);assert.equal(api.state.mode,'feather','an explicitly selected treatment is retained on replacement');assert.equal(document.activeElement,replaceButton,'replacement keeps focus at its existing source control');assert.equal(canvas.focusCalls.length,1);
  api.chooseMode('transparent');assert.equal(api.state.mode,'transparent');
  const initial=await freshDownload();assert.equal(initial.name,'manual-gift-preview-200x200.webp');assert.equal(initial.blob.type,'image/webp');assert.equal(encodes.at(-1).width,200);assert.equal(encodes.at(-1).height,200);assert.equal(feedback.at(-1).phase,'success');
  await cachedDownload();
  const current=api.state.download,revision=api.state.revision,renderCount=renders.length;
  api.setBackground('transparent');sandbox.language='en';sandbox.window.GiftPreviewTool.syncLanguage();await flush();assert.equal(api.state.background,'transparent');assert.equal(get('#giftPreviewStage').dataset.background,'transparent');assert.equal(api.state.download,current);assert.equal(api.state.revision,revision);assert.equal(renders.length,renderCount,'background and language never redraw output pixels');assert.equal(heading.textContent,'Gift & vehicle preview maker');await cachedDownload();
  assert.equal(get('#giftPreviewStage').getAttribute('aria-label'),'Preview');assert.match(canvas.getAttribute('aria-label'),/use arrow keys to position/);
  assert.ok(renders.every(call=>!('background' in call.settings)&&!('language' in call.settings)),'preview presentation never enters renderer parameters');

  // Validation/decode errors preserve the preceding image and valid receipt.
  const previous=api.state.image,validDownload=api.state.download;
  for(const [files,notice] of [[[file('bad.txt')],'typeError'],[[file('bad.webp',{type:'image/svg+xml'})],'typeError'],[[file('large.webp',{size:30*1024*1024+1})],'fileSizeError'],[[file(),file()],'fileCount'],[[file('broken.webp',{bad:true})],'loadError'],[[file('huge.webp',{width:10000,height:10000})],'pixelError']]){
    replaceButton.focus();const focusCount=canvas.focusCalls.length;await api.loadFiles(files);assert.equal(api.state.notice,notice);assert.equal(api.state.image,previous);assert.equal(api.state.download,validDownload);assert.equal(api.state.loading,false);assert.equal(feedback.at(-1).phase,'error');assert.equal(document.activeElement,replaceButton);assert.equal(canvas.focusCalls.length,focusCount,'a failed replacement never shifts focus to the canvas');
  }
  for(const value of ['',0,15,2049,12.5,'bad']){input('Width',value);assert.equal(api.state.valid,false);assert.equal(get('#giftPreviewDownload').disabled,true);assert.equal(api.state.download,null);const count=downloads.length;await api.download();assert.equal(downloads.length,count)}
  input('Height',384);assert.equal(api.state.valid,true);assert.equal(api.state.side,384);assert.equal(get('#giftPreviewWidth').value,'384');assert.equal(get('#giftPreviewHeight').value,'384');await freshDownload();assert.equal(api.state.download.name,'manual-gift-preview-384x384.webp');
  for(const [id,value,key,expected] of [['Zoom',140,'zoom',1.4],['Saturation',120,'saturation',120],['Brightness',110,'brightness',110],['Contrast',90,'contrast',90],['Feather',12,'feather',12],['Radius',25,'radius',25]]){
    input(id,value);assert.equal(api.state.settings[key],expected);assert.equal(api.state.download,null,id+' changes invalidate encoded output');await freshDownload();
  }
  api.chooseMode('feather');assert.equal(api.state.download,null);await freshDownload();

  // Each axis command centers only its own axis, without changing the remaining composition.
  canvas.fire('pointerdown',pointer());canvas.fire('pointermove',pointer({clientX:100,clientY:60}));canvas.fire('pointerup',pointer());
  const alignedZoom=api.state.settings.zoom,alignedSaturation=api.state.settings.saturation,alignedSide=api.state.side;
  get('#giftPreviewAlignHorizontal').fire('click');assert.equal(api.state.settings.offsetX,0);assert.equal(api.state.settings.offsetY,.2,'horizontal alignment preserves vertical placement');
  canvas.fire('pointerdown',pointer());canvas.fire('pointermove',pointer({clientX:80,clientY:20}));canvas.fire('pointerup',pointer());
  get('#giftPreviewAlignVertical').fire('click');assert.equal(api.state.settings.offsetX,.3,'vertical alignment preserves horizontal placement');assert.equal(api.state.settings.offsetY,0);
  assert.equal(api.state.settings.zoom,alignedZoom);assert.equal(api.state.settings.saturation,alignedSaturation);assert.equal(api.state.side,alignedSide);get('#giftPreviewAlignHorizontal').fire('click');

  // Wheel units produce the same physical movement; the zoom range remains synchronized and bounded.
  input('Zoom',100);const wheelRevision=api.state.revision;const pixels=wheel({deltaY:-16});const pixelZoom=api.state.settings.zoom;
  assert.equal(pixels.prevented,true);assert.ok(pixelZoom>1);assert.equal(get('#giftPreviewZoom').value,String(Math.round(pixelZoom*100)));assert.equal(get('#giftPreviewZoomValue').textContent,Math.round(pixelZoom*100)+'%');assert.ok(api.state.revision>wheelRevision);
  input('Zoom',100);wheel({deltaY:-1,deltaMode:1});assert.equal(api.state.settings.zoom,pixelZoom,'line wheel units match their pixel distance');
  input('Zoom',100);wheel({deltaY:-200});const pagePixelsZoom=api.state.settings.zoom;input('Zoom',100);wheel({deltaY:-1,deltaMode:2});assert.equal(api.state.settings.zoom,pagePixelsZoom,'page wheel units use the rendered canvas height');
  wheel({deltaY:-1e9});assert.equal(api.state.settings.zoom,3);assert.equal(get('#giftPreviewZoom').value,'300');await freshDownload();const maxReceipt=api.state.download,maxRevision=api.state.revision;
  assert.equal(wheel({deltaY:-100}).prevented,true);assert.equal(api.state.settings.zoom,3);assert.equal(api.state.revision,maxRevision);assert.equal(api.state.download,maxReceipt,'wheel movement beyond the maximum preserves an already encoded result');
  wheel({deltaY:1e9});assert.equal(api.state.settings.zoom,.25);assert.equal(get('#giftPreviewZoomValue').textContent,'25%');
  for(const extra of [{ctrlKey:true},{metaKey:true},{deltaY:0},{deltaY:NaN},{deltaY:Infinity}]){const zoom=api.state.settings.zoom,revision=api.state.revision;assert.equal(wheel(extra).prevented,false);assert.equal(api.state.settings.zoom,zoom);assert.equal(api.state.revision,revision,'browser zoom and invalid wheel events are not consumed')}
  input('Zoom',100);await flush();await freshDownload();

  // The room preview consumes the latest editor pixels without entering the export settings or invalidating its Blob.
  const context=get('#giftPreviewContext'),contextCanvas=get('#giftPreviewContextCanvas'),contextButton=get('#giftPreviewContextToggle');
  const contextReceipt=api.state.download,contextRevision=api.state.revision;get('#giftPreviewContextToggle').fire('click');
  assert.equal(api.state.view,'context');assert.equal(context.hidden,false);assert.equal(get('#giftPreviewStage').dataset.view,'context');assert.equal(context.scrollTop,context.scrollHeight,'the room preview starts at its gift panel');
  assert.equal(reveals.at(-1),context,'the newly shown panel uses the shared entrance animation');
  assert.equal(contextButton.getAttribute('aria-pressed'),'true');assert.equal(contextButton.getAttribute('aria-label'),'Gift image preview');assert.equal(api.state.revision,contextRevision);assert.equal(api.state.download,contextReceipt);assert.equal(get('#giftPreviewBackgroundBlack').disabled,true);
  assert.equal(contextDraws.at(-1).image,canvas);assert.deepEqual(contextDraws.at(-1).args,[0,0,contextCanvas.width,contextCanvas.height]);assert.ok(contextClears.length>0);
  assert.equal(wheel().prevented,false,'room preview scroll does not zoom the editor');assert.equal(api.state.settings.zoom,1);
  input('Saturation',73);await flush();const copied=contextDraws.at(-1);assert.equal(copied.image,canvas);assert.equal(copied.settings.saturation,73);assert.equal(copied.sequence,canvas.renderSequence,'the room receives the newest rendered frame');assert.equal(api.state.download,null);
  await freshDownload();const roomReceipt=api.state.download,roomRevision=api.state.revision;get('#giftPreviewTool').fire('keydown',{key:'Escape',preventDefault(){this.prevented=true}});
  assert.equal(api.state.view,'edit');assert.equal(context.hidden,true);assert.equal(contextButton.getAttribute('aria-pressed'),'false');assert.equal(document.activeElement,contextButton,'Escape returns keyboard focus to its preview toggle');assert.equal(api.state.download,roomReceipt);assert.equal(api.state.revision,roomRevision);
  assert.equal(reveals.at(-1),canvas,'returning to editing animates the newly shown canvas');
  api.setView('context');api.setView('edit');assert.equal(api.state.download,roomReceipt);await cachedDownload();
  assert.ok(renders.every(call=>!('view' in call.settings)&&!('background' in call.settings)&&!('context' in call.settings)),'room presentation is excluded from every render and export parameter set');

  // Work-in-progress output cannot re-enter, edit its parameters or reuse a stale Blob.
  input('Brightness',130);let finish;holdEncode=new Promise(resolve=>finish=resolve);const beforeBusy=downloads.length,pending=api.download();await flush();
  assert.equal(api.state.exporting,true);assert.equal(get('#giftPreviewDownload').getAttribute('aria-busy'),'true');for(const id of ['Input','Width','Height','ModeFeather','ModeTransparent','Zoom','Saturation','Center','Reset','AlignHorizontal','AlignVertical','ContextToggle'])assert.equal(get('#giftPreview'+id).disabled,true);
  const mode=api.state.mode,side=api.state.side,brightness=api.state.settings.brightness,image=api.state.image;api.chooseMode('transparent');input('Width',256);input('Brightness',160);await api.loadFiles([file('busy.webp')]);await api.download();assert.equal(api.state.mode,mode);assert.equal(api.state.side,side);assert.equal(api.state.settings.brightness,brightness);assert.equal(api.state.image,image);assert.equal(downloads.length,beforeBusy);
  const busyZoom=api.state.settings.zoom,busyRevision=api.state.revision;assert.equal(wheel().prevented,false);api.align('horizontal');api.align('vertical');api.setView('context');assert.equal(api.state.view,'edit');assert.equal(api.state.settings.zoom,busyZoom);assert.equal(api.state.revision,busyRevision,'encoding blocks alignment, wheel zoom and preview switching');
  finish();await pending;holdEncode=null;assert.equal(downloads.length,beforeBusy+1);assert.equal(api.state.exporting,false);assert.equal(get('#giftPreviewDownload').disabled,false);

  // Pointer coordinates remain relative to the fixed preview instead of output resolution.
  canvas.fire('pointerdown',pointer());assert.equal(canvas.pointer,7);assert.equal(canvas.focused,true);canvas.fire('pointermove',pointer({pointerId:99,clientX:120}));assert.equal(api.state.settings.offsetX,0);
  canvas.fire('pointermove',pointer({clientX:120,clientY:70}));assert.equal(api.state.settings.offsetX,.5);assert.equal(api.state.settings.offsetY,.25);assert.equal(api.state.download,null);canvas.fire('pointermove',pointer({clientX:1000,clientY:-1000}));assert.equal(api.state.settings.offsetX,1);assert.equal(api.state.settings.offsetY,-1);canvas.fire('pointerup',pointer());assert.equal(canvas.pointer,null);
  get('#giftPreviewCenter').fire('click');assert.equal(api.state.settings.offsetX,0);assert.equal(api.state.settings.offsetY,0);
  canvas.fire('keydown',{key:'ArrowRight',preventDefault(){}});assert.equal(api.state.settings.offsetX,1/384);canvas.fire('keydown',{key:'ArrowDown',shiftKey:true,preventDefault(){}});assert.equal(api.state.settings.offsetY,10/384);canvas.fire('keydown',{key:'Home',preventDefault(){}});assert.equal(api.state.settings.offsetX,0);assert.equal(api.state.settings.offsetY,0);
  canvas.fire('pointerdown',pointer());canvas.fire('pointermove',pointer({clientX:80}));canvas.fire('dblclick');assert.equal(api.state.settings.offsetX,0);canvas.fire('pointercancel',pointer());
  get('#giftPreviewReset').fire('click');assert.equal(api.state.settings.zoom,1);assert.equal(api.state.settings.saturation,100);assert.equal(api.state.settings.brightness,100);assert.equal(api.state.settings.contrast,100);assert.equal(api.state.settings.feather,10);assert.equal(api.state.settings.radius,22);assert.equal(api.state.settings.offsetX,0);assert.equal(get('#giftPreviewBrightness').value,'100');assert.equal(api.state.side,384,'reset retains output dimensions');await freshDownload();

  // One drag, slider gesture or wheel burst is one undo step, rather than one step per event.
  await api.loadFiles([file('advanced.webp',{width:400,height:200})]);assert.equal(api.history.canUndo(),false,'a successful replacement starts a clean history');click('Reset');assert.equal(api.history.canUndo(),false,'resetting already-neutral artwork does not add a phantom step');
  input('Brightness',110);input('Brightness',120);input('Brightness',130);commit('Brightness');
  click('Undo');assert.equal(api.state.settings.brightness,100);assert.equal(api.history.canUndo(),false,'one range gesture is one step');click('Redo');assert.equal(api.state.settings.brightness,130);
  await api.loadFiles([file('advanced.webp',{width:400,height:200})]);
  wheel({deltaY:-50});wheel({deltaY:-50});const burstZoom=api.state.settings.zoom;runTimers(220);assert.ok(burstZoom>1);
  click('Undo');assert.equal(api.state.settings.zoom,1);assert.equal(api.history.canUndo(),false,'one wheel burst is one step');click('Redo');assert.equal(api.state.settings.zoom,burstZoom);
  await api.loadFiles([file('advanced.webp',{width:400,height:200})]);
  canvas.fire('pointerdown',pointer({clientX:50,clientY:50}));canvas.fire('pointermove',pointer({clientX:70,clientY:70}));canvas.fire('pointermove',pointer({clientX:100,clientY:90}));canvas.fire('pointerup',pointer({clientX:100,clientY:90}));
  assert.equal(api.state.settings.offsetX,.25);assert.equal(api.state.settings.offsetY,.2);click('Undo');assert.equal(api.state.settings.offsetX,0);assert.equal(api.state.settings.offsetY,0);assert.equal(api.history.canUndo(),false,'a position drag is one step');click('Redo');assert.equal(api.state.settings.offsetX,.25);

  // Brush settings are captured at pointer-down. Editing their controls affects only later strokes.
  api.chooseMode('transparent');await api.loadFiles([file('advanced.webp',{width:400,height:200})]);
  click('ToolErase');input('BrushSize',20);input('BrushHardness',40);input('BrushOpacity',60);
  canvas.fire('pointerdown',pointer({isPrimary:false,pointerId:9,clientX:80,clientY:80}));assert.equal(canvas.pointer,null,'a secondary pointer cannot start a brush stroke');
  canvas.fire('pointerdown',pointer({clientX:80,clientY:80}));canvas.fire('pointerdown',pointer({isPrimary:false,pointerId:9,clientX:120,clientY:120}));
  for(const name of ['pointerup','pointercancel','lostpointercapture']){canvas.fire(name,pointer({pointerId:9}));assert.equal(canvas.pointer,7);assert.equal(api.state.strokes.length,0,'another touch ending cannot commit the active brush stroke')}
  canvas.fire('pointermove',pointer({clientX:120,clientY:100}));canvas.fire('pointerup',pointer({clientX:120,clientY:100}));assert.equal(get('#giftPreviewClearErase').disabled,false,'the first committed brush stroke immediately enables Clear erasing');
  assert.equal(api.state.strokes.length,1);const erased=api.state.strokes,firstStroke=erased[0];
  assert.equal(firstStroke.mode,'erase');assert.equal(firstStroke.hardness,.4);assert.equal(firstStroke.opacity,.6);assert.ok(firstStroke.points.length>=2);
  click('Undo');assert.equal(api.state.strokes.length,0);assert.equal(api.history.canUndo(),false,'one complete brush stroke is one history entry');click('Redo');assert.equal(api.state.strokes,erased);
  await freshDownload();assert.equal(renders.at(-1).settings.strokes,erased,'export receives the same committed retouch list as the preview');const neutralReceipt=api.state.download,neutralRevision=api.state.revision,firstSize=firstStroke.size;
  input('BrushSize',40);input('BrushHardness',90);input('BrushOpacity',25);
  const safeToggle=get('#giftPreviewSafeToggle');safeToggle.checked=true;safeToggle.fire('change',{target:safeToggle});input('SafeInset',15);
  assert.equal(api.state.download,neutralReceipt);assert.equal(api.state.revision,neutralRevision,'safe guides and future brush parameters do not invalidate exported pixels');assert.equal(api.state.safe.enabled,true);assert.equal(get('#giftPreviewSafeArea').hidden,false);assert.equal(get('#giftPreviewSafeArea').style.getPropertyValue('--gift-safe-inset'),'15%');await cachedDownload();
  assert.equal(firstStroke.size,firstSize);assert.equal(firstStroke.hardness,.4);assert.equal(firstStroke.opacity,.6,'existing strokes retain their captured settings');
  const firstPointCount=firstStroke.points.length;click('ToolRestore');stroke([{clientX:90,clientY:80},{clientX:130,clientY:100}]);const restored=api.state.strokes,secondStroke=restored[1];
  assert.equal(secondStroke.mode,'restore');assert.equal(secondStroke.hardness,.9);assert.equal(secondStroke.opacity,.25);assert.equal(secondStroke.size,firstSize*2);assert.equal(api.state.download,null,'actual painting invalidates the download');
  assert.equal(firstStroke.points.length,firstPointCount,'new strokes never append points to a historical stroke');
  click('Undo');assert.equal(api.state.strokes,erased);click('Redo');assert.equal(api.state.strokes,restored);
  assert.ok(renders.every(call=>!('safe' in call.settings)&&!('brush' in call.settings)),'safe guides and the next brush configuration are never exported');

  // A captured pointer can leave the canvas; re-entry must not join the distant stroke sections.
  click('ToolErase');canvas.fire('pointerdown',pointer({clientX:20,clientY:80}));canvas.fire('pointermove',pointer({clientX:240,clientY:80}));canvas.fire('pointermove',pointer({clientX:180,clientY:80}));canvas.fire('pointerup',pointer({clientX:180,clientY:80}));
  assert.equal(api.state.strokes.at(-1).points[1].break,true,'an out-of-bounds move breaks the stroke before re-entry');
  canvas.fire('pointerdown',pointer({clientX:20,clientY:80}));canvas.fire('pointerleave');canvas.fire('pointermove',pointer({clientX:180,clientY:80}));canvas.fire('pointerup',pointer({clientX:180,clientY:80}));
  assert.equal(api.state.strokes.at(-1).points[1].break,true,'pointerleave also breaks a stroke when there was no out-of-bounds move');

  // Brush samples live in original-image coordinates, including non-square rotated and flipped sources.
  await api.loadFiles([file('mapped.webp',{width:400,height:200})]);input('Rotation',90);commit('Rotation');click('FlipHorizontal');click('ToolErase');
  stroke([{clientX:100,clientY:50},{clientX:100,clientY:50}]);
  const mapped=api.state.strokes[0].points[0];assert.ok(Math.abs(mapped.x-.25)<1e-12);assert.ok(Math.abs(mapped.y-.5)<1e-12,'a 90-degree rotation and canvas-horizontal flip map display points back to the source');
  const projected=sandbox.window.GiftPreviewRenderer.toCanvasPoint(400,200,canvas.width,{...api.state.settings,mode:api.state.mode},mapped);
  assert.ok(Math.abs(projected.x-.5)<1e-12);assert.ok(Math.abs(projected.y-.25)<1e-12);
  const anchoredStroke=api.state.strokes[0];click('RotateRight');click('FlipVertical');assert.equal(api.state.strokes[0],anchoredStroke,'later composition edits retain source-anchored brush samples');
  click('Undo');assert.equal(api.state.settings.flipY,false);click('Redo');assert.equal(api.state.settings.flipY,true);
  click('ClearErase');assert.equal(api.state.strokes.length,0);click('Undo');assert.equal(api.state.strokes[0],anchoredStroke,'clearing erasing is reversible');click('Redo');assert.equal(api.state.strokes.length,0);click('Undo');
  click('Reset');assert.equal(api.state.settings.rotation,0);assert.equal(api.state.settings.flipX,false);assert.equal(api.state.settings.flipY,false);assert.equal(api.state.strokes.length,0);click('Undo');assert.equal(api.state.settings.rotation,180);assert.equal(api.state.settings.flipX,true);assert.equal(api.state.settings.flipY,true);assert.equal(api.state.strokes[0],anchoredStroke,'reset restores through history as a single step');

  // Failed replacements preserve retouch work and history, whereas a successful image starts anew.
  const beforeBadStrokes=api.state.strokes,beforeBadHistory=api.history.current(),beforeBadImage=api.state.image;
  await api.loadFiles([file('corrupt.webp',{bad:true})]);assert.equal(api.state.image,beforeBadImage);assert.equal(api.state.strokes,beforeBadStrokes);assert.equal(api.history.current(),beforeBadHistory);assert.equal(api.history.canUndo(),true);
  await api.loadFiles([file('replaced.webp',{width:400,height:200})]);assert.equal(api.state.strokes.length,0);assert.equal(api.history.canUndo(),false);assert.equal(api.history.canRedo(),false);assert.equal(api.state.settings.rotation,0);assert.equal(api.state.tool,'move');

  // Closing advanced editing exits the brush; global undo leaves editable fields' native history alone.
  click('ToolErase');const advanced=get('#giftPreviewAdvanced');advanced.open=false;advanced.fire('toggle');assert.equal(api.state.tool,'move');
  click('RotateRight');assert.equal(api.state.settings.rotation,90);const editableTarget={closest:()=>({tagName:'INPUT'})};
  assert.equal(key('z',{ctrlKey:true,target:editableTarget}).prevented,false);assert.equal(api.state.settings.rotation,90,'native input undo is not intercepted');
  assert.equal(key('z',{metaKey:true}).prevented,true);assert.equal(api.state.settings.rotation,0);assert.equal(key('z',{ctrlKey:true,shiftKey:true}).prevented,true);assert.equal(api.state.settings.rotation,90);
  click('ToolErase');const sizeBeforeKey=api.state.brush.size;assert.equal(key(']').prevented,true);assert.equal(api.state.brush.size,sizeBeforeKey+1);assert.equal(key('Escape').prevented,true);assert.equal(api.state.tool,'move');
  click('Reset');await freshDownload();

  // Export busy state locks the new editing and history commands as well as the existing controls.
  input('Contrast',105);commit('Contrast');let finishAdvanced;holdEncode=new Promise(resolve=>finishAdvanced=resolve);const advancedPending=api.download();await flush();
  for(const id of ['ToolMove','ToolErase','ToolRestore','BrushSize','BrushHardness','BrushOpacity','Rotation','RotateLeft','RotateRight','FlipHorizontal','FlipVertical','SafeToggle','Undo','Redo'])assert.equal(get('#giftPreview'+id).disabled,true,id+' is locked during encoding');
  const lockedSettings=JSON.stringify(api.state.settings),lockedTool=api.state.tool,lockedBrush=JSON.stringify(api.state.brush),lockedStrokes=api.state.strokes;
  click('ToolErase');click('RotateRight');click('FlipHorizontal');click('ClearErase');click('Undo');click('Redo');input('Rotation',45);input('BrushSize',60);canvas.fire('pointerdown',pointer());
  assert.equal(key('z',{ctrlKey:true}).prevented,false);assert.equal(JSON.stringify(api.state.settings),lockedSettings);assert.equal(api.state.tool,lockedTool);assert.equal(JSON.stringify(api.state.brush),lockedBrush);assert.equal(api.state.strokes,lockedStrokes);assert.equal(canvas.pointer,null);
  finishAdvanced();await advancedPending;holdEncode=null;

  // Matting is a local asynchronous edit: no re-entry, no lost source, and one reversible mask.
  sandbox.language='zh';sandbox.window.GiftPreviewTool.syncLanguage();
  await api.loadFiles([file('matting.webp')]);api.chooseMode('feather');input('Brightness',119);commit('Brightness');click('ToolErase');stroke();await freshDownload();
  const mattingImage=api.state.image,mattingFile=api.state.file,mattingSettings=JSON.stringify(api.state.settings),mattingStrokes=api.state.strokes,mattingReceipt=api.state.download,mattingRevision=api.state.revision;
  let resolveMatting;mattingRun=()=>new Promise(resolve=>resolveMatting=resolve);const pendingMatting=click('RemoveBackground');
  assert.equal(mattingCalls.length,1);assert.equal(mattingCalls[0].image,mattingImage);assert.equal(api.state.removing,true);assert.equal(api.state.baseMask,null);assert.equal(api.state.download,mattingReceipt,'loading the model preserves the previous valid receipt');assert.equal(feedback.at(-1).phase,'processing');assert.equal(feedback.at(-1).message,'正在抠图…');
  for(const id of ['Upload','Replace','Input','ModeFeather','ModeTransparent','Width','Height','Zoom','Saturation','Brightness','Contrast','Center','Reset','AlignHorizontal','AlignVertical','ContextToggle','Download','RemoveBackground','ToolMove','ToolErase','ToolRestore','BrushSize','BrushHardness','BrushOpacity','Rotation','RotateLeft','RotateRight','FlipHorizontal','FlipVertical','SafeToggle','Undo','Redo','ClearErase'])assert.equal(get('#giftPreview'+id).disabled,true,id+' is locked during background removal');
  assert.equal(get('#giftPreviewRemoveBackground').getAttribute('aria-busy'),'true');assert.equal(get('#giftPreviewRemoveBackground').textContent,'正在抠图…');assert.equal(get('#giftPreviewStage').getAttribute('aria-busy'),'true');
  assertMattingProgress(0);assert.equal(get('#giftPreviewMattingProgress').getAttribute('aria-label'),'抠图进度');assert.equal(mattingControl.children[0],mattingIcon);
  mattingCalls[0].options.onProgress({phase:'analyzing',progress:.05});assertMattingProgress(5);mattingCalls[0].options.onProgress({phase:'analyzing',progress:.01});assertMattingProgress(5);mattingCalls[0].options.onProgress({phase:'analyzing',progress:.1});assertMattingProgress(10);
  mattingCalls[0].options.onProgress({phase:'loading',progress:.42});assert.match(feedback.at(-1).message,/加载抠图组件.*42%/);
  assertMattingProgress(42);
  sandbox.language='en';sandbox.window.GiftPreviewTool.syncLanguage();assert.equal(get('#giftPreviewRemoveBackground').textContent,'Removing background…');assert.match(feedback.at(-1).message,/Loading background removal.*42%/);assert.equal(toggleLabel.textContent,'Gift panel preview');assert.equal(toggleControl.children[0],toggleIcon,'busy language changes preserve the switch icon');
  assert.equal(heading.textContent,'Gift & vehicle preview maker');assert.equal(get('#giftPreviewMattingProgress').getAttribute('aria-label'),'Background removal progress');assertMattingProgress(42);assert.equal(mattingControl.children[0],mattingIcon,'translations preserve the background removal icon');
  mattingCalls[0].options.onProgress({phase:'processing',progress:.6});assert.equal(feedback.at(-1).message,'Removing background…');
  assertMattingProgress(60);mattingCalls[0].options.onProgress({phase:'loading',progress:.1});assertMattingProgress(60);mattingCalls[0].options.onProgress({phase:'processing',progress:0});assertMattingProgress(60);mattingCalls[0].options.onProgress({phase:'unrecognized',progress:.99});assertMattingProgress(60);
  const imageCount=images.length,downloadCount=downloads.length,encodeCount=encodes.length,inputClicks=get('#giftPreviewInput').clickCount||0;
  await api.removeBackground();await api.loadFiles([file('busy-matting.webp')]);await api.download();api.chooseMode('transparent');input('Width',256);input('Brightness',160);input('Rotation',45);input('BrushSize',60);api.align('horizontal');api.setView('context');
  for(const id of ['Reset','ClearErase','RotateRight','FlipHorizontal','ToolRestore','Undo','Redo'])click(id);
  for(const id of ['Replace','Upload'])get('#giftPreview'+id).fire('click',{stopPropagation(){}});
  canvas.fire('pointerdown',pointer());assert.equal(wheel().prevented,false);assert.equal(key('z',{ctrlKey:true}).prevented,false);
  assert.equal(mattingCalls.length,1);assert.equal(images.length,imageCount);assert.equal(downloads.length,downloadCount);assert.equal(encodes.length,encodeCount);assert.equal(get('#giftPreviewInput').clickCount||0,inputClicks);assert.equal(canvas.pointer,null);assert.equal(api.state.image,mattingImage);assert.equal(JSON.stringify(api.state.settings),mattingSettings);assert.equal(api.state.strokes,mattingStrokes);assert.equal(api.state.mode,'feather');assert.equal(api.state.side,384);assert.equal(api.state.view,'edit');assert.equal(api.state.revision,mattingRevision);assert.equal(api.state.download,mattingReceipt);
  const mask={width:2,height:2,data:new Uint8ClampedArray([0,255,255,0]),method:'ai'};resolveMatting(mask);await pendingMatting;await flush();
  assert.equal(api.state.removing,false);assert.equal(api.state.removeProgress,null);assert.equal(api.state.baseMask,mask);assert.equal(api.state.mode,'transparent');assert.equal(api.state.modeChosen,true);assert.equal(api.state.image,mattingImage);assert.equal(api.state.file,mattingFile);assert.equal(JSON.stringify(api.state.settings),mattingSettings);assert.equal(api.state.strokes,mattingStrokes);assert.equal(api.state.download,null);assert.equal(renders.at(-1).settings.baseMask,mask,'preview receives the source-coordinate AI mask');assert.equal(get('#giftPreviewRemoveBackground').getAttribute('aria-busy'),'false');assert.equal(get('#giftPreviewRemoveBackground').textContent,'Restore background');
  assertMattingProgress(100);assert.equal(get('#giftPreviewDownload').disabled,false,'completion feedback never delays export');assert.equal(get('#giftPreviewRemoveBackground').dataset.method,'ai');assert.ok(Number.isFinite(mask.elapsedMs));assert.equal(get('#giftPreviewRemoveBackground').dataset.processingMs,String(mask.elapsedMs));runTimers(449);assertMattingProgress(100);
  await freshDownload();assert.equal(renders.at(-1).settings.baseMask,mask,'export receives the same mask as the preview');
  assertMattingProgress(100);runTimers(450);assertMattingProgress(100,false);
  click('Undo');assert.equal(api.state.baseMask,null);assert.equal(api.state.mode,'feather');assert.equal(api.state.strokes,mattingStrokes);assert.equal(JSON.stringify(api.state.settings),mattingSettings);click('Redo');assert.equal(api.state.baseMask,mask);assert.equal(api.state.mode,'transparent');
  sandbox.language='zh';sandbox.window.GiftPreviewTool.syncLanguage();assert.equal(get('#giftPreviewRemoveBackground').textContent,'还原背景');await click('RemoveBackground');assert.equal(api.state.baseMask,null);assert.equal(mattingCalls.length,1,'restoring the original background needs no second model run');assert.equal(get('#giftPreviewRemoveBackground').textContent,'一键抠图');
  click('Undo');assert.equal(api.state.baseMask,mask,'restoring the background is itself undoable');click('Redo');assert.equal(api.state.baseMask,null);click('Undo');assert.equal(api.state.baseMask,mask);
  click('Reset');assert.equal(api.state.baseMask,null);click('Undo');assert.equal(api.state.baseMask,mask,'reset includes the mask in its single history entry');
  const maskedHistory=api.history.current();await api.loadFiles([file('bad-matted.webp',{bad:true})]);assert.equal(api.state.baseMask,mask);assert.equal(api.history.current(),maskedHistory,'a failed replacement preserves the mask history');
  await api.loadFiles([file('new-matting.webp')]);assert.equal(api.state.baseMask,null);assert.equal(api.history.canUndo(),false,'a new source clears the previous mask and its history');

  // Failed inference leaves the source, composition, strokes, history and cached output usable.
  input('Saturation',112);commit('Saturation');click('ToolErase');stroke();await freshDownload();
  const failedImage=api.state.image,failedSettings=JSON.stringify(api.state.settings),failedStrokes=api.state.strokes,failedHistory=api.history.current(),failedReceipt=api.state.download,failedRevision=api.state.revision;
  mattingRun=async()=>{throw Error('model unavailable')};await click('RemoveBackground');
  assert.equal(api.state.notice,'removeError');assert.equal(api.state.removing,false);assert.equal(api.state.removeProgress,null);assert.equal(api.state.baseMask,null);assert.equal(api.state.image,failedImage);assert.equal(JSON.stringify(api.state.settings),failedSettings);assert.equal(api.state.strokes,failedStrokes);assert.equal(api.history.current(),failedHistory);assert.equal(api.state.download,failedReceipt);assert.equal(api.state.revision,failedRevision);assert.equal(get('#giftPreviewRemoveBackground').disabled,false);assert.equal(feedback.at(-1).phase,'error');assert.match(get('#giftPreviewNotice').textContent,/原图已保留/);await cachedDownload();
  assertMattingProgress(0,false);assert.equal([...timers.values()].filter(timer=>timer.delay===450).length,0,'failures never schedule a success flash');
  sandbox.language='en';sandbox.window.GiftPreviewTool.syncLanguage();assert.equal(get('#giftPreviewRemoveBackground').textContent,'Remove background');assert.match(get('#giftPreviewRemoveBackground').title,/stays on this device/);assert.equal(toggleControl.children[0],toggleIcon);assert.equal(toggleLabel.textContent,'Gift panel preview');api.setView('context');assert.equal(toggleLabel.textContent,'Gift image preview');assert.equal(toggleControl.children[0],toggleIcon,'changing preview modes updates only the label');api.setView('edit');

  // Worker stages already report one global normalized fraction. The UI must
  // not weight that fraction a second time or regress between model phases.
  mattingRun=async(image,options)=>{options.onProgress({phase:'analyzing',progress:.1});assertMattingProgress(10);options.onProgress({phase:'matting',progress:.5});assertMattingProgress(50);options.onProgress({phase:'matting',progress:.25});assertMattingProgress(50);return {width:2,height:2,data:new Uint8ClampedArray([0,255,255,0]),method:'light-matte'}};
  await click('RemoveBackground');assertMattingProgress(100);const staleCompletion=[...timers.values()].find(timer=>timer.delay===450).callback;
  await click('RemoveBackground');assertMattingProgress(0,false);assert.equal([...timers.values()].filter(timer=>timer.delay===450).length,0,'restoring the background clears the success timer');
  let rejectRetry;mattingRun=(image,options)=>{options.onProgress({phase:'processing',progress:0});assertMattingProgress(0);options.onProgress({phase:'processing',progress:.8});assertMattingProgress(80);return new Promise((resolve,reject)=>rejectRetry=reject)};const retry=click('RemoveBackground');assertMattingProgress(80);staleCompletion();assertMattingProgress(80);rejectRetry(Error('failed after processing began'));await retry;assertMattingProgress(0,false);
  const completeFast=async()=>{mattingRun=async()=>({width:2,height:2,data:new Uint8ClampedArray([0,255,255,0]),method:'light-matte'});await click('RemoveBackground');assertMattingProgress(100)};
  await completeFast();click('Reset');assertMattingProgress(0,false);await completeFast();await api.loadFiles([file('progress-replaced.webp')]);assertMattingProgress(0,false);
  await completeFast();sandbox.location.hash='#resources';windowListeners.get('hashchange')();assertMattingProgress(0,false);sandbox.location.hash='#gift-previews';sandbox.window.GiftPreviewTool.activate();assertMattingProgress(0,false);await click('RemoveBackground');
  let finishAway;mattingRun=()=>new Promise(resolve=>finishAway=resolve);const away=click('RemoveBackground');const awayProgress=mattingCalls.at(-1).options.onProgress;awayProgress({phase:'loading',progress:.4});assertMattingProgress(40);sandbox.location.hash='#resources';windowListeners.get('hashchange')();assertMattingProgress(0,false);awayProgress({phase:'processing',progress:1});assertMattingProgress(0,false);finishAway({width:2,height:2,data:new Uint8ClampedArray([0,255,255,0])});await away;assertMattingProgress(0,false);sandbox.location.hash='#gift-previews';sandbox.window.GiftPreviewTool.activate();assertMattingProgress(0,false);

  // Wrong formats, failed encodes and failed native download requests never report success.
  input('Saturation',110);let count=downloads.length;wrongMime=true;await api.download();wrongMime=false;assert.equal(api.state.notice,'exportError');assert.equal(api.state.download,null);assert.equal(downloads.length,count);assert.equal(feedback.at(-1).phase,'error');
  encodeError=true;await api.download();encodeError=false;assert.equal(api.state.notice,'exportError');assert.equal(api.state.download,null);assert.equal(downloads.length,count);assert.equal(api.state.exporting,false);await freshDownload();
  const retainedReceipt=api.state.download,beforeFailure=encodes.length;downloadError=true;await api.download();downloadError=false;assert.equal(api.state.notice,'downloadError');assert.equal(api.state.download,retainedReceipt,'a blocked cached download preserves its valid receipt');assert.equal(encodes.length,beforeFailure);count=downloads.length;await cachedDownload();assert.equal(downloads.length,count+1);
  api.setView('context');assert.equal(api.state.view,'context');sandbox.location.hash='#resources';canvas.fire('pointerdown',pointer());windowListeners.get('hashchange')();assert.equal(canvas.pointer,null);assert.equal(api.state.view,'edit');assert.equal(context.hidden,true);assert.equal(api.state.download!==null,true);const activeUrl=api.state.download.url;cleanup.forEach(fn=>fn());assert.ok(!revoked.includes(activeUrl),'delayed cleanup does not revoke the active receipt');
  console.log('PASS: gift controller upload/alpha/size/download/cache/context/alignment/wheel/focus; grouped history, source-anchored retouch, multi-pointer isolation, immediate clear availability, transforms, safe guides and busy locks; collapsed composition, persistent switch icon, bilingual matting progress, reversible local masks, protected inference and failure/cache preservation.');
})().catch(error=>{console.error(error);process.exitCode=1});
