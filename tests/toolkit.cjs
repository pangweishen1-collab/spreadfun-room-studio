// Run with Node.js. Browser integration and real WebP checks are documented separately.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const elements=new Map(),storage=new Map(),links=[];
const events=[],feedback=[],reveals=[],activations=[],players=[],encodes=[],zips=[];
let giftActivations=0,giftLanguageSyncs=0;
const latestFeedback=()=>feedback.at(-1);
const recorded=type=>events.filter(event=>event.tool==='avatar'&&event.type===type).reduce((total,event)=>total+event.count,0);
let nextVideo=null,parseFails=false,encodeFails=false,downloadClicks=0,holdParser=false,pendingParser=null,holdRenderers=false;
let compressionMode='high',zipFails=false,holdEncode=null,holdZip=null,failEncodeAt=0;const webpModes=[];
const docListeners=new Map();
function descendants(node){return node.children.flatMap(child=>[child,...descendants(child)])}
function matches(node,selector){
  if(selector==='canvas')return node.isCanvas;
  if(selector==='button')return node.tagName==='BUTTON';
  if(selector==='[data-job-id]')return node.dataset.jobId!==undefined;
  if(selector.startsWith('.'))return String(node.className||'').split(' ').includes(selector.slice(1));
  return false;
}
function element(tag='div'){
  const classes=new Set(),listeners=new Map(),attributes=new Map();
  return {tagName:tag.toUpperCase(),style:{},dataset:{},value:'240',textContent:'',width:240,height:240,children:[],disabled:false,
    classList:{add(...xs){xs.forEach(x=>classes.add(x))},remove(...xs){xs.forEach(x=>classes.delete(x))},toggle(x,on){if(on)classes.add(x);else classes.delete(x)},contains(x){return classes.has(x)}},
    contains(target){return this===target||descendants(this).includes(target)},setAttribute(k,v){attributes.set(k,String(v));this[k]=String(v)},getAttribute(k){return attributes.get(k)},removeAttribute(k){attributes.delete(k);delete this[k]},append(...xs){for(const x of xs){x.parentElement=this;this.children.push(x)}},appendChild(x){this.append(x);return x},replaceChildren(...xs){this.children=[];this.append(...xs)},remove(){if(this.parentElement)this.parentElement.children=this.parentElement.children.filter(x=>x!==this)},
    click(){if(this.disabled)return;if(this.download)downloadClicks++;return listeners.get('click')?.({button:0,defaultPrevented:false,target:this,stopPropagation(){}})},
    addEventListener(k,fn){listeners.set(k,fn)},fire(k,event={}){return listeners.get(k)?.(event)},querySelector(selector='canvas'){return descendants(this).find(x=>matches(x,selector))||null},querySelectorAll(selector){return descendants(this).filter(x=>matches(x,selector))},
    getContext(){return {clearRect(){},drawImage(){}}},toDataURL(){return 'data:image/png;base64,AA=='}
  };
}
const get=selector=>{if(!elements.has(selector))elements.set(selector,element());return elements.get(selector)};
for(const [id,tool] of [['roomLink','room'],['avatarLink','avatar'],['bannerLink','banner'],['giftPreviewLink','gift-preview'],['resourcesLink','resources']]){const link=get(id);link.dataset.toolLink=tool;links.push(link)}
links[3].dataset.i18n='giftPreviewNav';get('#giftPreviewHeading').dataset.i18n='giftPreviewTitle';
const doc={hidden:false,body:element(),title:'',querySelector:get,querySelectorAll:s=>s==='[data-tool-link]'?links:s==='[data-i18n]'?[links[3],get('#giftPreviewHeading')]:s.startsWith('#svgaBatchList ')?get('#svgaBatchList').querySelectorAll(s.slice('#svgaBatchList '.length)):[],createElement:tag=>Object.assign(element(tag),{isCanvas:tag==='canvas'}),addEventListener(k,fn){docListeners.set(k,fn)}};
class MockPlayer {
  constructor(host){this.host=host;this.steps=[];this._renderer={_prepared:true};players.push(this);host.append(Object.assign(element(),{isCanvas:true}))}
  setContentMode(){}onFrame(fn){this.callback=fn}setVideoItem(video){if(video.failRenderer)throw Error('renderer asset failure');this.video=video;this._renderer._prepared=!holdRenderers}pauseAnimation(){this.paused=true}stepToFrame(frame,andPlay){this.steps.push({frame,andPlay});this.lastFrame=frame;this.paused=!andPlay}
}
class MockZip{constructor(){this.files=[];zips.push(this)}file(name,blob){this.files.push({name,blob});return this}async generateAsync(options){this.options=options;if(holdZip)await holdZip;if(zipFails)throw Error('zip failed');return new Blob(['zip'],{type:'application/zip'})}static async loadAsync(){return {file(name){return name==='movie.spec'?{async:async()=>JSON.stringify({movie:{},images:{}})}:{}}}}}
const video=()=>({videoSize:{width:320,height:320},frames:60,FPS:30});
const sandbox={document:doc,window:{FunWebP:{getMode:()=>compressionMode},addEventListener(){},FunToolkitUI:{setState(tool,value){assert.equal(tool,'avatar');feedback.push({...value})},reveal(target){reveals.push(target)},activate(tool){activations.push(tool)}},Hub:{record(tool,type,count=1){events.push({tool,type,count})}}},location:{hash:'#avatar-frames'},language:'en',localStorage:{getItem:k=>storage.get(k)},SVGA:{Player:MockPlayer,Parser:class{load(file,success,failure){const complete=()=>parseFails?failure(Error('bad')):success(file.video||nextVideo||video());if(holdParser)pendingParser=complete;else queueMicrotask(complete)}}},JSZip:MockZip,ResizeObserver:class{observe(){}},IntersectionObserver:class{observe(){}},performance,URL:{createObjectURL:()=> 'blob:test',revokeObjectURL(){}},Blob,Uint8Array,Number,Math,Array,Object,Promise,Error,String,Date,setTimeout,clearTimeout,matchMedia:()=>({matches:false,addEventListener(){}}),canvasToWebP:async(...args)=>{assert.equal(args.length,2,'WebP export snapshots the shared compression profile');assert.ok(['high','lossless'].includes(args[1].mode));webpModes.push(args[1].mode);encodes.push({width:args[0].width,height:args[0].height,mode:args[1].mode,video:players[1]?.video,frame:players[1]?.lastFrame});if(holdEncode)await holdEncode;if(encodeFails||encodes.length===failEncodeAt)throw Error('encode failed');return new Blob(['test-'+encodes.length],{type:'image/webp'})},setLanguage(value){sandbox.language=value}};
sandbox.window.SVGA=sandbox.SVGA;sandbox.window.JSZip=sandbox.JSZip;
sandbox.window.Hub.activate=()=>{};sandbox.window.Hub.syncLanguage=()=>{};
sandbox.window.GiftPreviewTool={activate(){assert.equal(get('#giftPreviewTool').classList.contains('hidden'),false,'gift activates after its page is visible');giftActivations++},syncLanguage(){giftLanguageSyncs++}};
let source=fs.readFileSync(path.join(__dirname,'../toolkit.js'),'utf8');
source=source.replace('window.Toolkit={syncLanguage};','window.Toolkit={syncLanguage};window.test={state,loadSvga,seek,togglePlayback,changeDimension,exportFrame,activateTool,syncLanguage,validateVideo,selectJob,removeJob,exportAllFrames};');
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
  await api.loadSvga([{...file,name:'replacement.svga'}],{replace:true});
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
  const original=api.state.video;await api.loadSvga([{...file,name:'broken.txt'}],{replace:true});assert.equal(api.state.video,original);assert.equal(api.state.frame,27);assert.equal(api.state.notice,'typeError');assert.equal(latestFeedback().phase,'error');assert.equal(api.state.download,retainedDownload);
  parseFails=true;await api.loadSvga([file],{replace:true});assert.equal(api.state.video,original);assert.equal(api.state.notice,'loadError');parseFails=false;
  await api.loadSvga([{...file,name:'invalid-a.txt'},{...file,name:'invalid-b.txt'}]);assert.equal(api.state.notice,'typeError');assert.equal(latestFeedback().phase,'error');assert.match(latestFeedback().message,/svga/i);
  api.togglePlayback();sandbox.location.hash='#room-backgrounds';api.activateTool();assert.equal(api.state.playing,false);assert.equal(api.state.video,original);assert.equal(api.state.active,'room');
  sandbox.location.hash='#avatar-frames';api.activateTool();assert.equal(api.state.frame,27);assert.equal(get('#svgaFrameNumber').value,28);
  sandbox.language='zh';api.syncLanguage();assert.match(latestFeedback().message,/svga/i,'a retained error follows language changes');assert.equal(doc.title,'头像框预览图生产工具 · Fun Toolkit');assert.match(get('#svgaFileMeta').textContent,/60 帧/);
  sandbox.location.hash='#banners';api.activateTool();assert.equal(api.state.active,'banner');assert.equal(activations.at(-1),'banner');assert.equal(doc.title,'Banner 生产工具 · Fun Toolkit');assert.equal(links[2]['aria-current'],'page');assert.equal(get('#bannerTool').classList.contains('hidden'),false);assert.equal(get('#avatarTool').classList.contains('hidden'),true);assert.equal(get('#examplesButton').classList.contains('hidden'),true);
  sandbox.location.hash='#avatar-frames';api.activateTool();assert.equal(api.state.frame,27);
  sandbox.location.hash='';api.activateTool();assert.equal(api.state.active,'home');assert.equal(get('#homeTool').classList.contains('hidden'),false);assert.equal(get('#avatarTool').classList.contains('hidden'),true);assert.equal(get('#brandHome')['aria-current'],'page');assert.equal(api.state.video,original);assert.equal(api.state.frame,27);
  sandbox.location.hash='#statistics';api.activateTool();assert.equal(api.state.active,'statistics');assert.equal(get('#statisticsTool').classList.contains('hidden'),false);assert.equal(get('#homeTool').classList.contains('hidden'),true);assert.equal(get('#footerStatistics')['aria-current'],'page');assert.equal(get('#brandHome')['aria-current'],undefined);assert.equal(api.state.video,original);
  sandbox.location.hash='#avatar-frames';api.activateTool();assert.equal(api.state.frame,27);assert.equal(get('#statisticsTool').classList.contains('hidden'),true);
  await docListeners.get('drop')({target:get('#frameDownload'),dataTransfer:{files:[file]},preventDefault(){}});assert.equal(api.state.file,file);assert.equal(api.state.frame,0);assert.equal(api.state.playing,false);
  assert.throws(()=>api.validateVideo({videoSize:{width:NaN,height:320},frames:0,FPS:30}));
  assert.equal(recorded('generated'),2);assert.equal(recorded('download'),3,'file failures, route and language changes, and page-wide drops must not count');
  get('#frameWidth').value='2048';api.changeDimension(get('#frameWidth'));const resizedStart=players[1].steps.length;await api.exportFrame();assert.equal(players[1].steps.length,resizedStart+2,'larger exports render at full size, then release the enlarged canvas');assert.equal(api.state.download.endsWith('-2048x2048.webp'),true);
  sandbox.location.hash='#resources';api.activateTool();assert.equal(api.state.active,'resources');assert.equal(get('#resourceTool').classList.contains('hidden'),false);assert.equal(get('#avatarTool').classList.contains('hidden'),true);assert.equal(doc.title,'资源库 · Fun Toolkit');sandbox.language='en';api.syncLanguage();assert.equal(doc.title,'Asset library · Fun Toolkit');
  let vapActive=null,vapLang=null;sandbox.window.VapTool={setActive(active){vapActive=active},setLanguage(lang){vapLang=lang}};
  sandbox.location.hash='#vap-tools';api.activateTool();assert.equal(api.state.active,'vap');assert.equal(get('#vapTool').classList.contains('hidden'),false);assert.equal(vapActive,true);assert.equal(doc.title,'VAP converter · Fun Toolkit');sandbox.language='zh';api.syncLanguage();assert.equal(vapLang,'zh');assert.equal(doc.title,'VAP 转换工具 · Fun Toolkit');sandbox.location.hash='#resources';api.activateTool();assert.equal(vapActive,false);assert.equal(get('#vapTool').classList.contains('hidden'),true);
  sandbox.language='en';api.syncLanguage();
  const retainedFrame=api.state.frame,retainedVideo=api.state.video;
  sandbox.location.hash='#gift-previews';api.activateTool();assert.equal(api.state.active,'gift-preview');assert.equal(activations.at(-1),'gift-preview');assert.equal(links[3]['aria-current'],'page');assert.equal(links[4]['aria-current'],undefined);assert.equal(get('#giftPreviewTool').classList.contains('hidden'),false);assert.equal(get('#resourceTool').classList.contains('hidden'),true);assert.equal(get('#avatarTool').classList.contains('hidden'),true);assert.equal(doc.title,'Gift & vehicle preview maker · Fun Toolkit');assert.equal(giftActivations,1);
  api.activateTool();assert.equal(giftActivations,1,'click followed by hashchange only activates the new tool once');
  const giftSyncBefore=giftLanguageSyncs;sandbox.language='zh';api.syncLanguage();assert.equal(giftLanguageSyncs,giftSyncBefore+1);assert.equal(doc.title,'礼物&座驾预览图生产工具 · Fun Toolkit');assert.equal(links[3].textContent,'礼物图');assert.equal(get('#giftPreviewHeading').textContent,'礼物&座驾预览图生产工具');
  sandbox.location.hash='#resources';api.activateTool();assert.equal(get('#giftPreviewTool').classList.contains('hidden'),true);assert.equal(links[4]['aria-current'],'page');
  sandbox.location.hash='#gift-previews';api.activateTool();assert.equal(giftActivations,2,'re-entering gift preview activates its retained canvas');
  sandbox.location.hash='#avatar-frames';api.activateTool();assert.equal(get('#giftPreviewTool').classList.contains('hidden'),true);assert.equal(api.state.video,retainedVideo);assert.equal(api.state.frame,retainedFrame,'gift navigation preserves the avatar file and selected frame');sandbox.language='en';api.syncLanguage();assert.equal(links[3].textContent,'Gift images');assert.equal(get('#giftPreviewHeading').textContent,'Gift & vehicle preview maker');
  const beforeModeDownload=downloadClicks;compressionMode='lossless';docListeners.get('webp:mode-change')();assert.equal(api.state.download,null,'changing the global profile clears the avatar retry receipt');assert.equal(downloadClicks,beforeModeDownload,'profile changes do not start downloads');await api.exportFrame();assert.equal(webpModes.at(-1),'lossless','avatar exports snapshot the shared profile');
  // Batch queue behavior is exercised through the same importer and export actions.
  for(const job of [...api.state.jobs])await api.removeJob(job.id);
  assert.equal(api.state.video,null);assert.equal(api.state.jobs.length,0);assert.equal(get('#frameDownload').disabled,true);
  get('#frameWidth').value='400';api.changeDimension(get('#frameWidth'));
  const firstVideo={...video(),label:'first'},secondVideo={...video(),frames:90,label:'second'};
  const firstFile={...file,name:'same.svga',video:firstVideo},secondFile={...file,name:'same.svga',video:secondVideo};
  const brokenFile={...file,name:'broken.svga',slice:()=>({arrayBuffer:async()=>new Uint8Array([0,0,0,0]).buffer})};
  const beforeBatchGenerated=recorded('generated'),beforeBatchDownloads=recorded('download');
  await api.loadSvga([firstFile,brokenFile,secondFile]);
  assert.equal(api.state.jobs.length,3,'import preserves all selected files, including a removable failure');
  assert.deepEqual(Array.from(api.state.jobs,job=>job.file.name),['same.svga','broken.svga','same.svga'],'the queue preserves incoming order');
  const [firstJob,badJob,secondJob]=api.state.jobs;
  assert.equal(firstJob.video,firstVideo);assert.equal(secondJob.video,secondVideo);assert.equal(badJob.video,null);assert.equal(badJob.error,'loadError');
  assert.equal(api.state.activeId,firstJob.id,'the first valid newly imported animation becomes current');
  assert.equal(api.state.file,firstFile);assert.equal(api.state.frame,0);assert.equal(api.state.playing,false);
  assert.equal(badJob.select.disabled,true,'broken queue rows cannot be selected');assert.equal(badJob.remove.disabled,false,'broken rows remain removable');
  assert.equal(get('#svgaBatchCount').textContent,'3');assert.equal(get('#frameDownloadAll').disabled,false);
  assert.equal(get('#frameDownloadAll').classList.contains('hidden'),false);
  api.seek(11);assert.equal(firstJob.frame,11);
  await api.selectJob(secondJob.id);assert.equal(api.state.frame,0);api.seek(37);
  await api.selectJob(firstJob.id);assert.equal(api.state.frame,11);assert.equal(secondJob.frame,37,'each file retains its independently selected frame');
  assert.equal(firstJob.select.getAttribute('aria-pressed'),'true');assert.equal(secondJob.select.getAttribute('aria-pressed'),'false');
  const batchEncodeStart=encodes.length;let resumeEncode;holdEncode=new Promise(resolve=>{resumeEncode=resolve});
  const batchExport=api.exportAllFrames();assert.equal(api.state.exporting,true);assert.equal(api.state.batching,true);
  assert.equal(get('#frameDownloadAll')['aria-busy'],'true');assert.equal(get('#svgaAdd').disabled,true);assert.equal(get('#frameWidth').disabled,true);
  for(const job of api.state.jobs){assert.equal(job.remove.disabled,true);assert.equal(job.select.disabled,true);}
  await new Promise(resolve=>setImmediate(resolve));assert.equal(encodes.length,batchEncodeStart+1,'the first output is awaiting its shared WebP encoder');
  const stepsBeforeBusyNavigation=players[1].steps.length;sandbox.location.hash='#room-backgrounds';api.activateTool();sandbox.location.hash='#avatar-frames';api.activateTool();
  assert.equal(players[1].steps.length,stepsBeforeBusyNavigation,'leaving and returning during encoding must not re-render the hidden batch player through the current-file preview');
  assert.equal(api.state.activeId,firstJob.id);assert.equal(api.state.frame,11);
  await api.loadSvga([{...file,name:'ignored.svga'}]);await api.selectJob(secondJob.id);await api.removeJob(firstJob.id);api.seek(59);
  assert.equal(api.state.jobs.length,3);assert.equal(api.state.activeId,firstJob.id);assert.equal(api.state.frame,11,'busy controls cannot alter the batch snapshot');
  resumeEncode();holdEncode=null;await batchExport;
  assert.equal(api.state.exporting,false);assert.equal(api.state.batching,false);assert.equal(api.state.activeId,firstJob.id);assert.equal(api.state.frame,11);
  assert.equal(api.state.downloadKind,'zip');assert.equal(api.state.download,'Avatar-frames-400x400.zip');
  assert.equal(recorded('generated'),beforeBatchGenerated+2,'only successfully packaged WebPs count as generated');assert.equal(recorded('download'),beforeBatchDownloads+1,'the ZIP requests one download');
  const firstZip=zips.at(-1);assert.equal(firstZip.files.length,2);assert.deepEqual(firstZip.files.map(entry=>entry.name),['same-frame-012-400x400.webp','same-frame-038-400x400.webp']);assert.equal(firstZip.options.compression,'STORE');
  assert.deepEqual(encodes.slice(batchEncodeStart).map(item=>[item.width,item.height,item.mode,item.video.label,item.frame]),[[400,400,'lossless','first',11],[400,400,'lossless','second',37]],'each output uses its own video/frame with the common size and compression profile');
  assert.equal(get('#frameBatchProgress').textContent.includes('2'),true);
  assert.equal(players[1].video,firstVideo,'the export renderer returns to the visible selected file after the batch');
  const zipRetry=get('#frameDownloadResult').children.find(child=>child.download),generatedBeforeZipRetry=recorded('generated');zipRetry.click();assert.equal(recorded('generated'),generatedBeforeZipRetry);assert.equal(recorded('download'),beforeBatchDownloads+2,'retrying a ZIP does not re-encode its images');
  await api.selectJob(secondJob.id);api.seek(11);await api.selectJob(firstJob.id);await api.exportAllFrames();
  assert.deepEqual(zips.at(-1).files.map(entry=>entry.name),['same-frame-012-400x400.webp','same-frame-012-400x400 (2).webp'],'same-named input files do not overwrite one another in a ZIP');
  const retainedZip=api.state.download,retainedZipUrl=api.state.downloadUrl;
  const generatedBeforeZipError=recorded('generated'),downloadsBeforeZipError=recorded('download');zipFails=true;await api.exportAllFrames();zipFails=false;
  assert.equal(api.state.notice,'exportError');assert.equal(api.state.download,retainedZip);assert.equal(api.state.downloadUrl,retainedZipUrl);assert.equal(recorded('generated'),generatedBeforeZipError);assert.equal(recorded('download'),downloadsBeforeZipError,'ZIP assembly failure does not count a generation or a download');
  failEncodeAt=encodes.length+1;await api.exportAllFrames();failEncodeAt=0;
  assert.equal(api.state.notice,'batchPartial');assert.equal(firstJob.exportError,true);assert.equal(secondJob.exportError,false);assert.equal(zips.at(-1).files.length,1);
  assert.equal(recorded('generated'),generatedBeforeZipError+1);assert.equal(recorded('download'),downloadsBeforeZipError+1,'a failed file does not stop the remaining valid outputs');
  const generatedBeforeAllFail=recorded('generated'),downloadsBeforeAllFail=recorded('download'),retainedPartial=api.state.downloadUrl;
  encodeFails=true;await api.exportAllFrames();encodeFails=false;
  assert.equal(api.state.notice,'batchFailed');assert.equal(recorded('generated'),generatedBeforeAllFail);assert.equal(recorded('download'),downloadsBeforeAllFail);assert.equal(api.state.downloadUrl,retainedPartial,'an all-failed batch preserves its previous valid ZIP');
  let resumeStale;holdEncode=new Promise(resolve=>{resumeStale=resolve});const staleExport=api.exportAllFrames();await new Promise(resolve=>setImmediate(resolve));
  compressionMode='high';docListeners.get('webp:mode-change')();resumeStale();holdEncode=null;await staleExport;
  assert.equal(api.state.download,null);assert.equal(recorded('generated'),generatedBeforeAllFail);assert.equal(recorded('download'),downloadsBeforeAllFail,'a profile change aborts an in-flight old-mode result');assert.equal(api.state.exporting,false);
  let resumeZip;holdZip=new Promise(resolve=>{resumeZip=resolve});const staleZip=api.exportAllFrames();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(api.state.exporting,true);compressionMode='lossless';docListeners.get('webp:mode-change')();resumeZip();holdZip=null;await staleZip;
  assert.equal(api.state.download,null);assert.equal(recorded('generated'),generatedBeforeAllFail);assert.equal(recorded('download'),downloadsBeforeAllFail,'a profile change during ZIP packing cannot publish stale bytes');
  await api.exportAllFrames();assert.equal(api.state.downloadKind,'zip');api.seek(12);assert.equal(api.state.download,null,'changing a selected frame invalidates the prior batch receipt');
  const previousCount=api.state.jobs.length,oldFirstId=firstJob.id;const replacementFile={...file,name:'replacement-in-queue.svga',video:{...video(),label:'replacement'}};
  await api.loadSvga([replacementFile],{replace:true});assert.equal(api.state.jobs.length,previousCount);assert.equal(api.state.file,replacementFile);assert.equal(api.state.jobs.some(job=>job.id===oldFirstId),false,'explicit replacement replaces only the current queue item');
  assert.equal(api.state.jobs.find(job=>job.id===secondJob.id).frame,11,'replacing the current file preserves other selected frames');
  const replacementId=api.state.activeId;api.seek(9);await api.exportFrame();const goodReceipt=api.state.downloadUrl;
  await api.loadSvga([brokenFile],{replace:true});assert.equal(api.state.activeId,replacementId);assert.equal(api.state.frame,9);assert.equal(api.state.downloadUrl,goodReceipt,'failed replacement keeps the current animation, frame and valid receipt');assert.equal(api.state.jobs.length,previousCount+1,'a failed replacement remains visible as its own error row');
  const extraBadId=api.state.jobs.at(-1).id;await api.removeJob(extraBadId);await api.removeJob(replacementId);
  assert.equal(api.state.activeId,secondJob.id,'removing the selected item mounts the next valid queue item');assert.equal(api.state.frame,11);
  await api.removeJob(secondJob.id);assert.equal(api.state.video,null);assert.equal(api.state.file,null);assert.equal(get('#frameDownload').disabled,true);assert.equal(get('#frameDownloadAll').disabled,true);
  await api.removeJob(badJob.id);assert.equal(api.state.jobs.length,0);assert.equal(get('#svgaBatchPanel').classList.contains('hidden'),true);assert.equal(get('#frameDownloadAll').classList.contains('hidden'),true);
  // Parsed files can still fail when renderer assets mount. Continue to the
  // next new file, and do not discard a good current item on replacement.
  const rendererBroken={...file,name:'renderer-broken.svga',video:{...video(),failRenderer:true}};
  await api.loadSvga([rendererBroken,firstFile]);
  assert.equal(api.state.jobs.length,2);assert.equal(api.state.jobs[0].error,'loadError');assert.equal(api.state.file,firstFile,'an asset failure in the first parsed animation does not block later valid files');
  const rendererSafeId=api.state.activeId;api.seek(7);await api.exportFrame();const rendererSafeReceipt=api.state.downloadUrl;
  await api.loadSvga([rendererBroken],{replace:true});
  assert.equal(api.state.activeId,rendererSafeId);assert.equal(api.state.file,firstFile);assert.equal(api.state.frame,7);assert.equal(api.state.downloadUrl,rendererSafeReceipt,'a replacement renderer failure restores the prior animation and receipt');
  assert.equal(api.state.jobs.length,3,'the bad replacement remains separately removable');
  for(const job of [...api.state.jobs])await api.removeJob(job.id);
  await api.loadSvga([firstFile,rendererBroken,secondFile]);
  const [removeActive,removeBad,removeGood]=api.state.jobs;
  assert.equal(api.state.activeId,removeActive.id);assert.equal(removeBad.error,null,'inactive parsed assets have not yet been mounted');
  await api.removeJob(removeActive.id);
  assert.equal(removeBad.error,'loadError');assert.equal(removeBad.video,null,'a failed adjacent renderer is marked unavailable');
  assert.equal(api.state.activeId,removeGood.id);assert.equal(api.state.file,secondFile,'deleting the current item continues past a failed adjacent renderer to the next good file');
  assert.equal(api.state.frame,0);assert.equal(get('#frameDownload').disabled,false);
  for(const job of [...api.state.jobs])await api.removeJob(job.id);
  console.log('PASS: shared empty/loading/processing/ready/success/error feedback, translated async labels, busy controls, one-time preview/result reveals, no scrub reveal, failed-export preservation; navigation/state retention, live FileList, paused first-frame uploads and export, explicit playback, exact frame/Enter, pause-on-edit, bounded seeking, locked dimensions, invalid input, export naming, corrupt-file preservation, language, page-wide drop, successful-only generation/download and retry counts; multi-file queue, per-file frame retention, failed-row isolation, explicit replacement, active deletion, batch ZIP size/mode snapshots, collision-safe names, export locks, partial/all failures, stale-mode rejection, renderer restoration, busy-navigation render guards, renderer-failure replacement/deletion recovery and ZIP retry accounting.');
})().catch(error=>{console.error(error);process.exitCode=1});
