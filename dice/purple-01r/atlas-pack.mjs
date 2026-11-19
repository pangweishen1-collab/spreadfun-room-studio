// 01R-only MaxRects packing. No rotation/resampling or pixel changes happen
// here: each source retains a one-pixel clear outside border on every side.
const contains = (a,b) => b.x>=a.x && b.y>=a.y && b.x+b.w<=a.x+a.w && b.y+b.h<=a.y+a.h;
const intersects = (a,b) => a.x<b.x+b.w && a.x+a.w>b.x && a.y<b.y+b.h && a.y+a.h>b.y;

function precedes(a,b) {
  for (let index=0;index<a.length;index++) if (a[index]!==b[index]) return a[index]<b[index];
  return false;
}

function remainingSpace(free, used) {
  const next=[];
  for (const box of free) {
    if (!intersects(box,used)) { next.push(box); continue; }
    const right=box.x+box.w,bottom=box.y+box.h;
    if (used.x>box.x) next.push({x:box.x,y:box.y,w:used.x-box.x,h:box.h});
    if (used.x+used.w<right) next.push({x:used.x+used.w,y:box.y,w:right-used.x-used.w,h:box.h});
    if (used.y>box.y) next.push({x:box.x,y:box.y,w:box.w,h:used.y-box.y});
    if (used.y+used.h<bottom) next.push({x:box.x,y:used.y+used.h,w:box.w,h:bottom-used.y-used.h});
  }
  return next.filter((box,index)=>!next.some((other,otherIndex)=>otherIndex!==index &&
    contains(other,box) && (!contains(box,other) || otherIndex<index)));
}

function place(ordered,width,maxSize) {
  let free=[{x:0,y:0,w:width,h:maxSize}],right=0,bottom=0;
  const positions=[];
  for (const region of ordered) {
    const w=region.w+2,h=region.h+2;
    let best;
    for (const box of free) {
      if (box.w<w || box.h<h) continue;
      const score=[Math.min(box.w-w,box.h-h),Math.max(box.w-w,box.h-h),box.y,box.x];
      if (!best || precedes(score,best.score)) {
        best={x:box.x,y:box.y,w,h,score};
      }
    }
    if (!best) return null;
    positions.push({...region,x:best.x+1,y:best.y+1});
    right=Math.max(right,best.x+w);bottom=Math.max(bottom,best.y+h);
    free=remainingSpace(free,best);
  }
  return {width:right,height:bottom,positions};
}

/** The returned page matches the existing dice.png atlas contract. */
export function packPurple01RRegions(regions,{maxSize=1024}={}) {
  if (!Number.isInteger(maxSize) || maxSize<3) throw Error('01R 图集尺寸上限无效');
  if (!Array.isArray(regions) || !regions.length) return null;
  const names=new Set();
  let area=0,minWidth=0;
  for (const {id,w,h,pixels} of regions) {
    if (typeof id!=='string' || !id || /[\r\n]/.test(id) || names.has(id)) throw Error('01R 图集区域名称无效或重复');
    if (!Number.isInteger(w) || !Number.isInteger(h) || w<1 || h<1 || pixels?.length!==w*h*4) {
      throw Error('01R 图集区域需要完整 RGBA 数据：'+id);
    }
    names.add(id);area+=(w+2)*(h+2);minWidth=Math.max(minWidth,w+2);
    if (w+2>maxSize || h+2>maxSize) return null;
  }
  if (area>maxSize*maxSize) return null;
  const widths=[...new Set([256,384,512,640,768,896,maxSize,
    Math.max(minWidth,Math.ceil(Math.sqrt(area)))])].filter(width=>width>=minWidth && width<=maxSize);
  const areaOf=region=>(region.w+2)*(region.h+2);
  const sorts=[(a,b)=>areaOf(b)-areaOf(a) || b.h-a.h || b.w-a.w,
    (a,b)=>Math.max(b.w,b.h)-Math.max(a.w,a.h) || areaOf(b)-areaOf(a),
    (a,b)=>b.h-a.h || b.w-a.w];
  let selected;
  for (const sort of sorts) for (const width of widths) {
    const candidate=place([...regions].sort(sort),width,maxSize);
    if (candidate && (!selected || candidate.width*candidate.height<selected.width*selected.height ||
      candidate.width*candidate.height===selected.width*selected.height && candidate.width<selected.width)) selected=candidate;
  }
  if (!selected) return null;
  const {width,height,positions}=selected,rgba=new Uint8Array(width*height*4);
  for (const {x,y,w,h,pixels} of positions) for (let row=0;row<h;row++) {
    rgba.set(pixels.subarray(row*w*4,(row+1)*w*4),((y+row)*width+x)*4);
  }
  const atlas=['dice.png','size: '+width+', '+height,'filter: Linear, Linear','pma: false',
    ...positions.flatMap(({id,x,y,w,h})=>[id,'bounds: '+[x,y,w,h].join(', ')]),''].join('\n');
  return {...selected,rgba,atlas};
}
