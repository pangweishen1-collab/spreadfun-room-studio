import assert from 'node:assert/strict';
import {deflateSync,inflateSync} from 'node:zlib';
import {buildPurpleSpineJson,PURPLE_GYRO_MOTION_VERSION} from '../../dice/purple-gyro/spine-builder.mjs';

const crcTable=Uint32Array.from({length:256},(_,n)=>{for(let i=0;i<8;i++)n=n&1?(n>>>1)^0xedb88320:n>>>1;return n>>>0;});
function chunk(type,data=Buffer.alloc(0)){
 const body=Buffer.concat([Buffer.from(type),data]),bytes=Buffer.alloc(data.length+12);bytes.writeUInt32BE(data.length);body.copy(bytes,4);
 let crc=0xffffffff;for(const value of body)crc=crcTable[(crc^value)&255]^(crc>>>8);bytes.writeUInt32BE((crc^0xffffffff)>>>0,bytes.length-4);return bytes;
}
export function rgbaPNG(width,height,data){
 assert.equal(data.length,width*height*4);const header=Buffer.alloc(13);header.writeUInt32BE(width);header.writeUInt32BE(height,4);header.set([8,6,0,0,0],8);
 const rows=Buffer.alloc((width*4+1)*height);for(let y=0;y<height;y++)Buffer.from(data.subarray(y*width*4,(y+1)*width*4)).copy(rows,y*(width*4+1)+1);
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(rows)),chunk('IEND')]);
}
export function readRgbaPNG(raw){
 const b=Buffer.from(raw),width=b.readUInt32BE(16),height=b.readUInt32BE(20),parts=[];
 assert.equal(b[24],8);assert.equal(b[25],6);assert.equal(b[28],0);
 for(let at=8;at+12<=b.length;){const n=b.readUInt32BE(at);if(b.toString('ascii',at+4,at+8)==='IDAT')parts.push(b.subarray(at+8,at+8+n));at+=n+12;}
 const rows=inflateSync(Buffer.concat(parts)),data=new Uint8ClampedArray(width*height*4);assert.equal(rows.length,(width*4+1)*height);
 for(let y=0;y<height;y++){const at=y*(width*4+1);assert.equal(rows[at],0);data.set(rows.subarray(at+1,at+1+width*4),y*width*4);}
 return {width,height,data};
}
export function solidPNG(size=200,rgba=[80,140,220,255]){
 const data=new Uint8ClampedArray(size*size*4);for(let i=0;i<data.length;i+=4)data.set(rgba,i);return rgbaPNG(size,size,data);
}
export const preparedFixture=Object.freeze({sourceSize:200,crop:[35,35,130,130],cropOffset:[0,0]});
export function fixtureAtlasText(){
 const regions=Array.from({length:12},(_,i)=>[i%2?'roll_'+(Math.floor(i/2)+1):'flat_'+(Math.floor(i/2)+1),i%3*134+2,Math.floor(i/3)*134+2,130,130]);
 regions.push(['white',2,540,64,16],['anchor',70,540,30,30],['soft_wall',136,540,130,30]);
 return 'dice.png\nsize: 512,640\nformat: RGBA8888\nfilter: Linear,Linear\nrepeat: none\npma: false\n'+regions.map(([name,x,y,w,h])=>`${name}\n  rotate: false\n  xy: ${x},${y}\n  size: ${w},${h}\n  orig: ${w},${h}\n  offset: 0,0\n  index: -1`).join('\n')+'\n';
}
let cachedJson;
export function nativeRuntimeFixture({name='紫色夹具',composition='faces'}={}){
 return {kind:'purple-gyro',json:structuredClone(cachedJson??=buildPurpleSpineJson(preparedFixture)),atlasText:fixtureAtlasText(),
  texture:new Blob([rgbaPNG(512,640,new Uint8ClampedArray(512*640*4))],{type:'image/png'}),atlasPage:'dice.png',
  geometry:{...structuredClone(preparedFixture),normalization:{resampled:false}},files:{},warnings:[],
  metadata:{name,motionVersion:PURPLE_GYRO_MOTION_VERSION,composition,zoomPeak:1.5,imageSequences:0,staticImages:15,
   anchor:{slot:'anchor',bone:'root',attachment:'anchor',width:30,height:30,scaleX:6,scaleY:6,opacity:0}}};
}

// Pixel-level Canvas/Image fixture for real browser-only asset functions. It
// implements nearest-neighbour source-over blits, not a GPU/visual acceptance.
export function installPixelCanvas(){
 const previous={document:globalThis.document,Image:globalThis.Image,create:URL.createObjectURL,revoke:URL.revokeObjectURL},urls=new Map();let serial=0;
 class Canvas{
  constructor(){this._width=0;this._height=0;this.data=new Uint8ClampedArray();this.context=new Context(this);}
  get width(){return this._width;}set width(n){this._width=n;this.data=new Uint8ClampedArray(this._width*this._height*4);}
  get height(){return this._height;}set height(n){this._height=n;this.data=new Uint8ClampedArray(this._width*this._height*4);}
  getContext(type){assert.equal(type,'2d');return this.context;}
 }
 class Context{
  constructor(canvas){this.canvas=canvas;this.fillStyle='#fff';this.globalAlpha=1;}
  drawImage(source,...args){
   const sw=source.naturalWidth??source.width,sh=source.naturalHeight??source.height,s=source.data;assert.ok(s&&sw&&sh,'Drawable has actual pixels');
   let sx=0,sy=0,w=sw,h=sh,dx=0,dy=0,dw=sw,dh=sh;
   if(args.length===2)[dx,dy]=args;else if(args.length===4)[dx,dy,dw,dh]=args;else if(args.length===8)[sx,sy,w,h,dx,dy,dw,dh]=args;else assert.fail('Unexpected drawImage arguments');
   const target=this.canvas;
   for(let y=Math.max(0,Math.floor(dy));y<Math.min(target.height,Math.ceil(dy+dh));y++)for(let x=Math.max(0,Math.floor(dx));x<Math.min(target.width,Math.ceil(dx+dw));x++){
    const xx=Math.min(sw-1,Math.max(0,Math.floor(sx+(x+.5-dx)/dw*w))),yy=Math.min(sh-1,Math.max(0,Math.floor(sy+(y+.5-dy)/dh*h))),a=(yy*sw+xx)*4,b=(y*target.width+x)*4,alpha=s[a+3]/255*this.globalAlpha,old=target.data[b+3]/255,out=alpha+old*(1-alpha);
    for(let c=0;c<3;c++)target.data[b+c]=out?Math.round((s[a+c]*alpha+target.data[b+c]*old*(1-alpha))/out):0;
    target.data[b+3]=Math.round(out*255);
   }
  }
  getImageData(x,y,w,h){const c=this.canvas,data=new Uint8ClampedArray(w*h*4);for(let yy=0;yy<h;yy++)for(let xx=0;xx<w;xx++)if(x+xx>=0&&x+xx<c.width&&y+yy>=0&&y+yy<c.height)data.set(c.data.subarray(((y+yy)*c.width+x+xx)*4,((y+yy)*c.width+x+xx)*4+4),(yy*w+xx)*4);return {width:w,height:h,data};}
  putImageData(image,x,y){const c=this.canvas;for(let yy=0;yy<image.height;yy++)for(let xx=0;xx<image.width;xx++)if(x+xx>=0&&x+xx<c.width&&y+yy>=0&&y+yy<c.height)c.data.set(image.data.subarray((yy*image.width+xx)*4,(yy*image.width+xx)*4+4),((yy+y)*c.width+xx+x)*4);}
  clearRect(x,y,w,h){for(let yy=Math.max(0,y);yy<Math.min(this.canvas.height,y+h);yy++)this.canvas.data.fill(0,(yy*this.canvas.width+Math.max(0,x))*4,(yy*this.canvas.width+Math.min(this.canvas.width,x+w))*4);}
  beginPath(){this.path=null;}ellipse(x,y,rx,ry){this.path={x,y,rx,ry};}
  fill(){const p=this.path;if(!p)return;const c=this.canvas;for(let y=0;y<c.height;y++)for(let x=0;x<c.width;x++)if(((x+.5-p.x)/p.rx)**2+((y+.5-p.y)/p.ry)**2<=1)c.data.set([255,255,255,255],(y*c.width+x)*4);}
  fillRect(x,y,w,h){const c=this.canvas;for(let yy=Math.max(0,y);yy<Math.min(c.height,y+h);yy++)for(let xx=Math.max(0,x);xx<Math.min(c.width,x+w);xx++)c.data.set([255,255,255,255],(yy*c.width+xx)*4);}
 }
 globalThis.document={createElement(type){assert.equal(type,'canvas');return new Canvas();}};
 URL.createObjectURL=blob=>{const key='blob:pixel-fixture-'+(++serial);urls.set(key,blob);return key;};URL.revokeObjectURL=key=>urls.delete(key);
 globalThis.Image=class{
  set src(value){this._src=value;if(!value)return;this.loading=Promise.resolve().then(async()=>{const blob=urls.get(value);assert.ok(blob,'Known Blob URL');const image=readRgbaPNG(await blob.arrayBuffer());Object.assign(this,{naturalWidth:image.width,naturalHeight:image.height,width:image.width,height:image.height,data:image.data});this.onload?.();}).catch(error=>{this.onerror?.(error);throw error;});}
  get src(){return this._src;}decode(){return this.loading;}
 };
 return {restore(){globalThis.document=previous.document;globalThis.Image=previous.Image;URL.createObjectURL=previous.create;URL.revokeObjectURL=previous.revoke;},urls};
}
