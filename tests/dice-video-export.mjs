// Optional local integration check. FFmpeg is used only to inspect/create test
// fixtures, never by the shipped browser module. No website or service is changed.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtemp, readFile, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {prepareVideo, inspectVideo, VIDEO_SPEC} from '../dice/video-export.mjs';

const fixture = process.argv[2] || '/Users/muzi/Documents/Codex/2026-11-03/wo1/outputs/骰子预览-仙人掌-6秒循环.mp4';
const ffmpeg = process.argv[3] || '/Applications/VapToolMac.app/Contents/Java/mac/ffmpeg';
const run = args => execFileSync(ffmpeg, ['-v', 'error', '-nostdin', ...args], {maxBuffer: 64 * 1024 * 1024});
const annex = (file, count) => run(['-i', file, '-map', '0:v:0', '-an', '-c:v', 'copy', ...(count ? ['-frames:v', String(count)] : []), '-bsf:v', 'h264_mp4toannexb', '-f', 'h264', 'pipe:1']);
const hashFrames = file => run(['-i', file, '-map', '0:v:0', '-an', '-pix_fmt', 'rgb24', '-f', 'framemd5', 'pipe:1']).toString().split('\n').filter(line => line && !line.startsWith('#')).map(line => line.split(',').at(-1).trim());
function slices(bytes) {
  const starts = [];
  for (let index = 0; index + 3 < bytes.length; index++) {
    if (bytes[index] || bytes[index + 1]) continue;
    const size = bytes[index + 2] === 1 ? 3 : bytes[index + 2] === 0 && bytes[index + 3] === 1 ? 4 : 0;
    if (size) { starts.push([index, index + size]); index += size - 1; }
  }
  return starts.flatMap((start, index) => {
    let end = starts[index + 1]?.[0] ?? bytes.length;
    while (bytes[end - 1] === 0) end--;
    return [1, 5].includes(bytes[start[1]] & 31) ? [bytes.subarray(start[1], end).toString('hex')] : [];
  });
}
const folder = await mkdtemp(path.join(tmpdir(), 'dice-video-export-'));
try {
  const original = await readFile(fixture), raw = annex(fixture), inputBytes = Buffer.from(raw);
  const started = performance.now(), output = await prepareVideo(new Blob([raw], {type: 'video/h264'}));
  const muxMs = performance.now() - started, target = path.join(folder, 'copied.mp4');
  await writeFile(target, new Uint8Array(await output.arrayBuffer()));
  assert.equal(output.type, 'video/mp4');
  assert.equal(output.videoInfo.method, 'h264_copy_mux');
  assert.ok(Object.isFrozen(output.videoInfo));
  for (const name of ['width','height','fps','frameCount','duration','profile']) assert.equal(output.videoInfo[name], VIDEO_SPEC[name]);
  assert.deepEqual(raw, inputBytes, 'Source Annex B bytes are not changed');
  assert.deepEqual(slices(annex(target)), slices(raw), 'Every compressed picture slice is copied unchanged');
  const decoded = hashFrames(target);
  assert.equal(decoded.length, 180);
  assert.deepEqual(decoded, hashFrames(fixture), 'All decoded RGB frames remain identical');
  const info = await inspectVideo(output);
  assert.equal(info.frameCount, 180); assert.equal(info.duration, 6); assert.equal(info.fps, 30);
  assert.equal(info.constantFrameRate, true);
  const passthrough = await prepareVideo(new Blob([original], {type: 'video/mp4'}));
  assert.equal(passthrough.videoInfo.method, 'mp4_passthrough');
  assert.deepEqual(Buffer.from(await passthrough.arrayBuffer()), original);
  await assert.rejects(prepareVideo(new Blob([], {type: 'video/h264'})), /为空/);
  await assert.rejects(prepareVideo(new Blob([raw], {type: 'image/png'})), /不支持/);
  await assert.rejects(prepareVideo(new Blob([new Uint8Array([1,2,3,4,5])], {type: 'video/h264'})), /Annex B/);
  await assert.rejects(prepareVideo(new Blob([new Uint8Array([0,0,0,1,7])], {type: 'video/h264'})), /不完整/);
  await assert.rejects(prepareVideo(new Blob([annex(fixture, 179)], {type: 'video/h264'})), /180 帧/);
  await assert.rejects(prepareVideo(new Blob([raw, new Uint8Array([0,0,0,1,0x41,0xA0])], {type: 'video/h264'})), /重排序帧/);
  const wrongSize = run(['-f','lavfi','-i','color=c=red:s=320x640:r=30','-t','6','-c:v','libx264','-profile:v','baseline','-bf','0','-preset','ultrafast','-f','h264','pipe:1']);
  await assert.rejects(prepareVideo(new Blob([wrongSize], {type: 'video/h264'})), /720 × 1600/);
  console.log(JSON.stringify({passed: true, nativeMuxMs: Math.round(muxMs), width: 720, height: 1600, fps: 30, frameCount: 180, duration: 6, compressedSlicesUnchanged: true, decodedFramesUnchanged: true, checks: 13, browserFallbackNotExercised: true}));
} finally { await rm(folder, {recursive: true, force: true}); }
