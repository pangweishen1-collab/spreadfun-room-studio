const vendor = new URL('./vendor/vap-crf/', import.meta.url);
// Match the pinned, reassembled WASM SHA-256 listed in vendor/vap-crf/NOTICE.txt.
const revision = 'be2c97605366';
const cacheName = 'fun-vap-crf-' + revision;
const partSizes = [12_582_912, 12_582_912, 7_552_499];

export function supportsCrfEncoder() {
  return globalThis.isSecureContext && globalThis.crossOriginIsolated &&
    typeof globalThis.navigator?.storage?.getDirectory === 'function' &&
    typeof VideoFrame === 'function' && typeof Worker === 'function';
}

async function loadPart(cache, index, size, prewarm) {
  const url = new URL(`ffmpeg-core-${index}.bin?v=${revision}`, vendor).href;
  const readOrDownload = async () => {
    try {
      const cached = await cache?.match(url);
      if (cached) {
        if (prewarm && cached.headers.get('Content-Length') === String(size)) return;
        const part = await cached.blob();
        if (part.size === size) return prewarm ? undefined : part;
      }
    } catch {}
    const response = await fetch(url, {
      cache: cache ? 'default' : 'force-cache',
      priority: prewarm ? 'low' : 'auto'
    });
    if (response.status !== 200) throw new Error('CRF 编码器文件下载失败。');
    const part = await response.blob();
    if (part.size !== size) throw new Error('CRF 编码器文件不完整。');
    try {
      await cache?.put(url, new Response(part, {headers: {'Content-Length': String(size)}}));
    } catch {}
    return prewarm ? undefined : part;
  };

  let acquired = false;
  try {
    const locks = globalThis.navigator?.locks;
    // A tab and its export worker share this lock. A stalled tab cannot hold
    // up a different export indefinitely while it waits to enter.
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
  return Promise.all(partSizes.map((size, index) => loadPart(cache, index, size, prewarm)));
}
