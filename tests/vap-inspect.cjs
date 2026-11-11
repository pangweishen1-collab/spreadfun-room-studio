const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
(async()=>{
  const {readVapFile}=await import('../vap-inspect.mjs');
  const {appendVapcBox,insertVapcBox,extractVapcBox,makeVapc,makeVapPreviewCopy,parseMp4TopLevelBoxes}=await import('../vap-protocol.mjs');
  const plain=await fs.readFile('tests/fixtures/vap-aac-source.mp4');
  const bytes=appendVapcBox(new Uint8Array(plain),makeVapc({width:720,height:1560,fps:24,frames:48,alphaScale:.5}));
  const blob=new Blob([bytes],{type:'video/mp4'}),result=await readVapFile(blob);
  assert.strictEqual(result.blob,blob,'inspection preserves original encoded bytes');
  assert.deepEqual(result.config,extractVapcBox(new Uint8Array(bytes)));
  const native=makeVapc({width:720,height:1560,fps:24,frames:48,alphaScale:.5});native.info.isVapx=1;native.src=[{srcId:'0',srcType:'img',srcTag:'tag1',w:64,h:64,loadType:'net',fitType:'fitXY'},{srcId:'1',srcType:'txt',srcTag:'[name]',w:140,h:32,color:'#ffffff',style:'b',loadType:'local',fitType:'fitXY'}];native.frame=[{i:0,obj:[{srcId:'0',z:0,frame:[40,80,64,64],mFrame:[728,800,64,64],mt:0}]}];native.funToolkit={resourceDefaults:{name:'测试昵称'}};
  const nativeBytes=appendVapcBox(new Uint8Array(plain),native),nativeFile=new Blob([nativeBytes],{type:'video/mp4'}),nativeRead=await readVapFile(nativeFile);assert.equal(nativeRead.config.info.isVapx,1);assert.deepEqual(nativeRead.config.src,native.src);assert.deepEqual(nativeRead.config.frame,native.frame);assert.equal(nativeRead.config.funToolkit.resourceDefaults.name,'测试昵称');assert.strictEqual(nativeRead.blob,nativeFile,'inspection does not flatten animated resource tags or replace encoded source');
  native.src[1].fontStyle={font:'bold 34px Arial',color:'#ffffff'};
  const official=insertVapcBox(plain,native);
  const preview=makeVapPreviewCopy(official);
  const officialOrder=['ftyp','free','moov','vapc','mdat'];
  assert.deepEqual(parseMp4TopLevelBoxes(official).map(box=>box.type),officialOrder);
  assert.deepEqual(parseMp4TopLevelBoxes(preview).map(box=>box.type),officialOrder);
  assert.deepEqual(extractVapcBox(official),{
    info:native.info,src:native.src.map(({fontStyle,...source})=>source),frame:native.frame,
  });
  assert.deepEqual((await readVapFile(new Blob([official]))).config,native,'reopening an official export restores local project metadata');
  const previewConfig={info:{...native.info,isVapx:0}};
  assert.deepEqual((await readVapFile(new Blob([preview]))).config,previewConfig,'preview removes dynamic resources and private project metadata');
  assert.deepEqual(extractVapcBox(makeVapPreviewCopy(nativeBytes)),previewConfig,'legacy terminal vapc still supports preview');

  const {Input,BufferSource,MP4,EncodedPacketSink}=await import('../vendor/mediabunny/mediabunny.mjs');
  async function packets(bytes){
    const input=new Input({source:new BufferSource(bytes),formats:[MP4]});
    try{
      const tracks=await input.getTracks();
      assert.equal(tracks.length,2);
      return await Promise.all(tracks.map(async track=>{
        const result=[];
        for await(const packet of new EncodedPacketSink(track).packets()){
          result.push({data:packet.data,timestamp:packet.timestamp,duration:packet.duration});
        }
        assert.ok(result.length>0);
        return result;
      }));
    }finally{input.dispose()}
  }
  const originals=await packets(plain);
  assert.deepEqual(await packets(official),originals,'official insertion preserves encoded audio, video and packet timing');
  assert.deepEqual(await packets(preview),originals,'preview removal preserves encoded audio, video and packet timing');
  for(const value of [null,{size:0},{size:200*1024*1024+1}])await assert.rejects(readVapFile(value),/file/);
  for(const value of [new Blob(['not mp4']),new Blob([bytes.subarray(0,bytes.length-20)])])await assert.rejects(readVapFile(value),/format/);
  await assert.rejects(readVapFile(new Blob([plain])),/format/);
  console.log('vap-inspect: native atom order, preserved audio/video packets and timing, restored project metadata, legacy/official preview, and invalid MP4 rejection passed. Browser SDK playback checked separately.');
})().catch(e=>{console.error(e);process.exitCode=1});
