// Pure session-contract checks. Canvas/IndexedDB rendering remains browser QA.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {deflateSync} from 'node:zlib';
import {createLocalPreview,validateFiles,validateSettings,inspectPNG,detectComposition,atlasText,SLOTS,VIDEO_PROFILE} from '../dice/local-preview.mjs';
import {VIDEO_SPEC} from '../dice/video-export.mjs';
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
  const records=new Map();return {records,fail:false,writes:0,
    async get(id){return structuredClone(records.get(id));},
    async put(record,expected=null){
      if(this.fail)throw new Error('injected quota failure');
      const before=records.get(record.id);
      if(expected===null?Boolean(before):!before||before.revision!==expected.revision||before.candidateId!==expected.candidateId)throw Object.assign(new Error('stale'),{status:409});
      records.set(record.id,structuredClone(record));
      this.writes++;
    }};
}
const jszipContext={setTimeout,clearTimeout,setImmediate,clearImmediate,Uint8Array,ArrayBuffer,TextEncoder,TextDecoder};
vm.runInNewContext(await readFile(new URL('../vendor/jszip-3.10.1.min.js',import.meta.url),'utf8'),jszipContext);
const JSZip=jszipContext.JSZip;
async function zipFactory() {
  const entries=new Map();return {file(name,data){entries.set(name,data);},async generateAsync(){const zip=new JSZip();for(const [name,data]of entries)zip.file(name,data instanceof Blob?new Uint8Array(await data.arrayBuffer()):data);return new Blob([await zip.generateAsync({type:'uint8array'})],{type:'application/zip'});}};
}
const storage=memoryStore(),urlBlobs=new Map();let serial=0,renders=0,smallDigits=false,blockVideo=null,preparedSize=null;
const dependencies={storage,uuid:()=>String(++serial).padStart(32,'0'),videoAvailable:true,
  createObjectURL:blob=>{const url='blob:fixture-'+(++serial);urlBlobs.set(url,blob);return url;},revokeObjectURL:url=>urlBlobs.delete(url),zipFactory,
  decodePNG:async(blob,name)=>({alphaArea:smallDigits&&/^sz_[1-6]/.test(name)?1200:16000,close(){}}),
  renderRuntime:async(files,composition)=>{renders++;assert.equal(files.length,10);assert.ok(['faces','digits'].includes(composition));return{texture:new Blob([png(612)],{type:'image/png'}),atlasText:atlasText()};},
  prepareVideo:async blob=>{if(blockVideo)await blockVideo.promise;const output=new Blob([preparedSize===null?blob:new Uint8Array(preparedSize)],{type:'video/mp4'});Object.defineProperty(output,'videoInfo',{value:{profile:VIDEO_PROFILE,width:720,height:1600,duration:6,fps:30,frameCount:180,method:'h264_copy_mux'}});return output;}};
const adapter=createLocalPreview(dependencies);
const post=(path,body)=>adapter.api(path,{method:'POST',body:JSON.stringify(body)});
async function rejects(operation,status=400){await assert.rejects(operation,error=>error.status===status);}

assert.equal(validateFiles(files)[0].slot,'大骰子');
for(const [entries,key] of [[files.slice(1),'missing'],[[...files,{name:'extra.png'}],'extra'],[[...files,{name:'大骰子.png'}],'duplicates']]) {
  assert.throws(()=>validateFiles(entries),error=>error.payload[key].length>0);
}
assert.throws(()=>validateSettings({...payload,point:true}));assert.throws(()=>validateSettings(null));
for(const invalid of [{mode:'unknown'},{point:0},{point:7},{point:null}])assert.throws(()=>validateSettings({...payload,...invalid}));
for(const mode of ['all','single','continuous'])assert.deepEqual(
  validateSettings({...payload,mode,point:6}),{name:'仙人掌',grade:'green',mode:'all',point:1,composition:'auto'});
assert.equal(VIDEO_PROFILE,'loop6-v3-1mb');
assert.equal(VIDEO_PROFILE,VIDEO_SPEC.profile);assert.equal(VIDEO_SPEC.maxBytes,1_000_000);
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

const noop=await post(`/api/preview/${first.id}/settings`,{expectedRevision:1,grade:'green',mode:'continuous',point:6});
assert.equal(noop.revision,1);assert.equal(noop.candidate.id,first.candidate.id);
const renderCount=renders;
const second=await post(`/api/preview/${first.id}/settings`,{expectedRevision:1,grade:'purple',mode:'single',point:6});
assert.equal(second.revision,2);assert.equal(second.candidate.template,'green');assert.equal(second.candidate.previewGrade,'purple');assert.equal(renders,renderCount);
assert.notEqual(second.candidate.id,first.candidate.id);assert.deepEqual(second.files,first.files);
assert.equal(second.mode,'all');assert.equal(second.point,1);
for(const key of ['atlas','texture','skel'])assert.equal(second.candidate[key],first.candidate[key]);
assert.equal(second.candidate.png['大骰子'],first.candidate.png['大骰子']);
await rejects(()=>post(`/api/preview/${first.id}/settings`,{expectedRevision:1,point:2}),409);
checks.push('fixed_all_point1_no_op_settings_keep_revision_grade_changes_keep_runtime_urls_and_stale_settings_reject');

smallDigits=true;const digitSession=await post('/api/preview/import',{...payload,name:'数字分离',mode:'continuous',point:6});smallDigits=false;
assert.equal(digitSession.resolvedComposition,'digits');
assert.equal(digitSession.mode,'all');assert.equal(digitSession.point,1);
const compositionRenderCount=renders;
const overridden=await post(`/api/preview/${digitSession.id}/settings`,{expectedRevision:1,composition:'faces'});
assert.equal(overridden.resolvedComposition,'faces');assert.equal((await adapter.api(`/api/preview/${first.id}`)).revision,2);
assert.equal(renders,compositionRenderCount+1);
assert.notEqual(overridden.candidate.atlas,digitSession.candidate.atlas);
assert.notEqual(overridden.candidate.texture,digitSession.candidate.texture);
assert.deepEqual(overridden.files,digitSession.files);
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
assert.equal(video.profile,'loop6-v3-1mb');assert.equal(video.frameCount,180);assert.equal(video.revision,2);assert.equal(video.candidate,second.candidate.id);
const savedVideo=structuredClone((await storage.get(first.id)).video);
const bundled=await adapter.api(`/api/preview/${first.id}/bundle`);
const zip=await JSZip.loadAsync(new Uint8Array(await urlBlobs.get(bundled.url).arrayBuffer()));
const zipNames=Object.keys(zip.files).filter(name=>!zip.files[name].dir);
assert.deepEqual(zipNames.sort(),['preview.json','preview.mp4',...files.map(f=>'res/'+f.name)].sort());
for(const file of files)assert.deepEqual(Buffer.from(await zip.file('res/'+file.name).async('uint8array')),Buffer.from(file.data.split(',')[1],'base64'));
const config=JSON.parse(await zip.file('preview.json').async('string'));assert.equal(config.video.duration,6);assert.equal(config.video.frameCount,180);assert.equal(config.video.profile,'loop6-v3-1mb');assert.equal(config.mode,'all');assert.equal(config.point,1);
const beforeOversize=await storage.get(first.id),writesBeforeOversize=storage.writes;
preparedSize=VIDEO_SPEC.maxBytes+1;
try {await rejects(()=>adapter.api(`/api/preview/${first.id}/video`,{method:'POST',headers,body:input}));}
finally {preparedSize=null;}
assert.equal(storage.writes,writesBeforeOversize);
assert.deepEqual(await storage.get(first.id),beforeOversize);
assert.deepEqual(Buffer.from(await (await storage.get(first.id)).video.blob.arrayBuffer()),Buffer.from(await savedVideo.blob.arrayBuffer()));
assert.equal((await adapter.api(`/api/preview/${first.id}`)).video.url,video.url);
checks.push('over_1mb_prepared_mp4_is_rejected_without_committing_or_replacing_the_previous_session_video');

const boundarySession=await post('/api/preview/import',{...payload,name:'恰好一MB'});
const boundaryHeaders={'Content-Type':'video/h264','X-Preview-Revision':'1','X-Candidate-Id':boundarySession.candidate.id};
preparedSize=VIDEO_SPEC.maxBytes;
let boundaryVideo;
try {boundaryVideo=await adapter.api(`/api/preview/${boundarySession.id}/video`,{method:'POST',headers:boundaryHeaders,body:new Blob([new Uint8Array(VIDEO_SPEC.maxBytes+1)],{type:'video/h264'})});}
finally {preparedSize=null;}
assert.equal(boundaryVideo.size,1_000_000);assert.equal(boundaryVideo.profile,VIDEO_PROFILE);
const boundaryRecord=await storage.get(boundarySession.id);
assert.equal(boundaryRecord.video.blob.size,1_000_000);
assert.equal((await adapter.api(`/api/preview/${boundarySession.id}`)).video.sha256,boundaryVideo.sha256);
const boundaryBundle=await adapter.api(`/api/preview/${boundarySession.id}/bundle`),boundaryZip=await JSZip.loadAsync(new Uint8Array(await urlBlobs.get(boundaryBundle.url).arrayBuffer()));
assert.equal((await boundaryZip.file('preview.mp4').async('uint8array')).length,1_000_000);
for(const file of files)assert.deepEqual(Buffer.from(await boundaryZip.file('res/'+file.name).async('uint8array')),Buffer.from(file.data.split(',')[1],'base64'));
const oversizedCache=structuredClone(boundaryRecord);
oversizedCache.video={...oversizedCache.video,blob:new Blob([new Uint8Array(VIDEO_SPEC.maxBytes+1)],{type:'video/mp4'}),size:1,sha256:'over-budget-cached-video'};
storage.records.set(boundarySession.id,oversizedCache);
const oversizeCacheWrites=storage.writes;
assert.equal((await adapter.api(`/api/preview/${boundarySession.id}`)).video,null,'Actual Blob size overrides a misleading metadata size');
const oversizeBundle=await adapter.api(`/api/preview/${boundarySession.id}/bundle`),oversizeZip=await JSZip.loadAsync(new Uint8Array(await urlBlobs.get(oversizeBundle.url).arrayBuffer()));
assert.equal(oversizeZip.file('preview.mp4'),null);assert.equal(JSON.parse(await oversizeZip.file('preview.json').async('string')).video,null);
assert.equal((await storage.get(boundarySession.id)).video.blob.size,1_000_001);assert.equal(storage.writes,oversizeCacheWrites);
checks.push('exactly_1mb_final_video_is_public_and_zipped_raw_intermediates_may_exceed_1mb_and_oversized_cached_blobs_are_hidden_without_deletion');

const v2Session=await post('/api/preview/import',{...payload,name:'历史v2视频'});
const v2Record=await storage.get(v2Session.id);
v2Record.video={...savedVideo,profile:'loop6-v2',revision:v2Session.revision,candidate:v2Session.candidate.id};
storage.records.set(v2Session.id,structuredClone(v2Record));
const v2Writes=storage.writes;
assert.equal((await adapter.api(`/api/preview/${v2Session.id}`)).video,null);
const v2Bundle=await adapter.api(`/api/preview/${v2Session.id}/bundle`),v2Zip=await JSZip.loadAsync(new Uint8Array(await urlBlobs.get(v2Bundle.url).arrayBuffer()));
assert.equal(v2Zip.file('preview.mp4'),null);assert.equal(JSON.parse(await v2Zip.file('preview.json').async('string')).video,null);
for(const file of files)assert.deepEqual(Buffer.from(await v2Zip.file('res/'+file.name).async('uint8array')),Buffer.from(file.data.split(',')[1],'base64'));
assert.equal(storage.writes,v2Writes);assert.deepEqual((await storage.get(v2Session.id)).video,v2Record.video);
assert.deepEqual(Buffer.from(await (await storage.get(v2Session.id)).video.blob.arrayBuffer()),Buffer.from(await savedVideo.blob.arrayBuffer()));
checks.push('fully_bound_v2_video_is_retained_in_storage_but_not_offered_for_download_or_added_to_zip');
const third=await post(`/api/preview/${first.id}/settings`,{expectedRevision:2,name:'仙人掌改名'});assert.equal(third.video,null);
assert.deepEqual((await storage.get(first.id)).video,savedVideo);
await rejects(()=>adapter.api(`/api/preview/${first.id}/video`,{method:'POST',headers,body:input}),409);
checks.push('real_jszip_contains_only_original_res_configuration_and_current_bound_mp4_then_settings_invalidate_video');

let release;blockVideo={promise:new Promise(resolve=>{release=resolve;})};
const pending=adapter.api(`/api/preview/${first.id}/video`,{method:'POST',headers:{...headers,'X-Preview-Revision':'3','X-Candidate-Id':third.candidate.id},body:input});
await new Promise(resolve=>setTimeout(resolve,0));
const fourth=await post(`/api/preview/${first.id}/settings`,{expectedRevision:3,grade:'green'});release();
await rejects(()=>pending,409);blockVideo=null;assert.equal((await adapter.api(`/api/preview/${first.id}`)).video,null);
assert.deepEqual((await storage.get(first.id)).video,savedVideo);
const oldRecord=await storage.get(first.id);oldRecord.video={...savedVideo,profile:'loop6-v1',revision:fourth.revision,candidate:fourth.candidate.id};storage.records.set(first.id,oldRecord);
const oldProfileWrites=storage.writes;
assert.equal((await adapter.api(`/api/preview/${first.id}`)).video,null);
const oldBundle=await adapter.api(`/api/preview/${first.id}/bundle`),oldZip=await JSZip.loadAsync(new Uint8Array(await urlBlobs.get(oldBundle.url).arrayBuffer()));
assert.equal(oldZip.file('preview.mp4'),null);assert.ok((await storage.get(first.id)).video.blob);
assert.equal(storage.writes,oldProfileWrites);
assert.deepEqual((await storage.get(first.id)).video,oldRecord.video);
assert.equal((await storage.get(first.id)).video.duration,6);
checks.push('late_video_cannot_commit_over_new_settings_and_fully_bound_six_second_v1_profile_is_hidden_without_blob_deletion');

const baseLegacy=await storage.get(first.id);
for(const [index,mode] of ['single','continuous','all'].entries()) {
  const legacy={...structuredClone(baseLegacy),id:'a'.repeat(31)+index,candidateId:'b'.repeat(31)+index,mode,point:6,revision:7};
  legacy.video={...savedVideo,profile:VIDEO_PROFILE,revision:7,candidate:legacy.candidateId};
  storage.records.set(legacy.id,structuredClone(legacy));
  const writes=storage.writes,renderBefore=renders;
  const migrated=await adapter.api(`/api/preview/${legacy.id}`);
  assert.equal(migrated.mode,'all');assert.equal(migrated.point,1);assert.equal(migrated.revision,8);
  assert.notEqual(migrated.candidate.id,legacy.candidateId);assert.equal(migrated.video,null);
  const stored=await storage.get(legacy.id);
  assert.deepEqual(stored.files,legacy.files);assert.deepEqual(stored.runtime,legacy.runtime);assert.deepEqual(stored.video,legacy.video);
  assert.deepEqual(Buffer.from(await stored.video.blob.arrayBuffer()),Buffer.from(await legacy.video.blob.arrayBuffer()));
  assert.equal(renders,renderBefore);assert.equal(storage.writes,writes+1);
  const again=await adapter.api(`/api/preview/${legacy.id}`);
  assert.equal(again.revision,8);assert.equal(again.candidate.id,migrated.candidate.id);assert.equal(storage.writes,writes+1);
  await rejects(()=>post(`/api/preview/${legacy.id}/settings`,{expectedRevision:7,name:'stale'}),409);
  await rejects(()=>adapter.api(`/api/preview/${legacy.id}/video`,{method:'POST',headers:{...headers,'X-Preview-Revision':'7','X-Candidate-Id':legacy.candidateId},body:input}),409);
  const migratedBundle=await adapter.api(`/api/preview/${legacy.id}/bundle`),migratedZip=await JSZip.loadAsync(new Uint8Array(await urlBlobs.get(migratedBundle.url).arrayBuffer()));
  assert.equal(migratedZip.file('preview.mp4'),null);
  const migratedConfig=JSON.parse(await migratedZip.file('preview.json').async('string'));
  assert.equal(migratedConfig.mode,'all');assert.equal(migratedConfig.point,1);assert.equal(migratedConfig.revision,8);
  for(const file of files)assert.deepEqual(Buffer.from(await migratedZip.file('res/'+file.name).async('uint8array')),Buffer.from(file.data.split(',')[1],'base64'));
}
checks.push('legacy_single_continuous_and_all_point6_migrate_once_with_cas_new_candidate_and_unchanged_originals_runtime_and_video_blobs');

const failureLegacy={...structuredClone(baseLegacy),id:'c'.repeat(32),candidateId:'d'.repeat(32),mode:'single',point:6,revision:11};
storage.records.set(failureLegacy.id,structuredClone(failureLegacy));storage.fail=true;
await assert.rejects(()=>adapter.api(`/api/preview/${failureLegacy.id}`));storage.fail=false;
assert.deepEqual(await storage.get(failureLegacy.id),failureLegacy);
assert.equal((await adapter.api(`/api/preview/${failureLegacy.id}`)).revision,12);
const concurrentLegacy={...structuredClone(failureLegacy),id:'e'.repeat(32),candidateId:'f'.repeat(32)};
storage.records.set(concurrentLegacy.id,structuredClone(concurrentLegacy));
const migrationResults=await Promise.allSettled([adapter.api(`/api/preview/${concurrentLegacy.id}`),adapter.api(`/api/preview/${concurrentLegacy.id}`)]);
assert.equal(migrationResults.filter(r=>r.status==='fulfilled').length,1);
assert.equal(migrationResults.filter(r=>r.status==='rejected'&&r.reason.status===409).length,1);
assert.equal((await storage.get(concurrentLegacy.id)).revision,12);
checks.push('migration_write_failure_preserves_legacy_record_and_concurrent_reads_cannot_double_increment_revision');

adapter.dispose();restored.dispose();assert.equal(urlBlobs.size,0);
console.log(JSON.stringify({ok:true,count:checks.length,checks,limits:'Pure session/PNG/ZIP/CAS logic with injected Canvas and storage. Real browser Canvas, IndexedDB, Spine and video module require browser QA.'},null,2));
