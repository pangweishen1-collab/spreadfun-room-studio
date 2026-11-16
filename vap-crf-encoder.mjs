function crfError(code, message, cause) {
  return Object.assign(new Error(message, {cause}), {code});
}

const recommendedAttempts = 3;

export async function encodeToRecommendation(initialCrf, targetBytes, encode, signal) {
  let attempts = 1;
  let selected = {blob: await encode(initialCrf, attempts), crf: initialCrf};
  let current = selected;
  while (targetBytes > 0 && current.blob.size > targetBytes &&
      current.crf < 51 && attempts < recommendedAttempts) {
    // Six CRF points are a starting estimate for halving the video bytes.
    // Measure again because the response depends on the codec and source.
    const step = Math.max(1, Math.ceil(6 * Math.log2(current.blob.size / (targetBytes * .96))));
    const crf = Math.min(51, current.crf + step);
    try {
      current = {blob: await encode(crf, ++attempts), crf};
    } catch (error) {
      if (signal?.aborted || error?.code === 'cancelled') throw error;
      break;
    }
    if (current.blob.size < selected.blob.size) selected = current;
  }
  return {...selected, attempts};
}

export async function createCrfEncoder({codec, crf, width, height, fps, frameCount, signal, onProgress}) {
  if (!['avc', 'hevc'].includes(codec) || !Number.isInteger(crf) || crf < 0 || crf > 51 ||
      ![width, height].every(value => Number.isInteger(value) && value > 0 && value % 2 === 0) ||
      !Number.isInteger(fps) || fps < 1 || !Number.isInteger(frameCount) || frameCount < 1) {
    throw crfError('invalid', 'CRF 编码参数无效。');
  }
  const cancelled = () => crfError('cancelled', '转换已取消。');
  if (signal?.aborted) throw cancelled();
  if (!globalThis.isSecureContext || !globalThis.crossOriginIsolated || !navigator.storage?.getDirectory ||
      typeof VideoFrame !== 'function' || typeof Worker !== 'function') {
    throw crfError('unsupported', '当前浏览器无法使用本地 CRF 编码，请使用支持本地文件存储的 Chrome 或 Edge。');
  }

  const name = 'fun-vap-crf-' + crypto.randomUUID();
  let root, worker, pending, nextMessage = 0, closed = false, ending, frames = 0, finished = false;
  let encodeAttempt = 1, totalAttempts = 1;
  const cleanup = async () => {
    try { await root?.removeEntry(name, {recursive: true}); } catch (error) {
      // A terminated worker may still be releasing its access handle.
      if (error?.name === 'NotFoundError') return;
      await new Promise(resolve => setTimeout(resolve, 50));
      try { await root?.removeEntry(name, {recursive: true}); } catch {}
    }
  };
  function dispose(reason = cancelled()) {
    if (ending) return ending;
    closed = true;
    signal?.removeEventListener('abort', abort);
    worker?.terminate();
    pending?.reject(reason);
    pending = null;
    ending = cleanup();
    return ending;
  }
  const abort = () => { void dispose(); };

  function request(type, args = {}, transfer = []) {
    if (closed) return Promise.reject(cancelled());
    if (pending) return Promise.reject(crfError('encode', 'CRF 编码器正在处理另一帧。'));
    return new Promise((resolve, reject) => {
      const id = ++nextMessage;
      pending = {id, resolve, reject};
      try { worker.postMessage({id, type, ...args}, transfer); } catch (error) {
        pending = null;
        reject(error);
      }
    });
  }

  try {
    root = await navigator.storage.getDirectory();
    const folder = await root.getDirectoryHandle(name, {create: true});
    const file = await folder.getFileHandle('packed.i420', {create: true});
    if (signal?.aborted) throw cancelled();
    worker = new Worker(new URL('./vap-crf-worker.js?v=20261116-parallel-hevc', import.meta.url), {type: 'module'});
    worker.onmessage = ({data}) => {
      if (data.progress !== undefined) {
        onProgress?.((encodeAttempt - 1 + data.progress) / totalAttempts, encodeAttempt);
        return;
      }
      if (pending?.id !== data.id) return;
      const {resolve, reject} = pending;
      pending = null;
      if (data.error) reject(crfError(data.code ?? 'encode', data.error));
      else resolve(data.result);
    };
    worker.onerror = () => { void dispose(crfError('encode', '本地 CRF 编码组件未能启动。')); };
    signal?.addEventListener('abort', abort, {once: true});
    await request('init', {file, width, height, fps, codec, frameCount});
  } catch (error) {
    await dispose();
    if (signal?.aborted) throw cancelled();
    throw error?.code ? error : crfError('storage', '无法打开浏览器的临时视频存储。', error);
  }

  return {
    async add(canvas) {
      if (finished || frames >= frameCount) throw crfError('encode', 'CRF 编码的输入帧数错误。');
      const frame = new VideoFrame(canvas, {timestamp: Math.round(frames * 1e6 / fps), alpha: 'discard'});
      try { await request('frame', {frame}, [frame]); } finally { frame.close(); }
      frames++;
    },
    async finish({targetBytes} = {}) {
      if (finished || frames !== frameCount) throw crfError('encode', 'CRF 编码未收到全部视频帧。');
      finished = true;
      totalAttempts = targetBytes > 0 ? recommendedAttempts : 1;
      return encodeToRecommendation(crf, targetBytes, async (value, attempt) => {
        encodeAttempt = attempt;
        onProgress?.((attempt - 1) / totalAttempts, attempt);
        return new Blob([await request('encode', {crf: value})], {type: 'video/mp4'});
      }, signal);
    },
    dispose
  };
}
