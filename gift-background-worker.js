import {darkBackground} from './gift-background-matte.mjs';
import {composeUniformMatte} from './gift-uniform-matte.mjs';

let running = false, aiModulePromise = null, lucidaModulePromise = null;
async function loadAI() {
  if (!aiModulePromise) aiModulePromise = import('./gift-background-ai.mjs?v=20261025-speed1').catch(error => { aiModulePromise = null; throw error; });
  return aiModulePromise;
}
async function loadLucida() {
  if (!lucidaModulePromise) lucidaModulePromise = import('./gift-lucida-ai.mjs?v=20261026-lucida2').catch(error => { lucidaModulePromise = null; throw error; });
  return lucidaModulePromise;
}

export async function routeBackground(message, {onProgress = () => {}, loadAI: load = loadAI, loadLucida: loadQuality = loadLucida} = {}) {
  const {width, height, data} = message;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 2048 || height > 2048
    || !(data instanceof Uint8ClampedArray) || data.length !== width * height * 4) throw new Error('图片像素尺寸无效。');
  onProgress('analyzing', 0);
  const background = darkBackground(data, width, height);
  if (!background) {
    const ai = await load();
    const prior = await ai.remove(message, (phase, value) => onProgress(phase, .04 + .96 * value));
    onProgress('processing', 1); return prior;
  }
  const lucida = await loadQuality();
  const prior = await lucida.remove(message, (phase, value) => onProgress(phase, phase === 'loading' ? .04 + .46 * value : .5 + .46 * value));
  if (prior.width !== width || prior.height !== height) throw new Error('Lucida 主体透明度须匹配原图尺寸。');
  onProgress('matting', .97);
  const result = composeUniformMatte(data, width, height, prior.data, background);
  onProgress('processing', 1);
  return {...result, method: 'quality-matte'};
}

async function remove(message) {
  if (running) { self.postMessage({type: 'error', id: message.id, message: '背景移除正在处理中。'}); return; }
  running = true;
  try {
    const result = await routeBackground(message, {onProgress: (phase, value) => self.postMessage({type: 'progress', id: message.id, phase, progress: Math.max(0, Math.min(1, value))})});
    const transfer = [result.data.buffer];
    if (result.foreground) transfer.push(result.foreground.buffer);
    self.postMessage({type: 'result', id: message.id, ...result}, transfer);
  } catch (error) {
    self.postMessage({type: 'error', id: message.id, message: error.message || '本地背景移除失败，请重试。'});
  } finally { running = false; }
}
if (typeof self !== 'undefined') self.addEventListener('message', event => { if (event.data?.type === 'remove') remove(event.data); });
