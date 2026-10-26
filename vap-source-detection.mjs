// Conservative, on-device input classification. This never changes source pixels.
const plain=()=>({sourceKind:'plain_mp4',screenColor:'auto',confidence:0});
const median=values=>{const ordered=values.slice().sort((a,b)=>a-b);return ordered[Math.floor(ordered.length/2)];};
const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
function colorOf(rgb){
  const [r,g,b]=rgb,max=Math.max(r,g,b),min=Math.min(r,g,b);
  if(max<96||(max-min)/max<.45)return null;
  if(g-Math.max(r,b)>=48)return 'green';
  if(b-Math.max(r,g)>=48)return 'blue';
  return null;
}
function analyzeFrame(frame){
  const {width,height,data}=frame||{};
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<8||height<8||width*height>1048576||!data||data.length!==width*height*4)return null;
  const pixel=(x,y)=>{const offset=(y*width+x)*4;return data[offset+3]<16?null:[data[offset],data[offset+1],data[offset+2]];};
  const black=rgb=>!rgb||Math.max(...rgb)<24;
  // Ignore only contiguous black/transparent bars, never arbitrary dark details.
  const blankRow=y=>{for(let x=0;x<width;x++)if(!black(pixel(x,y)))return false;return true;};
  const blankColumn=x=>{for(let y=0;y<height;y++)if(!black(pixel(x,y)))return false;return true;};
  let left=0,right=width-1,top=0,bottom=height-1;
  while(top<height*.35&&blankRow(top))top++;
  while(bottom>height*.65&&blankRow(bottom))bottom--;
  while(left<width*.35&&blankColumn(left))left++;
  while(right>width*.65&&blankColumn(right))right--;
  const w=right-left+1,h=bottom-top+1,band=Math.max(1,Math.floor(Math.min(w,h)*.08));
  if(w<8||h<8)return null;
  const sides=[[],[],[],[]],all=[],step=Math.max(1,Math.floor(Math.max(w,h)/96));
  for(let y=top;y<=bottom;y+=step)for(let x=left;x<=right;x+=step){
    const rgb=pixel(x,y);if(!rgb)continue;all.push(rgb);
    if(y<top+band)sides[0].push(rgb);
    if(x>right-band)sides[1].push(rgb);
    if(y>bottom-band)sides[2].push(rgb);
    if(x<left+band)sides[3].push(rgb);
  }
  if(!all.length||all.filter(rgb=>Math.max(...rgb)>=40).length/all.length<.03)return null;
  if(sides.some(side=>side.length<3))return {color:null,confidence:0};
  const border=sides.flat();
  for(const color of ['green','blue']){
    const matching=border.filter(rgb=>colorOf(rgb)===color),ratio=matching.length/border.length;
    const sideRatio=Math.min(...sides.map(side=>side.filter(rgb=>colorOf(rgb)===color).length/side.length));
    if(ratio<.82||sideRatio<.55||all.filter(rgb=>colorOf(rgb)===color).length/all.length<.30)continue;
    const plate=[0,1,2].map(channel=>median(matching.map(rgb=>rgb[channel])));
    const consistent=matching.filter(rgb=>distance(rgb,plate)<=32).length/matching.length;
    // Natural blue skies, foliage and colored rooms usually vary across sides.
    // A flat wall indistinguishable from a chroma plate still needs user review.
    if(consistent<.92)continue;
    return {color,confidence:Math.min(ratio,consistent,(sideRatio+.45))};
  }
  return {color:null,confidence:0};
}

/**
 * Classify small, unmodified RGBA ImageData samples from multiple video times.
 * Blank intro frames are ignored; mixed colors or regular-frame evidence fall
 * back to regular MP4 so uncertain detection never enables destructive keying.
 */
export function detectVideoSource(frames){
  if(!Array.isArray(frames)||!frames.length)return plain();
  const samples=frames.map(analyzeFrame).filter(Boolean);
  if(!samples.length)return plain();
  for(const color of ['green','blue']){
    const matches=samples.filter(sample=>sample.color===color);
    if(matches.length<Math.min(2,samples.length)||matches.length/samples.length<.75)continue;
    if(samples.some(sample=>sample.color&&sample.color!==color))return plain();
    return {sourceKind:'chroma_mp4',screenColor:color,confidence:Math.round(Math.min(...matches.map(sample=>sample.confidence))*matches.length/samples.length*1000)/1000};
  }
  return plain();
}
