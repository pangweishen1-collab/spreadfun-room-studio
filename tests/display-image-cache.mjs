import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {cacheDisplayImages} from '../scripts/cache-display-images.mjs';
const root=await mkdtemp(path.join(tmpdir(),'display-images-'));
try{
 await mkdir(path.join(root,'assets'));
 await writeFile(path.join(root,'assets/a.webp'),new Uint8Array([1,2,3]));
 await writeFile(path.join(root,'assets/unused.webp'),new Uint8Array([4]));
 await writeFile(path.join(root,'index.html'),'<img src="assets/a.webp?v=old"><img src="/assets/a.webp"><img src="assets/${id}.webp"><a href="assets/source.png">');
 const headers=await cacheDisplayImages(root),html=await readFile(path.join(root,'index.html'),'utf8');
 const alias=html.match(/assets\/a\.[a-f0-9]{16}\.webp/)[0];
 assert.equal(html.split(alias).length,3);assert(!html.includes('v=old'));
 assert(html.includes('assets/${id}.webp'));assert(html.includes('assets/source.png'));
 assert.deepEqual(await readFile(path.join(root,alias)),await readFile(path.join(root,'assets/a.webp')));
 assert(headers.includes('/'+alias+'\n  ! Cache-Control\n  Cache-Control: public, max-age=31536000, immutable'));
 assert.equal((await readdir(path.join(root,'assets'))).length,3);
 await writeFile(path.join(root,'assets/a.webp'),new Uint8Array([3,2,1]));
 await writeFile(path.join(root,'index.html'),'<img src="assets/a.webp">');
 await cacheDisplayImages(root);assert(!(await readFile(path.join(root,'index.html'),'utf8')).includes(alias));
 console.log('Display images: byte-preserving aliases, stable references, changed-content invalidation and original/dynamic URLs passed.');
}finally{await rm(root,{recursive:true,force:true});}
