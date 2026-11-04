// Browser image normalization remains real-browser QA; JSON, PNG, persistence,
// source bytes, audio/anchor contracts and ZIP are exercised here without mocks of those formats.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {deflateSync} from 'node:zlib';
import {createLocalPreview,validateSixFaceFiles,GREEN_SLOTS,VIDEO_PROFILE} from '../dice/local-preview.mjs';
import {buildSpineAssets} from '../dice/six-face/spine-builder.mjs';
import {CanvasSpineRenderer} from '../dice/six-face/canvas-spine.mjs';
const checks=[],crcTable=Uint32Array.from({length:256},(_,n)=>{for(let k=0;k<8;k++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
function chunk(type,data=Buffer.alloc(0)){
 const bytes=Buffer.concat([Buffer.from(type),data]),result=Buffer.alloc(data.length+12);result.writeUInt32BE(data.length);bytes.copy(result,4);let crc=0xffffffff;
 for(const byte of bytes)crc=crcTable[(crc^byte)&255]^(crc>>>8);result.writeUInt32BE((crc^0xffffffff)>>>0,result.length-4);return result;
}
function png(size=200,empty=false){
 const header=Buffer.alloc(13);header.writeUInt32BE(size);header.writeUInt32BE(size,4);header.set([8,6,0,0,0],8);
 const data=Buffer.alloc((size*4+1)*size);
 for(let y=35;y<Math.min(166,size);y++)for(let x=35;x<Math.min(166,size);x++)data.set([34,150,215,empty?0:255],y*(size*4+1)+1+x*4);
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(data)),chunk('IEND')]);
}
const allocated=[],clearCalls=[];
globalThis.document={createElement(){const image={width:0,height:0,getContext(){return {
 drawImage(){},beginPath(){},ellipse(){},fill(){},fillRect(){},save(){},restore(){},moveTo(){},lineTo(){},closePath(){},clip(){},setTransform(){},
 clearRect(...args){clearCalls.push(args);},getImageData(){const data=new Uint8ClampedArray(image.width*image.height*4);for(let i=0;i<data.length;i+=4)data.set([34,150,215,255],i);return {data};}
 };}};allocated.push(image);return image;}};
const context={console};vm.createContext(context);vm.runInContext(await readFile(new URL('../dice/vendor/spine-webgl.js',import.meta.url),'utf8'),context);const S=context.spine;
const zipContext={setTimeout,clearTimeout,setImmediate,Uint8Array,ArrayBuffer};vm.createContext(zipContext);
vm.runInContext(await readFile(new URL('../vendor/jszip-3.10.1.min.js',import.meta.url),'utf8'),zipContext);const JSZip=zipContext.JSZip;
const records=new Map(),urls=new Map();let serial=0,writes=0,failBuild=false,failWrite=false,failOptionalDecode=false,renderCount=0,lastVideoOptions;
const storage={async get(id){return structuredClone(records.get(id));},async put(record,expected=null){
 if(failWrite)throw Error('quota');const previous=records.get(record.id);
 if(expected===null?Boolean(previous):previous.revision!==expected.revision||previous.candidateId!==expected.candidateId)throw Object.assign(Error('stale'),{status:409});
 records.set(record.id,structuredClone(record));writes++;
}};
const prepared={sourceSize:200,crop:[35,35,131,131],cropOffset:[.5,.5],normalization:{resampled:false},landingImages:{},textures:{}};
for(let p=1;p<=6;p++){prepared.landingImages[p]={width:200,height:200};prepared.textures[p]={width:131,height:131};}
const deps={storage,uuid:()=>String(++serial).padStart(32,'0'),videoAvailable:true,
 createObjectURL:blob=>{const key='blob:green-'+(++serial);urls.set(key,blob);return key;},revokeObjectURL:key=>urls.delete(key),
 decodePNG:async(blob,name)=>{if(failOptionalDecode&&/^(?:icon|sz_0)\.png$/.test(name))throw Error('injected optional decode failure');return {alphaArea:16000,close(){}};},
 renderSixFace:async(files,options)=>{renderCount++;if(failBuild)throw Error('injected six-face build failure');
  assert.equal(files.filter(file=>GREEN_SLOTS.includes(file.slot)).length,6);
  const assets=await buildSpineAssets(prepared,options);return {kind:'six-face',json:assets.json,atlasText:assets.atlasText,texture:assets.textureBlob,atlasPage:assets.atlasPage,
   geometry:{sourceSize:200,crop:[35,35,131,131],cropOffset:[.5,.5],normalization:{resampled:false}},warnings:['fixture warning'],files:assets.files,metadata:assets.metadata};
 },
 fetchAsset:async path=>new Blob([path.endsWith('.png')?png(30,true):Buffer.from('ID3-default-audio')],{type:path.endsWith('.png')?'image/png':'audio/mpeg'}),
 zipFactory:async()=>{const entries=new Map();return {file(name,value){entries.set(name,value);},async generateAsync(){const zip=new JSZip();for(const [name,value]of entries)zip.file(name,value instanceof Blob?new Uint8Array(await value.arrayBuffer()):value);return new Blob([await zip.generateAsync({type:'uint8array'})],{type:'application/zip'});}};},
 prepareVideo:async(input,options)=>{lastVideoOptions=options;const blob=new Blob(['MP4-contract'],{type:'video/mp4'});Object.defineProperty(blob,'videoInfo',{value:{width:720,height:1600,duration:6,fps:30,frameCount:180}});return blob;}
};
const adapter=createLocalPreview(deps),post=(path,body,extra={})=>adapter.api(path,{method:'POST',body,...extra});
const required=GREEN_SLOTS.map(slot=>new File([png()],slot+'.png',{type:'image/png'}));
const payload={name:'六面海龟',grade:'green',mode:'all',point:1,composition:'auto',files:required};
assert.equal(validateSixFaceFiles(required).length,6);
for(const files of [required.slice(1),[...required,required[0]]])assert.throws(()=>validateSixFaceFiles(files));
assert.equal(validateSixFaceFiles([...required,{name:'1.png'}])[0].name,'sz_1.png');
const first=await post('/api/preview/import',payload),stored=await storage.get(first.id);
assert.equal(first.kind,'six-face');assert.equal(first.candidate.kind,'six-face');assert.equal(first.candidate.atlasPage,'dice.png');assert.equal(first.candidate.json.skeleton.spine,'4.2.43');
assert.equal(first.needsUpload,false);assert.equal(first.files.length,6);assert.equal(first.candidate.icon,first.candidate.png.sz_1);assert.equal(first.candidate.png['大骰子'],first.candidate.png.sz_1);
assert.deepEqual(first.candidate.geometry,{sourceSize:200,crop:[35,35,131,131],cropOffset:[.5,.5],normalization:{resampled:false}});
assert.deepEqual(first.candidate.warnings,['fixture warning']);assert.equal(first.soundEnabled,true);assert.equal(first.candidate.audio.dice_roll,'/dice/assets/audio/dice_roll.mp3');
assert.equal(first.audio.dice_roll.default,true);assert.equal(first.anchor.hidden,true);
assert.equal(stored.runtime.metadata.zoomPeak,1.3);assert.doesNotThrow(()=>structuredClone(stored));
for(const file of first.files)assert.deepEqual(new Uint8Array(await urls.get(file.url).arrayBuffer()),new Uint8Array(await required.find(input=>input.name===file.name).arrayBuffer()));
checks.push('six_native_files_preserved_geometry_is_serializable_icon_fallback_and_public_audio_anchor_contract');

const atlas=new S.TextureAtlas(stored.runtime.atlasText),data=new S.SkeletonJson(new S.AtlasAttachmentLoader(atlas)).readSkeletonData(stored.runtime.json);
assert.equal(data.animations.length,12);assert.equal(data.slots[0].name,'anchor');assert.equal(data.slots[0].boneData.name,'root');assert.equal(data.slots[0].color.a,0);
assert.deepEqual(Object.keys(stored.runtime.json.events),['dice_roll','sound_ui_dice6']);assert.equal(stored.runtime.json.skeleton.audio,'./audio/');
for(let point=1;point<=6;point++){
 assert.deepEqual(stored.runtime.json.animations['spin_'+point].events,[{time:0,name:'dice_roll'},...(point===6?[{time:.6,name:'sound_ui_dice6'}]:[])]);
 for(const [time,scale]of [[0,1],[.3,1.3],[.6,1],[.633333,1]]){
  const skeleton=new S.Skeleton(data);skeleton.setToSetupPose();data.findAnimation('spin_'+point).apply(skeleton,-1,time,false,null,1,S.MixBlend.replace,S.MixDirection.mixIn);skeleton.updateWorldTransform(S.Physics.update);
  assert.equal(skeleton.drawOrder[0].data.name,'anchor');assert.equal(skeleton.findSlot('anchor').color.a,0);assert.equal(skeleton.findSlot('anchor').getAttachment().color.a,0);
  assert.ok(Math.abs(skeleton.findBone('daxiao_1').scaleX-scale)<1e-6);assert.ok(Math.abs(skeleton.findBone('shadow_size').scaleX-scale)<1e-6);
 }
}
const software=new CanvasSpineRenderer(atlas,{},{width:720,height:1600}),skeleton=new S.Skeleton(data);skeleton.setToSetupPose();data.findAnimation('spin_1').apply(skeleton,-1,.3,false,null,1,S.MixBlend.replace,S.MixDirection.mixIn);skeleton.updateWorldTransform(S.Physics.update);
software.draw({save(){},restore(){},drawImage(){}},skeleton,1600);assert.ok(clearCalls.some(call=>call[2]===720&&call[3]===1600));software.dispose();
checks.push('official_42_runtime_loads_12_animations_hidden_root_anchor_depth_order_events_and_13_zoom_with_sized_canvas_fallback');

const originalRecord=structuredClone(await storage.get(first.id));
await assert.rejects(()=>post(`/api/preview/${first.id}/settings`,{expectedRevision:1,grade:'purple'}),error=>error.status===409&&error.payload.needsUpload&&error.payload.required.length===10);
assert.deepEqual(await storage.get(first.id),originalRecord);
const renamed=await post(`/api/preview/${first.id}/settings`,{expectedRevision:1,name:'海龟更名',soundEnabled:false});
assert.equal(renamed.revision,2);assert.equal(renamed.soundEnabled,false);assert.equal(renderCount,1);
for(const key of ['atlas','texture','icon'])assert.equal(renamed.candidate[key],first.candidate[key]);
assert.deepEqual(renamed.candidate.json,first.candidate.json);
await assert.rejects(()=>post(`/api/preview/${first.id}/settings`,{expectedRevision:1,name:'stale'}),error=>error.status===409);
const video=await adapter.api(`/api/preview/${first.id}/video`,{method:'POST',headers:{'X-Preview-Revision':'2','X-Candidate-Id':renamed.candidate.id},body:new Blob(['H264'],{type:'video/h264'})});
assert.equal(video.profile,VIDEO_PROFILE);assert.equal(lastVideoOptions.soundEnabled,false);assert.deepEqual(lastVideoOptions.audio,renamed.candidate.audio);
const refresh=createLocalPreview(deps),restored=await refresh.api('/api/preview/'+first.id);assert.deepEqual(restored.candidate.json,renamed.candidate.json);assert.equal(restored.candidate.id,renamed.candidate.id);
checks.push('grade_change_requires_upload_name_and_sound_settings_preserve_runtime_urls_refresh_and_video_audio_options');

const extras=[new File([png(240)],'大骰子.png',{type:'image/png'}),new File([png()],'sz_0.png',{type:'image/png'}),new File([png(30,true)],'anchor.png',{type:'image/png'}),
 new File(['ID3-roll-original'],'dice_roll.mp3',{type:'audio/mpeg'}),new File(['ID3-six-original'],'sound_ui_dice6.mp3',{type:'audio/mpeg'})];
const custom=await post('/api/preview/import',{...payload,name:'带附件',files:Object.fromEntries([...required,...extras].map(file=>[file.name,file]))});
assert.equal(custom.files.length,9);assert.equal(custom.candidate.icon,custom.candidate.png['大骰子']);assert.equal(custom.audio.dice_roll.default,false);assert.equal(custom.anchor.default,undefined);
assert.deepEqual(new Uint8Array(await urls.get(custom.candidate.audio.dice_roll).arrayBuffer()),new Uint8Array(await extras[3].arrayBuffer()));
const customBundle=await adapter.api('/api/preview/'+custom.id+'/bundle'),zip=await JSZip.loadAsync(new Uint8Array(await urls.get(customBundle.url).arrayBuffer()));
for(const file of [...required,...extras.filter(file=>file.name.endsWith('.png'))])assert.deepEqual(new Uint8Array(await zip.file('res/'+file.name).async('uint8array')),new Uint8Array(await file.arrayBuffer()));
for(const file of extras.filter(file=>file.name.endsWith('.mp3')))assert.deepEqual(new Uint8Array(await zip.file('audio/'+file.name).async('uint8array')),new Uint8Array(await file.arrayBuffer()));
for(const path of ['dice.json','dice.atlas','dice.png','images/flat_6.png','images/roll_6.png','build-info.json','manifest.json','README.txt','sound-timeline.json'])assert.ok(zip.file(path),path);
assert.equal(zip.file('dice.skel'),null);assert.equal(zip.file('dice.spine'),null);
assert.equal(JSON.parse(await zip.file('preview.json').async('string')).anchor.hidden,true);
const defaultBundle=await adapter.api('/api/preview/'+first.id+'/bundle'),defaultZip=await JSZip.loadAsync(new Uint8Array(await urls.get(defaultBundle.url).arrayBuffer()));
assert.ok(defaultZip.file('audio/dice_roll.mp3')&&defaultZip.file('audio/sound_ui_dice6.mp3')&&defaultZip.file('res/anchor.png')&&defaultZip.file('preview.mp4'));
checks.push('optional_zero_hero_anchor_and_two_original_mp3s_preserved_in_green_zip_with_real_spine_files_and_defaults');

const aliases=['ＳＺ＿１.ＰＮＧ','sz2.png','face3.png','FACE_4.PNG','face-5.png','6.png'].map(name=>new File([png()],name,{type:'image/png'}));
const aliasFiles=[...aliases,new File([png()],'sz_2.png',{type:'image/png'}),new File([png(240)],'icon.png',{type:'image/png'}),new File([png(240)],'大骰子.png',{type:'image/png'})];
const aliasSession=await post('/api/preview/import',{...payload,name:'别名骰面',files:aliasFiles});
assert.equal(aliasSession.files.find(file=>file.slot==='sz_1').name,'ＳＺ＿１.ＰＮＧ');assert.equal(aliasSession.files.find(file=>file.slot==='sz_2').name,'sz_2.png');
assert.equal(aliasSession.files.find(file=>file.slot==='sz_6').name,'6.png');assert.equal(aliasSession.files.find(file=>file.slot==='大骰子').name,'icon.png');
assert.ok(aliasSession.warnings.some(text=>text.includes('优先采用'))&&aliasSession.warnings.some(text=>text.includes('数字文件名')));
for(const file of aliasSession.files)assert.deepEqual(new Uint8Array(await urls.get(file.url).arrayBuffer()),new Uint8Array(await aliasFiles.find(input=>input.name===file.name).arrayBuffer()));
const badOptionals=[new File(['broken hero'],'icon.png',{type:'image/png'}),new File(['broken zero'],'sz_0.png',{type:'image/png'})];
const fallback=await post('/api/preview/import',{...payload,files:[...required,...badOptionals]});
assert.equal(fallback.files.length,6);assert.equal(fallback.candidate.icon,fallback.candidate.png.sz_1);assert.ok(fallback.warnings.filter(text=>text.includes('已忽略')).length>=2);
failOptionalDecode=true;let decodeFallback;
try{decodeFallback=await post('/api/preview/import',{...payload,files:[...required,new File([png(240)],'icon.png'),new File([png()],'sz_0.png')]});}finally{failOptionalDecode=false;}
assert.equal(decodeFallback.files.length,6);assert.equal(decodeFallback.candidate.icon,decodeFallback.candidate.png.sz_1);assert.ok(decodeFallback.warnings.some(text=>text.includes('decode failure')));
const duplicateHero=await post('/api/preview/import',{...payload,files:[...required,new File([png(240)],'icon.png'),new File([png(240)],'icon.png')]});
assert.equal(duplicateHero.files.length,6);assert.ok(duplicateHero.warnings.some(text=>text.includes('重复')));
checks.push('api_accepts_nfkc_sz_face_and_digit_aliases_canonical_priority_preserves_original_names_and_optional_corrupt_or_duplicate_hero_zero_fall_back');

const snapshot=structuredClone([...records]),writeCount=writes;
failBuild=true;await assert.rejects(()=>post('/api/preview/import',payload),/six-face build failure/);failBuild=false;
failWrite=true;await assert.rejects(()=>post('/api/preview/import',payload),/quota/);failWrite=false;
const controller=new AbortController();controller.abort();await assert.rejects(()=>post('/api/preview/import',payload,{signal:controller.signal}),{name:'AbortError'});
await assert.rejects(()=>post('/api/preview/import',{...payload,files:required.slice(1)}));
await assert.rejects(()=>post('/api/preview/import',{...payload,files:[...required,new File(['bad'],'dice_roll.mp3')]}));
assert.equal(writes,writeCount);assert.deepEqual([...records],snapshot);
adapter.dispose();refresh.dispose();assert.equal(urls.size,0);
checks.push('missing_faces_bad_audio_cancel_build_or_storage_failure_leave_all_previous_sessions_unchanged');
console.log(JSON.stringify({ok:true,count:checks.length,checks,boundary:'Real JSON/PNG/ZIP/session contracts and official Runtime; Canvas sampling uses injected pixels, actual browser/IndexedDB/audio rendering require browser QA.'},null,2));
