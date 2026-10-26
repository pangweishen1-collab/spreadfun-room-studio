import {mkdir,rm,copyFile,cp,readdir,stat,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {createHash} from 'node:crypto';

const root=fileURLToPath(new URL('../',import.meta.url));
const target=path.join(root,'dist');
const entries=['index.html','Room BG Studio.html','toolkit.css','toolkit.js','banner.js','banner-webp.js','hub.css','hub.js','home.css','tokens.css','tool-feedback.css','tool-feedback.js','gift-preview.css','gift-preview.js','gift-preview-render.js','gift-preview-history.js','gift-background.js','gift-background-worker.js','gift-lucida-ai.mjs','gift-lucida-runtime.mjs','gift-matte-resample.mjs','gift-uniform-matte.mjs','gift-background-ai.mjs','gift-background-matte.mjs','gift-quality-matte.mjs','gift-matting-refine.mjs','gift-matting-runtime.mjs','project-selector.css','project-selector.js','resource-library.css','resource-library.js','market-icon-png.js','vap-tool.css','vap-tool.js','vap-player.js','vap-inspect.html','vap-inspect.css','vap-inspect.mjs','vap-engine.mjs','vap-protocol.mjs','vap-matte.mjs','vap-source-detection.mjs'];
await rm(target,{recursive:true,force:true});
await mkdir(target,{recursive:true});
for(const name of entries)await copyFile(path.join(root,name),path.join(target,name));
for(const name of ['assets','vendor','design-system'])await cp(path.join(root,name),path.join(target,name),{recursive:true,dereference:false});
await writeFile(path.join(target,'_headers'),`/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  X-Frame-Options: DENY
  Permissions-Policy: camera=(), microphone=(), geolocation=()
  Cross-Origin-Opener-Policy: same-origin
  Cross-Origin-Embedder-Policy: require-corp
/design-system/
  Cache-Control: no-cache
/design-system/index.html
  Cache-Control: no-cache
/index.html
  Cache-Control: no-cache
/
  Cache-Control: no-cache
`);
const {readFile}=await import('node:fs/promises');
async function inventory(dir){
  const result=[];
  for(const name of (await readdir(dir)).sort()){
    const filename=path.join(dir,name),info=await stat(filename);
    if(info.isDirectory())result.push(...await inventory(filename));
    else result.push({path:path.relative(target,filename).split(path.sep).join('/'),bytes:info.size,sha256:createHash('sha256').update(await readFile(filename)).digest('hex')});
  }
  return result;
}
const files=await inventory(target);
if(files.some(file=>/(^|\/)(tests|GitHub-Pages|worker|migrations|\.git)(\/|$)|\.(sqlite3?|db|py|env)$/.test(file.path)))throw new Error('Private source found in static build');
await mkdir(path.join(root,'.wrangler'),{recursive:true});
await writeFile(path.join(root,'.wrangler','build-manifest.json'),JSON.stringify(files,null,2)+'\n');
console.log(`Built ${files.length} public files (${files.reduce((total,file)=>total+file.bytes,0)} bytes).`);
