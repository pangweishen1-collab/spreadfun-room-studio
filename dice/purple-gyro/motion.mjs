// Approved purple motion 05, sampled as native Spine numeric deformation.
export const PURPLE_GYRO_MOTION_VERSION='purple-gyro05-v2-silhouette';
export const GYRO={rollEnd:.54,clearAt:.535,landAt:.54,zoomPeak:1.5,zoomPeakAt:.3,zoomEnd:.591667,duration:.633333};
const TAU=Math.PI*2,identity=[1,0,0,0,1,0,0,0,1];
export const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
export const smooth=x=>{x=clamp(x);return x*x*(3-2*x);};
const smoother=x=>{x=clamp(x);return x*x*x*(x*(x*6-15)+10);};
const mul=(a,b)=>Array.from({length:9},(_,i)=>{const r=i%3,c=Math.floor(i/3);return a[r]*b[c*3]+a[3+r]*b[c*3+1]+a[6+r]*b[c*3+2];});
const rx=a=>[1,0,0,0,Math.cos(a),Math.sin(a),0,-Math.sin(a),Math.cos(a)];
const ry=a=>[Math.cos(a),0,-Math.sin(a),0,1,0,Math.sin(a),0,Math.cos(a)];
const rz=a=>[Math.cos(a),Math.sin(a),0,-Math.sin(a),Math.cos(a),0,0,0,1];
export const transform=(m,p)=>[0,1,2].map(i=>m[i]*p[0]+m[3+i]*p[1]+m[6+i]*p[2]);
export function gyroAt(t){
 if(!Number.isFinite(t))throw Error('紫色动画时间无效');
 t=Math.max(0,t);const u=clamp(t/.54),p=smoother(u),envelope=Math.sin(Math.PI*clamp(t/.58));
 let rotation=identity;
 if(t<.54){const tilt=.63*Math.sin(Math.PI*p),phase=TAU*p;rotation=mul(ry(phase),mul(rx(tilt),mul(rz(TAU*4*p),mul(rx(-tilt),ry(-phase)))));}
 const zoom=t<=.3?1+.5*clamp(t/.3):1+.5*(1-clamp((t-.3)/(.591667-.3)));
 return {rotation,zoom,offset:t>=.58?[0,0]:[3*Math.sin(TAU*u)*envelope,-21*envelope]};
}
