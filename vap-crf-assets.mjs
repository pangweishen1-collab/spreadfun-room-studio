const vendor = new URL('./vendor/vap-crf/', import.meta.url);
// Match the pinned, reassembled WASM SHA-256 listed in vendor/vap-crf/NOTICE.txt.
const revision = 'be2c97605366';
const cacheName = 'fun-vap-crf-' + revision;
const parts = [12_582_912, 12_582_912, 7_552_499].map((size, index) => ({
  size,
  url: new URL(`ffmpeg-core-${index}.bin?v=${revision}`, vendor).href,
  received: 0,
  downloading: false,
  pending: null,
  memory: null
}));
const totalBytes = parts.reduce((sum, part) => sum + part.size, 0);
const listeners = new Set();

export function supportsCrfEncoder() {
  return globalThis.isSecureContext && globalThis.crossOriginIsolated &&
    typeof globalThis.navigator?.storage?.getDirectory === 'function' &&
    typeof VideoFrame === 'function' && typeof Worker === 'function';
}

function downloadProgress() {
  if (!parts.some(part => part.downloading)) return null;
  return parts.reduce((sum, part) => sum + part.received, 0) / totalBytes;
}

function notify() {
  const progress = downloadProgress();
  for (const listener of listeners) listener(progress);
}

export function watchCrfDownload(listener) {
  listener(downloadProgress());
  listeners.add(listener);
  return () => listeners.delete(listener);
}

async function readBody(response, part) {
  if (!response.body) return response.blob();
  const reader = response.body.getReader();
  const chunks = [];
  try {
    for (let result = await reader.read(); !result.done; result = await reader.read()) {
      part.received += result.value.byteLength;
      if (part.received > part.size) {
        await reader.cancel();
        throw new Error('CRF 编码器文件大小不匹配。');
      }
      chunks.push(result.value);
      notify();
    }
    return new Blob(chunks);
  } finally {
    reader.releaseLock();
  }
}

async function loadPart(cache, part, prewarm) {
  const {url, size} = part;
  const readOrDownload = async () => {
    try {
      const cached = await cache?.match(url);
      const blob = await cached?.blob();
      if (blob?.size === size) {
        part.received = size;
        notify();
        return blob;
      }
    } catch {}

    part.received = 0;
    part.downloading = true;
    notify();
    let blob;
    try {
      const response = await fetch(url, {
        cache: cache ? 'default' : 'force-cache',
        priority: prewarm ? 'low' : 'auto'
      });
      if (response.status !== 200) throw new Error(`HTTP ${response.status}`);
      blob = await readBody(response, part);
      if (blob.size !== size) throw new Error('CRF 编码器文件大小不匹配。');
      part.received = size;
    } catch (cause) {
      part.received = 0;
      throw Object.assign(new Error('CRF 编码器文件下载失败。', {cause}), {code: 'encoder-download'});
    } finally {
      part.downloading = false;
      notify();
    }

    if (cache) {
      try {
        await cache.put(url, new Response(blob));
        return blob;
      } catch {}
    }
    // Reuse assets in this tab if the browser denies persistent storage.
    return part.memory = blob;
  };

  let acquired = false;
  try {
    const locks = globalThis.navigator?.locks;
    if (locks) return await locks.request(url, {signal: AbortSignal.timeout(120_000)}, () => {
      acquired = true;
      return readOrDownload();
    });
  } catch (error) {
    if (acquired) throw error;
  }
  return readOrDownload();
}

export async function loadCrfParts({prewarm = false} = {}) {
  let cache;
  try { cache = await globalThis.caches?.open(cacheName); } catch {}
  return Promise.all(parts.map(part => {
    if (part.memory) return part.memory;
    return part.pending ||= loadPart(cache, part, prewarm).finally(() => { part.pending = null; });
  }));
}
