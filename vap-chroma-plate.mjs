// Calibrate a smooth, varying colour plate from unobstructed side strips.
// Used only after the import detector has identified a varying chroma screen.
const median=a=>a.sort((x,y)=>x-y)[Math.floor(a.length/2)];
const quantile=(a,p)=>a.slice().sort((x,y)=>x-y)[Math.floor((a.length-1)*p)];
export function calibrateChromaPlate(data,width,height,background){
  if(width<16||height<16)return null;
  const key=background.indexOf(Math.max(...background)),mean=background.reduce((a,b)=>a+b)/3,dir=background.map(v=>v-mean),length=Math.hypot(...dir);
  if(length<40)return null;
  const otherA=(key+1)%3,otherB=(key+2)%3,primaryPlate=dir[key]/length>.75;
  const near=(i)=>{const a=data[i+3],v=data[i+key],r=data[i],g=data[i+1],b=data[i+2],m=(r+g+b)/3,range=Math.max(r,g,b)-Math.min(r,g,b),n=Math.hypot(r-m,g-m,b-m);return a>240&&v>=48&&v===Math.max(r,g,b)&&range>=32&&((r-m)*dir[0]+(g-m)*dir[1]+(b-m)*dir[2])>n*length*.96;};
  // Find the opaque video rectangle rather than sampling transparent contain bars.
  const sx=Math.max(1,Math.floor(width/128)),sy=Math.max(1,Math.floor(height/128));let left=width,right=-1,top=height,bottom=-1;
  for(let y=0;y<height;y+=sy)for(let x=0;x<width;x+=sx)if(data[(y*width+x)*4+3]>240){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
  if(right<left)return null;left=Math.max(0,left-sx+1);right=Math.min(width-1,right+sx-1);top=Math.max(0,top-sy+1);bottom=Math.min(height-1,bottom+sy-1);
  const cw=right-left+1,ch=bottom-top+1;if(cw<16||ch<16)return null;
  const band=Math.max(2,Math.floor(cw*.08)),step=Math.max(1,Math.floor(band/18)),rowStep=Math.max(1,Math.floor(ch/128)),rows=[[],[]],samples=[],ratios=[[],[],[]];
  for(let y=top;y<=bottom;y+=rowStep)for(let side=0;side<2;side++){
    const values=[[],[],[]],from=side?right-band+1:left,to=side?right+1:left+band;
    for(let x=from;x<to;x+=step){const i=(y*width+x)*4;if(!near(i))continue;for(let c=0;c<3;c++){values[c].push(data[i+c]);ratios[c].push(data[i+c]/data[i+key]);}samples.push([x,y,data[i],data[i+1],data[i+2]]);}
    if(values[0].length>=3)rows[side].push({y,rgb:values.map(median)});
  }
  if(samples.length<32||rows.some(r=>r.length<Math.max(3,ch/rowStep*.35)))return null;
  const fields=rows.map(known=>{
    const out=new Float32Array(height*3);let index=0;
    for(let y=0;y<height;y++){while(index+1<known.length&&known[index+1].y<y)index++;const a=known[index],b=known[Math.min(index+1,known.length-1)],t=Math.max(0,Math.min(1,(y-a.y)/Math.max(1,b.y-a.y)));for(let c=0;c<3;c++)out[y*3+c]=a.rgb[c]+(b.rgb[c]-a.rgb[c])*t;}return out;
  });
  const bg=new Float64Array(3),at=(p,target=bg)=>{const y=Math.floor(p/width),x=p-y*width,t=Math.max(0,Math.min(1,(x-left-band*.5)/Math.max(1,cw-band)));for(let c=0;c<3;c++)target[c]=fields[0][y*3+c]*(1-t)+fields[1][y*3+c]*t;return target;};
  const residual=[];
  for(const [x,y,r,g,b] of samples){const v=[r,g,b],model=at(y*width+x),scale=v[key]/Math.max(1,model[key]);residual.push(Math.max(...v.map((n,c)=>Math.abs(n-model[c]*scale))));}
  const noise=Math.max(4,Math.min(12,quantile(residual,.95)*1.5)),lo=ratios.map(a=>quantile(a,.02)-.025),hi=ratios.map(a=>quantile(a,.98)+.025);
  // Floor shadows can shift the measured hue of a single-primary screen.
  // Compare those shadows against the primary axis instead of the warm plate
  // RGB; the dominant-channel gate excludes gold, cyan and neutral details.
  return {at,noise,isExterior(p){const i=p*4,v=data[i+key];if(data[i+3]===0)return true;if(v<6||v-Math.max(data[i+otherA],data[i+otherB])<Math.max(3,v*.12))return false;for(let c=0;c<3;c++){const ratio=data[i+c]/v;if(ratio<lo[c]-.12||ratio>hi[c]+.12){const m=(data[i]+data[i+1]+data[i+2])/3,r=data[i]-m,g=data[i+1]-m,b=data[i+2]-m;const n=Math.hypot(r,g,b);return primaryPlate?(v-m)*Math.sqrt(1.5)>n*.90:r*dir[0]+g*dir[1]+b*dir[2]>n*length*.90;}}return true;},isPlate(p,model){const i=p*4,v=data[i+key];if(v<48||v!==Math.max(data[i],data[i+1],data[i+2]))return false;const scale=v/Math.max(1,model[key]);for(let c=0;c<3;c++){const ratio=data[i+c]/v;if(ratio<lo[c]||ratio>hi[c]||Math.abs(data[i+c]-model[c]*scale)>noise)return false;}return true;}};
}
