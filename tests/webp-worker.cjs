// Worker lifecycle checks; real codec fidelity is checked by lossless-webp.cjs.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {spawnSync}=require('node:child_process');
if(!process.execArgv.includes('--experimental-vm-modules')){
  const result=spawnSync(process.execPath,['--experimental-vm-modules',__filename],{stdio:'inherit'});
  process.exit(result.status??1);
}
const source=fs.readFileSync(path.join(__dirname,'../banner-webp.js'),'utf8');
const fallback='data:text/javascript,'+encodeURIComponent('export async function prepareLosslessWebP(){};export async function encodeLosslessWebP(data,w,h){return new Uint8Array([data[0],w,h])}');
function setup({brokenStart=false,throwStart=false,failEncode=false,hang=false}={}){
  const workers=[],messages=[],timers=new Map();let serial=0,active=0,maxActive=0;
  class Worker{
    constructor(url,options){
      if(throwStart)throw Error('workers unavailable');
      assert.match(url,/webp-encoder-worker\.mjs/);assert.equal(options.type,'module');workers.push(this);
    }
    terminate(){this.terminated=true}
    postMessage(message,transfer=[]){
      const data=structuredClone(message,{transfer});messages.push(data);
      if(hang)return;
      queueMicrotask(()=>{
        if(this.terminated)return;
        if(data.type==='prepare'){
          if(brokenStart)this.onerror({});else this.onmessage({data:{id:data.id}});
          return;
        }
        active++;maxActive=Math.max(maxActive,active);
        queueMicrotask(()=>{
          active--;
          if(failEncode){failEncode=false;this.onmessage({data:{id:data.id,error:'encode failed'}});return}
          const pixels=new Uint8Array(data.pixels);
          this.onmessage({data:{id:data.id,encoded:new Uint8Array([pixels[0],data.width,data.height]).buffer}});
        });
      });
    }
  }
  const sandbox={Worker,Blob,Uint8Array,Uint8ClampedArray,ArrayBuffer,Number,Map,Promise,Error,setTimeout(fn){const id=++serial;timers.set(id,fn);return id},clearTimeout(id){timers.delete(id)}};
  vm.createContext(sandbox);
  new vm.Script(source+'\nthis.api={prepare:prepareBannerWebP,encode:canvasToLosslessWebP};',{importModuleDynamically:()=>import(fallback)}).runInContext(sandbox);
  return {api:sandbox.api,workers,messages,timers,maxActive:()=>maxActive};
}
function canvas(first=20){
  const pixels=new Uint8ClampedArray([first,30,40,255]);
  return {width:1,height:1,pixels,getContext(){return {getImageData(){return {data:pixels.slice()}}}}};
}
(async()=>{
  const one=setup(),a=canvas(19),b=canvas(29);
  const result=await Promise.all([one.api.encode(a),one.api.encode(b)]);
  assert.equal(one.workers.length,1);assert.equal(one.messages.filter(x=>x.type==='prepare').length,1);
  assert.equal(one.maxActive(),1,'shared WASM jobs must be serialized');assert.equal(one.timers.size,0);
  assert.deepEqual(Array.from(new Uint8Array(await result[0].arrayBuffer())),[19,1,1]);
  assert.equal(result[0].type,'image/webp');assert.equal(a.pixels.byteLength,4,'source pixels remain owned by canvas');
  const retry=setup({failEncode:true});
  const rejected=retry.api.encode(canvas()),queued=retry.api.encode(canvas(80));
  await assert.rejects(rejected,/encode failed/);assert.equal((await queued).size,3);
  assert.equal(retry.workers.length,2,'the next queued export retries with a fresh worker');assert.equal(retry.workers[0].terminated,true);
  for(const flags of [{brokenStart:true},{throwStart:true}]){
    const local=setup(flags);await local.api.prepare();await local.api.encode(canvas());await local.api.encode(canvas());
    assert.equal(local.workers.length,flags.throwStart?0:1,'failed worker startup reuses the same exact-codec fallback');
    if(local.workers.length)assert.equal(local.workers[0].terminated,true);
  }
  const timeout=setup({hang:true}),waiting=timeout.api.prepare();
  for(const timer of [...timeout.timers.values()])timer();
  await waiting;assert.equal(timeout.workers[0].terminated,true);assert.equal((await timeout.api.encode(canvas())).size,3);
  const invalid=setup();await assert.rejects(invalid.api.encode({...canvas(),width:0}),/exportError/);assert.equal(invalid.workers.length,0);
  console.log('PASS: exact-WebP worker queue, input ownership, initialization reuse, failure/retry, timeout fallback and invalid dimensions. Real pixels are checked separately.');
})().catch(error=>{console.error(error);process.exitCode=1});
