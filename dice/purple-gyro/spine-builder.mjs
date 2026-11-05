import {PURPLE_GYRO_MOTION_VERSION,clamp,smooth,gyroAt,transform} from './motion.mjs';
export {PURPLE_GYRO_MOTION_VERSION};
export const PURPLE_GYRO_BODY_VERSION='silhouette-only-v2';
const round=x=>Math.round(x*100)/100,time=x=>Math.round(x*1e6)/1e6;
const TIMES=[...new Set([...Array.from({length:66},(_,i)=>time(Math.min(i/120,.54))),.47,.535,.54,.58,.591667,.6,.633333])].sort((a,b)=>a-b);
const ORDER=[0,1,2,3,4,9,14,19,24,23,22,21,20,15,10,5,6,7,8,11,12,13,16,17,18];
const UV=ORDER.flatMap(i=>[i%5/4,Math.floor(i/5)/4]),TRI=[];
for(let y=0;y<4;y++)for(let x=0;x<4;x++){const a=y*5+x;TRI.push(...[a,a+5,a+1,a+1,a+5,a+6].map(i=>ORDER.indexOf(i)));}
export function inferPurpleBodyModel(image){
 // Grade fixes the rig. Coverage remains useful diagnostics, but must never
 // turn a square purple theme into the green-style six-face cube.
 const model={kind:'silhouette-bulging',version:PURPLE_GYRO_BODY_VERSION,inferred:false,rule:'purple grade always uses front/back and bulging silhouette side walls'};
 const {width:w,height:h,data}=image||{};if(!Number.isInteger(w)||!Number.isInteger(h)||w<1||h<1||data?.length!==w*h*4)return {...model,coverage:0,aspect:1};
 let l=w,t=h,r=0,b=0,count=0;for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(data[(y*w+x)*4+3]>=32){count++;l=Math.min(l,x);t=Math.min(t,y);r=Math.max(r,x+1);b=Math.max(b,y+1);}
 const width=r-l,height=b-t,coverage=width>0&&height>0?count/(width*height):0,aspect=height>0?width/height:1;
 return {...model,coverage,aspect};
}
function geometry(p){
 const crop=p?.crop,s=Number(p?.sourceSize),offset=p?.cropOffset;
 if(!Array.isArray(crop)||crop.length!==4||!crop.every(Number.isFinite)||crop[2]<=0||crop[3]<=0||!Number.isFinite(s)||s<=0||!Array.isArray(offset)||offset.length!==2||!offset.every(Number.isFinite))throw Error('紫色骰子注册几何无效');
 return {width:200*crop[2]/s,height:200*crop[3]/s,x:200*offset[0]/s,y:-200*offset[1]/s};
}
export function contourFromPixels(image,count=32){
 const {width:w,height:h,data}=image||{};
 if(!w||!h||data?.length!==w*h*4)return fallbackContour(count);
 const on=(x,y)=>x>=0&&y>=0&&x<w&&y<h&&data[(y*w+x)*4+3]>=32,edges=new Map();
 const add=(x,y,xx,yy)=>{const key=x+','+y;if(!edges.has(key))edges.set(key,[]);edges.get(key).push([xx,yy]);};
 for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(on(x,y)){
  if(!on(x,y-1))add(x,y,x+1,y);if(!on(x+1,y))add(x+1,y,x+1,y+1);if(!on(x,y+1))add(x+1,y+1,x,y+1);if(!on(x-1,y))add(x,y+1,x,y);
 }
 let best=[],area=0;
 while(edges.size){const [key]=edges.keys(),start=key.split(',').map(Number),loop=[start];let current=start;
  for(let guard=0;guard<w*h*4;guard++){
   const k=current.join(','),list=edges.get(k);if(!list?.length)break;const next=list.pop();if(!list.length)edges.delete(k);current=next;if(current[0]===start[0]&&current[1]===start[1])break;loop.push(current);
  }
  const a=loop.reduce((sum,p,i)=>{const q=loop[(i+1)%loop.length];return sum+p[0]*q[1]-q[0]*p[1];},0);
  if(a>area){area=a;best=loop;}
 }
 if(best.length<3)return fallbackContour(count);
 return resample(best.map(([x,y])=>[x/w,y/h]),count);
}
function fallbackContour(count){return Array.from({length:count},(_,i)=>{const a=i/count*Math.PI*2;return [.5+.44*Math.sign(Math.cos(a))*Math.abs(Math.cos(a))**.65,.5+.44*Math.sign(Math.sin(a))*Math.abs(Math.sin(a))**.65];});}
function resample(points,count){
 const lengths=points.map((p,i)=>Math.hypot(p[0]-points[(i+1)%points.length][0],p[1]-points[(i+1)%points.length][1])),total=lengths.reduce((a,b)=>a+b,0);if(total<1e-6)return fallbackContour(count);
 let segment=0,walk=0;
 return Array.from({length:count},(_,i)=>{const target=total*i/count;while(segment+1<points.length&&walk+lengths[segment]<target){walk+=lengths[segment++];}const p=points[segment],q=points[(segment+1)%points.length],a=(target-walk)/(lengths[segment]||1);return [p[0]+(q[0]-p[0])*a,p[1]+(q[1]-p[1])*a];});
}
const rgba=(shade,alpha)=>{const c=Math.round(clamp(shade)*255).toString(16).padStart(2,'0'),a=Math.round(clamp(alpha)*255).toString(16).padStart(2,'0');return c+c+c+a;};
const colorKeys=f=>TIMES.map((t,i)=>({time:t,color:f(t),...(TIMES[i+1]===.54||t>=.535?{curve:'stepped'}:{})}));
function alphaDepthSampler(image){
 const {width:w,height:h,data}=image||{};if(!Number.isInteger(w)||!Number.isInteger(h)||w<1||h<1||data?.length!==w*h*4)return null;
 const distance=new Uint16Array(w*h);for(let i=0;i<distance.length;i++)distance[i]=data[i*4+3]>=24?w+h:0;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=y*w+x;if(distance[i])distance[i]=Math.min(distance[i],x?distance[i-1]+1:1,y?distance[i-w]+1:1);}
 for(let y=h-1;y>=0;y--)for(let x=w-1;x>=0;x--){const i=y*w+x;if(distance[i])distance[i]=Math.min(distance[i],x+1<w?distance[i+1]+1:1,y+1<h?distance[i+w]+1:1);}
 return (u,v)=>{
  const x=clamp(u*w-.5,0,w-1),y=clamp(v*h-.5,0,h-1),x0=Math.floor(x),y0=Math.floor(y),x1=Math.min(w-1,x0+1),y1=Math.min(h-1,y0+1),fx=x-x0,fy=y-y0;
  const d=(distance[y0*w+x0]*(1-fx)+distance[y0*w+x1]*fx)*(1-fy)+(distance[y1*w+x0]*(1-fx)+distance[y1*w+x1]*fx)*fy;
  return .14+.22*smooth(d/18);
 };
}
export function buildPurpleSpineJson(prepared,{name='自定义紫色骰子'}={}){
 const geo=geometry(prepared),contour=prepared.contour?resample(prepared.contour,32):contourFromPixels(prepared.bodyPixels),half=.42,faceUV=UV;
 const setup=faceUV.map((v,i)=>round((i%2?.5-v:v-.5)*(i%2?geo.height:geo.width)));
 const depth=alphaDepthSampler(prepared.bodyPixels);
 const physical=(u,v,back=false)=>{const z=(back?-1:1)*(depth?depth(u,v):half*(.7+.3*Math.sin(Math.PI*clamp(u))*Math.sin(Math.PI*clamp(v)))),factor=(4-z)/4.725;return [(u-.5)*geo.width/100*factor,(.5-v)*geo.height/100*factor,z];};
 const meshPoints=back=>ORDER.map(i=>physical(i%5/4,Math.floor(i/5)/4,back));
 const project=(p,m)=>{const q=transform(m,p),scale=100*4.725/(4-q[2]);return [round(q[0]*scale),round(q[1]*scale)];};
 const attachments={anchor:{anchor:{type:'region',path:'anchor',width:30,height:30,scaleX:6,scaleY:6,color:'ffffff00'}},shadow:{shadow:{type:'region',path:'white',width:108,height:18,color:'29113fff'}},result:Object.fromEntries(Array.from({length:6},(_,i)=>['sz_'+(i+1),{type:'region',path:'flat_'+(i+1),width:geo.width,height:geo.height}]))};
 const meshes=[];
 const addFace=(slot,back,layer)=>{
  const mesh={type:'mesh',path:back?'flat_6':'roll_1',width:geo.width,height:geo.height,uvs:[...faceUV],triangles:back?TRI.flatMap((v,i)=>i%3===0?[TRI[i],TRI[i+2],TRI[i+1]]:[]):[...TRI],vertices:[...setup],hull:16};
  attachments[slot]={[back?'roll_back':'roll_front']:mesh};
  if(!back)for(let p=1;p<=6;p++)attachments[slot]['land_front_'+p]={...mesh,path:'flat_'+p,uvs:[...faceUV],triangles:[...TRI],vertices:[...setup]};
  meshes.push({slot,name:back?'roll_back':'roll_front',points:meshPoints(back),normal:[0,0,back?-1:1],ghost:layer!==2,layer,timeOffset:layer===0?-1/140:layer===1?1/140:0,ghostAlpha:layer===0?.22:.16,back,front:!back,setup});
 };
 addFace('gyro_blur_back',true,0);addFace('gyro_blur_front',false,0);addFace('gyro_blur_future_back',true,1);addFace('gyro_blur_future_front',false,1);
 for(let i=0;i<32;i++){
  const a=contour[i],b=contour[(i+1)%32],slot='gyro_side_'+String(i).padStart(2,'0');
  const ring=[0,.25,.5,.75,1],order=[0,1,3,5,7,9,8,6,4,2],at=(p,v)=>{const f=physical(...p),back=physical(...p,true),bulge=1+.12*Math.sin(Math.PI*v);return [(f[0]*(1-v)+back[0]*v)*bulge,(f[1]*(1-v)+back[1]*v)*bulge,f[2]*Math.cos(Math.PI*v)];},raw=ring.flatMap(v=>[at(a,v),at(b,v)]),points=order.map(n=>raw[n]),dx=(b[0]-a[0])*geo.width,dy=-(b[1]-a[1])*geo.height,len=Math.hypot(dx,dy)||1,uv=order.flatMap(n=>[(i+n%2)/32,ring[Math.floor(n/2)]]),vertices=uv.map((v,k)=>k%2?round((v-.5)*2):round((v-i/32)*32*2-1)),triangles=[];
  for(let j=0;j<4;j++){const a=j*2;triangles.push(...[a,a+1,a+2,a+1,a+3,a+2].map(n=>order.indexOf(n)));}
  attachments[slot]={side:{type:'mesh',path:'soft_wall',uvs:uv,triangles,vertices,width:geo.width,height:geo.height,hull:10}};
  // The inverse camera calibration makes these walls tapered, not vertical.
  // Their real normal has a Z component: dropping it hides valid wall strips
  // during precession and leaves a thin plate when the front is edge-on.
  const ab=raw[1].map((v,k)=>v-raw[0][k]),ac=raw[9].map((v,k)=>v-raw[0][k]);
  const cross=[ab[1]*ac[2]-ab[2]*ac[1],ab[2]*ac[0]-ab[0]*ac[2],ab[0]*ac[1]-ab[1]*ac[0]],length=Math.hypot(...cross);
  let normal=length>1e-10?cross.map(v=>v/length):[-dy/len,dx/len,0];
  if(normal[0]*-dy+normal[1]*dx<0)normal=normal.map(v=>-v);
  meshes.push({slot,name:'side',points,normal,side:true,setup:vertices,layer:2,timeOffset:0});
 }
 for(const mesh of [...meshes].filter(item=>item.side))for(const layer of [0,1]){
  const slot='gyro_blur_'+(layer===1?'future_':'')+mesh.slot.slice(5);attachments[slot]={side:{...attachments[mesh.slot].side,uvs:[...attachments[mesh.slot].side.uvs],vertices:[...mesh.setup]}};meshes.push({...mesh,slot,ghost:true,layer,timeOffset:layer===0?-1/140:1/140,ghostAlpha:layer===0?.22:.16});
 }
 addFace('gyro_back',true,2);addFace('gyro_front',false,2);
 const slots=[{name:'anchor',bone:'root',attachment:'anchor',color:'ffffff00'},{name:'shadow',bone:'shadow_size',attachment:'shadow',color:'ffffff00'},...meshes.map(m=>({name:m.slot,bone:'daxiao_1',attachment:m.name,color:'ffffff00'})),{name:'result',bone:'daxiao_1',attachment:'sz_1'}];
 const frameCache=new Map();
 const frame=(mesh,t)=>{
  const key=mesh.slot+':'+t;if(frameCache.has(key))return frameCache.get(key);
  const sample=mesh.ghost?Math.max(0,t+mesh.timeOffset):t,pose=gyroAt(sample),world=mesh.points.map(p=>transform(pose.rotation,p)),normal=transform(pose.rotation,mesh.normal),center=world.reduce((a,p)=>a.map((v,k)=>v+p[k]/world.length),[0,0,0]),facing=normal[0]*-center[0]+normal[1]*-center[1]+normal[2]*(4-center[2]),value={pose,world,normal,center,facing};
  frameCache.set(key,value);return value;
 };
 const visible=(mesh,t)=>{if(t>=.54)return 0;const f=frame(mesh,t),fade=smooth(f.facing/.16);if(mesh.ghost)return fade*mesh.ghostAlpha*smooth(t/.06)*(1-smooth((t-.43)/(.535-.43)));return fade;};
 const deformCache=new Map();
 const deformedVertices=(mesh,t)=>{const key=mesh.slot+':'+t;if(!deformCache.has(key)){const f=frame(mesh,t),master=gyroAt(t),ratio=mesh.ghost?f.pose.zoom/master.zoom:1,delta=mesh.ghost?[(f.pose.offset[0]-master.offset[0])/master.zoom,-(f.pose.offset[1]-master.offset[1])/master.zoom]:[0,0];deformCache.set(key,mesh.points.flatMap(p=>project(p,f.pose.rotation)).map((v,i)=>round(v*ratio+delta[i%2]-mesh.setup[i])));}return [...deformCache.get(key)];};
 const animations={};
 for(let point=1;point<=6;point++){
  const data={slots:{},bones:{daxiao_1:{scale:[{x:1,y:1},{time:.3,x:1.5,y:1.5},{time:.591667,x:1,y:1},{time:.6,x:1,y:1},{time:.633333,x:1,y:1}]},dice_1:{translate:TIMES.map(t=>{const p=gyroAt(t);return {time:t,x:round(p.offset[0]),y:round(-p.offset[1])};})}},attachments:{default:{}},drawOrder:[],events:[{time:0,name:'dice_roll'},...(point===6?[{time:.6,name:'sound_ui_dice6'}]:[])]};
  data.slots.result={attachment:[{name:'sz_'+point}],rgba:colorKeys(t=>rgba(1,t>=.54?1:0))};
  data.slots.shadow={rgba:colorKeys(t=>rgba(1,t<.54?.065*(1-smooth((t-.43)/.11)):0))};
  let last='';
  for(const t of TIMES){const priority=mesh=>(mesh.layer+1)%3,sorted=[...meshes].sort((a,b)=>priority(a)-priority(b)||frame(a,t).center[2]-frame(b,t).center[2]).map(m=>m.slot),order=['anchor','shadow',...sorted,'result'];if(order.join()!==last){data.drawOrder.push({time:t,offsets:slots.flatMap((s,i)=>{const offset=order.indexOf(s.name)-i;return offset?[{slot:s.name,offset}]:[];})});last=order.join();}}
  for(const mesh of meshes){
   const attachmentKeys=[{time:0,name:mesh.name},...(mesh.front?[{time:.47,name:'land_front_'+point}]:[])];
   data.slots[mesh.slot]={attachment:attachmentKeys,rgba:colorKeys(t=>{const f=frame(mesh,t),light=Math.max(0,(-.35*f.normal[0]+.55*f.normal[1]+f.normal[2])/Math.hypot(.35,.55,1));let shade=mesh.side?.92+.08*light:.8+.2*light;if(mesh.front&&!mesh.ghost)shade+=(1-shade)*smooth((t-.47)/.07);return rgba(shade,visible(mesh,t));})};
   const deform=(name,times)=>({[name]:{deform:times.map(t=>({time:t,vertices:deformedVertices(mesh,t)}))}});
   data.attachments.default[mesh.slot]={...deform(mesh.name,TIMES.filter(t=>t<=.54)),...(mesh.front?deform('land_front_'+point,TIMES.filter(t=>t>=.47)):{} )};
  }
  animations['spin_'+point]=data;
  animations['standby_'+point]={slots:{result:{attachment:[{name:'sz_'+point}],rgba:[{color:'ffffffff'}]},shadow:{rgba:[{color:'ffffff00'}]},...Object.fromEntries(meshes.map(mesh=>[mesh.slot,{attachment:[{name:mesh.name}],rgba:[{color:'ffffff00'}]}]))},bones:{daxiao_1:{scale:[{x:1,y:1}]},dice_1:{translate:[{x:0,y:0}]}}};
 }
 return {skeleton:{spine:'4.2.43',x:-150,y:-150,width:300,height:300,images:'./images/',audio:'./audio/'},bones:[{name:'root'},{name:'all',parent:'root'},{name:'dice_1',parent:'all',x:geo.x,y:geo.y},{name:'daxiao_1',parent:'dice_1'},{name:'shadow_size',parent:'all',x:geo.x,y:geo.y-66}],slots,skins:[{name:'default',attachments}],events:{dice_roll:{audio:'dice_roll.mp3'},sound_ui_dice6:{audio:'sound_ui_dice6.mp3'}},animations};
}
