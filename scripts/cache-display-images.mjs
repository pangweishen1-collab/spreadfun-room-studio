import {readdir,readFile,writeFile,copyFile} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';

// Only literal WebP display URLs get immutable aliases. Dynamic source/export
// URLs and all original files remain available with their existing policy.
export async function cacheDisplayImages(root){
  const files=[];
  async function walk(dir){for(const entry of await readdir(dir,{withFileTypes:true})){
    const name=path.join(dir,entry.name);if(entry.isDirectory())await walk(name);else files.push(name);
  }}
  await walk(root);
  const aliases=new Map();
  for(const file of files.filter(file=>file.endsWith('.webp'))){
    const relative=path.relative(root,file).split(path.sep).join('/');
    const hash=createHash('sha256').update(await readFile(file)).digest('hex').slice(0,16);
    aliases.set(relative,relative.replace(/\.webp$/,`.${hash}.webp`));
  }
  const used=new Set();
  for(const file of files.filter(file=>/\.(?:html|css|m?js)$/.test(file))){
    const original=await readFile(file,'utf8');
    const updated=original.replace(/(?<![\w/.-])(\/?(?:[\w.%\u0080-\uffff-]+\/)+[\w.%\u0080-\uffff-]+\.webp)(?:\?[^\s"'`<>)]*)?/g,(full,url)=>{
      const relative=url.replace(/^\//,'');
      const alias=aliases.get(relative);
      if(!alias)return full;
      used.add(relative);return(url.startsWith('/')?'/':'')+alias;
    });
    if(updated!==original)await writeFile(file,updated);
  }
  for(const relative of used)await copyFile(path.join(root,relative),path.join(root,aliases.get(relative)));
  return [...used].sort().map(relative=>`/${aliases.get(relative)}\n  Cache-Control: public, max-age=31536000, immutable\n`).join('');
}
