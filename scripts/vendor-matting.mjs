// Rebuild the same-origin background-removal assets. No npm install or runtime CDN is needed.
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {mkdtemp,readFile,writeFile,mkdir,copyFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const version='1.30.0',revision='962e67969ec6acec9c19fab76acee4f5e22e990c';
const modelSHA='eff9216bb2f9d3f023d9c2b7196845a7485739ab1f231593633e4d2344ffc516';
const ortIntegrity='q0y+JrrtukXSzsBWEMccVfqX25LRmosXHF+CaRJmg8pZClzcV7svNc4rKY3jL02Vb7QmRMDs1SigqR4CXAfKYQ==';
const origin=`https://huggingface.co/studioludens/birefnet-lite-512`;
const args=process.argv.slice(2),option=name=>{const index=args.indexOf(name);return index<0?null:args[index+1]};
const temporary=await mkdtemp(path.join(tmpdir(),'gift-matting-'));
const digest=(data,algorithm='sha256',encoding='hex')=>createHash(algorithm).update(data).digest(encoding);
async function download(url,target){const response=await fetch(url);if(!response.ok)throw Error(`Download failed (${response.status}): ${url}`);await writeFile(target,new Uint8Array(await response.arrayBuffer()));return target}
try{
  const archive=option('--ort-tar')||await download(`https://registry.npmjs.org/onnxruntime-web/-/onnxruntime-web-${version}.tgz`,path.join(temporary,'ort.tgz'));
  if(digest(await readFile(archive),'sha512','base64')!==ortIntegrity)throw Error('ONNX Runtime package integrity mismatch');
  execFileSync('tar',['-xzf',archive,'-C',temporary]);
  const vendor=path.join(root,'vendor/ort');await mkdir(vendor,{recursive:true});
  const runtimeFiles=['ort.wasm.min.mjs','ort-wasm-simd-threaded.mjs','ort-wasm-simd-threaded.wasm'];
  const runtime=[];
  for(const name of runtimeFiles){const input=path.join(temporary,'package/dist',name);await copyFile(input,path.join(vendor,name));const data=await readFile(input);runtime.push({file:name,bytes:data.length,sha256:digest(data)})}
  await download(`https://raw.githubusercontent.com/microsoft/onnxruntime/v${version}/LICENSE`,path.join(vendor,'LICENSE'));
  await download(`https://raw.githubusercontent.com/microsoft/onnxruntime/v${version}/ThirdPartyNotices.txt`,path.join(vendor,'ThirdPartyNotices.txt'));
  await writeFile(path.join(vendor,'NOTICE.txt'),`ONNX Runtime Web ${version}\nCopyright Microsoft Corporation. MIT License; see LICENSE and ThirdPartyNotices.txt.\nSource: https://github.com/microsoft/onnxruntime/tree/v${version}\nOfficial npm archive: https://registry.npmjs.org/onnxruntime-web/-/onnxruntime-web-${version}.tgz\nPackage SHA-512 (base64): ${ortIntegrity}\nOnly the WASM backend is included. numThreads=1 works without cross-origin isolation.\n`);
  await writeFile(path.join(vendor,'manifest.json'),JSON.stringify({name:'onnxruntime-web',version,license:'MIT',files:runtime},null,2)+'\n');

  const source=option('--model')||await download(`${origin}/resolve/${revision}/onnx/model_fp16.onnx`,path.join(temporary,'model.onnx'));
  const model=await readFile(source);
  if(model.length!==98484532||digest(model)!==modelSHA)throw Error('BiRefNet model size or SHA-256 mismatch');
  const assets=path.join(root,'assets/matting');await mkdir(assets,{recursive:true});
  const chunkSize=20*1024*1024,chunks=[];
  for(let offset=0,index=0;offset<model.length;offset+=chunkSize,index++){
    const data=model.subarray(offset,Math.min(offset+chunkSize,model.length)),file=`birefnet-lite-512-fp16-${String(index+1).padStart(2,'0')}.bin`;
    await writeFile(path.join(assets,file),data);chunks.push({file,bytes:data.length,sha256:digest(data)});
  }
  const manifest={name:'studioludens/birefnet-lite-512',revision,variant:'fp16',license:'MIT',bytes:model.length,sha256:modelSHA,input:{name:'input_image',type:'float32',shape:[1,3,512,512],mean:[.485,.456,.406],std:[.229,.224,.225]},output:{name:'output_image',type:'float32',shape:[1,1,512,512],activation:'sigmoid'},chunks};
  await writeFile(path.join(assets,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
  await download(`${origin}/raw/${revision}/LICENSE`,path.join(assets,'LICENSE'));
  await writeFile(path.join(assets,'NOTICE.txt'),`BiRefNet_lite 512x512 ONNX re-export, FP16 weights.\nCopyright (c) 2024 ZhengPeng; Copyright (c) 2026 Studio Ludens V.O.F.\nMIT License; see LICENSE.\nModel source: ${origin}/tree/${revision}\nUpstream: https://huggingface.co/ZhengPeng7/BiRefNet_lite\nREADME and input/output description: ${origin}/blob/${revision}/README.md\nOriginal model SHA-256: ${modelSHA}\nThe original bytes are split into ordered chunks of at most 20 MiB for static hosting.\nThe user's picture is processed on-device; it is never sent to the model host.\n`);
  console.log(`Vendored ONNX Runtime ${version}; verified ${model.length} model bytes in ${chunks.length} chunks (maximum ${chunkSize}).`);
}finally{await rm(temporary,{recursive:true,force:true})}
