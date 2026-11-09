import { VIDEO_SPEC } from './video-export.mjs';
import { CanvasSpineRenderer } from './six-face/canvas-spine.mjs';

const loadImage = src => new Promise((resolve, reject) => {
  const image = new Image();
  image.onload = () => resolve(image);
  image.onerror = () => reject(new Error('图片加载失败，请重新生成候选包'));
  image.src = src;
});

const previewGrade = candidate => (candidate.previewGrade || candidate.template) === 'purple' ? 'purple' : 'green';
const referenceCandidate = candidate => candidate?.kind === 'purple-reference';
const generatedCandidate = candidate => candidate?.kind === 'six-face' || candidate?.kind === 'purple-gyro' || referenceCandidate(candidate);
const readAsset = (url, type, message) => fetch(url).then(response => {
  if (!response.ok) throw new Error(message);
  return response[type]();
});
const PURPLE_PRESENTATION_SCALE = 1.15;
const GRID_X = [198, 363, 529];
const GRID_Y = [1600 - 720, 1600 - 903];
const GRID_GAP = 8;
const CELL_HALF_WIDTH = (Math.min(GRID_X[1] - GRID_X[0], GRID_X[2] - GRID_X[1]) - GRID_GAP) / 2;
const CELL_HALF_HEIGHT = (GRID_Y[0] - GRID_Y[1] - GRID_GAP) / 2;

function gridCellFit(skeleton, centerX, centerY, vertices) {
  let horizontal = 0, vertical = 0;
  for (const slot of skeleton.drawOrder) {
    const attachment = slot.getAttachment();
    if (!slot.bone.active || !attachment?.region || slot.color.a * attachment.color.a === 0) continue;
    const count = attachment.worldVerticesLength || 8;
    if (attachment.worldVerticesLength) attachment.computeWorldVertices(slot, 0, count, vertices, 0, 2);
    else attachment.computeWorldVertices(slot, vertices, 0, 2);
    for (let i = 0; i < count; i += 2) {
      horizontal = Math.max(horizontal, Math.abs(vertices[i] - centerX));
      vertical = Math.max(vertical, Math.abs(vertices[i + 1] - centerY));
    }
  }
  return Math.min(1, CELL_HALF_WIDTH / horizontal, CELL_HALF_HEIGHT / vertical);
}

const backgroundImages = new Map();
const loadBackground = candidate => {
  const src = previewGrade(candidate) === 'purple' ? '/dice/assets/ui/bg_紫.webp' : '/dice/assets/ui/bg_绿.webp';
  if (!backgroundImages.has(src)) {
    const pending = loadImage(src).catch(error => {
      backgroundImages.delete(src);
      throw error;
    });
    backgroundImages.set(src, pending);
  }
  return backgroundImages.get(src);
};
const sameAssets = (current, next) => current && next &&
  current.kind === next.kind &&
  ['skel', 'atlas', 'texture', 'atlasPage'].every(key => current[key] === next[key]) &&
  current.png?.['大骰子'] === next.png?.['大骰子'];

// A round is exactly 60 frames (two seconds) at 30fps.
export const loopFrameState = (frame, mode, target) => {
  const index = Math.max(0, Math.floor(frame));
  const sequence = Math.floor(index / 60);
  return {
    elapsed: (index % 60) / 30,
    sequence,
    points: mode === 'all' ? [1, 2, 3, 4, 5, 6] : [mode === 'continuous' ? sequence % 6 + 1 : Number(target)],
    timestamp: Math.round(index * 1_000_000 / 30),
    duration: Math.round((index + 1) * 1_000_000 / 30) - Math.round(index * 1_000_000 / 30),
  };
};

export class GameRenderer {
  constructor(canvas, onStatus = () => {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.layer = document.createElement('canvas');
    this.layer.width = 720;
    this.layer.height = 1600;
    try { this.context = new spine.ManagedWebGLRenderingContext(this.layer, { alpha: true, preserveDrawingBuffer: true, antialias: true });
    this.gl = this.context.gl;
    this.scene = new spine.SceneRenderer(this.layer, this.context);
    this.scene.camera.viewportWidth = 720;
    this.scene.camera.viewportHeight = 1600;
    this.scene.camera.position.set(360, 800, 0);
    this.scene.camera.update();
    } catch { this.context = this.gl = this.scene = null; }
    if (!this.ctx) throw new Error('浏览器无法创建预览画布');
    this.layer.addEventListener?.('webglcontextlost', event => {
      event.preventDefault(); this.gpuLost = true;
      if (!generatedCandidate(this.candidate)) this.pause();
    });
    this.onStatus = onStatus;
    this.mode = 'all';
    this.target = 1;
    this.elapsed = 1.3;
    this.playing = false;
    this.autoLoop = false;
    this.loopSeconds = 2;
    this.visible = true;
    this.sequence = 0;
    this.last = performance.now();
    this.loadId = 0;
    this.presentationId = 0;
    this.gridVertices = [];
    for (const previewGrade of ['green', 'purple']) void loadBackground({previewGrade}).catch(() => {});
    this.tick = this.tick.bind(this);
    requestAnimationFrame(this.tick);
    document.addEventListener('visibilitychange', () => { this.last = performance.now(); });
  }

  get visible() { return this._visible; }
  set visible(value) { this._visible=Boolean(value); if (!value) this.onStatus?.({playing:false}); }

  async load(candidate) {
    const id = ++this.loadId;
    const presentationId = ++this.presentationId;
    let assets, software, data;
    try {
      let atlas, texture;
      if (generatedCandidate(candidate)) {
        const reference = referenceCandidate(candidate);
        const useBitmap = reference && typeof createImageBitmap === 'function';
        const [text, imageSource, binary] = await Promise.all([
          readAsset(candidate.atlas, 'text', '图集读取失败'),
          useBitmap ? readAsset(candidate.texture, 'blob', '图集纹理读取失败') : loadImage(candidate.texture),
          reference ? readAsset(candidate.skel, 'arrayBuffer', 'Spine 动画读取失败') : null,
        ]);
        atlas = new spine.TextureAtlas(text);
        const image = useBitmap
          ? await createImageBitmap(imageSource, {premultiplyAlpha:'none',colorSpaceConversion:'none'})
          : imageSource;
        texture = image;
        let gpu;
        assets = {dispose() { gpu?.dispose(); image.close?.(); }};
        if (this.context && !this.gpuLost) {
          gpu = new spine.GLTexture(this.context, image, false);
          for (const page of atlas.pages) page.setTexture(gpu);
        } else {
          // Canvas projection uses the same skeleton and six result faces.
          for (const page of atlas.pages) {
            page.width = image.naturalWidth ?? image.width;
            page.height = image.naturalHeight ?? image.height;
          }
          for (const region of atlas.regions) region.updateUVs?.();
        }
        const loader = new spine.AtlasAttachmentLoader(atlas);
        data = reference
          ? new spine.SkeletonBinary(loader).readSkeletonData(new Uint8Array(binary))
          : new spine.SkeletonJson(loader).readSkeletonData(candidate.json);
        software = new CanvasSpineRenderer(atlas, texture, {width:720,height:1600});
      } else {
        if (!this.context || this.gpuLost) throw new Error('紫色动画需要 WebGL，请刷新或使用最新版 Chrome');
        assets = new spine.AssetManager(this.context);
        assets.loadBinary(candidate.skel);
        assets.loadTextureAtlas(candidate.atlas, undefined, undefined, candidate.atlasPage ? {[candidate.atlasPage]:candidate.texture} : undefined);
        await assets.loadAll();
        if (assets.hasErrors()) throw new Error('动画资源加载失败：' + JSON.stringify(assets.getErrors()));
        atlas = assets.require(candidate.atlas);
        data = new spine.SkeletonBinary(new spine.AtlasAttachmentLoader(atlas)).readSkeletonData(assets.require(candidate.skel));
      }
      const [background, icon] = await Promise.all([
        loadBackground(candidate),
        candidate.icon || candidate.png['大骰子'] ? loadImage(candidate.icon || candidate.png['大骰子']) : Promise.resolve(null),
      ]);
      if (id !== this.loadId || presentationId !== this.presentationId) { assets?.dispose(); software?.dispose(); return false; }
      const previous = {assets:this.assets,software:this.software,candidate:this.candidate,background:this.background,icon:this.icon,data:this.data,skeletons:this.skeletons};
      Object.assign(this, {assets, software, candidate, background, icon, data,
        skeletons:Array.from({length:6}, () => new spine.Skeleton(data))});
      try { this.draw(); }
      catch (error) { Object.assign(this, previous); throw error; }
      previous.assets?.dispose(); previous.software?.dispose();
    } catch (error) { assets?.dispose(); software?.dispose(); throw error; }

    this.elapsed = 1.3;
    this.playing = false;
    this.draw();
    this.status();
    return true;
  }

  // Name/grade changes keep the runtime and its live playback position intact.
  // The old complete frame stays visible until the new background is ready.
  async patchPresentation(candidate) {
    if (!this.data || this.recording || !sameAssets(this.candidate, candidate)) return false;
    const id = ++this.presentationId, loadId = this.loadId;
    const background = await loadBackground(candidate);
    if (id !== this.presentationId || loadId !== this.loadId || !this.data ||
        this.recording || !sameAssets(this.candidate, candidate)) return false;
    this.candidate = candidate;
    this.background = background;
    this.draw();
    this.status();
    return true;
  }

  configure(mode, target) {
    if (this.recordingLoop) return false;
    this.mode = mode;
    this.target = Number(target);
    this.sequence = 0;
    this.elapsed = 1.3;
    this.playing = false;
    this.draw();
    this.status();
  }

  setLooping(enabled = true, seconds = 2) {
    if (this.recordingLoop) return false;
    if (!Number.isFinite(seconds) || seconds <= 0) throw new RangeError('循环时长须大于0秒');
    this.autoLoop = Boolean(enabled);
    this.loopSeconds = seconds;
    this.stopAfterRound = false;
    return true;
  }

  clear() {
    this.loadId += 1;
    this.presentationId += 1;
    this.playing = false;
    this.data = null;
    this.candidate = null;
    this.assets?.dispose();
    this.assets = null;
    this.software?.dispose(); this.software = null;
    this.ctx.clearRect(0, 0, 720, 1600);
  }

  play() {
    if (!this.data || this.recordingLoop) return false;
    this.stopAfterRound = false;
    this.elapsed = 0;
    this.playing = true;
    this.last = performance.now();
    this.status();
    return true;
  }
  pause() {
    if (this.recordingLoop) return false;
    if (this.autoLoop) { this.playing = false; this.stopAfterRound = false; }
    else if (this.mode === 'continuous' && this.playing && this.elapsed < 0.64) this.stopAfterRound = true;
    else this.playing = false;
    this.status();
  }
  reset() { if (this.recordingLoop) return false; this.sequence = 0; this.stopAfterRound = false; this.play(); }

  status() {
    this.onStatus({ playing: this.playing, mode: this.mode, target: this.mode === 'continuous' ? this.sequence % 6 + 1 : this.target, elapsed: this.elapsed });
  }

  tick(now) {
    const delta = Math.min((now - this.last) / 1000, 0.1);
    this.last = now;
    if (this.recordingLoop) {
      // Offline encoding owns every draw. The realtime fallback alone uses RAF.
      if (!this.offlineEncoding && this.data && this.visible && !document.hidden) {
        try {
          this.recordingCheck?.();
          this.drawLoopFrame(Math.floor((now - this.recordingStarted) * 30 / 1000));
        } catch (error) { this.recordingAbort?.(error); }
      }
      requestAnimationFrame(this.tick);
      return;
    }
    if (this.data && this.visible && !document.hidden) {
      if (this.playing) {
        this.elapsed += delta;
        const roundSeconds = this.autoLoop ? this.loopSeconds : 1.4;
        if (this.elapsed >= roundSeconds) {
          if ((this.autoLoop || this.mode === 'continuous') && !this.stopAfterRound) {
            this.sequence += 1;
            this.elapsed = this.autoLoop ? this.elapsed % roundSeconds : 0;
          } else {
            this.elapsed = roundSeconds;
            this.playing = false;
            this.stopAfterRound = false;
          }
          this.status();
        }
      }
      if (this.recording || this.playing || this.elapsed >= 1.4 && this.wasPlaying) this.draw();
      this.wasPlaying = this.playing;
    }
    requestAnimationFrame(this.tick);
  }

  draw(time = this.elapsed) {
    if (!this.data) return;
    const purple = previewGrade(this.candidate) === 'purple';
    const gpu = this.context && !this.gpuLost && !this.gl.isContextLost?.();
    const gl = this.gl;
    if (gpu) { gl.viewport(0, 0, 720, 1600);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT); }
    const ctx = this.ctx;
    ctx.clearRect(0, 0, 720, 1600);
    ctx.drawImage(this.background, 0, 0, 720, 1600);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.font = '900 32px Arial, "PingFang SC", sans-serif';
    ctx.lineWidth = 5;
    ctx.strokeStyle = purple ? '#6c2ba3' : '#337731';
    const title = this.candidate.name.length > 10 ? this.candidate.name.slice(0, 10) + '…' : this.candidate.name;
    ctx.strokeText(title, 412, 468, 232);
    ctx.fillStyle = '#fff';
    ctx.fillText(title, 412, 468, 232);
    if (this.icon) {
      ctx.drawImage(this.icon, 65, 335, 240, 240);
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(259, 520, 23, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#343b45'; ctx.beginPath(); ctx.moveTo(253, 509); ctx.lineTo(253, 531); ctx.lineTo(270, 520); ctx.closePath(); ctx.fill();
    }

    const all = this.mode === 'all';
    const selected = this.mode === 'continuous' ? this.sequence % 6 + 1 : this.target;
    const reference = referenceCandidate(this.candidate);
    // Spine attachment keys are Float32 in the package. Match their precision
    // before sampling so a boundary frame uses the same image in preview.
    const animationTime = reference ? Math.fround(time) : time;
    const presentationGain = this.candidate.template === 'purple' ? PURPLE_PRESENTATION_SCALE : 1;
    const count = all ? 6 : 1;
    let gridFit = 1;
    for (let index = 0; index < count; index++) {
      const skeleton = this.skeletons[index];
      const point = all ? index + 1 : selected;
      const centerX = all ? GRID_X[index % 3] : 363;
      const centerY = all ? GRID_Y[Math.floor(index / 3)] : 1600 - 810;
      skeleton.setToSetupPose();
      const animation = this.data.findAnimation('spin_' + point);
      animation.apply(skeleton, -1, Math.min(animationTime, animation.duration), false, null, 1, spine.MixBlend.replace, spine.MixDirection.mixIn);
      skeleton.x = centerX;
      skeleton.y = centerY;
      if (reference) {
        skeleton.scaleX = skeleton.scaleY = all ? .86 : 1.5;
      } else if (generatedCandidate(this.candidate)) {
        const {crop,sourceSize,cropOffset} = this.candidate.geometry;
        const ratio = Math.max(crop[2],crop[3])/sourceSize;
        const size = (all ? 172 : 300) * Math.min(1,.655/ratio) * presentationGain;
        skeleton.scaleX = skeleton.scaleY = size/200;
        skeleton.x -= cropOffset[0]*size/sourceSize;
        skeleton.y += cropOffset[1]*size/sourceSize;
      } else skeleton.scaleX = skeleton.scaleY = (all ? 0.9 : 1.6) * presentationGain;
      skeleton.updateWorldTransform(spine.Physics.update);
      if (all) gridFit = Math.min(gridFit, gridCellFit(skeleton, centerX, centerY, this.gridVertices));
    }

    if (gpu) this.scene.begin();
    for (let index = 0; index < count; index++) {
      const skeleton = this.skeletons[index];
      // Apply one fit to the whole grid, around each cell's visual center.
      if (gridFit < 1) {
        const centerX = GRID_X[index % 3], centerY = GRID_Y[Math.floor(index / 3)];
        skeleton.x = centerX + (skeleton.x - centerX) * gridFit;
        skeleton.y = centerY + (skeleton.y - centerY) * gridFit;
        skeleton.scaleX *= gridFit;
        skeleton.scaleY *= gridFit;
        skeleton.updateWorldTransform(spine.Physics.pose);
      }
      if (gpu) this.scene.drawSkeleton(skeleton, false);
      else this.software?.draw(ctx, skeleton, 1600);
    }
    if (gpu) { this.scene.end(); ctx.drawImage(this.layer, 0, 0); }
  }

  async record(seconds = 4.2) {
    this.validateRecording(seconds);
    this.recording = true;
    try { return await this.recordRealtime(seconds); }
    finally { this.recording = false; }
  }

  validateRecording(seconds) {
    if (!this.data) throw new Error('请等待资源加载完成');
    if (document.hidden) throw new Error('当前页面在后台，请保持此页可见后再录制');
    if (this.recording) throw new Error('正在录制视频，请等待完成');
    if (!Number.isFinite(seconds) || seconds <= 0 || seconds >= 30) throw new Error('录制时长须大于0且小于30秒');
  }

  drawLoopFrame(frame) {
    const state = loopFrameState(frame, this.mode, this.target);
    this.sequence = state.sequence;
    this.elapsed = state.elapsed;
    this.draw(state.elapsed);
    return state;
  }

  async loopEncoderConfig(baselineOnly = false) {
    if (typeof VideoEncoder === 'undefined' || typeof VideoFrame === 'undefined') return null;
    const codecs = baselineOnly ? ['avc1.420028'] : ['avc1.640028', 'avc1.4d0028', 'avc1.420028'];
    for (const codec of codecs) for (const hardwareAcceleration of ['prefer-hardware', 'no-preference']) {
      const config = {
        codec, width: 720, height: 1600,
        framerate: 30, bitrate: VIDEO_SPEC.bitrate, hardwareAcceleration,
        // Quality mode preserves every frame; prefer more efficient AVC profiles.
        latencyMode: 'quality', avc: { format: 'annexb' },
      };
      try {
        const result = await VideoEncoder.isConfigSupported(config);
        if (result.supported && result.config.avc?.format === 'annexb') return config;
      } catch {}
    }
    return null;
  }

  async recordLoop(seconds = 6, baselineOnly = false) {
    this.validateRecording(seconds);
    const saved = Object.fromEntries(['mode', 'target', 'elapsed', 'sequence', 'playing', 'stopAfterRound', 'wasPlaying'].map(key => [key, this[key]]));
    const sourceData = this.data, sourceLoad = this.loadId;
    let encoder, watchdog, abortError, rejectFailure, retryBaseline = false;
    const failure = new Promise((_, reject) => { rejectFailure = reject; });
    // Error signals can arrive during a synchronous draw batch, before its await.
    failure.catch(() => {});
    const abort = error => {
      if (!abortError) {
        abortError = error;
        this.cancelLoopRecording?.(error);
        rejectFailure(error);
      }
    };
    const check = () => {
      if (abortError) throw abortError;
      if (document.hidden || !this.visible) throw new Error('录制期间页面被切到后台，请保持此页可见后重试');
      if (this.data !== sourceData || this.loadId !== sourceLoad) throw new Error('录制素材已变化，请重新导出视频');
    };
    const checkVisibility = () => { if (document.hidden) abort(new Error('录制期间页面被切到后台，请保持此页可见后重试')); };
    const wait = operation => Promise.race([operation, failure]);
    this.recording = true;
    this.recordingLoop = true;
    this.offlineEncoding = true;
    this.playing = false;
    this.stopAfterRound = false;
    this.recordingCheck = check;
    this.recordingAbort = abort;
    document.addEventListener('visibilitychange', checkVisibility);
    watchdog = setTimeout(() => abort(new Error('视频录制超时，请重试')), 30_000);
    try {
      const config = await wait(this.loopEncoderConfig(baselineOnly));
      check();
      if (!config) {
        this.offlineEncoding = false;
        const blob = await wait(this.recordRealtime(seconds, true));
        check();
        return blob;
      }
      const chunks = [];
      let lastTimestamp = -1;
      encoder = new VideoEncoder({
        output: chunk => {
          if (abortError) return;
          if (chunk.timestamp <= lastTimestamp || (!chunks.length && chunk.type !== 'key')) {
            abort(Object.assign(new Error('视频编码帧顺序异常，请重试'), {retryBaseline:config.codec !== 'avc1.420028'}));
            return;
          }
          lastTimestamp = chunk.timestamp;
          const bytes = new Uint8Array(chunk.byteLength);
          chunk.copyTo(bytes);
          chunks.push(bytes);
        },
        error: () => abort(new Error('视频编码失败，请重试')),
      });
      encoder.configure(config);
      const frames = Math.round(seconds * 30);
      for (let index = 0; index < frames; index++) {
        check();
        const state = this.drawLoopFrame(index);
        const frame = new VideoFrame(this.canvas, { timestamp: state.timestamp, duration: state.duration });
        try { encoder.encode(frame, { keyFrame: index % 60 === 0 }); }
        finally { frame.close(); }
        // Bound in-flight frames and yield without waiting for video wall time.
        if (encoder.encodeQueueSize >= 4) await wait(encoder.flush());
        if (index % 8 === 7) await wait(new Promise(resolve => setTimeout(resolve, 0)));
      }
      await wait(encoder.flush());
      check();
      if (chunks.length !== frames) throw new Error('视频编码帧数不完整，请重试');
      return new Blob(chunks, { type: 'video/h264' });
    } catch (error) {
      if (!baselineOnly && error?.retryBaseline) retryBaseline = true;
      else throw error;
    } finally {
      clearTimeout(watchdog);
      document.removeEventListener('visibilitychange', checkVisibility);
      if (encoder && encoder.state !== 'closed') encoder.close();
      this.recording = false;
      this.recordingLoop = false;
      this.offlineEncoding = false;
      this.recordingCheck = this.recordingAbort = null;
      if (this.data === sourceData && this.loadId === sourceLoad) {
        Object.assign(this, saved);
        this.last = performance.now();
        this.draw();
        this.status();
      }
    }
    // Some implementations reorder High/Main frames. Retry Baseline once only
    // after restoring the preview and releasing the first encoder's resources.
    if (retryBaseline) return this.recordLoop(seconds, true);
  }

  async recordRealtime(seconds, loop = false) {
    if (typeof MediaRecorder === 'undefined' || typeof this.canvas.captureStream !== 'function') throw new Error('当前浏览器不支持视频录制，请使用 Chrome');
    const mime = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/mp4', 'video/webm'].find(type => MediaRecorder.isTypeSupported(type));
    if (!mime) throw new Error('当前浏览器没有可用的视频编码器');
    let stream, recorder, stopTimer, watchdog, checkVisibility;
    try {
      if (loop) this.drawLoopFrame(0);
      stream = this.canvas.captureStream(30);
      recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: loop ? VIDEO_SPEC.bitrate : 6_000_000 });
      return await new Promise((resolve, reject) => {
        const chunks = [];
        let settled = false, stopRequested = false;
        const fail = error => {
          if (settled) return;
          settled = true;
          reject(error);
          try { if (recorder.state !== 'inactive') recorder.stop(); } catch {}
        };
        if (loop) this.cancelLoopRecording = fail;
        recorder.ondataavailable = event => { if (!settled && event.data.size) chunks.push(event.data); };
        recorder.onerror = () => fail(new Error('视频录制失败'));
        recorder.onstop = () => {
          if (settled) return;
          if (!stopRequested) return fail(new Error('视频录制意外中断，请重试'));
          settled = true;
          resolve(new Blob(chunks, { type: mime }));
        };
        checkVisibility = () => {
          if (document.hidden) fail(new Error('录制期间页面被切到后台，请保持此页可见后重试'));
        };
        document.addEventListener('visibilitychange', checkVisibility);
        if (loop) this.recordingStarted = performance.now();
        else this.reset();
        recorder.start(250);
        stopTimer = setTimeout(() => {
          if (settled) return;
          if (recorder.state === 'inactive') return fail(new Error('视频录制意外中断，请重试'));
          stopRequested = true;
          try { recorder.stop(); } catch { fail(new Error('视频录制失败')); }
        }, seconds * 1000);
        watchdog = setTimeout(() => fail(new Error('视频录制超时，请重试')), 30_000);
      });
    } finally {
      clearTimeout(stopTimer);
      clearTimeout(watchdog);
      if (checkVisibility) document.removeEventListener('visibilitychange', checkVisibility);
      if (recorder) {
        recorder.ondataavailable = recorder.onerror = recorder.onstop = null;
        try { if (recorder.state !== 'inactive') recorder.stop(); } catch {}
      }
      stream?.getTracks().forEach(track => track.stop());
      if (loop) this.cancelLoopRecording = null;
    }
  }
}
