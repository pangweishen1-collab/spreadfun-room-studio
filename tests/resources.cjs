// Behavior contracts; real Canvas/files and responsive layouts are verified in the browser.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const elements=new Map(),downloads=[],urls=new Map(),revoked=[],cleanup=[],images=[],encodes=[],feedback=[],events=[];
let serial=0,encodeFail=false,wrongMime=false,holdLoads=false,failSrc='',holdWebP=null,marketFail='',holdMarket=null,urlFail=false;
function element(tag='div'){
  const classes=new Set(),listeners=new Map(),attributes=new Map();let value='512';
  const node={tagName:tag.toUpperCase(),dataset:{},children:[],style:{},textContent:'',hidden:false,disabled:false,width:0,height:0,
    get value(){return value},set value(x){value=String(x)},classList:{add(x){classes.add(x)},remove(x){classes.delete(x)},contains(x){return classes.has(x)},toggle(x,on){if(on)classes.add(x);else classes.delete(x)}},
    setAttribute(k,v){attributes.set(k,String(v))},getAttribute:k=>attributes.get(k),append(...xs){this.children.push(...xs)},replaceChildren(...xs){this.children=xs},remove(){},
    addEventListener(k,fn){listeners.set(k,fn)},fire(k,e={}){return listeners.get(k)?.(e)},click(){if(this.download)downloads.push({name:this.download,url:this.href});listeners.get('click')?.({preventDefault(){}})},
    querySelector(selector){return this.children.find(child=>'.'+child.className===selector)||null},querySelectorAll(selector){if(selector==='[data-project]')return get('#resourceCatalog').children;if(selector==='[data-resource-size]')return presets;if(selector==='input[name="resourceFormat"]')return formats;return [...get('#resourceCatalog').children,get('#resourceWidth'),get('#resourceHeight'),...presets,...formats]},
    getContext(){return this.context??={operations:[],save(){this.operations.push(['save'])},beginPath(){this.operations.push(['beginPath'])},roundRect(...args){this.operations.push(['roundRect',...args])},clip(){this.operations.push(['clip'])},restore(){this.operations.push(['restore'])},drawImage(...args){this.operations.push(['draw',...args])},fillRect(...args){this.operations.push(['fill',this.fillStyle,...args])}}},
    toBlob(callback,mime,quality){encodes.push({canvas:this,mime,quality});if(encodeFail)throw Error('failure');callback(new Blob(['pixels'],{type:wrongMime?'image/png':mime}))}};
  return node;
}
function get(selector){if(!elements.has(selector))elements.set(selector,element());return elements.get(selector)}
const presets=[128,256,512,1024].map(size=>{const node=element('button');node.dataset.resourceSize=String(size);return node});
const formats=['png','jpg','webp'].map(value=>{const node=element('input');node.value=value;return node});
const document={body:element('body'),querySelector:get,createElement:element,querySelectorAll:s=>s==='[data-resource-size]'?presets:s==='input[name="resourceFormat"]'?formats:[]};
class MockImage{
  constructor(){this.naturalWidth=512;this.naturalHeight=512;images.push(this)}
  set src(src){this._src=src;const size=Number(src.match(/-(\d+)\.webp$/)?.[1]);this.naturalWidth=this.naturalHeight=size||512;this.complete=()=>src===failSrc?this.onerror?.():this.onload?.();if(!holdLoads)queueMicrotask(this.complete)}
  get src(){return this._src}
}
const marketEncodes=[];
const sandbox={Uint8Array,document,Image:MockImage,language:'zh',Blob,Error,String,Number,Math,Array,Object,Promise,URL:{createObjectURL(blob){if(urlFail)throw Error('downloadError');const url='blob:logo-'+ ++serial;urls.set(url,blob);return url},revokeObjectURL(url){revoked.push(url)}},setTimeout(fn){cleanup.push(fn)},window:{MarketIconPNG:{async encode(canvas,options){marketEncodes.push({canvas,options});if(holdMarket)await holdMarket;if(marketFail)throw Error(marketFail);return new Blob(['market'],{type:'image/png'})}},addEventListener(){},FunToolkitUI:{setState(tool,value){assert.equal(tool,'resources');feedback.push({...value})},reveal(){}},Hub:{record(...args){events.push(args)}}},canvasToWebP:async(canvas,quality)=>{assert.equal(quality,1);encodes.push({canvas,mime:'image/webp'});if(holdWebP)await holdWebP;if(encodeFail)throw Error('encodeError');return new Blob(['webp'],{type:'image/webp'})}};
let source=fs.readFileSync(path.join(__dirname,'../resource-library.js'),'utf8').replace('window.ResourceLibrary={activate,syncLanguage};','window.ResourceLibrary={activate,syncLanguage};window.resourceTest={state,projects,selectProject,changeDimension,chooseFormat,downloadLogo,encodeLogo,sourceFor,chooseTarget,changeCorner};');
vm.createContext(sandbox);vm.runInContext(fs.readFileSync(path.join(__dirname,'../project-selector.js'),'utf8'),sandbox);vm.runInContext(source,sandbox);const api=sandbox.window.resourceTest,flush=()=>new Promise(setImmediate);
const encodeCount=()=>encodes.length+marketEncodes.length;
async function freshDownload(){
 const before=encodeCount(),count=downloads.length,previous=api.state.download;
 await api.downloadLogo();
 assert.equal(encodeCount(),before+1,'an export setting change must create a new encoded file');
 assert.equal(downloads.length,count+1);assert.ok(api.state.download);
 if(previous)assert.notEqual(api.state.download.blob,previous.blob);
 return api.state.download;
}
async function cachedDownload(){
 const previous=api.state.download,before=encodeCount(),imageCount=images.length,count=downloads.length;
 assert.ok(previous);await api.downloadLogo();
 assert.equal(encodeCount(),before,'unchanged exports must reuse the encoded Blob');
 assert.equal(images.length,imageCount,'unchanged exports must not decode a source again');
 assert.equal(api.state.download.blob,previous.blob);assert.equal(downloads.length,count+1);
 assert.notEqual(api.state.download.url,previous.url,'each download owns a fresh receipt URL');
 assert.equal(urls.get(api.state.download.url),previous.blob);
 assert.ok(!revoked.includes(previous.url),'old receipt URLs are released only after the grace period');
 return api.state.download;
}
(async()=>{
 assert.equal(api.state.radius,0);assert.equal(get('#resourcePreview').style.borderRadius,'0%');
 assert.equal(images.length,0,'the hidden library must not decode logo originals on other pages');assert.equal(get('#resourceDownload').disabled,true);
 sandbox.window.ResourceLibrary.activate();await flush();
 assert.equal(api.state.ready,true);assert.equal(get('#resourceWidth').getAttribute('aria-describedby'),'','hidden enlargement warnings must not be read as applicable');assert.equal(get('#resourceCatalog').children.length,6);assert.deepEqual(Array.from(api.projects,p=>p.id),['yari','hapi','hapi-middle-east','4fun','maza','hapi-ludo']);
 assert.equal(api.sourceFor(api.projects[0],128),'assets/resources/yari-512.webp');assert.equal(api.sourceFor(api.projects[0],1025),'assets/resources/yari-2048.webp');assert.equal(api.sourceFor(api.projects[0],4096),'assets/resources/yari-4096.webp');assert.equal(api.sourceFor(api.projects[1],4096),'assets/resources/hapi-512.webp');
 get('#resourceWidth').value='384';api.changeDimension(get('#resourceWidth'));assert.equal(get('#resourceHeight').value,'384');
 for(const value of ['',0,4097,1.5]){get('#resourceWidth').value=value;api.changeDimension(get('#resourceWidth'));assert.equal(api.state.valid,false);assert.equal(get('#resourceDownload').disabled,true);assert.equal(get('#resourceWidth').getAttribute('aria-invalid'),'true')}
 get('#resourceHeight').value='256';api.changeDimension(get('#resourceHeight'));assert.equal(get('#resourceWidth').value,'256');
 await freshDownload();assert.equal(downloads.length,1);assert.equal(api.state.download.name,'yari-logo-256x256.png');assert.equal(api.state.download.blob.type,'image/png');
 assert.deepEqual(encodes.at(-1).canvas.getContext().operations[0].slice(2),[0,0,256,256]);
 await cachedDownload();
 const cachedBeforeLanguage=api.state.download;sandbox.language='en';sandbox.window.ResourceLibrary.syncLanguage();
 assert.equal(api.state.download,cachedBeforeLanguage,'language changes must preserve the cached file');
 await cachedDownload();sandbox.language='zh';sandbox.window.ResourceLibrary.syncLanguage();
 const previous=api.state.download,previousImages=images.length;await api.selectProject(api.projects[0]);assert.equal(api.state.download,previous);assert.equal(images.length,previousImages,'selecting the current project preserves its valid receipt');
 const beforeDownloadFailure=downloads.length,beforeFailedEncode=encodeCount();
 urlFail=true;await api.downloadLogo();urlFail=false;
 assert.equal(api.state.download,previous,'a failed download must retain the last valid receipt');
 assert.equal(downloads.length,beforeDownloadFailure);assert.equal(encodeCount(),beforeFailedEncode);
 assert.equal(api.state.notice,'downloadError');assert.equal(api.state.phase,'error');
 await cachedDownload();
 api.chooseFormat('jpg');assert.equal(api.state.download,null);assert.equal(get('#resourceReceipt').classList.contains('hidden'),true);await freshDownload();assert.equal(api.state.download.name,'yari-logo-256x256.jpg');assert.equal(api.state.download.blob.type,'image/jpeg');assert.equal(encodes.at(-1).quality,.96);assert.deepEqual(encodes.at(-1).canvas.getContext().operations[0],['fill','#fff',0,0,256,256]);
 const beforeWebP=downloads.length;api.chooseFormat('webp');let finish;holdWebP=new Promise(resolve=>finish=resolve);const pending=api.downloadLogo();await flush();assert.equal(api.state.busy,true);assert.equal(get('#resourceWidth').disabled,true);const locked=api.state.project;await api.selectProject(api.projects[1]);assert.equal(api.state.project,locked);await api.downloadLogo();assert.equal(downloads.length,beforeWebP,'double clicks must not start a second export');finish();await pending;holdWebP=null;assert.equal(api.state.download.blob.type,'image/webp');assert.equal(downloads.length,beforeWebP+1);await cachedDownload();
 // Fast project switching cannot commit an earlier logo or its error.
 holdLoads=true;const first=api.selectProject(api.projects[1]),old=images.at(-1);const second=api.selectProject(api.projects[4]),latest=images.at(-1);latest.complete();await second;old.onerror();await first;holdLoads=false;
 assert.equal(api.state.project.id,'maza');assert.equal(get('#resourcePreview').src,'assets/resources/maza-512.webp');assert.equal(api.state.notice,null);assert.equal(api.state.ready,true);assert.equal(api.state.side,256);assert.equal(api.state.format,'webp');await freshDownload();assert.equal(api.state.download.name,'maza-logo-256x256.webp');
 failSrc='assets/resources/hapi-middle-east-512.webp';await api.selectProject(api.projects[2]);assert.equal(api.state.ready,false);assert.equal(api.state.notice,'loadError');assert.equal(get('#resourcePreviewError').hidden,false);assert.equal(get('#resourceDownload').disabled,true);failSrc='';await api.selectProject(api.projects[2]);assert.equal(api.state.ready,true);
 sandbox.language='en';sandbox.window.ResourceLibrary.syncLanguage();assert.equal(get('#resourceSelectedName').textContent,'Middle East Hapi');assert.equal(get('#resourcePresets').getAttribute('aria-label'),'Quick sizes');assert.equal(get('#resourcePreviewStage').getAttribute('aria-label'),'Logo preview');assert.equal(api.state.side,256);assert.equal(api.state.format,'webp');
 get('#resourceHeight').value='1024';api.changeDimension(get('#resourceHeight'));assert.equal(get('#resourceWidth').value,'1024');assert.equal(get('#resourceUpscale').classList.contains('hidden'),false);assert.equal(get('#resourceHeight').getAttribute('aria-describedby'),'resourceUpscale');
 const beforeMime=downloads.length;api.chooseFormat('jpg');wrongMime=true;await api.downloadLogo();wrongMime=false;assert.equal(api.state.notice,'formatError');assert.equal(downloads.length,beforeMime,'a wrong MIME must never masquerade as a successful JPEG download');
 await api.selectProject(api.projects[0]);get('#resourceWidth').value='4096';api.changeDimension(get('#resourceWidth'));failSrc='assets/resources/yari-4096.webp';await api.downloadLogo();assert.equal(api.state.notice,'loadError');failSrc='';await freshDownload();assert.equal(api.state.download.name,'yari-logo-4096x4096.jpg');assert.equal(api.state.busy,false);
 // Market modes lock exact dimensions and PNG, while preserving custom settings.
 get('#resourceWidth').value='384';api.changeDimension(get('#resourceWidth'));api.chooseFormat('webp');
 api.chooseTarget('ios');assert.equal(api.state.side,1024);assert.equal(api.state.format,'png');assert.equal(get('#resourceHeight').readOnly,true);assert.ok(formats.every(input=>input.disabled));
 api.chooseFormat('jpg');assert.equal(api.state.format,'png');api.chooseTarget('android');assert.equal(api.state.side,512);
 await freshDownload();assert.equal(api.state.download.name,'yari-google-play-512x512.png');assert.equal(marketEncodes.at(-1).options.alpha,true);
 api.chooseTarget('ios');await freshDownload();assert.equal(api.state.download.name,'yari-app-store-1024x1024.png');assert.equal(marketEncodes.at(-1).options.alpha,false);assert.deepEqual(marketEncodes.at(-1).canvas.getContext().operations[0],['fill','#fff',0,0,1024,1024]);
 api.chooseTarget('custom');assert.equal(api.state.side,384);assert.equal(api.state.format,'webp');assert.equal(get('#resourceWidth').readOnly,false);assert.ok(formats.every(input=>!input.disabled));
 await api.selectProject(api.projects[5]);assert.equal(api.state.project.name,'Hapi Ludo');assert.equal(api.sourceFor(api.projects[5],4000),'assets/resources/hapi-ludo-4000.webp');
 // A single market export locks all inputs and rejects repeat clicks until its file is ready.
 api.chooseTarget('ios');const beforeMarket=downloads.length,marketProject=api.state.project;let done;holdMarket=new Promise(resolve=>done=resolve);const marketDownload=api.downloadLogo();await flush();assert.equal(api.state.busy,true);assert.equal(get('#resourceDownload').disabled,true);assert.equal(get('#resourceTarget').disabled,true);assert.equal(get('#resourceWidth').disabled,true);assert.ok(formats.every(input=>input.disabled));api.chooseTarget('custom');assert.equal(api.state.target,'ios');await api.selectProject(api.projects[0]);assert.equal(api.state.project,marketProject);await api.downloadLogo();assert.equal(downloads.length,beforeMarket);done();await marketDownload;holdMarket=null;
 assert.equal(downloads.length,beforeMarket+1);assert.equal(api.state.download.name,'hapi-ludo-app-store-1024x1024.png');assert.equal(api.state.download.blob.type,'image/png');assert.equal(api.state.busy,false);assert.equal(get('#resourceTarget').disabled,false);
 await cachedDownload();
 // Encoding failures are tested after a real setting change, so a valid cache cannot hide them.
 api.chooseTarget('android');const beforeMarketFailure=downloads.length;
 marketFail='marketUnsupported';await api.downloadLogo();
 assert.equal(api.state.notice,'marketUnsupported');assert.equal(api.state.download,null);
 assert.equal(downloads.length,beforeMarketFailure);assert.equal(api.state.busy,false);marketFail='';
 // Google Play's file limit is checked before download; a failed encoding is not cached.
 await freshDownload();assert.equal(api.state.download.name,'hapi-ludo-google-play-512x512.png');await cachedDownload();
 api.chooseTarget('ios');api.chooseTarget('android');const beforeOversize=downloads.length;
 const normalEncoder=sandbox.window.MarketIconPNG.encode;
 sandbox.window.MarketIconPNG.encode=async()=>new Blob([new Uint8Array(1024*1024+1)],{type:'image/png'});
 await api.downloadLogo();assert.equal(api.state.notice,'marketSizeError');assert.equal(api.state.download,null);
 assert.equal(downloads.length,beforeOversize);assert.equal(api.state.busy,false);
 sandbox.window.MarketIconPNG.encode=normalEncoder;await freshDownload();
 // Custom radius must affect real encoding, preserve presets, and never leak to market icons.
 api.chooseTarget('custom');get('#resourceCornerNumber').value='20';api.changeCorner(get('#resourceCornerNumber'));assert.equal(api.state.radius,20);assert.equal(get('#resourceCornerRange').value,'20');assert.equal(get('#resourcePreview').style.borderRadius,'20%');assert.equal(api.state.download,null);
 api.chooseFormat('png');await freshDownload();assert.equal(api.state.download.name,'hapi-ludo-logo-384x384-r20pct.png');assert.deepEqual(encodes.at(-1).canvas.getContext().operations.find(op=>op[0]==='roundRect'),['roundRect',0,0,384,384,76.8]);
 api.chooseFormat('jpg');await freshDownload();const roundedJpeg=encodes.at(-1).canvas.getContext().operations;assert.equal(roundedJpeg[0][0],'fill');assert.ok(roundedJpeg.findIndex(op=>op[0]==='fill')<roundedJpeg.findIndex(op=>op[0]==='clip'));assert.equal(get('#resourcePreviewSurface').classList.contains('is-opaque'),true);
 api.chooseTarget('ios');assert.equal(get('#resourcePreview').style.borderRadius,'0%');assert.equal(get('#resourceCornerNumber').value,'0');assert.equal(get('#resourceCornerRange').disabled,true);await api.downloadLogo();assert.ok(!marketEncodes.at(-1).canvas.getContext().operations.some(op=>op[0]==='clip'));
 api.chooseTarget('android');await api.downloadLogo();assert.ok(!marketEncodes.at(-1).canvas.getContext().operations.some(op=>op[0]==='clip'));
 api.chooseTarget('custom');assert.equal(get('#resourceCornerNumber').value,'20');assert.equal(get('#resourcePreview').style.borderRadius,'20%');
 for(const value of ['',-1,51,2.5,'bad']){get('#resourceCornerNumber').value=value;api.changeCorner(get('#resourceCornerNumber'));assert.equal(api.state.radiusValid,false);assert.equal(get('#resourceDownload').disabled,true);const count=downloads.length;await api.downloadLogo();assert.equal(downloads.length,count)}
 get('#resourceCornerRange').value='50';api.changeCorner(get('#resourceCornerRange'));assert.equal(api.state.radiusValid,true);assert.equal(get('#resourceCornerNumber').value,'50');api.chooseFormat('webp');await freshDownload();assert.equal(encodes.at(-1).canvas.getContext().operations.find(op=>op[0]==='roundRect').at(-1),192);await cachedDownload();
 get('#resourceCornerNumber').value='49';api.changeCorner(get('#resourceCornerNumber'));let finishCorner;holdWebP=new Promise(resolve=>finishCorner=resolve);const pendingCorner=api.downloadLogo();await flush();assert.equal(get('#resourceCornerRange').disabled,true);assert.equal(get('#resourceCornerNumber').disabled,true);get('#resourceCornerNumber').value='0';api.changeCorner(get('#resourceCornerNumber'));assert.equal(api.state.radius,49);finishCorner();await pendingCorner;holdWebP=null;
 get('#resourceCornerNumber').value='0';api.changeCorner(get('#resourceCornerNumber'));await freshDownload();assert.ok(!encodes.at(-1).canvas.getContext().operations.some(op=>op[0]==='clip'));assert.equal(get('#resourcePreview').style.borderRadius,'0%');
 // A failed native encoding can be retried, and its failure never becomes a cache hit.
 get('#resourceWidth').value='512';api.changeDimension(get('#resourceWidth'));api.chooseFormat('png');
 const beforeNativeFailure=downloads.length;encodeFail=true;await api.downloadLogo();encodeFail=false;
 assert.equal(api.state.notice,'encodeError');assert.equal(api.state.download,null);assert.equal(downloads.length,beforeNativeFailure);
 const customSquare=await freshDownload();await cachedDownload();
 // Target must invalidate even when size, PNG format and effective radius remain the same.
 api.chooseTarget('android');assert.equal(api.state.side,512);assert.equal(api.state.format,'png');
 const androidSquare=await freshDownload();assert.notEqual(androidSquare.blob,customSquare.blob);await cachedDownload();
 api.chooseTarget('custom');const restoredCustom=await freshDownload();assert.notEqual(restoredCustom.blob,androidSquare.blob);
 get('#resourceCornerNumber').value='10';api.changeCorner(get('#resourceCornerNumber'));
 const roundedCustom=await freshDownload();assert.notEqual(roundedCustom.blob,restoredCustom.blob);await cachedDownload();
 assert.equal(events.length,0,'resource downloads must not be misattributed to the three tool counters');
 const activeUrl=api.state.download.url;cleanup.forEach(fn=>fn());
 assert.ok(!revoked.includes(activeUrl),'active receipt URL must survive delayed cleanup');
 for(const url of urls.keys())if(url!==activeUrl)assert.ok(revoked.includes(url),'every replaced receipt URL must eventually be released');
 console.log('PASS: unchanged export Blob reuse without decode/encode, fresh download URLs, bilingual cache retention and setting invalidation; square defaults and adjustable rounded export/preview, radius validation and market isolation; lazy assets, six distinct projects and single-file market presets, alpha and file size boundaries, size-aware sources, locked dimensions/range, PNG/JPG/WebP MIME and naming, JPEG white flattening, busy/double-click guards, stale preview suppression, errors/retry, valid receipt retention, URL cleanup, bilingual labels, upscaling hint and no incorrect tool events.');
})().catch(error=>{console.error(error);process.exitCode=1});
