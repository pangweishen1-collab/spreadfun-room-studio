const FPS = 30;
const DURATION = 6;
const FRAME_COUNT = DURATION * FPS;
// AVC level 3.2 accommodates 4,410 macroblocks per frame at 30 FPS.
const ENCODINGS = [
  {codec: 'avc', fullCodecString: 'avc1.640020'},
  {codec: 'avc', fullCodecString: 'avc1.4d0020'},
  {codec: 'avc', fullCodecString: 'avc1.420020'},
  {codec: 'vp9'},
  {codec: 'vp8'}
];

async function openEncoder(M, canvas, signal) {
  const options = {quality: new M.Quality({bitrate: 8_000_000}), bitrateMode: 'variable', latencyMode: 'quality'};
  const dimensions = {width: canvas.width, height: canvas.height, frameRate: FPS};
  for (const {codec, fullCodecString} of ENCODINGS) {
    signal?.throwIfAborted();
    if (!await M.canEncodeVideo(codec, {...options, ...dimensions, fullCodecString})) continue;
    signal?.throwIfAborted();
    const extension = codec === 'avc' ? 'mp4' : 'webm';
    const format = extension === 'mp4' ? new M.Mp4OutputFormat({fastStart: 'in-memory'}) : new M.WebMOutputFormat();
    const target = new M.BufferTarget();
    const output = new M.Output({format, target});
    try {
      const source = new M.CanvasSource(canvas, {codec, fullCodecString, ...options, keyFrameInterval: 2});
      output.addVideoTrack(source, {frameRate: FPS});
      await output.start();
      // The support query alone cannot guarantee the actual CanvasSource
      // encoder config. Try the first real frame before committing to a codec.
      await source.add(0, 1 / FPS, {keyFrame: true});
      return {output, target, source, extension};
    } catch {
      await output.cancel().catch(() => {});
    }
  }
  signal?.throwIfAborted();
  throw Object.assign(new Error('Video encoder unavailable'), {code: 'unsupported'});
}

async function validateVideo(M, buffer, extension, signal) {
  const input = new M.Input({source: new M.BufferSource(buffer), formats: [extension === 'mp4' ? M.MP4 : M.WEBM]});
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track) throw new Error('Missing room review video track');
    const [width, height] = await Promise.all([track.getDisplayWidth(), track.getDisplayHeight()]);
    if (width !== 720 || height !== 1560) throw new Error('Unexpected encoded room review dimensions');
    const timestamps = [];
    const tolerance = extension === 'mp4' ? .0001 : .001;
    for await (const packet of new M.EncodedPacketSink(track).packets()) {
      signal?.throwIfAborted();
      if (timestamps.length >= FRAME_COUNT || Math.abs(packet.duration - 1 / FPS) > tolerance) {
        throw new Error('Unexpected room review frame duration');
      }
      timestamps.push(packet.timestamp);
    }
    timestamps.sort((a, b) => a - b);
    if (timestamps.length !== FRAME_COUNT || timestamps.some((timestamp, index) => Math.abs(timestamp - index / FPS) > tolerance)) {
      throw new Error(`Room review must contain all ${FRAME_COUNT} frames at ${FPS} FPS`);
    }
    const duration = await track.computeDuration();
    if (Math.abs(duration - DURATION) > tolerance) throw new Error('Room review video duration must be six seconds');
  } finally {
    input.dispose();
  }
}

export async function encodeAvatarReviewVideo(canvas, drawFrame, onProgress = () => {}, {signal} = {}) {
  signal?.throwIfAborted();
  if (canvas.width !== 720 || canvas.height !== 1560) throw new Error('Unexpected room review dimensions');
  const M = await import('./vendor/mediabunny/mediabunny.mjs');
  signal?.throwIfAborted();
  drawFrame(0);
  const {output, target, source, extension} = await openEncoder(M, canvas, signal);
  try {
    for (let index = 1; index < FRAME_COUNT; index++) {
      signal?.throwIfAborted();
      const time = index / FPS;
      drawFrame(time);
      await source.add(time, 1 / FPS, {keyFrame: index % (FPS * 2) === 0});
      if ((index + 1) % 8 === 0) {
        onProgress(.98 * (index + 1) / FRAME_COUNT);
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    }
    signal?.throwIfAborted();
    source.close();
    await output.finalize();
    signal?.throwIfAborted();
    if (!target.buffer?.byteLength) throw new Error('Empty room review video');
    await validateVideo(M, target.buffer, extension, signal);
    signal?.throwIfAborted();
    onProgress(1);
    return {blob: new Blob([target.buffer], {type: 'video/' + extension}), extension};
  } catch (error) {
    await output.cancel().catch(() => {});
    throw error;
  }
}
