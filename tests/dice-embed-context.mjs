// Message routing checks with real immutable File objects; no clipboard access.
import assert from 'node:assert/strict';
import {File} from 'node:buffer';
globalThis.File = File;
const {connectEmbedded} = await import('../dice/embed.mjs');
const origin = 'https://toolkit.example';

function harness({standalone = false, renderer = null, onFiles} = {}) {
  const handlers = new Map(), messages = [], frames = [], imports = [], errors = [];
  const main = {getBoundingClientRect:() => ({height:900})};
  const state = {busy:false, modal:false};
  const parent = {postMessage(data, targetOrigin) { messages.push({data,targetOrigin}); }};
  const child = {parent, addEventListener(type, callback) { handlers.set(type, callback); }};
  if (standalone) child.parent = child;
  const document = {
    hidden:false, documentElement:{}, querySelector(selector) { if (selector === 'main') return main; if (selector === 'dialog[open]') return state.modal ? {} : null; return null; },
    querySelectorAll() { return []; }, getElementById() { return null; }, dispatchEvent() {},
  };
  function activate() {
    globalThis.window = child; globalThis.document = document;
    globalThis.location = {origin,search:''};
    globalThis.requestAnimationFrame = callback => frames.push(callback);
    globalThis.ResizeObserver = class { observe() {} };
  }
  activate();
  const context = connectEmbedded(renderer, {
    isBusy:() => state.busy,
    onFiles(files) { imports.push(files); return onFiles?.(files); },
  });
  const emit = (data, eventOrigin = origin, source = parent) => { activate(); handlers.get('message')?.({data,origin:eventOrigin,source}); };
  return {context,state,document,parent,child,messages,frames,imports,handlers,emit,activate,renderer,errors};
}

const checks = [];
const standalone = harness({standalone:true});
assert.equal(standalone.context.isActive(), true);
assert.equal(standalone.handlers.size, 0);
assert.equal(standalone.messages.length, 0);
checks.push('standalone_returns_active_context_without_parent_handlers');

const child = harness();
assert.equal(child.context.isActive(), false, 'Embedded uploads wait for parent activation even without a renderer');
assert.deepEqual(child.messages[0], {data:{type:'fun-dice-ready'},targetOrigin:origin});
for (const [eventOrigin,source] of [['https://forged.example',child.parent],[origin,{}],[origin,null]]) {
  child.emit({type:'fun-dice-context',active:true},eventOrigin,source);
  assert.equal(child.context.isActive(), false);
}
child.emit({type:'fun-dice-context',active:true});
assert.equal(child.context.isActive(), true, 'Context activation is independent of renderer initialization');
child.emit({type:'fun-dice-context',active:'false'});
assert.equal(child.context.isActive(), true, 'Only a boolean can replace active state');
child.emit({type:'fun-dice-context',active:false});
assert.equal(child.context.isActive(), false);
checks.push('context_requires_parent_origin_source_boolean_and_updates_without_renderer');

const fileA = new File([new Uint8Array([9,8,7])], 'sz_1.png', {type:'image/png',lastModified:123});
const fileB = new File([new Uint8Array([1,2,3])], '2.png', {type:'image/png',lastModified:456});
const send = (files, eventOrigin = origin, source = child.parent) => child.emit({type:'fun-dice-files',files},eventOrigin,source);
send([fileA]); assert.equal(child.imports.length, 0, 'Inactive child ignores files');
child.emit({type:'fun-dice-context',active:true});
send([fileA],'https://forged.example'); send([fileA],origin,{}); send([fileA],origin,null);
assert.equal(child.imports.length, 0);
for (const files of [null,undefined,[],{},[{}],['path/to/sz_1.png'],[fileA,{}],new Array(2),{0:fileA,length:1}]) send(files);
assert.equal(child.imports.length, 0, 'Only a nonempty dense array of actual Files is accepted');
child.state.busy = true; send([fileA]); child.state.busy = false;
child.state.modal = true; send([fileA]); child.state.modal = false;
child.document.hidden = true; send([fileA]); child.document.hidden = false;
assert.equal(child.imports.length, 0, 'Busy, modal and hidden states retain current inputs');
checks.push('forged_invalid_inactive_busy_modal_and_hidden_file_messages_do_not_import');

const files = [fileA,fileB]; send(files); files.length = 0;
assert.equal(child.imports.length, 1);
assert.equal(child.imports[0].length, 2);
assert.equal(child.imports[0][0], fileA); assert.equal(child.imports[0][1], fileB);
assert.deepEqual(child.imports[0].map(file => [file.name,file.type,file.lastModified]), [['sz_1.png','image/png',123],['2.png','image/png',456]]);
assert.deepEqual(new Uint8Array(await child.imports[0][0].arrayBuffer()), new Uint8Array([9,8,7]));
assert.deepEqual(new Uint8Array(await child.imports[0][1].arrayBuffer()), new Uint8Array([1,2,3]));
child.emit({type:'fun-dice-context',active:false}); send([fileA]);
assert.equal(child.imports.length, 1, 'Leaving the tool prevents later file messages');
checks.push('parent_file_snapshots_preserve_order_names_types_dates_original_references_and_bytes');

const aborted = [];
const renderer = {visible:true,last:0,recordingLoop:true,recordingAbort:error => aborted.push(error)};
const rendered = harness({renderer});
assert.equal(renderer.visible, false, 'An embedded renderer starts inactive too');
rendered.emit({type:'fun-dice-context',active:true});
assert.equal(renderer.visible, true); assert.equal(rendered.context.isActive(), true); assert.ok(renderer.last > 0);
rendered.emit({type:'fun-dice-context',active:false});
assert.equal(renderer.visible, false); assert.equal(rendered.context.isActive(), false);
assert.equal(aborted.length, 1); assert.match(aborted[0].message,/后台/);
assert.ok(rendered.messages.every(message => message.targetOrigin === origin));
checks.push('rendered_context_updates_visibility_and_stops_background_recording');
console.log(JSON.stringify({passed:true,count:checks.length,checks,boundary:'File/message routing only; actual Finder clipboard availability and document focus routing require browser verification.'}));
