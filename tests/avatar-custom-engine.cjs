// Independent artifact checks: source timing, binary records, PNG dimensions and ZIP contents.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const zlib=require('node:zlib');
const {createHash}=require('node:crypto');
const root=path.join(__dirname,'..');
const zipModule={exports:{}};
vm.runInNewContext(fs.readFileSync(path.join(root,'vendor/jszip-3.10.1.min.js'),'utf8'),{module:zipModule,exports:zipModule.exports,Uint8Array,ArrayBuffer,Buffer,Promise,setTimeout,clearTimeout,setImmediate,clearImmediate,console});
const JSZip=zipModule.exports;
function vint(n){n=BigInt(n);const bytes=[];do{const b=Number(n&127n);n>>=7n;bytes.push(b|(n?128:0))}while(n);return Buffer.from(bytes)}
const field=(id,wire,data)=>Buffer.concat([vint(id*8+wire),...(wire===2?[vint(data.length)]:[]),Buffer.from(data)]);
const msg=(id,data)=>field(id,2,data),str=(id,s)=>msg(id,Buffer.from(s));
function scan(bytes){
  const out=[];let at=0;
  function number(){let n=0n,shift=0n;for(;;){const b=bytes[at++];n|=BigInt(b&127)<<shift;if(!(b&128))return Number(n);shift+=7n}}
  while(at<bytes.length){const start=at,tag=number(),id=tag>>>3,wire=tag&7;let dataAt=at;if(wire===0)number();else if(wire===2){const length=number();dataAt=at;at+=length}else if(wire===5)at+=4;else if(wire===1)at+=8;else throw Error('test parser unsupported wire');out.push({id,wire,data:Buffer.from(bytes.subarray(dataAt,at)),raw:Buffer.from(bytes.subarray(start,at))})}return out;
}
const last=(rs,id)=>rs.filter(r=>r.id===id).at(-1);
const float=(rs,id,otherwise=0)=>last(rs,id)?.data.readFloatLE(0)??otherwise;
const near=(a,b)=>assert.ok(Math.abs(a-b)<=Math.max(1e-4,Math.abs(b)*1e-6),`${a} != ${b}`);
function png(width,height){
  let crcTable;const crc=bytes=>{if(!crcTable)crcTable=Array.from({length:256},(_,n)=>{for(let j=0;j<8;j++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0});let c=0xffffffff;for(const b of bytes)c=crcTable[(c^b)&255]^(c>>>8);return (c^0xffffffff)>>>0};
  const chunk=(kind,data)=>{const payload=Buffer.concat([Buffer.from(kind),data]),head=Buffer.alloc(4),tail=Buffer.alloc(4);head.writeUInt32BE(data.length);tail.writeUInt32BE(crc(payload));return Buffer.concat([head,payload,tail])};
  const header=Buffer.alloc(13);header.writeUInt32BE(width);header.writeUInt32BE(height,4);header[8]=8;header[9]=6;
  const rows=Buffer.alloc(height*(width*4+1));for(let y=0;y<height;y++)for(let x=0;x<width;x++){const i=y*(width*4+1)+1+x*4;rows[i]=230;rows[i+1]=100;rows[i+2]=40;rows[i+3]=255}
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',zlib.deflateSync(rows)),chunk('IEND',Buffer.alloc(0))]);
}
function decode(bytes){return scan(zlib.inflateSync(bytes))}
const originalV2=fs.readFileSync(path.join(__dirname,'fixtures/avatar-ring-2.svga'));
const originalV1=fs.readFileSync(path.join(__dirname,'fixtures/avatar-ring-1.svga'));
const sourceBody=zlib.inflateSync(originalV2),sourceRecords=scan(sourceBody),sourceSprites=sourceRecords.filter(r=>r.id===4);
const mp3=Buffer.from('ID3 preserved audio payload');
const extraFields=Buffer.concat([msg(3,Buffer.concat([str(1,'sound'),msg(2,mp3)])),msg(5,Buffer.concat([str(1,'sound'),field(2,0,vint(0)),field(3,0,vint(60))])),field(90,0,vint(18446744073709551615n)),field(91,1,Buffer.from([1,2,3,4,5,6,7,8])),msg(92,Buffer.from('future unknown data'))]);
const augmentedBody=Buffer.concat([sourceBody,extraFields]),augmented=zlib.deflateSync(augmentedBody);
const textPng=png(80,40),placement={textImage:textPng,x:17,y:23,width:40,height:20};
(async()=>{
  const {readSvga,readSvgaInfo,buildCustomizedSvga,SvgaCustomizeError,SVGA_MAX_OUTPUT_BYTES}=await import('../avatar-custom-engine.mjs');
  assert.equal(SVGA_MAX_OUTPUT_BYTES,3000000);
  const before=createHash('sha256').update(augmented).digest('hex');
  const model=await readSvga(augmented);assert.deepEqual(model.info,{width:320,height:320,fps:30,frames:60,format:'protobuf',imageCount:2});assert.deepEqual(await readSvgaInfo(augmented),model.info);
  const progress=[];const result=await buildCustomizedSvga(model,placement,{onProgress:x=>progress.push(x)});
  assert.ok(result.bytes.length<3000000);assert.equal(result.mime,'application/octet-stream');assert.equal(result.optimized,false);assert.equal(result.size,result.bytes.length);assert.equal(result.info.frames,60);assert.equal(progress.at(-1).progress,100);
  assert.equal(createHash('sha256').update(augmented).digest('hex'),before,'input bytes remain unchanged');
  const actualBody=zlib.inflateSync(result.bytes);assert.deepEqual(actualBody.subarray(0,augmentedBody.length),augmentedBody,'all original protobuf, audio, future and animation records survive byte-for-byte');
  const all=scan(actualBody),appended=all.slice(scan(augmentedBody).length);assert.deepEqual(appended.map(r=>r.id),[3,4]);
  const image=scan(appended[0].data);assert.equal(last(image,1).data.toString(),result.imageKey);assert.deepEqual(last(image,2).data,textPng);
  const sprite=scan(appended[1].data),frames=sprite.filter(r=>r.id===2);assert.equal(frames.length,60);assert.equal(last(sprite,1).data.toString(),result.imageKey);
  for(const {data} of frames){const fr=scan(data),layout=scan(last(fr,2).data),matrix=scan(last(fr,3).data);assert.equal(float(fr,1),1);assert.equal(float(layout,3),80);assert.equal(float(layout,4),40);assert.equal(float(matrix,1),.5);assert.equal(float(matrix,4),.5);assert.equal(float(matrix,5),17);assert.equal(float(matrix,6),23)}
  assert.equal((await readSvga(result.bytes)).info.imageCount,3,'finished output reparses independently');
  const second=await buildCustomizedSvga(model,{...placement,x:40});assert.equal(second.imageKey,result.imageKey,'repeated builds start from original, never accumulate overlays');assert.deepEqual(Buffer.from(model.sourceBytes),augmented);
  const third=await buildCustomizedSvga(result.bytes,placement);assert.notEqual(third.imageKey,result.imageKey,'reimported text keys never collide');
  await assert.rejects(()=>readSvga(Buffer.from('broken file')),e=>e instanceof SvgaCustomizeError&&e.code==='invalidSvga');
  await assert.rejects(()=>buildCustomizedSvga(model,{...placement,textImage:Buffer.from('bad')}),e=>e.code==='invalidTextImage');
  await assert.rejects(()=>buildCustomizedSvga(model,{...placement,width:Infinity}),e=>e.code==='invalidPlacement');
  await assert.rejects(()=>buildCustomizedSvga(model,{...placement,maxBytes:3000001}),e=>e.code==='invalidSizeLimit');
  await assert.rejects(()=>buildCustomizedSvga(model,{...placement,maxBytes:1024}),e=>e.code==='sizeLimit'&&e.actualBytes>e.maxBytes);
  // The real default 3 MB ceiling must also reject incompressible unknown/audio data;
  // it must never erase those original records or silently drop animation frames.
  const noise=Buffer.alloc(3050000);let seed=0x12345678;
  for(let i=0;i<noise.length;i++){seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;noise[i]=seed&255}
  const oversized=zlib.deflateSync(Buffer.concat([sourceBody,msg(94,noise)]));
  assert.ok(oversized.length>3000000);
  await assert.rejects(()=>buildCustomizedSvga(oversized,{...placement,optimizeImage:async()=>null}),e=>e.code==='sizeLimit'&&e.maxBytes===3000000&&e.actualBytes>3000000);
  // Real PNG resizing compensates all existing bitmap transforms, keeping its canvas geometry.
  const requests=[];const optimized=await buildCustomizedSvga(originalV2,{...placement,maxBytes:3000,optimizeImage:async request=>{requests.push(request);return png(16,16)}});
  assert.equal(optimized.optimized,true);assert.equal(optimized.optimizedImages,1);assert.equal(requests[0].canResize,true);assert.equal(requests[0].width,320);assert.equal(requests[0].maxWidth,288);assert.ok(optimized.size<=3000);
  const shrunk=decode(optimized.bytes),newOriginalSprites=shrunk.filter(r=>r.id===4).slice(0,sourceSprites.length);
  for(let i=0;i<sourceSprites.length;i++){
    const oldFrames=scan(sourceSprites[i].data).filter(r=>r.id===2),newFrames=scan(newOriginalSprites[i].data).filter(r=>r.id===2);assert.equal(oldFrames.length,newFrames.length);
    for(let j=0;j<oldFrames.length;j++){const a=scan(oldFrames[j].data),b=scan(newFrames[j].data),am=scan(last(a,3).data),bm=scan(last(b,3).data),al=scan(last(a,2).data),bl=scan(last(b,2).data);near(float(bm,1)*16,float(am,1)*320);near(float(bm,2)*16,float(am,2)*320);near(float(bm,3)*16,float(am,3)*320);near(float(bm,4)*16,float(am,4)*320);near(float(bm,5),float(am,5));near(float(bm,6),float(am,6));near(float(bl,3)*float(bm,1),float(al,3)*float(am,1));assert.equal(float(b,1),float(a,1))}
  }
  // A clip/vector path shares the source transform, so resizing that bitmap is forbidden.
  const first=sourceSprites[0],spriteFields=scan(first.data),firstFrame=spriteFields.findIndex(r=>r.id===2);spriteFields[firstFrame]={...spriteFields[firstFrame],raw:msg(2,Buffer.concat([spriteFields[firstFrame].data,str(4,'M0 0L100 0L100 100Z')]))};
  const clipSource=zlib.deflateSync(Buffer.concat(sourceRecords.map(r=>r===first?msg(4,Buffer.concat(spriteFields.map(f=>f.raw))):r.raw)));
  let clipRequest;await assert.rejects(()=>buildCustomizedSvga(clipSource,{...placement,maxBytes:1024,optimizeImage:async request=>{clipRequest=request;return png(16,16)}}),e=>e.code==='sizeLimit');assert.equal(clipRequest.canResize,false);assert.equal(clipRequest.maxWidth,320);
  // ZIP 1.0 retains metadata, images, audio and nonstandard root JSON properties.
  const originalZip=await JSZip.loadAsync(originalV1),sourceSpec=JSON.parse(await originalZip.file('movie.spec').async('string'));
  sourceSpec.extra={vendorFuture:7};originalZip.file('movie.spec',JSON.stringify(sourceSpec));originalZip.file('sound.mp3',mp3);const legacyBytes=await originalZip.generateAsync({type:'uint8array',compression:'DEFLATE'});
  const legacyModel=await readSvga(legacyBytes,{JSZip});assert.equal(legacyModel.format,'zip');assert.equal(legacyModel.info.frames,60);
  const legacy=await buildCustomizedSvga(legacyModel,placement),outZip=await JSZip.loadAsync(legacy.bytes),spec=JSON.parse(await outZip.file('movie.spec').async('string'));
  assert.deepEqual(spec.movie,sourceSpec.movie);assert.deepEqual(spec.extra,sourceSpec.extra);assert.deepEqual(spec.sprites.slice(0,-1),JSON.parse(JSON.stringify(sourceSpec.sprites)));assert.equal(spec.sprites.at(-1).frames.length,60);assert.equal(spec.sprites.at(-1).frames[0].transform.a,.5);assert.equal(spec.sprites.at(-1).frames[0].transform.tx,17);
  assert.deepEqual(Buffer.from(await outZip.file('frame.png').async('uint8array')),Buffer.from(await originalZip.file('frame.png').async('uint8array')));assert.deepEqual(Buffer.from(await outZip.file('sound.mp3').async('uint8array')),mp3);
  assert.deepEqual(Buffer.from(await outZip.file(spec.images[legacy.imageKey]+'.png').async('uint8array')),textPng);
  const again=await buildCustomizedSvga(legacyModel,placement);assert.equal(Object.keys((await JSZip.loadAsync(again.bytes)).files).length,Object.keys(outZip.files).length,'cached legacy source is not mutated by packaging');
  // Duplicate image aliases in a legacy file must share optimization and compensated geometry.
  sourceSpec.images.alias='frame';sourceSpec.sprites.push({...sourceSpec.sprites[0],imageKey:'alias'});originalZip.file('movie.spec',JSON.stringify(sourceSpec));const aliasInput=await originalZip.generateAsync({type:'uint8array',compression:'DEFLATE'});
  const aliasOutput=await buildCustomizedSvga(aliasInput,{...placement,maxBytes:4000,optimizeImage:async()=>png(16,16)},{JSZip});const aliasZip=await JSZip.loadAsync(aliasOutput.bytes),aliasSpec=JSON.parse(await aliasZip.file('movie.spec').async('string'));
  const originalFrame=sourceSpec.sprites[0].frames[0],aliasedFrame=aliasSpec.sprites.find(s=>s.imageKey==='alias').frames[0];near(aliasedFrame.transform.a*16,originalFrame.transform.a*320);
  await assert.rejects(()=>readSvga(legacyBytes),e=>e.code==='unsupportedBrowser');
  const binaryZip=await JSZip.loadAsync(originalV1);binaryZip.file('movie.binary',Buffer.from([1,2]));await assert.rejects(()=>binaryZip.generateAsync({type:'uint8array'}).then(bytes=>readSvga(bytes,{JSZip})),e=>e.code==='unsupportedLegacyBinary');
  console.log('avatar-custom-engine: SVGA 2.0 and ZIP 1.0 text packaging, original/unknown/audio byte preservation, 2x PNG geometry, repeatability, collision-free keys, strict 3 MB bound, safe bitmap optimization, clip protection, legacy aliases and invalid input checks passed.');
})().catch(error=>{console.error(error);process.exitCode=1});
