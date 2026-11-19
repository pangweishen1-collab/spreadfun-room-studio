import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {packPurple01RRegions} from '../dice/purple-01r/atlas-pack.mjs';
import {packRegions as oldShelf} from '../dice/purple-reference/runtime.mjs';

function region(id,w,h,seed=1) {
  const pixels=new Uint8Array(w*h*4);
  for (let i=0;i<pixels.length;i++) pixels[i]=(i*17+seed*31)%256;
  return {id,w,h,pixels,attachment:{type:'region',path:id,width:w*1.2,height:h*.8,x:7,y:-3}};
}
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
function checkPage(page,regions,maxSize) {
  assert.ok(page,'Regions must fit');
  assert.ok(page.width<=maxSize && page.height<=maxSize);
  assert.equal(page.positions.length,regions.length);
  assert.equal(page.rgba.length,page.width*page.height*4);
  for (const r of page.positions) {
    assert.ok(r.x>=1 && r.y>=1 && r.x+r.w<page.width && r.y+r.h<page.height,'One clear pixel at the page edge');
    const original=regions.find(source=>source.id===r.id);
    assert.deepEqual(r.attachment,original.attachment,'World attachment transforms stay unchanged');
    for (let row=0;row<r.h;row++) {
      const start=((r.y+row)*page.width+r.x)*4;
      assert.deepEqual(page.rgba.subarray(start,start+r.w*4),original.pixels.subarray(row*r.w*4,(row+1)*r.w*4),
        'All RGBA bytes, including hidden RGB, survive packing');
    }
    for (let x=r.x-1;x<=r.x+r.w;x++) for (const y of [r.y-1,r.y+r.h]) {
      assert.deepEqual([...page.rgba.subarray((y*page.width+x)*4,(y*page.width+x)*4+4)],[0,0,0,0]);
    }
    for (let y=r.y-1;y<=r.y+r.h;y++) for (const x of [r.x-1,r.x+r.w]) {
      assert.deepEqual([...page.rgba.subarray((y*page.width+x)*4,(y*page.width+x)*4+4)],[0,0,0,0]);
    }
  }
  for (let i=0;i<page.positions.length;i++) for (let j=i+1;j<page.positions.length;j++) {
    const a=page.positions[i],b=page.positions[j];
    assert.ok(a.x+a.w+1<=b.x-1 || b.x+b.w+1<=a.x-1 || a.y+a.h+1<=b.y-1 || b.y+b.h+1<=a.y-1,
      'The padded rectangles do not overlap');
  }
  assert.match(page.atlas,new RegExp('^dice\\.png\\nsize: '+page.width+', '+page.height+'\\nfilter: Linear, Linear\\npma: false\\n'));
}

// Shelf rows waste the space below either small right-hand rectangle. A
// 2-dimensional layout fills that space and leaves room for the wide bottom.
const adversarial=[region('tall',400,600),region('right_a',400,250,2),
  region('right_b',400,250,3),region('wide',800,200,4)];
const before=adversarial.map(r=>({pixels:hash(r.pixels),attachment:{...r.attachment}}));
assert.equal(oldShelf(adversarial,true,1024),null,'This real-sized case cannot fit the old shelf strategy');
const improved=packPurple01RRegions(adversarial);
checkPage(improved,adversarial,1024);
assert.ok(improved.width*improved.height<=804*804);
const again=packPurple01RRegions(adversarial);
assert.equal(again.atlas,improved.atlas,'Packing is deterministic');
assert.equal(hash(again.rgba),hash(improved.rgba));
assert.deepEqual(adversarial.map(r=>({pixels:hash(r.pixels),attachment:r.attachment})),before,'Inputs remain unchanged');

let seed=17;
const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed;};
for (let test=0;test<16;test++) {
  const regions=Array.from({length:24},(_,i)=>region('r'+i,3+random()%12,3+random()%12,i));
  checkPage(packPurple01RRegions(regions,{maxSize:96}),regions,96);
}
assert.equal(packPurple01RRegions([]),null);
assert.equal(packPurple01RRegions([region('too_wide',1023,1)]),null,'Padding counts toward the page limit');
assert.equal(packPurple01RRegions([region('a',9,9),region('b',9,9)],{maxSize:12}),null);
assert.throws(()=>packPurple01RRegions([region('same',1,1),region('same',1,1)]),/名称/);
assert.throws(()=>packPurple01RRegions([{...region('broken',1,1),pixels:new Uint8Array(1)}]),/RGBA/);
console.log(JSON.stringify({ok:true,strategy:'01R-only MaxRects',shelfFailureFits:[improved.width,improved.height],
  variedLayouts:16,padding:1,rgbaPreserved:true,greenPackerUnmodified:true},null,2));
