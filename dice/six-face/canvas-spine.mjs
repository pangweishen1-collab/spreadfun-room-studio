// A bounded Canvas 2D renderer for this generated mesh/region-only Spine rig.
// ponytail: clipping, sequences and arbitrary external skeletons are out of scope.
export class CanvasSpineRenderer {
 constructor(atlas,image,{width=560,height=470}={}){
  this.atlas=atlas;this.image=image;this.base=new Map();this.tints=new Map();
  this.layer=document.createElement('canvas');this.layer.width=width;this.layer.height=height;
  this.context=this.layer.getContext('2d');if(!this.context)throw Error('浏览器无法创建兼容预览画布');
 }
 texture(region,color){
  let base=this.base.get(region.name);
  if(!base){
   const rotated = Math.abs(region.degrees % 180) === 90;
   const width = rotated ? region.height : region.width;
   const height = rotated ? region.width : region.height;
   base=document.createElement('canvas');
   base.width=width;
   base.height=height;
   const context=base.getContext('2d');
   if(!context)throw Error('兼容贴图画布不可用');
   // Keep the packed orientation. The Spine UVs already include rotation.
   context.drawImage(this.image,region.x,region.y,width,height,0,0,width,height);
   this.base.set(region.name,base);
  }
  const rgb=[color.r,color.g,color.b].map(v=>Math.round(Math.max(0,Math.min(1,v))*31));
  if(rgb.every(v=>v===31))return base;
  const key=region.name+':'+rgb.join(',');if(this.tints.has(key))return this.tints.get(key);
  const canvas=document.createElement('canvas');canvas.width=base.width;canvas.height=base.height;const ctx=canvas.getContext('2d');
  ctx.drawImage(base,0,0);ctx.globalCompositeOperation='multiply';ctx.fillStyle='rgb('+rgb.map(v=>Math.round(v/31*255)).join(',')+')';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.globalCompositeOperation='destination-in';ctx.drawImage(base,0,0);ctx.globalCompositeOperation='source-over';
  this.tints.set(key,canvas);if(this.tints.size>24){const first=this.tints.keys().next().value;this.tints.get(first).width=1;this.tints.delete(first);}return canvas;
 }
 draw(ctx,skeleton,height=this.layer.height){
  for(const slot of skeleton.drawOrder){
   const attachment=slot.getAttachment();if(!attachment?.region)continue;
   const alpha=skeleton.color.a*slot.color.a*attachment.color.a;if(alpha<=.001)continue;
   const isMesh=Array.isArray(attachment.triangles)||ArrayBuffer.isView(attachment.triangles),n=isMesh?attachment.worldVerticesLength:8;
   const vertices=new Float32Array(n);
   if(isMesh)attachment.computeWorldVertices(slot,0,n,vertices,0,2);else attachment.computeWorldVertices(slot,vertices,0,2);
   const triangles=isMesh?attachment.triangles:[0,1,2,2,3,0],uv=attachment.uvs,region=attachment.region;
   const image=this.texture(region,{r:slot.color.r*attachment.color.r*skeleton.color.r,g:slot.color.g*attachment.color.g*skeleton.color.g,b:slot.color.b*attachment.color.b*skeleton.color.b});
   const c=this.context;c.clearRect(0,0,this.layer.width,this.layer.height);
   for(let i=0;i<triangles.length;i+=3){
    const indices=[triangles[i],triangles[i+1],triangles[i+2]],p=indices.map(v=>[vertices[v*2],height-vertices[v*2+1]]),s=indices.map(v=>[uv[v*2]*region.page.width-region.x,uv[v*2+1]*region.page.height-region.y]);
    const su1=s[1][0]-s[0][0],sv1=s[1][1]-s[0][1],su2=s[2][0]-s[0][0],sv2=s[2][1]-s[0][1],det=su1*sv2-su2*sv1;
    const dx1=p[1][0]-p[0][0],dy1=p[1][1]-p[0][1],dx2=p[2][0]-p[0][0],dy2=p[2][1]-p[0][1];
    if(Math.abs(det)<1e-8||Math.abs(dx1*dy2-dx2*dy1)<1e-6)continue;
    const a=(dx1*sv2-dx2*sv1)/det,b=(dy1*sv2-dy2*sv1)/det,d=(dy2*su1-dy1*su2)/det,k=(dx2*su1-dx1*su2)/det;
    const e=p[0][0]-a*s[0][0]-k*s[0][1],f=p[0][1]-b*s[0][0]-d*s[0][1];if(![a,b,k,d,e,f].every(Number.isFinite))continue;
    // Expand subpixel clips on the temporary face layer; face opacity is applied once.
    const cx=(p[0][0]+p[1][0]+p[2][0])/3,cy=(p[0][1]+p[1][1]+p[2][1])/3;
    const clip=p.map(([x,y])=>{const len=Math.hypot(x-cx,y-cy)||1;return [x+(x-cx)*.22/len,y+(y-cy)*.22/len];});
    c.save();c.beginPath();c.moveTo(...clip[0]);c.lineTo(...clip[1]);c.lineTo(...clip[2]);c.closePath();c.clip();c.setTransform(a,b,k,d,e,f);c.drawImage(image,0,0);c.restore();
   }
   ctx.save();ctx.globalAlpha=alpha;ctx.drawImage(this.layer,0,0);ctx.restore();
  }
 }
 dispose(){for(const c of this.base.values())c.width=1;for(const c of this.tints.values())c.width=1;this.base.clear();this.tints.clear();this.layer.width=1;}
}
