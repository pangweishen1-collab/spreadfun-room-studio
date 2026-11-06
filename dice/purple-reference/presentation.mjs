// Display-only compensation after the fast spin; motion and source art stay intact.
export function settlingGain(time){
 if(!Number.isFinite(time))throw new TypeError('展示时间必须为有限数值');
 const t=time%2,p=Math.max(0,Math.min(1,(t-.47)/.13));
 return 1+.15*p*p*(3-2*p);
}
