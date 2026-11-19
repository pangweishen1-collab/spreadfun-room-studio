const aborted = () => new DOMException('操作已取消','AbortError');

// One short-lived Worker/WASM session for all atlas budget candidates in one
// generation. Failed codecs return null so the caller can use its frozen path.
export function createAtlasCodec({signal,targetBytes=0} = {}) {
  let worker = null, disposed = false, failed = false, isAborted = signal?.aborted ?? false, nextId = 0;
  const limit = Number.isSafeInteger(targetBytes) && targetBytes > 0 ? targetBytes : 0;
  const pending = new Map();
  function settleAll(error) {
    for (const job of pending.values()) {
      clearTimeout(job.timer);
      if (error) job.reject(error); else job.resolve(null);
    }
    pending.clear();
  }
  function stop() {
    worker?.terminate();worker = null;
    signal?.removeEventListener('abort',onAbort);
  }
  function fail() {
    failed = true;stop();settleAll();
  }
  function onAbort() {
    isAborted = true;stop();settleAll(aborted());
  }
  signal?.addEventListener('abort',onAbort,{once:true});
  // Creating the session before rendering lets WASM prepare while poses render.
  if (!isAborted && typeof Worker === 'function') try {
    worker = new Worker(new URL('./atlas-codec-worker.mjs',import.meta.url),{type:'module'});
    worker.onmessage = ({data}) => {
      const job = pending.get(data?.id);
      if (!job) return;
      pending.delete(data.id);clearTimeout(job.timer);
      job.resolve(data.png instanceof Blob && data.png.type === 'image/png' && data.png.size > 0 ? data.png : null);
    };
    worker.onerror = event => { event.preventDefault?.();fail(); };
    worker.onmessageerror = fail;
  } catch {
    fail();
  }

  return {
    async encode(page) {
      if (isAborted || signal?.aborted) throw aborted();
      if (disposed || failed || !worker) return null;
      const {width,height,rgba} = page ?? {};
      if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || rgba?.length !== width*height*4) return null;
      return new Promise((resolve,reject) => {
        const id = ++nextId;
        const timer = setTimeout(fail,12000);
        pending.set(id,{resolve,reject,timer});
        try {
          // Transfer a copy. The original page remains readable for fallback.
          const copy = new Uint8Array(rgba);
          worker.postMessage({id,width,height,rgba:copy.buffer,targetBytes:limit},[copy.buffer]);
        } catch {
          fail();
        }
      });
    },
    dispose() {
      if (disposed) return;
      disposed = true;stop();settleAll();
    },
  };
}
