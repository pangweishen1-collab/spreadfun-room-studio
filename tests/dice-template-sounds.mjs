// Tests use the shipped official Runtime, independent of the patch's byte writer.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {patchTemplateSounds} from '../dice/template-sounds.mjs';

const original=new Uint8Array(await readFile(new URL('../dice/assets/template.skel',import.meta.url))),saved=original.slice();
const patched=await patchTemplateSounds(original);assert.deepEqual(original,saved);assert.notEqual(patched.buffer,original.buffer);
const context={console};vm.createContext(context);vm.runInContext(await readFile(new URL('../dice/vendor/spine-webgl.js',import.meta.url),'utf8'),context);const S=context.spine;
const names=['1','2','anchor',...Array.from({length:6},(_,i)=>`sz_${i+1}`)];
const text='preview.png\nsize: 612,612\nformat: RGBA8888\nfilter: Linear,Linear\nrepeat: none\npma: false\n'+names.map((name,i)=>{const size=name==='anchor'?30:200;return `${name}\n bounds: ${(i%3)*204+2},${Math.floor(i/3)*204+2},${size},${size}\n offsets: 0,0,${size},${size}\n rotate: 0`;}).join('\n');
const atlas=new S.TextureAtlas(text),read=bytes=>new S.SkeletonBinary(new S.AtlasAttachmentLoader(atlas)).readSkeletonData(bytes);
const before=read(original),after=read(patched);
const plain=value=>{
  const seen=new WeakMap();
  const walk=(item,path)=>{
    if(item===null||typeof item!=='object')return item;
    if(ArrayBuffer.isView(item))return Array.from(item);
    if(seen.has(item))return {$ref:seen.get(item)};seen.set(item,path);
    if(Array.isArray(item))return Array.from(item,(v,i)=>walk(v,`${path}/${i}`));
    if(Object.prototype.toString.call(item)==='[object Set]')return Array.from(item,(v,i)=>walk(v,`${path}/${i}`));
    return Object.fromEntries(Object.entries(item).map(([key,v])=>[key,walk(v,`${path}/${key}`)]));
  };
  return walk(value,'');
};
const snapshot=data=>{const {events,animations,...structure}=data;return plain({structure,animations:animations.map(a=>({name:a.name,duration:a.duration,timelines:a.timelines.filter(t=>!(t instanceof S.EventTimeline))}))});};
assert.deepEqual(snapshot(after),snapshot(before),'All skeleton data, attachments, non-event timelines and every parsed curve value remain unchanged');
assert.equal(before.events.length,0);
assert.deepEqual(plain(after.events.map(e=>({name:e.name,audioPath:e.audioPath,intValue:e.intValue,floatValue:e.floatValue,stringValue:e.stringValue,volume:e.volume,balance:e.balance}))),[
  {name:'dice_roll',audioPath:'sound/dice_roll.mp3',intValue:0,floatValue:0,stringValue:'',volume:1,balance:0},
  {name:'sound_ui_dice6',audioPath:'sound/sound_ui_dice6.mp3',intValue:0,floatValue:0,stringValue:'',volume:1,balance:0},
]);
const events=[];
for(const animation of after.animations){
  const timeline=animation.timelines.filter(t=>t instanceof S.EventTimeline),point=Number(animation.name.split('_')[1]),spin=animation.name.startsWith('spin_');
  assert.equal(timeline.length,spin?1:0);
  const emitted=[],skeleton=new S.Skeleton(after);skeleton.setToSetupPose();animation.apply(skeleton,-1,animation.duration,false,emitted,1,S.MixBlend.replace,S.MixDirection.mixIn);
  assert.deepEqual(Array.from(emitted,e=>e.data.name),spin?(point===6?['dice_roll','sound_ui_dice6']:['dice_roll']):[]);
  if(spin){assert.equal(emitted[0].time,0);if(point===6)assert.ok(Math.abs(emitted[1].time-.6)<1e-6);}
  events.push({name:animation.name,events:Array.from(emitted,e=>({name:e.data.name,time:e.time,audioPath:e.data.audioPath}))});
}
assert.deepEqual(await patchTemplateSounds(original.buffer),patched);
const padded=new Uint8Array(original.length+12);padded.set(original,7);assert.deepEqual(await patchTemplateSounds(padded.subarray(7,7+original.length)),patched,'Byte offsets are respected');
assert.deepEqual(await patchTemplateSounds(new Blob([original])),patched);
await assert.rejects(patchTemplateSounds(patched),/不匹配/);
const changed=original.slice();changed[100]^=1;await assert.rejects(patchTemplateSounds(changed),/不匹配/);assert.deepEqual(original,saved);
await assert.rejects(patchTemplateSounds(new Uint8Array(20)),/不匹配/);
console.log(JSON.stringify({ok:true,sourceBytes:original.length,patchedBytes:patched.length,version:after.version,nonEventStructureAndCurvesUnchanged:true,eventData:2,animations:after.animations.length,events,strictUnknownTemplateRejection:true,inputUnchanged:true}));
