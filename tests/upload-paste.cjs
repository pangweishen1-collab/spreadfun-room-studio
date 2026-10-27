// Clipboard event routing only; real browser/native clipboard behavior is checked separately.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

class TestFile extends Blob{
  constructor(parts,name,options={}){super(parts,options);this.name=name;this.lastModified=options.lastModified??1234;}
}
class Element{
  constructor(tag='div',parent=null){this.tagName=tag.toUpperCase();this.parentNode=parent;this.nodeType=1;this.isConnected=true;this.hidden=false;this.rendered=true;this.isContentEditable=false;}
  contains(node){for(;node;node=node.parentNode)if(node===this)return true;return false;}
  matches(selector){return selector==='input,textarea,select'&&['INPUT','TEXTAREA','SELECT'].includes(this.tagName);}
  closest(selector){
    for(let node=this;node;node=node.parentNode){
      if(selector==='[hidden],.hidden'&&node.hidden)return node;
      if(selector==='input,textarea,select,[contenteditable]:not([contenteditable="false"])'&&(node.matches('input,textarea,select')||node.isContentEditable))return node;
    }
    return null;
  }
  getClientRects(){return this.rendered?[{}]:[];}
}
function harness(){
  const listeners=[],errors=[];
  const document={activeElement:null,hidden:false,modal:false,querySelector(selector){assert.equal(selector,'dialog[open]');return this.modal?{}:null;},addEventListener(type,listener){assert.equal(type,'paste');listeners.push(listener);}};
  const window={};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../upload-paste.js'),'utf8'),{window,document,File:TestFile,console:{error(...values){errors.push(values);}},Promise});
  function paste({files=[],items=[],target=new Element('body'),composedPath,defaultPrevented=false,clipboardData}={}){
    const event={target,defaultPrevented,clipboardData:clipboardData||{files,items},prevented:0,preventDefault(){this.prevented++;this.defaultPrevented=true;}};
    if(composedPath)event.composedPath=()=>composedPath;
    listeners[0](event);return event;
  }
  return {api:window.UploadPaste,document,listeners,errors,paste};
}
const flush=()=>new Promise(resolve=>setImmediate(resolve));
(async()=>{
  const h=harness();assert.equal(h.listeners.length,1);const first=new Element(),second=new Element(),calls=[];let active='first',busy=false;
  const unregister=h.api.register({zone:first,isActive:()=>active==='first',isBusy:()=>busy,onFiles:files=>{calls.push({zone:'first',files});}});
  h.api.register({zone:second,isActive:()=>active==='second',onFiles:files=>calls.push({zone:'second',files})});
  const png=new TestFile([new Uint8Array([1,2,3])],'known.png',{type:'image/png',lastModified:4567});
  const liveFiles=[png];const event=h.paste({files:liveFiles,items:[{kind:'file',getAsFile(){throw Error('FileList must win over items');}}]});liveFiles.length=0;
  assert.equal(event.prevented,1);assert.equal(calls.length,1);assert.equal(calls[0].files.length,1,'snapshot survives live FileList changes');assert.equal(calls[0].files[0],png,'fully named files keep identity');
  active='second';h.paste({files:[png]});assert.equal(calls.at(-1).zone,'second','only the active route receives a page paste');
  const textEvent=h.paste({items:[{kind:'string',getAsFile(){throw Error('string item must not be read');}}]});assert.equal(textEvent.prevented,0);assert.equal(calls.length,2);
  const fallback=h.paste({items:[{kind:'file',getAsFile:()=>null},{kind:'file',getAsFile:()=>png}]});assert.equal(fallback.prevented,1);assert.equal(calls.at(-1).files[0],png);
  for(const tag of ['input','textarea','select']){const input=new Element(tag);const before=calls.length;const e=h.paste({target:input,clipboardData:{get files(){throw Error('editable clipboard must not be inspected');}}});assert.equal(calls.length,before);assert.equal(e.prevented,0);}
  const editor=new Element();editor.isContentEditable=true;const child=new Element('span',editor);assert.equal(h.paste({files:[png],target:child}).prevented,0);
  const host=new Element(),shadowInput=new Element('input');host.shadowRoot={activeElement:shadowInput};h.document.activeElement=host;assert.equal(h.paste({files:[png]}).prevented,0);h.document.activeElement=null;
  const deepEditor=new Element('textarea');assert.equal(h.paste({files:[png],target:host,composedPath:[deepEditor,host]}).prevented,0);
  const count=calls.length;h.document.modal=true;assert.equal(h.paste({files:[png]}).prevented,0);assert.equal(calls.length,count,'open dialogs never upload into a tool behind them');h.document.modal=false;
  h.document.hidden=true;assert.equal(h.paste({files:[png]}).prevented,0);h.document.hidden=false;
  assert.equal(h.paste({files:[png],defaultPrevented:true}).prevented,0);
  active='first';busy=true;const busyEvent=h.paste({files:[png]});assert.equal(busyEvent.prevented,1);assert.equal(calls.length,count,'busy uploads do not replace a file or queue another import');busy=false;
  first.hidden=true;assert.equal(h.paste({files:[png]}).prevented,0);first.hidden=false;first.rendered=false;assert.equal(h.paste({files:[png]}).prevented,0);first.rendered=true;
  unregister();assert.equal(h.paste({files:[png]}).prevented,0,'unregistered zone cannot import');assert.equal(h.listeners.length,1,'registrations share one listener');

  const nested=harness(),outer=new Element(),inner=new Element('div',outer),leaf=new Element('button',inner),nestedCalls=[];
  nested.api.register({zone:outer,onFiles:()=>nestedCalls.push('outer')});nested.api.register({zone:inner,onFiles:()=>nestedCalls.push('inner')});
  nested.paste({files:[png],target:leaf});assert.equal(nestedCalls.at(-1),'inner','innermost explicit upload region wins');
  nested.document.activeElement=leaf;nested.paste({files:[png]});assert.equal(nestedCalls.at(-1),'inner','focused upload region wins when the event targets the document');nested.document.activeElement=null;
  nested.paste({files:[png]});assert.equal(nestedCalls.at(-1),'outer','page paste returns to the first primary, not the last targeted secondary');
  const secondary=harness(),primary=new Element(),mask=new Element(),maskLeaf=new Element('button',mask),targeted=[];secondary.api.register({zone:primary,onFiles:()=>targeted.push('primary')});secondary.api.register({zone:mask,isActive:event=>mask.contains(event.target),onFiles:()=>targeted.push('mask')});secondary.paste({files:[png],target:maskLeaf});assert.equal(targeted.at(-1),'mask','secondary regions may gate activation by this paste event');secondary.paste({files:[png]});assert.equal(targeted.at(-1),'primary');

  const names=harness(),received=[];names.api.register({zone:new Element(),onFiles:files=>received.push(...files)});
  const unnamed=new TestFile([new Uint8Array([9,8,7])],'image',{type:'image/png',lastModified:9876});
  const emptyName=new TestFile(['video'],'',{type:'video/mp4',lastModified:8765});
  const unknown=new TestFile(['svga'],'animation',{type:'application/octet-stream'});
  const namedWrongExtension=new TestFile(['image'],'original.txt',{type:'image/png'});
  names.paste({files:[unnamed,emptyName,unknown,namedWrongExtension]});
  assert.equal(received[0].name,'pasted-image.png');assert.equal(received[0].type,'image/png');assert.equal(received[0].lastModified,9876);assert.deepEqual(new Uint8Array(await received[0].arrayBuffer()),new Uint8Array(await unnamed.arrayBuffer()));
  assert.equal(received[1].name,'pasted-video.mp4');assert.equal(received[1].lastModified,8765);assert.equal(await received[1].text(),'video');
  assert.equal(received[2],unknown,'unknown MIME and unnamed SVGA are not relabelled');assert.equal(received[3],namedWrongExtension,'an existing extension is preserved for the tool validator');
  for(const [type,ext] of [['image/jpeg','jpg'],['image/webp','webp']]){names.paste({files:[new TestFile(['x'],'image',{type})]});assert.equal(received.at(-1).name,'pasted-image.'+ext);}
  const failures=harness();failures.api.register({zone:new Element(),onFiles(){throw Error('sync failure');}});failures.paste({files:[png]});assert.equal(failures.errors.length,1);
  const rejected=harness();rejected.api.register({zone:new Element(),onFiles:()=>Promise.reject(Error('async failure'))});rejected.paste({files:[png]});await flush();assert.equal(rejected.errors.length,1,'async failures are reported without unhandled rejections');
  assert.throws(()=>h.api.register({zone:first,onFiles:null}),/requires/);
  console.log('upload-paste: file/item snapshots, route/focus/nested-zone selection, editable/shadow/modal/hidden guards, busy/unregister, safe clipboard filenames/bytes and callback failures passed. Native clipboard availability requires browser checks.');
})().catch(error=>{console.error(error);process.exitCode=1});
