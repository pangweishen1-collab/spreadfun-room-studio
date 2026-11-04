// Browser image normalization remains real-browser QA; JSON, PNG, persistence,
// source bytes, audio/anchor contracts and ZIP are exercised here without mocks of those formats.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {deflateSync,inflateSync} from 'node:zlib';
import {createLocalPreview,validateSixFaceFiles,GREEN_SLOTS,VIDEO_PROFILE,resourceName} from '../dice/local-preview.mjs';
import {buildSpineAssets} from '../dice/six-face/spine-builder.mjs';
import {CanvasSpineRenderer} from '../dice/six-face/canvas-spine.mjs';
const checks=[],crcTable=Uint32Array.from({length:256},(_,n)=>{for(let k=0;k<8;k++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
function chunk(type,data=Buffer.alloc(0)){
 const bytes=Buffer.concat([Buffer.from(type),data]),result=Buffer.alloc(data.length+12);result.writeUInt32BE(data.length);bytes.copy(result,4);let crc=0xffffffff;
 for(const byte of bytes)crc=crcTable[(crc^byte)&255]^(crc>>>8);result.writeUInt32BE((crc^0xffffffff)>>>0,result.length-4);return result;
}
function png(size=200,empty=false,color=[34,150,215]){
 const header=Buffer.alloc(13);header.writeUInt32BE(size);header.writeUInt32BE(size,4);header.set([8,6,0,0,0],8);
 const data=Buffer.alloc((size*4+1)*size);
 const start=size===30?0:35,end=size===30?30:Math.min(166,size);
 for(let y=start;y<end;y++)for(let x=start;x<end;x++)data.set([...color,empty?0:255],y*(size*4+1)+1+x*4);
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(data)),chunk('IEND')]);
}
function rgbaPNG(bytes){
 const b=Buffer.from(bytes),width=b.readUInt32BE(16),height=b.readUInt32BE(20),parts=[];
 assert.equal(b[24],8);assert.equal(b[25],6);assert.equal(b[28],0);
 for(let at=8;at+12<=b.length;){const length=b.readUInt32BE(at),type=b.toString('ascii',at+4,at+8);if(type==='IDAT')parts.push(b.subarray(at+8,at+8+length));at+=length+12;}
 const rows=inflateSync(Buffer.concat(parts)),data=new Uint8Array(width*height*4);
 assert.equal(rows.length,(width*4+1)*height);
 for(let y=0;y<height;y++){const at=y*(width*4+1);assert.equal(rows[at],0,'Fixture/raw RGBA encoder uses PNG filter0');data.set(rows.subarray(at+1,at+1+width*4),y*width*4);}
 return {width,height,data};
}
const DEFAULT_ANCHOR_COLOR=[42,80,120],CUSTOM_ANCHOR_COLOR=[230,100,35],allocated=[],clearCalls=[],anchorDraws=[],decodedAnchors=[];
globalThis.document={createElement(){const image={width:0,height:0,getContext(){return {
 drawImage(source){image.drawn=source;if(source.fixturePixels)anchorDraws.push(source);},beginPath(){},ellipse(){},fill(){},fillRect(){},save(){},restore(){},moveTo(){},lineTo(){},closePath(){},clip(){},setTransform(){},
 clearRect(...args){clearCalls.push(args);},getImageData(){if(image.drawn?.fixturePixels){assert.equal(image.width,30);assert.equal(image.height,30);return {data:new Uint8ClampedArray(image.drawn.fixturePixels)};}const data=new Uint8ClampedArray(image.width*image.height*4);for(let i=0;i<data.length;i+=4)data.set([34,150,215,255],i);return {data};}
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
 decodePNG:async(blob,name)=>{
  if(failOptionalDecode&&/^(?:icon|sz_0)\.png$/.test(name))throw Error('injected optional decode failure');
  if(name==='anchor.png'){
   const raw=rgbaPNG(await blob.arrayBuffer()),drawable={width:raw.width,height:raw.height,fixturePixels:raw.data,closed:false};decodedAnchors.push(drawable);
   return {alphaArea:raw.data.filter((value,index)=>index%4===3&&value>=16).length,drawable,close(){drawable.closed=true;}};
  }
  return {alphaArea:16000,close(){}};
 },
 renderSixFace:async(files,options)=>{renderCount++;if(failBuild)throw Error('injected six-face build failure');
  assert.equal(files.filter(file=>GREEN_SLOTS.includes(file.slot)).length,6);
  assert.equal(options.anchorImage,decodedAnchors[decodedAnchors.length-1]);assert.equal(options.anchorImage.closed,false);assert.equal(options.anchorImage.width,30);assert.equal(options.anchorImage.height,30);
  const assets=await buildSpineAssets(prepared,options);return {kind:'six-face',json:assets.json,atlasText:assets.atlasText,texture:assets.textureBlob,atlasPage:assets.atlasPage,
   geometry:{sourceSize:200,crop:[35,35,131,131],cropOffset:[.5,.5],normalization:{resampled:false}},warnings:['fixture warning'],files:assets.files,metadata:assets.metadata};
 },
 fetchAsset:async path=>new Blob([path.endsWith('.png')?png(30,false,DEFAULT_ANCHOR_COLOR):Buffer.from('ID3-default-audio')],{type:path.endsWith('.png')?'image/png':'audio/mpeg'}),
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
assert.equal(first.needsUpload,false);assert.equal(first.files.length,6);assert.equal(first.candidate.icon,null);assert.equal(first.heroMissing,true);assert.equal(first.candidate.png['大骰子'],undefined);
assert.deepEqual(first.candidate.geometry,{sourceSize:200,crop:[35,35,131,131],cropOffset:[.5,.5],normalization:{resampled:false}});
assert.deepEqual(first.candidate.warnings,['fixture warning']);assert.equal(first.soundEnabled,true);assert.equal(first.candidate.audio.dice_roll,'/dice/assets/audio/dice_roll.mp3');
assert.equal(first.audio.dice_roll.default,true);assert.equal(first.anchor.hidden,true);
assert.equal(stored.runtime.metadata.zoomPeak,1.3);assert.doesNotThrow(()=>structuredClone(stored));
assert.equal(stored.runtime.metadata.staticImages,14);
assert.equal(stored.runtime.metadata.motionVersion,'flat-handoff-v2');
for(const file of first.files)assert.deepEqual(new Uint8Array(await urls.get(file.url).arrayBuffer()),new Uint8Array(await required.find(input=>input.name===file.name).arrayBuffer()));
checks.push('six_native_files_preserved_geometry_is_serializable_missing_hero_is_explicit_and_public_audio_anchor_contract');

const atlas=new S.TextureAtlas(stored.runtime.atlasText),data=new S.SkeletonJson(new S.AtlasAttachmentLoader(atlas)).readSkeletonData(stored.runtime.json);
assert.equal(data.animations.length,12);assert.equal(data.slots[0].name,'anchor');assert.equal(data.slots[0].boneData.name,'root');assert.equal(data.slots[0].color.a,0);
assert.deepEqual(Object.keys(stored.runtime.json.events),['dice_roll','sound_ui_dice6']);assert.equal(stored.runtime.json.skeleton.audio,'./audio/');
function pose(point,time){
 const skeleton=new S.Skeleton(data);data.findAnimation('spin_'+point).apply(skeleton,-1,time,false,null,1,S.MixBlend.replace,S.MixDirection.mixIn);skeleton.updateWorldTransform(S.Physics.update);return skeleton;
}
function worldVertices(slot){
 const attachment=slot.getAttachment(),vertices=new Float32Array(attachment instanceof S.MeshAttachment?attachment.worldVerticesLength:8);
 if(attachment instanceof S.MeshAttachment)attachment.computeWorldVertices(slot,0,vertices.length,vertices,0,2);else attachment.computeWorldVertices(slot,vertices,0,2);
 for(const value of vertices)assert.ok(Number.isFinite(value));return vertices;
}
function assertLandedPlane(skeleton,point){
 const slot=skeleton.findSlot('face_'+point),attachment=slot.getAttachment(),result=skeleton.findSlot('result'),flat=result.getAttachment(),vertices=worldVertices(slot),bone=result.bone;
 assert.equal(attachment.name,'landed_'+point);assert.equal(attachment.path,'flat_'+point);assert.equal(flat.path,'flat_'+point);
 assert.equal(slot.color.a,1);assert.equal(result.color.a,0);assert.equal(skeleton.findSlot('shadow').color.a,0);
 for(const channel of ['r','g','b'])assert.ok(Math.abs(slot.color[channel]-1)<1e-6,'Landed face retains the original untinted image');
 for(let i=0;i<attachment.regionUVs.length;i+=2){
  const x=flat.x+(attachment.regionUVs[i]-.5)*flat.width*flat.scaleX,y=flat.y+(.5-attachment.regionUVs[i+1])*flat.height*flat.scaleY;
  // Generated mesh vertices retain the rig's existing .01-unit quantization.
  assert.ok(Math.abs(vertices[i]-(bone.a*x+bone.b*y+bone.worldX))<.006,'Landed mesh matches flat UV world X');
  assert.ok(Math.abs(vertices[i+1]-(bone.c*x+bone.d*y+bone.worldY))<.006,'Landed mesh matches flat UV world Y');
 }
 for(let other=1;other<=6;other++)if(other!==point)assert.equal(skeleton.findSlot('face_'+other).color.a,0);
}
for(let point=1;point<=6;point++){
 const before=pose(point,.549999).findSlot('face_'+point),at=pose(point,.550001).findSlot('face_'+point);
 assert.equal(before.getAttachment().name,'mesh_'+point);assert.equal(at.getAttachment().name,'landed_'+point);
 const left=worldVertices(before),right=worldVertices(at);assert.equal(left.length,right.length);
 for(let i=0;i<left.length;i++)assert.ok(Math.abs(left[i]-right[i])<.01,'Changing the face attachment preserves its projected position');
 for(const time of [.550001,.575,.583333,.591667,.595,.599999]){
  const skeleton=pose(point,time);assert.equal(skeleton.findSlot('result').color.a,0,'No result/mesh crossfade during landing');
  assert.equal(skeleton.findSlot('face_'+point).getAttachment().name,'landed_'+point);
  if(time>=.591667)assertLandedPlane(skeleton,point);
 }
 // Frame times are stored as Float32 by the official Runtime. At the exact
 // JS .6 boundary either identical representation may own the frame.
 const boundary=pose(point,.6),boundaryAlpha=boundary.findSlot('result').color.a;
 assert.ok(boundaryAlpha===0||boundaryAlpha===1);
 if(boundaryAlpha===0)assertLandedPlane(boundary,point);
 else for(let other=1;other<=6;other++)assert.equal(boundary.findSlot('face_'+other).color.a,0);
 for(const time of [.600001,.608333,.616667,.625,.633333,1.99]){
  const skeleton=pose(point,time);assert.equal(skeleton.findSlot('result').color.a,1);assert.equal(skeleton.findSlot('result').getAttachment().path,'flat_'+point);
  for(let other=1;other<=6;other++)assert.equal(skeleton.findSlot('face_'+other).color.a,0,'The final result is the only visible dice layer');
 }
}
checks.push('landing_attachment_switch_is_continuous_and_becomes_an_untinted_exact_flat_plane_before_atomic_result_handoff_without_double_layers');
for(let point=1;point<=6;point++){
 const skeleton=new S.Skeleton(data),stateData=new S.AnimationStateData(data),next=point%6+1,last=(point+1)%6+1;stateData.defaultMix=0;
 const state=new S.AnimationState(stateData);
 for(const [name,time]of [['spin_'+point,.575],['standby_'+next,0],['spin_'+last,0],['spin_'+last,.3],['spin_'+last,.275]]){
  if(state.getCurrent(0)?.animation.name!==name)state.setAnimation(0,name,false);
  state.update(time);state.apply(skeleton);skeleton.updateWorldTransform(S.Physics.update);
  if(name.startsWith('standby_')||state.getCurrent(0).trackTime<.55){
   for(let face=1;face<=6;face++)assert.equal(skeleton.findSlot('face_'+face).getAttachment().name,'mesh_'+face,'Each action restores rolling attachments without a setup reset');
  }else assert.equal(skeleton.findSlot('face_'+Number(name.split('_')[1])).getAttachment().name,'landed_'+Number(name.split('_')[1]));
  if(name.startsWith('standby_'))assert.equal(skeleton.findSlot('result').getAttachment().path,'flat_'+next);
 }
}
checks.push('official_animation_state_spin_standby_and_next_spin_restore_attachments_without_set_to_setup_pose');
for(let point=1;point<=6;point++){
 assert.deepEqual(stored.runtime.json.animations['spin_'+point].events,[{time:0,name:'dice_roll'},...(point===6?[{time:.6,name:'sound_ui_dice6'}]:[])]);
 for(const [time,scale]of [[0,1],[.3,1.3],[.6,1],[.633333,1]]){
  const skeleton=new S.Skeleton(data);skeleton.setToSetupPose();data.findAnimation('spin_'+point).apply(skeleton,-1,time,false,null,1,S.MixBlend.replace,S.MixDirection.mixIn);skeleton.updateWorldTransform(S.Physics.update);
  assert.equal(skeleton.drawOrder[0].data.name,'anchor');assert.equal(skeleton.findSlot('anchor').color.a,0);assert.equal(skeleton.findSlot('anchor').getAttachment().color.a,0);
  assert.ok(Math.abs(skeleton.findBone('daxiao_1').scaleX-scale)<1e-6);assert.ok(Math.abs(skeleton.findBone('shadow_size').scaleX-scale)<1e-6);
 }
}
function assertRootAnchor(runtime){
 const atlas=new S.TextureAtlas(runtime.atlasText),data=new S.SkeletonJson(new S.AtlasAttachmentLoader(atlas)).readSkeletonData(runtime.json);
 assert.equal(atlas.regions.length,14);assertRootAnchorData(data);
}
function assertRootAnchorData(data){
 assert.equal(data.animations.length,12);
 for(const animation of data.animations){
  const skeleton=new S.Skeleton(data);
  for(const time of [0,.3,.6,.633333,2]){
   animation.apply(skeleton,-1,time,false,null,1,S.MixBlend.replace,S.MixDirection.mixIn);skeleton.updateWorldTransform(S.Physics.update);
   const slot=skeleton.findSlot('anchor'),attachment=slot.getAttachment(),vertices=new Float32Array(8);
   assert.equal(slot.bone.data.name,'root');assert.equal(slot.color.a,0);assert.equal(attachment.path,'anchor');assert.equal(attachment.width,30);assert.equal(attachment.height,30);assert.equal(attachment.scaleX,6);assert.equal(attachment.scaleY,6);assert.equal(attachment.color.a,0);
   attachment.computeWorldVertices(slot,vertices,0,2);const xs=Array.from(vertices).filter((v,i)=>i%2===0),ys=Array.from(vertices).filter((v,i)=>i%2===1);
   assert.ok(Math.abs(Math.max(...xs)-Math.min(...xs)-180)<1e-5);assert.ok(Math.abs(Math.max(...ys)-Math.min(...ys)-180)<1e-5);
   assert.ok(Math.abs((Math.max(...xs)+Math.min(...xs))/2)<1e-5);assert.ok(Math.abs((Math.max(...ys)+Math.min(...ys))/2)<1e-5);
  }
 }
}
async function assertAnchorPixels(runtime,color){
 const loose=rgbaPNG(await runtime.files['images/anchor.png'].arrayBuffer()),page=rgbaPNG(await runtime.texture.arrayBuffer()),region=new S.TextureAtlas(runtime.atlasText).findRegion('anchor');
 assert.deepEqual([loose.width,loose.height,region.width,region.height],[30,30,30,30]);
 for(let at=0;at<loose.data.length;at+=4)assert.deepEqual(Array.from(loose.data.subarray(at,at+4)),[...color,255]);
 for(let y=0;y<30;y++){const at=((region.y+y)*page.width+region.x)*4;assert.deepEqual(page.data.subarray(at,at+120),loose.data.subarray(y*120,(y+1)*120));}
 assertRootAnchor(runtime);
}
await assertAnchorPixels(stored.runtime,DEFAULT_ANCHOR_COLOR);assert.ok(anchorDraws.length);assert(decodedAnchors.every(image=>image.closed));
checks.push('actual_default_anchor_pixels_reach_loose_png_and_atlas_and_all_12_official_runtime_actions_keep_hidden_root_180_square');
async function compactBundle(result,record){
 const name=result.name;assert.equal(name,resourceName(record.name,record.grade));assert.match(name,/^dice_green_/);assert(!name.endsWith('.zip'));
 const zip=await JSZip.loadAsync(new Uint8Array(await urls.get(result.url).arrayBuffer())),root=name+'/';
 const source=record.files.filter(file=>file.slot!=='anchor'),sourcePath=file=>'res/'+(file.slot==='大骰子'?'icon':file.slot)+'.png';
 const expected=[name+'.skel',name+'.atlas',name+'.png',...source.map(sourcePath),'sound/dice_roll.mp3','sound/sound_ui_dice6.mp3'].map(path=>root+path).sort();
 assert.deepEqual(Object.keys(zip.files).filter(path=>!zip.files[path].dir).sort(),expected);
 for(const file of source)assert.deepEqual(await zip.file(root+sourcePath(file)).async('uint8array'),new Uint8Array(await file.blob.arrayBuffer()));
 const atlasText=await zip.file(root+name+'.atlas').async('string');assert.equal(atlasText,record.runtime.atlasText.replace(/^[^\r\n]+/,name+'.png'));
 assert.deepEqual(await zip.file(root+name+'.png').async('uint8array'),new Uint8Array(await record.runtime.texture.arrayBuffer()));
 const atlas=new S.TextureAtlas(atlasText),bytes=await zip.file(root+name+'.skel').async('uint8array');
 const data=new S.SkeletonBinary(new S.AtlasAttachmentLoader(atlas)).readSkeletonData(new Uint8Array(bytes));
 assert.equal(data.version,'4.2.43');assertRootAnchorData(data);assert.equal(data.audioPath,'./sound/');
 for(const event of data.events){const path=(data.audioPath+event.audioPath).replace(/^\.\//,'');assert.equal(path,'sound/'+event.name+'.mp3');assert.ok(zip.file(root+path));}
 assert.deepEqual(Array.from(data.events,event=>event.name),['dice_roll','sound_ui_dice6']);
 for(let point=1;point<=6;point++){
  const skeleton=new S.Skeleton(data),events=[],animation=data.findAnimation('spin_'+point);
  animation.apply(skeleton,-1,animation.duration,false,events,1,S.MixBlend.replace,S.MixDirection.mixIn);
  assert.deepEqual(events.map(event=>event.data.name),['dice_roll',...(point===6?['sound_ui_dice6']:[])]);
 }
 for(const sound of ['dice_roll','sound_ui_dice6'])assert.deepEqual(await zip.file(root+'sound/'+sound+'.mp3').async('uint8array'),new Uint8Array(record.audio?.[sound]?await record.audio[sound].blob.arrayBuffer():Buffer.from('ID3-default-audio')));
 return {zip,root,data};
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

const extras=[new File([png(240)],'大骰子.png',{type:'image/png'}),new File([png()],'sz_0.png',{type:'image/png'}),new File([png(30,false,CUSTOM_ANCHOR_COLOR)],'anchor.png',{type:'image/png'}),
 new File(['ID3-roll-original'],'dice_roll.mp3',{type:'audio/mpeg'}),new File(['ID3-six-original'],'sound_ui_dice6.mp3',{type:'audio/mpeg'})];
const custom=await post('/api/preview/import',{...payload,name:'带附件',files:Object.fromEntries([...required,...extras].map(file=>[file.name,file]))});
assert.equal(custom.files.length,9);assert.equal(custom.candidate.icon,custom.candidate.png['大骰子']);assert.equal(custom.audio.dice_roll.default,false);assert.equal(custom.anchor.default,undefined);
await assertAnchorPixels((await storage.get(custom.id)).runtime,CUSTOM_ANCHOR_COLOR);assert(decodedAnchors.every(image=>image.closed));
assert.deepEqual(new Uint8Array(await urls.get(custom.candidate.audio.dice_roll).arrayBuffer()),new Uint8Array(await extras[3].arrayBuffer()));
const customBundle=await adapter.api('/api/preview/'+custom.id+'/bundle');await compactBundle(customBundle,await storage.get(custom.id));
const defaultBundle=await adapter.api('/api/preview/'+first.id+'/bundle');await compactBundle(defaultBundle,await storage.get(first.id));
assert.equal((await adapter.api('/api/preview/'+first.id)).video.sha256,video.sha256,'Compact packaging omits MP4 without invalidating a valid video');
checks.push('compact_green_zip_has_only_named_binary_atlas_texture_canonical_original_res_and_sound_with_official_runtime_anchor_and_events');
assert.equal(resourceName('ＤＩＣＥ＿ＰＵＲＰＬＥ＿ＤＩＣＥ＿ＧＲＥＥＮ＿Sea Turtle','green'),'dice_green_sea_turtle');
assert.equal(resourceName('dice_green_海龟','purple'),'dice_purple_海龟');assert.equal(resourceName('dice_green_dice_purple_','green'),'dice_green_custom');
const safeName=resourceName('../海龟 / A:B?🐢','green');assert.match(safeName,/^dice_green_[\p{L}\p{N}_-]+$/u);assert(!safeName.includes('..'));
const limited=resourceName('龟'.repeat(80),'green');assert.equal(Array.from(limited.slice('dice_green_'.length)).length,48);assert(Buffer.byteLength(limited+'.atlas','utf8')<255);
checks.push('resource_names_nfkc_lowercase_sanitize_prefix_once_correct_grade_and_bound_unicode_suffix');

const aliases=['ＳＺ＿１.ＰＮＧ','sz2.png','face3.png','FACE_4.PNG','face-5.png','6.png'].map(name=>new File([png()],name,{type:'image/png'}));
const aliasFiles=[...aliases,new File([png()],'sz_2.png',{type:'image/png'}),new File([png(240)],'icon.png',{type:'image/png'}),new File([png(240)],'大骰子.png',{type:'image/png'})];
const aliasSession=await post('/api/preview/import',{...payload,name:'别名骰面',files:aliasFiles});
assert.equal(aliasSession.files.find(file=>file.slot==='sz_1').name,'ＳＺ＿１.ＰＮＧ');assert.equal(aliasSession.files.find(file=>file.slot==='sz_2').name,'sz_2.png');
assert.equal(aliasSession.files.find(file=>file.slot==='sz_6').name,'6.png');assert.equal(aliasSession.files.find(file=>file.slot==='大骰子').name,'大骰子.png');
assert.ok(aliasSession.warnings.some(text=>text.includes('优先采用'))&&aliasSession.warnings.some(text=>text.includes('数字文件名')));
for(const file of aliasSession.files)assert.deepEqual(new Uint8Array(await urls.get(file.url).arrayBuffer()),new Uint8Array(await aliasFiles.find(input=>input.name===file.name).arrayBuffer()));
const badOptionals=[new File(['broken hero'],'icon.png',{type:'image/png'}),new File(['broken zero'],'sz_0.png',{type:'image/png'})];
const fallback=await post('/api/preview/import',{...payload,files:[...required,...badOptionals]});
assert.equal(fallback.files.length,6);assert.equal(fallback.candidate.icon,null);assert.equal(fallback.heroMissing,true);assert.ok(fallback.warnings.filter(text=>text.includes('已忽略')).length>=2);
failOptionalDecode=true;let decodeFallback;
try{decodeFallback=await post('/api/preview/import',{...payload,files:[...required,new File([png(240)],'icon.png'),new File([png()],'sz_0.png')]});}finally{failOptionalDecode=false;}
assert.equal(decodeFallback.files.length,6);assert.equal(decodeFallback.candidate.icon,null);assert.equal(decodeFallback.heroMissing,true);assert.ok(decodeFallback.warnings.some(text=>text.includes('decode failure')));
const duplicateHero=await post('/api/preview/import',{...payload,files:[...required,new File([png(240)],'icon.png'),new File([png(240)],'icon.png')]});
assert.equal(duplicateHero.files.length,6);assert.ok(duplicateHero.warnings.some(text=>text.includes('重复')));
checks.push('api_accepts_nfkc_sz_face_and_digit_aliases_canonical_priority_preserves_original_names_and_optional_corrupt_or_duplicate_hero_zero_fall_back');

// Hero-only changes must never rerun or replace the six-face animation.
const heroBase=await post('/api/preview/import',{...payload,name:'只补传大图'}),heroBefore=await storage.get(heroBase.id),heroRenders=renderCount;
await adapter.api(`/api/preview/${heroBase.id}/video`,{method:'POST',headers:{'X-Preview-Revision':'1','X-Candidate-Id':heroBase.candidate.id},body:new Blob(['hero-video'],{type:'video/h264'})});
const previousVideo=(await storage.get(heroBase.id)).video;
const heroA=new File([png(240)],'大骰子.png',{type:'image/png'}),heroB=new File([png(240,false,[210,80,30])],'ＩＣＯＮ．ＰＮＧ',{type:'image/png'});
const withHero=await post(`/api/preview/${heroBase.id}/hero`,{expectedRevision:1,file:heroA});
assert.equal(withHero.revision,2);assert.notEqual(withHero.candidate.id,heroBase.candidate.id);assert.equal(withHero.heroMissing,false);assert.equal(withHero.candidate.icon,withHero.candidate.png['大骰子']);assert.equal(withHero.video,null);
const replacedHero=await post(`/api/preview/${heroBase.id}/hero`,{expectedRevision:2,file:heroB});
assert.equal(replacedHero.revision,3);assert.notEqual(replacedHero.candidate.icon,withHero.candidate.icon);assert.equal(renderCount,heroRenders);
const heroAfter=await storage.get(heroBase.id);assert.deepEqual(heroAfter.runtime,heroBefore.runtime);assert.deepEqual(heroAfter.audio,heroBefore.audio);assert.deepEqual(heroAfter.anchor,heroBefore.anchor);
assert.deepEqual(new Uint8Array(await heroAfter.runtime.texture.arrayBuffer()),new Uint8Array(await heroBefore.runtime.texture.arrayBuffer()));
for(const [path,blob]of Object.entries(heroBefore.runtime.files))assert.deepEqual(new Uint8Array(await heroAfter.runtime.files[path].arrayBuffer()),new Uint8Array(await blob.arrayBuffer()));
for(const input of required){const saved=heroAfter.files.find(f=>f.name===input.name);assert.deepEqual(new Uint8Array(await saved.blob.arrayBuffer()),new Uint8Array(await input.arrayBuffer()));}
assert.deepEqual(new Uint8Array(await urls.get(withHero.candidate.icon).arrayBuffer()),new Uint8Array(await heroA.arrayBuffer()));
assert.deepEqual(new Uint8Array(await urls.get(replacedHero.candidate.icon).arrayBuffer()),new Uint8Array(await heroB.arrayBuffer()));
assert.equal(heroAfter.files.find(f=>f.slot==='大骰子').name,heroB.name);assert.deepEqual(heroAfter.video,previousVideo);
const heroBundle=await adapter.api(`/api/preview/${heroBase.id}/bundle`);await compactBundle(heroBundle,heroAfter);
checks.push('hero_only_two_updates_keep_six_face_runtime_and_original_bytes_use_content_bound_urls_and_hide_but_retain_old_video');

const stableHero=await storage.get(heroBase.id),heroWrites=writes;
for(const file of [null,new File([png(240)],'other.png'),new File([png()],'icon.png'),new File(['bad png'],'icon.png')]){
 await assert.rejects(()=>post(`/api/preview/${heroBase.id}/hero`,{expectedRevision:3,file}));
 assert.deepEqual(await storage.get(heroBase.id),stableHero);
}
failOptionalDecode=true;
try{await assert.rejects(()=>post(`/api/preview/${heroBase.id}/hero`,{expectedRevision:3,file:new File([png(240)],'icon.png')}));}finally{failOptionalDecode=false;}
await assert.rejects(()=>post(`/api/preview/${heroBase.id}/hero`,{expectedRevision:2,file:heroA}),e=>e.status===409);
failWrite=true;try{await assert.rejects(()=>post(`/api/preview/${heroBase.id}/hero`,{expectedRevision:3,file:heroA}),/quota/);}finally{failWrite=false;}
assert.deepEqual(await storage.get(heroBase.id),stableHero);assert.equal(writes,heroWrites);
const racedHeroes=await Promise.allSettled([heroA,heroB].map(file=>post(`/api/preview/${heroBase.id}/hero`,{expectedRevision:3,file})));
assert.equal(racedHeroes.filter(r=>r.status==='fulfilled').length,1);assert.equal(racedHeroes.filter(r=>r.status==='rejected'&&r.reason.status===409).length,1);
assert.equal((await storage.get(heroBase.id)).revision,4);
checks.push('invalid_decode_stale_or_storage_failed_hero_updates_are_atomic_and_two_concurrent_updates_have_one_cas_winner');

const snapshot=structuredClone([...records]),writeCount=writes;
failBuild=true;await assert.rejects(()=>post('/api/preview/import',payload),/six-face build failure/);failBuild=false;
failWrite=true;await assert.rejects(()=>post('/api/preview/import',payload),/quota/);failWrite=false;
const controller=new AbortController();controller.abort();await assert.rejects(()=>post('/api/preview/import',payload,{signal:controller.signal}),{name:'AbortError'});
await assert.rejects(()=>post('/api/preview/import',{...payload,files:required.slice(1)}));
await assert.rejects(()=>post('/api/preview/import',{...payload,files:[...required,new File(['bad'],'dice_roll.mp3')]}));
assert.equal(writes,writeCount);assert.deepEqual([...records],snapshot);
const legacyAnchor=structuredClone(await storage.get(custom.id));
legacyAnchor.id='a'.repeat(32);legacyAnchor.candidateId='b'.repeat(32);legacyAnchor.revision=7;
delete legacyAnchor.runtime.metadata.anchor;legacyAnchor.runtime.metadata.staticImages=13;
legacyAnchor.runtime.json.skins[0].attachments.anchor.anchor={type:'region',path:'white',width:30,height:30,color:'ffffff00'};
delete legacyAnchor.runtime.files['images/anchor.png'];
legacyAnchor.video={...structuredClone(previousVideo),revision:7,candidate:legacyAnchor.candidateId};
records.set(legacyAnchor.id,structuredClone(legacyAnchor));
const beforeMigrationRenders=renderCount,beforeMigrationWrites=writes;
const migratedAnchor=await adapter.api('/api/preview/'+legacyAnchor.id),migratedRecord=await storage.get(legacyAnchor.id);
assert.equal(migratedAnchor.revision,8);assert.notEqual(migratedAnchor.candidate.id,legacyAnchor.candidateId);assert.equal(migratedAnchor.video,null);
assert.equal(renderCount,beforeMigrationRenders+1);assert.equal(writes,beforeMigrationWrites+1);
assert.deepEqual(migratedRecord.files,legacyAnchor.files);assert.deepEqual(migratedRecord.audio,legacyAnchor.audio);assert.deepEqual(migratedRecord.anchor,legacyAnchor.anchor);assert.deepEqual(migratedRecord.video,legacyAnchor.video);
assert.deepEqual(new Uint8Array(await migratedRecord.video.blob.arrayBuffer()),new Uint8Array(await legacyAnchor.video.blob.arrayBuffer()));
await assertAnchorPixels(migratedRecord.runtime,CUSTOM_ANCHOR_COLOR);
const again=await adapter.api('/api/preview/'+legacyAnchor.id);assert.equal(again.revision,8);assert.equal(again.candidate.id,migratedAnchor.candidate.id);assert.equal(renderCount,beforeMigrationRenders+1);assert.equal(writes,beforeMigrationWrites+1);
const migratedBundle=await adapter.api('/api/preview/'+legacyAnchor.id+'/bundle');await compactBundle(migratedBundle,migratedRecord);
checks.push('legacy_white_anchor_migrates_once_to_actual_custom_root_six_scale_pixels_with_one_revision_and_old_video_hidden_not_deleted');
const legacyMotion=structuredClone(await storage.get(custom.id));
legacyMotion.id='c'.repeat(32);legacyMotion.candidateId='d'.repeat(32);legacyMotion.revision=11;
legacyMotion.runtime.metadata.motionVersion='crossfade-v1';
for(let point=1;point<=6;point++)delete legacyMotion.runtime.json.skins[0].attachments['face_'+point]['landed_'+point];
legacyMotion.video={...structuredClone(previousVideo),revision:11,candidate:legacyMotion.candidateId};
records.set(legacyMotion.id,structuredClone(legacyMotion));
const motionRenders=renderCount,motionWrites=writes,migratedMotion=await adapter.api('/api/preview/'+legacyMotion.id),motionRecord=await storage.get(legacyMotion.id);
assert.equal(migratedMotion.revision,12);assert.notEqual(migratedMotion.candidate.id,legacyMotion.candidateId);assert.equal(migratedMotion.video,null);
assert.equal(renderCount,motionRenders+1);assert.equal(writes,motionWrites+1);assert.equal(motionRecord.runtime.metadata.motionVersion,'flat-handoff-v2');
for(let point=1;point<=6;point++)assert.ok(motionRecord.runtime.json.skins[0].attachments['face_'+point]['landed_'+point]);
assert.deepEqual(motionRecord.files,legacyMotion.files);assert.deepEqual(motionRecord.audio,legacyMotion.audio);assert.deepEqual(motionRecord.anchor,legacyMotion.anchor);assert.deepEqual(motionRecord.video,legacyMotion.video);
assert.deepEqual(new Uint8Array(await motionRecord.video.blob.arrayBuffer()),new Uint8Array(await legacyMotion.video.blob.arrayBuffer()));
await assertAnchorPixels(motionRecord.runtime,CUSTOM_ANCHOR_COLOR);
const motionAgain=await adapter.api('/api/preview/'+legacyMotion.id);
assert.equal(motionAgain.revision,12);assert.equal(motionAgain.candidate.id,migratedMotion.candidate.id);assert.equal(motionAgain.candidate.atlas,migratedMotion.candidate.atlas);assert.equal(motionAgain.candidate.texture,migratedMotion.candidate.texture);
assert.equal(renderCount,motionRenders+1);assert.equal(writes,motionWrites+1);
await compactBundle(await adapter.api('/api/preview/'+legacyMotion.id+'/bundle'),motionRecord);
checks.push('correct_root_anchor_with_old_motion_migrates_once_via_cas_preserves_sources_audio_anchor_and_old_video_blob_but_hides_old_video');
adapter.dispose();refresh.dispose();assert.equal(urls.size,0);
checks.push('missing_faces_bad_audio_cancel_build_or_storage_failure_leave_all_previous_sessions_unchanged');
console.log(JSON.stringify({ok:true,count:checks.length,checks,boundary:'Real JSON/PNG/ZIP/session contracts and official Runtime; Canvas sampling uses injected pixels, actual browser/IndexedDB/audio rendering require browser QA.'},null,2));
