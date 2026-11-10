// Controller flow checks; actual SVGA serialization and browser pixels are checked separately.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const controller = fs.readFileSync(path.join(__dirname, '../avatar-custom.js'), 'utf8')
  .replace(/^import[^\n]+\n/gm, '')
  + '\nwindow.test={state,chooseMode,chooseStyle,loadFiles,loadImageFiles,importFiles,removeImage,placeImage,resizeImage,renderText,exportFiles,sync,changed,firstFrame,editAssets};';
let styleRenderer;
const flush = () => new Promise(resolve => setImmediate(resolve));
function deferred() { let resolve, reject; const promise = new Promise((a, b) => { resolve=a; reject=b; }); return {promise, resolve, reject}; }

function checkVendoredRenderer() {
  const sdk=fs.readFileSync(path.join(__dirname,'../vendor/svga-2.3.2.min.js'),'utf8');
  const marker='{key:"drawFrame",value:',begin=sdk.indexOf(marker)+marker.length,end=sdk.indexOf('},{key:"drawSprite"',begin);
  assert.ok(begin>=marker.length&&end>begin,'read the actual pinned renderer method');
  const drawFrame=vm.runInNewContext('('+sdk.slice(begin,end)+')',{Map});
  for(const matteKey of [undefined,'']){
    const mask={imageKey:'round.matte'},image={imageKey:'frame',matteKey:'round.matte'},text={imageKey:'custom-text',matteKey};
    const draws=[],context={globalCompositeOperation:'source-over',depth:0,clearRect(){},save(){this.depth++;},restore(){this.depth--;}};
    const canvas={width:320,height:320,getContext:()=>context};
    const renderer={_prepared:true,_owner:{_container:canvas,_videoItem:{sprites:[mask,image,text]}},drawSprite(sprite,ctx){assert.ok(sprite,'matte group flush must use an existing mask');draws.push([sprite.imageKey,ctx.globalCompositeOperation]);}};
    drawFrame.call(renderer,0);
    assert.deepEqual(draws,[['frame','source-over'],['round.matte','destination-in'],['custom-text','source-over']],'text after a masked group is drawn outside that group');assert.equal(context.depth,0);
    draws.length=0;renderer._owner._videoItem.sprites=[mask,image];drawFrame.call(renderer,0);assert.deepEqual(draws,[['frame','source-over'],['round.matte','destination-in']],'the last masked group still flushes its own mask');assert.equal(context.depth,0);
  }
  const prepareMarker='{key:"prepare",value:',prepareStart=sdk.indexOf(prepareMarker)+prepareMarker.length,prepareEnd=sdk.indexOf('},{key:"clear"',prepareStart);
  assert.ok(prepareStart>=prepareMarker.length&&prepareEnd>prepareStart);
  const prepare=vm.runInNewContext('('+sdk.slice(prepareStart,prepareEnd)+')',{window:{}});
  const audioOnly={_owner:{_videoItem:{images:{audio:'SUQz'}}}};
  prepare.call(audioOnly);
  assert.equal(audioOnly._prepared,true,'an audio-only source can display a frame when no audio decoder is present');
}

function harness() {
  const nodes=new Map(), listeners=new Map(), windows=new Map(), players=[], parses=[], buildCalls=[], events=[], downloads=[], revoked=[];
  const controls={oldBusy:false,readFail:false,buildFail:false,zipFail:false,pngFail:false,outputParseFail:false,oversize:false,fontReject:false,fontHold:false,webpHold:null,zipHold:null,readHold:null,profile:'high',reducedMotion:false,imageDecodeFail:false,imageDecodeHold:null,imageWidth:400,imageHeight:200};
  const fontRequests=[], webpCalls=[],pngEncodes=[],intersections=[],imageDecodes=[];let nextUrl=0,pauseCalls=0;
  class TestFile extends Blob { constructor(parts,name,options={}) { super(parts,options);this.name=name; } }
  class Element {
    constructor(tag='div') {
      this.tagName=tag.toUpperCase();this.dataset={};this.style={};this.attributes={};this.classes=new Set();this.handlers=new Map();this.children=[];this.options=[];this.textContent='';this.value='';this.hidden=false;this.disabled=false;this.clientWidth=600;this.clientHeight=520;this.width=300;this.height=150;this.draws=[];this.fills=[];this.strokes=[];this.textOrder=[];this.gradients=[];
      this.classList={contains:x=>this.classes.has(x),add:x=>this.classes.add(x),remove:x=>this.classes.delete(x),toggle:(x,on)=>{if(on)this.classes.add(x);else this.classes.delete(x)}};
    }
    setAttribute(key,value) { this.attributes[key]=String(value); }
    getAttribute(key) { return this.attributes[key]??null; }
    removeAttribute(key) { delete this.attributes[key];if(key==='src')delete this.src; }
    addEventListener(type,fn) { if(!this.handlers.has(type))this.handlers.set(type,[]);this.handlers.get(type).push(fn); }
    emit(type,event={}) { let result;for(const fn of this.handlers.get(type)||[])result=fn({target:this,preventDefault(){},stopPropagation(){},...event});return result; }
    click() { if(this.disabled)return;if(this.download)downloads.push(this.download);return this.emit('click'); }
    focus() { document.activeElement=this; }
    append(...children) { for(const child of children){child.parent=this;this.children.push(child);} }
    replaceChildren(...children) { this.children=[];this.append(...children); }
    remove() { if(this.parent)this.parent.children=this.parent.children.filter(x=>x!==this); }
    querySelector(selector) { if(selector==='.avatar-subtabs')return get('tabs');if(selector==='canvas')return this.children.find(x=>x.tagName==='CANVAS')||null;return null; }
    querySelectorAll(selector) { if(selector==='button[data-text-style]')return ['plain','brightGold','champagne','silver','roseGold'].map(key=>get('style-'+key));if(selector==='[data-custom-i18n]')return [];return []; }
    getBoundingClientRect() { return {left:0,top:0,width:360,height:360}; }
    contains(node) { for(;node;node=node.parent)if(node===this)return true;return false; }
    setPointerCapture(id) { this.pointer=id; }
    getContext() {
      if(!this.context){
        const states=[];
        this.context={font:'',fillStyle:'',strokeStyle:'',lineWidth:1,lineJoin:'miter',globalAlpha:1,globalCompositeOperation:'source-over',shadowBlur:0,shadowOffsetX:0,shadowOffsetY:0,shadowColor:'transparent',scale(){},clearRect(){},translate(){},
          save:()=>states.push(Object.fromEntries(Object.entries(this.context).filter(([,value])=>typeof value!=='function'))),
          restore:()=>Object.assign(this.context,states.pop()),
          createLinearGradient:(...coords)=>{const gradient={coords,stops:[],addColorStop(offset,color){this.stops.push([offset,color]);}};this.gradients.push(gradient);return gradient;},
          measureText:text=>({width:text.length*12}),
          fillText:(text,x,y)=>{this.fills.push({text,x,y,font:this.context.font,color:this.context.fillStyle,alpha:this.context.globalAlpha});this.textOrder.push('fill');},
          strokeText:(text,x,y)=>{this.strokes.push({text,x,y,font:this.context.font,color:this.context.strokeStyle,width:this.context.lineWidth,join:this.context.lineJoin});this.textOrder.push('stroke');},drawImage:(...args)=>this.draws.push(args)
        };
      }
      return this.context;
    }
    toBlob(callback,type) { pngEncodes.push(this);callback(controls.pngFail?null:new Blob([new Uint8Array([1,2,3,4])],{type})); }
  }
  const get=id=>{if(!nodes.has(id))nodes.set(id,new Element());return nodes.get(id);};
  for(const id of ['avatarTool','avatarImagesPanel','avatarCustomPanel','avatarImagesTab','avatarCustomTab','avatarCustomTextLayer','avatarCustomFirstFrame','avatarCustomFont','avatarCustomFontSize','avatarCustomText','avatarCustomColor'])get(id);
  for(const key of ['plain','brightGold','champagne','silver','roseGold'])get('style-'+key).dataset.textStyle=key;
  get('avatarCustomPanel').hidden=true;get('avatarCustomText').value='VIP';get('avatarCustomFont').value='inter';get('avatarCustomFontSize').value='32';get('avatarCustomColor').value='#ffffff';
  get('avatarCustomWeight').value='600';get('avatarCustomWeight').options=['400','500','600','700','800'].map(value=>({value,disabled:false}));get('avatarCustomStrokeWidth').value='0';get('avatarCustomStrokeColor').value='#000000';get('avatarCustomStrokeColorValue').value='#000000';get('avatarCustomResult').hidden=true;
  class Player {
    constructor(host) { this.host=host;this._renderer={_prepared:true,_owner:this,drawSprite:sprite=>{this.lastTransform={...sprite.frames[this._currentFrame].transform}}};this.steps=[];this.pauses=0;this.canvas=new Element('canvas');host.append(this.canvas);players.push(this); }
    setContentMode() {} onFrame(fn) { this.onFrameCallback=fn; }
    setVideoItem(video) { if(video.failRenderer)throw Error('renderer');this.video=video; }
    stepToFrame(frame,andPlay) { this.steps.push({frame,andPlay});this._currentFrame=frame;for(const sprite of this.video?.sprites||[])this._renderer.drawSprite(sprite); }
    pauseAnimation() { this.pauses++; }
  }
  class Parser { load(file,success,failure) { parses.push(file);queueMicrotask(()=>{if(file.name.includes('parse-fail')||controls.outputParseFail&&file.name.endsWith('-custom.svga'))failure(Error('parse'));else success({name:file.name,videoSize:{width:320,height:320},frames:60,FPS:30,sprites:[{imageKey:'original',frames:Array.from({length:60},()=>({alpha:1,layout:{width:40,height:30},transform:{a:1,b:0,c:0,d:1,tx:80,ty:80}}))}],failRenderer:file.name.includes('renderer-fail')});}); } }
  class Zip { constructor(){this.entries=[];}file(name,blob){this.entries.push({name,blob});return this;}async generateAsync(){if(controls.zipFail)throw Error('zip');if(controls.zipHold)return controls.zipHold.promise;return new Blob(['archive'],{type:'application/zip'});} }
  const document={documentElement:{lang:'en'},body:new Element('body'),activeElement:null,hidden:false,getElementById:get,createElement:tag=>new Element(tag),addEventListener(type,fn){if(!listeners.has(type))listeners.set(type,[]);listeners.get(type).push(fn);},dispatchEvent(event){for(const fn of listeners.get(event.type)||[])fn(event);},fonts:{load(font,text){const request={font,text};fontRequests.push(request);if(controls.fontReject)return Promise.reject(Error('fontError'));if(controls.fontHold){Object.assign(request,deferred());return request.promise;}return Promise.resolve([{}]);}}};
  const paste=[];
  const window={SVGA:{Player,Parser},JSZip:Zip,Toolkit:{isAvatarBusy:()=>controls.oldBusy,pauseAvatar(){pauseCalls++;}},FunWebP:{getMode:()=>controls.profile},Hub:{record(tool,type,count=1){events.push({tool,type,count});}},UploadPaste:{register(value){paste.push(value);}},canvasToWebP:async(canvas,options)=>{webpCalls.push({canvas,options});if(controls.webpHold)return controls.webpHold.promise;return new Blob(['webp'],{type:'image/webp'});},addEventListener(type,fn){if(!windows.has(type))windows.set(type,[]);windows.get(type).push(fn);}};
  const sandbox={...styleRenderer,document,window,console,Blob,File:TestFile,Uint8Array,Array,Number,String,Math,Date,Promise,Error,performance,setTimeout,clearTimeout,queueMicrotask,CustomEvent:class{constructor(type,options){this.type=type;this.detail=options.detail;}},requestAnimationFrame:callback=>{queueMicrotask(callback);return 1},SVGA_MAX_RUNTIME_BYTES:3000000,svgaBitmapCount:()=>1,svgaRuntimeBytes:(info,images)=>4*(info.width*info.height+images.reduce((sum,image)=>sum+image.width*image.height,0)),URL:{createObjectURL:()=>`blob:${++nextUrl}`,revokeObjectURL:url=>revoked.push(url)},ResizeObserver:class{observe(){}},IntersectionObserver:class{constructor(callback){intersections.push(callback)}observe(){}},MutationObserver:class{observe(){}},matchMedia:()=>({matches:controls.reducedMotion,addEventListener(){}}),createImageBitmap:async(input)=>{const result={input,width:controls.imageWidth,height:controls.imageHeight,closed:false,close(){this.closed=true}};imageDecodes.push(result);if(controls.imageDecodeHold)await controls.imageDecodeHold.promise;if(controls.imageDecodeFail)throw Error('decode');return result},readSvga:async(bytes)=>{if(controls.readHold)await controls.readHold.promise;if(controls.readFail||bytes[0]===255)throw Error('read');return {format:bytes[0]===2?'legacy':'proto',id:bytes[0],info:{width:320,height:320,fps:30,frames:60}};},listSvgaImages:async()=>[{key:'original',bytes:new Uint8Array([4,5,6]),extension:'png',type:'image/png',width:40,height:30}],previewSvgaImages:async()=>{if(controls.editFail)throw Error('asset');return new Uint8Array([3,4,5,6])},buildCustomizedSvga:async(source,options)=>{buildCalls.push({source,options});if(controls.buildFail)throw Error('build');return {bytes:new Uint8Array(controls.oversize?3000001:512),imageKey:'custom-text',optimized:false};}};
  vm.createContext(sandbox);vm.runInContext(controller,sandbox);
  return {api:window.test,get,document,window,controls,players,parses,buildCalls,events,downloads,revoked,fontRequests,webpCalls,pngEncodes,imageDecodes,paste,TestFile,imageFile:(name='badge.png',type='image/png')=>new TestFile([new Uint8Array([9,8,7,6])],name,{type}),intersect:visible=>intersections.forEach(fn=>fn([{isIntersecting:visible}])),pauseCalls:()=>pauseCalls,generated:()=>events.filter(x=>x.type==='generated').reduce((n,x)=>n+x.count,0),downloaded:()=>events.filter(x=>x.type==='download').reduce((n,x)=>n+x.count,0),file:(name='ring.svga',id=1)=>new TestFile([new Uint8Array([id,2,3,4])],name)};
}

(async()=>{
  styleRenderer=await import('../avatar-text-style.mjs');
  checkVendoredRenderer();
  const h=harness(),api=h.api;
  assert.equal(api.state.mode,'images');assert.equal(h.paste[0].isActive(),false,'custom paste target starts inactive');
  h.get('avatarImagesTab').emit('keydown',{key:'End'});assert.equal(api.state.mode,'custom');assert.equal(h.document.activeElement,h.get('avatarCustomTab'));assert.equal(h.get('avatarCustomTab').getAttribute('aria-selected'),'true');assert.equal(h.get('avatarImagesPanel').hidden,true);assert.equal(h.get('avatarCustomPanel').hidden,false);assert.equal(h.paste[0].isActive(),true);
  h.get('avatarCustomTab').emit('keydown',{key:'Home'});assert.equal(api.state.mode,'images');assert.equal(h.document.activeElement,h.get('avatarImagesTab'));h.get('avatarImagesTab').emit('keydown',{key:'ArrowRight'});assert.equal(api.state.mode,'custom');
  h.get('avatarTool').classList.add('hidden');assert.equal(h.paste[0].isActive(),false,'route hiding also disables custom paste');h.get('avatarTool').classList.remove('hidden');
  h.controls.oldBusy=true;api.sync();api.chooseMode('images');assert.equal(api.state.mode,'custom');assert.equal(h.get('avatarImagesTab').disabled,true,'old workflow busy state locks both tabs');h.controls.oldBusy=false;api.sync();
  await api.loadFiles([h.file('bad.png')]);assert.equal(api.state.notice,'fileType');assert.equal(h.parses.length,0);
  await api.loadFiles([{name:'huge.svga',size:50*1024*1024+1}]);assert.equal(api.state.notice,'fileSize');assert.equal(h.parses.length,0);
  h.controls.readHold=deferred();const loading=api.loadFiles([h.file()]);assert.equal(api.state.loading,true);assert.equal(h.get('avatarCustomFields').disabled,true);assert.equal(h.get('avatarCustomUpload').disabled,true);assert.equal(h.get('avatarCustomTab').disabled,true);api.chooseMode('images');assert.equal(api.state.mode,'custom');h.controls.readHold.resolve();await loading;h.controls.readHold=null;
  assert.equal(api.state.file.name,'ring.svga');assert.equal(api.state.source.info.frames,60);assert.equal(api.state.frame,0);assert.ok(h.players[0].steps.some(x=>x.frame===0&&x.andPlay===false));assert.equal(h.get('avatarCustomExport').disabled,false);
  assert.equal(api.state.playing,true,'a successful visible upload starts playback');assert.equal(h.players[0].steps.at(-1).andPlay,true);assert.equal(h.get('avatarCustomPlayText').textContent,'Pause');
  h.get('avatarCustomPlay').click();assert.equal(api.state.playing,false,'the autoplay can be paused explicitly');h.get('avatarCustomPlay').click();assert.equal(api.state.playing,true,'explicit playback still resumes');
  h.intersect(false);assert.equal(api.state.playing,false,'leaving the viewport pauses autoplay');h.intersect(true);api.sync();assert.equal(api.state.playing,false,'returning does not override a pause');
  api.state.position={x:.3,y:.65};api.chooseMode('images');api.chooseMode('custom');assert.equal(api.state.position.x,.3);assert.equal(api.state.position.y,.65);assert.equal(api.state.file.name,'ring.svga','switching tabs preserves the custom upload and position');
  const oldSource=api.state.source,oldFile=api.state.file,oldVideo=api.state.video;
  await api.loadFiles([h.file('unreadable.svga',255)]);assert.equal(api.state.source,oldSource);assert.equal(api.state.file,oldFile);assert.equal(api.state.video,oldVideo);assert.equal(api.state.notice,'loadError');
  assert.equal(api.state.playing,false,'a rejected upload does not restart the previous animation');
  await api.loadFiles([h.file('parse-fail.svga',2)]);assert.equal(api.state.file,oldFile);assert.equal(api.state.source,oldSource);
  await api.loadFiles([h.file('renderer-fail.svga',2)]);assert.equal(api.state.file,oldFile);assert.equal(h.players[0].video,oldVideo);

  h.controls.fontHold=true;h.get('avatarCustomText').value='FIRST';const firstText=api.renderText();h.get('avatarCustomText').value='SECOND';const secondText=api.renderText();const firstFont=h.fontRequests.at(-2),secondFont=h.fontRequests.at(-1);secondFont.resolve([{}]);const secondBitmap=await secondText;firstFont.resolve([{}]);assert.equal(await firstText,null);assert.equal(api.state.bitmap,secondBitmap);assert.deepEqual(secondBitmap.canvas.fills.map(x=>x.text),['SECOND'],'late font completion cannot overwrite a newer text render');h.controls.fontHold=false;
  h.controls.fontHold=true;h.get('avatarCustomText').value='OLD ERROR';api.changed();const oldFontError=h.fontRequests.at(-1);h.get('avatarCustomText').value='NEW TEXT';api.changed();h.fontRequests.at(-1).resolve([{}]);await flush();assert.equal(api.state.notice,'');oldFontError.reject(Error('fontError'));await flush();assert.equal(api.state.notice,'','an obsolete font rejection cannot replace the successful newer preview with an error');h.controls.fontHold=false;
  const textHex=h.get('avatarCustomColorValue');textHex.value='ff3366';textHex.emit('input');await flush();assert.equal(h.get('avatarCustomColor').value,'#ff3366');assert.equal(textHex.value,'#FF3366');assert.equal(textHex.getAttribute('aria-invalid'),'false');assert.equal(api.state.bitmap.color,'#ff3366','valid HEX edits update the committed raster color');
  const coloredBitmap=api.state.bitmap;textHex.value='#12';textHex.emit('input');await flush();assert.equal(textHex.getAttribute('aria-invalid'),'true');assert.equal(h.get('avatarCustomColor').value,'#ff3366');assert.equal(api.state.bitmap,coloredBitmap,'incomplete HEX input does not render a different color');textHex.emit('blur');assert.equal(textHex.value,'#FF3366');assert.equal(textHex.getAttribute('aria-invalid'),'false');
  h.get('avatarCustomColor').value='#123456';h.get('avatarCustomColor').emit('input');await flush();assert.equal(textHex.value,'#123456');assert.equal(api.state.bitmap.color,'#123456','the native color picker updates the HEX field and raster together');
  h.controls.webpHold=deferred();h.controls.zipHold=deferred();const exporting=api.exportFiles();await flush();assert.equal(api.state.exporting,true);assert.equal(h.generated(),0,'no production count until both outputs and ZIP succeed');assert.equal(h.downloaded(),0);assert.equal(h.get('avatarCustomFields').disabled,true);assert.equal(h.get('avatarImagesTab').disabled,true);assert.equal(h.get('avatarCustomStage').getAttribute('aria-busy'),'true');assert.ok(h.parses.at(-1) instanceof h.TestFile,'first-frame reparsing uses a File, supported by the pinned SDK');assert.equal(h.parses.at(-1).name,'ring-custom.svga');assert.ok(h.players.at(-1).steps.some(x=>x.frame===0&&x.andPlay===false),'the output WebP comes from frame zero of the generated SVGA');assert.equal(h.buildCalls.at(-1).options.maxBytes,3000000);assert.equal(h.buildCalls.at(-1).options.allowLossyOptimization,false,'custom SVGA export must preserve pixels rather than resize to fit');assert.equal(h.buildCalls.at(-1).options.optimizeImage,undefined);
  h.controls.webpHold.resolve(new Blob(['webp'],{type:'image/webp'}));await flush();assert.equal(h.generated(),0,'ZIP completion is still required before committing a pair');h.controls.zipHold.resolve(new Blob(['zip'],{type:'application/zip'}));await exporting;h.controls.webpHold=h.controls.zipHold=null;
  assert.equal(h.generated(),2);assert.equal(h.downloaded(),1);assert.deepEqual(h.downloads,['ring-custom.zip']);assert.deepEqual(Array.from(api.state.result.files,x=>x.name),['ring-custom.svga','ring-preview.webp','ring-custom.zip']);assert.equal(api.state.result.files[0].blob.size,512);assert.equal(h.webpCalls.at(-1).options.mode,'high');assert.equal(h.get('avatarCustomFirstFrame').draws.length,1);
  const goodResult=api.state.result,oldUrls=Array.from(goodResult.files,x=>x.url);
  assert.equal(h.get('avatarCustomResult').hidden,true,'the removed output area stays hidden after successful export');assert.equal(h.get('avatarCustomDownloads').children.length,0,'no output download rows are shown below the primary action');
  for(const control of ['buildFail','outputParseFail','zipFail','pngFail','oversize']){
    h.controls[control]=true;await api.exportFiles();h.controls[control]=false;assert.equal(api.state.result,goodResult,control+' preserves the last successful pair');assert.equal(h.generated(),2,control+' must not count generation');assert.equal(h.downloaded(),1,control+' must not trigger download');assert.ok(oldUrls.every(url=>!h.revoked.includes(url)),control+' keeps existing output URLs intact');
  }
  assert.equal(api.state.notice,'sizeLimit','outputs above the hard byte cap are rejected');
  assert.equal(api.state.exporting,false);assert.equal(h.get('avatarCustomFields').disabled,false);

  // Failed font setup during replacement must not mix the new source state with the old player.
  h.controls.fontReject=true;await api.loadFiles([h.file('new-source.svga',2)]);h.controls.fontReject=false;
  assert.equal(api.state.source,oldSource,'font failure during replacement preserves source metadata');assert.equal(api.state.file,oldFile);assert.equal(api.state.video,oldVideo);assert.equal(h.players[0].video,oldVideo);assert.equal(api.state.result,goodResult);

  // A profile change in another tool cannot silently commit a WebP using the old mode.
  h.controls.webpHold=deferred();const staleExport=api.exportFiles();await flush();h.controls.profile='lossless';h.controls.webpHold.resolve(new Blob(['old-profile'],{type:'image/webp'}));await staleExport;h.controls.webpHold=null;
  assert.equal(api.state.result,goodResult,'global compression changes invalidate in-flight output commit');assert.equal(h.generated(),2);assert.equal(h.downloaded(),1);

  // Source replacement stays locked until its font is ready and invalidates only old output URLs.
  h.controls.fontHold=true;const replacing=api.loadFiles([h.file('replacement.svga',2)]);await flush();assert.equal(api.state.loading,true,'font preparation is part of the atomic import');assert.equal(h.get('avatarCustomFields').disabled,true);assert.equal(h.get('avatarCustomTab').disabled,true);const pendingParseCount=h.parses.length;await api.loadFiles([h.file('overlapping.svga',3)]);assert.equal(h.parses.length,pendingParseCount,'another source cannot enter while the font is still loading');h.fontRequests.at(-1).resolve([{}]);await replacing;h.controls.fontHold=false;
  assert.equal(api.state.file.name,'replacement.svga');assert.equal(api.state.source.format,'legacy');assert.equal(api.state.result,null,'successful replacement clears outputs belonging to the previous source');assert.equal(h.get('avatarCustomResult').hidden,true);assert.equal(h.get('avatarCustomDownloads').children.length,0);assert.ok(oldUrls.every(url=>h.revoked.includes(url)));assert.equal(h.generated(),2);assert.equal(h.downloaded(),1,'source replacement itself does not count production or download');

  h.get('avatarCustomText').value='Styled VIP';h.get('avatarCustomFont').value='inter';h.get('avatarCustomFont').emit('change');await flush();
  const weight=h.get('avatarCustomWeight'),strokeWidth=h.get('avatarCustomStrokeWidth'),strokeColor=h.get('avatarCustomStrokeColor'),strokeHex=h.get('avatarCustomStrokeColorValue');
  weight.value='800';weight.emit('change');await flush();assert.match(api.state.bitmap.canvas.fills.at(-1).font,/^800 /,'weight selection reaches the actual text raster');assert.match(h.fontRequests.at(-1).font,/^800 /,'the selected font weight is loaded before drawing');
  const plainBitmap=api.state.bitmap;assert.equal(plainBitmap.canvas.strokes.length,0,'zero outline width does not stroke the text');
  strokeWidth.value='4';strokeWidth.emit('input');await flush();strokeColor.value='#abcdef';strokeColor.emit('input');await flush();
  assert.ok(api.state.bitmap.width>plainBitmap.width&&api.state.bitmap.height>plainBitmap.height,'outline bounds include padding outside the fill raster');assert.equal(api.state.bitmap.canvas.strokes[0].width,8);assert.equal(api.state.bitmap.canvas.strokes[0].join,'round');assert.equal(api.state.bitmap.canvas.strokes[0].color,'#abcdef');assert.deepEqual(api.state.bitmap.canvas.textOrder,['stroke','fill'],'the fill covers the inner half of the outline');assert.equal(strokeHex.value,'#ABCDEF');
  strokeHex.value='fe9000';strokeHex.emit('input');await flush();assert.equal(strokeColor.value,'#fe9000');assert.equal(strokeHex.value,'#FE9000');assert.equal(api.state.bitmap.canvas.strokes[0].color,'#fe9000');const outlinedBitmap=api.state.bitmap;strokeHex.value='#bad!';strokeHex.emit('input');await flush();assert.equal(strokeHex.getAttribute('aria-invalid'),'true');assert.equal(api.state.bitmap,outlinedBitmap);assert.equal(strokeColor.value,'#fe9000','invalid outline HEX drafts leave the committed color intact');strokeHex.emit('blur');assert.equal(strokeHex.value,'#FE9000');assert.equal(strokeHex.getAttribute('aria-invalid'),'false');
  for(const invalid of ['-1','17','not-a-number']){
    strokeWidth.value=invalid;strokeWidth.emit('input');await flush();assert.equal(h.get('avatarCustomExport').disabled,true,'invalid outline widths disable export');const callsBefore=h.buildCalls.length;await api.exportFiles();assert.equal(h.buildCalls.length,callsBefore,'invalid outline values never enter serialization');
  }
  strokeWidth.value='2.5';strokeWidth.emit('input');await flush();assert.equal(h.get('avatarCustomExport').disabled,false);assert.equal(api.state.bitmap.canvas.strokes[0].width,5,'fractional outline widths remain supported');
  h.get('avatarCustomFont').value='bebas';h.get('avatarCustomFont').emit('change');await flush();assert.match(api.state.bitmap.canvas.fills.at(-1).font,/FT Bebas Neue/);assert.ok(Number(api.state.bitmap.canvas.fills.at(-1).font.split(' ')[0])<=700,'static display fonts do not retain an unsupported 800 weight');weight.value='700';weight.emit('change');await flush();assert.match(api.state.bitmap.canvas.fills.at(-1).font,/^700 /,'static display fonts retain their bold option');

  h.get('avatarCustomFont').value='inter';h.get('avatarCustomFont').emit('change');await flush();h.controls.fontHold=true;
  weight.value='400';strokeWidth.value='1';strokeColor.value='#ff0000';h.get('avatarCustomText').value='OLDER STYLE';const oldStyle=api.renderText(),oldStyleFont=h.fontRequests.at(-1);
  weight.value='800';strokeWidth.value='6';strokeColor.value='#0000ff';h.get('avatarCustomText').value='CURRENT STYLE';const newStyle=api.renderText();h.fontRequests.at(-1).resolve([{}]);const currentStyle=await newStyle;oldStyleFont.resolve([{}]);assert.equal(await oldStyle,null);assert.equal(api.state.bitmap,currentStyle);assert.equal(currentStyle.canvas.strokes[0].color,'#0000ff');assert.equal(currentStyle.canvas.strokes[0].width,12);assert.match(currentStyle.canvas.strokes[0].font,/^800 /);h.controls.fontHold=false;
  await api.exportFiles();assert.equal(h.generated(),4);assert.equal(h.downloaded(),2);assert.match(h.pngEncodes.at(-1).strokes[0].font,/^800 /);assert.equal(h.pngEncodes.at(-1).strokes[0].width,12);assert.equal(h.pngEncodes.at(-1).strokes[0].color,'#0000ff','the embedded PNG uses the same committed style as the preview');assert.equal(h.get('avatarCustomResult').hidden,true);assert.equal(h.get('avatarCustomDownloads').children.length,0,'the primary auto-ZIP action does not reveal an output panel');
  const metal=harness(),metalApi=metal.api;
  metalApi.chooseMode('custom');metalApi.chooseStyle('brightGold');assert.equal(metalApi.state.style,'plain','presets cannot update an empty upload');
  await metalApi.loadFiles([metal.file('metal.svga')]);
  metal.get('avatarCustomText').value='ROYAL VIP';metal.get('avatarCustomFont').value='cinzel';metal.get('avatarCustomFont').emit('change');metal.get('avatarCustomWeight').value='800';metal.get('avatarCustomFontSize').value='36';metalApi.state.position={x:.42,y:.77};await metalApi.renderText();
  const beforeMetal=metalApi.state.bitmap;
  metal.get('style-brightGold').click();await flush();
  assert.equal(metalApi.state.style,'brightGold');assert.equal(metalApi.state.bitmap.styleKey,'brightGold');assert.equal(metal.get('avatarCustomTextLayer').dataset.textStyle,'brightGold');
  assert.equal(metal.get('style-brightGold').getAttribute('aria-pressed'),'true');assert.equal(metal.get('style-silver').getAttribute('aria-pressed'),'false','preset selection exposes exactly its own pressed state');
  assert.equal(metal.get('avatarCustomText').value,'ROYAL VIP');assert.equal(metal.get('avatarCustomFont').value,'cinzel');assert.equal(metal.get('avatarCustomWeight').value,'800');assert.equal(metal.get('avatarCustomFontSize').value,'36');assert.deepEqual(metalApi.state.position,{x:.42,y:.77},'applying a surface preset preserves typography and placement');
  assert.ok(metalApi.state.bitmap.canvas.gradients.length>0,'a metallic preset changes the actual PNG renderer, not just its CSS thumbnail');
  assert.ok(metalApi.state.bitmap.width>beforeMetal.width&&metalApi.state.bitmap.height>beforeMetal.height,'metal depth reserves transparent bounds around the text');
  const goldenStops=JSON.stringify(metalApi.state.bitmap.canvas.gradients.map(x=>x.stops));
  metal.get('avatarCustomColorValue').value='#3388CC';metal.get('avatarCustomColorValue').emit('input');await flush();
  assert.equal(metalApi.state.style,'brightGold');assert.equal(metalApi.state.bitmap.color,'#3388CC');assert.notEqual(JSON.stringify(metalApi.state.bitmap.canvas.gradients.map(x=>x.stops)),goldenStops,'editing the base color changes the metallic gradient instead of leaving a disconnected control');
  for(const key of ['champagne','silver','roseGold']){metalApi.chooseStyle(key);await flush();assert.equal(metalApi.state.bitmap.styleKey,key);assert.ok(metalApi.state.bitmap.canvas.gradients.length>0);}
  metalApi.chooseMode('images');metalApi.chooseMode('custom');assert.equal(metalApi.state.style,'roseGold','switching tabs retains the selected effect');
  const retainedColor=metal.get('avatarCustomColor').value;
  metal.controls.readHold=deferred();const metalReplacing=metalApi.loadFiles([metal.file('metal-new.svga',2)]);metalApi.chooseStyle('silver');assert.equal(metalApi.state.style,'roseGold','loading blocks preset changes');metal.controls.readHold.resolve();await metalReplacing;metal.controls.readHold=null;
  assert.equal(metalApi.state.style,'roseGold');assert.equal(metalApi.state.bitmap.styleKey,'roseGold');assert.equal(metal.get('avatarCustomColor').value,retainedColor,'source replacement keeps the user style');
  metal.controls.fontHold=true;metalApi.chooseStyle('brightGold');const lateGold=metal.fontRequests.at(-1);metalApi.chooseStyle('silver');const currentSilver=metal.fontRequests.at(-1);currentSilver.resolve([{}]);await flush();const silverBitmap=metalApi.state.bitmap;lateGold.resolve([{}]);await flush();metal.controls.fontHold=false;
  assert.equal(metalApi.state.bitmap,silverBitmap,'late completion of an old preset cannot overwrite the current effect');assert.equal(silverBitmap.styleKey,'silver');assert.equal(metal.get('avatarCustomTextLayer').dataset.textStyle,'silver');
  const highlight=metal.get('avatarCustomHighlightValue'),shadow=metal.get('avatarCustomShadow');
  assert.equal(metal.get('avatarCustomHighlightField').hidden,false);
  const defaultHighlight=highlight.value;
  highlight.value='FF86CF';highlight.emit('input');await flush();
  assert.deepEqual(metalApi.state.bitmap.canvas.gradients[1].stops[5],[.52,'rgb(255,134,207)']);
  assert.deepEqual(metalApi.state.bitmap.canvas.gradients[1].stops[4],silverBitmap.canvas.gradients[1].stops[4],'editing highlight keeps the dark band');
  shadow.value='#32428d';shadow.emit('input');await flush();
  assert.deepEqual(metalApi.state.bitmap.canvas.gradients[1].stops[4],[.49,'rgb(50,66,141)']);
  assert.equal(metal.get('avatarCustomShadowValue').value,'#32428D');
  const previewStops=JSON.stringify(metalApi.state.bitmap.canvas.gradients.map(x=>x.stops));
  metal.controls.webpHold=deferred();const metalExport=metalApi.exportFiles();await flush();metalApi.chooseStyle('plain');assert.equal(metalApi.state.style,'silver','export locks the style snapshot');assert.equal(JSON.stringify(metal.pngEncodes.at(-1).gradients.map(x=>x.stops)),previewStops,'the embedded PNG uses the same reflective gradient as the preview');metal.controls.webpHold.resolve(new Blob(['webp'],{type:'image/webp'}));await metalExport;metal.controls.webpHold=null;
  assert.equal(metal.generated(),2);assert.equal(metal.get('avatarCustomResult').hidden,true,'metal export retains the simplified output flow');
  metalApi.chooseStyle('silver');await flush();
  assert.equal(highlight.value,defaultHighlight,'reapplying the preset resets its gradient');
  assert.deepEqual(metalApi.state.bitmap.canvas.gradients[1].stops,silverBitmap.canvas.gradients[1].stops);
  const metallicColor=metal.get('avatarCustomColor').value,metallicStroke=metal.get('avatarCustomStrokeWidth').value;
  metalApi.chooseStyle('plain');await flush();assert.equal(metalApi.state.bitmap.styleKey,'plain');assert.equal(metalApi.state.bitmap.canvas.gradients.length,0,'plain mode removes metallic reflections and depth');assert.equal(metal.get('avatarCustomColor').value,metallicColor);assert.equal(metal.get('avatarCustomStrokeWidth').value,metallicStroke,'plain mode keeps editable color and outline values');
  assert.equal(metal.get('avatarCustomHighlightField').hidden,true);
  assert.equal(metal.get('avatarCustomShadowField').hidden,true);
  metalApi.chooseStyle('unknown');await flush();assert.equal(metalApi.state.style,'plain','unknown preset keys do not change current state');
  for(const reason of ['documentHidden','routeHidden','inactiveTab','offscreen','reducedMotion']){
    const guarded=harness();guarded.api.chooseMode('custom');guarded.controls.readHold=deferred();const pending=guarded.api.loadFiles([guarded.file(reason+'.svga')]);
    if(reason==='documentHidden')guarded.document.hidden=true;
    if(reason==='routeHidden')guarded.get('avatarTool').classList.add('hidden');
    if(reason==='inactiveTab')guarded.api.state.mode='images';
    if(reason==='offscreen')guarded.intersect(false);
    if(reason==='reducedMotion')guarded.controls.reducedMotion=true;
    guarded.controls.readHold.resolve();await pending;
    assert.equal(guarded.api.state.playing,false,reason+' blocks automatic playback after asynchronous import');assert.ok(guarded.players[0].steps.every(step=>!step.andPlay));
  }
  assert.equal(metalApi.state.playing,false,'export pauses the animation and does not resume it implicitly');
  const picture=harness(),pictureApi=picture.api;
  pictureApi.chooseMode('custom');await pictureApi.loadFiles([picture.file('picture-base.svga')]);
  assert.equal(pictureApi.state.image,null);
  await pictureApi.loadImageFiles([picture.imageFile()]);
  const firstImage=pictureApi.state.image;
  assert.ok(firstImage,'a decoded PNG becomes an editable image layer');assert.equal(firstImage.name,'badge.png');assert.equal(firstImage.width,128);assert.equal(firstImage.height,64,'the initial image fits 40 percent of a square source without changing its aspect ratio');
  assert.equal(firstImage.blob.type,'image/png','uploaded rasters are normalized into a native-compatible PNG');assert.equal(firstImage.bytes.byteLength,4);assert.equal(firstImage.canvas.width,400);assert.equal(firstImage.canvas.height,200);assert.equal(picture.imageDecodes.at(-1).closed,true,'decoded browser images are released after committing a PNG');
  assert.equal(picture.get('avatarCustomImageLayer').hidden,false);assert.equal(picture.get('avatarCustomImageControls').hidden,false);assert.equal(picture.get('avatarCustomImageLayer').style.width,'40%');assert.equal(picture.get('avatarCustomImageLayer').style.height,'20%');
  assert.equal(picture.generated(),0);assert.equal(picture.downloaded(),0,'image setup is not a production event');
  pictureApi.state.image.position={x:.3,y:.4};pictureApi.placeImage();
  picture.get('avatarCustomImageLayer').emit('keydown',{key:'ArrowRight'});assert.equal(firstImage.position.x,.3+1/320,'image arrows move by one logical canvas pixel');picture.get('avatarCustomImageLayer').emit('keydown',{key:'ArrowDown',shiftKey:true});assert.equal(firstImage.position.y,.4+10/320,'Shift moves ten logical pixels');
  const imageLayer=picture.get('avatarCustomImageLayer'),imageHandle=picture.get('avatarCustomImageResize'),dragStart={...firstImage.position};
  imageLayer.emit('pointerdown',{button:0,pointerId:11,clientX:100,clientY:100});imageLayer.emit('pointermove',{pointerId:12,clientX:136,clientY:118});assert.deepEqual({...firstImage.position},dragStart,'another pointer cannot hijack an image drag');
  imageLayer.emit('pointermove',{pointerId:11,clientX:136,clientY:118});assert.ok(Math.abs(firstImage.position.x-dragStart.x-.1)<1e-12);assert.ok(Math.abs(firstImage.position.y-dragStart.y-.05)<1e-12,'pointer movement maps through the displayed canvas size into logical placement');imageLayer.emit('pointerup',{pointerId:11});
  const afterDrag={...firstImage.position};imageLayer.emit('pointermove',{pointerId:11,clientX:200,clientY:200});assert.deepEqual({...firstImage.position},afterDrag,'released pointer movement cannot continue dragging');
  const anchor={x:firstImage.position.x*320-firstImage.width/2,y:firstImage.position.y*320-firstImage.height/2};
  imageHandle.emit('pointerdown',{button:0,pointerId:13,clientX:100,clientY:100});imageLayer.emit('pointermove',{pointerId:13,clientX:145,clientY:122.5});imageLayer.emit('pointercancel',{pointerId:13});
  assert.equal(firstImage.width,168);assert.equal(firstImage.height,84,'corner dragging preserves the image aspect ratio');assert.ok(Math.abs(firstImage.position.x*320-firstImage.width/2-anchor.x)<1e-10);assert.ok(Math.abs(firstImage.position.y*320-firstImage.height/2-anchor.y)<1e-10,'corner resizing anchors the opposite corner');
  imageHandle.emit('keydown',{key:'ArrowRight',shiftKey:true});assert.equal(firstImage.width,178);assert.equal(firstImage.height,89,'the corner resize handle also supports keyboard scaling');
  const positionBeforeResize={...firstImage.position};pictureApi.resizeImage(160);assert.equal(firstImage.width,160);assert.equal(firstImage.height,80);assert.deepEqual({...firstImage.position},positionBeforeResize,'numeric resizing preserves the image center');
  const imageWidth=picture.get('avatarCustomImageWidth');imageWidth.value='0';imageWidth.emit('input');assert.equal(firstImage.width,160,'an invalid width draft cannot corrupt the committed preview');assert.equal(picture.get('avatarCustomExport').disabled,true);const callsBeforeInvalidImage=picture.buildCalls.length;await pictureApi.exportFiles();assert.equal(picture.buildCalls.length,callsBeforeInvalidImage,'invalid image dimensions do not reach serialization');imageWidth.value='160';imageWidth.emit('input');assert.equal(picture.get('avatarCustomExport').disabled,false);
  pictureApi.chooseMode('images');pictureApi.chooseMode('custom');assert.equal(pictureApi.state.image,firstImage,'switching tools retains uploaded image placement');await pictureApi.loadFiles([picture.file('picture-new-base.svga',2)]);assert.equal(pictureApi.state.image,firstImage,'replacing the base SVGA retains the image layer');assert.deepEqual({...firstImage.position},positionBeforeResize);
  picture.controls.webpHold=deferred();const pairedExport=pictureApi.exportFiles();await flush();
  const decodesWhileExporting=picture.imageDecodes.length;await pictureApi.loadImageFiles([picture.imageFile('racing.webp','image/webp')]);pictureApi.removeImage();pictureApi.resizeImage(240);assert.equal(picture.imageDecodes.length,decodesWhileExporting,'export locks image imports');assert.equal(pictureApi.state.image,firstImage);assert.equal(firstImage.width,160,'export locks image dimension edits');
  picture.controls.webpHold.resolve(new Blob(['webp'],{type:'image/webp'}));await pairedExport;picture.controls.webpHold=null;const imageAndTextResult=pictureApi.state.result,pairedCall=picture.buildCalls.at(-1);
  assert.equal(pairedCall.options.layers.length,2,'image and text are serialized as two independent sprites');assert.deepEqual(Array.from(pairedCall.options.layers,x=>x.key),['image','text'],'text stays above the uploaded image');assert.deepEqual(Array.from(pairedCall.options.layers[0].image),Array.from(firstImage.bytes));assert.equal(pairedCall.options.layers[0].x,firstImage.position.x*320-firstImage.width/2);assert.equal(pairedCall.options.layers[0].y,firstImage.position.y*320-firstImage.height/2);assert.equal(pairedCall.options.layers[0].width,160);assert.equal(pairedCall.options.layers[0].height,80);assert.equal(picture.generated(),2);assert.equal(picture.downloaded(),1);
  const firstImageUrl=firstImage.url;
  picture.controls.imageDecodeFail=true;await pictureApi.loadImageFiles([picture.imageFile('bad.jpg','image/jpeg')]);picture.controls.imageDecodeFail=false;
  assert.equal(pictureApi.state.image,firstImage,'a decoder failure keeps the old image and placement');assert.equal(pictureApi.state.result,imageAndTextResult);assert.ok(!picture.revoked.includes(firstImageUrl));
  picture.controls.pngFail=true;await pictureApi.loadImageFiles([picture.imageFile('bad.webp','image/webp')]);picture.controls.pngFail=false;
  assert.equal(pictureApi.state.image,firstImage,'a PNG conversion failure keeps the previous image');assert.equal(pictureApi.state.result,imageAndTextResult);assert.ok(!picture.revoked.includes(firstImageUrl));
  const imageDecodeCount=picture.imageDecodes.length;await pictureApi.loadImageFiles([{name:'too-large.png',type:'image/png',size:20*1024*1024+1}]);assert.equal(picture.imageDecodes.length,imageDecodeCount,'oversize files are rejected before decoding');assert.equal(pictureApi.state.image,firstImage);
  await pictureApi.loadImageFiles([picture.imageFile('bad.gif','image/gif')]);assert.equal(picture.imageDecodes.length,imageDecodeCount,'unsupported image formats do not enter the decoder');
  for(const [width,height] of [[0,200],[8193,1],[8192,8192]]){picture.controls.imageWidth=width;picture.controls.imageHeight=height;await pictureApi.loadImageFiles([picture.imageFile('huge.png')]);assert.equal(pictureApi.state.image,firstImage,'oversize decoded dimensions keep the previous editable image');assert.equal(picture.imageDecodes.at(-1).closed,true);}
  picture.controls.imageWidth=200;picture.controls.imageHeight=400;picture.controls.imageDecodeHold=deferred();
  const replacingPicture=pictureApi.loadImageFiles([picture.imageFile('portrait.jpg','image/jpeg')]);assert.equal(pictureApi.state.imageLoading,true);assert.equal(picture.get('avatarCustomFields').disabled,true);pictureApi.removeImage();assert.equal(pictureApi.state.image,firstImage,'removal is locked while an image import is preparing');const imageParses=picture.parses.length;await pictureApi.loadFiles([picture.file('racing.svga')]);assert.equal(picture.parses.length,imageParses,'base replacement is locked while decoding an image');picture.controls.imageDecodeHold.resolve();await replacingPicture;picture.controls.imageDecodeHold=null;
  const portrait=pictureApi.state.image;assert.notEqual(portrait,firstImage);assert.equal(portrait.name,'portrait.jpg');assert.equal(portrait.width,160);assert.equal(portrait.height,320,'replacement keeps logical width and uses the new aspect ratio');assert.deepEqual({...portrait.position},positionBeforeResize);assert.ok(picture.revoked.includes(firstImageUrl),'the previous image URL is released only after a replacement commits');assert.equal(pictureApi.state.result,imageAndTextResult,'a changed image keeps the last internal output until a complete new export succeeds');
  picture.get('avatarCustomText').value='';pictureApi.changed();await flush();assert.equal(pictureApi.state.bitmap,null);assert.equal(picture.get('avatarCustomExport').disabled,false,'an image alone is a valid customization');
  picture.controls.fontReject=true;const fontCountBeforeImageOnly=picture.fontRequests.length;await pictureApi.exportFiles();picture.controls.fontReject=false;
  const imageOnlyCall=picture.buildCalls.at(-1);assert.equal(imageOnlyCall.options.layers.length,1);assert.equal(imageOnlyCall.options.layers[0].key,'image');assert.equal(picture.fontRequests.length,fontCountBeforeImageOnly,'image-only export does not require a font');assert.equal(picture.generated(),4);assert.equal(picture.downloaded(),2);
  const portraitUrl=portrait.url,finalImageResult=pictureApi.state.result;pictureApi.removeImage();assert.equal(pictureApi.state.image,null);assert.ok(picture.revoked.includes(portraitUrl));assert.equal(picture.get('avatarCustomImageLayer').hidden,true);assert.equal(picture.get('avatarCustomExport').disabled,true,'empty text and no image cannot export an unmodified source accidentally');assert.equal(pictureApi.state.result,finalImageResult);
  const routing=harness();routing.api.chooseMode('custom');await routing.api.loadFiles([routing.file('routing.svga')]);const baseParseCount=routing.parses.length;
  await routing.paste[0].onFiles([routing.imageFile('pasted.webp','image/webp')]);assert.equal(routing.imageDecodes.length,1);assert.equal(routing.parses.length,baseParseCount,'pasted images route to the overlay importer instead of the SVGA parser');assert.equal(routing.api.state.image.name,'pasted.webp');
  routing.document.dispatchEvent({type:'drop',dataTransfer:{files:[routing.imageFile('dropped.jpg','image/jpeg')]},preventDefault(){}});await flush();await flush();assert.equal(routing.imageDecodes.length,2,'one controller drop performs one decode');assert.equal(routing.api.state.image.name,'dropped.jpg');assert.equal(routing.parses.length,baseParseCount);
  routing.controls.imageWidth=4000;routing.controls.imageHeight=3000;await routing.api.loadImageFiles([routing.imageFile('large-photo.png')]);assert.equal(routing.api.state.image.canvas.width,640);assert.equal(routing.api.state.image.canvas.height,480,'large source rasters normalize to at most twice the SVGA canvas size');assert.equal(routing.api.state.image.width,128);assert.equal(routing.api.state.image.height,96);
  const thin=harness();thin.api.chooseMode('custom');await thin.api.loadFiles([thin.file('thin-base.svga')]);thin.controls.imageWidth=8192;thin.controls.imageHeight=1;await thin.api.loadImageFiles([thin.imageFile('wide-strip.png')]);
  assert.equal(thin.api.state.image.canvas.width,640);assert.equal(thin.api.state.image.canvas.height,1,'the normalized PNG rounds its tiny axis to a physical pixel');assert.equal(thin.api.state.image.width,128);assert.equal(thin.api.state.image.height,128/8192,'logical placement retains the original aspect ratio rather than using rounded PNG dimensions');
  thin.api.resizeImage(256);assert.equal(thin.api.state.image.height,256/8192,'manual resizing also uses the original image ratio');await thin.api.exportFiles();assert.equal(thin.buildCalls.at(-1).options.layers[0].width,256);assert.equal(thin.buildCalls.at(-1).options.layers[0].height,256/8192,'the SVGA sprite uses the original ratio after normalization and resizing');
  const assets=harness(),assetApi=assets.api;
  assetApi.chooseMode('custom');assets.get('avatarCustomText').value='';await assetApi.loadFiles([assets.file()]);
  const originalAsset=assetApi.state.sourceAssets[0],beforeAssetVideo=assetApi.state.video;
  assert.equal(assets.get('avatarCustomAssetList').children.length,1);
  assert.equal(assets.get('avatarCustomExport').disabled,true,'an untouched animation does not gain sample text');
  await assetApi.loadImageFiles([assets.imageFile('first.png')],true);
  await assetApi.loadImageFiles([assets.imageFile('second.png')],true);
  assert.equal(assets.get('avatarCustomAddedImages').children.length,2);
  const [firstAdded,secondAdded]=assetApi.state.images;
  const group=assets.get('avatarCustomAssetDrag');
  assetApi.state.assetSelection.add(originalAsset);assetApi.state.assetSelection.add(secondAdded);assetApi.sync();
  assert.equal(group.hidden,false);
  group.emit('pointerdown',{button:0,pointerId:1,clientX:10,clientY:10});
  group.emit('pointermove',{pointerId:1,clientX:55,clientY:32.5});group.emit('pointerup',{pointerId:1});
  await flush();
  assert.deepEqual({...assetApi.state.assetOffsets.get(originalAsset.key)},{x:40,y:20});
  assert.equal(assets.players[0].lastTransform.tx,120);assert.equal(assets.players[0].lastTransform.ty,100);
  assert.equal(assets.players[0].video.sprites[0].frames[0].transform.tx,80,'live rendering does not mutate animation data');
  assert.equal(firstAdded.position.x,.5);assert.equal(secondAdded.position.x,.625);
  await assetApi.exportFiles();
  assert.deepEqual({...assets.buildCalls.at(-1).options.imageOffsets.get(originalAsset.key)},{x:40,y:20});
  assert.equal(assets.buildCalls.at(-1).options.enforceRuntimeBudget,true);
  assert.match(assets.get('avatarCustomRuntimeMeta').textContent,/1\.05 \/ 3 MB/);
  assetApi.state.assetSelection.clear();
  assetApi.state.assetSelection.add(originalAsset);assetApi.state.assetSelection.add(firstAdded);
  assets.controls.editFail=true;await assetApi.editAssets();assets.controls.editFail=false;
  assert.equal(assetApi.state.video,beforeAssetVideo);assert.equal(assetApi.state.images.length,2);assert.equal(assetApi.state.removedImages.size,0);
  await assetApi.editAssets();
  assert.deepEqual(Array.from(assetApi.state.removedImages),['original']);assert.equal(assetApi.state.images[0],secondAdded);
  assert.equal(assets.get('avatarCustomAssetList').children.length,1);assert.ok(assets.revoked.includes(firstAdded.url));
  await assetApi.exportFiles();assert.deepEqual(Array.from(assets.buildCalls.at(-1).options.removedImageKeys),['original']);assert.equal(assets.buildCalls.at(-1).options.layers.length,1);
  assetApi.removeImage();assert.equal(assets.get('avatarCustomExport').disabled,false,'source-only deletion can export');
  await assetApi.exportFiles();assert.equal(assets.buildCalls.at(-1).options.layers.length,0);
  await assetApi.editAssets(true);assert.equal(assetApi.state.removedImages.size,0);assert.equal(assets.get('avatarCustomAssetList').children.length,1);
  console.log('avatar-custom: existing editor, source asset list, deletion rollback and restore, and deletion-only export passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
