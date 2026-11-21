import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {motionAt,renderSamples} from '../dice/purple-01r/motion.mjs';
import {motionAt as forward} from '../dice/purple-reference/motion.mjs';
import {buildPurple01RSkeleton} from '../dice/purple-01r/spine-builder.mjs';
import {writeSpineBinary} from '../dice/six-face/spine-binary.mjs';

// A reverse turn must undo the approved forward trajectory, not mirror its
// pixels or substitute the unrelated 02 motion. Include fractional samples.
let poses=0;
for(let frame=0;frame<31;frame+=.25) {
  const inverse=motionAt(frame).rotation,original=forward('E',frame/60).rotation;
  for(let row=0;row<3;row++)for(let col=0;col<3;col++) {
    let value=0;
    for(let k=0;k<3;k++)value+=original[k*3+row]*inverse[col*3+k];
    assert(Math.abs(value-(row===col?1:0))<1e-12);
  }
  assert(renderSamples(frame).every(sample=>sample.rotation.every(Number.isFinite)));
  poses++;
}
assert(motionAt(16).rotation.some((value,index)=>[2,5,6,7].includes(index)&&Math.abs(value)>.1),'The roll must retain depth');

// Independent official-runtime readback checks the actual binary contract.
const context={console};vm.createContext(context);
vm.runInContext(await readFile(new URL('../dice/vendor/spine-webgl.js',import.meta.url),'utf8'),context);
const S=context.spine;
const rollIds=Array.from({length:32},(_,frame)=>'roll_'+frame);
const ids=[...rollIds,'anchor',...Array.from({length:6},(_,i)=>['sz_'+(i+1),'reveal_'+(i+1)+'_0','reveal_'+(i+1)+'_1']).flat()];
const regions=ids.map(id=>({id,attachment:{type:'region',path:id,width:200,height:200}}));
const atlas=new S.TextureAtlas('dice.png\nsize: 1024,1024\nfilter: Linear,Linear\npma: false\n'+ids.map(id=>id+'\nbounds: 0,0,200,200').join('\n')+'\n');
const json=buildPurple01RSkeleton(regions);
const data=new S.SkeletonBinary(new S.AtlasAttachmentLoader(atlas)).readSkeletonData(writeSpineBinary(json));
assert.equal(data.version,'4.2.43');assert.equal(data.width,200);assert.equal(data.height,200);assert.equal(data.fps,30);
assert.equal(data.imagesPath,'res/');assert.equal(data.audioPath,'');assert.equal(data.animations.length,12);
assert.equal(data.findBone('all').scaleX,Math.fround(.95));
for(const event of data.events)assert.match(event.audioPath,/^sound\/[a-z0-9_]+\.mp3$/);
const skeleton=new S.Skeleton(data);
let samples=0;
for(let point=1;point<=6;point++) {
  const spin=data.findAnimation('spin_'+point),standby=data.findAnimation('standby_'+point);
  assert(Math.abs(spin.duration-.633333)<1e-6);assert.equal(standby.duration,0);
  // Attachment timelines are stepped, even with fps=30 metadata. Every actual
  // 60 Hz tick must select its own pose rather than hold the preceding frame.
  for(let frame=0;frame<32;frame++) {
    spin.apply(skeleton,-1,Math.fround(frame/60),false,null,1,S.MixBlend.replace,S.MixDirection.mixIn);
    assert.equal(skeleton.findSlot('result').getAttachment().path,'roll_'+frame);
  }
  const revealKeys = [
    [32/60, 'reveal_'+point+'_0'], [33/60, 'reveal_'+point+'_0'],
    [34/60, 'reveal_'+point+'_1'], [35/60, 'reveal_'+point+'_1'],
    [.6, 'sz_'+point], [.633333, 'sz_'+point],
  ];
  for(const [time, expected] of revealKeys) {
    spin.apply(skeleton,-1,Math.fround(time),false,null,1,S.MixBlend.replace,S.MixDirection.mixIn);
    skeleton.updateWorldTransform(S.Physics.update);
    const visible=skeleton.slots.filter(slot=>slot.color.a>0&&slot.getAttachment());
    assert.equal(visible.length,1,'Two representations must never overlap');
    assert.equal(skeleton.findSlot('anchor').color.a,0);
    assert.equal(visible[0].getAttachment().path,expected);
    samples++;
  }
  const events=[];
  spin.apply(skeleton,-1,spin.duration,false,events,1,S.MixBlend.replace,S.MixDirection.mixIn);
  assert.deepEqual(Array.from(events,e=>[e.data.name,e.time]),
    [['dice_roll',0],...(point===6?[['sound_ui_dice6',Math.fround(.6)]]:[])]);
  standby.apply(skeleton,-1,0,false,null,1,S.MixBlend.replace,S.MixDirection.mixIn);
  assert.equal(skeleton.findSlot('result').getAttachment().path,'sz_'+point);
}
console.log(JSON.stringify({ok:true,poses,samples,checks:['reverse_undoes_forward_rotation','retains_depth','official_binary_contract','every_60hz_tick_selects_its_pose','atomic_landing_and_continuous_standby','android_sound_paths']}));
