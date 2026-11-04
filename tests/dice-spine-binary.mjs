// Independent round-trip gate using the shipped official Spine 4.2 Runtime.
// No Canvas, custom binary reader, Editor, or image-sequence generation is used.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {buildSpineJson} from '../dice/six-face/spine-builder.mjs';
import {writeSpineBinary} from '../dice/six-face/spine-binary.mjs';
const context={console};vm.createContext(context);
vm.runInContext(await readFile(new URL('../dice/vendor/spine-webgl.js',import.meta.url),'utf8'),context);
const S=context.spine;
const regions=[['white',64,16],['anchor',30,30],...Array.from({length:6},(_,i)=>[['flat_'+(i+1),131,131],['roll_'+(i+1),131,131]]).flat()];
const atlasText='dice.png\nsize: 512,512\nformat: RGBA8888\nfilter: Linear,Linear\nrepeat: none\npma: false\n'+
 regions.map(([name,w,h],i)=>`${name}\n  rotate: false\n  xy: ${(i%3)*150+2},${Math.floor(i/3)*80+2}\n  size: ${w},${h}\n  orig: ${w},${h}\n  offset: 0,0\n  index: -1`).join('\n')+'\n';
let maximumWorldDelta=0,samples=0;
const near=(a,b,label,tolerance=5e-5)=>assert.ok(Math.abs(a-b)<=tolerance,`${label}: ${a} != ${b}`);
function arrayNear(a,b,label,tolerance=5e-5){assert.equal(a.length,b.length,label+' length');for(let i=0;i<a.length;i++)near(a[i],b[i],label+' '+i,tolerance);}
function load(json){
 const atlas=new S.TextureAtlas(atlasText),loader=new S.AtlasAttachmentLoader(atlas),bytes=writeSpineBinary(json);
 const original=new S.SkeletonJson(loader).readSkeletonData(json),decoded=new S.SkeletonBinary(loader).readSkeletonData(bytes);
 assert.equal(decoded.version,'4.2.43');assert.equal(decoded.bones.length,original.bones.length);assert.equal(decoded.slots.length,original.slots.length);
 assert.equal(decoded.imagesPath,json.skeleton.images);assert.equal(decoded.audioPath,json.skeleton.audio);
 for(let i=0;i<original.bones.length;i++){
  const a=original.bones[i],b=decoded.bones[i];assert.equal(a.name,b.name);assert.equal(a.parent?.name,b.parent?.name);
  for(const key of ['x','y','rotation','scaleX','scaleY','shearX','shearY','length'])near(a[key],b[key],'bone '+key);
 }
 for(let i=0;i<original.slots.length;i++){
  const a=original.slots[i],b=decoded.slots[i];assert.equal(a.name,b.name);assert.equal(a.boneData.name,b.boneData.name);assert.equal(a.attachmentName,b.attachmentName);
  for(const key of ['r','g','b','a'])near(a.color[key],b.color[key],'setup slot color');
 }
 const a=original.defaultSkin.getAttachments(),b=decoded.defaultSkin.getAttachments();assert.equal(a.length,b.length);
 for(let i=0;i<a.length;i++){
  assert.equal(a[i].slotIndex,b[i].slotIndex);assert.equal(a[i].name,b[i].name);
  const x=a[i].attachment,y=b[i].attachment;assert.equal(x.path,y.path);
  for(const key of ['width','height','x','y','scaleX','scaleY','rotation'])if(typeof x[key]==='number')near(x[key],y[key],'attachment '+key);
  for(const key of ['r','g','b','a'])near(x.color[key],y.color[key],'attachment color');
  if(x instanceof S.MeshAttachment){assert.equal(y.hullLength,x.hullLength);assert.equal(y.worldVerticesLength,x.worldVerticesLength);arrayNear(x.vertices,y.vertices,'mesh setup');arrayNear(x.regionUVs,y.regionUVs,'UV');assert.deepEqual([...x.triangles],[...y.triangles]);}
 }
 assert.equal(original.events.length,decoded.events.length);
 for(let i=0;i<original.events.length;i++){
  const a=original.events[i],b=decoded.events[i];for(const key of ['name','stringValue','audioPath'])assert.equal(a[key],b[key]);
  for(const key of ['intValue','floatValue','volume','balance'])near(a[key],b[key],'event '+key);
 }
 return {bytes,original,decoded};
}
function sample(left,right,animation,time){
 const a=new S.Skeleton(left),b=new S.Skeleton(right),eventsA=[],eventsB=[];
 a.setToSetupPose();b.setToSetupPose();
 left.findAnimation(animation).apply(a,-1,time,false,eventsA,1,S.MixBlend.replace,S.MixDirection.mixIn);
 right.findAnimation(animation).apply(b,-1,time,false,eventsB,1,S.MixBlend.replace,S.MixDirection.mixIn);
 a.updateWorldTransform(S.Physics.update);b.updateWorldTransform(S.Physics.update);
 assert.deepEqual(a.drawOrder.map(s=>s.data.name),b.drawOrder.map(s=>s.data.name),'draw order');
 for(let i=0;i<a.bones.length;i++)for(const key of ['x','y','rotation','scaleX','scaleY','worldX','worldY','a','b','c','d'])near(a.bones[i][key],b.bones[i][key],'bone pose '+key);
 for(let i=0;i<a.slots.length;i++){
  const x=a.slots[i],y=b.slots[i],ax=x.getAttachment(),ay=y.getAttachment();assert.equal(ax?.name,ay?.name);
  for(const channel of ['r','g','b','a'])near(x.color[channel],y.color[channel],'RGBA',1e-6);
  arrayNear(x.deform,y.deform,'deform');if(!ax)continue;
  const va=new Float32Array(ax instanceof S.MeshAttachment?ax.worldVerticesLength:8),vb=new Float32Array(va.length);
  if(ax instanceof S.MeshAttachment){ax.computeWorldVertices(x,0,va.length,va,0,2);ay.computeWorldVertices(y,0,vb.length,vb,0,2);}
  else{ax.computeWorldVertices(x,va,0,2);ay.computeWorldVertices(y,vb,0,2);}
  for(let k=0;k<va.length;k++){assert.ok(Number.isFinite(va[k])&&Number.isFinite(vb[k]));maximumWorldDelta=Math.max(maximumWorldDelta,Math.abs(va[k]-vb[k]));near(va[k],vb[k],'world vertex');}
 }
 assert.equal(eventsA.length,eventsB.length);
 for(let i=0;i<eventsA.length;i++){
  for(const key of ['time','intValue','floatValue','volume','balance'])near(eventsA[i][key],eventsB[i][key],'event frame '+key);
  assert.equal(eventsA[i].data.name,eventsB[i].data.name);assert.equal(eventsA[i].stringValue,eventsB[i].stringValue);assert.equal(eventsA[i].data.audioPath,eventsB[i].data.audioPath);
 }
 assert.equal(b.findSlot('anchor').bone.data.name,'root');assert.equal(b.findSlot('anchor').getAttachment().scaleX,6);assert.equal(b.findSlot('anchor').color.a,0);
 samples++;
}
function verticesOf(slot){
 const attachment=slot.getAttachment(),vertices=new Float32Array(attachment instanceof S.MeshAttachment?attachment.worldVerticesLength:8);
 if(attachment instanceof S.MeshAttachment)attachment.computeWorldVertices(slot,0,vertices.length,vertices,0,2);else attachment.computeWorldVertices(slot,vertices,0,2);
 for(const value of vertices)assert.ok(Number.isFinite(value));return vertices;
}
function assertAtomicLanding(data){
 for(let point=1;point<=6;point++)for(const time of [.550001,.575,.591667,.599999,.6,.600001,.608333,.633333]){
  const skeleton=new S.Skeleton(data);data.findAnimation('spin_'+point).apply(skeleton,-1,time,false,null,1,S.MixBlend.replace,S.MixDirection.mixIn);skeleton.updateWorldTransform(S.Physics.update);
  const result=skeleton.findSlot('result'),face=skeleton.findSlot('face_'+point);
  assert.equal(result.getAttachment().path,'flat_'+point);
  if(time===.6)assert.ok(result.color.a===0||result.color.a===1,'Float32 boundary still displays exactly one representation');
  else assert.equal(result.color.a,time<.6?0:1,'Result alpha switches atomically at landing');
  if(result.color.a===1){for(let other=1;other<=6;other++)assert.equal(skeleton.findSlot('face_'+other).color.a,0);continue;}
  const attachment=face.getAttachment();assert.equal(attachment.name,'landed_'+point);assert.equal(attachment.path,'flat_'+point);
  if(time<.591667)continue;
  assert.equal(face.color.a,1);for(const channel of ['r','g','b'])near(face.color[channel],1,'Unlit final face',1e-6);
  assert.equal(skeleton.findSlot('shadow').color.a,0);
  for(let other=1;other<=6;other++)if(other!==point)assert.equal(skeleton.findSlot('face_'+other).color.a,0);
  const vertices=verticesOf(face),flat=result.getAttachment(),bone=result.bone;
  for(let i=0;i<attachment.regionUVs.length;i+=2){
   const x=flat.x+(attachment.regionUVs[i]-.5)*flat.width*flat.scaleX,y=flat.y+(.5-attachment.regionUVs[i+1])*flat.height*flat.scaleY;
   near(vertices[i],bone.a*x+bone.b*y+bone.worldX,'Handoff UV world X',.006);
   near(vertices[i+1],bone.c*x+bone.d*y+bone.worldY,'Handoff UV world Y',.006);
  }
 }
}
function assertContinuousParity(left,right){
 for(let point=1;point<=6;point++){
  const skeletons=[left,right].map(data=>new S.Skeleton(data)),states=[left,right].map(data=>{const config=new S.AnimationStateData(data);config.defaultMix=0;return new S.AnimationState(config);});
  const next=point%6+1,last=(point+1)%6+1;
  for(const [name,delta]of [['spin_'+point,.575],['standby_'+next,0],['spin_'+last,0],['spin_'+last,.3],['spin_'+last,.275],['spin_'+last,.025],['standby_'+point,0]]){
   for(let i=0;i<2;i++){
    if(states[i].getCurrent(0)?.animation.name!==name)states[i].setAnimation(0,name,false);
    states[i].update(delta);states[i].apply(skeletons[i]);skeletons[i].updateWorldTransform(S.Physics.update);
   }
   const [a,b]=skeletons;assert.deepEqual(a.drawOrder.map(slot=>slot.data.name),b.drawOrder.map(slot=>slot.data.name));
   for(let i=0;i<a.slots.length;i++){
    const x=a.slots[i],y=b.slots[i];assert.equal(x.getAttachment()?.name,y.getAttachment()?.name);assert.equal(x.getAttachment()?.path,y.getAttachment()?.path);
    for(const channel of ['r','g','b','a'])near(x.color[channel],y.color[channel],'Continuous slot color',1e-6);
    arrayNear(x.deform,y.deform,'Continuous deform');arrayNear(verticesOf(x),verticesOf(y),'Continuous world vertices');
   }
   if(name.startsWith('standby_')||states[1].getCurrent(0).trackTime<.55){
    for(let face=1;face<=6;face++)assert.equal(b.findSlot('face_'+face).getAttachment().name,'mesh_'+face,'Actions restore rolling attachments without setup reset');
   }
   if(name.startsWith('standby_'))assert.equal(b.findSlot('result').getAttachment().path,'flat_'+Number(name.split('_')[1]));
  }
 }
}
const cases=[{sourceSize:200,crop:[35,35,131,131],cropOffset:[.5,.5]},
 {sourceSize:512,crop:[0,0,512,512],cropOffset:[0,0]},
 {sourceSize:201,crop:[5,47,130,130],cropOffset:[-30.5,11.5]}],results=[];
for(const prepared of cases){
 const json=buildSpineJson(prepared);json.skeleton.images='./res/';json.skeleton.audio='./sound/';
 const {bytes,original,decoded}=load(json);assert.equal(decoded.animations.length,12);
 assert.deepEqual([...writeSpineBinary(json)],[...bytes],'deterministic output');
 for(const animation of original.animations){
  const other=decoded.findAnimation(animation.name);assert.ok(other);near(animation.duration,other.duration,'duration',1e-7);assert.equal(other.timelines.length,animation.timelines.length);
  for(let i=0;i<animation.timelines.length;i++){
   const a=animation.timelines[i],b=other.timelines[i];assert.equal(a.constructor,b.constructor);arrayNear(a.frames,b.frames,'timeline frames',1e-6);
   if(a instanceof S.DeformTimeline)for(let j=0;j<a.vertices.length;j++)arrayNear(a.vertices[j],b.vertices[j],'deform key');
   if(a instanceof S.DrawOrderTimeline)assert.equal(JSON.stringify(a.drawOrders),JSON.stringify(b.drawOrders));
   if(a instanceof S.AttachmentTimeline)assert.deepEqual([...a.attachmentNames],[...b.attachmentNames]);
  }
  const times=animation.name.startsWith('spin_')?[...new Set([0,.3,.549999,.55,.575,.583333,.591667,.599999,.6,.608333,.616667,.625,animation.duration,...Array.from({length:305},(_,i)=>Math.min(i/480,animation.duration))])]:[0,.3,1.9];
  for(const time of times)sample(original,decoded,animation.name,time);
  const p=Number(animation.name.split('_')[1]),skeleton=new S.Skeleton(decoded);skeleton.setToSetupPose();other.apply(skeleton,-1,other.duration,false,null,1,S.MixBlend.replace,S.MixDirection.mixIn);
  assert.equal(skeleton.findSlot('result').getAttachment().path,'flat_'+p);
 }
 assertAtomicLanding(original);assertAtomicLanding(decoded);assertContinuousParity(original,decoded);
 results.push({sourceSize:prepared.sourceSize,bytes:bytes.length,animations:12,imagesPath:decoded.imagesPath,audioPath:decoded.audioPath});
}
const stepped=buildSpineJson(cases[0]);
stepped.animations.spin_1.bones.daxiao_1.scale[0].curve='stepped';
stepped.animations.spin_1.slots.result.rgba[0].curve='stepped';
stepped.animations.spin_1.attachments.default.face_1.mesh_1.deform[0].curve='stepped';
stepped.events.dice_roll={int:-123,float:.75,string:'骰子',audio:'dice_roll.mp3',volume:.4,balance:-.1};
stepped.animations.spin_1.events.push({time:.2,name:'dice_roll',int:2147483647,float:.12345,string:'',volume:.3,balance:.2});
const special=load(stepped);for(const time of [0,.002,.1,.2,.299,.3,.6])sample(special.original,special.decoded,'spin_1',time);
const bad=mutate=>{const json=buildSpineJson(cases[0]);mutate(json);assert.throws(()=>writeSpineBinary(json),/Spine 二进制导出/);};
bad(json=>json.ik=[]);bad(json=>json.skeleton.spine='4.1.24');
bad(json=>json.skins[0].attachments.face_1.mesh_1.vertices.push(1));
bad(json=>json.animations.spin_1.bones.daxiao_1.scale[0].curve=[.1,.2,.3,.4]);
bad(json=>json.animations.spin_1.slots.result.alpha=[{value:1}]);
bad(json=>json.skins[0].attachments.anchor.anchor.type='clipping');
bad(json=>json.animations.spin_1.events[0].name='missing');
console.log(JSON.stringify({ok:true,format:'Spine 4.2 binary',officialRuntime:'4.2.120',cases:results,samples,maximumWorldDelta,
 landing:'Atomic result handoff after an untinted UV-aligned flat mesh; continuous AnimationState transitions without setup resets match JSON and binary',
 supported:'Regions, unweighted meshes, deform, RGBA, attachment, translate/scale, linear/stepped, drawOrder, events/audio',
 unsupportedFailsClosed:true,boundary:'Official JSON/Binary Runtime numerical parity; native .spine Editor and target game import are not certified.'},null,2));
