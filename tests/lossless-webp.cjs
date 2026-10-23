// Real production helper + pinned WASM roundtrip. Requires Python with Pillow.
// BANNER_TEST_PYTHON=/path/to/python node tests/lossless-webp.cjs [output-directory]
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {spawnSync}=require('node:child_process');
const {pathToFileURL}=require('node:url');
if(!process.execArgv.includes('--experimental-vm-modules')){
  const child=spawnSync(process.execPath,['--experimental-vm-modules',__filename,...process.argv.slice(2)],{stdio:'inherit',env:process.env});
  process.exit(child.status??1);
}
(async()=>{
  const project=path.resolve(__dirname,'..');
  const out=path.resolve(process.argv[2]||path.join(__dirname,'../../../work/banner-quality-diagnosis'));
  fs.mkdirSync(out,{recursive:true});
  const wasm=path.join(project,'vendor/webp/webp_enc.wasm');
  const codecUrl=pathToFileURL(path.join(project,'vendor/webp/webp_enc.mjs')).href;
  // Only the Node loader differs: feed the identical local WASM bytes directly,
  // because the browser factory normally fetches them using a relative URL.
  const nodeCodec='data:text/javascript,'+encodeURIComponent(`import factory from ${JSON.stringify(codecUrl)};import fs from 'node:fs';export default()=>factory({wasmBinary:fs.readFileSync(${JSON.stringify(wasm)})});`);
  const sandbox=vm.createContext({Blob});
  const helper=new vm.Script(fs.readFileSync(path.join(project,'banner-webp.js'),'utf8')+'\nthis.encode=canvasToLosslessWebP;',{
    filename:'banner-webp.js',
    importModuleDynamically:specifier=>import(specifier==='./vendor/webp/webp_enc.mjs'?nodeCodec:pathToFileURL(path.resolve(project,specifier)).href)
  });
  helper.runInContext(sandbox);
  const width=17,height=9,pixels=new Uint8ClampedArray(width*height*4);
  const alpha=[0,1,64,127,128,200,254,255];
  for(let i=0;i<width*height;i++)pixels.set([(i*67+13)%256,(i*37+71)%256,(i*113+23)%256,alpha[i%alpha.length]],i*4);
  const canvas={width,height,getContext(type){
    assert.equal(type,'2d');
    return {getImageData(x,y,w,h){assert.deepEqual([x,y,w,h],[0,0,width,height]);return {data:pixels}}};
  }};
  const blob=await sandbox.encode(canvas);
  assert.equal(blob.type,'image/webp');
  const encoded=Buffer.from(await blob.arrayBuffer());
  assert.equal(encoded.subarray(0,4).toString(),'RIFF');assert.equal(encoded.subarray(8,12).toString(),'WEBP');
  fs.writeFileSync(path.join(out,'lossless-helper.webp'),encoded);
  fs.writeFileSync(path.join(out,'lossless-source.rgba'),pixels);
  const check=spawnSync(process.env.BANNER_TEST_PYTHON||'python3',['-c',`
from PIL import Image
from pathlib import Path
import json, sys
p=Path(sys.argv[1])
im=Image.open(p/'lossless-helper.webp').convert('RGBA')
expected=(p/'lossless-source.rgba').read_bytes()
actual=im.tobytes()
assert im.size==(17,9), im.size
assert actual==expected, 'Lossless helper changed RGBA pixels'
report={'dimensions':list(im.size),'bytes':(p/'lossless-helper.webp').stat().st_size,'exact_rgba':True,'tested_alpha_values':sorted(set(actual[3::4]))}
(p/'lossless-roundtrip.json').write_text(json.dumps(report,indent=2))
print('PASS: production lossless helper + pinned WASM preserve every RGBA byte, including fully transparent RGB and partial alpha.')
`,out],{encoding:'utf8'});
  if(check.stdout)process.stdout.write(check.stdout);
  if(check.stderr)process.stderr.write(check.stderr);
  assert.equal(check.status,0,'Pillow decode verification failed');
})().catch(error=>{console.error(error);process.exitCode=1});
