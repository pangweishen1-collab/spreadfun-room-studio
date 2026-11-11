import {mkdir,rm,copyFile,cp,readdir,readFile,stat,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {promisify} from 'node:util';
import {gzip} from 'node:zlib';

const root=fileURLToPath(new URL('../',import.meta.url));
const target=path.join(root,'dist');
const entries=['index.html','upload-paste.js','Room BG Studio.html','toolkit.css','toolkit.js','banner.js','banner-webp.js','hub.css','hub.js','tokens.css','tool-feedback.css','tool-feedback.js','gift-preview.css','gift-preview.js','gift-preview-render.js','gift-preview-history.js','gift-background.js','gift-background-worker.js','gift-lucida-ai.mjs','gift-lucida-runtime.mjs','gift-matte-resample.mjs','gift-uniform-matte.mjs','gift-background-ai.mjs','gift-background-matte.mjs','gift-quality-matte.mjs','gift-matting-refine.mjs','gift-matting-runtime.mjs','project-selector.css','project-selector.js','resource-library.css','resource-library.js','market-icon-png.js','vap-tool.css','vap-tool.js','vap-resources.mjs','vap-resources.css','vap-resource-editor.js','vap-player.js','vap-player.css','vap-inspect.html','vap-inspect.css','vap-inspect.mjs','vap-engine.mjs','vap-sequence.mjs','vap-protocol.mjs','vap-matte.mjs','vap-matte-workers.mjs','vap-matte-worker.mjs','vap-source-detection.mjs'];
entries.push('dice-embed.js','avatar-text-style.mjs','avatar-custom.js','avatar-custom.css','avatar-custom-engine.mjs','avatar-lossless.mjs','avatar-lossless-worker.mjs','avatar-lossless-codec.mjs','avatar-fonts.css','vap-chroma-plate.mjs','vap-native-planes.mjs','vap-quality.mjs','webp-encode.mjs','webp-encoder-worker.mjs','vap-gift-fade.mjs','webp-settings.js','webp-settings.css');
entries.push('gift-lucida-download.mjs');
entries.push('gift-avatar-preview.mjs','gift-avatar-image.mjs','gift-avatar-svga.mjs','gift-avatar-review-video.mjs');
entries.push('profile-preview.mjs','profile-preview.css','preview-slot-drag.mjs');
entries.push('vap-review.css','vap-review.js','vap-review-engine.mjs');
entries.push('vap-copy-packets.mjs','vap-avc-padding.mjs');
await rm(target,{recursive:true,force:true});
await mkdir(target,{recursive:true});
for(const name of entries)await copyFile(path.join(root,name),path.join(target,name));
for(const name of ['assets','vendor','design-system','dice'])await cp(path.join(root,name),path.join(target,name),{recursive:true,dereference:false});
const compress = promisify(gzip);
for (const file of ['assets/lucida/manifest.json', 'vendor/ort-lucida/asyncify-manifest.json']) {
  const manifestPath = path.join(target, file);
  const directory = path.dirname(manifestPath);
  const transfer = path.join(directory, 'transfer');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  await mkdir(transfer, {recursive:true});
  for (const chunk of manifest.chunks) {
    const raw = await readFile(path.join(directory, chunk.file));
    const compressed = await compress(raw);
    if (compressed.length >= raw.length * .95) continue;
    await writeFile(path.join(transfer, `${chunk.file}.${chunk.sha256.slice(0, 16)}.gz`), compressed);
    chunk.gzip = true;
  }
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
}
await writeFile(path.join(target,'_headers'),`/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  X-Frame-Options: SAMEORIGIN
  Permissions-Policy: camera=(), microphone=(), geolocation=()
  Cross-Origin-Opener-Policy: same-origin
  Cross-Origin-Embedder-Policy: require-corp
/assets/lucida/transfer/*
  Cache-Control: public, max-age=31536000, immutable
/vendor/ort-lucida/transfer/*
  Cache-Control: public, max-age=31536000, immutable
/dice/*
  Cache-Control: no-cache
/design-system/
  Cache-Control: no-cache
/design-system/index.html
  Cache-Control: no-cache
/index.html
  Cache-Control: no-cache
/
  Cache-Control: no-cache
`);
// Release metadata comes from package.json so the shipped footer cannot lag behind.
const {version}=JSON.parse(await readFile(path.join(root,'package.json'),'utf8'));
const indexPath=path.join(target,'index.html');
await writeFile(indexPath,(await readFile(indexPath,'utf8')).replace(/(data-app-version>)[^<]*/,`$1v${version}`));
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
