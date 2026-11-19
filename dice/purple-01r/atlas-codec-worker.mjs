import init, {optimise} from '../vendor/oxipng/squoosh_oxipng.mjs';
import {quantizeAtlasRgba} from './atlas-palette.mjs';

// Start once, overlapping the first palette calculation with WASM loading.
const wasmReady = init().then(() => true, () => false);
self.onmessage = async ({data:{id,width,height,rgba,targetBytes=0}}) => {
  try {
    const indexed = quantizeAtlasRgba(width,height,rgba,256);
    if (!indexed) { self.postMessage({id,png:null}); return; }
    let output = new Uint8Array(indexed);
    // A palette PNG already within budget needs no further lossless work.
    // A zero/invalid limit keeps the existing unconditional OxiPNG behavior.
    const fitsBudget = Number.isSafeInteger(targetBytes) && targetBytes > 0 && output.byteLength <= targetBytes;
    if (!fitsBudget && await wasmReady) try {
      const smaller = optimise(output,1,false,false);
      if (smaller.byteLength > 0 && smaller.byteLength < output.byteLength) output = smaller;
    } catch {
      // A valid palette PNG remains usable if optional lossless optimization fails.
    }
    self.postMessage({id,png:new Blob([output],{type:'image/png'})});
  } catch {
    self.postMessage({id,png:null});
  }
};
