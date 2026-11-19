import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {reuseRegions} from '../dice/purple-01r/region-reuse.mjs';
import {writeSpineBinary} from '../dice/six-face/spine-binary.mjs';

// Six distinct RGBA pixels, including nonzero RGB under alpha zero. Quarter
// turns are explicit independent layouts, rather than the helper's mapping.
const colors = [[255,0,0,255],[0,255,0,128],[0,0,255,0],
  [255,255,0,254],[255,0,255,129],[0,255,255,1]];
const layouts = [[0,1,2,3,4,5],[3,0,4,1,5,2],[5,4,3,2,1,0],[2,5,1,4,0,3]];
function region(id, turn = 0, scaleX = 1.2) {
  const [w,h] = turn % 2 ? [2,3] : [3,2];
  return {id,w,h,pixels:new Uint8Array(layouts[turn].flatMap(index => colors[index])),
    attachment:{type:'region',path:id,width:w*2,height:h*3,x:7,y:-4,
      rotation:17,scaleX,scaleY:.8}};
}
const inputs = [0,1,2,3].map(turn => region('r'+turn,turn));
const before = inputs.map(input => ({...input,attachment:{...input.attachment},pixels:new Uint8Array(input.pixels)}));
const reused = reuseRegions(inputs);
assert.equal(reused.packedRegions.length,1);
assert.equal(reused.allRegions.length,4);
assert.equal(reused.reusedCount,3);
assert.equal(reused.rotationReusedCount,3);
assert.deepEqual(inputs,before,'Input pixels, attachment transforms and metadata remain unchanged');
for (const input of inputs) assert.equal(reused.attachments[input.id].path,'r0');

const hiddenRgb = region('hidden-rgb');
hiddenRgb.pixels[8] ^= 1;
const alpha = region('alpha');
alpha.pixels[3]--;
assert.equal(reuseRegions([inputs[0],hiddenRgb,alpha]).packedRegions.length,3,
  'Different RGB under alpha zero and different alpha are both preserved');
const anchor = region('anchor');
assert.equal(reuseRegions([inputs[0],anchor]).packedRegions.length,2,'Anchor retains its required atlas key');
const differentlyPlaced = region('placed');
differentlyPlaced.attachment = {...differentlyPlaced.attachment,width:37,height:41,x:-13,y:22};
const placed = reuseRegions([inputs[0],differentlyPlaced]);
assert.deepEqual(placed.attachments.placed,{...differentlyPlaced.attachment,path:'r0'},
  'Identical pixels may have independent world sizes and positions');
assert.throws(() => reuseRegions([{...inputs[0],pixels:new Uint8Array(3)}]),/RGBA/);

const context = {console};
vm.createContext(context);
vm.runInContext(await readFile(new URL('../dice/vendor/spine-webgl.js',import.meta.url),'utf8'),context);
const S = context.spine;
function skeleton(region,attachment,atlasRegion,binary) {
  const atlas = new S.TextureAtlas('p.png\nsize: 8,8\nfilter: Linear,Linear\n'+atlasRegion.id+
    '\nbounds: 0,0,'+atlasRegion.w+','+atlasRegion.h+'\n');
  const loader = new S.AtlasAttachmentLoader(atlas);
  const json = {skeleton:{spine:'4.2.43',width:200,height:200},bones:[{name:'root'}],
    slots:[{name:'result',bone:'root',attachment:region.id}],
    skins:[{name:'default',attachments:{result:{[region.id]:attachment}}}],animations:{}};
  const data = binary ? new S.SkeletonBinary(loader).readSkeletonData(writeSpineBinary(json))
    : new S.SkeletonJson(loader).readSkeletonData(json);
  const result = new S.Skeleton(data);
  result.updateWorldTransform(S.Physics.update);
  return result;
}
function vertices(skeleton) {
  const slot=skeleton.findSlot('result'),result=new Float32Array(8);
  slot.getAttachment().computeWorldVertices(slot,result,0,2);
  return result;
}
let maximumWorldDelta=0,samples=0;
for (const scaleX of [1.2,-1.2]) {
  const originals=[0,1,2,3].map(turn=>region('r'+turn,turn,scaleX));
  const aliases=reuseRegions(originals);
  for (let turn=1;turn<4;turn++) for (const binary of [false,true]) {
    const original=vertices(skeleton(originals[turn],originals[turn].attachment,originals[turn],binary));
    const alias=vertices(skeleton(aliases.allRegions[turn],aliases.attachments['r'+turn],originals[0],binary));
    for (let corner=0;corner<4;corner++) for (let axis=0;axis<2;axis++) {
      const sourceCorner=(corner-turn+4)%4;
      const delta=Math.abs(original[corner*2+axis]-alias[sourceCorner*2+axis]);
      maximumWorldDelta=Math.max(maximumWorldDelta,delta);
      assert.ok(Number.isFinite(delta)&&delta<1e-4,'Rotated aliases preserve each corresponding world corner');
      samples++;
    }
  }
}
console.log(JSON.stringify({ok:true,format:'exact RGBA region reuse',quarterTurns:3,
  nativeJsonAndBinaryWorldSamples:samples,maximumWorldDelta,
  preserved:['transparent RGB','alpha','anchor key','input data','independent attachment geometry']},null,2));
