// Run with Node.js. Browser integration and real WebP checks are documented separately.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const elements=new Map(),storage=new Map(),links=[];
const events=[];
const recorded=type=>events.filter(event=>event.tool==='avatar'&&event.type===type).reduce((total,event)=>total+event.count,0);
let nextVideo=null,parseFails=false,encodeFails=false,downloadClicks=0;
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
  constructor(host){this.host=host;this._renderer={_prepared:true};host.append(Object.assign(element(),{isCanvas:true}))}
  setContentMode(){}onFrame(fn){this.callback=fn}setVideoItem(video){this.video=video}pauseAnimation(){this.paused=true}stepToFrame(frame,andPlay){this.lastFrame=frame;this.paused=!andPlay}
}
const video=()=>({videoSize:{width:320,height:320},frames:60,FPS:30});
const sandbox={document:doc,window:{addEventListener(){},Hub:{record(tool,type,count=1){events.push({tool,type,count})}}},location:{hash:'#avatar-frames'},language:'en',localStorage:{getItem:k=>storage.get(k)},SVGA:{Player:MockPlayer,Parser:class{load(file,success,failure){queueMicrotask(()=>parseFails?failure(Error('bad')):success(nextVideo||video()))}}},JSZip:{},ResizeObserver:class{observe(){}},IntersectionObserver:class{observe(){}},performance,URL:{createObjectURL:()=> 'blob:test',revokeObjectURL(){}},Blob,Uint8Array,Number,Math,Array,Object,Promise,Error,String,Date,setTimeout,clearTimeout,matchMedia:()=>({matches:false,addEventListener(){}}),canvasToWebP:async()=>{if(encodeFails)throw Error('encode failed');return new Blob(['test'],{type:'image/webp'})},setLanguage(value){sandbox.language=value}};
sandbox.window.SVGA=sandbox.SVGA;sandbox.window.JSZip=sandbox.JSZip;
sandbox.window.Hub.activate=()=>{};sandbox.window.Hub.syncLanguage=()=>{};
let source=fs.readFileSync(path.join(__dirname,'../toolkit.js'),'utf8');
source=source.replace('window.Toolkit={syncLanguage};','window.Toolkit={syncLanguage};window.test={state,loadSvga,seek,togglePlayback,changeDimension,exportFrame,activateTool,syncLanguage,validateVideo};');
vm.createContext(sandbox);vm.runInContext(source,sandbox);const api=sandbox.window.test;
const file={name:'ring.svga',size:100,slice:()=>({arrayBuffer:async()=>new Uint8Array([0x78,0xda,0,0]).buffer})};
(async()=>{
  assert.equal(api.state.active,'avatar');assert.equal(get('#roomTool').classList.contains('hidden'),true);assert.equal(links[1]['aria-current'],'page');
  await api.exportFrame();assert.equal(events.length,0,'exporting without an animation must not count');
  // Snapshot the incoming live FileList before awaiting its first read.
  const selection=[file];const loading=api.loadSvga({[Symbol.iterator]:()=>selection[Symbol.iterator]()});selection.length=0;await loading;
  assert.equal(api.state.video.frames,60);assert.equal(api.state.loading,false);assert.equal(get('#frameDownload').disabled,false);
  // With ordinary motion preferences, initial and replacement uploads still wait for Play.
  assert.equal(api.state.frame,0);assert.equal(get('#svgaFrameNumber').value,1);assert.equal(api.state.playing,false);
  assert.equal(events.length,0,'upload and first-frame preview must not count');
  await api.exportFrame();assert.equal(api.state.download,'ring-frame-001-240x240.webp');assert.equal(downloadClicks,1);assert.equal(api.state.playing,false);
  assert.equal(recorded('generated'),1);assert.equal(recorded('download'),1,'successful export encodes and requests one download');
  get('#svgaPlay').fire('click');assert.equal(api.state.playing,true);
  await api.loadSvga([{...file,name:'replacement.svga'}]);
  assert.equal(api.state.frame,0);assert.equal(get('#svgaFrameNumber').value,1);assert.equal(api.state.playing,false);assert.equal(get('#frameDownload').disabled,false);
  get('#svgaPlay').fire('click');assert.equal(api.state.playing,true);
  api.seek(27);assert.equal(api.state.frame,27);assert.equal(get('#svgaFrameNumber').value,28);assert.equal(api.state.playing,false);
  api.togglePlayback();assert.equal(api.state.playing,true);get('#svgaFrameNumber').fire('focus');assert.equal(api.state.playing,false);
  get('#svgaFrameNumber').value='40';get('#svgaFrameNumber').fire('keydown',{key:'Enter',preventDefault(){},target:get('#svgaFrameNumber')});assert.equal(api.state.frame,39);
  api.seek(1000);assert.equal(api.state.frame,59);api.seek(-8);assert.equal(api.state.frame,0);
  get('#frameHeight').value='480';api.changeDimension(get('#frameHeight'));assert.equal(get('#frameWidth').value,480);assert.equal(api.state.dimension,480);
  get('#frameWidth').value='';api.changeDimension(get('#frameWidth'));assert.equal(get('#frameDownload').disabled,true);assert.equal(api.state.dimensionValid,false);
  await api.exportFrame();assert.equal(recorded('generated'),1);assert.equal(recorded('download'),1,'playback, seeking, replacement preview and invalid dimensions must not count');
  get('#frameWidth').value='240';api.changeDimension(get('#frameWidth'));assert.equal(get('#frameHeight').value,240);
  api.seek(27);await api.exportFrame();assert.equal(api.state.download,'replacement-frame-028-240x240.webp');assert.equal(api.state.playing,false);assert.equal(downloadClicks,2);
  assert.equal(recorded('generated'),2);assert.equal(recorded('download'),2);
  const retry=get('#frameDownloadResult').children.find(child=>child.download);assert.ok(retry,'a successful export has a retry link');retry.click();
  assert.equal(recorded('generated'),2);assert.equal(recorded('download'),3,'retry reuses its existing image and only counts a download');
  encodeFails=true;await api.exportFrame();encodeFails=false;assert.equal(api.state.notice,'exportError');
  assert.equal(recorded('generated'),2);assert.equal(recorded('download'),3,'an encoder failure must not count generation or download');
  const original=api.state.video;await api.loadSvga([{...file,name:'broken.txt'}]);assert.equal(api.state.video,original);assert.equal(api.state.frame,27);assert.equal(api.state.notice,'typeError');
  parseFails=true;await api.loadSvga([file]);assert.equal(api.state.video,original);assert.equal(api.state.notice,'loadError');parseFails=false;
  await api.loadSvga([file,file]);assert.equal(api.state.notice,'fileCount');
  api.togglePlayback();sandbox.location.hash='#room-backgrounds';api.activateTool();assert.equal(api.state.playing,false);assert.equal(api.state.video,original);assert.equal(api.state.active,'room');
  sandbox.location.hash='#avatar-frames';api.activateTool();assert.equal(api.state.frame,27);assert.equal(get('#svgaFrameNumber').value,28);
  sandbox.language='zh';api.syncLanguage();assert.equal(doc.title,'头像框生产工具 · Fun Toolkit');assert.match(get('#svgaFileMeta').textContent,/60 帧/);
  sandbox.location.hash='#banners';api.activateTool();assert.equal(api.state.active,'banner');assert.equal(doc.title,'Banner 生产工具 · Fun Toolkit');assert.equal(links[2]['aria-current'],'page');assert.equal(get('#bannerTool').classList.contains('hidden'),false);assert.equal(get('#avatarTool').classList.contains('hidden'),true);assert.equal(get('#examplesButton').classList.contains('hidden'),true);
  sandbox.location.hash='#avatar-frames';api.activateTool();assert.equal(api.state.frame,27);
  sandbox.location.hash='';api.activateTool();assert.equal(api.state.active,'home');assert.equal(get('#homeTool').classList.contains('hidden'),false);assert.equal(get('#avatarTool').classList.contains('hidden'),true);assert.equal(get('#brandHome')['aria-current'],'page');assert.equal(api.state.video,original);assert.equal(api.state.frame,27);
  sandbox.location.hash='#statistics';api.activateTool();assert.equal(api.state.active,'statistics');assert.equal(get('#statisticsTool').classList.contains('hidden'),false);assert.equal(get('#homeTool').classList.contains('hidden'),true);assert.equal(get('#footerStatistics')['aria-current'],'page');assert.equal(get('#brandHome')['aria-current'],undefined);assert.equal(api.state.video,original);
  sandbox.location.hash='#avatar-frames';api.activateTool();assert.equal(api.state.frame,27);assert.equal(get('#statisticsTool').classList.contains('hidden'),true);
  await docListeners.get('drop')({target:get('#frameDownload'),dataTransfer:{files:[file]},preventDefault(){}});assert.equal(api.state.file,file);assert.equal(api.state.frame,0);assert.equal(api.state.playing,false);
  assert.throws(()=>api.validateVideo({videoSize:{width:NaN,height:320},frames:0,FPS:30}));
  assert.equal(recorded('generated'),2);assert.equal(recorded('download'),3,'file failures, route and language changes, and page-wide drops must not count');
  console.log('PASS: navigation/state retention, live FileList, paused first-frame uploads and export, explicit playback, exact frame/Enter, pause-on-edit, bounded seeking, locked dimensions, invalid input, export naming, corrupt-file preservation, language, page-wide drop, successful-only generation/download and retry counts.');
})().catch(error=>{console.error(error);process.exitCode=1});
