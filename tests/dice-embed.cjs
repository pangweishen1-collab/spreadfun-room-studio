// Parent bridge checks only. No browser, files uploaded, API, provider or deployment.
// Run: node tests/dice-embed.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {File} = require('node:buffer');

const origin = 'https://toolkit.example';
const messages = [], assignments = [], checks = [];
const anchors = [], downloads = [], attached = new Set();
let removals = 0;
const windowHandlers = new Map(), frameHandlers = new Map();
const pasteRegistrations = [];
const contentWindow = {postMessage(data, targetOrigin) { messages.push({data:data.type==='fun-dice-files'?{type:data.type,files:data.files}:JSON.parse(JSON.stringify(data)), targetOrigin}); }};
let source = 'about:blank';
const frame = {contentWindow, style:{}, title:'骰子预览',
  get src() { return source; },
  set src(value) { source=value; assignments.push(value); },
  addEventListener(type, handler) { frameHandlers.set(type, handler); },
};
const sandbox = {
  document:{
    getElementById(id) { assert.equal(id, 'dicePreviewFrame'); return frame; },
    createElement(tag) {
      assert.equal(tag, 'a');
      const link = {href:'', download:'',
        click() { assert.ok(attached.has(this), 'download anchor must be attached before clicking'); downloads.push({url:this.href, fileName:this.download}); },
        remove() { attached.delete(this); removals++; },
      };
      anchors.push(link);
      return link;
    },
    body:{append(link) { attached.add(link); }},
  },
  window:{addEventListener(type, handler) { windowHandlers.set(type, handler); }, UploadPaste:{register(config) { pasteRegistrations.push(config); }}},
  location:{origin},
  File,
};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../dice-embed.js'), 'utf8'), sandbox);
const bridge = sandbox.window.DicePreview;
const last = () => messages.at(-1);
const emit = (data, eventOrigin=origin, eventSource=contentWindow) => windowHandlers.get('message')({data, origin:eventOrigin, source:eventSource});
assert.equal(pasteRegistrations.length, 1);
const paste = pasteRegistrations[0];
assert.equal(paste.zone, frame);
assert.equal(paste.isActive(), false);

assert.equal(assignments.length, 0, 'initial navigation must not eagerly load dice');
frameHandlers.get('load')();
bridge.setActive(false);
bridge.setLanguage('zh');
assert.equal(assignments.length, 0);
assert.equal(messages.length, 0, 'an unloaded frame must not receive context');
assert.equal(frame.title, '骰子预览');
checks.push('lazy_initial_load_and_language_before_activation');

bridge.setActive(true);
assert.deepEqual(assignments, ['/dice/index.html?embedded=1&lang=zh']);
assert.deepEqual(last(), {data:{type:'fun-dice-context', active:true, language:'zh'}, targetOrigin:origin});
bridge.setActive(true);
assert.equal(assignments.length, 1, 'click plus hashchange must not reload the frame');
checks.push('first_activation_loads_once_with_latest_language');

bridge.setActive(false);
assert.equal(last().data.active, false, 'leaving dice must deliver inactive state');
bridge.setLanguage('en');
assert.equal(frame.title, 'Dice preview');
assert.deepEqual(last().data, {type:'fun-dice-context', active:false, language:'en'});
bridge.setActive(true);
assert.equal(last().data.active, true);
assert.equal(assignments.length, 1, 'returning must retain iframe state and selected files');
assert.equal(frame.contentWindow, contentWindow);
checks.push('leave_return_and_language_preserve_the_same_frame');

bridge.setActive(false);
bridge.setLanguage('zh');
const beforeLoad = messages.length;
frameHandlers.get('load')();
emit({type:'fun-dice-ready'});
assert.equal(messages.length, beforeLoad+2, 'load and ready must replay context after the child is listening');
assert.deepEqual(last().data, {type:'fun-dice-context', active:false, language:'zh'});
checks.push('load_and_ready_replay_latest_hidden_context');

const beforeRejected = messages.length;
emit({type:'fun-dice-ready'}, 'https://other.example');
emit({type:'fun-dice-ready'}, origin, {});
emit({type:'fun-dice-ready'}, origin, null);
assert.equal(messages.length, beforeRejected, 'wrong origins or other windows must not receive context');
emit({type:'fun-dice-height', height:900}, 'https://other.example');
emit({type:'fun-dice-height', height:900}, origin, {});
assert.equal(frame.style.height, undefined, 'untrusted height messages must be ignored');
checks.push('origin_and_source_are_both_required');

emit({type:'fun-dice-height', height:812.2});
assert.equal(frame.style.height, '813px');
emit({type:'fun-dice-height', height:1});
assert.equal(frame.style.height, '480px');
emit({type:'fun-dice-height', height:99999});
assert.equal(frame.style.height, '6000px');
for (const height of [Infinity, NaN, '900', undefined]) emit({type:'fun-dice-height', height});
emit({type:'unrelated', height:500});
emit(undefined);
assert.equal(frame.style.height, '6000px', 'only finite numeric height messages may change layout');
checks.push('height_rounding_bounds_and_invalid_payloads');

bridge.setLanguage('invalid');
assert.equal(frame.title, 'Dice preview');
assert.equal(last().data.language, 'en');
assert.ok(messages.every(message => message.targetOrigin===origin), 'outbound messages must never use a wildcard origin');
assert.equal(assignments.length, 1);
checks.push('language_normalization_and_explicit_target_origin');

const fileA = new File([new Uint8Array([9,8,7])], 'sz_1.png', {type:'image/png',lastModified:123});
const fileB = new File([new Uint8Array([1,2,3])], '2.png', {type:'image/png',lastModified:456});
const beforeInactivePaste = messages.length;
assert.equal(paste.isActive(), false);
paste.onFiles([fileA]);
assert.equal(messages.length, beforeInactivePaste, 'Inactive tools must not forward files');
bridge.setActive(true);
assert.equal(paste.isActive(), true);
const liveFiles = {0:fileA,1:fileB,length:2};
paste.onFiles(liveFiles);
const forwarded = last();
liveFiles[0] = fileB; liveFiles.length = 0;
assert.equal(forwarded.data.type, 'fun-dice-files');
assert.equal(forwarded.targetOrigin, origin);
assert.equal(forwarded.data.files.length, 2, 'A live list is snapshotted synchronously');
assert.equal(forwarded.data.files[0], fileA, 'Original File bytes/reference are retained');
assert.equal(forwarded.data.files[1], fileB);
assert.deepEqual(Array.from(forwarded.data.files, file => [file.name,file.type,file.lastModified]), [['sz_1.png','image/png',123],['2.png','image/png',456]]);
const beforeInvalidPaste = messages.length;
for (const files of [null,[],[{}],[fileA,{}],new Array(2)]) paste.onFiles(files);
assert.equal(messages.length, beforeInvalidPaste, 'Only nonempty File snapshots may be forwarded');
bridge.setActive(false);
assert.equal(paste.isActive(), false);
checks.push('parent_paste_routes_only_active_loaded_file_snapshots_with_unchanged_files_and_explicit_origin');

emit({type:'fun-dice-download', url:'blob:'+origin+'/video-id', fileName:'仙人掌.mp4'});
emit({type:'fun-dice-download', url:'blob:'+origin+'/zip-id', fileName:'仙人掌素材.zip'});
assert.deepEqual(downloads, [
  {url:'blob:'+origin+'/video-id', fileName:'仙人掌.mp4'},
  {url:'blob:'+origin+'/zip-id', fileName:'仙人掌素材.zip'},
]);
assert.equal(anchors.length, 2);
assert.equal(removals, 2, 'both temporary download anchors must be removed');
assert.equal(attached.size, 0);
checks.push('valid_same_origin_mp4_and_zip_downloads_use_parent_anchors');

const validDownload = {type:'fun-dice-download', url:'blob:'+origin+'/other-id', fileName:'clip.mp4'};
emit(validDownload, 'https://other.example');
emit(validDownload, origin, {});
emit({...validDownload, url:origin+'/clip.mp4'});
emit({...validDownload, url:'http://toolkit.example/clip.mp4'});
emit({...validDownload, url:'blob:https://other.example/clip-id'});
emit({...validDownload, url:'blob:'+origin+'.evil/clip-id'});
emit({...validDownload, fileName:'clip.exe'});
emit({...validDownload, fileName:'clip.mp4.exe'});
emit({...validDownload, fileName:'x'.repeat(101)+'.mp4'});
emit({...validDownload, fileName:null});
emit({...validDownload, url:null});
assert.equal(downloads.length, 2, 'invalid downloads must not be clicked');
assert.equal(anchors.length, 2, 'invalid downloads must not create anchors');
assert.equal(removals, 2);
assert.equal(attached.size, 0);
checks.push('download_rejects_foreign_messages_http_urls_origin_lookalikes_and_invalid_filenames');

const report = {ok:true, count:checks.length, checks,
  boundary:'Parent bridge uses mocked iframe/messages. Child renderer suspension, height stability and mobile layout require real browser checks.'};
module.exports = report;
console.log(JSON.stringify(report));
