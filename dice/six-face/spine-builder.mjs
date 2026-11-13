// Browser-only replacement rig. Numeric mesh keys are not an image sequence.
// The original source images remain separate from the browser-generated atlas.
import {DICE_SIZE_SCALE} from '../presentation-scale.mjs';
import {CUBE_MOTION} from './cube-roll.mjs';
const ZOOM_PEAK=CUBE_MOTION.zoomPeak;
import {encodeRgbaPng} from './png-rgba.mjs';
export const SIX_FACE_MOTION_VERSION='rounded-roll-v8';
const ROLL_START=.025;
const LAND_START=.55,LAND_READY=.591667,HANDOFF=.6;
const CORNER_RADIUS=.19;
const CORE_HALF_SIZE=.5-CORNER_RADIUS;
const FACE = [
  {point:1,n:[0,0,1],u:[1,0,0],v:[0,1,0]},
  {point:6,n:[0,0,-1],u:[-1,0,0],v:[0,1,0]},
  {point:3,n:[1,0,0],u:[0,0,-1],v:[0,1,0]},
  {point:4,n:[-1,0,0],u:[0,0,1],v:[0,1,0]},
  {point:2,n:[0,1,0],u:[1,0,0],v:[0,0,-1]},
  {point:5,n:[0,-1,0],u:[1,0,0],v:[0,0,1]},
];
const clamp = (x,a=0,b=1) => Math.min(b,Math.max(a,x));
const smooth = x => { x=clamp(x); return x*x*(3-2*x); };
const round = x => Math.round(x*100)/100;
const time = x => Math.round(x*1e6)/1e6;
const mul = (a,b) => Array.from({length:9},(_,i) => {
  const c=Math.floor(i/3),r=i%3;
  return a[r]*b[c*3]+a[3+r]*b[c*3+1]+a[6+r]*b[c*3+2];
});
const rx = a => [1,0,0,0,Math.cos(a),Math.sin(a),0,-Math.sin(a),Math.cos(a)];
const ry = a => [Math.cos(a),0,-Math.sin(a),0,1,0,Math.sin(a),0,Math.cos(a)];
const transform = (m,p) => [0,1,2].map(i => m[i]*p[0]+m[3+i]*p[1]+m[6+i]*p[2]);
function rotation(t,point) {
  const f=FACE.find(f => f.point===point);
  const base=[f.u[0],f.v[0],f.n[0],f.u[1],f.v[1],f.n[1],f.u[2],f.v[2],f.n[2]];
  const p=smooth(t/.6);
  return mul(mul(ry(4*Math.PI*p),rx(6*Math.PI*p)),base);
}
function vertex(face,u,v) {
  const p=face.n.map((n,k) => n*.5+face.u[k]*(u-.5)+face.v[k]*(v-.5));
  const c=p.map(v => clamp(v,-CORE_HALF_SIZE,CORE_HALF_SIZE)),d=p.map((v,i) => v-c[i]),len=Math.hypot(...d);
  return c.map((v,i) => v+d[i]/len*CORNER_RADIUS);
}
// Sample each rounded band between the flat face and its shared edge, so a
// spinning silhouette has a curved corner instead of a single bevel facet.
const bevelSample=CORNER_RADIUS*(1-Math.tan(Math.PI/8));
const grid=[0,bevelSample,CORNER_RADIUS,.5,1-CORNER_RADIUS,1-bevelSample,1];
const side=grid.length,edge=side-1,hull=edge*4;
const uvs=[],triangles=[],vertexOrder=[];
// Spine requires hull vertices first, in boundary order.
for(let i=0;i<edge;i++) vertexOrder.push(i);
for(let i=0;i<edge;i++) vertexOrder.push(i*side+edge);
for(let i=edge;i>0;i--) vertexOrder.push(edge*side+i);
for(let i=edge;i>0;i--) vertexOrder.push(i*side);
for(let y=1;y<edge;y++) for(let x=1;x<edge;x++) vertexOrder.push(y*side+x);
for (const i of vertexOrder) uvs.push(grid[i%side],grid[Math.floor(i/side)]);
for (let y=0;y<edge;y++) for (let x=0;x<edge;x++) {
  const a=y*side+x;
  triangles.push(...[a,a+side,a+1,a+1,a+side,a+side+1].map(i => vertexOrder.indexOf(i)));
}
const points=FACE.map(f => vertexOrder.map(i => vertex(f,grid[i%side],1-grid[Math.floor(i/side)])));
const times=[...new Set([...Array.from({length:73},(_,i) => time(i/120)),.608333,.616667,.625,.633333])].sort((a,b) => a-b);
const rollTimes=times.filter(t => t<=HANDOFF);
function hasFacingFacet(vertices) {
  for (let i=0;i<triangles.length;i+=3) {
    const a=triangles[i]*2,b=triangles[i+1]*2,c=triangles[i+2]*2;
    const abX=vertices[b]-vertices[a],abY=vertices[b+1]-vertices[a+1];
    const acX=vertices[c]-vertices[a],acY=vertices[c+1]-vertices[a+1];
    if (abX*acY-abY*acX>0) return true;
  }
  return false;
}
const landingBlend = t => smooth((t-LAND_START)/(LAND_READY-LAND_START));
const flatBlend = t => t<ROLL_START ? 1-smooth(t/ROLL_START) : landingBlend(t);
const rollAlpha = t => t<HANDOFF ? 1 : 0;
// Slot RGBA interpolates all channels together. Finish the visible pose first,
// then step its alpha at handoff so two different silhouettes never crossfade.
const rgbaTimeline = color => times.map((t,i)=>({time:t,color:color(t),
  ...(t<HANDOFF&&times[i+1]>=HANDOFF?{curve:'stepped'}:{})}));
const hex = (shade,alpha) => {
  const c=Math.round(clamp(shade)*255).toString(16).padStart(2,'0');
  const a=Math.round(clamp(alpha)*255).toString(16).padStart(2,'0');
  return c+c+c+a;
};

function geometry(prepared) {
  const crop=prepared?.crop,sourceSize=Number(prepared?.sourceSize),offset=prepared?.cropOffset;
  if (!Array.isArray(crop)||crop.length!==4||!crop.every(Number.isInteger)||crop[2]<1||crop[3]<1||crop[2]>8192||crop[3]>8192||!Number.isFinite(sourceSize)||sourceSize<1||sourceSize>8192)
    throw Error('骰面裁框或原图尺寸无效');
  if (!Array.isArray(offset)||offset.length!==2||!offset.every(Number.isFinite)) throw Error('骰面中心偏移无效');
  return {crop:[...crop],sourceSize,faceWidth:200*crop[2]/sourceSize,faceHeight:200*crop[3]/sourceSize,
    offsetX:200*offset[0]/sourceSize,offsetY:-200*offset[1]/sourceSize};
}

// Exported separately so the same real Runtime can check JSON without a Canvas.
export function buildSpineJson(prepared, {zoomPeak = ZOOM_PEAK} = {}) {
  const {faceWidth,faceHeight,offsetX,offsetY}=geometry(prepared),bodyBone='daxiao_1';
  const hasZoom = zoomPeak !== 1;
  const project=(p,m) => {
    const q=transform(m,p),s=3.5/(4-q[2]);
    return [round(q[0]*s*faceWidth),round(q[1]*s*faceHeight)];
  };
  const slots=[{name:'anchor',bone:'root',attachment:'anchor',color:'ffffff00'},
    {name:'shadow',bone:'shadow_size',attachment:'shadow',color:'ffffff00'},
    ...FACE.map(f => ({name:'face_'+f.point,bone:bodyBone,attachment:'mesh_'+f.point,color:'ffffff00'})),
    {name:'result',bone:'all',attachment:'sz_1'}];
  // Slots have no transform in Spine: scale the region attachment while keeping
  // the slot directly on root, independent of the rolling dice bones.
  const attachments={anchor:{anchor:{type:'region',path:'anchor',width:30,height:30,scaleX:6,scaleY:6,color:'ffffff00'}},
    shadow:{shadow:{type:'region',path:'white',width:108,height:18,color:'214d23ff'}},
    result:Object.fromEntries(FACE.map(f => ['sz_'+f.point,{type:'region',path:'flat_'+f.point,width:faceWidth,height:faceHeight,x:offsetX,y:offsetY}]))};
  for (const f of FACE) {
    const vertices=uvs.map((v,i) => round((i%2?.5-v:v-.5)*(i%2?faceHeight:faceWidth)));
    attachments['face_'+f.point]={['mesh_'+f.point]:{type:'mesh',path:'roll_'+f.point,width:faceWidth,height:faceHeight,
      uvs:[...uvs],triangles:[...triangles],vertices,hull}};
    attachments['face_'+f.point]['landed_'+f.point]={type:'mesh',path:'flat_'+f.point,width:faceWidth,height:faceHeight,
      uvs:[...uvs],triangles:[...triangles],vertices:[...vertices],hull};
  }
  const animations={};
  for (let point=1;point<=6;point++) {
    const data={slots:{},bones:{},attachments:{default:{}},drawOrder:[]},bones=data.bones;
    if (hasZoom) {
      bones[bodyBone]={scale:[{x:1,y:1},{time:.3,x:zoomPeak,y:zoomPeak},{time:LAND_READY,x:1,y:1},{time:HANDOFF,x:1,y:1}]};
      bones.shadow_size={scale:bones[bodyBone].scale};
    }
    bones.dice_1={translate:rollTimes.map(t => ({time:t,y:round(Math.sin(Math.min(t/.55,1)*Math.PI)**2*13*(1+(zoomPeak-1)*(1-Math.abs(2*clamp(t/.6)-1))))}))};
    data.slots.shadow={rgba:rgbaTimeline(t => hex(1,.15*smooth(t/.08)*(1-landingBlend(t))))};
    data.slots.result={attachment:[{name:'sz_'+point}],rgba:rgbaTimeline(t => hex(1,1-rollAlpha(t)))};
    const rotations=new Map(times.map(t=>[t,rotation(t,point)]));
    let lastOrder='';
    for (const t of times) {
      const m=rotations.get(t),order=[0,1,...FACE.map((f,i) => ({i:i+2,z:transform(m,f.n)[2]})).sort((a,b) => a.z-b.z).map(f => f.i),8];
      if (order.join()!==lastOrder) {
        data.drawOrder.push({time:t,offsets:slots.flatMap((s,i) => {
          const offset=order.indexOf(i)-i;
          return offset?[{slot:s.name,offset}]:[];
        })});
        lastOrder=order.join();
      }
    }
    for (const [i,f] of FACE.entries()) {
      const slot='face_'+f.point,name='mesh_'+f.point,setup=attachments[slot][name].vertices;
      const projected=new Map(rollTimes.map(t => [t,points[i].flatMap(p => project(p,rotations.get(t)))]));
      // A curved side is visible if any facet faces the camera. Center-normal
      // opacity fades cut through the bevel even where it forms the silhouette.
      const facing=new Set(rollTimes.filter(t => hasFacingFacet(projected.get(t))));
      data.attachments.default[slot]={[name]:{deform:rollTimes.map(t => ({time:t,
        vertices:projected.get(t).map((v,k) => round(v-setup[k]))}))}};
      if(f.point===point){
        // Deform the transparent face into and out of the roll on one slot.
        // The separate result slot appears only at the final handoff.
        const flatFrames=rollTimes.filter(t=>t<=ROLL_START || t>=LAND_START);
        data.attachments.default[slot]['landed_'+f.point]={deform:flatFrames.map(t=>({time:t,
          vertices:projected.get(t).map((v,k)=>round((v-setup[k])*(1-flatBlend(t))))}))};
      }
      const flatName='landed_'+f.point;
      const attachment=f.point===point
        ? [{name:flatName},{time:ROLL_START,name},{time:LAND_START,name:flatName}]
        : [{name}];
      const rgba=rgbaTimeline(t => {
        const n=transform(rotations.get(t),f.n),light=Math.max(0,(-.35*n[0]+.55*n[1]+n[2])/Math.hypot(.35,.55,1));
        const flat=flatBlend(t),shade=.78+.22*light;
        return hex(f.point===point?shade+(1-shade)*flat:shade,
          facing.has(t)?rollAlpha(t)*(f.point===point?1:1-flat):0);
      });
      for (let k=0;k<rgba.length-1;k++) {
        const t=times[k],next=times[k+1];
        if (t>=ROLL_START&&next<=LAND_START&&facing.has(t)!==facing.has(next)) {
          rgba[k].curve='stepped';
          // Align the visibility switch with 60 fps sampling even when the
          // six-decimal key and Spine Float32 conversion round upward.
          rgba[k+1].time=time(next-.000001);
        }
      }
      data.slots[slot]={attachment,rgba};
    }
    data.events=[{time:0,name:'dice_roll'},...(point===6?[{time:.6,name:'sound_ui_dice6'}]:[])];
    animations['spin_'+point]=data;
    animations['standby_'+point]={slots:{result:{attachment:[{name:'sz_'+point}],rgba:[{color:'ffffffff'}]},
      shadow:{rgba:[{color:'ffffff00'}]},...Object.fromEntries(FACE.map(f => ['face_'+f.point,{attachment:[{name:'mesh_'+f.point}],rgba:[{color:'ffffff00'}]}]))},
      bones:{...(hasZoom?{[bodyBone]:{scale:[{x:1,y:1}]}}:{}),dice_1:{translate:[{x:0,y:0}]}}};
  }
  return {skeleton:{spine:'4.2.43',x:-150,y:-150,width:300,height:300,images:'./images/',audio:'./audio/'},
    bones:[{name:'root'},{name:'all',parent:'root',scaleX:DICE_SIZE_SCALE,scaleY:DICE_SIZE_SCALE},{name:'dice_1',parent:'all',x:offsetX,y:offsetY},
      {name:bodyBone,parent:'dice_1'},{name:'shadow_size',parent:'all',x:offsetX,y:offsetY-66}],
    slots,skins:[{name:'default',attachments}],
    events:{dice_roll:{audio:'dice_roll.mp3'},sound_ui_dice6:{audio:'sound_ui_dice6.mp3'}},animations};
}

function size(image) {
  return [Number(image?.naturalWidth??image?.width),Number(image?.naturalHeight??image?.height)];
}
function canvas(width,height) {
  let result;
  if (globalThis.document?.createElement) result=document.createElement('canvas');
  else if (typeof OffscreenCanvas!=='undefined') result=new OffscreenCanvas(width,height);
  else throw Error('当前环境无法创建骰面画布');
  result.width=width; result.height=height;
  const context=result.getContext('2d',{alpha:true});
  if (!context) throw Error('无法创建二维纹理画布');
  return {image:result,context};
}
function abortIf(signal) {
  if (signal?.aborted) throw new DOMException('操作已取消','AbortError');
}
const align16 = n => Math.ceil(n/16)*16;
function layout(width,height) {
  // Adjacent flat/roll pairs let PNG compression reuse their shared color data.
  for (const columns of [2,4]) {
    const regions=Array.from({length:12},(_,i) => ({name:`${i%2?'roll':'flat'}_${Math.floor(i/2)+1}`,
      x:i%columns*(width+4)+2,y:Math.floor(i/columns)*(height+4)+2,width,height}));
    const bottom=Math.ceil(12/columns)*(height+4)+2;
    regions.push({name:'white',x:2,y:bottom,width:64,height:16},{name:'anchor',x:70,y:bottom,width:30,height:30});
    const w=align16(Math.max(...regions.map(r => r.x+r.width))+2),h=align16(Math.max(...regions.map(r => r.y+r.height))+2);
    if (w<=2048&&h<=2048) return {width:w,height:h,columns,padding:2,regions};
  }
  throw Error('骰面纹理无法装入 2048 图集');
}

function compactGreenLayout(cropW, cropH) {
  const width = 430, height = 424, padding = 2;
  const flatScale = Math.min(1, 130 / Math.max(cropW, cropH));
  const flatW = Math.max(1, Math.round(cropW * flatScale));
  const flatH = Math.max(1, Math.round(cropH * flatScale));
  const sheetY = 2 * (flatH + 2 * padding);
  const rollScale = Math.min(1, 96 / cropW, (Math.floor((height - sheetY) / 2) - 2 * padding) / cropH);
  const rollW = Math.max(1, Math.round(cropW * rollScale));
  const rollH = Math.max(1, Math.round(cropH * rollScale));
  const grid = (prefix, w, h, top) => Array.from({length:6}, (_, index) => ({
    name: prefix + (index + 1), x: (index % 3) * (w + 2 * padding) + padding,
    y: top + Math.floor(index / 3) * (h + 2 * padding) + padding, width:w, height:h,
  }));
  const flats = grid('flat_', flatW, flatH, 0);
  const rolls = grid('roll_', rollW, rollH, sheetY);
  const sheet = {name:'roll_sheet', x:0, y:sheetY, width:3 * (rollW + 2 * padding), height:2 * (rollH + 2 * padding)};
  const props = [{name:'white',x:326,y:sheetY + 2,width:64,height:16},
    {name:'anchor',x:394,y:sheetY + 2,width:30,height:30}];
  return {width,height,padding,flatScale,rollScale,flats,rolls,sheet,
    regions:[...flats,sheet,...props],tiles:[...flats,...rolls,...props]};
}

function applyCompactGreenAtlas(json, packing) {
  // Android AssetManager does not normalize the leading './' in asset names.
  Object.assign(json.skeleton, {x:-100,y:-100,width:200,height:200,fps:30,images:'res/',audio:''});
  for (const event of Object.values(json.events)) event.audio = 'sound/' + event.audio;
  for (const [index, tile] of packing.rolls.entries()) {
    const point = index + 1;
    const mesh = json.skins[0].attachments['face_' + point]['mesh_' + point];
    const {x,y,width,height} = packing.sheet;
    mesh.path = packing.sheet.name;
    // The source has opaque roll tiles and separate transparent landing tiles.
    // Map only the rolling UVs into their tiles; leave geometry and keys intact.
    mesh.uvs = mesh.uvs.map((v, i) => i % 2
      ? (tile.y - y + v * tile.height) / height
      : (tile.x - x + v * tile.width) / width);
  }
}
function extrude(atlas,image,r) {
  const {x,y,width:w,height:h}=r,source=image.data,data=atlas.data;
  for(let row=0;row<h;row++)data.set(source.subarray(row*w*4,(row+1)*w*4),((y+row)*atlas.width+x)*4);
  const pixel=(sx,sy,dx,dy) => {
    const start=(sy*w+sx)*4;data.set(source.subarray(start,start+4),(dy*atlas.width+dx)*4);
  };
  for(let row=0;row<h;row++){pixel(0,row,x-1,y+row);pixel(w-1,row,x+w,y+row);}
  for(let col=0;col<w;col++){pixel(col,0,x+col,y-1);pixel(col,h-1,x+col,y+h);}
  for(const [sx,sy,dx,dy] of [[0,0,x-1,y-1],[w-1,0,x+w,y-1],[0,h-1,x-1,y+h],[w-1,h-1,x+w,y+h]])pixel(sx,sy,dx,dy);
}

export async function buildSpineAssets(prepared,{name='自定义骰子',signal,anchorImage,compactGreen=false}={}) {
  abortIf(signal);
  if(!size(anchorImage).every(value=>value>0))throw Error('缺少有效的 anchor.png');
  const geo=geometry(prepared),[left,top,cropW,cropH]=geo.crop;
  // Validate all six before allocating or producing any output.
  for (let p=1;p<=6;p++) {
    const landing=prepared.landingImages?.[p],texture=prepared.textures?.[p];
    const [lw,lh]=size(landing),[tw,th]=size(texture);
    if (!(lw>0&&lh>0&&tw>0&&th>0)) throw Error('第 '+p+' 面缺少完整的落地图或滚动纹理');
    if (prepared.landingCropped ? lw!==cropW||lh!==cropH : lw!==geo.sourceSize||lh!==geo.sourceSize)
      throw Error('第 '+p+' 面落地图尺寸与统一裁框不一致');
    if (tw!==cropW||th!==cropH) throw Error('第 '+p+' 面滚动纹理尺寸与统一裁框不一致');
  }
  // A full 512-square source needs a four-pixel reduction to fit 12 regions
  // plus gutters in one <=2048 atlas. Original files and logical geometry stay intact.
  const rasterScale=Math.min(1,508/Math.max(cropW,cropH));
  const width=Math.max(1,Math.round(cropW*rasterScale)),height=Math.max(1,Math.round(cropH*rasterScale));
  const packing=compactGreen?compactGreenLayout(cropW,cropH):layout(width,height),images={},owned=[];
  const make=(w,h) => { const result=canvas(w,h); owned.push(result.image); return result; };
  try {
  for (let p=1;p<=6;p++) {
    abortIf(signal);
    const flatW=packing.flats?.[p-1].width??width,flatH=packing.flats?.[p-1].height??height;
    const rollW=packing.rolls?.[p-1].width??width,rollH=packing.rolls?.[p-1].height??height;
    const flat=make(flatW,flatH),roll=make(rollW,rollH);
    if (prepared.landingCropped) flat.context.drawImage(prepared.landingImages[p],0,0,flatW,flatH);
    else flat.context.drawImage(prepared.landingImages[p],left,top,cropW,cropH,0,0,flatW,flatH);
    roll.context.drawImage(prepared.textures[p],0,0,rollW,rollH);
    const flatData=flat.context.getImageData(0,0,flatW,flatH).data,rollData=roll.context.getImageData(0,0,rollW,rollH).data;
    const edgeColors=flatW===rollW&&flatH===rollH?rollData:(() => {
      const bleed=make(flatW,flatH);
      bleed.context.drawImage(prepared.textures[p],0,0,flatW,flatH);
      return bleed.context.getImageData(0,0,flatW,flatH).data;
    })();
    for(let at=3;at<rollData.length;at+=4)
      if(rollData[at]!==255)throw Error('第 '+p+' 面滚动纹理需要完整的不透明边缘颜色');
    for(let at=0;at<flatData.length;at+=4) {
      // Canvas has already discarded RGB at alpha=0. Restore the matching
      // nearest-body RGB from prepared opaque textures before straight-alpha filtering.
      if(flatData[at+3]===0)flatData.set(edgeColors.subarray(at,at+3),at);
    }
    images['flat_'+p]={width:flatW,height:flatH,data:flatData};images['roll_'+p]={width:rollW,height:rollH,data:rollData};
  }
  const shadow=make(256,64); shadow.context.fillStyle='#ffffff';
  shadow.context.beginPath(); shadow.context.ellipse(128,32,128,32,0,0,Math.PI*2); shadow.context.fill();
  const white=make(64,16);white.context.drawImage(shadow.image,0,0,64,16);
  const whiteData=white.context.getImageData(0,0,64,16).data;
  for(let at=0;at<whiteData.length;at+=4)whiteData.set([255,255,255],at);
  images.white={width:64,height:16,data:whiteData};
  const anchor=make(30,30);anchor.context.drawImage(anchorImage,0,0,30,30);
  images.anchor={width:30,height:30,data:anchor.context.getImageData(0,0,30,30).data};
  const page={width:packing.width,height:packing.height,data:new Uint8Array(packing.width*packing.height*4)};
  for(const region of packing.tiles||packing.regions)extrude(page,images[region.name],region);
  const atlasPage='dice.png',lines=[atlasPage,`size: ${packing.width},${packing.height}`,'format: RGBA8888',
    'filter: Linear,Linear','repeat: none','pma: false'];
  for (const r of packing.regions) lines.push(r.name,'  rotate: false',`  xy: ${r.x},${r.y}`,`  size: ${r.width},${r.height}`,
    `  orig: ${r.width},${r.height}`,'  offset: 0,0','  index: -1');
  const zoomPeak=compactGreen?1:ZOOM_PEAK;
  const atlasText=lines.join('\n')+'\n',json=buildSpineJson(prepared,{zoomPeak});
  if(compactGreen)applyCompactGreenAtlas(json,packing);
  const encoded=await encodeRgbaPng(page.width,page.height,page.data,{signal}),textureBlob=encoded.blob;
  const metadata={name:String(name).trim().slice(0,120)||'自定义骰子',format:'Spine 4.2 JSON; MeshAttachment + DeformTimeline',
    spine:'4.2.43',imageSequences:0,staticImages:packing.regions.length,faceMeshes:6,landingMeshes:6,faceMeshVertices:vertexOrder.length,hull,
    motionVersion:SIX_FACE_MOTION_VERSION,landing:{start:LAND_START,ready:LAND_READY,switch:HANDOFF,overlap:false},
    anchor:{slot:'anchor',bone:'root',attachment:'anchor',image:'images/anchor.png',width:30,height:30,scaleX:6,scaleY:6,opacity:0},
    crop:geo.crop,sourceSize:geo.sourceSize,cropOffset:[...prepared.cropOffset],logicalSize:[geo.faceWidth,geo.faceHeight],
    logicalOffset:[geo.offsetX,geo.offsetY],rasterScale:packing.flatScale??rasterScale,atlas:packing,rollEnd:.6,settleEnd:.633333,zoomPeak,
    pngEncoding:encoded.method,transparentRgb:'Flat alpha-zero RGB copied from corresponding opaque rolling texture; raw RGBA atlas with one-pixel extrusion.',
    animations:Object.keys(json.animations),notes:['Derived images are browser-normalized; no byte-for-byte original RGB equivalence is claimed.',
      'Original images are retained separately; .skel game data is written by the browser packager; native .spine still requires the Editor.',
      'Spine 4.2 mesh/deform JSON support is required; Editor and target game acceptance remain separate checks.']};
  if(compactGreen)return {json,atlasText,textureBlob,atlasPage,metadata};
  const files={'dice.json':new Blob([JSON.stringify(json)],{type:'application/json'}),
    'dice.atlas':new Blob([atlasText],{type:'text/plain'}),'dice.png':textureBlob,
    'build-info.json':new Blob([JSON.stringify(metadata,null,2)],{type:'application/json'})};
  for(const [path,image] of Object.entries(images))files['images/'+path+'.png']=(await encodeRgbaPng(image.width,image.height,image.data,{signal})).blob;
  files['README.txt']=new Blob([
    '骰子 Spine 资源包\n\n'+
    '这是新建的 Spine 4.2 JSON 骨架，包含 spin_1..6 和 standby_1..6、六面 Mesh、Deform、RGBA 与 drawOrder 时间线。\n'+
    '旋转使用数值顶点关键帧；14张图片都是静态贴图，不含逐帧图片序列。\n'+
    'anchor 插槽直接挂在 root；引用 images/anchor.png，30×30 图片附件缩放为 6×6（180×180），插槽与附件不透明度均为 0，不参与翻滚或缩放时间线。\n'+
    '使用 dice.json + dice.atlas + dice.png；images/ 为编辑器使用的独立贴图。Runtime 必须支持 Spine 4.2 JSON 与网格变形。\n'+
    'source-png/（如提供）保留原始文件。派生平面图的全透明像素回填对应滚动贴图的边缘颜色；图集直接写入 RGBA 并挤出一像素边缘，PNG 编码不经过 Canvas.toBlob。派生贴图不声称与原始 PNG 的所有 RGB 字节相同。\n'+
    '浏览器资源打包可生成真实 Spine 4.2 .skel 运行数据；原生 .spine 工程仍需匹配版本的 Spine Editor。\n'+
    '浏览器预览通过不代表 Spine Editor 或目标游戏已经验收；请在实际目标 Runtime 中检查动作、图集与透明边缘。\n'
  ],{type:'text/plain;charset=utf-8'});
  files['manifest.json']=new Blob([JSON.stringify({name:metadata.name,format:metadata.format,spine:metadata.spine,
    atlasPage,animations:metadata.animations,staticImages:14,imageSequences:0,
    files:Object.entries(files).map(([path,blob]) => ({path,bytes:blob.size}))},null,2)],{type:'application/json'});
  abortIf(signal);
  return {json,atlasText,textureBlob,atlasPage,files,metadata};
  } finally {
    // No Canvas ownership escapes this function, including cancellation/failure.
    for (const image of owned) { image.width=1; image.height=1; }
  }
}

let zipLoading;
async function zipFactory() {
  if (!globalThis.JSZip) {
    if (!globalThis.document?.head) throw Error('当前环境无法加载 ZIP 组件');
    if (!zipLoading) zipLoading=new Promise((resolve,reject) => {
      const script=document.createElement('script'); script.src='/vendor/jszip-3.10.1.min.js';
      script.onload=resolve; script.onerror=() => { zipLoading=null; script.remove(); reject(Error('ZIP 组件加载失败，请重试')); };
      document.head.append(script);
    });
    await zipLoading;
  }
  if (!globalThis.JSZip) throw Error('ZIP 组件不可用');
  return new globalThis.JSZip();
}
export async function spineZip(assets,{sources,signal}={}) {
  abortIf(signal);
  if (!assets?.json||!assets?.textureBlob||!assets?.files) throw Error('请先完成全部六面的 Spine 资源生成');
  const zip=await zipFactory();
  for (const [path,blob] of Object.entries(assets.files)) { abortIf(signal); zip.file(path,await blob.arrayBuffer()); }
  const entries=sources instanceof Map?[...sources]:Array.isArray(sources)?sources.map(file => [file.name,file]):Object.entries(sources||{});
  const seen=new Set();
  for (const [filename,blob] of entries) {
    abortIf(signal);
    const basename=String(filename||'').split(/[\\/]/).pop();
    if (!basename||basename==='.'||basename==='..'||seen.has(basename)||typeof blob?.arrayBuffer!=='function') throw Error('原始素材文件名或文件内容无效');
    seen.add(basename); zip.file('source-png/'+basename,await blob.arrayBuffer());
  }
  return zip.generateAsync({type:'blob',mimeType:'application/zip',compression:'DEFLATE',compressionOptions:{level:6}},() => abortIf(signal));
}
