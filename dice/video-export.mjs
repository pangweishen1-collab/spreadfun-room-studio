// Reuse the same locally bundled MP4 muxer/codec pipeline as vap-engine.mjs.
// Annex B takes a packet-copy path: no decoder, encoder, server, or FFmpeg.
const media = () => import('../vendor/mediabunny/mediabunny.mjs');
export const VIDEO_SPEC = Object.freeze({width: 720, height: 1600, fps: 30, frameCount: 180, duration: 6, profile: 'loop6-v1'});
const MAX_BYTES = 64 * 1024 * 1024;
const fail = message => { throw new Error(message); };
const tick = () => new Promise(resolve => setTimeout(resolve, 0));

function checkBlob(blob) {
  if (!(blob instanceof Blob) || !blob.size) fail('视频内容为空，请重新导出');
  if (blob.size > MAX_BYTES) fail('视频文件过大，请重新导出');
}

function bitsReader(nal) {
  const bytes = [];
  for (let index = 1; index < nal.length; index++) {
    if (nal[index] === 3 && index >= 3 && nal[index - 1] === 0 && nal[index - 2] === 0) continue;
    bytes.push(nal[index]);
  }
  let offset = 0;
  const bits = count => {
    if (offset + count > bytes.length * 8) fail('H.264 数据不完整，请重新导出');
    let value = 0;
    for (let index = 0; index < count; index++, offset++) value = value * 2 + ((bytes[offset >> 3] >> (7 - offset % 8)) & 1);
    return value;
  };
  const ue = () => {
    let zeros = 0;
    while (!bits(1)) { if (++zeros > 30) fail('H.264 参数无效，请重新导出'); }
    return 2 ** zeros - 1 + bits(zeros);
  };
  const se = () => { const value = ue(); return value % 2 ? (value + 1) / 2 : -value / 2; };
  return {bits, ue, se};
}

function spsSize(nal) {
  const {bits, ue, se} = bitsReader(nal);
  const profile = bits(8);
  bits(16); ue();
  let chroma = 1, separate = 0;
  if ([100,110,122,244,44,83,86,118,128,138,139,134,135].includes(profile)) {
    chroma = ue();
    if (chroma > 3) fail('H.264 色彩参数无效，请重新导出');
    if (chroma === 3) separate = bits(1);
    ue(); ue(); bits(1);
    if (bits(1)) {
      for (let list = 0; list < (chroma === 3 ? 12 : 8); list++) {
        if (!bits(1)) continue;
        let last = 8, next = 8;
        for (let item = 0; item < (list < 6 ? 16 : 64); item++) {
          if (next) next = (last + se() + 256) % 256;
          if (next) last = next;
        }
      }
    }
  }
  ue();
  const order = ue();
  if (order === 0) ue();
  else if (order === 1) {
    bits(1); se(); se();
    const count = ue();
    if (count > 256) fail('H.264 参数无效，请重新导出');
    for (let index = 0; index < count; index++) se();
  } else if (order !== 2) fail('H.264 帧序参数无效，请重新导出');
  ue(); bits(1);
  const columns = ue() + 1, rows = ue() + 1, progressive = bits(1);
  if (!progressive) fail('请使用逐行 H.264 视频');
  bits(1);
  let left = 0, right = 0, top = 0, bottom = 0;
  if (bits(1)) { left = ue(); right = ue(); top = ue(); bottom = ue(); }
  const arrayType = separate ? 0 : chroma;
  const cropX = arrayType === 0 || arrayType === 3 ? 1 : 2;
  const cropY = arrayType === 1 ? 2 : 1;
  return {width: columns * 16 - (left + right) * cropX, height: rows * 16 - (top + bottom) * cropY};
}

function nalUnits(bytes) {
  const starts = [];
  for (let index = 0; index + 3 < bytes.length; index++) {
    if (bytes[index] || bytes[index + 1]) continue;
    const length = bytes[index + 2] === 1 ? 3 : bytes[index + 2] === 0 && bytes[index + 3] === 1 ? 4 : 0;
    if (length) { starts.push({index, header: index + length}); index += length - 1; }
  }
  if (!starts.length || starts[0].index > 3 || bytes.slice(0, starts[0].index).some(Boolean)) fail('H.264 Annex B 格式无效，请重新导出');
  return starts.map((start, index) => {
    let end = starts[index + 1]?.index ?? bytes.length;
    while (end > start.header && bytes[end - 1] === 0) end--;
    const data = bytes.subarray(start.header, end);
    if (!data.length || data[0] & 128 || !(data[0] & 31)) fail('H.264 数据不完整，请重新导出');
    return {data, type: data[0] & 31};
  });
}

function annexFrames(bytes) {
  const frames = [];
  let pending = [], hasPicture = false, key = false, sps, hasPps = false;
  const flush = () => {
    if (hasPicture) {
      const data = new Uint8Array(pending.reduce((sum, nal) => sum + nal.length + 4, 0));
      let offset = 0;
      for (const nal of pending) { data.set([0,0,0,1], offset); data.set(nal, offset + 4); offset += nal.length + 4; }
      frames.push({data, key});
    }
    pending = []; hasPicture = false; key = false;
  };
  for (const {data, type} of nalUnits(bytes)) {
    if (type === 9 || hasPicture && [6,7,8].includes(type)) flush();
    if (type === 7) {
      const size = spsSize(data);
      if (size.width !== VIDEO_SPEC.width || size.height !== VIDEO_SPEC.height) fail('视频尺寸须为 720 × 1600');
      sps ||= data;
    }
    if (type === 8) hasPps = true;
    if (type === 1 || type === 5) {
      const reader = bitsReader(data), first = reader.ue(), slice = reader.ue() % 5;
      if (slice === 1) fail('H.264 含重排序帧，请重新导出');
      if (first === 0 && hasPicture) flush();
      if (!hasPicture && first !== 0) fail('H.264 首个分片缺失，请重新导出');
      hasPicture = true; key ||= type === 5;
    } else if (![6,7,8,9,10,11,12].includes(type)) fail('H.264 数据类型不受支持，请重新导出');
    pending.push(data);
  }
  flush();
  if (!sps || !hasPps || !frames[0]?.key) fail('H.264 缺少解码参数或首个关键帧');
  if (frames.length !== VIDEO_SPEC.frameCount) fail('视频须包含完整的 180 帧');
  return {frames, codec: 'avc1.' + Array.from(sps.subarray(1, 4), value => value.toString(16).padStart(2, '0')).join('')};
}

function makeOutput(M) {
  const target = new M.BufferTarget();
  return {target, output: new M.Output({format: new M.Mp4OutputFormat({fastStart: 'in-memory'}), target})};
}

async function muxAnnexB(blob, M) {
  const {frames, codec} = annexFrames(new Uint8Array(await blob.arrayBuffer()));
  const {target, output} = makeOutput(M);
  const source = new M.EncodedVideoPacketSource('avc');
  output.addVideoTrack(source, {frameRate: VIDEO_SPEC.fps});
  try {
    await output.start();
    for (let index = 0; index < frames.length; index++) {
      const frame = frames[index];
      await source.add(new M.EncodedPacket(frame.data, frame.key ? 'key' : 'delta', index / 30, 1 / 30), index === 0 ? {
        decoderConfig: {codec, codedWidth: 720, codedHeight: 1600},
      } : undefined);
      if (index % 60 === 59) await tick();
    }
    source.close();
    await output.finalize();
    return new Blob([target.buffer], {type: 'video/mp4'});
  } catch (error) { await output.cancel().catch(() => {}); throw error; }
}

async function openVideo(blob, M) {
  const input = new M.Input({source: new M.BlobSource(blob), formats: [M.MP4, M.WEBM]});
  try {
    if (!await input.canRead()) fail('无法读取录制视频，请重新导出');
    const track = await input.getPrimaryVideoTrack();
    if (!track) fail('录制文件中没有视频轨道');
    const [width, height, duration, codec] = await Promise.all([
      track.getDisplayWidth(), track.getDisplayHeight(), input.computeDuration(), track.getCodec(),
    ]);
    return {input, track, width, height, duration, codec};
  } catch (error) { input.dispose(); throw error; }
}

/** Inspect real container packets; no decoding or browser-specific codec needed. */
export async function inspectVideo(blob) {
  checkBlob(blob);
  const M = await media(), source = await openVideo(blob, M);
  try {
    let frameCount = 0, first = Infinity, end = 0;
    const timings = [];
    for await (const packet of new M.EncodedPacketSink(source.track).packets()) {
      frameCount++; first = Math.min(first, packet.timestamp); end = Math.max(end, packet.timestamp + packet.duration);
      timings.push({timestamp: packet.timestamp, duration: packet.duration});
      if (frameCount > 1000) fail('视频帧数超出预览范围');
    }
    const duration = end - first;
    timings.sort((a, b) => a.timestamp - b.timestamp);
    const constantFrameRate = timings.length > 0 && timings.every((timing, index) =>
      Math.abs(timing.timestamp - first - index / 30) < .0001 && Math.abs(timing.duration - 1 / 30) < .0001);
    return {width: source.width, height: source.height, duration, fps: frameCount / duration, frameCount, codec: source.codec, constantFrameRate};
  } finally { source.input.dispose(); }
}

function matches(info) {
  return info.width === 720 && info.height === 1600 && info.frameCount === 180 &&
    Math.abs(info.duration - 6) < .0001 && Math.abs(info.fps - 30) < .001 && info.codec === 'avc' && info.constantFrameRate;
}

async function transcodeFallback(blob, M) {
  const source = await openVideo(blob, M);
  let output, iterator, canvas;
  try {
    if (source.width !== 720 || source.height !== 1600) fail('视频尺寸须为 720 × 1600');
    if (!Number.isFinite(source.duration) || source.duration < 5.5 || source.duration > 7) fail('录制视频时长异常，请重新导出 6 秒视频');
    if (!await source.track.canDecode()) fail('当前浏览器无法解码录制视频，请使用最新版 Chrome 或 Edge');
    let codec;
    for (const candidate of ['avc1.640028','avc1.4d0028','avc1.420028']) {
      if (await M.canEncodeVideo('avc', {width: 720, height: 1600, frameRate: 30, fullCodecString: candidate, quality: new M.Quality({bitrate: 6_000_000})})) { codec = candidate; break; }
    }
    if (!codec) fail('当前浏览器无法生成 H.264 MP4，请使用最新版 Chrome 或 Edge');
    canvas = typeof OffscreenCanvas === 'function' ? new OffscreenCanvas(720, 1600) : Object.assign(document.createElement('canvas'), {width: 720, height: 1600});
    const context = canvas.getContext('2d');
    if (!context) fail('无法创建视频导出画布');
    const targetOutput = makeOutput(M); output = targetOutput.output;
    const encoded = new M.CanvasSource(canvas, {codec: 'avc', fullCodecString: codec, quality: new M.Quality({bitrate: 6_000_000}), latencyMode: 'quality', keyFrameInterval: 2});
    output.addVideoTrack(encoded, {frameRate: 30});
    const sink = new M.CanvasSink(source.track, {poolSize: 2, width: 720, height: 1600, fit: 'fill'});
    iterator = sink.canvasesAtTimestamps(Array.from({length: 180}, (_, index) => Math.min(index / 30, Math.max(0, source.duration - .04))));
    await output.start();
    let previous;
    for (let index = 0; index < 180; index++) {
      const next = await iterator.next();
      if (next.value) previous = next.value.canvas;
      if (!previous) fail('录制视频缺少可解码画面');
      context.drawImage(previous, 0, 0, 720, 1600);
      await encoded.add(index / 30, 1 / 30, {keyFrame: index % 60 === 0});
      if (index % 30 === 29) await tick();
    }
    encoded.close(); await output.finalize();
    return new Blob([targetOutput.target.buffer], {type: 'video/mp4'});
  } catch (error) { await output?.cancel().catch(() => {}); throw error; }
  finally { await iterator?.return?.(); source.input.dispose(); if (canvas) canvas.width = canvas.height = 1; }
}

/** Canonical six-second MP4. The returned Blob carries read-only videoInfo. */
export async function prepareVideo(blob) {
  checkBlob(blob);
  const mime = blob.type.split(';')[0].toLowerCase(), M = await media();
  let result, method;
  if (mime === 'video/h264' || mime === 'video/avc') {
    result = await muxAnnexB(blob, M); method = 'h264_copy_mux';
  } else if (mime === 'video/mp4' || mime === 'video/webm') {
    if (mime === 'video/mp4' && matches(await inspectVideo(blob))) { result = new Blob([blob], {type: 'video/mp4'}); method = 'mp4_passthrough'; }
    else { result = await transcodeFallback(blob, M); method = 'fallback_transcode'; }
  } else fail('不支持的录制视频格式，请重新导出');
  const info = await inspectVideo(result);
  if (!matches(info)) fail('视频规格校验未通过，请重新导出');
  Object.defineProperty(result, 'videoInfo', {value: Object.freeze({...VIDEO_SPEC, ...info, method}), enumerable: false});
  return result;
}
