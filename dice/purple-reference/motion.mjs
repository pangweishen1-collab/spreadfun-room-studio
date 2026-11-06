// Local, deterministic 3D motion studies. Pose sampling is independent of the
// browser frame cadence; each blur sample is a complete opaque 3D exposure.
export const VARIANTS=Object.freeze([
  {id:'A',name:'斜轴厚体翻滚',description:'倾斜轴连续三圈，短曝光保留侧面厚度'},
  {id:'B',name:'双轴抛转',description:'双轴翻滚与小抛弧，前后面交替出现'},
  {id:'C',name:'体积拖尾冲转',description:'快速冲转、轻体积形变，减速回正收净'},
  {id:'D',name:'横轴侧滚',description:'以左右转面为主，连续侧滚三圈',feature:'侧面交替 · 低起伏'},
  {id:'E',name:'倾轴陀螺',description:'倾轴公转带动自转，悬浮收正',feature:'陀螺进动 · 浮起'},
  {id:'F',name:'三段快翻',description:'前翻、侧翻、斜翻依次完成',feature:'三段节奏 · 短暂停顿'},
  {id:'G',name:'双跳连滚',description:'两次小跳衔接向前翻滚',feature:'双跳落点 · 前向滚动'},
  {id:'H',name:'重曝疾转',description:'紧凑四圈疾转，更宽快门形成厚实曝光',feature:'四圈高速 · 密集曝光'},
]);
export const MOTION=Object.freeze({cycle:2,rollEnd:.54,shutterClearAt:.535,settleEnd:.58,landAt:.6,zoomPeak:1.5,zoomPeakAt:.3,zoomEnd:.591667,samples:9});
const TAU=Math.PI*2,I=Object.freeze([1,0,0,0,1,0,0,0,1]);
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
const smooth=x=>{x=clamp(x);return x*x*(3-2*x);};
const smoother=x=>{x=clamp(x);return x*x*x*(x*(x*6-15)+10);};
const ramp=(t,a,b)=>smooth((t-a)/(b-a));
function localTime(t){if(!Number.isFinite(t))throw new TypeError('动画时间必须为有限数值');return t<0?0:t%MOTION.cycle;}
function multiply(a,b){return Array.from({length:9},(_,i)=>{const r=i%3,c=Math.floor(i/3);return a[r]*b[c*3]+a[3+r]*b[c*3+1]+a[6+r]*b[c*3+2];});}
function axisRotation(axis,angle){
 const length=Math.hypot(...axis),[x,y,z]=axis.map(v=>v/length),c=Math.cos(angle),s=Math.sin(angle),k=1-c;
 return [c+x*x*k,y*x*k+z*s,z*x*k-y*s,x*y*k-z*s,c+y*y*k,z*y*k+x*s,x*z*k+y*s,y*z*k-x*s,c+z*z*k];
}
const rx=a=>axisRotation([1,0,0],a),ry=a=>axisRotation([0,1,0],a),rz=a=>axisRotation([0,0,1],a);
// Same linear key timing as the production green bone track, with the
// requested purple peak: 0:1, .3:1.5, .591667:1, .6:1.
function zoomAt(t){const amplitude=MOTION.zoomPeak-1;return t<=MOTION.zoomPeakAt?1+amplitude*clamp(t/MOTION.zoomPeakAt):1+amplitude*(1-clamp((t-MOTION.zoomPeakAt)/(MOTION.zoomEnd-MOTION.zoomPeakAt)));}
function checkedId(id){const value=String(id).toUpperCase();if(!VARIANTS.some(v=>v.id===value))throw new RangeError('未知 3D 动画方案');return value;}
function rotationAt(id,t){
 if(t>=MOTION.rollEnd)return [...I];
 const p=smoother(clamp(t/MOTION.rollEnd));
 if(id==='A')return axisRotation([1,.62,.24],TAU*3*p);
 if(id==='B')return multiply(rz(.24*Math.sin(TAU*p)),multiply(ry(TAU*2*p),rx(TAU*3*p)));
 if(id==='C')return multiply(rz(.14*Math.sin(TAU*p*2)),axisRotation([.42,1,.20],TAU*3*p));
 if(id==='D')return axisRotation([.12,1,.04],TAU*3*p);
 if(id==='E'){
  // A precessing tilted axis: real depth turns while the center floats.
  // Conjugating the spin preserves a proper rotation; the tilt closes at end.
  const tilt=.63*Math.sin(Math.PI*p),phase=TAU*p;
  return multiply(ry(phase),multiply(rx(tilt),multiply(rz(TAU*4*p),multiply(rx(-tilt),ry(-phase)))));
 }
 if(id==='F'){
  // Complete each integral turn before changing axis. Zero derivatives at the
  // segment boundaries give a deliberate beat without reversing direction.
  const phase=clamp(t/MOTION.rollEnd)*3,segment=Math.min(2,Math.floor(phase)),local=smoother(phase-segment);
  return axisRotation([[1,0,0],[0,1,0],[.68,.65,.25]][segment],TAU*local);
 }
 if(id==='G')return multiply(ry(.28*Math.sin(TAU*p)),rx(TAU*2*p));
 return axisRotation([.6,.85,.36],TAU*4*p);
}

export function motionAt(variant,time){
 const id=checkedId(variant),t=localTime(time),finish=t>=MOTION.landAt;
 if(t>=MOTION.settleEnd)return {time:t,rotation:[...I],stretch:[1,1,1],offset:[0,0],zoom:zoomAt(t),smear:0,finish};
 const u=clamp(t/MOTION.rollEnd),p=smoother(u),envelope=Math.sin(Math.PI*clamp(t/MOTION.settleEnd));
 const rotation=rotationAt(id,t);let offset,smear=0,stretch=[1,1,1];
 if(id==='A'){
  offset=[2*Math.sin(TAU*u)*envelope,-8*envelope];
 }else if(id==='B'){
  // Both component turns are integral at .54, so the final orientation is
  // exactly frontal rather than a backwards sprite that must be mirrored.
  offset=[9*Math.sin(TAU*u)*envelope,-18*envelope];
 }else if(id==='C'){
  // The dominant Y axis gives real front/back exposure, not an in-plane disc.
  smear=.95*ramp(t,.035,.13)*(1-ramp(t,.40,.535));
  // X approximates the local tangent of a frontmost vertex around dominant Y.
  // This is an artist-directed volume-preserving smear, not a fluid solver.
  // Limit it by remaining zoom headroom so no axis exceeds the requested1.5.
  const q=Math.min(.13*smear,Math.max(0,Math.log(MOTION.zoomPeak/zoomAt(t))));
  stretch=[Math.exp(q),Math.exp(-q/2),Math.exp(-q/2)];
  offset=[-12*Math.sin(Math.PI*u)*envelope,-10*envelope];
 }else if(id==='D'){
  offset=[9*Math.sin(TAU*u)*envelope,-4*envelope];
 }else if(id==='E'){
  offset=[3*Math.sin(TAU*u)*envelope,-21*envelope];
 }else if(id==='F'){
  const beat=Math.sin(Math.PI*((u*3)%1))**2;
  offset=[0,-6*beat*(1-ramp(t,.50,MOTION.settleEnd))];
 }else if(id==='G'){
  offset=[4*Math.sin(TAU*u),-20*Math.sin(TAU*u)**2];
 }else{
  offset=[2*Math.sin(TAU*u)*envelope,-3*envelope];
 }
 return {time:t,rotation,stretch,offset,zoom:zoomAt(t),smear,finish,
  ...(id==='C'?{previousRotation:rotationAt(id,Math.max(0,t-1/120))}:{})};
}

export function exposureSamples(variant,time,{blur=true}={}){
 const id=checkedId(variant),t=localTime(time),pose=motionAt(id,t);
 if(!blur||t>=MOTION.shutterClearAt)return [{...pose,weight:1}];
 // A centered short shutter follows the 3D trajectory. The complete samples
 // must be averaged in premultiplied space by the renderer, not source-over.
 const gate=ramp(t,0,.07)*(1-ramp(t,.43,MOTION.shutterClearAt));
 const width=({A:1/70,B:1/60,C:1/45,D:1/80,E:1/70,F:1/75,G:1/70,H:1/38}[id])*gate;
 if(width<1e-8)return [{...pose,weight:1}];
 const samples=[];let total=0;
 for(let i=0;i<MOTION.samples;i++){
  const x=i/(MOTION.samples-1),sampleTime=clamp(t+(x-.5)*width,0,MOTION.shutterClearAt);
  const weight=.75+.25*Math.sin(Math.PI*x);total+=weight;
  samples.push({...motionAt(id,sampleTime),weight});
 }
 for(const sample of samples)sample.weight/=total;
 return samples;
}
