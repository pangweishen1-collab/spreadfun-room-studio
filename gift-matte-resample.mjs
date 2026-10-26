// Antialiased bilinear resize, matching the image transform used by the model.
// A single point sample aliases thin particles when a large source is reduced.
function coefficients(size,target,cubic=false){
  const scale=size/target,filterScale=Math.max(1,scale),support=(cubic?2:1)*filterScale,rows=[];
  for(let i=0;i<target;i++){
    const center=(i+.5)*scale,start=Math.max(0,Math.floor(center-support+.5)),end=Math.min(size,Math.floor(center+support+.5));
    const weights=new Float64Array(end-start);let total=0;
    for(let j=start;j<end;j++){
      const d=Math.abs((j+.5-center)/filterScale),weight=cubic?(d<1?((1.5*d-2.5)*d)*d+1:d<2?((-.5*d+2.5)*d-4)*d+2:0):Math.max(0,1-d);
      weights[j-start]=weight;total+=weight;
    }
    for(let j=0;j<weights.length;j++)weights[j]/=total;
    rows.push({start,weights});
  }
  return rows;
}

export function resizeMatteInput(rgba,width,height,side){
  if(!(rgba instanceof Uint8ClampedArray)||!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width>2048||height>2048
    ||rgba.length!==width*height*4||!Number.isInteger(side)||side<1||side>2048)throw new Error('图片像素尺寸无效。');
  if(width===side&&height===side)return rgba;
  const horizontal=coefficients(width,side),vertical=coefficients(height,side),temp=new Uint8ClampedArray(side*height*4),output=new Uint8ClampedArray(side*side*4);
  for(let y=0;y<height;y++)for(let x=0;x<side;x++){
    const {start,weights}=horizontal[x],target=(y*side+x)*4;
    for(let c=0;c<4;c++){let value=0;for(let j=0;j<weights.length;j++)value+=rgba[(y*width+start+j)*4+c]*weights[j];temp[target+c]=Math.round(value)}
  }
  for(let y=0;y<side;y++)for(let x=0;x<side;x++){
    const {start,weights}=vertical[y],target=(y*side+x)*4;
    for(let c=0;c<4;c++){let value=0;for(let j=0;j<weights.length;j++)value+=temp[((start+j)*side+x)*4+c]*weights[j];output[target+c]=Math.round(value)}
  }
  return output;
}

export function resizeMatteAlpha(data,side,width,height){
  if(!(data instanceof Float32Array)||!Number.isInteger(side)||side<1||side>2048||data.length!==side*side
    ||!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width>2048||height>2048)throw new Error('透明度尺寸无效。');
  const horizontal=coefficients(side,width,true),vertical=coefficients(side,height,true),temp=new Float32Array(width*side),output=new Float32Array(width*height);
  for(let y=0;y<side;y++)for(let x=0;x<width;x++){
    const {start,weights}=horizontal[x];let value=0;
    for(let j=0;j<weights.length;j++)value+=data[y*side+start+j]*weights[j];
    temp[y*width+x]=value;
  }
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const {start,weights}=vertical[y];let value=0;
    for(let j=0;j<weights.length;j++)value+=temp[(start+j)*width+x]*weights[j];
    if(!Number.isFinite(value))throw new Error('抠图模型返回了无效像素。');
    output[y*width+x]=Math.max(0,Math.min(1,value));
  }
  return output;
}
