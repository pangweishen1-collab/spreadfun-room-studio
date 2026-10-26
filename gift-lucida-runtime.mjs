const base = new URL('./vendor/ort-lucida/', import.meta.url);
const GPU_WASM_SHA = '39f9f0894d478800487ed9f7dbe92618498db320cf55c8e3d89adff8dce658da';
const GPU_WASM_BYTES = 26781914;
let runtimePromise = null, providers = null;
export let ort;

const checksum = async data => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', data)), byte => byte.toString(16).padStart(2, '0')).join('');
export function threadCount(scope = globalThis) {
  if (scope.crossOriginIsolated !== true || typeof scope.SharedArrayBuffer !== 'function') return 1;
  const count = Number(scope.navigator?.hardwareConcurrency);
  return Number.isFinite(count) && count >= 1 ? Math.min(4, Math.floor(count)) : 1;
}

async function gpuWasm() {
  const response = await fetch(new URL('asyncify-manifest.json', base));
  if (!response.ok) throw new Error('WebGPU 运行时清单未能加载。');
  const manifest = await response.json();
  if (manifest.version !== '1.30.0' || manifest.bytes !== GPU_WASM_BYTES || manifest.sha256 !== GPU_WASM_SHA
    || !Array.isArray(manifest.chunks) || manifest.chunks.length !== 2) throw new Error('WebGPU 运行时版本不匹配。');
  const binary = new Uint8Array(manifest.bytes);
  let offset = 0;
  for (const chunk of manifest.chunks) {
    if (!/^asyncify-wasm-[12]\.bin$/.test(chunk.file) || !Number.isInteger(chunk.bytes)
      || chunk.bytes < 1 || chunk.bytes > 20 * 1024 * 1024 || offset + chunk.bytes > binary.length
      || !/^[a-f0-9]{64}$/.test(chunk.sha256)) throw new Error('WebGPU 运行时分块无效。');
    const result = await fetch(new URL(chunk.file, base));
    if (!result.ok) throw new Error('WebGPU 运行时分块未能加载。');
    const bytes = await result.arrayBuffer();
    if (bytes.byteLength !== chunk.bytes || await checksum(bytes) !== chunk.sha256) throw new Error('WebGPU 运行时分块校验失败。');
    binary.set(new Uint8Array(bytes), offset); offset += bytes.byteLength;
  }
  if (offset !== binary.length || await checksum(binary) !== manifest.sha256) throw new Error('WebGPU 运行时完整性校验失败。');
  return binary;
}

async function initialize() {
  let adapter = null;
  // An unavailable GPU selects the existing WASM runtime. Download/initialization
  // errors are retryable and are not silently presented as GPU acceleration.
  if (globalThis.isSecureContext && globalThis.navigator?.gpu) {
    try { adapter = await navigator.gpu.requestAdapter({powerPreference: 'high-performance'}); } catch (ignored) {}
  }
  ort = await import(new URL(adapter ? 'ort.webgpu.min.mjs' : 'ort.wasm.min.mjs', base));
  ort.env.wasm.numThreads = threadCount();
  ort.env.wasm.proxy = false;
  ort.env.wasm.wasmPaths = base.href;
  ort.env.logLevel = 'warning';
  if (adapter) {
    ort.env.wasm.wasmBinary = await gpuWasm();
    ort.env.webgpu.adapter = adapter;
    // Normal hybrid execution allows individual unsupported kernels on WASM.
    // Graph capture is deliberately disabled by the model loader.
    providers = [{name: 'webgpu'}, 'wasm'];
  } else providers = ['wasm'];
  return providers;
}

export async function getExecutionProviders() {
  if (!runtimePromise) runtimePromise = initialize().catch(error => { runtimePromise = null; providers = null; ort = undefined; throw error; });
  return runtimePromise;
}
