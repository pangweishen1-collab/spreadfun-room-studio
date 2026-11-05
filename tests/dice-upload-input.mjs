// Upload event routing and actual preview controller contracts; real browser checks are separate.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {bindDiceUploads} from '../dice/upload-input.mjs';

class ClassList {
  values=new Set();
  add(...names){names.forEach(name=>this.values.add(name));}
  remove(...names){names.forEach(name=>this.values.delete(name));}
  contains(name){return this.values.has(name);}
  toggle(name,force){const enabled=force??!this.contains(name);enabled?this.add(name):this.remove(name);return enabled;}
}
class Node {
  constructor(tag='div',parent=null){this.tagName=tag.toUpperCase();this.parentNode=this.parentElement=parent;this.classList=new ClassList();this.listeners=new Map();this.attributes=new Map();this.nodeType=1;this.hidden=false;this.isConnected=true;this.disabled=false;this.children=[];parent?.children.push(this);}
  addEventListener(type,listener){if(!this.listeners.has(type))this.listeners.set(type,new Set());this.listeners.get(type).add(listener);}
  removeEventListener(type,listener){this.listeners.get(type)?.delete(listener);}
  contains(node){for(;node;node=node.parentNode)if(node===this)return true;return false;}
  matches(selector){return selector.split(',').some(part=>part.trim().toUpperCase()===this.tagName);}
  closest(selector){for(let node=this;node;node=node.parentNode)if(node.matches?.(selector))return node;return null;}
  setAttribute(name,value){this.attributes.set(name,String(value));}
  getAttribute(name){return this.attributes.get(name)??null;}
  getClientRects(){return this.hidden?[]:[{}];}
  focus(){for(let node=this;node;node=node.parentNode)if(node.isDocument){node.activeElement=this;break;}}
  emit(type,details={}){
    const path=[];for(let node=this;node;node=node.parentNode)path.push(node);
    const event={type,target:this,currentTarget:null,key:'',relatedTarget:null,defaultPrevented:false,propagationStopped:false,results:[],
      preventDefault(){this.defaultPrevented=true;},stopPropagation(){this.propagationStopped=true;},stopImmediatePropagation(){this.propagationStopped=true;this.immediateStopped=true;},composedPath:()=>path,...details};
    for(const node of path){event.currentTarget=node;for(const listener of node.listeners.get(type)||[]){event.results.push(listener.call(node,event));if(event.immediateStopped)break;}if(event.propagationStopped)break;}
    return event;
  }
  click(){return this.emit('click');}
}
function liveFiles(initial){
  const source=[...initial];
  return {source,get length(){return source.length;},item(index){return source[index]??null;},*[Symbol.iterator](){yield*source;}};
}
const fileA=Object.freeze({name:'sz_1.png',type:'image/png',size:100}),fileB=Object.freeze({name:'sz_2.png',type:'image/png',size:110});
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function harness(onBatch,options={}) {
  const document=new Node('document');document.isDocument=true;document.activeElement=null;
  const stage=new Node('section',document),primaryZone=new Node('div',stage),replacementZone=new Node('div',document),canvas=new Node('canvas',stage);
  const primaryButton=new Node('button',primaryZone),replacementButton=new Node('button',replacementZone);
  const primaryLabel=new Node('span',primaryButton),replacementLabel=new Node('span',replacementButton);
  const input=new Node('input',document),state={busy:false,preview:false,active:true},batches=[],registrations=[];
  const folderInput=options.folder?new Node('input',document):undefined;
  const primaryFolderButton=options.folder?new Node('button',primaryZone):undefined;
  const replacementFolderButton=options.folder?new Node('button',replacementZone):undefined;
  const primaryFolderLabel=options.folder?new Node('span',primaryFolderButton):undefined;
  const replacementFolderLabel=options.folder?new Node('span',replacementFolderButton):undefined;
  let value='selected',pickerCount=0,folderValue='folder-selected',folderPickerCount=0,emptyFolderCount=0;
  input.files=liveFiles([]);
  Object.defineProperty(input,'value',{get:()=>value,set:next=>{value=next;if(next==='')input.files.source.length=0;}});
  input.click=()=>{pickerCount++;};
  if(folderInput){
    folderInput.files=liveFiles([]);
    Object.defineProperty(folderInput,'value',{get:()=>folderValue,set:next=>{folderValue=next;if(next==='')folderInput.files.source.length=0;}});
    folderInput.click=()=>{folderPickerCount++;};
  }
  const paste={register(config){const entry={config:{isActive:()=>true,isBusy:()=>false,...config},active:true};registrations.push(entry);return()=>{entry.active=false;};}};
  const binding=bindDiceUploads({primaryZone,replacementZone,input,primaryButton,replacementButton,
    isBusy:()=>state.busy,hasPreview:()=>state.preview,isActive:()=>state.active,onFiles:files=>{batches.push(files);return onBatch?.(files);},paste,document,
    onDirectory:options.onDirectory,folderInput,primaryFolderButton,replacementFolderButton,onEmptyFolder:()=>{emptyFolderCount++;return options.onEmptyFolder?.();}});
  const dispose=typeof binding==='function'?binding:()=>binding.dispose();
  function routePaste(files,target=document){
    const event={target},active=registrations.filter(entry=>entry.active&&entry.config.isActive(event));
    const selected=active.find(entry=>entry.config.zone.contains(target))||active.find(entry=>entry.config.zone.contains(document.activeElement))||active[0];
    if(!selected||selected.config.isBusy())return;
    return selected.config.onFiles(files);
  }
  return {document,primaryZone,replacementZone,canvas,primaryButton,replacementButton,primaryLabel,replacementLabel,input,state,batches,registrations,dispose,routePaste,
    folderInput,primaryFolderButton,replacementFolderButton,primaryFolderLabel,replacementFolderLabel,
    get pickerCount(){return pickerCount;},get folderPickerCount(){return folderPickerCount;},get emptyFolderCount(){return emptyFolderCount;}};
}
const checks=[];

{
  const h=harness();
  h.primaryZone.emit('click');assert.equal(h.pickerCount,1);
  h.replacementZone.emit('click');assert.equal(h.pickerCount,2);
  h.primaryLabel.emit('click');assert.equal(h.pickerCount,3,'button click bubbles without opening a second picker');
  h.replacementLabel.emit('click');assert.equal(h.pickerCount,4);
  for(const zone of [h.primaryZone,h.replacementZone])for(const key of ['Enter',' ']){
    const before=h.pickerCount,event=zone.emit('keydown',{key});assert.equal(h.pickerCount,before+1);assert.equal(event.defaultPrevented,true);
  }
  const before=h.pickerCount;assert.equal(h.primaryZone.emit('keydown',{key:'Tab'}).defaultPrevented,false);assert.equal(h.pickerCount,before);
  h.primaryLabel.emit('keydown',{key:'Enter'});assert.equal(h.pickerCount,before,'nested button retains native keyboard click handling');
  h.primaryLabel.emit('click');assert.equal(h.pickerCount,before+1);
  h.dispose();checks.push('primary_and_replacement_whole_zone_clicks_enter_space_and_bubbling_buttons_open_one_picker');
}
{
  const h=harness();
  h.input.files=liveFiles([fileA,fileB]);const live=h.input.files;
  h.input.emit('change');live.source.length=0;await flush();
  assert.equal(h.batches.length,1);assert.ok(Array.isArray(h.batches[0]));assert.deepEqual(h.batches[0],[fileA,fileB]);assert.equal(h.input.value,'');
  const drops=liveFiles([fileB,fileA]);h.replacementZone.emit('dragover',{dataTransfer:{types:['Files'],files:drops}});
  assert.equal(h.replacementZone.classList.contains('upload-hover'),true);
  const drop=h.replacementZone.emit('drop',{dataTransfer:{types:['Files'],files:drops}});drops.source.length=0;await Promise.all(drop.results);await flush();
  assert.equal(drop.defaultPrevented,true);assert.deepEqual(h.batches.at(-1),[fileB,fileA]);assert.equal(h.replacementZone.classList.contains('upload-hover'),false);
  const pasted=liveFiles([fileA]);const result=h.routePaste(pasted);pasted.source.length=0;await result;await flush();
  assert.deepEqual(h.batches.at(-1),[fileA]);
  h.dispose();checks.push('change_drop_and_registered_paste_snapshot_live_filelists_before_clear_or_async_validation');
}
{
  const h=harness();assert.equal(h.registrations.length,2,'both zones reuse shared UploadPaste registrations');
  assert.equal(h.document.listeners.get('paste')?.size||0,0,'module must not add a competing clipboard parser');
  await h.routePaste([fileA]);assert.equal(h.batches.length,1,'one empty-state paste imports exactly once');
  await h.routePaste([fileB],h.replacementLabel);assert.equal(h.batches.length,2);assert.deepEqual(h.batches.at(-1),[fileB]);
  h.state.preview=true;
  assert.equal(h.registrations.find(entry=>entry.config.zone===h.primaryZone).config.isActive({target:h.document}),false);
  assert.equal(h.registrations.find(entry=>entry.config.zone===h.replacementZone).config.isActive({target:h.document}),true);
  await h.routePaste([fileA]);assert.equal(h.batches.length,3,'only the active replacement registration receives paste after preview');
  h.dispose();await h.routePaste([fileB]);assert.equal(h.batches.length,3);assert.ok(h.registrations.every(entry=>!entry.active));
  checks.push('shared_paste_routes_one_batch_to_target_or_active_zone_and_dispose_unregisters_both_targets');
}
{
  const h=harness();h.state.preview=true;
  for(const [node,type,details]of [[h.primaryZone,'click',{}],[h.primaryZone,'keydown',{key:'Enter'}],[h.primaryZone,'keydown',{key:' '}],[h.canvas,'click',{}]]){
    const event=node.emit(type,details);assert.equal(event.defaultPrevented,false);assert.equal(event.propagationStopped,false);
  }
  assert.equal(h.pickerCount,0);
  h.primaryZone.emit('dragover',{dataTransfer:{types:['Files'],files:[fileA]}});
  h.primaryZone.emit('drop',{dataTransfer:{types:['Files'],files:[fileA]}});
  assert.equal(h.primaryZone.classList.contains('upload-hover'),false);assert.equal(h.canvas.classList.contains('upload-hover'),false);assert.equal(h.batches.length,0);
  h.replacementZone.emit('click');assert.equal(h.pickerCount,1);
  const over=h.replacementZone.emit('dragover',{dataTransfer:{types:['Files'],files:[fileB]}});assert.equal(over.defaultPrevented,true);
  assert.equal(h.replacementZone.classList.contains('upload-hover'),true);
  h.replacementZone.emit('dragleave');assert.equal(h.replacementZone.classList.contains('upload-hover'),false);
  const dropped=h.replacementZone.emit('drop',{dataTransfer:{types:['Files'],files:[fileB]}});await Promise.all(dropped.results);assert.deepEqual(h.batches,[[fileB]]);
  h.dispose();checks.push('primary_is_inactive_once_canvas_exists_without_swallowing_clicks_or_marking_canvas_replacement_stays_active');
}
{
  const h=harness();h.state.busy=true;
  for(const zone of [h.primaryZone,h.replacementZone]){
    zone.emit('click');zone.emit('keydown',{key:'Enter'});zone.emit('keydown',{key:' '});
    zone.emit('dragover',{dataTransfer:{types:['Files'],files:[fileA]}});
    zone.emit('drop',{dataTransfer:{types:['Files'],files:[fileA]}});
    assert.equal(zone.classList.contains('upload-hover'),false);
  }
  h.primaryButton.emit('click');h.replacementButton.emit('click');
  h.input.files=liveFiles([fileA]);h.input.emit('change');await h.routePaste([fileA]);await flush();
  assert.equal(h.pickerCount,0);assert.equal(h.batches.length,0);
  h.state.busy=false;h.replacementZone.emit('click');assert.equal(h.pickerCount,1);
  h.dispose();checks.push('busy_blocks_picker_change_drop_paste_and_hover_without_queueing_a_replacement');
}
{
  const h=harness();h.state.active=false;
  for(const preview of [false,true]){
    h.state.preview=preview;
    for(const zone of [h.primaryZone,h.replacementZone]){
      zone.emit('click');zone.emit('keydown',{key:'Enter'});zone.emit('keydown',{key:' '});
      zone.emit('dragover',{dataTransfer:{types:['Files'],files:[fileA]}});
      zone.emit('drop',{dataTransfer:{types:['Files'],files:[fileA]}});
      assert.equal(zone.classList.contains('upload-hover'),false);
    }
    h.primaryButton.emit('click');h.replacementButton.emit('click');
    h.input.files=liveFiles([fileA]);h.input.emit('change');
    for(const entry of h.registrations){assert.equal(entry.config.isActive({target:h.document}),false);await entry.config.onFiles([fileB]);}
    await h.routePaste([fileA]);
  }
  assert.equal(h.pickerCount,0);assert.equal(h.batches.length,0);
  h.state.active=true;await h.routePaste([fileB]);assert.deepEqual(h.batches,[[fileB]]);
  assert.equal(h.registrations.length,2,'reactivation reuses the original clipboard registrations');
  h.dispose();checks.push('inactive_embedded_tool_cannot_choose_drop_change_or_paste_in_either_preview_state_and_reactivation_works');
}
{
  const failure=new Error('PNG validator failed');
  const h=harness(()=>{throw failure;});h.state.preview=true;
  const registration=h.registrations.find(entry=>entry.config.zone===h.replacementZone);
  await assert.rejects(async()=>registration.config.onFiles([fileA]),error=>error===failure,'callback failure must reach the caller/run');
  h.replacementZone.emit('dragover',{dataTransfer:{types:['Files'],files:[fileA]}});
  await assert.rejects(async()=>{const event=h.replacementZone.emit('drop',{dataTransfer:{types:['Files'],files:[fileA]}});await Promise.all(event.results);},error=>error===failure);
  assert.equal(h.replacementZone.classList.contains('upload-hover'),false);
  h.dispose();checks.push('validation_errors_reach_existing_run_handler_without_swallowing_or_retry_and_drop_hover_is_cleaned');
}
{
  const h=harness();h.replacementZone.emit('dragover',{dataTransfer:{types:['Files'],files:[fileA]}});h.dispose();
  const picker=h.pickerCount,batches=h.batches.length;
  h.primaryZone.emit('click');h.replacementButton.emit('click');h.input.files=liveFiles([fileA]);h.input.emit('change');
  h.replacementZone.emit('drop',{dataTransfer:{types:['Files'],files:[fileA]}});await h.routePaste([fileA]);
  assert.equal(h.pickerCount,picker);assert.equal(h.batches.length,batches);
  assert.equal(h.primaryZone.classList.contains('upload-hover'),false);assert.equal(h.replacementZone.classList.contains('upload-hover'),false);
  h.dispose();checks.push('dispose_removes_dom_handlers_and_paste_registrations_and_clears_hover');
}
{
  const h=harness(undefined,{folder:true});
  let event=h.primaryFolderLabel.emit('click');assert.equal(event.propagationStopped,true);assert.equal(h.folderPickerCount,1);assert.equal(h.pickerCount,0);
  event=h.replacementFolderLabel.emit('click');assert.equal(event.propagationStopped,true);assert.equal(h.folderPickerCount,2);assert.equal(h.pickerCount,0);
  h.state.preview=true;h.primaryFolderLabel.emit('click');assert.equal(h.folderPickerCount,2,'primary folder choice is disabled once canvas exists');
  h.replacementFolderLabel.emit('click');assert.equal(h.folderPickerCount,3,'replacement folder choice works with a preview');
  for(const blocked of ['busy','inactive']){
    h.state.busy=blocked==='busy';h.state.active=blocked!=='inactive';
    h.primaryFolderLabel.emit('click');h.replacementFolderLabel.emit('click');assert.equal(h.folderPickerCount,3);
  }
  assert.equal(h.pickerCount,0,'folder buttons must never bubble into normal PNG picker');
  h.dispose();checks.push('folder_buttons_stop_bubbling_primary_only_empty_replacement_always_and_busy_inactive_gate_both');
}
{
  const h=harness(undefined,{folder:true});
  const uppercase=Object.freeze({name:'SZ_3.PNG',type:'application/octet-stream',size:90,webkitRelativePath:'res/SZ_3.PNG'});
  const unknown=Object.freeze({name:'unknown.PnG',type:'image/png',size:80,webkitRelativePath:'res/unknown.PnG'});
  const duplicateA=Object.freeze({name:'sz_1.png',type:'image/png',size:81,webkitRelativePath:'res/a/sz_1.png'});
  const duplicateB=Object.freeze({name:'sz_1.png',type:'image/png',size:82,webkitRelativePath:'res/b/sz_1.png'});
  const sidecar=Object.freeze({name:'.DS_Store',type:'',size:40}),text=Object.freeze({name:'readme.txt',type:'image/png',size:70}),jpg=Object.freeze({name:'example.jpg',type:'image/jpeg',size:60});
  h.folderInput.files=liveFiles([sidecar,fileA,text,uppercase,unknown,duplicateA,jpg,duplicateB]);const live=h.folderInput.files;
  const changed=h.folderInput.emit('change');live.source.length=0;await Promise.all(changed.results);await flush();
  assert.equal(h.folderInput.value,'');assert.equal(h.batches.length,1);
  assert.deepEqual(h.batches[0],[fileA,uppercase,unknown,duplicateA,duplicateB]);assert.equal(h.emptyFolderCount,0);
  assert.equal(h.batches[0][3],duplicateA);assert.equal(h.batches[0][4],duplicateB,'duplicate basename identities/order reach existing validator unchanged');
  assert.equal(h.batches[0][1].name,'SZ_3.PNG','case and original filename are retained');
  h.dispose();checks.push('mixed_folder_ignores_only_non_png_snapshots_live_list_and_forwards_unknown_pngs_duplicate_basenames_and_original_case');
}
{
  const h=harness(undefined,{folder:true});
  const originals=['icon.png','1.png','2.png',...Array.from({length:7},(_,i)=>`sz_${i}.png`)]
    .map(name=>Object.freeze({name,type:'image/png',size:100,webkitRelativePath:'res/'+name}));
  const hiddenCaches=Array.from({length:24},(_,i)=>Object.freeze({name:`s${i%2?800:1000}sz_${i%7}.PNG`,type:'image/png',size:50,
    webkitRelativePath:`res/.@__thumb/${i}/s${i%2?800:1000}sz_${i%7}.PNG`}));
  const hidden=[...hiddenCaches,
    Object.freeze({name:'.DS_Store',type:'',webkitRelativePath:'res/.DS_Store'}),
    Object.freeze({name:'cache.png',type:'image/png',webkitRelativePath:'res/.DS_Store/cache.png'}),
    Object.freeze({name:'._sz_1.png',type:'image/png'}),
    Object.freeze({name:'.hidden.PNG',type:'image/png',webkitRelativePath:''}),
    Object.freeze({name:'sz_2.png',type:'image/png',webkitRelativePath:'res/normal/.metadata/sz_2.png'}),
    Object.freeze({name:'sz_3.png',type:'image/png',webkitRelativePath:'res\\nested\\.@__thumb\\sz_3.png'})];
  h.folderInput.files=liveFiles([...originals,...hidden]);h.folderInput.emit('change');
  assert.equal(h.batches.length,1);assert.deepEqual(h.batches[0],originals);assert.equal(h.emptyFolderCount,0);
  assert.equal(h.batches[0].length,10,'24 thumbnail-cache PNGs and hidden sidecars do not become extra production files');
  const nestedUnknown=Object.freeze({name:'s800sz_1.png',type:'image/png',webkitRelativePath:'res/normal/s800sz_1.png'});
  const dottedOrdinary=Object.freeze({name:'theme.v2.png',type:'image/png',webkitRelativePath:'res/materials.v2/theme.v2.png'});
  const duplicate=Object.freeze({name:'sz_1.png',type:'image/png',webkitRelativePath:'res/normal/sz_1.png'});
  const ordinary=[...originals,nestedUnknown,dottedOrdinary,duplicate];
  h.folderInput.files=liveFiles([...ordinary,...hidden]);h.folderInput.emit('change');
  assert.equal(h.batches.length,2);assert.deepEqual(h.batches[1],ordinary);
  assert.equal(h.batches[1].at(-3),nestedUnknown,'nonhidden cache-like names still reach unknown-name validation');
  assert.equal(h.batches[1].at(-1),duplicate,'normal nested duplicate basename is never deduplicated');
  assert.equal(h.batches[1].filter(file=>file.name==='sz_1.png').length,2);
  h.folderInput.files=liveFiles(hidden);h.folderInput.emit('change');
  assert.equal(h.batches.length,2);assert.equal(h.emptyFolderCount,1,'nonempty folder containing only ignored hidden artifacts reports no usable PNG');
  h.dispose();checks.push('directory_hidden_segments_thumbnail_24_pngs_dsstore_and_appledouble_are_ignored_without_hiding_regular_nested_unknowns_or_duplicate_basenames');
}
{
  const h=harness(undefined,{folder:true}),nonPNG=[{name:'.DS_Store'},{name:'readme.txt'}];
  h.folderInput.files=liveFiles([]);h.folderInput.emit('change');assert.equal(h.emptyFolderCount,0,'cancelled picker does not show a folder error');
  h.folderInput.files=liveFiles(nonPNG);h.folderInput.emit('change');assert.equal(h.emptyFolderCount,1);assert.equal(h.batches.length,0);assert.equal(h.folderInput.value,'');
  for(const blocked of ['busy','inactive']){
    h.state.busy=blocked==='busy';h.state.active=blocked!=='inactive';
    for(const files of [nonPNG,[fileA]]){h.folderInput.files=liveFiles(files);h.folderInput.emit('change');}
  }
  assert.equal(h.emptyFolderCount,1);assert.equal(h.batches.length,0,'hidden/busy directory changes cannot import or replace the current set');
  h.state.busy=false;h.state.active=true;h.state.preview=true;h.folderInput.files=liveFiles([fileB]);h.folderInput.emit('change');
  assert.deepEqual(h.batches,[[fileB]],'shared folder input supports replacement while a canvas exists');
  h.dispose();checks.push('cancel_is_silent_nonempty_folder_without_png_calls_empty_handler_and_busy_hidden_skip_errors_and_imports');
}
{
  const failure=new Error('duplicate PNG rejected'),h=harness(()=>{throw failure;},{folder:true});
  const duplicate={...fileA,webkitRelativePath:'res/other/sz_1.png'};
  h.folderInput.files=liveFiles([fileA,duplicate]);
  await assert.rejects(async()=>{const event=h.folderInput.emit('change');await Promise.all(event.results);},error=>error===failure);
  assert.equal(h.batches.length,1);assert.deepEqual(h.batches[0],[fileA,duplicate]);assert.equal(h.emptyFolderCount,0);assert.equal(h.folderInput.value,'');
  const before=h.folderPickerCount;h.dispose();
  h.primaryFolderLabel.emit('click');h.replacementFolderLabel.emit('click');h.folderInput.files=liveFiles([fileB]);h.folderInput.emit('change');
  assert.equal(h.folderPickerCount,before);assert.equal(h.batches.length,1);
  checks.push('folder_validation_errors_propagate_after_input_clear_and_dispose_removes_folder_buttons_and_change_handler');
}

{
  let start=0, releaseRead, committed;
  const h=harness(undefined,{onDirectory:async provider=>{
    start++; h.state.busy=true;
    try { committed=await provider(); } finally {h.state.busy=false;}
  }});
  const directory={name:'res',isDirectory:true,createReader(){let page=0;return {readEntries(resolve){if(page++===0)releaseRead=()=>resolve([{name:fileA.name,isFile:true,file(resolve){resolve(fileA);}}]);else resolve([]);}};}};
  const transfer={types:['Files'],items:[{webkitGetAsEntry:()=>directory}],files:[]};
  const first=h.primaryZone.emit('drop',{dataTransfer:transfer});
  assert.equal(start,1); assert.equal(h.state.busy,true,'Directory transaction starts before enumeration resolves');
  h.primaryZone.emit('drop',{dataTransfer:transfer});h.replacementButton.emit('click');
  assert.equal(start,1);assert.equal(h.pickerCount,0,'Busy directory import blocks overlapping drops and pickers');
  releaseRead(); await Promise.all(first.results);assert.deepEqual(committed,[fileA]);assert.equal(h.state.busy,false);
  h.dispose();checks.push('directory_enumeration_starts_inside_import_transaction_and_blocks_overlapping_uploads');
}
{
  // Execute the actual controller functions without booting its DOM/event shell.
  const source=await readFile(new URL('../dice/preview-app.js',import.meta.url),'utf8');
  const fields=Object.fromEntries(['dice-name','sound-enabled','preview-mode','preview-point'].map(id=>[id,{value:'',checked:true}]));
  const calls=[],six=Array.from({length:6},(_,i)=>Object.freeze({name:`sz_${i+1}.png`}));
  let app,serial=0,importFailure=null,loadFailure=null;
  const context={document:{getElementById:id=>{assert.ok(fields[id],`unexpected controller DOM access: ${id}`);return fields[id];}},
    URL:{revokeObjectURL(){}},VIDEO_SPEC:{profile:'test'},t:key=>key,
    DiceAudio:class {ready=true;setEnabled(){}async load(){}stop(){}},
    localApi:async(path,options)=>{
      const body=typeof options.body==='string'?JSON.parse(options.body):options.body;calls.push({path,body});
      if(importFailure)throw importFailure;
      const previous=app.state().session,isImport=path==='/api/preview/import';
      return {...body,id:isImport?`new-${++serial}`:previous.id,revision:isImport?1:previous.revision+1,
        resolvedComposition:body.composition==='auto'?'digits':body.composition,candidate:{id:`candidate-${++serial}`,audio:{}}};
    }};
  const executed={...context,loadCandidate:async()=>{if(loadFailure)throw loadFailure;}};
  vm.createContext(executed);
  vm.runInContext(source.slice(source.indexOf('const $ ='),source.indexOf('\napplyTranslations();'))+`
    render=()=>{}; toast=()=>{};
    globalThis.app={settings,settingsDirty,importPending,saveSettings,loadSession,switchGrade,
      setSession(value,nextGrade=value?.grade||'green'){session=value;grade=nextGrade;if(value)fillSettings(value);},
      setPending(files){releasePending();files.forEach((original,i)=>pending.set(GREEN_SLOTS[i],{original,previewUrl:'blob:'+i}));},
      clearCache(){gradeSessions.clear();},state(){return {session,grade,pending};}};
    renderer={data:{},async load(candidate){await loadCandidate(candidate);},async patchPresentation(){return true;},configure(){},play(){},clear(){}};
  `,executed);app=executed.app;
  const legacy=composition=>({id:`old-${composition}`,revision:1,name:'旧骰子',grade:'purple',mode:'all',point:1,composition,resolvedComposition:'digits',soundEnabled:true,candidate:{id:`old-${composition}`,audio:{}}});
  for(const nextGrade of ['green','purple']){
    app.setSession(null,nextGrade);fields['dice-name'].value='新骰子';app.setPending(six);await app.importPending();
    assert.equal(calls.at(-1).body.grade,nextGrade);assert.equal(calls.at(-1).body.composition,'faces');
    assert.deepEqual(Array.from(calls.at(-1).body.files),six);assert.equal(app.state().pending.size,0);assert.equal(app.settingsDirty(),false);
  }
  checks.push('actual_controller_new_green_and_purple_six_face_imports_use_faces');
  for(const composition of ['auto','digits']){
    app.setSession(legacy(composition));assert.equal(app.settingsDirty(),false);assert.equal(app.settings().composition,composition);
    fields['dice-name'].value='已改名';assert.equal(app.settingsDirty(),true);await app.saveSettings();
    assert.equal(calls.at(-1).body.composition,composition);assert.equal(app.state().session.composition,composition);assert.equal(app.settingsDirty(),false);
    app.setSession({...legacy(composition),mode:'single',point:6});app.setPending(six);await app.importPending();
    assert.equal(calls.at(-1).body.composition,'faces');assert.equal(calls.at(-1).body.mode,'all');assert.equal(calls.at(-1).body.point,1);
  }
  checks.push('actual_controller_legacy_auto_digits_are_clean_rename_preserves_composition_and_replacement_always_uses_faces');
  const previous=legacy('digits');app.setSession(previous);app.setPending(six);
  importFailure=Error('import rejected');await assert.rejects(()=>app.importPending(),error=>error===importFailure);
  assert.equal(app.state().session,previous);assert.equal(app.state().pending.size,6);importFailure=null;
  loadFailure=Error('renderer rejected');await assert.rejects(()=>app.importPending(),error=>error.key==='previewLoadFailed'&&error.cause===loadFailure);
  assert.equal(app.state().session,previous);assert.equal(app.state().grade,'purple');assert.equal(app.state().pending.size,6);loadFailure=null;
  checks.push('actual_controller_failed_import_or_renderer_load_preserves_previous_session_and_pending_sources');
  app.clearCache();app.setPending([]);
  const green={...legacy('faces'),id:'cached-green',grade:'green'},purple=legacy('auto');
  await app.loadSession(green);await app.switchGrade('purple');assert.equal(app.state().session,null);assert.equal(app.settings().composition,'faces');
  await app.loadSession(purple);const beforeSwitch=calls.length;
  await app.switchGrade('green');assert.equal(app.state().session,green);assert.equal(app.settingsDirty(),false);
  await app.switchGrade('purple');assert.equal(app.state().session,purple);assert.equal(app.settingsDirty(),false);assert.equal(app.settings().composition,'auto');assert.equal(calls.length,beforeSwitch);
  checks.push('actual_controller_grade_cache_restores_each_composition_without_reimport_or_dirty_settings');
}
console.log(JSON.stringify({ok:true,count:checks.length,checks,limits:'Mock DOM/Event/FileList, UploadPaste registration and actual preview controller contracts; native clipboard, file/directory pickers, rendering and browser layout require real browser QA.'},null,2));
