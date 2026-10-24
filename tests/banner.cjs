// Run: node tests/banner.cjs. Browser rendering and real WebP checks are separate.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const elements=new Map(),urls=new Map(),revoked=new Set(),encodes=[],zips=[],downloads=[],timers=[];
const events=[],uiStates=[],reveals=[];
const feedback=()=>uiStates.at(-1);
const recorded=type=>events.filter(event=>event.tool==='banner'&&event.type===type).reduce((total,event)=>total+event.count,0);
const docListeners=new Map(),windowListeners=new Map();
let serial=0,encodeFails=false,failEncodeAt=0,zipFails=false;
function element(tag='div'){
  const classes=new Set(),listeners=new Map(),attributes=new Map();
  const node={tagName:tag.toUpperCase(),style:{},dataset:{},value:'',textContent:'',innerHTML:'',width:0,height:0,children:[],disabled:false,
    classList:{add(...xs){xs.forEach(x=>classes.add(x))},remove(...xs){xs.forEach(x=>classes.delete(x))},toggle(x,on){if(on)classes.add(x);else classes.delete(x)},contains(x){return classes.has(x)}},
    setAttribute(k,v){attributes.set(k,v);this[k]=v},getAttribute:k=>attributes.get(k),removeAttribute(k){attributes.delete(k);delete this[k]},
    append(...xs){this.children.push(...xs)},appendChild(x){this.children.push(x);return x},replaceChildren(...xs){this.children=xs;this.innerHTML=''},remove(){},
    click(){downloads.push({name:this.download,url:this.href});listeners.get('click')?.({button:0,defaultPrevented:false,target:this})},addEventListener(k,fn){listeners.set(k,fn)},fire(k,event={}){return listeners.get(k)?.(event)},
    querySelector(){return null},querySelectorAll(){return []},contains(target){return target===this},
    getContext(){return this.context??=context(this)},toBlob(callback,type){callback(new Blob(['mock'],{type}))}};
  return node;
}
function context(canvas){
  const operations=[];
  return {canvas,operations,clearRect(...xs){operations.push(['clearRect',...xs])},drawImage(...xs){operations.push(['drawImage',...xs])},
    save(){operations.push(['save'])},restore(){operations.push(['restore'])},beginPath(){},closePath(){},rect(){},roundRect(){},
    moveTo(){},lineTo(){},arcTo(){},quadraticCurveTo(){},clip(){operations.push(['clip'])},fill(){},fillRect(){},stroke(){}};
}
const get=selector=>{if(!elements.has(selector))elements.set(selector,element());return elements.get(selector)};
const document={body:element('body'),documentElement:{lang:'en'},querySelector:get,querySelectorAll:()=>[],createElement:element,
  addEventListener(k,fn){docListeners.set(k,fn)}};
class MockImage{
  constructor(){this.complete=false;this.naturalWidth=this.width=684;this.naturalHeight=this.height=240;this.listeners=new Map()}
  addEventListener(k,fn){this.listeners.set(k,fn)}
  set src(value){
    this._src=value;const file=urls.get(value);
    this.naturalWidth=this.width=file?.width||684;this.naturalHeight=this.height=file?.height||240;
    queueMicrotask(()=>{
      if(file?.name==='broken.png'){this.onerror?.(Error('decode failed'));this.listeners.get('error')?.(Error('decode failed'))}
      else{this.complete=true;this.onload?.();this.listeners.get('load')?.()}
    });
  }
  get src(){return this._src}
  decode(){return urls.get(this.src)?.name==='broken.png'?Promise.reject(Error('decode failed')):Promise.resolve()}
}
class MockZip{
  constructor(){this.files=[];zips.push(this)}
  file(name,blob){this.files.push({name,blob});return this}
  async generateAsync(options){this.options=options;if(zipFails)throw Error('zip failed');return new Blob(['zip'],{type:'application/zip'})}
}
const sandbox={window:{addEventListener(k,fn){windowListeners.set(k,fn)},Hub:{record(tool,type,count=1){events.push({tool,type,count})}},FunToolkitUI:{setState(tool,state){uiStates.push({tool,...state})},reveal(node){reveals.push(node)}}},document,Image:MockImage,JSZip:MockZip,language:'en',Blob,TextEncoder,Uint8Array,Number,Math,Array,Object,Promise,Error,String,Date,Set,console,
  URL:{createObjectURL(blob){const url='blob:banner-'+ ++serial;urls.set(url,blob);return url},revokeObjectURL(url){revoked.add(url);urls.delete(url)}},
  setTimeout(fn,delay){if(delay<60000)queueMicrotask(fn);else timers.push(fn);return serial},clearTimeout(){},
  prepareBannerWebP:async()=>{},canvasToLosslessWebP:async(canvas)=>{assert.equal(feedback().phase,'processing','real encoding uses processing feedback');encodes.push({canvas,width:canvas.width,height:canvas.height});if(encodeFails||encodes.length===failEncodeAt)throw Error('encode failed');return new Blob(['webp-'+encodes.length],{type:'image/webp'})}};
sandbox.window.JSZip=MockZip;
let source=fs.readFileSync(path.join(__dirname,'../banner.js'),'utf8');
const marker='window.BannerTool={syncLanguage};';
assert.ok(source.includes(marker),'banner.js must expose its public language hook');
source=source.replace(marker,marker+'window.bannerTest={state,cropRect,loadFiles,downloadAll,setPreviewBackground};');
vm.createContext(sandbox);vm.runInContext(source,sandbox);
const api=sandbox.window.bannerTest;
const file=(name='landscape.png',width=1200,height=600,type='image/png')=>({name,type,size:4096,width,height});
const crop=(...args)=>JSON.parse(JSON.stringify(api.cropRect(...args)));
const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-8,`${actual} should equal ${expected}`);
function assertCover(imageWidth,imageHeight,targetWidth,targetHeight){
  const r=crop(imageWidth,imageHeight,targetWidth,targetHeight);
  near(r.sx,(imageWidth-r.sw)/2);near(r.sy,(imageHeight-r.sh)/2);near(r.sw/r.sh,targetWidth/targetHeight);
  assert.ok(r.sx>=0&&r.sy>=0&&r.sw<=imageWidth&&r.sh<=imageHeight);
  assert.ok(Math.abs(r.sw-imageWidth)<1e-8||Math.abs(r.sh-imageHeight)<1e-8,'cover should consume one complete image axis');
}
function assertPreviewBackground(value){
  assert.equal(api.state.previewBackground,value);
  assert.equal(get('#gameBannerPreview').dataset.background,value);
  assert.equal(get('#bannerPreviewBlack').getAttribute('aria-pressed'),String(value==='black'));
  assert.equal(get('#bannerPreviewTransparent').getAttribute('aria-pressed'),String(value==='transparent'));
}
(async()=>{
  assert.equal(feedback().tool,'banner');assert.equal(feedback().phase,'empty');assert.equal(reveals.length,0);
  assertPreviewBackground('black');
  await api.downloadAll();assert.equal(events.length,0,'empty downloads and initial previews must not count');
  assert.equal(get('#bannerResolutionNote').classList.contains('hidden'),true,'no warning before an image is uploaded');
  assert.deepEqual(crop(772,200,772,200),{sx:0,sy:0,sw:772,sh:200});
  for(const dimensions of [[1200,600,772,200],[600,1200,645,201],[100000,1,772,200],[1,100000,645,201],[800,800,645,201]])assertCover(...dimensions);
  // Snapshot the live FileList before any image or template await.
  const first=file();const selection=[first],feedbackStart=uiStates.length;const pending=api.loadFiles({[Symbol.iterator]:()=>selection[Symbol.iterator]()});
  assert.equal(feedback().phase,'loading');assert.equal(feedback().message,'Reading image…');
  assert.equal(get('#bannerUpload').getAttribute('aria-busy'),'true');selection.length=0;await pending;
  assert.equal(api.state.file,first);assert.equal(api.state.busy,false);assert.equal(api.state.outputs.length,2);
  assert.equal(feedback().phase,'success');assert.equal(feedback().message,'2 files ready');assert.equal(get('#bannerUpload').getAttribute('aria-busy'),'false');
  assert.deepEqual(uiStates.slice(feedbackStart).map(state=>state.phase).filter((phase,index,phases)=>index===0||phase!==phases[index-1]),['loading','processing','success']);
  assert.deepEqual(reveals,[get('#bannerPreviews'),get('#bannerOutputList')],'only committed preview and result surfaces reveal');
  assert.deepEqual(Array.from(api.state.outputs,o=>[o.kind,o.width,o.height]),[['room',772,200],['game',684,240]]);
  assert.deepEqual(encodes.map(e=>[e.width,e.height]),[[772,200],[684,240]]);
  assert.equal(recorded('generated'),2,'one successful upload produces two countable files');assert.equal(recorded('download'),0);
  assert.equal(get('#bannerResolutionNote').classList.contains('hidden'),true,'a sufficiently large original needs no enlargement warning');
  assert.equal(get('#bannerResolutionNote').textContent,'');
  for(const output of api.state.outputs){assert.equal(output.blob.type,'image/webp');assert.match(output.name,/\.webp$/);assert.equal(urls.get(output.url),output.blob)}
  // The supplied example has a solid placeholder; the image replaces its interior.
  const gameOperations=encodes[1].canvas.getContext('2d').operations;
  const gameDraws=gameOperations.filter(op=>op[0]==='drawImage');
  assert.ok(gameDraws.length>=2,'game banner should paint an image and overlay');
  assert.match(gameDraws[0][1].src,/game-banner-frame\.webp$/);
  assert.ok(gameOperations.some(op=>op[0]==='clip'),'game image should be clipped to its rounded inner opening');
  const innerDraw=gameDraws.find(op=>op.length===10);
  assert.ok(innerDraw,'game image uses a source crop and destination rectangle');
  assert.deepEqual(innerDraw.slice(-4),[19.5,18,645,201]);
  const firstOutputs=Array.from(api.state.outputs),firstImage=api.state.image;
  // Preview backgrounds change only CSS, preserving generated files and their URLs.
  const previewEncodeCount=encodes.length,previewUrls=new Map(urls),previewRevoked=new Set(revoked),revealCount=reveals.length;
  for(const value of ['transparent','black']){
    api.setPreviewBackground(value);assertPreviewBackground(value);
    assert.equal(encodes.length,previewEncodeCount,'changing the preview background must not encode again');
    assert.deepEqual(Array.from(api.state.outputs),firstOutputs);
    assert.deepEqual(urls,previewUrls);assert.deepEqual(revoked,previewRevoked);
    for(const [index,output] of firstOutputs.entries())assert.equal(api.state.outputs[index].blob,output.blob);
    assert.equal(recorded('generated'),2);assert.equal(recorded('download'),0,'preview background changes must not count');
    assert.equal(reveals.length,revealCount,'preview backgrounds do not replay entry animation');
  }
  const inputUrls=Array.from(revoked).filter(url=>url.startsWith('blob:banner-'));
  assert.ok(inputUrls.length>=1,'the decoded upload object URL should be released');
  // Language updates must reuse the current output blobs and URLs.
  sandbox.language='zh';sandbox.window.BannerTool.syncLanguage();
  assert.equal(api.state.outputs[0],firstOutputs[0]);assert.equal(urls.get(firstOutputs[0].url),firstOutputs[0].blob);
  assert.equal(recorded('generated'),2);assert.equal(recorded('download'),0,'language changes only rerender existing output links');
  assert.equal(feedback().phase,'success');assert.equal(feedback().message,'已生成 2 个文件');assert.equal(reveals.length,revealCount,'language changes do not replay entry animation');
  for(const invalid of [[file(),file('other.png')],[file('notes.txt',1,1,'text/plain')],[{...file(),size:31*1024*1024}]]){
    await api.loadFiles(invalid);assert.ok(api.state.notice,'invalid input should surface a notice');
    assert.equal(api.state.image,firstImage);assert.equal(api.state.outputs[0],firstOutputs[0]);assert.equal(api.state.busy,false);
    assert.equal(feedback().phase,'error');assert.equal(reveals.length,revealCount,'invalid replacements do not reveal old results again');
  }
  sandbox.language='en';sandbox.window.BannerTool.syncLanguage();assert.equal(feedback().phase,'error');assert.equal(feedback().message,'Choose an image under 30 MB.','error feedback follows the selected language');
  sandbox.language='zh';sandbox.window.BannerTool.syncLanguage();
  await api.loadFiles([file('broken.png')]);assert.ok(api.state.notice);assert.equal(api.state.image,firstImage);assert.equal(api.state.outputs[0],firstOutputs[0]);
  encodeFails=true;await api.loadFiles([file('encode-failure.png')]);encodeFails=false;
  assert.ok(api.state.notice);assert.equal(api.state.image,firstImage);assert.equal(api.state.outputs[0],firstOutputs[0]);assert.equal(api.state.busy,false);
  assert.equal(feedback().phase,'error');assert.match(feedback().message,/生成失败/);assert.equal(reveals.length,revealCount);
  for(const output of firstOutputs)assert.equal(urls.get(output.url),output.blob,'failed replacement keeps existing download URLs');
  const urlsBeforePartialFailure=new Set(urls.keys());failEncodeAt=encodes.length+2;
  await api.loadFiles([file('partial-encode-failure.jpg',1200,600,'image/jpeg')]);failEncodeAt=0;
  assert.equal(api.state.outputs[0],firstOutputs[0]);assert.deepEqual(new Set(urls.keys()),urlsBeforePartialFailure,'a second-output failure releases the first newly generated output URL');
  assert.equal(recorded('generated'),2);assert.equal(recorded('download'),0,'invalid inputs and first/second-output failures must not count');
  const replacement=file('portrait.webp',600,1200,'image/webp');await api.loadFiles([replacement]);
  assert.equal(api.state.file,replacement);assert.equal(api.state.outputs.length,2);
  assert.equal(recorded('generated'),4,'a successful replacement counts two new files');
  for(const output of firstOutputs)assert.equal(revoked.has(output.url),true,'successful replacement releases old output URLs');
  assert.equal(get('#bannerResolutionNote').classList.contains('hidden'),false,'an original narrower than 772 px displays the warning');
  assert.match(get('#bannerResolutionNote').textContent,/原图较小/);
  sandbox.language='en';sandbox.window.BannerTool.syncLanguage();
  assert.match(get('#bannerResolutionNote').textContent,/needs enlarging/,'the warning follows the selected language');
  assert.equal(recorded('generated'),4,'localizing the resolution warning must not count');
  await api.loadFiles([file('short.png',1000,200)]);
  assert.equal(get('#bannerResolutionNote').classList.contains('hidden'),false,'an original shorter than 201 px displays the warning');
  await api.loadFiles([file('minimum.png',772,201)]);
  assert.equal(get('#bannerResolutionNote').classList.contains('hidden'),true,'the exact 772 x 201 minimum hides the warning');
  assert.equal(get('#bannerResolutionNote').textContent,'');
  assert.equal(recorded('generated'),8,'each successful source upload contributes exactly two files');
  const outputLinks=get('#bannerOutputList').children.map(row=>row.children.find(child=>child.download));
  assert.equal(outputLinks.length,2);for(const link of outputLinks){assert.ok(link);link.click()}
  assert.equal(recorded('download'),2,'each single-file link counts one download request');assert.equal(recorded('generated'),8);
  const currentOutputs=Array.from(api.state.outputs),beforeZipReveals=reveals.length;const zipPending=api.downloadAll();
  assert.equal(feedback().phase,'processing');assert.equal(feedback().message,'Creating ZIP…');await zipPending;
  assert.equal(feedback().phase,'success');assert.equal(reveals.length,beforeZipReveals,'packaging an existing result does not replay its appearance');
  const zip=zips.at(-1);assert.ok(zip,'Download all creates a ZIP');
  assert.equal(zip.files.length,2);assert.deepEqual(zip.files.map(f=>f.name),currentOutputs.map(o=>o.name));
  assert.equal(zip.files[0].blob,currentOutputs[0].blob);assert.equal(zip.files[1].blob,currentOutputs[1].blob);
  assert.ok(downloads.some(d=>/\.zip$/i.test(d.name)),'ZIP should be downloaded');
  assert.equal(recorded('download'),3,'the two-file ZIP counts one download request');assert.equal(recorded('generated'),8,'ZIP assembly does not generate images again');
  zipFails=true;await api.downloadAll();zipFails=false;assert.equal(api.state.notice,'zipError');
  assert.equal(feedback().phase,'error');assert.equal(feedback().message,'Could not create the ZIP. Retry or download each file.');
  assert.equal(recorded('download'),3,'failed ZIP packaging does not count a download');assert.equal(recorded('generated'),8);
  timers.splice(0).forEach(fn=>fn());
  for(const output of currentOutputs)assert.equal(urls.get(output.url),output.blob,'active preview URLs survive download cleanup');
  windowListeners.get('pagehide')({persisted:true});
  for(const output of currentOutputs)assert.equal(urls.get(output.url),output.blob,'back-forward cache preserves download URLs');
  windowListeners.get('pagehide')({persisted:false});
  for(const output of currentOutputs)assert.equal(urls.has(output.url),false,'a final page exit releases download URLs');
  assert.equal(recorded('generated'),8);assert.equal(recorded('download'),3,'page cleanup does not affect aggregate counters');
  console.log('PASS: loading/processing/committed-success/error feedback and localization; reveal only on a new committed result; centered cover crop including extreme ratios, live FileList, two exact lossless WebP canvas sizes, game overlay/rounded inner crop, CSS-only black/transparent preview switch, source-resolution warning boundaries and language, invalid/decode/encode rollback, URL cleanup, language URL reuse, two-file ZIP, committed-only generation and single/ZIP download counts.');
})().catch(error=>{console.error(error);process.exitCode=1});
