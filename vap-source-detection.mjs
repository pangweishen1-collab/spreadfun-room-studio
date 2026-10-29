// Conservative, on-device input classification. This never changes source pixels.
export const SCREEN_COLORS=Object.freeze(['red','orange','yellow','green','cyan','blue','magenta','custom']);
const plain=()=>({sourceKind:'plain_mp4',screenColor:'auto',confidence:0});
const median=values=>{const ordered=values.slice().sort((a,b)=>a-b);return ordered[Math.floor(ordered.length/2)];};
const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
const center=samples=>[0,1,2].map(channel=>median(samples.map(rgb=>rgb[channel])));
const colored=rgb=>{const max=Math.max(...rgb),spread=max-Math.min(...rgb);return max>=64&&spread>=44&&spread/max>=.36;};
/** Name a sampled RGB plate; keying uses the actual RGB, never this family name. */
export function classifyScreenColor(rgb){
  if(!Array.isArray(rgb)||rgb.length!==3||!rgb.every(value=>Number.isFinite(value)&&value>=0&&value<=255))return 'custom';
  if(!colored(rgb))return 'custom';
  const [r,g,b]=rgb,max=Math.max(...rgb),spread=max-Math.min(...rgb);
  let hue=max===r?(g-b)/spread:max===g?(b-r)/spread+2:(r-g)/spread+4;
  hue=(hue*60+360)%360;
  return hue<15||hue>=345?'red':hue<45?'orange':hue<75?'yellow':hue<165?'green':hue<200?'cyan':hue<270?'blue':'magenta';
}
function analyzeNeutralFrame(frame){
  const {width,height,data}=frame||{};
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<8||height<8||width>4096||height>4096||width*height>8388608||!data||data.length!==width*height*4)return null;
  // Inspect the original perimeter before the chroma detector removes black
  // letterbox bars. Cropping first can turn a black gift plate into its subject.
  const band=Math.max(1,Math.floor(Math.min(width,height)*.02)),step=Math.max(1,Math.floor(Math.max(width,height)/96));
  const sides=[[],[],[],[]],all=[];
  for(let y=0;y<height;y+=step)for(let x=0;x<width;x+=step){
    const offset=(y*width+x)*4;
    // A video plate is opaque. Existing image alpha must not be mistaken for
    // black RGB padding and enable another destructive removal operation.
    if(data[offset+3]<250)return null;
    const rgb=[data[offset],data[offset+1],data[offset+2]];all.push(rgb);
    if(y<band)sides[0].push(rgb);
    if(x>=width-band)sides[1].push(rgb);
    if(y>=height-band)sides[2].push(rgb);
    if(x<band)sides[3].push(rgb);
  }
  if(sides.some(side=>side.length<2))return null;
  const border=sides.flat(),initial=center(border),spread=Math.max(...initial)-Math.min(...initial);
  const matteMethod=spread<=2?(Math.max(...initial)<=4?'black_luma':Math.min(...initial)>=251?'white_luma':null):null;
  if(!matteMethod)return null;
  const matching=border.filter(rgb=>distance(rgb,initial)<=10),ratio=matching.length/border.length;
  if(ratio<.965)return null;
  const background=center(matching),near=rgb=>distance(rgb,background)<=10;
  const sideRatio=Math.min(...sides.map(side=>side.filter(near).length/side.length));
  const consistent=matching.filter(rgb=>distance(rgb,background)<=7).length/matching.length;
  if(sideRatio<.92||consistent<.97)return null;
  const backgroundRatio=all.filter(near).length/all.length;
  // Uniform black/white intro frames offer no foreground evidence. They may be
  // ignored, but must never trigger luma removal by themselves.
  if(backgroundRatio>=.999)return {blank:true};
  const foregroundRatio=all.filter(rgb=>distance(rgb,background)>=48).length/all.length;
  if(backgroundRatio<.30||foregroundRatio<.03||foregroundRatio>.70)return null;
  return {matteMethod,background,confidence:Math.min(ratio,consistent,sideRatio)};
}
function analyzeFrame(frame,minSide){
  const {width,height,data}=frame||{};
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<minSide||height<minSide||width>4096||height>4096||width*height>8388608||!data||data.length!==width*height*4)return null;
  const pixel=(x,y)=>{const offset=(y*width+x)*4;return data[offset+3]<16?null:[data[offset],data[offset+1],data[offset+2]];};
  const black=rgb=>!rgb||Math.max(...rgb)<24;
  // Ignore contiguous bars only. Transparent contain padding may span over35%
  // of a canvas; opaque black cropping remains bounded to protect dark scenes.
  const blankRow=y=>{for(let x=0;x<width;x++)if(!black(pixel(x,y)))return false;return true;};
  const blankColumn=x=>{for(let y=0;y<height;y++)if(!black(pixel(x,y)))return false;return true;};
  const transparentRow=y=>{for(let x=0;x<width;x++)if(pixel(x,y))return false;return true;};
  const transparentColumn=x=>{for(let y=0;y<height;y++)if(pixel(x,y))return false;return true;};
  let left=0,right=width-1,top=0,bottom=height-1;
  while(top<height-1&&blankRow(top)&&(top<height*.35||transparentRow(top)))top++;
  while(bottom>top&&blankRow(bottom)&&(bottom>height*.65||transparentRow(bottom)))bottom--;
  while(left<width-1&&blankColumn(left)&&(left<width*.35||transparentColumn(left)))left++;
  while(right>left&&blankColumn(right)&&(right>width*.65||transparentColumn(right)))right--;
  const w=right-left+1,h=bottom-top+1,band=Math.max(1,Math.floor(Math.min(w,h)*.08));
  if(w<2||h<2)return null;
  const sides=[[],[],[],[]],all=[],step=Math.max(1,Math.floor(Math.max(w,h)/96));
  for(let y=top;y<=bottom;y+=step)for(let x=left;x<=right;x+=step){
    const rgb=pixel(x,y);if(!rgb)continue;all.push(rgb);
    if(y<top+band)sides[0].push(rgb);
    if(x>right-band)sides[1].push(rgb);
    if(y>bottom-band)sides[2].push(rgb);
    if(x<left+band)sides[3].push(rgb);
  }
  if(!all.length||all.filter(rgb=>Math.max(...rgb)>=40).length/all.length<.03)return null;
  if(sides.some(side=>side.length<2))return {color:null,confidence:0};
  const border=sides.flat(),initial=center(border);
  // A dominant uniform perimeter is a robust cluster without allocating a
  // full-frame color histogram. Median RGB resists small foreground intrusions.
  if(!colored(initial))return {color:null,confidence:0};
  const matching=border.filter(rgb=>distance(rgb,initial)<=28),ratio=matching.length/border.length;
  if(ratio<.86)return {color:null,confidence:0};
  const background=center(matching),near=rgb=>distance(rgb,background)<=28;
  const sideRatio=Math.min(...sides.map(side=>side.filter(near).length/side.length));
  if(sideRatio<.60||all.filter(near).length/all.length<.30)return {color:null,confidence:0};
  const consistent=matching.filter(rgb=>distance(rgb,background)<=18).length/matching.length;
  // A varied sky, colored subject or room is not sufficient plate evidence.
  // An intentionally flat colored wall is indistinguishable from a screen.
  // Small import samples blend a gift's glow into an otherwise uniform plate.
  // Allow that narrow edge contamination while keeping the dominant perimeter,
  // every-side/area checks and stable multi-frame RGB agreement unchanged.
  if(consistent<.90)return {color:null,confidence:0};
  return {color:classifyScreenColor(background),background,confidence:Math.min(ratio,consistent,sideRatio+.40)};
}

/** Shared one-frame fallback for the matte processor, including contain padding. */
export function detectFrameScreen(frame){
  const result=analyzeFrame(frame,3);
  return result?.color?result:null;
}

/**
 * Classify small, unmodified RGBA samples from multiple video times. Blank intro
 * frames are ignored. Mixed plate RGB or regular-frame evidence falls back to
 * regular MP4 so uncertain detection never enables destructive keying.
 */
export function detectVideoSource(frames){
  if(!Array.isArray(frames)||!frames.length)return plain();
  const samples=frames.map(frame=>{
    const neutral=analyzeNeutralFrame(frame);
    return neutral?.blank?null:neutral||analyzeFrame(frame,8);
  }).filter(Boolean);
  if(!samples.length)return plain();
  const neutral=samples.filter(sample=>sample.matteMethod);
  if(neutral.length){
    // Neutral backgrounds need two actual foreground frames and no contrary
    // method/frame evidence. A single black title or white flash is not a plate.
    if(neutral.length<2||neutral.length!==samples.length||neutral.some(sample=>sample.matteMethod!==neutral[0].matteMethod))return plain();
    const background=center(neutral.map(sample=>sample.background));
    if(neutral.some(sample=>distance(sample.background,background)>5))return plain();
    return {sourceKind:'plain_mp4',screenColor:'auto',matteMethod:neutral[0].matteMethod,background,confidence:Math.round(Math.min(...neutral.map(sample=>sample.confidence))*1000)/1000};
  }
  const matches=samples.filter(sample=>sample.color);
  if(matches.length<Math.min(2,samples.length)||matches.length/samples.length<.75)return plain();
  const background=center(matches.map(sample=>sample.background));
  // Family names alone cannot distinguish a red screen changing to orange/red,
  // or two different greens. One stable plate RGB is shared by preview/export.
  if(matches.some(sample=>distance(sample.background,background)>18))return plain();
  return {sourceKind:'chroma_mp4',screenColor:classifyScreenColor(background),background,confidence:Math.round(Math.min(...matches.map(sample=>sample.confidence))*matches.length/samples.length*1000)/1000};
}
