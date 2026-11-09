// Pure session-contract checks. Canvas rendering remains browser QA.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {deflateSync} from 'node:zlib';
import {createLocalPreview,validateFiles,validateSettings,inspectPNG,detectComposition,atlasText,SLOTS,VIDEO_PROFILE,resourceName,validatePurpleFiles} from '../dice/local-preview.mjs';
import {VIDEO_SPEC} from '../dice/video-export.mjs';
import {nativeRuntimeFixture} from './helpers/purple-fixtures.mjs';
import {PURPLE_REFERENCE_MOTION_VERSION} from '../dice/purple-reference/runtime.mjs';
import {writeSpineBinary} from '../dice/six-face/spine-binary.mjs';
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
const storage=memoryStore(),urlBlobs=new Map(),decodeNames=[];let serial=0,renders=0,smallDigits=false,blockVideo=null,preparedSize=null,failPurpleBuild=false;
const dependencies={storage,uuid:()=>String(++serial).padStart(32,'0'),videoAvailable:true,
  fetchAsset:async path=>path.endsWith('.skel')?new Blob([await readFile(new URL('../dice/assets/template.skel',import.meta.url))],{type:'application/octet-stream'}):new Blob([path.endsWith('.png')?png(30):Buffer.from('ID3-default-audio')],{type:path.endsWith('.png')?'image/png':'audio/mpeg'}),
  createObjectURL:blob=>{const url='blob:fixture-'+(++serial);urlBlobs.set(url,blob);return url;},revokeObjectURL:url=>urlBlobs.delete(url),zipFactory,
  decodePNG:async(blob,name)=>{decodeNames.push(name);return {alphaArea:smallDigits&&/^sz_[1-6]/.test(name)?1200:16000,drawable:name==='anchor.png'?{width:30,height:30}:undefined,close(){}};},
  renderRuntime:async()=>assert.fail('New purple sessions must not use the legacy template renderer'),
  renderPurpleGyro:async(files,options)=>{renders++;if(failPurpleBuild)throw Error('injected purple-gyro build failure');assert.equal(files.filter(file=>/^sz_[1-6]$/.test(file.slot)).length,6);assert.ok(['faces','digits'].includes(options.composition));assert.equal(options.anchorImage.width,30);return nativeRuntimeFixture(options);},
  prepareVideo:async blob=>{if(blockVideo)await blockVideo.promise;const output=new Blob([preparedSize===null?blob:new Uint8Array(preparedSize)],{type:'video/mp4'});Object.defineProperty(output,'videoInfo',{value:{profile:VIDEO_PROFILE,width:720,height:1600,duration:6,fps:60,frameCount:360,method:'h264_copy_mux'}});return output;}};
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
 const data=binaryData(await zip.file(root+name+'.skel').async('uint8array'),text),original=new S.SkeletonJson(new S.AtlasAttachmentLoader(new S.TextureAtlas(record.runtime.atlasText))).readSkeletonData(record.runtime.json);
 assert.equal(data.version,original.version);assert.equal(data.animations.length,12);assert.equal(data.imagesPath,'./res/');assert.equal(data.audioPath,'./sound/');
 const bones=d=>Array.from(d.bones,b=>({name:b.name,parent:b.parent?.name||null,x:b.x,y:b.y,rotation:b.rotation,scaleX:b.scaleX,scaleY:b.scaleY}));
 const slots=d=>Array.from(d.slots,s=>({name:s.name,bone:s.boneData.name,attachment:s.attachmentName,color:[s.color.r,s.color.g,s.color.b,s.color.a]}));
 assert.deepEqual(bones(data),bones(original));assert.deepEqual(slots(data),slots(original));
 const motion=a=>Array.from(a.timelines).filter(t=>!(t instanceof S.EventTimeline)).map(t=>({type:t.constructor.name,frames:Array.from(t.frames),curves:t.curves?Array.from(t.curves):null,slot:t.slotIndex??null,bone:t.boneIndex??null,attachments:t.attachmentNames?Array.from(t.attachmentNames):null,deform:t.vertices?Array.from(t.vertices,frame=>Array.from(frame)):null,drawOrder:t.drawOrders?Array.from(t.drawOrders,frame=>frame?Array.from(frame):null):null}));
 for(const a of original.animations){
  const patched=data.findAnimation(a.name);assert.ok(patched);assert.equal(patched.duration,a.duration);assert.deepEqual(motion(patched),motion(a));
  const events=[];patched.apply(new S.Skeleton(data),-1,patched.duration,false,events,1,S.MixBlend.replace,S.MixDirection.mixIn);
  assert.deepEqual(events.map(e=>e.data.name),a.name.startsWith('spin_')?['dice_roll',...(a.name==='spin_6'?['sound_ui_dice6']:[])]:[]);
 }
 assert.deepEqual(Array.from(data.events,e=>e.name),['dice_roll','sound_ui_dice6']);
 for(const e of data.events){assert.equal(e.audioPath,e.name+'.mp3');assert.equal(data.audioPath,'./sound/');assert.ok(zip.file(root+'sound/'+e.audioPath));}
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
  validateSettings({...payload,mode,point:6}),{name:'仙人掌旧十图',grade:'purple',previewGrade:'purple',mode:'all',point:1,composition:'auto',soundEnabled:true});
assert.equal(validateSettings({...payload,previewGrade:'green'}).previewGrade,'green');
for(const previewGrade of ['unknown',null,true])assert.throws(()=>validateSettings({...payload,previewGrade}));
assert.equal(VIDEO_PROFILE,'loop6-v7-60fps-audio-1500kb');
assert.equal(VIDEO_PROFILE,VIDEO_SPEC.profile);assert.equal(VIDEO_SPEC.maxBytes,1_500_000);
assert.equal(inspectPNG(new Uint8Array(png(200)),'sz_0').width,200);
const corrupted=new Uint8Array(png(200));corrupted[40]^=1;assert.throws(()=>inspectPNG(corrupted,'sz_0'));
assert.throws(()=>inspectPNG(new Uint8Array(png(240)),'sz_0'));
assert.match(atlasText(),/sz_6\n  bounds: 410, 410, 200, 200\n  offsets: 0, 0, 200, 200\n  rotate: 0/);
assert.equal((atlasText().match(/  rotate: 0/g)||[]).length,9);
checks.push('canonical_alias_missing_extra_duplicates_png_crc_dimensions_settings_and_untrimmed_atlas_contract');

const first=await post('/api/preview/import',payload);
assert.equal(first.revision,1);assert.equal(first.resolvedComposition,'faces');assert.equal(first.kind,'purple-gyro');assert.equal(first.candidate.kind,'purple-gyro');assert.equal(first.candidate.template,'purple');assert.equal(first.candidate.atlasPage,'dice.png');assert.ok(first.candidate.json);assert.equal(first.candidate.skel,undefined);
assert.equal(first.candidate.previewGrade,'purple');assert.equal(first.files.find(f=>f.slot==='大骰子').name,'icon.png');
assert.equal(first.grade,'purple');assert.equal(first.previewGrade,'purple');
for(const file of first.files)assert.deepEqual(Buffer.from(await urlBlobs.get(file.url).arrayBuffer()),Buffer.from(files.find(f=>f.name===file.name).data.split(',')[1],'base64'));
const before=structuredClone(await storage.get(first.id));
const invalid=structuredClone(payload);invalid.files.find(file=>file.name==='sz_1.png').data='data:image/png;base64,broken';await rejects(()=>post('/api/preview/import',invalid));
assert.deepEqual(await storage.get(first.id),before);assert.equal(storage.records.size,1);
storage.fail=true;await assert.rejects(()=>post(`/api/preview/${first.id}/settings`,{expectedRevision:1,name:'存储配额失败'}));storage.fail=false;
assert.deepEqual(await storage.get(first.id),before);
checks.push('imports_preserve_all_ten_original_bytes_names_and_failed_import_or_storage_write_keep_existing_session');

const noop=await post(`/api/preview/${first.id}/settings`,{expectedRevision:1,grade:'purple',mode:'continuous',point:6});
assert.equal(noop.revision,1);assert.equal(noop.candidate.id,first.candidate.id);
const renderCount=renders;
const second=await post(`/api/preview/${first.id}/settings`,{expectedRevision:1,name:'紫色十图更名',mode:'single',point:6});
assert.equal(second.revision,2);assert.equal(second.candidate.template,'purple');assert.equal(second.candidate.previewGrade,'purple');assert.equal(renders,renderCount);
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
assert.equal((await storage.get(digitSession.id)).runtime.metadata.composition,'digits');
const compositionRenderCount=renders;
const overridden=await post(`/api/preview/${digitSession.id}/settings`,{expectedRevision:1,composition:'faces'});
assert.equal((await storage.get(digitSession.id)).runtime.metadata.composition,'faces');
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
const sizedZero={slot:'sz_0',width:200,height:200,alphaArea:40000};
const fullFaces=Array.from({length:6},(_,i)=>({slot:'sz_'+(i+1),width:128,height:128,alphaArea:128**2}));
const mixedFull=detectComposition([...fullFaces,sizedZero]);assert.equal(mixedFull.resolvedComposition,'faces');assert.ok(Object.values(mixedFull.compositionDetection.ratios).every(ratio=>ratio===1));
const mixedSides=[64,96,128,200,256,512],scaledDigitFaces=mixedSides.map((side,i)=>({slot:'sz_'+(i+1),width:side,height:side,alphaArea:Math.round(side**2*.1)}));
assert.equal(detectComposition([...scaledDigitFaces,sizedZero]).resolvedComposition,'digits');
assert.equal(detectComposition([...scaledDigitFaces,sizedZero],'faces').resolvedComposition,'faces');
const contained=detectComposition([...fullFaces.map(file=>({...file,width:128,height:64,alphaArea:4096})),{...sizedZero,alphaArea:10000}]);assert.equal(contained.resolvedComposition,'faces');assert.ok(Object.values(contained.compositionDetection.ratios).every(ratio=>ratio===1));
const oldAreas=SLOTS.map(slot=>({slot,alphaArea:/^sz_[1-6]/.test(slot)?200:10000}));assert.deepEqual(detectComposition(oldAreas.map(file=>({...file,width:200,height:200}))),detection);
assert.deepEqual(detectComposition(oldAreas.map(file=>file.slot==='sz_1'?{...file,width:200,height:200}:file)),detection);
checks.push('auto_composition_is_resolution_invariant_uses_square_contain_area_and_preserves_same_size_or_dimensionless_behavior');
checks.push('auto_detection_override_independent_sessions_and_refresh_restore_keep_original_blobs_and_candidate_identity');

const headers={'Content-Type':'video/h264','X-Preview-Revision':'2','X-Candidate-Id':second.candidate.id};
const input=new Blob(['procedural-video-fixture'],{type:'video/h264'});
const video=await adapter.api(`/api/preview/${first.id}/video`,{method:'POST',headers,body:input});
assert.equal(video.profile,VIDEO_PROFILE);assert.equal(video.frameCount,360);assert.equal(video.revision,2);assert.equal(video.candidate,second.candidate.id);
const savedVideo=structuredClone((await storage.get(first.id)).video);
const bundled=await adapter.api(`/api/preview/${first.id}/bundle`);
await compactBundle(bundled,await storage.get(first.id));assert.equal(bundled.name,'dice_purple_紫色十图更名');
assert.equal((await adapter.api(`/api/preview/${first.id}`)).video.sha256,video.sha256,'Packaging omits video without mutating its valid session cache');
checks.push('compact_purple_zip_named_runtime_canonical_res_and_sound_uses_new_native_JSON_motion_with_real_binary_roundtrip');
const beforeOversize=await storage.get(first.id),writesBeforeOversize=storage.writes;
preparedSize=VIDEO_SPEC.maxBytes+1;
try {await assert.rejects(()=>adapter.api(`/api/preview/${first.id}/video`,{method:'POST',headers,body:input}),error=>error.status===400&&/1\.5 MB/.test(error.message));}
finally {preparedSize=null;}
assert.equal(storage.writes,writesBeforeOversize);
assert.deepEqual(await storage.get(first.id),beforeOversize);
assert.deepEqual(Buffer.from(await (await storage.get(first.id)).video.blob.arrayBuffer()),Buffer.from(await savedVideo.blob.arrayBuffer()));
assert.equal((await adapter.api(`/api/preview/${first.id}`)).video.url,video.url);
checks.push('prepared_mp4_one_byte_over_1500kb_is_rejected_without_replacing_the_previous_session_video');

const boundarySession=await post('/api/preview/import',{...payload,name:'恰好1.5MB'});
const boundaryHeaders={'Content-Type':'video/h264','X-Preview-Revision':'1','X-Candidate-Id':boundarySession.candidate.id};
preparedSize=VIDEO_SPEC.maxBytes;
let boundaryVideo;
try {boundaryVideo=await adapter.api(`/api/preview/${boundarySession.id}/video`,{method:'POST',headers:boundaryHeaders,body:new Blob([new Uint8Array(VIDEO_SPEC.maxBytes+1)],{type:'video/h264'})});}
finally {preparedSize=null;}
assert.equal(boundaryVideo.size,VIDEO_SPEC.maxBytes);assert.equal(boundaryVideo.profile,VIDEO_PROFILE);
const boundaryRecord=await storage.get(boundarySession.id);
assert.equal(boundaryRecord.video.blob.size,VIDEO_SPEC.maxBytes);
assert.equal((await adapter.api(`/api/preview/${boundarySession.id}`)).video.sha256,boundaryVideo.sha256);
const boundaryBundle=await adapter.api(`/api/preview/${boundarySession.id}/bundle`);await compactBundle(boundaryBundle,boundaryRecord);
assert.equal((await adapter.api(`/api/preview/${boundarySession.id}`)).video.size,VIDEO_SPEC.maxBytes);
const oversizedCache=structuredClone(boundaryRecord);
oversizedCache.video={...oversizedCache.video,blob:new Blob([new Uint8Array(VIDEO_SPEC.maxBytes+1)],{type:'video/mp4'}),size:1,sha256:'over-budget-cached-video'};
storage.records.set(boundarySession.id,oversizedCache);
const oversizeCacheWrites=storage.writes;
assert.equal((await adapter.api(`/api/preview/${boundarySession.id}`)).video,null,'Actual Blob size overrides a misleading metadata size');
const oversizeBundle=await adapter.api(`/api/preview/${boundarySession.id}/bundle`);await compactBundle(oversizeBundle,oversizedCache);
assert.equal((await storage.get(boundarySession.id)).video.blob.size,VIDEO_SPEC.maxBytes+1);assert.equal(storage.writes,oversizeCacheWrites);
checks.push('exactly_1500kb_final_video_is_downloadable_raw_input_may_exceed_the_cap_and_oversized_cached_blobs_stay_hidden_without_deletion');

const previousProfileSession=await post('/api/preview/import',{...payload,name:'旧30fps视频'});
const previousProfileRecord=await storage.get(previousProfileSession.id);
previousProfileRecord.video={...savedVideo,profile:'loop6-v6-audio-1500kb',fps:30,frameCount:180,revision:previousProfileSession.revision,candidate:previousProfileSession.candidate.id};
storage.records.set(previousProfileSession.id,structuredClone(previousProfileRecord));
const previousProfileWrites=storage.writes;
assert.equal((await adapter.api(`/api/preview/${previousProfileSession.id}`)).video,null);
const previousProfileBundle=await adapter.api(`/api/preview/${previousProfileSession.id}/bundle`);await compactBundle(previousProfileBundle,previousProfileRecord);
assert.equal(storage.writes,previousProfileWrites);assert.deepEqual((await storage.get(previousProfileSession.id)).video,previousProfileRecord.video);
assert.deepEqual(Buffer.from(await (await storage.get(previousProfileSession.id)).video.blob.arrayBuffer()),Buffer.from(await savedVideo.blob.arrayBuffer()));
checks.push('previous_30fps_profile_is_retained_in_storage_but_not_offered_for_download_or_added_to_zip');
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

// Legacy purple templates and stale native motion must regenerate once, while
// original PNG/audio/video Blobs and CAS transaction semantics are preserved.
for(const [index,legacyRuntime] of [
 {kind:'template',texture:new Blob([png(612)]),atlasText:atlasText()},
 {...nativeRuntimeFixture(),metadata:{...nativeRuntimeFixture().metadata,motionVersion:'purple-gyro-old'}},
 {...nativeRuntimeFixture(),metadata:{...nativeRuntimeFixture().metadata,anchor:{bone:'all',scaleX:1,scaleY:1,opacity:1}}},
].entries()){
 const legacy={...structuredClone(baseLegacy),id:'a'.repeat(29)+'f'+index+'0',candidateId:'b'.repeat(29)+'f'+index+'0',revision:20,mode:'all',point:1,runtime:legacyRuntime};
 legacy.video={...savedVideo,profile:VIDEO_PROFILE,revision:20,candidate:legacy.candidateId};storage.records.set(legacy.id,structuredClone(legacy));
 const rendered=renders,writes=storage.writes,migrated=await adapter.api(`/api/preview/${legacy.id}`),stored=await storage.get(legacy.id);
 assert.equal(migrated.kind,'purple-gyro');assert.equal(migrated.revision,21);assert.notEqual(migrated.candidate.id,legacy.candidateId);assert.equal(migrated.video,null);
 assert.deepEqual(stored.files,legacy.files);assert.deepEqual(stored.audio,legacy.audio);assert.deepEqual(stored.video,legacy.video);assert.equal(renders,rendered+1);assert.equal(storage.writes,writes+1);
 assert.equal((await adapter.api(`/api/preview/${legacy.id}`)).revision,21);assert.equal(renders,rendered+1);assert.equal(storage.writes,writes+1);
 await compactBundle(await adapter.api(`/api/preview/${legacy.id}/bundle`),stored);
}
const failedNativeLegacy={...structuredClone(baseLegacy),id:'8'.repeat(32),candidateId:'9'.repeat(32),revision:30,runtime:{kind:'template',texture:new Blob([png(612)]),atlasText:atlasText()}};
storage.records.set(failedNativeLegacy.id,structuredClone(failedNativeLegacy));failPurpleBuild=true;await assert.rejects(()=>adapter.api(`/api/preview/${failedNativeLegacy.id}`),/purple-gyro build failure/);failPurpleBuild=false;assert.deepEqual(await storage.get(failedNativeLegacy.id),failedNativeLegacy);
assert.equal((await adapter.api(`/api/preview/${failedNativeLegacy.id}`)).revision,31);
checks.push('purple_template_old_motion_or_bad_anchor_migrate_once_to_native05_preserving_files_audio_video_with_retryable_build_failure');

let noZeroSession,noZeroRecord;
const sixOnly=files.filter(file=>/^sz_[1-6]\.png$/.test(file.name)),hero=files.find(file=>file.name==='icon.png'),zero=files.find(file=>file.name==='sz_0.png');
for(const [index,selection] of [sixOnly,[...sixOnly,hero],[...sixOnly,hero,zero],files].entries()){
 assert.equal(validatePurpleFiles(selection).length,selection.length);
 const created=await post('/api/preview/import',{...payload,name:'紫色可选素材'+index,files:selection}),record=await storage.get(created.id);
 assert.equal(created.kind,'purple-gyro');assert.equal(created.files.length,selection.length);assert.equal(created.resolvedComposition,'faces','Auto without sz0 must default to full faces, not NaN digit detection');
 assert.equal(created.heroMissing,!selection.includes(hero));if(index===0){noZeroSession=created;noZeroRecord=record;}
 for(const item of created.files)assert.deepEqual(Buffer.from(await urlBlobs.get(item.url).arrayBuffer()),Buffer.from(selection.find(f=>f.name===item.name).data.split(',')[1],'base64'));
 await compactBundle(await adapter.api(`/api/preview/${created.id}/bundle`),record);
}
const noZeroRenderCount=renders;await rejects(()=>post(`/api/preview/${noZeroSession.id}/settings`,{expectedRevision:1,composition:'digits'}));assert.equal(renders,noZeroRenderCount);assert.deepEqual(await storage.get(noZeroSession.id),noZeroRecord);
const aliases=sixOnly.map((file,index)=>({...file,name:'face_'+(index+1)+'.png'}));
const aliased=await post('/api/preview/import',{...payload,name:'紫色六面别名',files:aliases});assert.deepEqual(aliased.files.map(file=>file.slot),Array.from({length:6},(_,i)=>'sz_'+(i+1)));
const bare=sixOnly.map((file,index)=>({...file,name:(index+1)+'.png'})),bareSession=await post('/api/preview/import',{...payload,name:'裸数字六面',files:bare});assert.deepEqual(bareSession.files.map(file=>file.slot),Array.from({length:6},(_,i)=>'sz_'+(i+1)));assert.equal(bareSession.files.length,6);
for(const selection of [sixOnly.slice(1),[...sixOnly,sixOnly[0]]])assert.throws(()=>validatePurpleFiles(selection));
const writesBeforeMissingBase=storage.writes;await rejects(()=>post('/api/preview/import',{...payload,name:'缺数字底图',composition:'digits',files:sixOnly}));assert.equal(storage.writes,writesBeforeMissingBase);
const badHeroSelection=[...sixOnly,{...hero,data:'data:image/png;base64,broken'}],heroFallback=await post('/api/preview/import',{...payload,name:'可选大图损坏',files:badHeroSelection});assert.equal(heroFallback.kind,'purple-gyro');assert.equal(heroFallback.heroMissing,true);assert.equal(heroFallback.candidate.icon,null);assert.equal(heroFallback.files.length,6);assert.ok(heroFallback.candidate.warnings.length);
checks.push('purple_six_seven_eight_and_legacy_ten_native_inputs_keep_sources_optional_hero_and_zero_aliases_and_missing_digits_base_are_safe');

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

const displayBase=await post('/api/preview/import',{...payload,name:'dice_purple_背景切换'});
const displayHeaders={'Content-Type':'video/h264','X-Preview-Revision':String(displayBase.revision),'X-Candidate-Id':displayBase.candidate.id};
await adapter.api(`/api/preview/${displayBase.id}/video`,{method:'POST',headers:displayHeaders,body:new Blob(['display-video'],{type:'video/h264'})});
const displayBefore=await storage.get(displayBase.id),displayRenders=renders;
const changedBackground=await post(`/api/preview/${displayBase.id}/settings`,{expectedRevision:1,previewGrade:'green'}),displayAfter=await storage.get(displayBase.id);
assert.equal(changedBackground.id,displayBase.id);assert.equal(changedBackground.revision,2);assert.notEqual(changedBackground.candidate.id,displayBase.candidate.id);
assert.equal(changedBackground.grade,'purple');assert.equal(changedBackground.previewGrade,'green');assert.equal(changedBackground.candidate.template,'purple');assert.equal(changedBackground.candidate.previewGrade,'green');assert.equal(changedBackground.kind,'purple-gyro');assert.equal(changedBackground.resourceName,'dice_purple_背景切换');
assert.equal(renders,displayRenders);assert.equal(changedBackground.video,null);
for(const key of ['runtime','files','audio','anchor','video'])assert.deepEqual(displayAfter[key],displayBefore[key]);
assert.deepEqual(changedBackground.candidate.json,displayBase.candidate.json);
for(const key of ['atlas','texture','icon'])assert.equal(changedBackground.candidate[key],displayBase.candidate[key]);
await compactBundle(await adapter.api(`/api/preview/${displayBase.id}/bundle`),displayAfter);
await rejects(()=>adapter.api(`/api/preview/${displayBase.id}/video`,{method:'POST',headers:displayHeaders,body:new Blob(['late-display-video'],{type:'video/h264'})}),409);
const retainedBackground=await post(`/api/preview/${displayBase.id}/settings`,{expectedRevision:2,name:'背景更名'});
assert.equal(retainedBackground.previewGrade,'green');assert.equal(retainedBackground.candidate.previewGrade,'green');assert.equal(retainedBackground.candidate.template,'purple');assert.equal(renders,displayRenders);
const displayStable=await storage.get(displayBase.id),displayWrites=storage.writes;
for(const values of [{expectedRevision:1,previewGrade:'purple'},{expectedRevision:3,grade:'green'},{expectedRevision:3,previewGrade:'invalid'}])await assert.rejects(()=>post(`/api/preview/${displayBase.id}/settings`,values));
storage.fail=true;try{await assert.rejects(()=>post(`/api/preview/${displayBase.id}/settings`,{expectedRevision:3,previewGrade:'purple'}));}finally{storage.fail=false;}
assert.equal(storage.writes,displayWrites);assert.deepEqual(await storage.get(displayBase.id),displayStable);
const purpleRestored=await restored.api(`/api/preview/${displayBase.id}`);assert.equal(purpleRestored.previewGrade,'green');assert.equal(purpleRestored.grade,'purple');assert.equal(purpleRestored.kind,'purple-gyro');
checks.push('purple_preview_background_switch_preserves_source_grade_native_JSON_assets_prefix_and_audio_anchor_with_old_video_invalidated_and_CAS_failures_atomic');

const legacyBackground={...structuredClone(displayStable),id:'5'.repeat(32),candidateId:'6'.repeat(32),revision:8};delete legacyBackground.previewGrade;
storage.records.set(legacyBackground.id,structuredClone(legacyBackground));
const legacyWrites=storage.writes,legacyView=await adapter.api(`/api/preview/${legacyBackground.id}`);
assert.equal(legacyView.previewGrade,'purple');assert.equal(legacyView.candidate.previewGrade,'purple');
const legacyNoop=await post(`/api/preview/${legacyBackground.id}/settings`,{expectedRevision:8,previewGrade:'purple'});
assert.equal(legacyNoop.revision,8);assert.equal(storage.writes,legacyWrites);assert.deepEqual(await storage.get(legacyBackground.id),legacyBackground);
checks.push('legacy_sessions_without_preview_grade_default_to_source_grade_without_migration_or_noop_revision');

const decodeStart=decodeNames.length,explicitFaces=await post('/api/preview/import',{...payload,name:'完整面免重复识别',composition:'faces'}),explicitRecord=await storage.get(explicitFaces.id),explicitRenders=renders;
assert.equal(decodeNames.slice(decodeStart).filter(name=>/^sz_[1-6]\.png$/.test(name)).length,0,'Explicit complete faces go directly to native validation instead of a duplicate alpha decode');
assert.ok(explicitRecord.files.filter(file=>/^sz_[1-6]$/.test(file.slot)).every(file=>file.alphaArea===null));
await post(`/api/preview/${explicitFaces.id}/settings`,{expectedRevision:1,previewGrade:'green'});
assert.equal(decodeNames.slice(decodeStart).filter(name=>/^sz_[1-6]\.png$/.test(name)).length,0);assert.equal(renders,explicitRenders);
const scanStart=decodeNames.length,automaticFaces=await post(`/api/preview/${explicitFaces.id}/settings`,{expectedRevision:2,composition:'auto'});
assert.equal(automaticFaces.resolvedComposition,'faces');assert.equal(decodeNames.slice(scanStart).filter(name=>/^sz_[1-6]\.png$/.test(name)).length,6);assert.equal(renders,explicitRenders);
const scanned=await storage.get(explicitFaces.id);assert.ok(scanned.files.filter(file=>/^sz_[1-6]$/.test(file.slot)).every(file=>file.alphaArea===16000));
for(const item of scanned.files)assert.deepEqual(Buffer.from(await item.blob.arrayBuffer()),Buffer.from(files.find(file=>file.name===item.name).data.split(',')[1],'base64'));
const cachedScan=decodeNames.length;await post(`/api/preview/${explicitFaces.id}/settings`,{expectedRevision:3,previewGrade:'purple'});assert.equal(decodeNames.length,cachedScan);
const deferredDigits=await post('/api/preview/import',{...payload,name:'延迟自动识别数字',composition:'faces'}),digitRenders=renders;
smallDigits=true;let autoDigits;try{autoDigits=await post(`/api/preview/${deferredDigits.id}/settings`,{expectedRevision:1,composition:'auto'});}finally{smallDigits=false;}
assert.equal(autoDigits.resolvedComposition,'digits');assert.equal(renders,digitRenders+1);assert.equal((await storage.get(deferredDigits.id)).runtime.metadata.composition,'digits');
checks.push('explicit_faces_skip_six_duplicate_alpha_decodes_background_edits_stay_fast_and_later_auto_scans_once_with_original_bytes_and_digit_detection_preserved');

// Reference 05 previews and downloads use the already generated binary.
// A rename or preview-only background edit must not rebake that runtime.
let referenceBuilds=0;
const referenceAdapter=createLocalPreview({
  ...dependencies, storage:memoryStore(), renderPurpleGyro:undefined,
  async renderPurpleReference(_files,options) {
    referenceBuilds++;
    const fixture=nativeRuntimeFixture(options);
    fixture.json.skeleton.images='./res/';
    fixture.json.skeleton.audio='./sound/';
    return {
      ...fixture, kind:'purple-reference',
      skel:new Blob([writeSpineBinary(fixture.json)],{type:'application/octet-stream'}),
      metadata:{...fixture.metadata,motionVersion:PURPLE_REFERENCE_MOTION_VERSION},
    };
  },
});
const importedReference=await referenceAdapter.api('/api/preview/import',{method:'POST',body:payload});
assert.equal(importedReference.kind,'purple-reference');
const referenceBinary=urlBlobs.get(importedReference.candidate.skel);
assert.ok(referenceBinary instanceof Blob);
const renamedReference=await referenceAdapter.api(`/api/preview/${importedReference.id}/settings`,{
  method:'POST',body:{expectedRevision:1,name:'原版 05 飞机',previewGrade:'green'},
});
assert.equal(referenceBuilds,1);
assert.equal(renamedReference.candidate.skel,importedReference.candidate.skel);
assert.equal(renamedReference.candidate.texture,importedReference.candidate.texture);
const referenceZip=await referenceAdapter.api(`/api/preview/${importedReference.id}/bundle`);
assert.match(referenceZip.name,/^dice_purple_/);
const decodedReferenceZip=await JSZip.loadAsync(new Uint8Array(await urlBlobs.get(referenceZip.url).arrayBuffer()),{checkCRC32:true});
const referenceBase=`${referenceZip.name}/${referenceZip.name}`;
assert.deepEqual(await decodedReferenceZip.file(referenceBase+'.skel').async('uint8array'),new Uint8Array(await referenceBinary.arrayBuffer()));
assert.deepEqual(await decodedReferenceZip.file(referenceBase+'.png').async('uint8array'),
  new Uint8Array(await urlBlobs.get(renamedReference.candidate.texture).arrayBuffer()));
const packagedAtlas=await decodedReferenceZip.file(referenceBase+'.atlas').async('string');
const previewAtlas=await urlBlobs.get(renamedReference.candidate.atlas).text();
assert.equal(packagedAtlas,previewAtlas.replace(/^[^\r\n]+/,referenceZip.name+'.png'));
assert.equal(referenceBuilds,1);
referenceAdapter.dispose();
checks.push('reference05_preview_download_reuse_identical_native_binary_and_texture_after_name_and_background_changes');

const temporaryDependencies={...dependencies,storage:undefined};
const currentPage=createLocalPreview(temporaryDependencies);
const initialUpload=await currentPage.api('/api/preview/import',{method:'POST',body:payload});
const repeatedUpload=await currentPage.api('/api/preview/import',{method:'POST',body:payload});
currentPage.forget(initialUpload.id);
assert.equal(urlBlobs.has(initialUpload.candidate.texture),false);
assert.equal(urlBlobs.has(repeatedUpload.candidate.texture),true);
await rejects(()=>currentPage.api(`/api/preview/${initialUpload.id}`),404);
assert.equal((await currentPage.api(`/api/preview/${repeatedUpload.id}`)).id,repeatedUpload.id);
const reloadedPage=createLocalPreview(temporaryDependencies);
await rejects(()=>reloadedPage.api(`/api/preview/${repeatedUpload.id}`),404);
currentPage.forget(repeatedUpload.id);
assert.equal(urlBlobs.has(repeatedUpload.candidate.texture),false);
checks.push('default_sessions_are_page_local_and_discarding_a_preview_releases_its_record_and_blob_urls');

adapter.dispose();restored.dispose();assert.equal(urlBlobs.size,0);
console.log(JSON.stringify({ok:true,count:checks.length,checks,limits:'Pure session/PNG/ZIP/CAS logic with injected Canvas. Real browser Canvas, Spine and video module require browser QA.'},null,2));
