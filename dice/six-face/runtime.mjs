import {decodeFaceFiles} from './import-faces.mjs';
import {prepareFaces} from './prepare-faces.mjs';
import {buildSpineAssets} from './spine-builder.mjs?v=20261113-green-android';
import {writeSpineBinary} from './spine-binary.mjs';
import {optimizeAtlasPng} from '../atlas-png-optimizer.mjs';

export const GREEN_PACKING_VERSION = '430x424-v2';

// No Canvas/Image instances escape into IndexedDB or the public candidate.
export async function generateSixFaceRuntime(files,{name,signal,anchorImage}={}) {
  const inputs=files.filter(file=>/^sz_[1-6]$/.test(file.slot)||file.slot==='大骰子')
    .map(file=>new File([file.blob],file.name,{type:'image/png'}));
  const decoded=await decodeFaceFiles(inputs,{signal});let prepared;
  try {
    prepared=prepareFaces(decoded.images,{removeOutline:true});
    const assets=await buildSpineAssets(prepared,{name,signal,anchorImage,compactGreen:true});
    const geometry=structuredClone(Object.fromEntries(['sourceSize','crop','cropOffset','bounds','loss','normalization']
      .map(key=>[key,prepared[key]])));
    const skel=new Blob([writeSpineBinary(assets.json)],{type:'application/octet-stream'});
    const texture=await optimizeAtlasPng(assets.textureBlob,2,256);
    signal?.throwIfAborted();
    return {kind:'six-face',skel,atlasText:assets.atlasText,texture,atlasPage:assets.atlasPage,
      geometry,warnings:[...decoded.warnings,...prepared.warnings],
      metadata:{...assets.metadata,packingVersion:GREEN_PACKING_VERSION}};
  } finally {
    decoded.dispose();
    for(const group of [prepared?.landingImages,prepared?.textures])for(const image of Object.values(group||{}))image.width=image.height=1;
  }
}
