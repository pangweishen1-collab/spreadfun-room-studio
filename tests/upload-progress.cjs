const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = readFileSync(path.join(__dirname, '../upload-progress.js'), 'utf8');
const timers = new Map();
const pageEvents = new Map();
let nextTimer = 0;
let dialog;
function element(tag) {
  return {
    tag,
    children: [],
    append(...nodes) {
      this.children.push(...nodes);
      for (const node of nodes) {
        node.parent = this;
        node.isConnected = true;
      }
    },
    setAttribute(key, value) { this[key] = value; },
    removeAttribute(key) { delete this[key]; },
    remove() {
      this.parent.children = this.parent.children.filter(node => node !== this);
      this.isConnected = false;
    }
  };
}
const document = {
  body: element('body'),
  documentElement: {lang: 'zh-CN'},
  createElement: element,
  querySelectorAll: () => dialog ? [dialog] : []
};
const window = {};
window.parent = window;
function setup(currentWindow) {
  vm.runInNewContext(source, {
    window: currentWindow,
    document,
    setTimeout(callback, delay) {
      assert.equal(delay, 1000);
      timers.set(++nextTimer, callback);
      return nextTimer;
    },
    clearTimeout(id) { timers.delete(id); }
  });
}
function elapseOneSecond() {
  for (const [id, callback] of [...timers]) {
    timers.delete(id);
    callback();
  }
}

setup(window);
let visibleNotices = 0;
const onVisible = () => { visibleNotices++; };
const fast = window.UploadProgress.begin(undefined, {onVisible});
fast.finish();
elapseOneSecond();
assert.equal(document.body.children.length, 0, 'a finished upload never flashes');
assert.equal(visibleNotices, 0);

const slow = window.UploadProgress.begin(4, {onVisible});
assert.equal(document.body.children.length, 0, 'wait before showing');
slow.advance();
elapseOneSecond();
assert.equal(visibleNotices, 1);
const [panel] = document.body.children;
const [title, percent, bar] = panel.children;
assert.equal(title.textContent, '正在读取素材…');
assert.equal(bar.value, .25);
assert.equal(percent.textContent, '25%');
slow.advance();
assert.equal(bar.value, .5);

const concurrent = window.UploadProgress.begin();
elapseOneSecond();
slow.finish();
assert.equal(document.body.children[0], panel, 'an overlapping upload keeps one indicator');
assert.equal(bar.value, undefined);
concurrent.setProgress(.72);
assert.equal(percent.textContent, '72%');
concurrent.finish();
concurrent.setProgress(.9);
assert.equal(document.body.children.length, 0, 'late progress cannot show a finished upload');

dialog = element('dialog');
const frame = {parent: window, addEventListener: (event, listener) => pageEvents.set(event, listener)};
setup(frame);
frame.UploadProgress.begin(undefined, {onVisible});
elapseOneSecond();
assert.equal(visibleNotices, 2);
assert.equal(dialog.children[0], panel, 'embedded progress uses the parent and stays above its open dialog');
pageEvents.get('pagehide')();
assert.equal(dialog.children.length, 0, 'iframe navigation clears its own progress');
console.log('upload-progress: delay, actual progress, concurrent operations, modal and iframe cleanup passed.');
