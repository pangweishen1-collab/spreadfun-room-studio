// Independent approved-motion samples plus the shipped official Spine reader.
// Canvas fixtures exercise real alpha/composition/PNG code, not GPU appearance.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {deflateSync} from 'node:zlib';
import {gyroAt} from '../dice/purple-gyro/motion.mjs';
import {buildPurpleSpineJson,inferPurpleBodyModel,PURPLE_GYRO_MOTION_VERSION} from '../dice/purple-gyro/spine-builder.mjs';
import {generatePurpleGyroRuntime} from '../dice/purple-gyro/runtime.mjs';
import {writeSpineBinary} from '../dice/six-face/spine-binary.mjs';
import {preparedFixture,fixtureAtlasText,installPixelCanvas,rgbaPNG,readRgbaPNG} from './helpers/purple-fixtures.mjs';

const checks=[],reference=JSON.parse(await readFile(new URL('./fixtures/purple-gyro-reference.json',import.meta.url),'utf8'));
const near=(a,b,label,tolerance=5e-5)=>assert.ok(Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<=tolerance,`${label}: ${a} != ${b}`);
const arrayNear=(a,b,label,tolerance=5e-5)=>{assert.equal(a.length,b.length,label+' length');for(let i=0;i<a.length;i++)near(a[i],b[i],label+' '+i,tolerance);};
for(const sample of reference.samples){const actual=gyroAt(sample.time);arrayNear(actual.rotation,sample.rotation,'approved05 matrix',1e-12);arrayNear(actual.offset,sample.offset,'approved05 offset',1e-12);near(actual.zoom,sample.zoom,'approved05 zoom',1e-12);}
assert.ok(gyroAt(.2283).rotation[8]<0,'This approved motion really turns its front away; a front-only billboard is insufficient');
checks.push('motion_matrix_offset_zoom_matches_independent_approved05_golden_samples_including_actual_back_exposure');

const pixelsOf=(width,height,alphaAt)=>{const data=new Uint8ClampedArray(width*height*4);for(let y=0;y<height;y++)for(let x=0;x<width;x++)data.set([26,144,215,alphaAt(x,y)],(y*width+x)*4);return {width,height,data};};
for(const [image,kind] of [
 [pixelsOf(4,4,(x,y)=>x>0&&x<3&&y>0&&y<3?0:255),'silhouette-bulging'],
 [pixelsOf(4,4,(x,y)=>x>0&&x<3&&y>0&&y<3&&!(x===1&&y===1)?0:255),'rounded-six-face'],
 [pixelsOf(4,4,(x,y)=>x>0&&x<3&&y>0&&y<3?31:255),'silhouette-bulging'],
 [pixelsOf(4,4,(x,y)=>x>0&&x<3&&y>0&&y<3?32:255),'rounded-six-face'],
 [pixelsOf(3,4,()=>255),'rounded-six-face'],[pixelsOf(74,100,()=>255),'silhouette-bulging'],
 [pixelsOf(133,100,()=>255),'rounded-six-face'],[pixelsOf(134,100,()=>255),'silhouette-bulging'],
 [pixelsOf(4,4,()=>0),'silhouette-bulging'],[undefined,'silhouette-bulging'],
])assert.equal(inferPurpleBodyModel(image).kind,kind,'Body-model classification has explicit alpha, coverage and aspect thresholds');
checks.push('automatic_body_model_selection_preserves_strict_coverage_and_inclusive_aspect_boundaries');

const context={console};vm.runInNewContext(await readFile(new URL('../dice/vendor/spine-webgl.js',import.meta.url),'utf8'),context);const S=context.spine;
function decoded(json,atlasText=fixtureAtlasText()){
 const atlas=new S.TextureAtlas(atlasText),loader=new S.AtlasAttachmentLoader(atlas),bytes=writeSpineBinary(json);
 return {original:new S.SkeletonJson(loader).readSkeletonData(json),binary:new S.SkeletonBinary(loader).readSkeletonData(bytes),bytes};
}
function pose(data,name,time){const skeleton=new S.Skeleton(data),events=[];skeleton.setToSetupPose();data.findAnimation(name).apply(skeleton,-1,time,false,events,1,S.MixBlend.replace,S.MixDirection.mixIn);skeleton.updateWorldTransform(S.Physics.update);return {skeleton,events};}
function world(slot){const a=slot.getAttachment();if(!a)return [];const output=new Float32Array(a instanceof S.MeshAttachment?a.worldVerticesLength:8);if(a instanceof S.MeshAttachment)a.computeWorldVertices(slot,0,output.length,output,0,2);else a.computeWorldVertices(slot,output,0,2);for(const value of output)assert.ok(Number.isFinite(value),'All emitted world vertices must be finite');return output;}
function comparePose(a,b){
 assert.deepEqual(a.drawOrder.map(s=>s.data.name),b.drawOrder.map(s=>s.data.name));
 for(let i=0;i<a.slots.length;i++){
  const x=a.slots[i],y=b.slots[i];assert.equal(x.getAttachment()?.name,y.getAttachment()?.name);
  for(const channel of ['r','g','b','a'])near(x.color[channel],y.color[channel],'slot RGBA',1e-6);
  arrayNear(x.deform,y.deform,'numeric deform');arrayNear(world(x),world(y),'world pose',1e-4);
 }
}
function rollSlots(skeleton){return skeleton.slots.filter(slot=>slot.data.name.startsWith('gyro_'));}
function meshAndExposureContract(source,data){
 for(const map of Object.values(source.skins[0].attachments))for(const attachment of Object.values(map)){
  assert.equal(attachment.sequence,undefined,'No Spine image-sequence attachment is emitted');
  if(attachment.type!=='mesh')continue;
  assert.equal(attachment.uvs.length,attachment.vertices.length,'Every native mesh has complete non-weighted geometry');
  for(const value of [...attachment.uvs,...attachment.vertices])assert.ok(Number.isFinite(value));
  for(let i=0;i<attachment.triangles.length;i+=3){const [a,b,c]=attachment.triangles.slice(i,i+3).map(index=>index*2),uv=attachment.uvs;assert.ok(Math.abs((uv[b]-uv[a])*(uv[c+1]-uv[a+1])-(uv[b+1]-uv[a+1])*(uv[c]-uv[a]))>1e-12,'Mesh texture triangles must be nondegenerate so Canvas fallback does not skip them');}
 }
 const main=data.slots.filter(slot=>slot.name.startsWith('gyro_')&&!slot.name.startsWith('gyro_blur_')).map(slot=>slot.name),blur=data.slots.filter(slot=>slot.name.startsWith('gyro_blur_')).map(slot=>slot.name);
 assert.ok(main.length>=6,'Both body models have complete front, back and side coverage');assert.equal(blur.length,main.length*2,'Every main mesh has two temporal exposures');
 for(const name of main)for(const prefix of ['gyro_blur_','gyro_blur_future_']){
  const target=name.replace('gyro_',prefix);assert.ok(data.findSlot(target),'Every exposure covers the complete selected body model');
  const a=Object.values(source.skins[0].attachments[name])[0],b=Object.values(source.skins[0].attachments[target])[0];
  assert.deepEqual(b.triangles,a.triangles,'Temporal exposures use the same mesh topology');assert.deepEqual(b.uvs,a.uvs,'Temporal exposures use the same texture mapping');
 }
 for(let point=1;point<=6;point++){
  for(const time of [0,.2283,.3,.47,.535001]){const current=pose(data,'spin_'+point,time).skeleton,order=current.drawOrder.map(slot=>slot.data.name);assert.ok(Math.max(...main.map(name=>order.indexOf(name)))<Math.min(...blur.map(name=>order.indexOf(name))),'The main body draws before the translucent short exposures');}
  for(const time of [.535001,.539999,.540001,.591668]){const current=pose(data,'spin_'+point,time).skeleton;for(const name of blur)assert.equal(current.findSlot(name).color.a,0,'Every blur side and front/back clears before atomic landing');}
  const keys=source.animations['spin_'+point].attachments.default.gyro_front.roll_front.deform.map(key=>key.time).filter(time=>time<=.54);
  for(let i=1;i<keys.length;i++)assert.ok(keys[i]-keys[i-1]<=1/120+1e-6,'Fast native rotation retains at least 120Hz numeric pose sampling');
 }
 return {main,blur};
}
const json=buildPurpleSpineJson(preparedFixture),{original,binary,bytes}=decoded(json);
assert.deepEqual([...writeSpineBinary(json)],[...bytes],'The exact source JSON writes deterministic binary');
assert.equal(binary.version,'4.2.43');assert.equal(binary.animations.length,12);
assert.deepEqual(Array.from(binary.animations,a=>a.name).sort(),Array.from({length:6},(_,i)=>['spin_'+(i+1),'standby_'+(i+1)]).flat().sort());
const anchor=new S.Skeleton(binary).findSlot('anchor');assert.equal(anchor.bone.data.name,'root');assert.equal(anchor.color.a,0);assert.equal(anchor.getAttachment().color.a,0);assert.equal(anchor.getAttachment().scaleX,6);assert.equal(anchor.getAttachment().scaleY,6);
assert.equal(anchor.getAttachment().width,30);assert.equal(anchor.getAttachment().height,30);
assert.equal(binary.findSlot('result').boneData.name,'daxiao_1','Result must continue the same zoom/offset after the .54 handoff');
let poseSamples=0;
for(const animation of binary.animations){
 near(animation.duration,animation.name.startsWith('spin_')?.633333:0,'native action duration',1e-7);
 for(const time of [0,.1,.2283,.3,.47,.535,.539999,.540001,.55,.591668,.600001,.633334,1.9]){comparePose(pose(original,animation.name,time).skeleton,pose(binary,animation.name,time).skeleton);poseSamples++;}
 const events=pose(binary,animation.name,1).events.map(e=>[e.data.name,e.time]);
 if(animation.name.startsWith('standby_'))assert.deepEqual(events,[]);
 else{assert.equal(events[0][0],'dice_roll');near(events[0][1],0,'roll event');assert.equal(events.length,animation.name==='spin_6'?2:1);if(events.length===2){assert.equal(events[1][0],'sound_ui_dice6');near(events[1][1],.6,'six event');}}
}
for(let point=1;point<=6;point++){
 const back=pose(binary,'spin_'+point,.2283).skeleton;assert.ok(back.findSlot('gyro_back').color.a>.05,'Back face must be visibly drawn during the actual backward phase');assert.ok(back.findSlot('gyro_front').color.a<.01);
 const peak=pose(binary,'spin_'+point,.3).skeleton;near(peak.findBone('daxiao_1').scaleX,1.5,'1.5 native zoom',1e-6);
 const before=pose(binary,'spin_'+point,.539999).skeleton,after=pose(binary,'spin_'+point,.540001).skeleton;
 assert.equal(before.findSlot('result').color.a,0);assert.equal(after.findSlot('result').color.a,1);
 assert.ok(after.findBone('daxiao_1').scaleX>1.08,'Result keeps remaining zoom; handoff must not snap to1');
 near(after.findBone('daxiao_1').scaleX,before.findBone('daxiao_1').scaleX,'handoff scale continuity',1e-5);
 arrayNear(world(before.findSlot('gyro_front')),world(after.findSlot('gyro_front')),'handoff projected mesh continuity',.01);
 for(const time of [.540001,.575,.591668]){
  const current=pose(binary,'spin_'+point,time).skeleton,front=current.findSlot('gyro_front'),result=current.findSlot('result'),mesh=front.getAttachment(),flat=result.getAttachment(),positions=world(front),bone=result.bone;
  for(let i=0;i<mesh.regionUVs.length;i+=2){const x=(mesh.regionUVs[i]-.5)*flat.width,y=(.5-mesh.regionUVs[i+1])*flat.height;near(positions[i],bone.a*x+bone.b*y+bone.worldX,'handoff exact UV worldX',.01);near(positions[i+1],bone.c*x+bone.d*y+bone.worldY,'handoff exact UV worldY',.01);}
 }
 for(const slot of rollSlots(after))assert.equal(slot.color.a,0,'One representation owns the settled frame; no rolling or blur residue');
 assert.equal(after.findSlot('result').getAttachment().path,'flat_'+point);
 const ready=pose(binary,'spin_'+point,.591668).skeleton;near(ready.findBone('daxiao_1').scaleX,1,'settled zoom',1e-6);
 for(const time of [.540001,.591668,1.9]){
  const active=pose(binary,'standby_'+point,time).skeleton;assert.equal(active.findSlot('result').color.a,1);assert.equal(active.findSlot('result').getAttachment().path,'flat_'+point);
  for(const slot of rollSlots(active))assert.equal(slot.color.a,0);near(active.findBone('daxiao_1').scaleX,1,'standby size');
 }
}
const {main:mainRollNames,blur:blurRollNames}=meshAndExposureContract(json,binary);
checks.push('three_native_exposures_cover_the_complete_rig_and_all_blur_slots_clear_before_landing');
for(const geometry of [{sourceSize:201,crop:[5,47,130,130],cropOffset:[-30.5,11.5]},{sourceSize:512,crop:[0,0,512,512],cropOffset:[0,0]}]){const pair=decoded(buildPurpleSpineJson(geometry));for(const t of [0,.2283,.3,.540001,.591668])comparePose(pose(pair.original,'spin_6',t).skeleton,pose(pair.binary,'spin_6',t).skeleton);}
checks.push('official_json_binary_roundtrip_12_actions_finite_world_deforms_layers_root_anchor_audio_back_face_and_atomic_scaled_handoff');

// Runtime consumers often switch actions without calling setToSetupPose.
function continuousContract(data){
const continuous=new S.Skeleton(data),stateData=new S.AnimationStateData(data);stateData.defaultMix=0;const state=new S.AnimationState(stateData);
for(const [name,delta] of [['spin_1',.56],['standby_3',0],['spin_2',0],['spin_2',.2283],['spin_2',.311701],['standby_6',0],['spin_4',0]]){
 if(state.getCurrent(0)?.animation.name!==name)state.setAnimation(0,name,false);state.update(delta);state.apply(continuous);continuous.updateWorldTransform(S.Physics.update);
 const time=state.getCurrent(0).trackTime,fresh=pose(data,name,time).skeleton;
 assert.equal(continuous.findSlot('result').getAttachment().path,fresh.findSlot('result').getAttachment().path);
 for(let i=0;i<continuous.slots.length;i++){
  const actual=continuous.slots[i],expected=fresh.slots[i];near(actual.color.a,expected.color.a,'continuous alpha',1e-6);
  if(actual.color.a>0){assert.equal(actual.getAttachment().path,expected.getAttachment().path);arrayNear(world(actual),world(expected),'continuous visible world',1e-4);}
 }
 if(name.startsWith('spin_')&&time===0){assert.equal(continuous.findSlot('gyro_front').getAttachment().name,'roll_front');assert.equal(continuous.findSlot('gyro_blur_front').getAttachment().name,'roll_front');}
}
}
continuousContract(binary);
checks.push('continuous_spin_standby_transitions_reset_visible_attachments_alpha_and_pose_without_setup_reset');

function actualRuntimeContract(generated){
 const pair=decoded(generated.json,generated.atlasText),data=pair.binary;assert.equal(data.animations.length,12);
 const exposure=meshAndExposureContract(generated.json,data),anchor=new S.Skeleton(data).findSlot('anchor');assert.equal(anchor.bone.data.name,'root');assert.equal(anchor.color.a,0);assert.equal(anchor.getAttachment().color.a,0);assert.equal(anchor.getAttachment().scaleX,6);assert.equal(anchor.getAttachment().scaleY,6);
 for(const action of data.animations)for(const time of [0,.1,.2283,.3,.47,.535001,.539999,.540001,.591668,.633334]){comparePose(pose(pair.original,action.name,time).skeleton,pose(data,action.name,time).skeleton);poseSamples++;}
 for(let point=1;point<=6;point++){
  assert.ok(pose(data,'spin_'+point,.2283).skeleton.findSlot('gyro_back').color.a>.05,'Both inferred models expose a real back face');
  const before=pose(data,'spin_'+point,.539999).skeleton,after=pose(data,'spin_'+point,.540001).skeleton;
  assert.equal(before.findSlot('result').color.a,0);assert.equal(after.findSlot('result').color.a,1);assert.equal(after.findSlot('result').getAttachment().path,'flat_'+point);
  near(before.findBone('daxiao_1').scaleX,after.findBone('daxiao_1').scaleX,'inferred model landing zoom continuity',1e-5);assert.ok(after.findBone('daxiao_1').scaleX>1.08);
  const result=after.findSlot('result'),front=after.findSlot('gyro_front'),positions=world(front),uv=front.getAttachment().regionUVs,flat=result.getAttachment(),bone=result.bone;
  for(let i=0;i<uv.length;i+=2){const x=(uv[i]-.5)*flat.width,y=(.5-uv[i+1])*flat.height;near(positions[i],bone.a*x+bone.b*y+bone.worldX,'inferred model landing worldX',.01);near(positions[i+1],bone.c*x+bone.d*y+bone.worldY,'inferred model landing worldY',.01);}
  for(const slot of rollSlots(after))assert.equal(slot.color.a,0);near(pose(data,'spin_'+point,.591668).skeleton.findBone('daxiao_1').scaleX,1,'inferred model settled zoom');
 }
 continuousContract(data);return {kind:generated.metadata.bodyModel.kind,meshes:{main:exposure.main.length,blur:exposure.blur.length},staticImages:generated.metadata.staticImages,binary:pair.bytes.length,binaryDeflate:deflateSync(pair.bytes).length,atlas:generated.texture.size};
}
async function retainedImageContract(generated,kind){
 assert.equal(generated.metadata.bodyModel.kind,kind);assert.equal(generated.metadata.staticImages,generated.metadata.atlas.regions.length);assert.equal(generated.metadata.imageSequences,0);assert.equal(generated.metadata.nativeExposures,3);
 const rounded=kind==='rounded-six-face',expectedRegions=[...Array.from({length:6},(_,i)=>'flat_'+(i+1)),...Array.from({length:rounded?6:1},(_,i)=>'roll_'+(i+1)),...(rounded?[]:['soft_wall']),'white','anchor'].sort(),regionNames=generated.metadata.atlas.regions.map(region=>region.name).sort();
 assert.deepEqual(regionNames,expectedRegions,'The selected body model retains only the static texture regions it uses');
 assert.deepEqual(Object.keys(generated.files).filter(path=>path.startsWith('images/')).map(path=>path.slice(7,-4)).sort(),expectedRegions);
 const usedPaths=new Set(Object.values(generated.json.skins[0].attachments).flatMap(map=>Object.values(map).map(attachment=>attachment.path)));for(const name of usedPaths)assert.ok(expectedRegions.includes(name),'Every mesh and region references a retained image');
 if(!rounded)for(let point=2;point<=6;point++){assert.ok(!generated.atlasText.includes('\nroll_'+point+'\n'));assert.equal(generated.files['images/roll_'+point+'.png'],undefined);}
 const manifest=JSON.parse(await generated.files['manifest.json'].text());assert.equal(manifest.staticImages,regionNames.length);assert.equal(manifest.imageSequences,0);assert.deepEqual(manifest.files.map(file=>file.path).sort(),Object.keys(generated.files).filter(path=>path!=='manifest.json').sort());
 for(const file of manifest.files)assert.equal(file.bytes,generated.files[file.path].size,'Manifest byte counts describe the actual retained assets');
}

const fixture=installPixelCanvas();let generated;const generatedModels=[];
try{
 const size=200,base=new Uint8ClampedArray(size*size*4);
 for(let y=35;y<165;y++)for(let x=35;x<165;x++)if((x>=47&&x<153)||(y>=47&&y<153))base.set([26,144,215,255],(y*size+x)*4);
 // Hidden dark RGB is intentionally present at alpha0; it must not become art.
 for(let x=0;x<size;x++)base.set([39,39,39,0],(2*size+x)*4);
 const inputs=[{slot:'sz_0',name:'sz_0.png',blob:new Blob([rgbaPNG(size,size,base)],{type:'image/png'})}];
 for(let point=1;point<=6;point++){
  const pixels=new Uint8ClampedArray(size*size*4);for(let y=90;y<100;y++)for(let x=82+point*2;x<92+point*2;x++)pixels.set([245,52,47,255],(y*size+x)*4);
  inputs.push({slot:'sz_'+point,name:'sz_'+point+'.png',blob:new Blob([rgbaPNG(size,size,pixels)],{type:'image/png'})});
 }
 const originals=await Promise.all(inputs.map(async input=>Buffer.from(await input.blob.arrayBuffer()))),anchorPixels=new Uint8ClampedArray(30*30*4);for(let i=0;i<anchorPixels.length;i+=4)anchorPixels.set([255,80,221,255],i);
 generated=await generatePurpleGyroRuntime(inputs,{name:'dice_purple_数字主题',composition:'digits',anchorImage:{width:30,height:30,data:anchorPixels}});
 assert.equal(generated.kind,'purple-gyro');assert.equal(generated.metadata.motionVersion,PURPLE_GYRO_MOTION_VERSION);assert.equal(generated.metadata.zoomPeak,1.5);assert.equal(generated.metadata.imageSequences,0);assert.equal(generated.metadata.staticImages,generated.metadata.atlas.regions.length);assert.equal(generated.metadata.resolvedComposition,'digits');
 await retainedImageContract(generated,'rounded-six-face');
 const flat=readRgbaPNG(await generated.files['images/flat_1.png'].arrayBuffer()),roll=readRgbaPNG(await generated.files['images/roll_1.png'].arrayBuffer());
 let blue=0,red=0;for(let i=0;i<flat.data.length;i+=4){if(flat.data[i+3]&&flat.data[i+2]>200&&flat.data[i]<50)blue++;if(flat.data[i+3]&&flat.data[i]>200&&flat.data[i+1]<100)red++;}
 assert.ok(blue>10000,'Digits composition must keep the original full theme body, not output floating numerals');assert.ok(red>50,'Digit pixels remain visible on the composited body');
 for(let i=3;i<roll.data.length;i+=4)assert.equal(roll.data[i],255,'The rounded body uses opaque edge-filled roll textures so all six joined faces remain full');
 const atlasPixels=readRgbaPNG(await generated.texture.arrayBuffer()),anchorRegion=generated.metadata.atlas.regions.find(region=>region.name==='anchor');assert.deepEqual(Array.from(atlasPixels.data.slice(((anchorRegion.y+15)*atlasPixels.width+anchorRegion.x+15)*4,((anchorRegion.y+15)*atlasPixels.width+anchorRegion.x+15)*4+4)),[255,80,221,255],'The supplied anchor pixels actually reach the final atlas');assert.deepEqual(Array.from(readRgbaPNG(await generated.files['images/anchor.png'].arrayBuffer()).data.slice(0,4)),[255,80,221,255]);
 for(const [name,image] of [['flat_1',flat],['roll_1',roll]]){const r=generated.metadata.atlas.regions.find(region=>region.name===name);assert.equal(r.width,image.width);for(let y=0;y<r.height;y++)assert.deepEqual(atlasPixels.data.slice(((r.y+y)*atlasPixels.width+r.x)*4,((r.y+y)*atlasPixels.width+r.x+r.width)*4),image.data.slice(y*r.width*4,(y+1)*r.width*4),'Raw alpha/RGB image data survives atlas decoding/repacking for '+name);}
 assert.deepEqual(await Promise.all(inputs.map(async input=>Buffer.from(await input.blob.arrayBuffer()))),originals,'Uploaded source PNG bytes remain untouched');
 generatedModels.push(actualRuntimeContract(generated));
 const controller=new AbortController();controller.abort();await assert.rejects(()=>generatePurpleGyroRuntime(inputs,{signal:controller.signal,anchorImage:{width:30,height:30,data:anchorPixels}}),error=>error.name==='AbortError');
 await assert.rejects(()=>generatePurpleGyroRuntime(inputs.slice(1),{composition:'digits',anchorImage:{width:30,height:30,data:anchorPixels}}),/sz_0/);
 const fullFaces=inputs.slice(1).map((input,index)=>{const image=new Uint8ClampedArray(base);for(let y=90;y<100;y++)for(let x=84+index*2;x<94+index*2;x++)image.set([245,52,47,255],(y*size+x)*4);return {...input,blob:new Blob([rgbaPNG(size,size,image)],{type:'image/png'})};});
 const faces=await generatePurpleGyroRuntime(fullFaces,{composition:'auto',anchorImage:{width:30,height:30,data:anchorPixels}});assert.equal(faces.metadata.resolvedComposition,'faces');assert.ok(faces.warnings.some(warning=>/未提供sz_0/.test(warning)));assert.equal(decoded(faces.json,faces.atlasText).binary.animations.length,12);
 await retainedImageContract(faces,'rounded-six-face');
 const sparse=pixelsOf(size,size,(x,y)=>x>=35&&x<165&&y>=35&&y<165&&(Math.abs(x-100)<16||Math.abs(y-100)<16)?255:0),sparseInputs=[{slot:'sz_0',name:'sz_0.png',blob:new Blob([rgbaPNG(size,size,sparse.data)],{type:'image/png'})},...fullFaces.map((input,index)=>{const data=new Uint8ClampedArray(sparse.data);for(let y=90;y<100;y++)for(let x=84+index*2;x<94+index*2;x++)data.set([245,52,47,255],(y*size+x)*4);return {...input,blob:new Blob([rgbaPNG(size,size,data)],{type:'image/png'})};})];
 const sparseOriginals=await Promise.all(sparseInputs.map(async input=>Buffer.from(await input.blob.arrayBuffer()))),silhouette=await generatePurpleGyroRuntime(sparseInputs,{composition:'faces',anchorImage:{width:30,height:30,data:anchorPixels}});
 await retainedImageContract(silhouette,'silhouette-bulging');assert.ok(silhouette.metadata.bodyModel.coverage<.75);
 const silhouetteRoll=readRgbaPNG(await silhouette.files['images/roll_1.png'].arrayBuffer());assert.equal(silhouetteRoll.data[3],0,'The low-coverage model keeps its transparent silhouette instead of a filled rectangle');assert.ok(silhouetteRoll.data.some((value,index)=>index%4===3&&value===255));assert.ok(silhouetteRoll.data[2]>200,'Transparent silhouette edges retain theme colour bleed instead of dark RGB fringes');
 const silhouetteAtlas=readRgbaPNG(await silhouette.texture.arrayBuffer());
 for(const name of ['flat_1','roll_1']){const image=readRgbaPNG(await silhouette.files['images/'+name+'.png'].arrayBuffer()),region=silhouette.metadata.atlas.regions.find(region=>region.name===name);for(let y=0;y<region.height;y++)assert.deepEqual(silhouetteAtlas.data.slice(((region.y+y)*silhouetteAtlas.width+region.x)*4,((region.y+y)*silhouetteAtlas.width+region.x+region.width)*4),image.data.slice(y*region.width*4,(y+1)*region.width*4),'The irregular atlas preserves all flat/roll alpha and hidden RGB pixels');}
 for(const [slot,map] of Object.entries(silhouette.json.skins[0].attachments))if(/^gyro_side_/.test(slot)){const wall=map.side;assert.ok(wall.uvs.length>=20,'Irregular side walls use multiple depth rings rather than a flat quad');assert.ok(wall.triangles.length>=24);}
 generatedModels.push(actualRuntimeContract(silhouette));assert.deepEqual(await Promise.all(sparseInputs.map(async input=>Buffer.from(await input.blob.arrayBuffer()))),sparseOriginals,'Irregular uploaded source PNG bytes remain untouched');
 assert.equal(fixture.urls.size,0,'All temporary decoding Blob URLs are released on success and failure');
 checks.push('real_asset_pipeline_automatically_selects_rounded_and_irregular_bodies_composes_digits_preserves_sources_and_releases_decode_resources');
}finally{fixture.restore();}

console.log(JSON.stringify({passed:true,checks,poseSamples,meshSlots:{main:mainRollNames.length,blur:blurRollNames.length},models:generatedModels,referenceHash:reference.sha256,bytes:{binary:bytes.length,binaryDeflate:deflateSync(bytes).length},boundary:'Official Spine4.2 JSON/binary and real asset algorithms with deterministic pixel Canvas fixtures. Editor, target game GPU, final artwork quality and real browser video remain separate acceptance.'},null,2));
