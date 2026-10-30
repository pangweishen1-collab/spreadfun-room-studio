// Shared preference controls, without a browser or encoder implementation.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const documentEvents=new Map(),windowEvents=new Map(),nodes=new Map(),observers=[];
let mode='high',pending=0,changes=0;
function node(tag='div'){
  const attrs=new Map(),events=new Map();
  return {tag,children:[],dataset:{},disabled:false,hidden:false,textContent:'',busy:false,
    append(...children){this.children.push(...children)},after(other){this.afterNode=other},
    setAttribute(key,value){attrs.set(key,String(value))},getAttribute:key=>attrs.get(key),
    addEventListener:(name,fn)=>events.set(name,fn),click(){events.get('click')?.()},
    querySelector(selector){return selector==='[aria-busy="true"]'?(this.busy?node():null):this.anchor||null}};
}
const owners=['#roomTool','#avatarTool','#bannerTool','#giftPreviewTool','#resourceTool'];
for(const selector of owners){const owner=node(),anchor=node();anchor.parentElement=node();owner.anchor=anchor;nodes.set(selector,owner);}
nodes.set('#resourceTarget',{value:'custom'});nodes.set('input[name="resourceFormat"][value="webp"]',{checked:false});
const document={documentElement:{lang:'zh-CN'},querySelector:selector=>nodes.get(selector)||null,createElement:node,addEventListener:(name,fn)=>documentEvents.set(name,fn)};
const window={FunWebP:{getMode:()=>mode,getPending:()=>pending,setMode(value){if(pending)return false;mode=value;changes++;documentEvents.get('webp:mode-change')?.();return true}},addEventListener:(name,fn)=>windowEvents.set(name,fn)};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../webp-settings.js'),'utf8'),{window,document,MutationObserver:class{constructor(fn){observers.push(fn)}observe(){}}});
const group=selector=>{const a=nodes.get(selector).anchor;return selector==='#giftPreviewTool'?a.parentElement.afterNode:a.afterNode},buttons=selector=>group(selector).children[1].children;
for(const owner of owners){assert.ok(group(owner));assert.equal(buttons(owner)[0].getAttribute('aria-pressed'),'true');assert.equal(buttons(owner)[0].textContent,'高清压缩');assert.equal(buttons(owner)[1].textContent,'严格无损');}
assert.equal(group('#resourceTool').hidden,true,'PNG does not show WebP-only settings');
buttons('#roomTool')[1].click();assert.equal(mode,'lossless');assert.equal(changes,1);
for(const owner of owners)assert.equal(buttons(owner)[1].getAttribute('aria-pressed'),'true','all tools reflect one shared preference');
pending=1;documentEvents.get('webp:activity-change')();for(const owner of owners)assert.ok(buttons(owner).every(button=>button.disabled));buttons('#roomTool')[0].click();assert.equal(changes,1,'busy controls cannot change the global preference');
pending=0;nodes.get('#avatarTool').busy=true;documentEvents.get('webp:activity-change')();assert.ok(buttons('#avatarTool').every(button=>button.disabled));assert.ok(buttons('#roomTool').every(button=>!button.disabled));
nodes.get('input[name="resourceFormat"][value="webp"]').checked=true;documentEvents.get('change')();assert.equal(group('#resourceTool').hidden,false);
nodes.get('#resourceTarget').value='android';documentEvents.get('change')();assert.equal(group('#resourceTool').hidden,true,'market PNG presets stay isolated');
document.documentElement.lang='en';observers[0]();for(const owner of owners){assert.equal(buttons(owner)[0].textContent,'High quality');assert.equal(buttons(owner)[1].textContent,'Exact lossless');}
documentEvents.get('webp:tool-state')({detail:{tool:'room',busy:true}});assert.ok(buttons('#roomTool').every(button=>button.disabled),'room ZIP work remains locked after encoder requests finish');documentEvents.get('webp:tool-state')({detail:{tool:'room',busy:false}});assert.ok(buttons('#roomTool').every(button=>!button.disabled));
console.log('webp-settings: five synchronized image-tool controls, profile switch, language, encoder/tool busy locks and WebP-only resource visibility passed.');
