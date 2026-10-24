// Run with Node.js. Browser integration and real WebP checks are documented separately.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const elements=new Map(),storage=new Map(),links=[];
const events=[],feedback=[],reveals=[],activations=[],players=[];
const latestFeedback=()=>feedback.at(-1);
const recorded=type=>events.filter(event=>event.tool==='avatar'&&event.type===type).reduce((total,event)=>total+event.count,0);
let nextVideo=null,parseFails=false,encodeFails=false,downloadClicks=0,holdParser=false,pendingParser=null,holdRenderers=false;
const docListeners=new Map();
function element(){
  const classes=new Set(),listeners=new Map();
  return {style:{},dataset:{},value:'240',textContent:'',width:240,height:240,children:[],disabled:false,
    classList:{add(x){classes.add(x)},remove(x){classes.delete(x)},toggle(x,on){if(on)classes.add(x);else classes.delete(x)},contains(x){return classes.has(x)}},
    contains(target){return this===target},setAttribute(k,v){this[k]=v},removeAttribute(k){delete this[k]},append(...xs){this.children.push(...xs)},replaceChildren(...xs){this.children=xs},remove(){},click(){downloadClicks++;listeners.get('click')?.({button:0,defaultPrevented:false,target:this})},
    addEventListener(k,fn){listeners.set(k,fn)},fire(k,event={}){return listeners.get(k)?.(event)},querySelector(){return this.children.find(x=>x.isCanvas)||null},
    getContext(){return {clearRect(){},drawImage(){}}}
  };
}
const get=selector=>{if(!elements.has(selector))elements.set(selector,element());return elements.get(selector)};
links.push(get('roomLink'),get('avatarLink'),get('bannerLink'));links[0].dataset.toolLink='room';links[1].dataset.toolLink='avatar';links[2].dataset.toolLink='banner';
const doc={hidden:false,body:element(),title:'',querySelector:get,querySelectorAll:s=>s==='[data-tool-link]'?links:[],createElement:tag=>Object.assign(element(),{isCanvas:tag==='canvas'}),addEventListener(k,fn){docListeners.set(k,fn)}};
class MockPlayer {
  constructor(host){this.host=host;this.steps=[];this._renderer={_prepared:true};players.push(this);host.append(Object.assign(element(),{isCanvas:true}))}
  setContentMode(){}onFrame(fn){this.callback=fn}setVideoItem(video){this.video=video;this._renderer._prepared=!holdRenderers}pauseAnimation(){this.paused=true}stepToFrame(frame,andPlay){this.steps.push({frame,andPlay});this.lastFrame=frame;this.paused=!andPlay}
}
const video=()=>({videoSize:{width:320,height:320},frames:60,FPS:30});
const sandbox={document:doc,window:{addEventListener(){},FunToolkitUI:{setState(tool,value){assert.equal(tool,'avatar');feedback.push({...value})},reveal(target){reveals.push(target)},activate(tool){activations.push(tool)}},Hub:{record(tool,type,count=1){events.push({tool,type,count})}}},location:{hash:'#avatar-frames'},language:'en',localStorage:{getItem:k=>storage.get(k)},SVGA:{Player:MockPlayer,Parser:class{load(file,success,failure){const complete=()=>parseFails?failure(Error('bad')):success(nextVideo||video());if(holdParser)pendingParser=complete;else queueMicrotask(complete)}}},JSZip:{},ResizeObserver:class{observe(){}},IntersectionObserver:class{observe(){}},performance,URL:{createObjectURL:()=> 'blob:test',revokeObjectURL(){}},Blob,Uint8Array,Number,Math,Array,Object,Promise,Error,String,Date,setTimeout,clearTimeout,matchMedia:()=>({matches:false,addEventListener(){}}),canvasToWebP:async()=>{if(encodeFails)throw Error('encode failed');return new Blob(['test'],{type:'image/webp'})},setLanguage(value){sandbox.language=value}};
sandbox.window.SVGA=sandbox.SVGA;sandbox.window.JSZip=sandbox.JSZip;
sandbox.window.Hub.activate=()=>{};sandbox.window.Hub.syncLanguage=()=>{};
let source=fs.readFileSync(path.join(__dirname,'../toolkit.js'),'utf8');
source=source.replace('window.Toolkit={syncLanguage};','window.Toolkit={syncLanguage};window.test={state,loadSvga,seek,togglePlayback,changeDimension,exportFrame,activateTool,syncLanguage,validateVideo};');
vm.createContext(sandbox);vm.runInContext(source,sandbox);const api=sandbox.window.test;
const file={name:'ring.svga',size:100,slice:()=>({arrayBuffer:async()=>new Uint8Array([0x78,0xda,0,0]).buffer})};
(async()=>{
  assert.equal(latestFeedback().phase,'empty','an untouched avatar tool exposes the shared empty state');
  assert.equal(api.state.active,'avatar');assert.equal(activations.at(-1),'avatar','the shared layer activates after route visibility is applied');assert.equal(get('#roomTool').classList.contains('hidden'),true);assert.equal(links[1]['aria-current'],'page');
  await api.exportFrame();assert.equal(events.length,0,'exporting without an animation must not count');
  // Snapshot the incoming live FileList before awaiting its first read.
  holdParser=true;holdRenderers=true;
  const selection=[file];const loading=api.loadSvga({[Symbol.iterator]:()=>selection[Symbol.iterator]()});selection.length=0;
  assert.equal(latestFeedback().phase,'loading','loading must cover validation, parser and renderer work');
  assert.equal(get('#svgaUpload')['aria-busy'],'true');assert.equal(get('#svgaReplace')['aria-busy'],'true');assert.equal(get('#frameDownload')['aria-busy'],'false');
  sandbox.language='zh';api.syncLanguage();assert.equal(latestFeedback().phase,'loading');assert.equal(latestFeedback().message,'正在读取动画…','an in-flight loading label follows language changes');
  await new Promise(resolve=>setTimeout(resolve,0));assert.equal(typeof pendingParser,'function');assert.equal(latestFeedback().phase,'loading');
  holdParser=false;pendingParser();pendingParser=null;await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(latestFeedback().phase,'loading','a parsed animation stays loading until both renderer asset sets are prepared');assert.equal(reveals.length,0);
  holdRenderers=false;for(const instance of players)instance._renderer._prepared=true;await loading;
  assert.equal(latestFeedback().phase,'ready');assert.equal(reveals.length,2,'newly imported player and first-frame preview reveal once');
  sandbox.language='en';api.syncLanguage();assert.equal(reveals.length,2,'language updates do not replay the preview reveal');
  assert.equal(api.state.video.frames,60);assert.equal(api.state.loading,false);assert.equal(get('#frameDownload').disabled,false);
  // With ordinary motion preferences, initial and replacement uploads still wait for Play.
  assert.equal(api.state.frame,0);assert.equal(get('#svgaFrameNumber').value,1);assert.equal(api.state.playing,false);
  assert.equal(events.length,0,'upload and first-frame preview must not count');
  const hiddenStepsBeforeExport=players[1].steps.length;
  const firstExport=api.exportFrame();assert.equal(latestFeedback().phase,'processing');assert.equal(get('#frameDownload')['aria-busy'],'true');assert.equal(get('#svgaUpload')['aria-busy'],'false');
  await firstExport;assert.equal(latestFeedback().phase,'success');assert.equal(reveals.length,3,'only a new export result reveals');assert.equal(api.state.download,'ring-frame-001-240x240.webp');assert.equal(downloadClicks,1);assert.equal(api.state.playing,false);
  assert.equal(recorded('generated'),1);assert.equal(recorded('download'),1,'successful export encodes and requests one download');
  assert.equal(players[1].steps.length,hiddenStepsBeforeExport,'240px export reuses the exact paused preview rather than re-rendering its hidden canvas');
  get('#svgaPlay').fire('click');assert.equal(api.state.playing,true);
  await api.loadSvga([{...file,name:'replacement.svga'}]);
  assert.equal(api.state.frame,0);assert.equal(get('#svgaFrameNumber').value,1);assert.equal(api.state.playing,false);assert.equal(get('#frameDownload').disabled,false);
  const revealsAfterReplacement=reveals.length;
  get('#svgaPlay').fire('click');assert.equal(api.state.playing,true);
  const hiddenStepsBeforeSeek=players[1].steps.length;
  api.seek(27);assert.equal(players[1].steps.length,hiddenStepsBeforeSeek+1,'seeking renders only the new frame');assert.equal(reveals.length,revealsAfterReplacement,'playing and scrubbing frames never restart reveal motion');assert.equal(api.state.frame,27);assert.equal(get('#svgaFrameNumber').value,28);assert.equal(api.state.playing,false);
  api.togglePlayback();assert.equal(api.state.playing,true);get('#svgaFrameNumber').fire('focus');assert.equal(api.state.playing,false);
  get('#svgaFrameNumber').value='40';get('#svgaFrameNumber').fire('keydown',{key:'Enter',preventDefault(){},target:get('#svgaFrameNumber')});assert.equal(api.state.frame,39);
  api.seek(1000);assert.equal(api.state.frame,59);api.seek(-8);assert.equal(api.state.frame,0);
  get('#frameHeight').value='480';api.changeDimension(get('#frameHeight'));assert.equal(get('#frameWidth').value,480);assert.equal(api.state.dimension,480);
  get('#frameWidth').value='';api.changeDimension(get('#frameWidth'));assert.equal(get('#frameDownload').disabled,true);assert.equal(api.state.dimensionValid,false);assert.equal(latestFeedback().phase,'error');assert.equal(latestFeedback().message,'Enter a whole number from 16 to 2048.');
  await api.exportFrame();assert.equal(recorded('generated'),1);assert.equal(recorded('download'),1,'playback, seeking, replacement preview and invalid dimensions must not count');
  get('#frameWidth').value='240';api.changeDimension(get('#frameWidth'));assert.equal(get('#frameHeight').value,240);assert.equal(latestFeedback().phase,'ready');
  api.seek(27);await api.exportFrame();assert.equal(api.state.download,'replacement-frame-028-240x240.webp');assert.equal(api.state.playing,false);assert.equal(downloadClicks,2);
  assert.equal(recorded('generated'),2);assert.equal(recorded('download'),2);
  const retry=get('#frameDownloadResult').children.find(child=>child.download);assert.ok(retry,'a successful export has a retry link');retry.click();
  assert.equal(recorded('generated'),2);assert.equal(recorded('download'),3,'retry reuses its existing image and only counts a download');
  const retainedDownload=api.state.download,retainedDownloadUrl=api.state.downloadUrl;
  encodeFails=true;await api.exportFrame();encodeFails=false;assert.equal(api.state.notice,'exportError');
  assert.equal(latestFeedback().phase,'error');assert.equal(latestFeedback().message,'Could not export this frame. Please try again.');
  assert.equal(api.state.download,retainedDownload);assert.equal(api.state.downloadUrl,retainedDownloadUrl,'encoding failure preserves the last valid download');
  assert.equal(recorded('generated'),2);assert.equal(recorded('download'),3,'an encoder failure must not count generation or download');
  const original=api.state.video;await api.loadSvga([{...file,name:'broken.txt'}]);assert.equal(api.state.video,original);assert.equal(api.state.frame,27);assert.equal(api.state.notice,'typeError');assert.equal(latestFeedback().phase,'error');assert.equal(api.state.download,retainedDownload);
  parseFails=true;await api.loadSvga([file]);assert.equal(api.state.video,original);assert.equal(api.state.notice,'loadError');parseFails=false;
  await api.loadSvga([file,file]);assert.equal(api.state.notice,'fileCount');assert.equal(latestFeedback().phase,'error');assert.equal(latestFeedback().message,'Choose one file at a time.');
  api.togglePlayback();sandbox.location.hash='#room-backgrounds';api.activateTool();assert.equal(api.state.playing,false);assert.equal(api.state.video,original);assert.equal(api.state.active,'room');
  sandbox.location.hash='#avatar-frames';api.activateTool();assert.equal(api.state.frame,27);assert.equal(get('#svgaFrameNumber').value,28);
  sandbox.language='zh';api.syncLanguage();assert.equal(latestFeedback().message,'一次请选择一个文件。','a retained error follows language changes');assert.equal(doc.title,'头像框生产工具 · Fun Toolkit');assert.match(get('#svgaFileMeta').textContent,/60 帧/);
  sandbox.location.hash='#banners';api.activateTool();assert.equal(api.state.active,'banner');assert.equal(activations.at(-1),'banner');assert.equal(doc.title,'Banner 生产工具 · Fun Toolkit');assert.equal(links[2]['aria-current'],'page');assert.equal(get('#bannerTool').classList.contains('hidden'),false);assert.equal(get('#avatarTool').classList.contains('hidden'),true);assert.equal(get('#examplesButton').classList.contains('hidden'),true);
  sandbox.location.hash='#avatar-frames';api.activateTool();assert.equal(api.state.frame,27);
  sandbox.location.hash='';api.activateTool();assert.equal(api.state.active,'home');assert.equal(get('#homeTool').classList.contains('hidden'),false);assert.equal(get('#avatarTool').classList.contains('hidden'),true);assert.equal(get('#brandHome')['aria-current'],'page');assert.equal(api.state.video,original);assert.equal(api.state.frame,27);
  sandbox.location.hash='#statistics';api.activateTool();assert.equal(api.state.active,'statistics');assert.equal(get('#statisticsTool').classList.contains('hidden'),false);assert.equal(get('#homeTool').classList.contains('hidden'),true);assert.equal(get('#footerStatistics')['aria-current'],'page');assert.equal(get('#brandHome')['aria-current'],undefined);assert.equal(api.state.video,original);
  sandbox.location.hash='#avatar-frames';api.activateTool();assert.equal(api.state.frame,27);assert.equal(get('#statisticsTool').classList.contains('hidden'),true);
  await docListeners.get('drop')({target:get('#frameDownload'),dataTransfer:{files:[file]},preventDefault(){}});assert.equal(api.state.file,file);assert.equal(api.state.frame,0);assert.equal(api.state.playing,false);
  assert.throws(()=>api.validateVideo({videoSize:{width:NaN,height:320},frames:0,FPS:30}));
  assert.equal(recorded('generated'),2);assert.equal(recorded('download'),3,'file failures, route and language changes, and page-wide drops must not count');
  get('#frameWidth').value='2048';api.changeDimension(get('#frameWidth'));const resizedStart=players[1].steps.length;await api.exportFrame();assert.equal(players[1].steps.length,resizedStart+2,'larger exports render at full size, then release the enlarged canvas');assert.equal(api.state.download.endsWith('-2048x2048.webp'),true);
  console.log('PASS: shared empty/loading/processing/ready/success/error feedback, translated async labels, busy controls, one-time preview/result reveals, no scrub reveal, failed-export preservation; navigation/state retention, live FileList, paused first-frame uploads and export, explicit playback, exact frame/Enter, pause-on-edit, bounded seeking, locked dimensions, invalid input, export naming, corrupt-file preservation, language, page-wide drop, successful-only generation/download and retry counts.');
})().catch(error=>{console.error(error);process.exitCode=1});
