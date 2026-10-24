// Run: node tests/regression.cjs — uses only Node's standard library.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {createHash} = require('node:crypto');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const code = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const elements = new Map(), urls = new Map(), stats = new Map();
const events = [], feedback = [], reveals = [], preparedImages = [];
const latestFeedback = () => feedback.at(-1);
const recorded = type => events.filter(event=>event.tool==='room'&&event.type===type).reduce((total,event)=>total+event.count,0);
let serial = 0, clicks = 0;
const cleanupTimers=[];
function element() {
  const classes = new Set(), listeners = new Map();
  return {
    tagName: 'DIV', textContent: '', innerHTML: '', value: '50', width: 720, height: 1560, disabled: false, children: [],
    childNodes: [{nodeValue: ''}], previousElementSibling: {firstChild: {nodeValue: ''}}, style: {},
    classList: {add(...xs){xs.forEach(x=>classes.add(x))}, remove(...xs){xs.forEach(x=>classes.delete(x))}, toggle(x,on){if(on)classes.add(x);else classes.delete(x)}, contains(x){return classes.has(x)}},
    setAttribute(k,v){this[k]=v}, removeAttribute(k){delete this[k]}, addEventListener(k,fn){listeners.set(k,fn)}, append(...xs){this.children.push(...xs)}, replaceChildren(...xs){this.innerHTML='';this.children=xs}, remove(){}, click(){clicks++;listeners.get('click')?.({button:0,defaultPrevented:false,target:this})},
    querySelectorAll(){return []}, showModal(){this.open=true}, close(){this.open=false},
    getContext(){return {clearRect(){},drawImage(){}}},
    toBlob(callback,type){callback(new Blob([new Uint8Array(100)],{type}))}
  };
}
const document = {documentElement:{}, body:element(), querySelector(selector){if(!elements.has(selector))elements.set(selector,element());return elements.get(selector)}, querySelectorAll(){return []},createElement:element};
class MockImage {
  constructor(){this.width=900;this.height=1600;this.naturalWidth=900;this.naturalHeight=1600;this.complete=true}
  set src(value){this.url=value;queueMicrotask(()=>{if(urls.get(value)?.name==='broken.png')this.onerror?.();else this.onload?.()})}
}
const sandbox = {window:{FunToolkitUI:{setState(tool,value){assert.equal(tool,'room');feedback.push({...value})},reveal(target){reveals.push(target)},prepareImages(target){preparedImages.push(target)}},Hub:{record(tool,type,count=1){events.push({tool,type,count})}}},document, Image:MockImage, Blob, TextEncoder, Uint8Array, DataView, Set, Promise, Math, Number, String, Array,
  localStorage:{getItem:key=>stats.get(key),setItem:(key,value)=>stats.set(key,value)},
  URL:{createObjectURL(blob){const value='blob:'+ ++serial;urls.set(value,blob);return value},revokeObjectURL(value){urls.delete(value)}},
  setTimeout(fn,delay){if(delay<60000)queueMicrotask(fn);else cleanupTimers.push(fn)}, console};
vm.createContext(sandbox);vm.runInContext(code,sandbox);
const run = source => vm.runInContext(source,sandbox);
(async()=>{
  await run('fgReady');
  assert.equal(latestFeedback().phase,'empty','the untouched room tool starts in the shared empty state');
  // A small WebP needs one maximum-quality encode; complex images keep the full search.
  const maxBytes=120*1024,qualities=[];
  sandbox.limitCanvas={toBlob(callback,type,quality){qualities.push(quality);callback(new Blob([new Uint8Array(maxBytes)],{type}))}};
  const exactLimit=await run(`encodeUnderLimit(limitCanvas,${maxBytes})`);
  assert.equal(exactLimit.size,maxBytes,'the exact 120 KiB boundary is valid');
  assert.deepEqual(qualities,[.92],'an already-small image must skip all 11 search encodes');
  qualities.length=0;
  sandbox.limitCanvas={toBlob(callback,type,quality){qualities.push(quality);callback(new Blob([new Uint8Array(Math.round(1000+quality*200000))],{type}))}};
  const complex=await run(`encodeUnderLimit(limitCanvas,${maxBytes})`);
  assert.equal(qualities.length,12,'an oversized maximum-quality image keeps all 11 binary-search encodes');
  assert.equal(qualities[0],.92);
  assert.ok(complex.size<=maxBytes,'binary-search output must satisfy the strict byte limit');
  assert.equal(complex.size,Math.max(...qualities.map(quality=>Math.round(1000+quality*200000)).filter(size=>size<=maxBytes)),'keep the highest successful quality from the search');
  qualities.length=0;
  sandbox.limitCanvas={toBlob(callback,type,quality){qualities.push(quality);callback(new Blob([new Uint8Array(maxBytes+1)],{type}))}};
  await assert.rejects(run(`encodeUnderLimit(limitCanvas,${maxBytes})`),/120 KB/,'an image that cannot fit must fail instead of exceeding the limit');
  assert.equal(qualities.length,13);assert.equal(qualities.at(-1),.001,'retain the last-resort lowest-quality check');
  sandbox.limitCanvas={toBlob(){throw Error('encoder unavailable')}};
  await assert.rejects(run(`encodeUnderLimit(limitCanvas,${maxBytes})`),/encoder unavailable/);
  sandbox.limitCanvas={toBlob(callback){callback(new Blob(['wrong format'],{type:'image/png'}))}};
  await assert.rejects(run(`encodeUnderLimit(limitCanvas,${maxBytes})`),/WebP encoding unavailable/);
  run('downloadAll()');assert.equal(run('downloadNotice.state'),'empty');
  assert.equal(events.length,0,'empty downloads and initial previews must not count');
  // FileList is live: clearing the input after onchange must not truncate an async import.
  sandbox.selection=[{name:'one.webp',type:'image/webp'},{name:'broken.png',type:'image/png'},{name:'two.webp',type:'image/webp'}];
  const batchFeedbackStart=feedback.length;
  const pending=run('batch({[Symbol.iterator]:()=>selection[Symbol.iterator]()})');
  const pickerClicks=clicks;run('pickRoomFiles()');assert.equal(clicks,pickerClicks,'all room upload entry points stay locked during import');
  assert.equal(latestFeedback().phase,'loading','image decoding immediately exposes the shared loading stage');
  const revealsBeforeLoadingLanguage=reveals.length;
  run('setLanguage("zh")');
  assert.equal(latestFeedback().phase,'loading');assert.equal(latestFeedback().message,'正在读取图片…','an in-flight label follows the selected language');
  run('setLanguage("en")');
  assert.equal(latestFeedback().phase,'loading');assert.equal(latestFeedback().message,'Reading images…');
  assert.equal(reveals.length,revealsBeforeLoadingLanguage,'in-flight language changes do not animate the working preview');
  assert.equal(document.querySelector('#previewUploadButton').disabled,true,'room upload locks during import');
  assert.equal(document.querySelector('#previewUploadButton')['aria-busy'],'true','busy upload must not show sheen');
  sandbox.selection.length=0;await pending;
  const batchPhases=feedback.slice(batchFeedbackStart).map(value=>value.phase);
  assert.equal(batchPhases[0],'loading');
  assert.ok(batchPhases.indexOf('processing')>0,'real encoding follows image loading');
  assert.ok(!batchPhases.slice(0,batchPhases.indexOf('processing')).includes('ready'),'decoding and preview mounting remain loading until encoding starts');
  assert.equal(latestFeedback().phase,'success','nested import/export finally blocks must preserve the successful phase');
  assert.equal(run('roomFeedbackPhase'),'success');
  assert.ok(preparedImages.includes(document.querySelector('#outputList')),'new output thumbnails use the shared image readiness helper');
  assert.ok(reveals.includes(document.querySelector('#previewGrid')));
  assert.ok(reveals.includes(document.querySelector('#exportContent')));
  assert.equal(document.querySelector('#previewUploadButton').disabled,false,'room upload restores after import');
  assert.equal(document.querySelector('#previewUploadButton')['aria-busy'],'false');
  assert.equal(run('batchJobs.length'),2);assert.equal(run('generatedOutputs.length'),4);assert.equal(run('exportBusy||importBusy'),false);
  assert.match(document.querySelector('#uploadNotice').textContent,/broken.png/);
  assert.equal(run('readLifetimeImages()'),4);
  assert.equal(recorded('generated'),4,'two new backgrounds produce four countable files');assert.equal(recorded('download'),0);
  assert.deepEqual(Array.from(run('generatedOutputs.map(file=>file.name)')),['Bg01.webp','Bg01-s.webp','Bg02.webp','Bg02-s.webp']);
  run('openCropEditor("large",1)');assert.equal(run('cropImage===batchJobs[1].image'),true);assert.match(document.querySelector('#cropTitle').textContent,/Bg02.webp/);
  run('before=generatedOutputs.map(file=>file.blob)');
  document.querySelector('#cropX').value='0';await run('applyCrop()');
  assert.equal(latestFeedback().phase,'success','a successful changed crop settles in success');
  assert.equal(run('generatedOutputs[0].blob===before[0]&&generatedOutputs[1].blob===before[1]&&generatedOutputs[3].blob===before[3]'),true);
  assert.equal(run('generatedOutputs[2].blob!==before[2]'),true);assert.equal(run('batchJobs[0].crops.large.x'),.5);assert.equal(run('batchJobs[1].crops.large.x'),0);assert.equal(run('batchJobs[1].crops.small.x'),.5);
  assert.equal(run('readLifetimeImages()'),5);
  assert.equal(recorded('generated'),5,'a changed crop produces exactly one more file');
  cleanupTimers.splice(0).forEach(fn=>fn());
  assert.equal(Array.from(run('generatedOutputs.map(file=>file.downloadUrl)')).every(url=>urls.has(url)),true,'active thumbnails must survive delayed URL cleanup');
  run('openCropEditor("large",1)');await run('applyCrop()');assert.equal(run('readLifetimeImages()'),5,'unchanged crop must not encode/count again');
  assert.equal(recorded('generated'),5,'an unchanged crop must not reach the aggregate counter');
  // An encoder failure preserves the previous crop, file and ZIP.
  run('beforeFile=generatedOutputs[2];beforeZip=zipFile;originalExport=exportCanvas;exportCanvas=async()=>{throw Error("encode failed")};openCropEditor("large",1)');
  document.querySelector('#cropX').value='100';await run('applyCrop()');
  assert.equal(latestFeedback().phase,'error','a failed crop stays in error after busy controls restore');
  assert.equal(run('generatedOutputs[2]===beforeFile&&zipFile===beforeZip'),true);assert.equal(run('batchJobs[1].crops.large.x'),0);assert.equal(run('downloadNotice.state'),'cropError');run('exportCanvas=originalExport');
  assert.equal(recorded('generated'),5,'a failed crop must not count');
  const urlCount=run('downloadUrls.size'),revealsBeforeLanguage=reveals.length,phaseBeforeLanguage=latestFeedback().phase;
  run('toggleLanguage();toggleLanguage()');assert.equal(run('downloadUrls.size'),urlCount,'language switch must reuse thumbnail URLs');
  assert.equal(latestFeedback().phase,phaseBeforeLanguage,'language changes preserve the real task phase');
  assert.equal(reveals.length,revealsBeforeLanguage,'language changes do not replay the output reveal');
  assert.equal(recorded('generated'),5,'language changes must not count');
  run('downloadAll();downloadGenerated(0)');assert.equal(clicks,2);
  assert.equal(recorded('download'),2,'one ZIP and one single-file download are two requests');
  const retry=document.querySelector('#downloadNotice').children.find(child=>child.download);
  assert.ok(retry,'a valid download exposes its retry link');retry.click();assert.equal(recorded('download'),3,'retry links are separate download requests');
  assert.equal(recorded('generated'),5,'downloads must not generate files again');
  run('retainedBlobs=generatedOutputs.slice(2).map(file=>file.blob);exportCanvas=async()=>{throw Error("unchanged job was re-encoded")}');
  await run('removeBatchJob(0)');assert.equal(run('generatedOutputs.length'),2);assert.equal(run('generatedOutputs.every((file,i)=>file.blob===retainedBlobs[i])'),true,'deletion reuses the exact unchanged output bytes, including the edited crop');assert.equal(run('readLifetimeImages()'),5,'deleting must not increment the local production counter');run('exportCanvas=originalExport');assert.equal(recorded('generated'),5,'deleting a job must not recount the remaining output sizes');
  run('beforeAppend=generatedOutputs.map(file=>file.blob);newEncodes=0;exportCanvas=async(...args)=>{newEncodes++;return originalExport(...args)}');
  await run('batch([{name:"three.webp",type:"image/webp"}])');
  assert.equal(run('newEncodes'),2,'append encodes only the two new sizes');assert.equal(run('generatedOutputs.slice(0,2).every((file,i)=>file.blob===beforeAppend[i])'),true);run('exportCanvas=originalExport');
  assert.equal(run('generatedOutputs.length'),4);assert.equal(recorded('generated'),7,'adding one job counts only its two sizes, not the existing job');
  await run('removeBatchJob(0)');await run('removeBatchJob(0)');assert.equal(recorded('generated'),7,'automatic regeneration after deletion must not inflate totals');
  assert.equal(run('batchJobs.length'),0);assert.equal(run('generatedOutputs.length'),0);assert.equal(run('zipFile'),null);assert.equal(document.querySelector('#outputCount').textContent,'0');assert.equal(document.querySelector('#jobCount').textContent,0);assert.equal(document.querySelector('#previewStage').role,'button');
  assert.equal(latestFeedback().phase,'empty','removing the final image restores the shared empty state');
  // Invalid-only uploads leave the editor available for another attempt.
  sandbox.selection=[{name:'broken.png',type:'image/png'},{name:'notes.txt',type:'text/plain'}];await run('batch(selection)');assert.equal(run('batchJobs.length'),0);assert.equal(run('importBusy'),false);
  assert.equal(latestFeedback().phase,'error','invalid-only imports must not finish as a successful or empty task');
  assert.equal(recorded('generated'),7);assert.equal(recorded('download'),3,'invalid files must not affect either counter');
  await run('batch([])');
  assert.equal(latestFeedback().phase,'empty','an empty FileList returns to empty rather than leaving a spinner running');
  assert.equal(recorded('generated'),7);assert.equal(recorded('download'),3,'cancelled selection must not affect either counter');
  run('exportCanvas=async()=>{throw Error("encode failed")}');await run('batch([{name:"failed.webp",type:"image/webp"}])');run('exportCanvas=originalExport');
  assert.equal(latestFeedback().phase,'error','a batch encoding failure survives both finally blocks');
  assert.equal(run('roomFeedbackPhase'),'error');
  assert.equal(run('exportBusy||importBusy'),false);
  assert.equal(run('generatedOutputs.length'),0,'a failed full batch keeps the existing no-download recovery behavior');
  assert.equal(document.querySelector('#exportContent').classList.contains('hidden'),true);
  assert.equal(document.querySelector('#exportEmpty').classList.contains('hidden'),false);
  assert.equal(recorded('generated'),7,'a failed batch must not count newly queued jobs');
  // A rejected encoder must not unlock the page while the other worker is active.
  run('batchJobs=Array.from({length:3},(_,id)=>({image:{id},crops:{large:{x:.5,y:.5},small:{x:.5,y:.5}}}));pendingEncodes=[];exportCanvas=(image,width)=>new Promise((resolve,reject)=>pendingEncodes.push({id:image.id,width,resolve,reject}))');
  const draining=run('generateAllOutputs()');
  assert.equal(run('pendingEncodes.length'),2,'at most two jobs start at once');
  run('pendingEncodes[0].reject(Error("worker failed"))');await new Promise(setImmediate);
  assert.equal(run('exportBusy'),true,'the surviving native encoder still owns the busy lock');assert.equal(run('pendingEncodes.length'),2,'failure prevents another job from starting');
  run('pendingEncodes[1].resolve(new Blob(["large"],{type:"image/webp"}))');await new Promise(setImmediate);
  assert.equal(run('pendingEncodes.length'),3);assert.equal(run('pendingEncodes[2].width'),300);
  run('pendingEncodes[2].resolve(new Blob(["small"],{type:"image/webp"}))');await draining;
  assert.equal(run('exportBusy'),false);assert.equal(run('generatedOutputs.length'),0);assert.equal(recorded('generated'),7,'partially encoded batches never count');
  // Completing later jobs first cannot reorder filenames, and cached partial
  // work is counted exactly once when a retry commits the whole result.
  run('exportCanvas=(image,width)=>image.id===0&&width===720?new Promise(resolve=>pendingFirst=resolve):Promise.resolve(new Blob([image.id+"-"+width],{type:"image/webp"}))');
  const recovered=run('generateAllOutputs()');await new Promise(setImmediate);
  assert.equal(run('exportBusy'),true);assert.equal(recorded('generated'),7);
  run('pendingFirst(new Blob(["0-720"],{type:"image/webp"}))');await recovered;
  assert.deepEqual(Array.from(run('generatedOutputs.map(file=>file.job.image.id)')),[0,0,1,1,2,2],'output order follows upload order, not completion order');
  assert.deepEqual(Array.from(run('generatedOutputs.map(file=>file.name)')),['Bg01.webp','Bg01-s.webp','Bg02.webp','Bg02-s.webp','Bg03.webp','Bg03-s.webp']);
  assert.equal(recorded('generated'),13);assert.equal(run('readLifetimeImages()'),13,'first successful commit counts cached partial work too');run('exportCanvas=originalExport');
  const zip=run('zipBytes([{name:"same.webp",bytes:new Uint8Array([1,2])},{name:"same.webp",bytes:new Uint8Array([3])},{name:"背景.webp",bytes:new Uint8Array([4])},{name:"empty.webp",bytes:new Uint8Array()},{name:"../bad:name.webp",bytes:Uint8Array.from({length:256},(_,i)=>i)},{name:"SAME.webp",bytes:new TextEncoder().encode("123456789")}])');
  const bytes=new Uint8Array(await zip.arrayBuffer());assert.equal(new DataView(bytes.buffer).getUint32(0,true),0x04034b50);
  // Golden hash captured from the original bit-at-a-time serializer. It covers
  // empty/binary payloads, Unicode, sanitized names and case-insensitive clashes.
  assert.equal(createHash('sha256').update(bytes).digest('hex'),'0b1c0d0440792e77ec23b699e29bae8d7136973b5ca13159429db49713cadf0c','the faster CRC must leave every ZIP byte unchanged');
  const crcVector=new Uint8Array(await run('zipBytes([{name:"vector.webp",bytes:new TextEncoder().encode("123456789")}])').arrayBuffer());
  assert.equal(new DataView(crcVector.buffer).getUint32(14,true),0xcbf43926,'CRC32 must match the standard 123456789 check vector');
  const emptyVector=new Uint8Array(await run('zipBytes([{name:"empty.webp",bytes:new Uint8Array()}])').arrayBuffer());
  assert.equal(new DataView(emptyVector.buffer).getUint32(14,true),0,'an empty payload has CRC32 zero');
  console.log('PASS: bounded parallel workers/drain on failure, ordered commits and retry counts, unchanged-output/crop cache reuse, WebP fast path/byte limit, live FileList, loading/processing/success and durable errors, corrupt files, crop rollback, shared thumbnail/reveal hooks, language phase retention, downloads, empty reset, ZIP and generation/download count boundaries.');
})().catch(error=>{console.error(error);process.exitCode=1});
