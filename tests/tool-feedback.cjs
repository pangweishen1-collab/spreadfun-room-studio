// Run: node tests/tool-feedback.cjs — shared presentation behavior, no browser or packages.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

class Element {
  constructor(tag='div',classes=[]){
    this.tagName=tag.toUpperCase();this.dataset={};this.attributes=new Map();this.children=[];
    this.classes=new Set(classes);this.hidden=false;this.textContent='';this.rendered=true;this.animationCalls=[];
    this.classList={contains:name=>this.classes.has(name),add:name=>this.classes.add(name),remove:name=>this.classes.delete(name),toggle:(name,on)=>{if(on)this.classes.add(name);else this.classes.delete(name)}};
  }
  append(...children){children.forEach(child=>{child.parent=this;this.children.push(child)})}
  setAttribute(name,value){this.attributes.set(name,String(value))}
  getAttribute(name){return this.attributes.get(name)??null}
  set src(value){this.setAttribute('src',value)}
  get src(){return this.getAttribute('src')}
  closest(selector){
    for(let node=this;node;node=node.parent){
      if(selector==='.hidden,[hidden]'&&(node.hidden||node.classes.has('hidden')))return node;
      if(selector==='.output-img'&&node.classes.has('output-img'))return node;
    }
    return null;
  }
  matches(selector){return selector==='.output-img img'&&this.tagName==='IMG'&&!!this.parent?.classes.has('output-img')}
  querySelectorAll(selector){
    const result=[];
    const matches=node=>{
      const data=selector.match(/^\[data-feedback-([a-z]+)\]$/);
      if(data)return Object.hasOwn(node.dataset,'feedback'+data[1][0].toUpperCase()+data[1].slice(1));
      if(selector==='.tool-output-empty:not(.hidden)')return node.classes.has('tool-output-empty')&&!node.classes.has('hidden');
      return node.matches(selector);
    };
    const visit=node=>node.children.forEach(child=>{if(matches(child))result.push(child);visit(child)});
    visit(this);return result;
  }
  querySelector(selector){return this.querySelectorAll(selector)[0]||null}
  getClientRects(){return this.rendered?[{width:240,height:240}]:[]}
  animate(frames,options){
    let resolve,reject;
    const finished=new Promise((yes,no)=>{resolve=yes;reject=no});
    const animation={frames,options,finished,cancelled:0,cancel(){this.cancelled++;reject(new Error('cancelled'))},finish:resolve};
    this.animationCalls.push(animation);return animation;
  }
}

function toolRoot(){
  const root=new Element(),stage=new Element(),message=new Element(),status=new Element();
  stage.dataset.feedbackStage='';message.dataset.feedbackMessage='';status.dataset.feedbackStatus='';
  const art=new Element('img');art.dataset.feedbackArt='empty-upload';
  const outputArt=new Element('img');outputArt.dataset.feedbackArt='empty-output';
  const empty=new Element('div',['tool-output-empty','hidden']);empty.append(outputArt);
  const result=new Element('div',['result']);result.textContent='a previous valid result';
  const canvas=new Element('canvas');canvas.width=720;canvas.height=1560;canvas.pixels='unchanged';
  const fileInput=new Element('input');fileInput.files=[{name:'original.webp'}];
  stage.append(art,canvas);root.append(stage,message,status,empty,result,fileInput);
  return {root,stage,message,status,art,outputArt,empty,result,canvas,fileInput};
}

const tools={room:toolRoot(),avatar:toolRoot(),banner:toolRoot(),resource:toolRoot()};
const documentListeners=new Map(),motionListeners=new Map();
const document={hidden:false,documentElement:{lang:'en'},getElementById:id=>tools[id.replace('Tool','')]?.root||null,addEventListener(type,handler){documentListeners.set(type,handler)}};
const reduced={matches:false,addEventListener(type,handler){motionListeners.set(type,handler)}};
let refreshes=0;
const sandbox={document,window:{matchMedia:()=>reduced,FunToolkitFeedback:{refresh(){refreshes++}}},console};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname,'../tool-feedback.js'),'utf8'),sandbox);
const api=sandbox.window.FunToolkitUI;

(async()=>{
  assert.deepEqual(Object.keys(api).sort(),['activate','prepareImages','reveal','setState']);
  for(const tool of Object.values(tools))assert.equal(tool.root.dataset.feedbackPhase,'empty');
  api.setState('resources',{phase:'loading',message:'Loading logo…'});assert.equal(tools.resource.root.dataset.feedbackPhase,'loading');assert.equal(tools.resource.stage.getAttribute('aria-busy'),'true');api.setState('resources',{phase:'ready'});
  const room=tools.room;
  const beforeFiles=room.fileInput.files,beforeResult=room.result.textContent;
  const beforeCanvas=[room.canvas.width,room.canvas.height,room.canvas.pixels];
  api.setState('room',{phase:'loading',message:'Reading images…'});
  assert.equal(room.root.dataset.feedbackPhase,'loading');assert.equal(room.stage.getAttribute('aria-busy'),'true');
  assert.equal(room.message.textContent,'Reading images…');assert.equal(room.status.textContent,'Reading images…');
  api.setState('room',{phase:'processing',message:'Generating and packaging…'});
  assert.equal(room.status.textContent,'Generating and packaging…');
  api.setState('room',{phase:'error',message:'Caller-owned error notice'});
  assert.equal(room.stage.getAttribute('aria-busy'),'false');
  assert.equal(room.status.textContent,'','the shared live status clears when the task is no longer busy');
  assert.equal(room.message.textContent,'Generating and packaging…','the fading visual label keeps its text until it becomes transparent');
  assert.match(room.art.src,/empty-error\.svg$/);assert.match(room.outputArt.src,/empty-error\.svg$/);
  assert.equal(room.result.textContent,beforeResult);assert.equal(room.result.hidden,false);
  assert.equal(room.result.classList.contains('hidden'),false,'an error does not hide a previous valid output');
  assert.equal(room.empty.classList.contains('hidden'),true,'feedback does not take ownership of content visibility');
  assert.equal(room.fileInput.files,beforeFiles);assert.deepEqual([room.canvas.width,room.canvas.height,room.canvas.pixels],beforeCanvas);
  api.setState('room',{phase:'success'});
  assert.match(room.art.src,/empty-upload\.svg$/);assert.match(room.outputArt.src,/empty-output\.svg$/);
  api.setState('room',{phase:'unknown'});api.setState('not-a-tool',{phase:'loading'});
  assert.equal(room.root.dataset.feedbackPhase,'success','unsupported tools/phases cannot mutate the presentation');
  document.documentElement.lang='zh-CN';api.setState('room',{phase:'processing'});
  assert.equal(room.status.textContent,'正在处理…','an unnamed busy task has a localised fallback');
  assert.ok(refreshes>=8,'state updates notify the primitive responsible for visual loop visibility');
  room.empty.classList.remove('hidden');api.setState('room',{phase:'empty'});
  const emptyReveals=room.empty.animationCalls.length;
  assert.equal(emptyReveals,1,'an actually visible empty state can reveal after the previous stage');
  api.setState('room',{phase:'empty'});
  assert.equal(room.empty.animationCalls.length,emptyReveals,'repeated state synchronisation is visually idempotent');
  room.empty.classList.add('hidden');

  // A reveal never mutates visibility, layout or canvas pixels.
  api.reveal(room.canvas);
  const first=room.canvas.animationCalls[0];
  assert.ok(first);assert.deepEqual(JSON.parse(JSON.stringify(first.frames)),[{opacity:.35},{opacity:1}]);
  assert.equal(first.options.duration,160);assert.equal(first.options.easing,'ease-out');
  assert.ok(first.frames.every(frame=>Object.keys(frame).every(key=>key==='opacity')),'working previews only animate opacity');
  assert.equal(room.canvas.hidden,false);assert.deepEqual([room.canvas.width,room.canvas.height,room.canvas.pixels],beforeCanvas);
  api.reveal(room.canvas);assert.equal(first.cancelled,1,'a second reveal cancels the stale animation');
  document.hidden=true;documentListeners.get('visibilitychange')();
  assert.equal(room.canvas.animationCalls[1].cancelled,1,'backgrounding the document immediately cancels its active reveal');
  api.reveal(room.canvas);assert.equal(room.canvas.animationCalls.length,2,'background content does not start another animation');
  document.hidden=false;
  room.root.classList.add('hidden');api.reveal(room.canvas);
  assert.equal(room.canvas.animationCalls.length,2,'a hidden tool ancestor prevents a reveal');room.root.classList.remove('hidden');
  room.canvas.hidden=true;api.reveal(room.canvas);room.canvas.hidden=false;
  room.canvas.rendered=false;api.reveal(room.canvas);room.canvas.rendered=true;
  assert.equal(room.canvas.animationCalls.length,2,'hidden or unrendered targets remain untouched');
  api.reveal(room.canvas);reduced.matches=true;motionListeners.get('change')();
  assert.equal(room.canvas.animationCalls[2].cancelled,1,'enabling reduced motion cancels active movement');
  api.reveal(room.canvas);assert.equal(room.canvas.animationCalls.length,3,'reduced motion leaves content visible without animation');
  reduced.matches=false;

  api.activate('room');const roomRouteAnimations=room.root.animationCalls.length,routeRefreshes=refreshes;
  api.activate('room');
  assert.equal(room.root.animationCalls.length,roomRouteAnimations,'click followed by hashchange must not replay one route');
  assert.equal(refreshes,routeRefreshes);
  api.activate('avatar');assert.equal(tools.avatar.root.animationCalls.length,1,'a newly active tool receives one reveal');

  // Existing media decode callbacks decide placeholder state; no source or file rewrite.
  const list=new Element(),readyBox=new Element('div',['output-img']),pendingBox=new Element('div',['output-img']),brokenBox=new Element('div',['output-img']);
  const ready=new Element('img'),pending=new Element('img'),broken=new Element('img');
  ready.complete=true;ready.naturalWidth=720;ready.src='blob:ready';pending.complete=false;pending.naturalWidth=0;pending.src='blob:pending';broken.complete=true;broken.naturalWidth=0;broken.src='blob:broken';
  readyBox.append(ready);pendingBox.append(pending);brokenBox.append(broken);list.append(readyBox,pendingBox,brokenBox);
  api.prepareImages(list);
  for(const image of [ready,pending,broken]){assert.equal(image.loading,'lazy');assert.equal(image.decoding,'async')}
  assert.equal(readyBox.dataset.feedbackImage,'ready');assert.equal(ready.classList.contains('is-loaded'),true);
  assert.equal(brokenBox.dataset.feedbackImage,'error');assert.equal(broken.classList.contains('is-loaded'),false);
  assert.equal(pendingBox.dataset.feedbackImage,undefined,'an undecoded image stays pending');
  pending.naturalWidth=300;documentListeners.get('load')({target:pending});
  assert.equal(pendingBox.dataset.feedbackImage,'ready');assert.equal(pending.classList.contains('is-loaded'),true);
  pending.naturalWidth=0;documentListeners.get('error')({target:pending});
  assert.equal(pendingBox.dataset.feedbackImage,'error');assert.equal(pending.classList.contains('is-loaded'),false);
  assert.equal(pending.src,'blob:pending','placeholder state never replaces the caller-owned media source');
  documentListeners.get('error')({target:new Element('img')});api.prepareImages(null);

  // Resolve the last route animations so the check also covers normal completion cleanup.
  room.root.animationCalls.at(-1).finish();tools.avatar.root.animationCalls.at(-1).finish();
  await Promise.resolve();
  console.log('PASS: shared phases and labels, retained result/file/canvas state, opacity-only reveals, route deduplication, hidden/background/reduced-motion handling and thumbnail loaded/error placeholders.');
})().catch(error=>{console.error(error);process.exitCode=1});
