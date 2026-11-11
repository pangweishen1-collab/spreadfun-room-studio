import {CanvasSpineRenderer} from '../dice/six-face/canvas-spine.mjs';

const WIDTH = 720;
const HEIGHT = 1600;
const FPS = 30;
const VIDEO_SECONDS = 6;
export const TOKEN_ROUND_SECONDS = 2;
export const TOKEN_HOP_SECONDS = .4;
const TRACK_QUARTER = [
  [6, 13], [6, 12], [6, 11], [6, 10], [6, 9],
  [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8], [0, 7], [0, 6],
];
const turn = ([column, row]) => [14 - row, column];
const TRACK = [
  ...TRACK_QUARTER,
  ...TRACK_QUARTER.map(turn),
  ...TRACK_QUARTER.map(cell => turn(turn(cell))),
  ...TRACK_QUARTER.map(cell => turn(turn(turn(cell)))),
];
export const TOKEN_TRACK_SECONDS = TRACK.length * TOKEN_HOP_SECONDS;
const TRACK_START = {green: 0, yellow: 13, red: 26, blue: 39};
const HOMES = [
  {color: 'yellow', x: [59, 99], y: [272, 311], active: 3, lane: [112.5, 369.5]},
  {color: 'red', x: [262, 301], y: [272, 311], active: 2, lane: [247.5, 369.5]},
  {color: 'green', x: [59, 99], y: [475, 514], active: 1, lane: [112.5, 414.5]},
  {color: 'blue', x: [262, 301], y: [475, 514], active: 0, lane: [247.5, 414.5]},
];
const SOUND = {
  jump: {file: 'jump'},
  kill: {file: 'kill', times: [13 / 30]},
  bekill: {file: 'be_eaten', times: [0]},
  boom: {file: 'be_bombed', times: [0]},
};
const SAMPLE_RATE = 48_000;
const AUDIO_BITRATE = 48_000;
let spinePromise;
let boardPromise;
const sounds = new Map();

function loadSpine() {
  if (globalThis.spine) return Promise.resolve(globalThis.spine);
  return spinePromise ||= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = new URL('../dice/vendor/spine-webgl.js', import.meta.url);
    script.onload = () => globalThis.spine ? resolve(globalThis.spine) : reject(new Error('Spine 组件加载失败'));
    script.onerror = () => reject(new Error('Spine 组件加载失败'));
    document.head.append(script);
  }).catch(error => {
    spinePromise = null;
    throw error;
  });
}

async function loadImage(url) {
  const image = new Image();
  image.src = url;
  await image.decode();
  return image;
}

async function loadTexture(blob) {
  const url = URL.createObjectURL(blob);
  try {
    return await loadImage(url);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function loadSound(file) {
  if (!sounds.has(file)) {
    sounds.set(file, (async () => {
      const response = await fetch(new URL(`assets/sound/${file}.mp3`, import.meta.url));
      if (!response.ok) throw new Error('棋子音效加载失败');
      return new OfflineAudioContext(1, 1, SAMPLE_RATE).decodeAudioData(await response.arrayBuffer());
    })().catch(error => {
      sounds.delete(file);
      throw error;
    }));
  }
  return sounds.get(file);
}

class TokenCanvasRenderer extends CanvasSpineRenderer {
  texture(region, color) {
    // Rotated atlas regions use the physical crop dimensions. UVs in the rig
    // already describe their rotation, so the source pixels stay in atlas order.
    const crop = region.degrees % 180 === 0 ? region : {...region, width: region.height, height: region.width};
    return super.texture(crop, color);
  }
}

export function tokenHopPose(color, time, duration) {
  const step = Math.max(0, time) / TOKEN_HOP_SECONDS;
  const landed = Math.floor(step + 1e-9);
  const index = (TRACK_START[color] + landed) % TRACK.length;
  const [column, row] = TRACK[index];
  const [nextColumn, nextRow] = TRACK[(index + 1) % TRACK.length];
  // Use the existing jump keyframes, then hold the landing before the next cell.
  const phase = Math.max(0, Math.min(1, (step - landed) / .85));
  const movement = phase * phase * (3 - 2 * phase);
  return {
    x: 22.5 + 22.5 * (column + (nextColumn - column) * movement),
    y: 235 + 22.5 * (row + (nextRow - row) * movement),
    time: phase * duration,
  };
}

export async function createTokenRenderer(canvas, token) {
  const [spine, board, texture, binary] = await Promise.all([
    loadSpine(),
    boardPromise ||= loadImage(new URL('assets/board.webp', import.meta.url)).catch(error => {
      boardPromise = null;
      throw error;
    }),
    loadTexture(token.texture),
    token.skel.arrayBuffer(),
  ]);
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const context = canvas.getContext('2d', {alpha: false});
  if (!context) throw new Error('浏览器无法创建棋盘画布');
  const atlas = new spine.TextureAtlas(token.atlas);
  for (const page of atlas.pages) {
    page.width = texture.naturalWidth;
    page.height = texture.naturalHeight;
  }
  for (const region of atlas.regions) region.updateUVs?.();
  const loader = new spine.AtlasAttachmentLoader(atlas);
  const data = new spine.SkeletonBinary(loader).readSkeletonData(new Uint8Array(binary));
  const animations = new Map(data.animations.map(animation => [animation.name, animation]));
  const actions = [...animations.values()].map(({name, duration}) => ({name, duration}));
  const trail = animations.get('trail');
  const trailSeconds = trail?.duration || 0;
  const trailSkeleton = trail ? new spine.Skeleton(data) : null;
  const pieces = HOMES.flatMap(home => home.y.flatMap(y => home.x.map(x => {
    const skeleton = new spine.Skeleton(data);
    skeleton.setSkinByName(home.color);
    return {skeleton, home, x, y};
  })).map((piece, index) => ({...piece, active: index === home.active})));

  const layer = document.createElement('canvas');
  layer.width = WIDTH;
  layer.height = HEIGHT;
  let gl, scene;
  try {
    const webgl = new spine.ManagedWebGLRenderingContext(layer, {alpha: true, antialias: true, preserveDrawingBuffer: true});
    gl = webgl.gl;
    scene = new spine.SceneRenderer(layer, webgl);
    scene.camera.viewportWidth = WIDTH;
    scene.camera.viewportHeight = HEIGHT;
    scene.camera.position.set(WIDTH / 2, HEIGHT / 2, 0);
    scene.camera.update();
    const gpuTexture = new spine.GLTexture(webgl, texture, false);
    for (const page of atlas.pages) page.setTexture(gpuTexture);
  } catch {
    scene = null;
  }
  let software;
  let disposed = false;
  let audio;
  let soundVersion = 0;
  const audioNodes = new Set();
  const stopSound = () => {
    soundVersion++;
    for (const node of audioNodes) node.stop();
    audioNodes.clear();
  };
  async function playSound({action}) {
    stopSound();
    const sound = SOUND[action];
    if (!sound || disposed) return;
    const version = soundVersion;
    try {
      audio ||= new AudioContext();
      const [, buffer] = await Promise.all([audio.resume(), loadSound(sound.file)]);
      if (version !== soundVersion || disposed) return;
      const start = audio.currentTime;
      for (const time of sound.times || [0]) {
        const node = audio.createBufferSource();
        node.buffer = buffer;
        node.connect(audio.destination);
        audioNodes.add(node);
        node.onended = () => {
          node.disconnect();
          audioNodes.delete(node);
        };
        node.start(start + time);
      }
    } catch {
      // Browser playback policies can block sound. Video export uses offline audio.
    }
  }
  for (const {file} of Object.values(SOUND)) void loadSound(file).catch(() => {});

  function draw({color = 'green', action = 'standby', time = 0} = {}, target = context) {
    if (disposed) throw new Error('棋子素材已替换，请重新导出视频');
    const animation = animations.get(action) || animations.get('standby');
    const elapsed = Math.max(0, time);
    target.drawImage(board, 0, 0, WIDTH, HEIGHT);
    const useWebGL = scene && !gl.isContextLost();
    if (useWebGL) {
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      scene.begin();
    } else {
      software ||= new TokenCanvasRenderer(atlas, texture, {width: WIDTH, height: HEIGHT});
    }
    const active = animation.duration > 0 && pieces.find(piece => piece.home.color === color && piece.active);
    for (const piece of pieces) if (piece !== active) drawPiece(piece);
    if (active && trail && action === 'jump') {
      trailSkeleton.setSkinByName(color);
      const first = Math.max(0, elapsed - trailSeconds);
      // The game plays the original trail clip separately at each departed cell.
      // Its attachment timeline hides the effect instance's own chess piece.
      for (let step = Math.ceil(first / TOKEN_HOP_SECONDS - 1e-9); ; step++) {
        const leftAt = step * TOKEN_HOP_SECONDS;
        if (leftAt >= elapsed) break;
        const {x, y} = tokenHopPose(color, leftAt, 0);
        drawSkeleton(trailSkeleton, x, y, trail, elapsed - leftAt);
      }
    }
    if (active) drawPiece(active, animation);
    if (useWebGL) {
      scene.end();
      target.drawImage(layer, 0, 0);
    }

    function drawPiece({skeleton, home, x, y}, motion) {
      let sampleTime = Math.min(elapsed, motion?.duration || 0);
      if (motion) {
        [x, y] = home.lane;
        if (action === 'jump') {
          const pose = tokenHopPose(color, elapsed, motion.duration);
          sampleTime = pose.time;
          x = pose.x;
          y = pose.y;
        }
      }
      drawSkeleton(skeleton, x, y, motion, sampleTime);
    }

    function drawSkeleton(skeleton, x, y, motion, sampleTime) {
      skeleton.setToSetupPose();
      skeleton.x = x * 2;
      skeleton.y = HEIGHT - y * 2;
      motion?.apply(skeleton, -1, sampleTime, false, null, 1, spine.MixBlend.replace, spine.MixDirection.mixIn);
      skeleton.updateWorldTransform(spine.Physics.pose);
      if (useWebGL) scene.drawSkeleton(skeleton, false);
      else software.draw(target, skeleton, HEIGHT);
    }
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    stopSound();
    void audio?.close().catch(() => {});
    software?.dispose();
    scene?.dispose();
    atlas.dispose();
    layer.width = layer.height = 1;
  }

  return {draw, actions, playSound, stopSound, dispose};
}

async function reviewAudio(action) {
  const sound = SOUND[action];
  if (!sound) return null;
  const clip = await loadSound(sound.file);
  // Leave room for the native and software encoders' AAC padding in the cut.
  const samples = (Math.floor(VIDEO_SECONDS * SAMPLE_RATE / 1024) - 4) * 1024;
  const context = new OfflineAudioContext(1, samples, SAMPLE_RATE);
  const interval = action === 'jump' ? TOKEN_HOP_SECONDS : TOKEN_ROUND_SECONDS;
  const cueTimes = sound.times || [0];
  for (let step = 0; step < VIDEO_SECONDS / interval; step++) {
    for (const time of cueTimes) {
      const node = context.createBufferSource();
      node.buffer = clip;
      node.connect(context.destination);
      node.start(step * interval + time);
    }
  }
  return context.startRendering();
}

async function validateVideo(M, blob, withAudio, signal) {
  const input = new M.Input({source: new M.BlobSource(blob), formats: [M.MP4]});
  try {
    const [video, audio] = await Promise.all([input.getPrimaryVideoTrack(), input.getPrimaryAudioTrack()]);
    if (!video || video.codec !== 'avc' || withAudio !== Boolean(audio) || (audio && audio.codec !== 'aac')) {
      throw new Error('视频编码规格校验失败，请重试');
    }
    const timestamps = [];
    for await (const packet of new M.EncodedPacketSink(video).packets()) {
      signal?.throwIfAborted();
      if (Math.abs(packet.duration - 1 / FPS) > .0001) throw new Error('视频帧率校验失败，请重试');
      timestamps.push(packet.timestamp);
    }
    timestamps.sort((a, b) => a - b);
    if (timestamps.length !== FPS * VIDEO_SECONDS || timestamps.some((time, index) => Math.abs(time - index / FPS) > .0001) ||
        Math.abs(await video.computeDuration() - VIDEO_SECONDS) > .0001 || (audio && await audio.computeDuration() > VIDEO_SECONDS)) {
      throw new Error('视频时长校验失败，请重试');
    }
  } finally {
    input.dispose();
  }
}

export async function recordTokenVideo(renderer, {color, action, soundEnabled = true, onProgress = () => {}, signal} = {}) {
  signal?.throwIfAborted();
  const [M, audio] = await Promise.all([
    import('../vendor/mediabunny/mediabunny.mjs'),
    soundEnabled ? reviewAudio(action) : null,
  ]);
  const videoQuality = new M.Quality({bitrate: 1_700_000});
  const videoOptions = {quality: videoQuality, latencyMode: 'quality', keyFrameInterval: TOKEN_ROUND_SECONDS};
  let codec;
  for (const fullCodecString of ['avc1.640020', 'avc1.4d0020', 'avc1.420020']) {
    signal?.throwIfAborted();
    if (await M.canEncodeVideo('avc', {...videoOptions, width: WIDTH, height: HEIGHT, frameRate: FPS, fullCodecString})) {
      codec = fullCodecString;
      break;
    }
  }
  if (!codec) throw new Error('浏览器无法生成 MP4，请使用最新版 Chrome 或 Edge');
  const audioOptions = {quality: new M.Quality({bitrate: AUDIO_BITRATE})};
  if (audio) {
    const config = {...audioOptions, numberOfChannels: 1, sampleRate: SAMPLE_RATE};
    if (!await M.canEncodeAudio('aac', config)) {
      const {registerAacEncoder} = await import('../vendor/mediabunny-aac/mediabunny-aac-encoder.mjs');
      registerAacEncoder();
      if (!await M.canEncodeAudio('aac', config)) throw new Error('浏览器无法生成 AAC 音轨，请关闭音效后导出');
    }
  }
  signal?.throwIfAborted();
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const context = canvas.getContext('2d', {alpha: false});
  if (!context) throw new Error('浏览器无法创建视频画布');
  const target = new M.BufferTarget();
  const output = new M.Output({format: new M.Mp4OutputFormat({fastStart: 'in-memory'}), target});
  const video = new M.CanvasSource(canvas, {codec: 'avc', fullCodecString: codec, ...videoOptions});
  const sound = audio ? new M.AudioBufferSource({codec: 'aac', ...audioOptions}) : null;
  output.addVideoTrack(video, {frameRate: FPS});
  if (sound) output.addAudioTrack(sound);
  const frameCount = FPS * VIDEO_SECONDS;
  try {
    await output.start();
    const encodeFrames = async () => {
      for (let frame = 0; frame < frameCount; frame++) {
        signal?.throwIfAborted();
        const timestamp = frame / FPS;
        renderer.draw({color, action, time: action === 'jump' ? timestamp : timestamp % TOKEN_ROUND_SECONDS}, context);
        await video.add(timestamp, 1 / FPS, {keyFrame: frame % (FPS * TOKEN_ROUND_SECONDS) === 0});
        if ((frame + 1) % 10 === 0) {
          onProgress(.98 * (frame + 1) / frameCount);
          await new Promise(resolve => setTimeout(resolve, 0));
        }
      }
      video.close();
    };
    const encodeAudio = async () => {
      if (!sound) return;
      await sound.add(audio);
      sound.close();
    };
    const guard = operation => operation.catch(error => {
      void output.cancel().catch(() => {});
      throw error;
    });
    await Promise.all([guard(encodeFrames()), guard(encodeAudio())]);
    await output.finalize();
    signal?.throwIfAborted();
    if (!target.buffer?.byteLength) throw new Error('生成的视频为空，请重试');
    const blob = new Blob([target.buffer], {type: 'video/mp4'});
    await validateVideo(M, blob, Boolean(sound), signal);
    signal?.throwIfAborted();
    onProgress(1);
    return {blob, extension: 'mp4'};
  } catch (error) {
    await output.cancel().catch(() => {});
    throw error;
  } finally {
    canvas.width = canvas.height = 1;
  }
}
