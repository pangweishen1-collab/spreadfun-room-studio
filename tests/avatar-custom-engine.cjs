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
function png(width,height,pixel,level=6){
  let crcTable;const crc=bytes=>{if(!crcTable)crcTable=Array.from({length:256},(_,n)=>{for(let j=0;j<8;j++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0});let c=0xffffffff;for(const b of bytes)c=crcTable[(c^b)&255]^(c>>>8);return (c^0xffffffff)>>>0};
  const chunk=(kind,data)=>{const payload=Buffer.concat([Buffer.from(kind),data]),head=Buffer.alloc(4),tail=Buffer.alloc(4);head.writeUInt32BE(data.length);tail.writeUInt32BE(crc(payload));return Buffer.concat([head,payload,tail])};
  const header=Buffer.alloc(13);header.writeUInt32BE(width);header.writeUInt32BE(height,4);header[8]=8;header[9]=6;
  const rows=Buffer.alloc(height*(width*4+1));for(let y=0;y<height;y++)for(let x=0;x<width;x++){const i=y*(width*4+1)+1+x*4;rows.set(pixel?pixel(x,y):[230,100,40,255],i)}
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',zlib.deflateSync(rows,{level})),chunk('IEND',Buffer.alloc(0))]);
}
function decode(bytes){return scan(zlib.inflateSync(bytes))}
// Independent PNG pixel decoder: verify all channels, including RGB hidden by zero alpha.
function pngPixels(input){
  const bytes=Buffer.from(input),width=bytes.readUInt32BE(16),height=bytes.readUInt32BE(20),depth=bytes[24],type=bytes[25],channels={0:1,2:3,3:1,4:2,6:4}[type];
  assert.equal(depth,8);assert.equal(bytes[28],0);assert.ok(channels);
  const idat=[];let palette,transparency;
  for(let at=8;at<bytes.length;){const length=bytes.readUInt32BE(at),name=bytes.toString('ascii',at+4,at+8),data=bytes.subarray(at+8,at+8+length);if(name==='IDAT')idat.push(data);if(name==='PLTE')palette=data;if(name==='tRNS')transparency=data;at+=length+12;}
  const packed=zlib.inflateSync(Buffer.concat(idat)),rowBytes=width*channels,raw=Buffer.alloc(rowBytes*height);assert.equal(packed.length,height*(rowBytes+1));
  for(let y=0;y<height;y++){const filter=packed[y*(rowBytes+1)];for(let x=0;x<rowBytes;x++){const left=x>=channels?raw[y*rowBytes+x-channels]:0,up=y?raw[(y-1)*rowBytes+x]:0,corner=y&&x>=channels?raw[(y-1)*rowBytes+x-channels]:0;let prediction=0;if(filter===1)prediction=left;else if(filter===2)prediction=up;else if(filter===3)prediction=Math.floor((left+up)/2);else if(filter===4){const p=left+up-corner,a=Math.abs(p-left),b=Math.abs(p-up),c=Math.abs(p-corner);prediction=a<=b&&a<=c?left:b<=c?up:corner}else assert.equal(filter,0);raw[y*rowBytes+x]=(packed[y*(rowBytes+1)+1+x]+prediction)&255}}
  const rgba=Buffer.alloc(width*height*4);
  for(let pixel=0;pixel<width*height;pixel++){const at=pixel*channels,out=pixel*4;
    if(type===6)raw.copy(rgba,out,at,at+4);
    else if(type===2){raw.copy(rgba,out,at,at+3);rgba[out+3]=transparency&&raw[at]===transparency.readUInt16BE(0)&&raw[at+1]===transparency.readUInt16BE(2)&&raw[at+2]===transparency.readUInt16BE(4)?0:255}
    else if(type===0||type===4){rgba[out]=rgba[out+1]=rgba[out+2]=raw[at];rgba[out+3]=type===4?raw[at+1]:transparency&&raw[at]===transparency.readUInt16BE(0)?0:255}
    else{const index=raw[at];palette.copy(rgba,out,index*3,index*3+3);rgba[out+3]=transparency?.[index]??255}
  }
  return {width,height,rgba};
}
function samePngPixels(actual,expected){assert.deepEqual(pngPixels(actual),pngPixels(expected),'PNG repacking must preserve exact decoded RGBA, including transparent RGB')}
function sameOriginalRecords(actual,expected){
  assert.ok(actual.length>=expected.length);
  for(let i=0;i<expected.length;i++){
    const a=actual[i],b=expected[i];if(a.raw.equals(b.raw))continue;
    assert.equal(b.id,3,'timelines/audio/unknown records must remain byte-exact');assert.equal(a.id,3);
    const ae=scan(a.data),be=scan(b.data);assert.deepEqual(ae.filter(r=>r.id!==2).map(r=>r.raw),be.filter(r=>r.id!==2).map(r=>r.raw),'image keys and unknown map fields remain exact');samePngPixels(last(ae,2).data,last(be,2).data);
  }
}
function overlayRecords(layers,keys,count){
  const f=(id,value)=>{const bytes=Buffer.alloc(4);bytes.writeFloatLE(value);return field(id,5,bytes)};
  return layers.flatMap((layer,index)=>{
    const png=Buffer.from(layer.image),pw=png.readUInt32BE(16),ph=png.readUInt32BE(20),layout=msg(2,Buffer.concat([f(1,0),f(2,0),f(3,pw),f(4,ph)])),matrix=msg(3,Buffer.concat([f(1,layer.width/pw),f(2,0),f(3,0),f(4,layer.height/ph),f(5,layer.x),f(6,layer.y)])),frame=msg(2,Buffer.concat([f(1,1),layout,matrix]));
    return [msg(3,Buffer.concat([str(1,keys[index]),msg(2,png)])),msg(4,Buffer.concat([str(1,keys[index]),...Array(count).fill(frame)]))];
  });
}
async function nativeDeflate(bytes){const stream=new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate'));return Buffer.from(await new Response(stream).arrayBuffer())}
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
  assert.ok(result.bytes.length<3000000);assert.equal(result.mime,'application/octet-stream');assert.equal(result.size,result.bytes.length);assert.equal(result.info.frames,60);assert.equal(progress.at(-1).progress,100);assert.ok(result.lossless.beforeBytes>=result.lossless.afterBytes);assert.equal(result.lossless.bytesSaved,result.lossless.beforeBytes-result.lossless.afterBytes);
  assert.equal(createHash('sha256').update(augmented).digest('hex'),before,'input bytes remain unchanged');
  const actualBody=zlib.inflateSync(result.bytes);sameOriginalRecords(scan(actualBody),scan(augmentedBody));
  const all=scan(actualBody),appended=all.slice(scan(augmentedBody).length);assert.deepEqual(appended.map(r=>r.id),[3,4]);
  const image=scan(appended[0].data);assert.equal(last(image,1).data.toString(),result.imageKey);samePngPixels(last(image,2).data,textPng);
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
  assert.equal(optimized.optimized,true);assert.ok(optimized.optimizedImages>=1);assert.equal(requests[0].canResize,true);assert.equal(requests[0].width,320);assert.equal(requests[0].maxWidth,288);assert.ok(optimized.size<=3000);
  const shrunk=decode(optimized.bytes),newOriginalSprites=shrunk.filter(r=>r.id===4).slice(0,sourceSprites.length);
  for(let i=0;i<sourceSprites.length;i++){
    const oldFrames=scan(sourceSprites[i].data).filter(r=>r.id===2),newFrames=scan(newOriginalSprites[i].data).filter(r=>r.id===2);assert.equal(oldFrames.length,newFrames.length);
    for(let j=0;j<oldFrames.length;j++){const a=scan(oldFrames[j].data),b=scan(newFrames[j].data),am=scan(last(a,3).data),bm=scan(last(b,3).data),al=scan(last(a,2).data),bl=scan(last(b,2).data);near(float(bm,1)*16,float(am,1)*320);near(float(bm,2)*16,float(am,2)*320);near(float(bm,3)*16,float(am,3)*320);near(float(bm,4)*16,float(am,4)*320);near(float(bm,5),float(am,5));near(float(bm,6),float(am,6));near(float(bl,3)*float(bm,1),float(al,3)*float(am,1));assert.equal(float(b,1),float(a,1))}
  }
  // A clip/vector path shares the source transform, so resizing that bitmap is forbidden.
  const first=sourceSprites[0],spriteFields=scan(first.data),firstFrame=spriteFields.findIndex(r=>r.id===2);spriteFields[firstFrame]={...spriteFields[firstFrame],raw:msg(2,Buffer.concat([spriteFields[firstFrame].data,str(4,'M0 0L100 0L100 100Z')]))};
  const clipSource=zlib.deflateSync(Buffer.concat(sourceRecords.map(r=>r===first?msg(4,Buffer.concat(spriteFields.map(f=>f.raw))):r.raw)));
  const clipRequests=[];await assert.rejects(()=>buildCustomizedSvga(clipSource,{...placement,maxBytes:1024,optimizeImage:async request=>{clipRequests.push(request);return png(16,16)}}),e=>e.code==='sizeLimit');const clipRequest=clipRequests.find(request=>request.kind==='source');assert.equal(clipRequest.canResize,false);assert.equal(clipRequest.maxWidth,320);
  // ZIP 1.0 retains metadata, images, audio and nonstandard root JSON properties.
  const originalZip=await JSZip.loadAsync(originalV1),sourceSpec=JSON.parse(await originalZip.file('movie.spec').async('string'));
  sourceSpec.extra={vendorFuture:7};originalZip.file('movie.spec',JSON.stringify(sourceSpec));originalZip.file('sound.mp3',mp3);const legacyBytes=await originalZip.generateAsync({type:'uint8array',compression:'DEFLATE'});
  const legacyModel=await readSvga(legacyBytes,{JSZip});assert.equal(legacyModel.format,'zip');assert.equal(legacyModel.info.frames,60);
  const legacy=await buildCustomizedSvga(legacyModel,placement),outZip=await JSZip.loadAsync(legacy.bytes),spec=JSON.parse(await outZip.file('movie.spec').async('string'));
  assert.deepEqual(spec.movie,sourceSpec.movie);assert.deepEqual(spec.extra,sourceSpec.extra);assert.deepEqual(spec.sprites.slice(0,-1),JSON.parse(JSON.stringify(sourceSpec.sprites)));assert.equal(spec.sprites.at(-1).frames.length,60);assert.equal(spec.sprites.at(-1).frames[0].transform.a,.5);assert.equal(spec.sprites.at(-1).frames[0].transform.tx,17);
  samePngPixels(await outZip.file('frame.png').async('uint8array'),await originalZip.file('frame.png').async('uint8array'));assert.deepEqual(Buffer.from(await outZip.file('sound.mp3').async('uint8array')),mp3);
  samePngPixels(await outZip.file(spec.images[legacy.imageKey]+'.png').async('uint8array'),textPng);
  const again=await buildCustomizedSvga(legacyModel,placement);assert.equal(Object.keys((await JSZip.loadAsync(again.bytes)).files).length,Object.keys(outZip.files).length,'cached legacy source is not mutated by packaging');
  // Duplicate image aliases in a legacy file must share optimization and compensated geometry.
  sourceSpec.images.alias='frame';sourceSpec.sprites.push({...sourceSpec.sprites[0],imageKey:'alias'});originalZip.file('movie.spec',JSON.stringify(sourceSpec));const aliasInput=await originalZip.generateAsync({type:'uint8array',compression:'DEFLATE'});
  const aliasOutput=await buildCustomizedSvga(aliasInput,{...placement,maxBytes:4000,optimizeImage:async()=>png(16,16)},{JSZip});const aliasZip=await JSZip.loadAsync(aliasOutput.bytes),aliasSpec=JSON.parse(await aliasZip.file('movie.spec').async('string'));
  const originalFrame=sourceSpec.sprites[0].frames[0],aliasedFrame=aliasSpec.sprites.find(s=>s.imageKey==='alias').frames[0];near(aliasedFrame.transform.a*16,originalFrame.transform.a*320);
  await assert.rejects(()=>readSvga(legacyBytes),e=>e.code==='unsupportedBrowser');
  const binaryZip=await JSZip.loadAsync(originalV1);binaryZip.file('movie.binary',Buffer.from([1,2]));await assert.rejects(()=>binaryZip.generateAsync({type:'uint8array'}).then(bytes=>readSvga(bytes,{JSZip})),e=>e.code==='unsupportedLegacyBinary');
  // Added image overlays remain independent transparent PNG sprites below the text.
  const alphaPng=png(12,8,(x,y)=>[90,170,220,x===0||y===0?0:x<4?128:255]);
  const layers=[{image:alphaPng,x:41,y:57,width:96,height:64,key:'image'},{image:textPng,x:17,y:23,width:40,height:20,key:'text'}];
  const layered=await buildCustomizedSvga(model,{layers});assert.deepEqual(layered.imageKeys,['fun_custom_image','fun_custom_text']);assert.equal(layered.imageKey,'fun_custom_text');assert.equal(layered.info.imageCount,4);
  const layeredBody=zlib.inflateSync(layered.bytes);sameOriginalRecords(scan(layeredBody),scan(augmentedBody));
  const additions=scan(layeredBody).slice(scan(augmentedBody).length);assert.deepEqual(additions.map(record=>record.id),[3,4,3,4]);
  for(let i=0;i<layers.length;i++){
    const entry=scan(additions[i*2].data),sprite=scan(additions[i*2+1].data);assert.equal(last(entry,1).data.toString(),layered.imageKeys[i]);assert.equal(last(sprite,1).data.toString(),layered.imageKeys[i]);samePngPixels(last(entry,2).data,layers[i].image);
    const frames=sprite.filter(record=>record.id===2);assert.equal(frames.length,60);const frame=scan(frames[0].data),matrix=scan(last(frame,3).data),layout=scan(last(frame,2).data);near(float(matrix,5),layers[i].x);near(float(matrix,6),layers[i].y);near(float(matrix,1)*float(layout,3),layers[i].width);near(float(matrix,4)*float(layout,4),layers[i].height);
  }
  const layeredAgain=await buildCustomizedSvga(model,{layers});assert.deepEqual(layeredAgain.imageKeys,layered.imageKeys);assert.deepEqual(Buffer.from(layeredAgain.bytes),Buffer.from(layered.bytes),'repeated layer exports never mutate the cached source or caller images');
  const reimportedLayers=await buildCustomizedSvga(layered.bytes,{layers});assert.deepEqual(reimportedLayers.imageKeys,['fun_custom_image_2','fun_custom_text_2']);
  const imageOnly=await buildCustomizedSvga(model,{layers:[{...layers[0],key:undefined}]});assert.equal(imageOnly.imageKey,'fun_custom_image');assert.deepEqual(imageOnly.imageKeys,['fun_custom_image']);assert.equal(imageOnly.info.imageCount,3);
  const duplicates=await buildCustomizedSvga(model,{layers:[layers[0],layers[0]]});assert.deepEqual(duplicates.imageKeys,['fun_custom_image','fun_custom_image_2']);
  for(const invalid of [null,{},[],Array.from({length:9},()=>layers[0]),[null],[{...layers[0],key:'../../custom'}]])await assert.rejects(()=>buildCustomizedSvga(model,{layers:invalid}),e=>e.code==='invalidLayers');
  await assert.rejects(()=>buildCustomizedSvga(model,{layers:[{...layers[0],image:Buffer.from('not png')}]}),e=>e.code==='invalidImage');
  await assert.rejects(()=>buildCustomizedSvga(model,{layers:[{...layers[0],height:0}]}),e=>e.code==='invalidPlacement');
  await assert.rejects(()=>buildCustomizedSvga(model,{layers,maxBytes:1024}),e=>e.code==='sizeLimit');

  // Legacy ZIP keys and physical filenames are independently collision-safe.
  const reservedZip=await JSZip.loadAsync(originalV1),reservedBytes=Buffer.from('keep this unrelated file');reservedZip.file('fun_custom_image.png',reservedBytes);
  const reservedInput=await reservedZip.generateAsync({type:'uint8array',compression:'DEFLATE'}),legacyLayers=await buildCustomizedSvga(reservedInput,{layers},{JSZip}),legacyLayersZip=await JSZip.loadAsync(legacyLayers.bytes),legacyLayersSpec=JSON.parse(await legacyLayersZip.file('movie.spec').async('string'));
  assert.deepEqual(legacyLayersSpec.sprites.slice(-2).map(sprite=>sprite.imageKey),legacyLayers.imageKeys);assert.equal(legacyLayersSpec.images.fun_custom_image,'fun_custom_image_2');assert.deepEqual(Buffer.from(await legacyLayersZip.file('fun_custom_image.png').async('uint8array')),reservedBytes);
  samePngPixels(await legacyLayersZip.file(legacyLayersSpec.images.fun_custom_image+'.png').async('uint8array'),alphaPng);
  for(const [index,sprite] of legacyLayersSpec.sprites.slice(-2).entries()){assert.equal(sprite.frames.length,60);near(sprite.frames[0].transform.tx,layers[index].x);near(sprite.frames[0].transform.a*sprite.frames[0].layout.width,layers[index].width)}
  assert.deepEqual(legacyLayersSpec.sprites.slice(0,-2),JSON.parse(JSON.stringify((await readSvga(reservedInput,{JSZip})).spec.sprites)));

  // A large newly uploaded picture can be optimized before any original artwork or text.
  let imageSeed=0x79ad4245;const nextByte=()=>{imageSeed^=imageSeed<<13;imageSeed^=imageSeed>>>17;imageSeed^=imageSeed<<5;return imageSeed&255};
  const largePicture=png(1024,1024,()=>[nextByte(),nextByte(),nextByte(),255]);
  const bigLayers=[{image:largePicture,x:-12,y:33,width:160,height:100,key:'image'},layers[1]];
  await assert.rejects(()=>buildCustomizedSvga(model,{layers:bigLayers}),e=>e.code==='sizeLimit'&&e.actualBytes>3000000);
  const layerOptimization=[];const optimizedLayers=await buildCustomizedSvga(model,{layers:bigLayers,optimizeImage:async request=>{layerOptimization.push(request);return png(64,64)}});assert.equal(optimizedLayers.optimized,true);assert.ok(optimizedLayers.optimizedImages>=1);assert.ok(optimizedLayers.size<=3000000);assert.equal(layerOptimization.length,1,'an optimized picture that fits the cap leaves original artwork and text untouched');assert.equal(layerOptimization[0].key,'fun_custom_image');assert.equal(layerOptimization[0].kind,'image');assert.equal(layerOptimization[0].maxWidth,922);
  const optimizedLayerRecords=decode(optimizedLayers.bytes);sameOriginalRecords(optimizedLayerRecords,scan(augmentedBody));
  const optimizedPicture=scan(optimizedLayerRecords.filter(record=>record.id===4).at(-2).data),optimizedFrame=scan(optimizedPicture.find(record=>record.id===2).data),optimizedLayout=scan(last(optimizedFrame,2).data),optimizedMatrix=scan(last(optimizedFrame,3).data);assert.equal(float(optimizedLayout,3),64);near(float(optimizedMatrix,1)*64,160);near(float(optimizedMatrix,4)*64,100);near(float(optimizedMatrix,5),-12);near(float(optimizedMatrix,6),33);
  samePngPixels(last(scan(optimizedLayerRecords.filter(record=>record.id===3).at(-1).data),2).data,textPng);
  const legacyOptimizedLayers=await buildCustomizedSvga(legacyModel,{layers:bigLayers,optimizeImage:async()=>png(64,64)}),legacyOptimizedZip=await JSZip.loadAsync(legacyOptimizedLayers.bytes),legacyOptimizedSpec=JSON.parse(await legacyOptimizedZip.file('movie.spec').async('string'));
  const legacyPicture=legacyOptimizedSpec.sprites.at(-2).frames[0];assert.ok(legacyOptimizedLayers.size<=3000000);assert.ok(legacyOptimizedLayers.optimizedImages>=1);near(legacyPicture.transform.a*legacyPicture.layout.width,160);near(legacyPicture.transform.d*legacyPicture.layout.height,100);near(legacyPicture.transform.tx,-12);assert.deepEqual(legacyOptimizedSpec.sprites.slice(0,-2),JSON.parse(JSON.stringify(legacyModel.spec.sprites)),'oversized ZIP overlays do not unnecessarily rescale original sprites');

  // Prefer exact PNG and level-9 container compression even for files already below 3 MB.
  let exactSeed=0x2ad542a1;const random=()=>{exactSeed^=exactSeed<<13;exactSeed^=exactSeed>>>17;exactSeed^=exactSeed<<5;return exactSeed&255};
  const storedPicture=png(128,128,()=>[random(),random(),random(),255],0),exactLayers=[{image:storedPicture,x:11,y:13,width:64,height:64,key:'image'},layers[1]];
  let resizeCalls=0;const exact=await buildCustomizedSvga(model,{layers:exactLayers,allowLossyOptimization:false,optimizeImage:async()=>{resizeCalls++;return png(1,1)}});
  const nativeBaseline=await nativeDeflate(Buffer.concat([augmentedBody,...overlayRecords(exactLayers,exact.imageKeys,60)]));
  assert.equal(exact.lossless.baselineBytes,nativeBaseline.length,'savings use the complete pre-optimization native container');assert.equal(exact.lossless.savedBytes,nativeBaseline.length-exact.bytes.length);assert.ok(exact.lossless.savedBytes>0);assert.ok(exact.lossless.imageBytesSaved>0);assert.ok(exact.lossless.optimizedImages>0);assert.ok(exact.bytes.length<nativeBaseline.length);assert.equal(resizeCalls,0);
  const exactRecords=decode(exact.bytes);sameOriginalRecords(exactRecords,scan(augmentedBody));
  for(const [index,layer] of exactLayers.entries()){const entry=scan(exactRecords.slice(scan(augmentedBody).length)[index*2].data);samePngPixels(last(entry,2).data,layer.image)}
  let prohibitedResize=0;await assert.rejects(()=>buildCustomizedSvga(model,{layers:bigLayers,allowLossyOptimization:false,optimizeImage:async()=>{prohibitedResize++;return png(1,1)}}),e=>e.code==='sizeLimit');assert.equal(prohibitedResize,0,'explicit strict lossless mode must reject an over-budget file rather than resize it');
  const exactZip=await buildCustomizedSvga(legacyModel,{layers:exactLayers,allowLossyOptimization:false}),exactArchive=await JSZip.loadAsync(exactZip.bytes),exactSpec=JSON.parse(await exactArchive.file('movie.spec').async('string'));
  assert.ok(exactZip.lossless.optimizedImages>0);assert.ok(exactZip.lossless.savedBytes>0);assert.deepEqual(exactSpec.sprites.slice(0,-2),JSON.parse(JSON.stringify(legacyModel.spec.sprites)));samePngPixels(await exactArchive.file(exactSpec.images.fun_custom_image+'.png').async('uint8array'),storedPicture);

  // Both worker operations may fail; preserve the original assets and native valid package.
  const previousWorker=globalThis.Worker;globalThis.Worker=class{
    postMessage({id}){queueMicrotask(()=>this.onmessage({data:{id,error:'forced compression failure'}}))}
    terminate(){}
  };
  try{
    const fallback=await buildCustomizedSvga(model,{layers:exactLayers,allowLossyOptimization:false});assert.deepEqual(Buffer.from(fallback.bytes),nativeBaseline);assert.equal(fallback.lossless.savedBytes,0);assert.equal(fallback.lossless.optimizedImages,0);assert.deepEqual(zlib.inflateSync(fallback.bytes),Buffer.concat([augmentedBody,...overlayRecords(exactLayers,fallback.imageKeys,60)]));
  }finally{if(previousWorker===undefined)delete globalThis.Worker;else globalThis.Worker=previousWorker}
  console.log('avatar-custom-engine: backward-compatible text and ordered image/text layers, image-only exports, source/audio byte preservation, transparent PNG/2x geometry, repeatability and collision-free keys, strict whole-file3MB cap, exact RGBA lossless PNG/container optimization, reported whole-file savings, prohibited resize, native-fallback recovery, clip protection and legacy ZIP packaging passed.');
})().catch(error=>{console.error(error);process.exitCode=1});
