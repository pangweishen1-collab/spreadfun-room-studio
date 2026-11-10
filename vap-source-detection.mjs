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
function analyzeNeutralFrame(frame,allowCustomScreen){
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
  const custom=allowCustomScreen&&!matteMethod&&!colored(initial);
  if(!matteMethod&&!custom)return null;
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
  if(backgroundRatio<(custom ? .33 : .30)||foregroundRatio<.03||foregroundRatio>.70)return null;
  return {...(custom?{color:'custom'}:{matteMethod}),background,confidence:Math.min(ratio,consistent,sideRatio)};
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

// Uneven but smooth coloured plates need a separate gate: a wider RGB
// radius alone would turn grass, skies and coloured subjects into key screens.
function analyzeGradientFrame(frame){
  const {width,height,data}=frame||{};
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<16||height<16||width>4096||height>4096||width*height>8388608||!data||data.length!==width*height*4)return null;
  // Align the band to the sampling grid: an odd-width band sampled every two
  // pixels otherwise weighs the left/top edges twice as much as right/bottom.
  const step=Math.max(1,Math.floor(Math.max(width,height)/96)),band=Math.max(step,Math.ceil(Math.min(width,height)*.035/step)*step),samples=[],sides=[[],[],[],[]];
  for(let y=0;y<height;y+=step)for(let x=0;x<width;x+=step){
    const i=(y*width+x)*4;if(data[i+3]<250)return null;
    const point={x:width===1?0:x/(width-1)*2-1,y:height===1?0:y/(height-1)*2-1,rgb:[data[i],data[i+1],data[i+2]],px:x,py:y};samples.push(point);
    if(y<band)sides[0].push(point);if(x>=width-band)sides[1].push(point);if(y>=height-band)sides[2].push(point);if(x<band)sides[3].push(point);
  }
  if(sides.some(side=>side.length<2))return null;
  const border=sides.flat(),colours=border.filter(p=>colored(p.rgb));
  if(colours.length/border.length<.80)return null;
  const color=classifyScreenColor(center(colours.map(p=>p.rgb)));if(color==='custom')return null;
  // A gold subject touching a green perimeter must not shift the measured
  // green direction. Other families still count against the border gate below.
  const background=center(colours.filter(p=>classifyScreenColor(p.rgb)===color).map(p=>p.rgb));
  const vector=rgb=>{const mean=(rgb[0]+rgb[1]+rgb[2])/3;return rgb.map(v=>v-mean);},unit=vector(background),length=Math.hypot(...unit);for(let c=0;c<3;c++)unit[c]/=length;
  const near=p=>{if(!colored(p.rgb)||classifyScreenColor(p.rgb)!==color)return false;const v=vector(p.rgb),norm=Math.hypot(...v);return v.reduce((sum,n,c)=>sum+n*unit[c],0)/norm>=.98;};
  const matching=border.filter(near),borderRatio=matching.length/border.length,colourConsistency=matching.length/colours.filter(p=>classifyScreenColor(p.rgb)===color).length;
  const sideRatio=Math.min(...sides.map(side=>side.filter(near).length/side.length)),plate=samples.filter(near),area=plate.length/samples.length;
  if(borderRatio<.80||colourConsistency<.94||sideRatio<.35||area<.45)return null;
  // Strong local texture is contrary evidence, even when every pixel is green.
  const keyed=new Map(plate.map(p=>[p.py*width+p.px,p])),differences=[];
  for(const p of plate){const neighbors=[];if(p.px+step<width)neighbors.push(p.py*width+p.px+step);if(p.py+step<height)neighbors.push((p.py+step)*width+p.px);for(const key of neighbors){const q=keyed.get(key);if(q)differences.push(Math.max(...p.rgb.map((v,c)=>Math.abs(v-q.rgb[c]))));}}
  if(differences.length<20)return null;
  const percentile=(values,f)=>{const sorted=values.slice().sort((a,b)=>a-b);return sorted[Math.min(sorted.length-1,Math.floor(sorted.length*f))];};
  if(percentile(differences,.95)>8||differences.reduce((sum,v)=>sum+v,0)/differences.length>4)return null;
  const features=p=>[1,p.x,p.y,p.x*p.y,p.x*p.x,p.y*p.y];
  function solve(matrix,rhs){
    const rows=matrix.map((row,i)=>[...row,rhs[i]]);
    for(let col=0;col<6;col++){
      let pivot=col;for(let row=col+1;row<6;row++)if(Math.abs(rows[row][col])>Math.abs(rows[pivot][col]))pivot=row;
      if(Math.abs(rows[pivot][col])<1e-8)return null;[rows[col],rows[pivot]]=[rows[pivot],rows[col]];
      const divisor=rows[col][col];for(let c=col;c<=6;c++)rows[col][c]/=divisor;
      for(let row=0;row<6;row++)if(row!==col){const factor=rows[row][col];for(let c=col;c<=6;c++)rows[row][c]-=factor*rows[col][c];}
    }
    return rows.map(row=>row[6]);
  }
  const rows=matching.map(p=>({...p,f:features(p),weight:1}));let coefficients,residuals;
  for(let pass=0;pass<4;pass++){
    const matrix=Array.from({length:6},()=>Array(6).fill(0)),rhs=Array.from({length:3},()=>Array(6).fill(0));
    for(const p of rows){const w=p.weight*p.weight;for(let i=0;i<6;i++){for(let j=0;j<6;j++)matrix[i][j]+=p.f[i]*p.f[j]*w;for(let c=0;c<3;c++)rhs[c][i]+=p.f[i]*p.rgb[c]*w;}}
    coefficients=rhs.map(v=>solve(matrix,v));if(coefficients.some(v=>!v))return null;
    residuals=rows.map(p=>distance(p.rgb,coefficients.map(co=>co.reduce((sum,v,i)=>sum+v*p.f[i],0))));
    for(let i=0;i<rows.length;i++)rows[i].weight=Math.min(1,12/Math.max(1,residuals[i]));
  }
  if(percentile(residuals,.5)>8||percentile(residuals,.75)>12||percentile(residuals,.9)>36)return null;
  const profile=[[-1,-1],[1,-1],[-1,1],[1,1],[0,0]].map(([x,y])=>coefficients.map(co=>co.reduce((sum,v,i)=>sum+v*[1,x,y,x*y,x*x,y*y][i],0)));
  if(profile.some(rgb=>rgb.some(v=>!Number.isFinite(v)||v<0||v>255)||classifyScreenColor(rgb)!==color))return null;
  if(Math.max(...profile.map(rgb=>distance(rgb,background)))<32)return null;
  // A smooth coloured room without a contrasting foreground is not enough.
  if(1-area<.015)return null;
  return {color,background,confidence:Math.min(borderRatio,colourConsistency,sideRatio+.5),backgroundVariation:true,gradientProfile:profile};
}

/** Shared one-frame fallback for the matte processor, including contain padding. */
export function detectFrameScreen(frame){
  const result=analyzeFrame(frame,3);if(result?.color)return result;
  const gradient=analyzeGradientFrame(frame);if(!gradient)return null;const {gradientProfile,...screen}=gradient;return screen;
}

/**
 * Classify small, unmodified RGBA samples from multiple video times. Blank intro
 * frames are ignored. Mixed plate RGB or regular-frame evidence falls back to
 * regular MP4 so uncertain detection never enables destructive keying.
 */
export function detectVideoSource(frames,{allowCustomScreen=false}={}){
  if(!Array.isArray(frames)||!frames.length)return plain();
  const samples=frames.map(frame=>{
    const neutral=analyzeNeutralFrame(frame,allowCustomScreen);
    if(neutral?.blank)return null;if(neutral)return neutral;
    const uniform=analyzeFrame(frame,8);return uniform?.color?uniform:analyzeGradientFrame(frame)||uniform;
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
  const custom=matches.some(sample=>sample.color==='custom');
  if(custom&&(matches.length<2||matches.length!==samples.length||matches.some(sample=>sample.color!=='custom')))return plain();
  const background=center(matches.map(sample=>sample.background));
  // Family names alone cannot distinguish a red screen changing to orange/red,
  // or two different greens. One stable plate RGB is shared by preview/export.
  if(matches.some(sample=>distance(sample.background,background)>(custom?10:18)))return plain();
  const variation=matches.some(sample=>sample.backgroundVariation);
  if(variation){
    if(matches.some(sample=>!sample.backgroundVariation||sample.color!==matches[0].color))return plain();
    const profiles=matches.map(sample=>sample.gradientProfile);
    for(let i=0;i<profiles[0].length;i++){const middle=center(profiles.map(profile=>profile[i]));if(profiles.some(profile=>distance(profile[i],middle)>36))return plain();}
  }
  return {sourceKind:'chroma_mp4',screenColor:classifyScreenColor(background),background,confidence:Math.round(Math.min(...matches.map(sample=>sample.confidence))*matches.length/samples.length*1000)/1000,...(variation?{backgroundVariation:true}:{})};
}
