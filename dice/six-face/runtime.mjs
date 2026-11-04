import {decodeFaceFiles} from './import-faces.mjs';
import {prepareFaces} from './prepare-faces.mjs';
import {buildSpineAssets} from './spine-builder.mjs';

// No Canvas/Image instances escape into IndexedDB or the public candidate.
export async function generateSixFaceRuntime(files,{name,signal}={}) {
  const inputs=files.filter(file=>/^sz_[1-6]$/.test(file.slot)||file.slot==='大骰子')
    .map(file=>new File([file.blob],file.name,{type:'image/png'}));
  const decoded=await decodeFaceFiles(inputs,{signal});let prepared;
  try {
    prepared=prepareFaces(decoded.images);
    const assets=await buildSpineAssets(prepared,{name,signal});
    const geometry=structuredClone(Object.fromEntries(['sourceSize','crop','cropOffset','bounds','loss','normalization']
      .map(key=>[key,prepared[key]])));
    return {kind:'six-face',json:assets.json,atlasText:assets.atlasText,texture:assets.textureBlob,atlasPage:assets.atlasPage,
      geometry,warnings:[...decoded.warnings,...prepared.warnings],files:assets.files,metadata:assets.metadata};
  } finally {
    decoded.dispose();
    for(const group of [prepared?.landingImages,prepared?.textures])for(const image of Object.values(group||{}))image.width=image.height=1;
  }
}
