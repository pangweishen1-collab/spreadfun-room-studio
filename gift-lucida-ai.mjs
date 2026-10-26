import {ort, getExecutionProviders} from './gift-lucida-runtime.mjs';
import {resizeMatteInput, resizeMatteAlpha} from './gift-matte-resample.mjs';

const SIDE = 1024;
const REVISION = '6cbedc9722652dc9a3df91dd871f0c4f3334e922';
const WEIGHTS_SHA = '2f1aa6913426537d4b93dd5f7138ae5c6664e99abda98c95f3d5b9101283e7d5';
const MEAN = [.485, .456, .406], STD = [.229, .224, .225];
const assetBase = new URL('./assets/lucida/', import.meta.url);
const shaPattern = /^[a-f0-9]{64}$/;
let sessionPromise = null;

export function preprocess(rgba, width = SIDE, height = SIDE) {
  if (!(rgba instanceof Uint8ClampedArray) || !Number.isInteger(width) || !Number.isInteger(height)
    || width < 1 || height < 1 || width > 2048 || height > 2048 || rgba.length !== width * height * 4) throw new Error('图片像素尺寸无效。');
  const plane = width * height, input = new Float32Array(plane * 3);
  for (let pixel = 0; pixel < plane; pixel++) for (let channel = 0; channel < 3; channel++) {
    input[channel * plane + pixel] = (rgba[pixel * 4 + channel] / 255 - MEAN[channel]) / STD[channel];
  }
  return input;
}

export function logitsToFloatAlpha(logits) {
  if (!(logits instanceof Float32Array)) throw new Error('抠图模型返回的透明度格式无效。');
  const alpha = new Float32Array(logits.length);
  for (let index = 0; index < logits.length; index++) {
    const value = logits[index];
    if (!Number.isFinite(value)) throw new Error('抠图模型返回了无效像素。');
    // The graph returns logits; apply sigmoid once, before float resampling.
    alpha[index] = value >= 0 ? 1 / (1 + Math.exp(-value)) : Math.exp(value) / (1 + Math.exp(value));
  }
  return alpha;
}

const equalArray = (actual, expected) => Array.isArray(actual) && actual.length === expected.length
  && actual.every((value, index) => value === expected[index]);

export function validateManifest(manifest) {
  if (!manifest || !/^egeorcun\/lucida(?:-[a-z0-9-]+)?$/.test(manifest.name)
    || manifest.revision !== REVISION || manifest.weightsSha256 !== WEIGHTS_SHA
    || manifest.preprocess !== 'pillow-bilinear' || !shaPattern.test(manifest.sha256)
    || !Number.isSafeInteger(manifest.bytes) || manifest.bytes < 1 || manifest.bytes > 2 ** 31
    || manifest.input?.name !== 'input_image' || manifest.input?.type !== 'float32'
    || !equalArray(manifest.input?.shape, [1, 3, SIDE, SIDE])
    || !equalArray(manifest.input?.mean, MEAN) || !equalArray(manifest.input?.std, STD)
    || manifest.output?.name !== 'output_image' || manifest.output?.type !== 'float32'
    || !equalArray(manifest.output?.shape, [1, 1, SIDE, SIDE])
    || manifest.output?.activation !== 'apply sigmoid externally'
    || !Array.isArray(manifest.chunks) || !manifest.chunks.length || manifest.chunks.length > 128) throw new Error('Lucida 抠图模型版本或输入格式不匹配。');
  let bytes = 0;
  const files = new Set();
  for (const chunk of manifest.chunks) {
    if (!chunk || !/^[a-z0-9-]+\.bin$/.test(chunk.file) || files.has(chunk.file)
      || !Number.isSafeInteger(chunk.bytes) || chunk.bytes < 1 || chunk.bytes > 20 * 1024 * 1024
      || !shaPattern.test(chunk.sha256)) throw new Error('Lucida 抠图模型分块无效。');
    files.add(chunk.file); bytes += chunk.bytes;
    if (bytes > manifest.bytes) throw new Error('Lucida 抠图模型分块总长度无效。');
  }
  if (bytes !== manifest.bytes) throw new Error('Lucida 抠图模型分块总长度无效。');
  return manifest;
}

async function checksum(data) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', data)), byte => byte.toString(16).padStart(2, '0')).join('');
}

async function loadModel(progress) {
  progress('loading', 0);
  const response = await fetch(new URL('manifest.json', assetBase), {cache: 'no-cache'});
  if (!response.ok) throw new Error('Lucida 抠图模型清单未能加载，请检查网络后重试。');
  const manifest = validateManifest(await response.json());
  let cache = null;
  try { cache = await globalThis.caches?.open('fun-toolkit-lucida-' + manifest.sha256.slice(0, 16)); } catch (ignored) {}
  const model = new Uint8Array(manifest.bytes);
  let offset = 0, next = 0, completed = 0, failure = null;
  const chunks = manifest.chunks.map(chunk => {
    const item = {chunk, offset}; offset += chunk.bytes; return item;
  });
  const controller = new AbortController();
  async function downloadChunk({chunk, offset}) {
    const url = new URL(chunk.file, assetBase);
    let data = null;
    if (cache) try {
      const cached = await cache.match(url);
      if (cached) {
        const bytes = await cached.arrayBuffer();
        if (bytes.byteLength === chunk.bytes && await checksum(bytes) === chunk.sha256) data = bytes;
        else await cache.delete(url);
      }
    } catch (ignored) {}
    if (!data) {
      const result = await fetch(url, {signal: controller.signal});
      if (!result.ok) throw new Error('Lucida 抠图模型未能下载，请检查网络后重试。');
      data = await result.arrayBuffer();
      if (data.byteLength !== chunk.bytes || await checksum(data) !== chunk.sha256) throw new Error('Lucida 抠图模型分块校验失败，请重试。');
      if (cache) try { await cache.put(url, new Response(data, {headers: {'Content-Type': 'application/octet-stream'}})); } catch (ignored) {}
    }
    if (failure) return;
    model.set(new Uint8Array(data), offset); completed += data.byteLength;
    progress('loading', .85 * completed / model.length);
  }
  // Three workers bound transient chunk memory and avoid serial cold downloads.
  // Each verified block is written at its manifest offset, regardless of order.
  async function download() {
    while (!failure && next < chunks.length) {
      const item = chunks[next++];
      try { await downloadChunk(item); }
      catch (error) { if (!failure) { failure = error; controller.abort(); } }
    }
  }
  await Promise.all(Array.from({length: Math.min(3, chunks.length)}, download));
  // Settle the bounded workers before allowing a retry or emitting a late update.
  if (failure) throw failure;
  if (completed !== model.length || await checksum(model) !== manifest.sha256) throw new Error('Lucida 抠图模型完整性校验失败，请重试。');
  progress('loading', .9);
  const executionProviders = await getExecutionProviders();
  const gpu = executionProviders.some(provider => (typeof provider === 'string' ? provider : provider.name) === 'webgpu');
  const session = await ort.InferenceSession.create(model, {executionProviders, graphOptimizationLevel: 'all',
    enableGraphCapture: false, preferredOutputLocation: gpu ? 'gpu-buffer' : 'cpu'});
  if (!equalArray(session.inputNames, ['input_image']) || !session.outputNames.includes('output_image')) {
    await session.release(); throw new Error('Lucida 抠图模型的输入输出名称无效。');
  }
  progress('loading', 1);
  return session;
}

async function getSession(progress) {
  if (!sessionPromise) sessionPromise = loadModel(progress).catch(error => { sessionPromise = null; throw error; });
  return sessionPromise;
}

export async function remove(message, progress = () => {}) {
  // Validate and resize before downloading a model for invalid source pixels.
  const rgba = resizeMatteInput(message.data, message.width, message.height, SIDE);
  const session = await getSession(progress);
  progress('processing', 0);
  const input = new ort.Tensor('float32', preprocess(rgba), [1, 3, SIDE, SIDE]);
  let outputs;
  try {
    progress('processing', .05);
    outputs = await session.run({input_image: input});
    const output = outputs.output_image;
    if (!output || output.type !== 'float32' || !equalArray(output.dims, [1, 1, SIDE, SIDE])) throw new Error('Lucida 抠图模型返回的尺寸无效。');
    // Ordinary GPU and CPU tensors share the public readback API. Never access
    // .data on a GPU tensor or infer acceleration from a requested provider.
    const logits = await output.getData();
    if (!(logits instanceof Float32Array) || logits.length !== SIDE * SIDE) throw new Error('Lucida 抠图模型返回的尺寸无效。');
    progress('processing', .9);
    const data = resizeMatteAlpha(logitsToFloatAlpha(logits), SIDE, message.width, message.height);
    progress('processing', 1);
    return {width: message.width, height: message.height, data};
  } finally {
    input.dispose();
    if (outputs) for (const tensor of new Set(Object.values(outputs))) tensor?.dispose();
  }
}

export async function release() {
  const current = sessionPromise; sessionPromise = null;
  if (!current) return;
  const session = await current;
  await session.release();
}
