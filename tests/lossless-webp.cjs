// Real shared production helper + pinned WASM roundtrip. Requires Python with Pillow.
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
  // The encoder module remains production code. Node-only URL substitutions
  // supply local WASM bytes and resolve its static imports outside the browser.
  const encoderPath=path.join(project,'webp-encode.mjs');
  let encoderSource=fs.readFileSync(encoderPath,'utf8');
  const factoryImport="import factory from './vendor/webp/webp_enc.mjs';",metaImport="from './vendor/webp/meta.mjs'";
  assert.ok(encoderSource.includes(factoryImport)&&encoderSource.includes(metaImport),'production encoder imports remain explicit');
  encoderSource=encoderSource.replace(factoryImport,'import factory from '+JSON.stringify(nodeCodec)+';').replace(metaImport,'from '+JSON.stringify(pathToFileURL(path.join(project,'vendor/webp/meta.mjs')).href));
  const nodeEncoder='data:text/javascript,'+encodeURIComponent(encoderSource);
  const sandbox=vm.createContext({Blob});
  const helper=new vm.Script(fs.readFileSync(path.join(project,'banner-webp.js'),'utf8')+'\nthis.encode=canvasToLosslessWebP;this.encodeHigh=canvasToWebP;this.settings=webpSettings;',{
    filename:'banner-webp.js',
    importModuleDynamically:specifier=>{
      assert.match(specifier,/^\.\/webp-encode\.mjs\?v=/,'the no-worker fallback uses the shared lossless encoder');
      return import(nodeEncoder);
    }
  });
  helper.runInContext(sandbox);
  assert.equal(sandbox.settings.getMode(),'high','generic output defaults to high quality while the explicit alias remains exact');
  const alpha=[0,1,64,127,128,200,254,255];
  // Cover every static tool: full/small room, avatar, both Banner shapes,
  // gift and resource output. A noisy patch in the full room exceeds the
  // retired 120 KiB limit so a hidden quality/size fallback cannot pass.
  const cases=[
    {name:'lossless-helper',raw:'lossless-source.rgba',width:17,height:9,transparent:true},
    {name:'lossless-room-full',raw:'lossless-room-full.rgba',width:720,height:1560,transparent:false,noise:true,minimumBytes:120*1024},
    {name:'lossless-room-small',raw:'lossless-room-small.rgba',width:300,height:480,transparent:false},
    {name:'lossless-avatar',raw:'lossless-avatar.rgba',width:240,height:240,transparent:true},
    {name:'lossless-banner',raw:'lossless-banner.rgba',width:772,height:200,transparent:false},
    {name:'lossless-game',raw:'lossless-game.rgba',width:684,height:240,transparent:true},
    {name:'lossless-gift',raw:'lossless-gift.rgba',width:200,height:200,transparent:true},
    {name:'lossless-resource',raw:'lossless-resource.rgba',width:1024,height:1024,transparent:true}
  ];
  const previousCodec=await(await import(nodeCodec)).default(),{defaultOptions}=await import(pathToFileURL(path.join(project,'vendor/webp/meta.mjs')).href);
  for(const test of cases){
    const {width,height}=test,pixels=new Uint8ClampedArray(width*height*4);
    let noise=0x5f3759df;
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){
      const i=y*width+x;
      if(test.noise&&x<256&&y<192){noise^=noise<<13;noise^=noise>>>17;noise^=noise<<5;pixels.set([noise&255,(noise>>>8)&255,(noise>>>16)&255,255],i*4)}
      else pixels.set([(x*67+y*13)%256,(x*37+y*71)%256,(x*113+y*23)%256,test.transparent?alpha[i%alpha.length]:255],i*4);
    }
    const original=Buffer.from(pixels);
    const canvas={width,height,getContext(type){
      assert.equal(type,'2d');
      return {getImageData(x,y,w,h){assert.deepEqual([x,y,w,h],[0,0,width,height]);return {data:pixels}}};
    },toBlob(){throw Error('browser lossy fallback is forbidden')},toDataURL(){throw Error('browser lossy fallback is forbidden')}};
    const started=process.hrtime.bigint(),blob=await sandbox.encode(canvas);
    test.encodingMs=Number(process.hrtime.bigint()-started)/1e6;
    assert.equal(blob.type,'image/webp');
    const encoded=Buffer.from(await blob.arrayBuffer());
    assert.equal(encoded.subarray(0,4).toString(),'RIFF');assert.equal(encoded.subarray(8,12).toString(),'WEBP');
    assert.deepEqual(Buffer.from(pixels),original,'encoding does not alter the export canvas pixels');
    if(test.minimumBytes)assert.ok(encoded.length>test.minimumBytes,'incompressible full-room output is not forced under the old 120 KiB cap');
    if(!test.noise){
      const previous=previousCodec.encode(pixels,width,height,{...defaultOptions,lossless:1,near_lossless:100,quality:0,method:1,exact:1,alpha_quality:100});
      assert.ok(previous?.byteLength);test.previousSearchBytes=previous.byteLength;
      assert.ok(encoded.length<=previous.byteLength,'shared compression does not grow the file beyond the prior exact-lossless search');
    }
    fs.writeFileSync(path.join(out,test.name+'.webp'),encoded);
    fs.writeFileSync(path.join(out,test.raw),pixels);
  }
  fs.writeFileSync(path.join(out,'lossless-cases.json'),JSON.stringify(cases));
  // A camera-like texture exercises perceptual coding without any private
  // source image. Alpha is independent of the RGB quality tradeoff.
  const highCases=[{name:'high-small-detail',raw:'lossless-source.rgba',width:17,height:9,exact:true},{name:'high-textured-photo',raw:'high-textured-photo.rgba',width:384,height:512,maximumRatio:.8,minimumPsnr:35}];
  for(const test of highCases){
    const {width,height}=test;let pixels;
    if(test.exact)pixels=new Uint8ClampedArray(fs.readFileSync(path.join(out,test.raw)));
    else{
      pixels=new Uint8ClampedArray(width*height*4);let seed=0x5f3759df;
      for(let y=0;y<height;y++)for(let x=0;x<width;x++){
        const i=(y*width+x)*4;seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;
        const texture=((seed>>>16)&15)-7,tone=115+38*Math.sin(x/37)+27*Math.cos(y/53);
        pixels.set([tone+x*.09+texture,tone+16*Math.sin((x+y)/61)+texture,tone+28*Math.cos((x-y)/79)+texture,y<64?alpha[x%alpha.length]:255],i);
      }
      fs.writeFileSync(path.join(out,test.raw),pixels);
    }
    const original=Buffer.from(pixels),canvas={width,height,getContext(){return {getImageData(){return {data:pixels}}}}};
    const exactBytes=test.exact?fs.statSync(path.join(out,'lossless-helper.webp')).size:(await sandbox.encode(canvas)).size;
    const started=process.hrtime.bigint(),blob=await sandbox.encodeHigh(canvas,{mode:'high'});test.encodingMs=Number(process.hrtime.bigint()-started)/1e6;
    assert.equal(blob.type,'image/webp');assert.deepEqual(Buffer.from(pixels),original,'high-quality encoding retains caller-owned source pixels');
    test.exactBytes=exactBytes;test.bytes=blob.size;
    if(test.maximumRatio)assert.ok(blob.size<=exactBytes*test.maximumRatio,'the textured photograph must materially shrink relative to the exact output');
    fs.writeFileSync(path.join(out,test.name+'.webp'),Buffer.from(await blob.arrayBuffer()));
  }
  fs.writeFileSync(path.join(out,'high-cases.json'),JSON.stringify(highCases));
  const check=spawnSync(process.env.BANNER_TEST_PYTHON||'python3',['-c',`
from PIL import Image, ImageChops
from pathlib import Path
import json, math, sys
p=Path(sys.argv[1])
reports=[]
for test in json.loads((p/'lossless-cases.json').read_text()):
    encoded=p/(test['name']+'.webp')
    im=Image.open(encoded).convert('RGBA')
    expected=(p/test['raw']).read_bytes()
    actual=im.tobytes()
    assert im.size==(test['width'],test['height']), (test['name'],im.size)
    assert actual==expected, test['name']+' changed RGBA pixels'
    reports.append({'name':test['name'],'dimensions':list(im.size),'bytes':encoded.stat().st_size,'previous_search_bytes':test.get('previousSearchBytes'),'encoding_ms':round(test['encodingMs'],2),'exact_rgba':True,'tested_alpha_values':sorted(set(actual[3::4]))})
(p/'lossless-roundtrip.json').write_text(json.dumps(reports,indent=2))
high_reports=[]
for test in json.loads((p/'high-cases.json').read_text()):
    im=Image.open(p/(test['name']+'.webp')).convert('RGBA')
    expected=Image.frombytes('RGBA',(test['width'],test['height']),(p/test['raw']).read_bytes())
    assert im.size==expected.size
    assert im.getchannel('A').tobytes()==expected.getchannel('A').tobytes(), test['name']+' changed alpha'
    if test.get('exact'): assert im.tobytes()==expected.tobytes(), test['name']+' lost small-image details'
    psnrs={}
    for color in [(0,0,0,255),(255,255,255,255)]:
        bg=Image.new('RGBA',im.size,color)
        actual=Image.alpha_composite(bg,im).convert('RGB');reference=Image.alpha_composite(bg,expected).convert('RGB')
        histogram=ImageChops.difference(actual,reference).histogram()
        mse=sum((i%256)**2*n for i,n in enumerate(histogram))/(im.width*im.height*3)
        psnr=99 if mse==0 else 10*math.log10(255**2/mse)
        assert psnr>=test.get('minimumPsnr',99), (test['name'],color,psnr)
        psnrs['black' if color[0]==0 else 'white']=round(psnr,4)
    high_reports.append({'name':test['name'],'dimensions':list(im.size),'bytes':test['bytes'],'exact_bytes':test['exactBytes'],'ratio':round(test['bytes']/test['exactBytes'],4),'encoding_ms':round(test['encodingMs'],2),'alpha_exact':True,'psnr':psnrs,'exact_rgba':im.tobytes()==expected.tobytes()})
(p/'high-roundtrip.json').write_text(json.dumps(high_reports,indent=2))
print('PASS: explicit exact-lossless output preserves every RGBA byte across all tool dimensions; generic high-quality output materially reduces a textured photograph while preserving alpha and composited PSNR, and retains exact small-image detail. Source pixels remain unchanged.')
`,out],{encoding:'utf8'});
  if(check.stdout)process.stdout.write(check.stdout);
  if(check.stderr)process.stderr.write(check.stderr);
  assert.equal(check.status,0,'Pillow decode verification failed');
})().catch(error=>{console.error(error);process.exitCode=1});
