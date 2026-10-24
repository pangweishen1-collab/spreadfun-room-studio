const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),zlib=require('node:zlib');
const sandbox={window:{},Blob,Response,CompressionStream,Uint8Array,Uint32Array,DataView,Error,Number};
vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname,'../market-icon-png.js'),'utf8'),sandbox);
const encode=sandbox.window.MarketIconPNG.encode;
const pixels=Uint8Array.from({length:5*3*4},(_,i)=>i%4===3?255:(i*47)%256),canvas={width:5,height:3,getContext:()=>({getImageData:()=>({data:pixels})})};
function crc32(bytes){let crc=0xffffffff;for(const byte of bytes){crc^=byte;for(let j=0;j<8;j++)crc=(crc>>>1)^((crc&1)?0xedb88320:0)}return (crc^0xffffffff)>>>0}
async function check(alpha){
 const blob=await encode(canvas,{alpha}),png=Buffer.from(await blob.arrayBuffer());assert.equal(blob.type,'image/png');assert.deepEqual([...png.subarray(0,8)],[137,80,78,71,13,10,26,10]);let offset=8;const chunks=[];
 while(offset<png.length){const length=png.readUInt32BE(offset),type=png.toString('ascii',offset+4,offset+8),data=png.subarray(offset+8,offset+8+length);assert.equal(png.readUInt32BE(offset+8+length),crc32(png.subarray(offset+4,offset+8+length)));chunks.push({type,data});offset+=length+12}
 assert.deepEqual(chunks.map(c=>c.type),['IHDR','sRGB','IDAT','IEND']);const h=chunks[0].data;assert.equal(h.readUInt32BE(0),5);assert.equal(h.readUInt32BE(4),3);assert.equal(h[8],8);assert.equal(h[9],alpha?6:2);assert.equal(chunks[1].data[0],0);
 const raw=zlib.inflateSync(chunks[2].data),channels=alpha?4:3,stride=5*channels;assert.equal(raw.length,(stride+1)*3);
 for(let y=0;y<3;y++){const start=y*(stride+1);assert.equal(raw[start],1);const row=[];for(let x=0;x<5;x++)for(let c=0;c<channels;c++){const j=x*channels+c;row[j]=(raw[start+1+j]+(x?row[j-channels]:0))&255;assert.equal(row[j],pixels[(y*5+x)*4+c])}}
}
(async()=>{
 await check(false);await check(true);pixels[3]=127;await check(true);await assert.rejects(()=>encode(canvas,{alpha:false}),/marketExportError/);pixels[3]=255;
 await assert.rejects(()=>encode({...canvas,width:0}),/marketExportError/);await assert.rejects(()=>encode({...canvas,getContext:()=>null}),/marketExportError/);
 sandbox.CompressionStream=undefined;await assert.rejects(()=>encode(canvas),/marketUnsupported/);
 console.log('PASS: exact RGB/RGBA PNG, sRGB metadata, chunk CRC, zlib decompression and pixel reconstruction; alpha, invalid canvas and unsupported-browser guards.');
})().catch(error=>{console.error(error);process.exitCode=1});
