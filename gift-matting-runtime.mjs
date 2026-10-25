import * as ort from './vendor/ort/ort.wasm.min.mjs';

// Threaded WASM requires both cross-origin isolation and shared memory. Keep
// unsupported browsers on the existing single-thread path without changing
// model dimensions, tensor values or the matting algorithm.
export function threadCount(scope=globalThis){
  if(scope.crossOriginIsolated!==true||typeof scope.SharedArrayBuffer!=='function')return 1;
  const cores=Number(scope.navigator?.hardwareConcurrency);
  return Number.isFinite(cores)&&cores>=1?Math.min(4,Math.floor(cores)):1;
}

ort.env.wasm.numThreads=threadCount();
ort.env.wasm.proxy=false;
ort.env.wasm.wasmPaths=new URL('./vendor/ort/',import.meta.url).href;
ort.env.logLevel='error';

export {ort};
