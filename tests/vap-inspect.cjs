const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
(async()=>{
  const {readVapFile}=await import('../vap-inspect.mjs');
  const {extractVapcBox}=await import('../vap-protocol.mjs');
  const {appendVapcBox,makeVapc}=await import('../vap-protocol.mjs');
  const plain=await fs.readFile('tests/fixtures/vap-aac-source.mp4');
  const bytes=appendVapcBox(new Uint8Array(plain),makeVapc({width:720,height:1560,fps:24,frames:48,alphaScale:.5}));
  const blob=new Blob([bytes],{type:'video/mp4'}),result=await readVapFile(blob);
  assert.strictEqual(result.blob,blob,'inspection preserves original encoded bytes');
  assert.deepEqual(result.config,extractVapcBox(new Uint8Array(bytes)));
  for(const value of [null,{size:0},{size:200*1024*1024+1}])await assert.rejects(readVapFile(value),/file/);
  for(const value of [new Blob(['not mp4']),new Blob([bytes.subarray(0,bytes.length-20)])])await assert.rejects(readVapFile(value),/format/);
  await assert.rejects(readVapFile(new Blob([plain])),/format/);
  console.log('vap-inspect: embedded VAP config extraction, byte preservation, size/empty/corrupt/truncated/ordinary MP4 rejection passed. Browser SDK playback checked separately.');
})().catch(e=>{console.error(e);process.exitCode=1});
