const vendor = new URL('./vendor/vap-crf/', import.meta.url);
const coreURL = new URL('ffmpeg-core.mjs', vendor).href;
const coreModule = import(coreURL);
coreModule.catch(() => {});
let job;

async function loadCore(parts) {
  const {default: createFFmpegCore} = await coreModule;
  const wasmBinary = new Uint8Array(await new Blob(parts).arrayBuffer());
  const workerURL = new URL('ffmpeg-core.worker.js', vendor).href;
  // The upstream loader reads the worker URL from this fragment. The wasm
  // binary is supplied directly because it is split into hosting assets.
  const locations = btoa(JSON.stringify({workerURL, wasmURL: ''}));
  return createFFmpegCore({wasmBinary, mainScriptUrlOrBlob: coreURL + '#' + locations});
}

// Convert opaque sRGB canvas samples to the limited-range BT.709 I420 planes
// written by the encoder. Average each 2 × 2 RGB block for its chroma sample.
function toI420(rgba, output, width, height) {
  const pixels = width * height;
  const y = index => ((11966 * rgba[index] + 40254 * rgba[index + 1] + 4064 * rgba[index + 2] + 32768) >> 16) + 16;
  let chroma = 0;
  for (let row = 0; row < height; row += 2) {
    for (let x = 0; x < width; x += 2) {
      const p = row * width + x;
      const a = p * 4, b = a + 4, c = a + width * 4, d = c + 4;
      output[p] = y(a);
      output[p + 1] = y(b);
      output[p + width] = y(c);
      output[p + width + 1] = y(d);
      const r = rgba[a] + rgba[b] + rgba[c] + rgba[d];
      const g = rgba[a + 1] + rgba[b + 1] + rgba[c + 1] + rgba[d + 1];
      const bSum = rgba[a + 2] + rgba[b + 2] + rgba[c + 2] + rgba[d + 2];
      output[pixels + chroma] = ((-6596 * r - 22188 * g + 28784 * bSum + 131072) >> 18) + 128;
      output[pixels * 5 / 4 + chroma] = ((28784 * r - 26145 * g - 2639 * bSum + 131072) >> 18) + 128;
      chroma++;
    }
  }
}

async function init(message) {
  const {file, width, height} = message;
  if (typeof file.createSyncAccessHandle !== 'function') {
    throw Object.assign(new Error('当前浏览器不支持 CRF 编码所需的本地文件存储。'), {code: 'unsupported'});
  }
  const access = await file.createSyncAccessHandle();
  job = {
    ...message, access, offset: 0,
    rgba: new Uint8Array(width * height * 4), i420: new Uint8Array(width * height * 3 / 2)
  };
}

async function writeFrame(frame) {
  const {width, height, rgba, i420, access, offset} = job;
  try {
    await frame.copyTo(rgba, {format: 'RGBA', layout: [{offset: 0, stride: width * 4}]});
  } finally { frame.close(); }
  toI420(rgba, i420, width, height);
  const written = access.write(i420, {at: offset});
  if (written !== i420.length) {
    throw Object.assign(new Error('浏览器临时存储空间不足，无法写入视频帧。'), {code: 'storage'});
  }
  job.offset += written;
}

async function encode(crf) {
  const {codec, width, height, fps, frameCount, file} = job;
  const input = '/input';
  const target = '/video.mp4';
  // Keep the original packed frames mounted across attempts. Only the
  // output is discarded between runs.
  if (job.access) {
    if (job.offset !== frameCount * job.i420.length) throw new Error('CRF 编码未收到全部视频帧。');
    job.access.close();
    job.access = job.i420 = job.rgba = null;
    const [core, packedFrames] = await Promise.all([job.coreReady, file.getFile()]);
    core.FS.mkdir(input);
    core.FS.mount(core.FS.filesystems.WORKERFS, {files: [packedFrames]}, input);
    job.core = core;
  }
  const {core} = job;
  let lastError;
  core.setLogger(({type, message}) => { if (type === 'stderr') lastError = message; });
  const duration = frameCount / fps;
  core.setProgress(({time}) => {
    if (Number.isFinite(time)) postMessage({progress: Math.min(1, Math.max(0, time / 1e6 / duration))});
  });
  const h264 = codec === 'avc';
  // Leave room for browser work and avoid thread startup on small encodes.
  const parallelHevc = !h264 && width >= 512 && height >= 512 && frameCount >= fps &&
    navigator.hardwareConcurrency >= 4;
  const hevcParams = parallelHevc
    ? `pools=${Math.min(4, navigator.hardwareConcurrency - 2)}:frame-threads=2:wpp=1`
    : 'pools=none:frame-threads=1:wpp=0';
  try {
    const result = core.exec(
      '-hide_banner', '-loglevel', 'error',
      '-filter_threads', '1', '-filter_complex_threads', '1',
      '-f', 'rawvideo', '-pixel_format', 'yuv420p', '-video_size', `${width}x${height}`,
      '-framerate', String(fps), '-i', input + '/packed.i420',
      '-c:v', h264 ? 'libx264' : 'libx265',
      '-profile:v', h264 && crf === 0 ? 'high444' : 'main',
      '-crf', String(crf), '-preset', 'veryfast',
      '-threads', '1', '-g', String(fps * 2), '-bf', '0',
      ...(h264 ? [] : ['-x265-params', hevcParams, '-tag:v', 'hvc1']),
      '-color_range', 'tv', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709',
      '-movflags', '+faststart', target
    );
    if (result !== 0) throw new Error(lastError || 'CRF 视频编码失败。');
    return core.FS.readFile(target);
  } finally {
    core.reset();
    if (core.FS.analyzePath(target).exists) core.FS.unlink(target);
  }
}

self.onmessage = async ({data}) => {
  const {id, type} = data;
  if (type === 'core') {
    job.coreReady = loadCore(data.parts);
    job.coreReady.catch(() => {});
    return;
  }
  try {
    let result;
    if (type === 'init') await init(data);
    if (type === 'frame') await writeFrame(data.frame);
    if (type === 'encode') result = await encode(data.crf);
    postMessage({id, result}, result ? [result.buffer] : []);
  } catch (error) {
    const quota = error?.name === 'QuotaExceededError';
    postMessage({id, error: quota ? '浏览器临时存储空间不足，无法写入视频帧。' : error.message,
      code: quota ? 'storage' : error.code});
  }
};
