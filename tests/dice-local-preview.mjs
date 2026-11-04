// Pure session-contract checks. Canvas/IndexedDB rendering remains browser QA.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {deflateSync} from 'node:zlib';
import {createLocalPreview,validateFiles,validateSettings,inspectPNG,detectComposition,atlasText,SLOTS,VIDEO_PROFILE,resourceName} from '../dice/local-preview.mjs';
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
const payload={name:'仙人掌旧十图',grade:'purple',mode:'all',point:1,composition:'auto',files};
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
const spineContext={console};vm.runInNewContext(await readFile(new URL('../dice/vendor/spine-webgl.js',import.meta.url),'utf8'),spineContext);const S=spineContext.spine;
async function zipFactory() {
  const entries=new Map();return {file(name,data){entries.set(name,data);},async generateAsync(){const zip=new JSZip();for(const [name,data]of entries)zip.file(name,data instanceof Blob?new Uint8Array(await data.arrayBuffer()):data);return new Blob([await zip.generateAsync({type:'uint8array'})],{type:'application/zip'});}};
}
const storage=memoryStore(),urlBlobs=new Map();let serial=0,renders=0,smallDigits=false,blockVideo=null,preparedSize=null;
const dependencies={storage,uuid:()=>String(++serial).padStart(32,'0'),videoAvailable:true,
  fetchAsset:async path=>path.endsWith('.skel')?new Blob([await readFile(new URL('../dice/assets/template.skel',import.meta.url))],{type:'application/octet-stream'}):new Blob([path.endsWith('.png')?png(30):Buffer.from('ID3-default-audio')],{type:path.endsWith('.png')?'image/png':'audio/mpeg'}),
  createObjectURL:blob=>{const url='blob:fixture-'+(++serial);urlBlobs.set(url,blob);return url;},revokeObjectURL:url=>urlBlobs.delete(url),zipFactory,
  decodePNG:async(blob,name)=>({alphaArea:smallDigits&&/^sz_[1-6]/.test(name)?1200:16000,close(){}}),
  renderRuntime:async(files,composition)=>{renders++;assert.equal(files.length,10);assert.ok(['faces','digits'].includes(composition));return{texture:new Blob([png(612)],{type:'image/png'}),atlasText:atlasText()};},
  prepareVideo:async blob=>{if(blockVideo)await blockVideo.promise;const output=new Blob([preparedSize===null?blob:new Uint8Array(preparedSize)],{type:'video/mp4'});Object.defineProperty(output,'videoInfo',{value:{profile:VIDEO_PROFILE,width:720,height:1600,duration:6,fps:30,frameCount:180,method:'h264_copy_mux'}});return output;}};
const adapter=createLocalPreview(dependencies);
const post=(path,body)=>adapter.api(path,{method:'POST',body:JSON.stringify(body)});
async function rejects(operation,status=400){await assert.rejects(operation,error=>error.status===status);}
const binaryData=(bytes,text)=>new S.SkeletonBinary(new S.AtlasAttachmentLoader(new S.TextureAtlas(text))).readSkeletonData(new Uint8Array(bytes));
async function compactBundle(result,record){
 const name=result.name;assert.equal(name,resourceName(record.name,record.grade));assert.match(name,/^dice_purple_/);assert(!name.endsWith('.zip'));
 const zip=await JSZip.loadAsync(new Uint8Array(await urlBlobs.get(result.url).arrayBuffer())),root=name+'/';
 const source=record.files.filter(file=>file.slot!=='anchor'),sourcePath=file=>'res/'+(file.slot==='大骰子'?'icon':file.slot)+'.png';
 const expected=[name+'.skel',name+'.atlas',name+'.png',...source.map(sourcePath),'sound/dice_roll.mp3','sound/sound_ui_dice6.mp3'].map(path=>root+path).sort();
 assert.deepEqual(Object.keys(zip.files).filter(path=>!zip.files[path].dir).sort(),expected);
 for(const file of source)assert.deepEqual(Buffer.from(await zip.file(root+sourcePath(file)).async('uint8array')),Buffer.from(await file.blob.arrayBuffer()));
 const text=await zip.file(root+name+'.atlas').async('string');assert.equal(text,record.runtime.atlasText.replace(/^[^\r\n]+/,name+'.png'));
 assert.deepEqual(Buffer.from(await zip.file(root+name+'.png').async('uint8array')),Buffer.from(await record.runtime.texture.arrayBuffer()));
 const data=binaryData(await zip.file(root+name+'.skel').async('uint8array'),text),original=binaryData(await readFile(new URL('../dice/assets/template.skel',import.meta.url)),record.runtime.atlasText);
 assert.equal(data.version,original.version);assert.equal(data.animations.length,12);
 const bones=d=>Array.from(d.bones,b=>({name:b.name,parent:b.parent?.name||null,x:b.x,y:b.y,rotation:b.rotation,scaleX:b.scaleX,scaleY:b.scaleY}));
 const slots=d=>Array.from(d.slots,s=>({name:s.name,bone:s.boneData.name,attachment:s.attachmentName,color:[s.color.r,s.color.g,s.color.b,s.color.a]}));
 assert.deepEqual(bones(data),bones(original));assert.deepEqual(slots(data),slots(original));
 const motion=a=>Array.from(a.timelines).filter(t=>!(t instanceof S.EventTimeline)).map(t=>({type:t.constructor.name,frames:Array.from(t.frames),curves:t.curves?Array.from(t.curves):null,slot:t.slotIndex??null,bone:t.boneIndex??null,attachments:t.attachmentNames?Array.from(t.attachmentNames):null}));
 for(const a of original.animations){
  const patched=data.findAnimation(a.name);assert.ok(patched);assert.equal(patched.duration,a.duration);assert.deepEqual(motion(patched),motion(a));
  const events=[];patched.apply(new S.Skeleton(data),-1,patched.duration,false,events,1,S.MixBlend.replace,S.MixDirection.mixIn);
  assert.deepEqual(events.map(e=>e.data.name),a.name.startsWith('spin_')?['dice_roll',...(a.name==='spin_6'?['sound_ui_dice6']:[])]:[]);
 }
 assert.deepEqual(Array.from(data.events,e=>e.name),['dice_roll','sound_ui_dice6']);
 for(const e of data.events){assert.equal(e.audioPath,'sound/'+e.name+'.mp3');assert.ok(zip.file(root+e.audioPath));}
 for(const sound of ['dice_roll','sound_ui_dice6'])assert.deepEqual(Buffer.from(await zip.file(root+'sound/'+sound+'.mp3').async('uint8array')),record.audio?.[sound]?Buffer.from(await record.audio[sound].blob.arrayBuffer()):Buffer.from('ID3-default-audio'));
 return {zip,root,data};
}

assert.equal(validateFiles(files)[0].slot,'大骰子');
for(const [entries,key] of [[files.slice(1),'missing'],[[...files,{name:'extra.png'}],'extra'],[[...files,{name:'icon.png'}],'duplicates']]) {
  assert.throws(()=>validateFiles(entries),error=>error.payload[key].length>0);
}
assert.equal(validateFiles([...files,{...files[0],name:'大骰子.png'}])[0].name,'大骰子.png');
assert.throws(()=>validateSettings({...payload,point:true}));assert.throws(()=>validateSettings(null));
for(const invalid of [{mode:'unknown'},{point:0},{point:7},{point:null}])assert.throws(()=>validateSettings({...payload,...invalid}));
for(const mode of ['all','single','continuous'])assert.deepEqual(
  validateSettings({...payload,mode,point:6}),{name:'仙人掌旧十图',grade:'purple',mode:'all',point:1,composition:'auto',soundEnabled:true});
assert.equal(VIDEO_PROFILE,'loop6-v4-audio-1mb');
assert.equal(VIDEO_PROFILE,VIDEO_SPEC.profile);assert.equal(VIDEO_SPEC.maxBytes,1_000_000);
assert.equal(inspectPNG(new Uint8Array(png(200)),'sz_0').width,200);
const corrupted=new Uint8Array(png(200));corrupted[40]^=1;assert.throws(()=>inspectPNG(corrupted,'sz_0'));
assert.throws(()=>inspectPNG(new Uint8Array(png(240)),'sz_0'));
assert.match(atlasText(),/sz_6\n  bounds: 410, 410, 200, 200\n  offsets: 0, 0, 200, 200\n  rotate: 0/);
assert.equal((atlasText().match(/  rotate: 0/g)||[]).length,9);
checks.push('canonical_alias_missing_extra_duplicates_png_crc_dimensions_settings_and_untrimmed_atlas_contract');

const first=await post('/api/preview/import',payload);
assert.equal(first.revision,1);assert.equal(first.resolvedComposition,'faces');assert.equal(first.candidate.template,'green');assert.equal(first.candidate.atlasPage,'preview.png');
assert.equal(first.candidate.previewGrade,'purple');assert.equal(first.files.find(f=>f.slot==='大骰子').name,'icon.png');
for(const file of first.files)assert.deepEqual(Buffer.from(await urlBlobs.get(file.url).arrayBuffer()),Buffer.from(files.find(f=>f.name===file.name).data.split(',')[1],'base64'));
const before=structuredClone(await storage.get(first.id));
const invalid=structuredClone(payload);invalid.files[0].data='data:image/png;base64,broken';await rejects(()=>post('/api/preview/import',invalid));
assert.deepEqual(await storage.get(first.id),before);assert.equal(storage.records.size,1);
storage.fail=true;await assert.rejects(()=>post(`/api/preview/${first.id}/settings`,{expectedRevision:1,name:'存储配额失败'}));storage.fail=false;
assert.deepEqual(await storage.get(first.id),before);
checks.push('imports_preserve_all_ten_original_bytes_names_and_failed_import_or_storage_write_keep_existing_session');

const noop=await post(`/api/preview/${first.id}/settings`,{expectedRevision:1,grade:'purple',mode:'continuous',point:6});
assert.equal(noop.revision,1);assert.equal(noop.candidate.id,first.candidate.id);
const renderCount=renders;
const second=await post(`/api/preview/${first.id}/settings`,{expectedRevision:1,name:'紫色十图更名',mode:'single',point:6});
assert.equal(second.revision,2);assert.equal(second.candidate.template,'green');assert.equal(second.candidate.previewGrade,'purple');assert.equal(renders,renderCount);
assert.notEqual(second.candidate.id,first.candidate.id);assert.deepEqual(second.files,first.files);
assert.equal(second.mode,'all');assert.equal(second.point,1);
for(const key of ['atlas','texture','skel'])assert.equal(second.candidate[key],first.candidate[key]);
assert.equal(second.candidate.png['大骰子'],first.candidate.png['大骰子']);
await rejects(()=>post(`/api/preview/${first.id}/settings`,{expectedRevision:1,point:2}),409);
await assert.rejects(()=>post(`/api/preview/${first.id}/settings`,{expectedRevision:2,grade:'green'}),error=>error.status===409&&error.payload.needsUpload===true);
assert.equal((await storage.get(first.id)).revision,2);
checks.push('fixed_all_point1_no_op_and_name_settings_keep_runtime_urls_cross_grade_needs_upload_and_stale_settings_reject');

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
assert.equal(video.profile,VIDEO_PROFILE);assert.equal(video.frameCount,180);assert.equal(video.revision,2);assert.equal(video.candidate,second.candidate.id);
const savedVideo=structuredClone((await storage.get(first.id)).video);
const bundled=await adapter.api(`/api/preview/${first.id}/bundle`);
await compactBundle(bundled,await storage.get(first.id));assert.equal(bundled.name,'dice_purple_紫色十图更名');
assert.equal((await adapter.api(`/api/preview/${first.id}`)).video.sha256,video.sha256,'Packaging omits video without mutating its valid session cache');
checks.push('compact_purple_zip_only_named_runtime_canonical_res_and_sound_preserves_original_motion_with_real_binary_audio_events');
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
const boundaryBundle=await adapter.api(`/api/preview/${boundarySession.id}/bundle`);await compactBundle(boundaryBundle,boundaryRecord);
assert.equal((await adapter.api(`/api/preview/${boundarySession.id}`)).video.size,1_000_000);
const oversizedCache=structuredClone(boundaryRecord);
oversizedCache.video={...oversizedCache.video,blob:new Blob([new Uint8Array(VIDEO_SPEC.maxBytes+1)],{type:'video/mp4'}),size:1,sha256:'over-budget-cached-video'};
storage.records.set(boundarySession.id,oversizedCache);
const oversizeCacheWrites=storage.writes;
assert.equal((await adapter.api(`/api/preview/${boundarySession.id}`)).video,null,'Actual Blob size overrides a misleading metadata size');
const oversizeBundle=await adapter.api(`/api/preview/${boundarySession.id}/bundle`);await compactBundle(oversizeBundle,oversizedCache);
assert.equal((await storage.get(boundarySession.id)).video.blob.size,1_000_001);assert.equal(storage.writes,oversizeCacheWrites);
checks.push('exactly_1mb_final_video_is_public_and_zipped_raw_intermediates_may_exceed_1mb_and_oversized_cached_blobs_are_hidden_without_deletion');

const v2Session=await post('/api/preview/import',{...payload,name:'历史v2视频'});
const v2Record=await storage.get(v2Session.id);
v2Record.video={...savedVideo,profile:'loop6-v2',revision:v2Session.revision,candidate:v2Session.candidate.id};
storage.records.set(v2Session.id,structuredClone(v2Record));
const v2Writes=storage.writes;
assert.equal((await adapter.api(`/api/preview/${v2Session.id}`)).video,null);
const v2Bundle=await adapter.api(`/api/preview/${v2Session.id}/bundle`);await compactBundle(v2Bundle,v2Record);
assert.equal(storage.writes,v2Writes);assert.deepEqual((await storage.get(v2Session.id)).video,v2Record.video);
assert.deepEqual(Buffer.from(await (await storage.get(v2Session.id)).video.blob.arrayBuffer()),Buffer.from(await savedVideo.blob.arrayBuffer()));
checks.push('fully_bound_v2_video_is_retained_in_storage_but_not_offered_for_download_or_added_to_zip');
const third=await post(`/api/preview/${first.id}/settings`,{expectedRevision:2,name:'仙人掌改名'});assert.equal(third.video,null);
assert.deepEqual((await storage.get(first.id)).video,savedVideo);
await rejects(()=>adapter.api(`/api/preview/${first.id}/video`,{method:'POST',headers,body:input}),409);
checks.push('compact_zip_excludes_even_current_video_while_session_settings_still_invalidate_and_retain_bound_mp4');

let release;blockVideo={promise:new Promise(resolve=>{release=resolve;})};
const pending=adapter.api(`/api/preview/${first.id}/video`,{method:'POST',headers:{...headers,'X-Preview-Revision':'3','X-Candidate-Id':third.candidate.id},body:input});
await new Promise(resolve=>setTimeout(resolve,0));
const fourth=await post(`/api/preview/${first.id}/settings`,{expectedRevision:3,soundEnabled:false});release();
await rejects(()=>pending,409);blockVideo=null;assert.equal((await adapter.api(`/api/preview/${first.id}`)).video,null);
assert.deepEqual((await storage.get(first.id)).video,savedVideo);
const oldRecord=await storage.get(first.id);oldRecord.video={...savedVideo,profile:'loop6-v1',revision:fourth.revision,candidate:fourth.candidate.id};storage.records.set(first.id,oldRecord);
const oldProfileWrites=storage.writes;
assert.equal((await adapter.api(`/api/preview/${first.id}`)).video,null);
const oldBundle=await adapter.api(`/api/preview/${first.id}/bundle`);await compactBundle(oldBundle,oldRecord);assert.ok((await storage.get(first.id)).video.blob);
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
  const migratedBundle=await adapter.api(`/api/preview/${legacy.id}/bundle`);await compactBundle(migratedBundle,stored);
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

const purpleHeroBase=await post('/api/preview/import',payload),purpleBefore=await storage.get(purpleHeroBase.id),purpleRenderCount=renders;
const purpleHero=new File([png(240,254)],'大骰子.png',{type:'image/png'});
const purpleUpdated=await adapter.api(`/api/preview/${purpleHeroBase.id}/hero`,{method:'POST',body:{expectedRevision:1,file:purpleHero}});
assert.equal(purpleUpdated.revision,2);assert.equal(purpleUpdated.grade,'purple');assert.equal(purpleUpdated.heroMissing,false);assert.notEqual(purpleUpdated.candidate.icon,purpleHeroBase.candidate.icon);
assert.equal(renders,purpleRenderCount);assert.deepEqual((await storage.get(purpleHeroBase.id)).runtime,purpleBefore.runtime);
assert.deepEqual(Buffer.from(await urlBlobs.get(purpleUpdated.candidate.icon).arrayBuffer()),Buffer.from(await purpleHero.arrayBuffer()));
const bothHeroes=await post('/api/preview/import',{...payload,name:'dice_green_dice_purple_板球',files:[...files,{...files[0],name:'大骰子.png'}]});
assert.equal(bothHeroes.files.find(f=>f.slot==='大骰子').name,'大骰子.png');
const prefixedBundle=await adapter.api(`/api/preview/${bothHeroes.id}/bundle`);assert.equal(prefixedBundle.name,'dice_purple_板球');await compactBundle(prefixedBundle,await storage.get(bothHeroes.id));
checks.push('purple_hero_only_updates_keep_runtime_and_direct_import_prefers_named_large_dice_over_icon');

adapter.dispose();restored.dispose();assert.equal(urlBlobs.size,0);
console.log(JSON.stringify({ok:true,count:checks.length,checks,limits:'Pure session/PNG/ZIP/CAS logic with injected Canvas and storage. Real browser Canvas, IndexedDB, Spine and video module require browser QA.'},null,2));
