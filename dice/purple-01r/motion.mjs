import {motionAt as referencePose, exposureSamples, MOTION} from '../purple-reference/motion.mjs';

// Match the green result handoff at .6s. The two existing reveal poses
// bridge frames 32–35 without adding atlas regions or changing the roll.
export const PURPLE_01R = Object.freeze({fps:60, frontFrame:32, secondRevealFrame:34, settledFrame:36, duration:.633333});
const transpose = r => [r[0],r[3],r[6],r[1],r[4],r[7],r[2],r[5],r[8]];

// The approved 01R is the inverse of 01's E trajectory, including its
// shoulder, offset, settling gain and exposure weights. It is not reversed 02.
function reverse(pose, thinness) {
  const side = 1-Math.min(1,Math.abs(pose.rotation[8])/.48);
  const reinforcement = (.08+.14*thinness)*side*side;
  const settle = Math.max(0,Math.min(1,(pose.time-.47)/.13));
  const gain = 1+.15*settle*settle*(3-2*settle);
  return {...pose,
    rotation:transpose(pose.rotation),
    ...(pose.previousRotation && {previousRotation:transpose(pose.previousRotation)}),
    offset:[pose.offset[0]*.8,pose.offset[1]*.78],
    zoom:pose.zoom*gain,
    stretch:[pose.stretch[0],pose.stretch[1],pose.stretch[2]*(1+reinforcement)],
  };
}

export function motionAt(frame, thinness=0) {
  const time=frame>=31 ? MOTION.landAt : Math.min(MOTION.settleEnd,frame/60);
  return reverse(referencePose('E',time),thinness);
}

export function renderSamples(frame, thinness=0) {
  const time=Math.min(MOTION.settleEnd,frame/60);
  const samples=exposureSamples('E',time);
  if(samples.length===1 || frame===0 || frame>=31)return [{...motionAt(frame,thinness),weight:1}];
  return [0,2,4,6,8].map(index => {
    const sample=samples[index];
    return {...reverse(referencePose('E',sample.time),thinness),weight:sample.weight};
  });
}
