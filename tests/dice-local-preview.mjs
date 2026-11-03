// Pure session-contract checks. Canvas/IndexedDB rendering remains browser QA.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {deflateSync} from 'node:zlib';
import {createLocalPreview,validateFiles,validateSettings,inspectPNG,detectComposition,atlasText,SLOTS} from '../dice/local-preview.mjs';
process.on('uncaughtException',error=>{console.error(error?.message||String(error));process.exitCode=1;});

const checks=[],table=Array.from({length:256},(_,v)=>{for(let i=0;i<8;i++)v=v&1?0xedb88320^(v>>>1):v>>>1;return v>>>0;});
function chunk(type,data=Buffer.alloc(0)) {
  const body=Buffer.concat([Buffer.from(type),data]),result=Buffer.alloc(data.length+12);
  result.writeUInt32BE(data.length);body.copy(result,4);let crc=0xffffffff;
  for(const byte of body)crc=table[(crc^byte)&255]^(crc>>>8);
  result.writeUInt32BE((crc^0xffffffff)>>>0,result.length-4);return result;
}
function png(size,alpha=255) {
  const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(size);ihdr.writeUInt32BE(size,4);ihdr[8]=8;ihdr[9]=6;
  const pixels=Buffer.alloc((size*4+1)*size);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++) {const i=y*(size*4+1)+1+x*4;pixels[i]=80;pixels[i+1]=140;pixels[i+2]=220;pixels[i+3]=alpha;}
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',deflateSync(pixels)),chunk('IEND')]);
}
const files=SLOTS.map(slot=>({name:slot==='大骰子'?'icon.png':slot+'.png',data:'data:image/png;base64,'+png(slot==='大骰子'?240:200).toString('base64')}));
const payload={name:'仙人掌',grade:'green',mode:'all',point:1,composition:'auto',files};
function memoryStore() {
  const records=new Map();return {records,fail:false,
    async get(id){return structuredClone(records.get(id));},
    async put(record,expected=null){
      if(this.fail)throw new Error('injected quota failure');
      const before=records.get(record.id);
      if(expected===null?Boolean(before):!before||before.revision!==expected.revision||before.candidateId!==expected.candidateId)throw Object.assign(new Error('stale'),{status:409});
      records.set(record.id,structuredClone(record));
    }};
}
const jszipContext={setTimeout,clearTimeout,setImmediate,clearImmediate,Uint8Array,ArrayBuffer,TextEncoder,TextDecoder};
vm.runInNewContext(await readFile(new URL('../vendor/jszip-3.10.1.min.js',import.meta.url),'utf8'),jszipContext);
const JSZip=jszipContext.JSZip;
async function zipFactory() {
  const entries=new Map();return {file(name,data){entries.set(name,data);},async generateAsync(){const zip=new JSZip();for(const [name,data]of entries)zip.file(name,data instanceof Blob?new Uint8Array(await data.arrayBuffer()):data);return new Blob([await zip.generateAsync({type:'uint8array'})],{type:'application/zip'});}};
}
const storage=memoryStore(),urlBlobs=new Map();let serial=0,renders=0,smallDigits=false,blockVideo=null;
const dependencies={storage,uuid:()=>String(++serial).padStart(32,'0'),videoAvailable:true,
  createObjectURL:blob=>{const url='blob:fixture-'+(++serial);urlBlobs.set(url,blob);return url;},revokeObjectURL:url=>urlBlobs.delete(url),zipFactory,
  decodePNG:async(blob,name)=>({alphaArea:smallDigits&&/^sz_[1-6]/.test(name)?1200:16000,close(){}}),
  renderRuntime:async(files,composition)=>{renders++;assert.equal(files.length,10);assert.ok(['faces','digits'].includes(composition));return{texture:new Blob([png(612)],{type:'image/png'}),atlasText:atlasText()};},
  prepareVideo:async blob=>{if(blockVideo)await blockVideo.promise;const output=new Blob([blob],{type:'video/mp4'});Object.defineProperty(output,'videoInfo',{value:{width:720,height:1600,duration:6,fps:30,frameCount:180,method:'h264_copy_mux'}});return output;}};
const adapter=createLocalPreview(dependencies);
const post=(path,body)=>adapter.api(path,{method:'POST',body:JSON.stringify(body)});
async function rejects(operation,status=400){await assert.rejects(operation,error=>error.status===status);}

assert.equal(validateFiles(files)[0].slot,'大骰子');
for(const [entries,key] of [[files.slice(1),'missing'],[[...files,{name:'extra.png'}],'extra'],[[...files,{name:'大骰子.png'}],'duplicates']]) {
  assert.throws(()=>validateFiles(entries),error=>error.payload[key].length>0);
}
assert.throws(()=>validateSettings({...payload,point:true}));assert.throws(()=>validateSettings(null));
assert.equal(inspectPNG(new Uint8Array(png(200)),'sz_0').width,200);
const corrupted=new Uint8Array(png(200));corrupted[40]^=1;assert.throws(()=>inspectPNG(corrupted,'sz_0'));
assert.throws(()=>inspectPNG(new Uint8Array(png(240)),'sz_0'));
assert.match(atlasText(),/sz_6\n  bounds: 410, 410, 200, 200\n  offsets: 0, 0, 200, 200\n  rotate: 0/);
assert.equal((atlasText().match(/  rotate: 0/g)||[]).length,9);
checks.push('canonical_alias_missing_extra_duplicates_png_crc_dimensions_settings_and_untrimmed_atlas_contract');

const first=await post('/api/preview/import',payload);
assert.equal(first.revision,1);assert.equal(first.resolvedComposition,'faces');assert.equal(first.candidate.template,'green');assert.equal(first.candidate.atlasPage,'preview.png');
assert.equal(first.candidate.previewGrade,'green');assert.equal(first.files.find(f=>f.slot==='大骰子').name,'icon.png');
for(const file of first.files)assert.deepEqual(Buffer.from(await urlBlobs.get(file.url).arrayBuffer()),Buffer.from(files.find(f=>f.name===file.name).data.split(',')[1],'base64'));
const before=structuredClone(await storage.get(first.id));
const invalid=structuredClone(payload);invalid.files[0].data='data:image/png;base64,broken';await rejects(()=>post('/api/preview/import',invalid));
assert.deepEqual(await storage.get(first.id),before);assert.equal(storage.records.size,1);
storage.fail=true;await assert.rejects(()=>post(`/api/preview/${first.id}/settings`,{expectedRevision:1,grade:'purple'}));storage.fail=false;
assert.deepEqual(await storage.get(first.id),before);
checks.push('imports_preserve_all_ten_original_bytes_names_and_failed_import_or_storage_write_keep_existing_session');

const noop=await post(`/api/preview/${first.id}/settings`,{expectedRevision:1,grade:'green'});
assert.equal(noop.revision,1);assert.equal(noop.candidate.id,first.candidate.id);
const renderCount=renders;
const second=await post(`/api/preview/${first.id}/settings`,{expectedRevision:1,grade:'purple',mode:'single',point:6});
assert.equal(second.revision,2);assert.equal(second.candidate.template,'green');assert.equal(second.candidate.previewGrade,'purple');assert.equal(renders,renderCount);
assert.notEqual(second.candidate.id,first.candidate.id);assert.deepEqual(second.files,first.files);
await rejects(()=>post(`/api/preview/${first.id}/settings`,{expectedRevision:1,point:2}),409);
checks.push('no_op_settings_keep_revision_grade_changes_background_only_and_stale_settings_are_rejected');

smallDigits=true;const digitSession=await post('/api/preview/import',{...payload,name:'数字分离'});smallDigits=false;
assert.equal(digitSession.resolvedComposition,'digits');
const overridden=await post(`/api/preview/${digitSession.id}/settings`,{expectedRevision:1,composition:'faces'});
assert.equal(overridden.resolvedComposition,'faces');assert.equal((await adapter.api(`/api/preview/${first.id}`)).revision,2);
const restored=createLocalPreview(dependencies);
const afterRefresh=await restored.api(`/api/preview/${first.id}`);
assert.equal(afterRefresh.candidate.id,second.candidate.id);assert.equal(afterRefresh.files.length,10);
for(const file of afterRefresh.files)assert.deepEqual(Buffer.from(await urlBlobs.get(file.url).arrayBuffer()),Buffer.from(files.find(f=>f.name===file.name).data.split(',')[1],'base64'));
const detection=detectComposition(SLOTS.map(slot=>({slot,alphaArea:/^sz_[1-6]/.test(slot)?200:10000})));
assert.equal(detection.resolvedComposition,'digits');
checks.push('auto_detection_override_independent_sessions_and_refresh_restore_keep_original_blobs_and_candidate_identity');

const headers={'Content-Type':'video/h264','X-Preview-Revision':'2','X-Candidate-Id':second.candidate.id};
const input=new Blob(['procedural-video-fixture'],{type:'video/h264'});
const video=await adapter.api(`/api/preview/${first.id}/video`,{method:'POST',headers,body:input});
assert.equal(video.profile,'loop6-v1');assert.equal(video.frameCount,180);assert.equal(video.revision,2);assert.equal(video.candidate,second.candidate.id);
const bundled=await adapter.api(`/api/preview/${first.id}/bundle`);
const zip=await JSZip.loadAsync(new Uint8Array(await urlBlobs.get(bundled.url).arrayBuffer()));
const zipNames=Object.keys(zip.files).filter(name=>!zip.files[name].dir);
assert.deepEqual(zipNames.sort(),['preview.json','preview.mp4',...files.map(f=>'res/'+f.name)].sort());
for(const file of files)assert.deepEqual(Buffer.from(await zip.file('res/'+file.name).async('uint8array')),Buffer.from(file.data.split(',')[1],'base64'));
const config=JSON.parse(await zip.file('preview.json').async('string'));assert.equal(config.video.duration,6);assert.equal(config.video.frameCount,180);
const third=await post(`/api/preview/${first.id}/settings`,{expectedRevision:2,point:3});assert.equal(third.video,null);
await rejects(()=>adapter.api(`/api/preview/${first.id}/video`,{method:'POST',headers,body:input}),409);
checks.push('real_jszip_contains_only_original_res_configuration_and_current_bound_mp4_then_settings_invalidate_video');

let release;blockVideo={promise:new Promise(resolve=>{release=resolve;})};
const pending=adapter.api(`/api/preview/${first.id}/video`,{method:'POST',headers:{...headers,'X-Preview-Revision':'3','X-Candidate-Id':third.candidate.id},body:input});
await new Promise(resolve=>setTimeout(resolve,0));
const fourth=await post(`/api/preview/${first.id}/settings`,{expectedRevision:3,point:4});release();
await rejects(()=>pending,409);blockVideo=null;assert.equal((await adapter.api(`/api/preview/${first.id}`)).video,null);
const oldRecord=await storage.get(first.id);oldRecord.video={blob:input,revision:fourth.revision,candidate:fourth.candidate.id,duration:4.2};storage.records.set(first.id,oldRecord);
assert.equal((await adapter.api(`/api/preview/${first.id}`)).video,null);
const oldBundle=await adapter.api(`/api/preview/${first.id}/bundle`),oldZip=await JSZip.loadAsync(new Uint8Array(await urlBlobs.get(oldBundle.url).arrayBuffer()));
assert.equal(oldZip.file('preview.mp4'),null);assert.ok((await storage.get(first.id)).video.blob);
checks.push('late_video_cannot_commit_over_new_settings_and_old_profile_is_hidden_without_deleting_saved_blob');

adapter.dispose();restored.dispose();assert.equal(urlBlobs.size,0);
console.log(JSON.stringify({ok:true,count:checks.length,checks,limits:'Pure session/PNG/ZIP/CAS logic with injected Canvas and storage. Real browser Canvas, IndexedDB, Spine and video module require browser QA.'},null,2));
