// Upload event routing and actual preview controller contracts; real browser checks are separate.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {bindDiceUploads,diceFilePath,readDropFiles} from '../dice/upload-input.mjs';

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
  matches(selector){return selector.split(',').some(part=>{const value=part.trim(),attribute=/^\[([^\]]+)\]$/.exec(value);return attribute?this.attributes.has(attribute[1]):value.toUpperCase()===this.tagName;});}
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
  const cards=zone=>options.cards?['green','purple'].map(grade=>{const card=new Node('div',zone);card.setAttribute('data-upload-grade',grade);card.setAttribute('role','group');card.setAttribute('tabindex','0');return card;}):[];
  const primaryCards=cards(primaryZone),replacementCards=cards(replacementZone);
  const buttons=(zone,cards)=>cards.length?cards.map(card=>new Node('button',card)):[new Node('button',zone)];
  const primaryButtons=buttons(primaryZone,primaryCards),replacementButtons=buttons(replacementZone,replacementCards);
  const primaryLabels=primaryButtons.map(button=>new Node('span',button)),replacementLabels=replacementButtons.map(button=>new Node('span',button));
  const [primaryButton]=primaryButtons,[replacementButton]=replacementButtons,[primaryLabel]=primaryLabels,[replacementLabel]=replacementLabels;
  const input=new Node('input',document),state={busy:false,preview:false,active:true},batches=[],registrations=[];
  const folderInput=options.folder?new Node('input',document):undefined;
  const primaryFolderButtons=options.folder?buttons(primaryZone,primaryCards):[],replacementFolderButtons=options.folder?buttons(replacementZone,replacementCards):[];
  const primaryFolderLabels=primaryFolderButtons.map(button=>new Node('span',button)),replacementFolderLabels=replacementFolderButtons.map(button=>new Node('span',button));
  const [primaryFolderButton]=primaryFolderButtons,[replacementFolderButton]=replacementFolderButtons,[primaryFolderLabel]=primaryFolderLabels,[replacementFolderLabel]=replacementFolderLabels;
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
  const binding=bindDiceUploads({primaryZone,replacementZone,input,...(options.cards?{primaryButtons,replacementButtons}:{primaryButton,replacementButton}),
    isBusy:()=>state.busy,hasPreview:()=>state.preview,isActive:()=>state.active,onFiles:files=>{batches.push(files);return onBatch?.(files);},paste,document,
    onTarget:options.onTarget,onError:options.onError,onDirectory:options.onDirectory,folderInput,
    ...(options.cards?{primaryFolderButtons,replacementFolderButtons}:{primaryFolderButton,replacementFolderButton}),onEmptyFolder:()=>{emptyFolderCount++;return options.onEmptyFolder?.();}});
  const dispose=typeof binding==='function'?binding:()=>binding.dispose();
  function routePaste(files,target=document){
    const event={target},active=registrations.filter(entry=>entry.active&&entry.config.isActive(event));
    const selected=active.find(entry=>entry.config.zone.contains(target))||active.find(entry=>entry.config.zone.contains(document.activeElement))||active[0];
    if(!selected||selected.config.isBusy())return;
    return selected.config.onFiles(files);
  }
  return {document,primaryZone,replacementZone,canvas,primaryButton,replacementButton,primaryLabel,replacementLabel,input,state,batches,registrations,dispose,routePaste,
    primaryCards,replacementCards,primaryButtons,replacementButtons,primaryLabels,replacementLabels,primaryFolderButtons,replacementFolderButtons,primaryFolderLabels,replacementFolderLabels,
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
  const ready=[];
  const entry=file=>({name:file.name,isFile:true,file(resolve){ready.push(()=>resolve(file));}});
  const unused={name:'readme.txt',isFile:true,file(){assert.fail('ignored sidecars must not open a file');}};
  const folder={name:'res',isDirectory:true,createReader(){
    let page=0;
    return {readEntries(resolve){resolve(page++===0?[entry(fileA),unused,entry(fileB)]:[]);}};
  }};
  const reading=readDropFiles({items:[{webkitGetAsEntry:()=>folder}]});
  await flush();
  assert.equal(ready.length,2,'filesystem reads overlap for eligible images');
  ready.reverse().forEach(resolve=>resolve());
  assert.deepEqual(await reading,[fileA,fileB],'completion order does not reorder eligible files');
  checks.push('dropped_directory_skips_sidecars_before_reading_and_parallel_reads_preserve_order');
}
{
  let h,selected='green';const routes=[],imports=[];
  h=harness(files=>imports.push({grade:selected,files}),{cards:true,folder:true,onTarget(event,zone){
    const card=event?.target.closest('[data-upload-grade]')||h.document.activeElement?.closest('[data-upload-grade]');
    if(card&&zone.contains(card))selected=card.getAttribute('data-upload-grade');
    routes.push({event,zone,grade:selected});
  }});
  assert.equal(h.registrations.length,2,'Two cards in each zone share the original two clipboard registrations');
  for(const labels of [h.primaryLabels,h.replacementLabels])for(let index=0;index<labels.length;index++){
    const before=h.pickerCount;labels[index].emit('click');assert.equal(h.pickerCount,before+1);assert.equal(selected,index?'purple':'green');
    const calls=routes.length;h.document.activeElement=h.primaryCards[1-index];h.input.files=liveFiles([fileA]);h.input.emit('change');
    assert.equal(routes.length,calls,'File input change retains the grade chosen before opening the native picker');assert.equal(imports.at(-1).grade,index?'purple':'green');
  }
  for(const labels of [h.primaryFolderLabels,h.replacementFolderLabels])for(let index=0;index<labels.length;index++){
    const before=h.folderPickerCount,pickers=h.pickerCount;labels[index].emit('click');assert.equal(h.folderPickerCount,before+1);assert.equal(h.pickerCount,pickers);
    const calls=routes.length;h.document.activeElement=h.replacementCards[1-index];h.folderInput.files=liveFiles([fileB]);h.folderInput.emit('change');
    assert.equal(routes.length,calls,'Folder input change also retains the selected source');assert.equal(imports.at(-1).grade,index?'purple':'green');
  }
  for(const [zone,cards] of [[h.primaryZone,h.primaryCards],[h.replacementZone,h.replacementCards]]){
    const caption=new Node('span',cards[1]),before=h.pickerCount;caption.emit('click');assert.equal(h.pickerCount,before+1);assert.equal(routes.at(-1).zone,zone);assert.equal(selected,'purple');
    for(const key of ['Enter',' ']){const count=h.pickerCount,calls=routes.length,event=cards[0].emit('keydown',{key});assert.equal(event.defaultPrevented,true);assert.equal(h.pickerCount,count+1);assert.equal(routes.length,calls+1);assert.equal(selected,'green');}
  }
  const calls=routes.length,pickers=h.pickerCount;h.primaryLabels[1].emit('keydown',{key:'Enter'});assert.equal(routes.length,calls);assert.equal(h.pickerCount,pickers);
  h.primaryLabels[1].emit('click');assert.equal(routes.length,calls+1);assert.equal(h.pickerCount,pickers+1,'Nested buttons use one native keyboard click, without delegated key activation');
  h.primaryCards[0].setAttribute('tabindex','-1');const unfocused=h.primaryCards[0].emit('keydown',{key:'Enter'});assert.equal(unfocused.defaultPrevented,false);assert.equal(h.pickerCount,pickers+1);
  const beforeDispose=routes.length;h.dispose();for(const button of [...h.primaryButtons,...h.replacementButtons,...h.primaryFolderButtons,...h.replacementFolderButtons])button.emit('click');assert.equal(routes.length,beforeDispose);
  checks.push('two_grade_cards_share_pickers_and_clipboard_routes_and_keep_picker_source_through_file_changes_without_keyboard_double_activation');
}
{
  let h,selected='green';const routes=[],imports=[];
  h=harness(files=>imports.push({grade:selected,files}),{cards:true,onTarget(event,zone){
    const card=event?.target.closest('[data-upload-grade]')||h.document.activeElement?.closest('[data-upload-grade]');
    if(card&&zone.contains(card))selected=card.getAttribute('data-upload-grade');routes.push({event,zone,grade:selected});
  }});
  const child=new Node('span',h.primaryCards[1]);const drop=child.emit('drop',{dataTransfer:{types:['Files'],files:[fileA]}});await Promise.all(drop.results);
  assert.equal(drop.defaultPrevented,true);assert.equal(imports.at(-1).grade,'purple');assert.equal(routes.at(-1).zone,h.primaryZone);
  h.primaryCards[0].focus();await h.routePaste([fileB]);assert.equal(imports.at(-1).grade,'green');assert.equal(routes.at(-1).event,undefined);assert.equal(routes.at(-1).zone,h.primaryZone);
  h.state.preview=true;h.replacementCards[1].focus();await h.routePaste([fileA]);assert.equal(imports.at(-1).grade,'purple');assert.equal(routes.at(-1).zone,h.replacementZone);
  new Node('textarea',h.document).focus();await h.routePaste([fileB]);assert.equal(imports.at(-1).grade,'purple','Untargeted paste retains the selected source grade');
  const count=routes.length;await h.routePaste([]);h.replacementCards[0].emit('drop',{dataTransfer:{types:['text/plain'],files:[]}});assert.equal(routes.length,count,'Empty paste and nonfile drops do not change source selection');
  h.dispose();checks.push('targeted_card_drop_and_focused_or_untargeted_paste_route_one_source_grade_before_import');
}
{
  for(const fail of [false,true]){
    const error=Error('source selection failed'),errors=[];let calls=0;
    const h=harness(undefined,{cards:true,folder:true,onTarget(){calls++;if(fail)throw error;return false;},onError:failure=>errors.push(failure)});
    h.primaryLabels[1].emit('click');h.primaryFolderLabels[1].emit('click');h.replacementCards[1].emit('keydown',{key:'Enter'});
    const drop=h.replacementCards[0].emit('drop',{dataTransfer:{types:['Files'],files:[fileA]}});await Promise.all(drop.results);await h.routePaste([fileB]);
    assert.equal(calls,5);assert.equal(h.pickerCount,0);assert.equal(h.folderPickerCount,0);assert.equal(h.batches.length,0);
    assert.deepEqual(errors,fail?Array(5).fill(error):[],'Target hook errors reach onError once and cancel the corresponding action');h.dispose();
  }
  let calls=0;const h=harness(undefined,{cards:true,folder:true,onTarget(){calls++;}});
  for(const blocked of ['busy','inactive']){
    h.state.busy=blocked==='busy';h.state.active=blocked!=='inactive';
    for(const card of [...h.primaryCards,...h.replacementCards]){card.emit('click');card.emit('keydown',{key:'Enter'});card.emit('drop',{dataTransfer:{types:['Files'],files:[fileA]}});}
    for(const button of [...h.primaryButtons,...h.replacementButtons,...h.primaryFolderButtons,...h.replacementFolderButtons])button.emit('click');
    for(const registration of h.registrations)await registration.config.onFiles([fileA]);
    h.input.files=liveFiles([fileA]);h.input.emit('change');h.folderInput.files=liveFiles([fileB]);h.folderInput.emit('change');
  }
  h.state.busy=false;h.state.active=true;h.state.preview=true;
  h.primaryCards[1].emit('click');h.primaryCards[1].emit('keydown',{key:' '});h.primaryCards[1].emit('drop',{dataTransfer:{types:['Files'],files:[fileA]}});h.primaryFolderLabels[1].emit('click');
  await h.registrations.find(registration=>registration.config.zone===h.primaryZone).config.onFiles([fileA]);
  assert.equal(calls,0,'Busy, inactive and hidden primary actions never call the target hook');assert.equal(h.pickerCount,0);assert.equal(h.folderPickerCount,0);assert.equal(h.batches.length,0);
  h.replacementLabels[1].emit('click');assert.equal(calls,1);assert.equal(h.pickerCount,1);h.dispose();
  checks.push('target_hook_false_or_error_cancels_all_routes_and_busy_inactive_or_hidden_actions_never_select_or_import');
}
{
  let h,selected='green',releaseRead,committed;const order=[];
  h=harness(undefined,{cards:true,folder:true,onTarget(event,zone){
    const card=event.target.closest('[data-upload-grade]');assert.ok(zone.contains(card));selected=card.getAttribute('data-upload-grade');order.push('target:'+selected);
  },onDirectory:async provider=>{
    order.push('transaction:'+selected);h.state.busy=true;
    try {const files=await provider();committed={grade:selected,files};}finally{h.state.busy=false;}
  }});
  const directory={name:'res',isDirectory:true,createReader(){order.push('enumerate:'+selected);let page=0;return {readEntries(resolve){if(page++===0)releaseRead=()=>resolve([{name:fileA.name,isFile:true,file(resolve){resolve(fileA);}}]);else resolve([]);}};}};
  const transfer={types:['Files'],items:[{webkitGetAsEntry:()=>directory}],files:[]},drop=h.primaryCards[1].emit('drop',{dataTransfer:transfer});
  assert.deepEqual(order,['target:purple','transaction:purple','enumerate:purple']);assert.equal(h.state.busy,true);
  h.primaryCards[0].focus();h.primaryCards[0].emit('click');h.primaryCards[0].emit('keydown',{key:'Enter'});h.primaryFolderLabels[0].emit('click');await h.routePaste([fileB]);
  h.replacementCards[0].emit('drop',{dataTransfer:transfer});assert.equal(selected,'purple');assert.equal(order.length,3);assert.equal(h.pickerCount,0);assert.equal(h.folderPickerCount,0);
  releaseRead();await Promise.all(drop.results);assert.deepEqual(committed,{grade:'purple',files:[fileA]});assert.equal(h.state.busy,false);assert.equal(order.length,3,'Directory completion does not rerun the hook against changed focus');
  h.dispose();checks.push('directory_target_is_selected_before_enumeration_transaction_and_retained_while_focus_changes_or_busy_routes_fire');
}
{
  // Execute the actual controller functions without booting its DOM/event shell.
  const source=await readFile(new URL('../dice/preview-app.js',import.meta.url),'utf8');
  const fields=Object.fromEntries(['dice-name','sound-enabled','preview-mode','preview-point','purple-variant'].map(id=>[id,{value:'',checked:true}]));
  const calls=[],renderCalls=[],revoked=[],forgotten=[],audioChanges=[],progressEvents=[],six=Array.from({length:6},(_,i)=>Object.freeze({name:`sz_${i+1}.png`,sha256:`original-${i+1}`}));
  let app,serial=0,importFailure=null,settingsFailure=null,loadFailure=null,patchFailure=null,patchAccepted=true;
  const runtimeKind=grade=>grade==='purple'?'purple-gyro':'six-face';
  const fixtureSession=(grade='purple',composition='faces')=>({id:`old-${grade}-${composition}`,revision:1,name:'旧骰子',grade,previewGrade:grade,purpleVariant:'05',mode:'all',point:1,composition,resolvedComposition:composition==='faces'?'faces':'digits',soundEnabled:true,
    resourceName:`dice_${grade}_fixture`,files:six,anchor:{sha256:'original-anchor'},audio:{dice_roll:{sha256:'original-audio'}},
    candidate:{id:`old-candidate-${grade}-${composition}`,kind:runtimeKind(grade),template:grade,previewGrade:grade,runtimeIdentity:`original-runtime-${grade}`,json:{marker:`original-json-${grade}`},geometry:{marker:`original-geometry-${grade}`},atlas:`original-atlas-${grade}`,texture:`original-texture-${grade}`,audio:{dice_roll:'original-roll-audio'}}});
  const context={document:{getElementById:id=>{assert.ok(fields[id],`unexpected controller DOM access: ${id}`);return fields[id];}},
    URL:{createObjectURL:()=>`blob:controller-${++serial}`,revokeObjectURL:value=>revoked.push(value)},VIDEO_SPEC:{profile:'test'},t:key=>key,diceFilePath,
    DEFAULT_PURPLE_VARIANT:'02',forgetLocalPreview:id=>forgotten.push(id),
    UploadProgress:{begin(total){assert.equal(total,undefined);progressEvents.push('begin');return {finish:()=>progressEvents.push('finish')};}},
    DiceAudio:class {ready=true;setEnabled(value){audioChanges.push(value);}async load(){}async unlock(){}stop(){}},
    localApi:async(path,options)=>{
      const body=typeof options.body==='string'?JSON.parse(options.body):options.body;calls.push({path,body});
      const previous=app.state().session,isImport=path==='/api/preview/import';
      if(isImport){
        if(importFailure)throw importFailure;
        const id=`new-${++serial}`,kind=runtimeKind(body.grade);
        return {...body,id,revision:1,resourceName:`dice_${body.grade}_fixture`,resolvedComposition:'faces',
          candidate:{id:`candidate-${++serial}`,kind,template:body.grade,previewGrade:body.previewGrade,json:{marker:kind},geometry:{marker:id},atlas:id+'/atlas',texture:id+'/texture',audio:{}}};
      }
      assert.equal(path,`/api/preview/${previous.id}/settings`);if(settingsFailure)throw settingsFailure;
      const {expectedRevision,...changes}=body;assert.equal(expectedRevision,previous.revision,'Controller submits the currently committed revision');
      return {...previous,...changes,revision:previous.revision+1,
        candidate:{...previous.candidate,id:`candidate-${++serial}`,previewGrade:changes.previewGrade??previous.previewGrade}};
    }};
  const executed={...context,loadCandidate:async candidate=>{renderCalls.push({type:'load',candidate,state:app.state()});if(loadFailure)throw loadFailure;},
    patchCandidate:async candidate=>{renderCalls.push({type:'patch',candidate});if(patchFailure)throw patchFailure;return patchAccepted;}};
  vm.createContext(executed);
  vm.runInContext(source.slice(source.indexOf('const $ ='),source.indexOf('\napplyTranslations();'))+`
    render=()=>{}; toast=()=>{};
    globalThis.app={settings,settingsDirty,importFiles,importPending,stageFiles,saveSettings,loadSession,selectUploadGrade,switchBackground,releasePending,
      reset(value=null){releasePending();session=value;grade=value?.grade||'green';previewGrade=value?.previewGrade||grade;currentError=null;notice=null;
        previewReady=hasCanvas=Boolean(value);loadingPreview=false;busy=false;audioSignature='';renderer.candidate=value?.candidate||null;
        if(value)fillSettings(value);else{$('dice-name').value='';$('sound-enabled').checked=true;}},
      setPending(files,extras=[]){releasePending(false);pendingExtras=extras;files.forEach(original=>pending.set(greenSlot(original),{slot:greenSlot(original),original,previewUrl:URL.createObjectURL(original)}));},
      state(){return {session,grade,uploadGrade,previewGrade,pending,extras:pendingExtras,previewReady,hasCanvas,loadingPreview,currentError,notice,rendererCandidate:renderer.candidate};}};
    renderer={data:{},candidate:null,async load(candidate){await loadCandidate(candidate);this.candidate=candidate;return true;},
      async patchPresentation(candidate){const accepted=await patchCandidate(candidate);if(accepted)this.candidate=candidate;return accepted;},configure(){},play(){},pause(){},clear(){}};
  `,executed);app=executed.app;

  app.reset();assert.equal(app.state().uploadGrade,null);assert.equal(app.state().previewGrade,'green');assert.equal(app.state().session,null);
  fields['dice-name'].value='未选择源';app.setPending(six);const beforeExplicit=calls.length;
  await assert.rejects(()=>app.importPending(),error=>error.key==='chooseUploadGrade');assert.equal(calls.length,beforeExplicit);assert.equal(app.state().pending.size,6);
  app.reset();await app.importFiles([six[0]]);assert.equal(app.state().currentError.key,'chooseUploadGrade');assert.equal(app.state().pending.size,0);assert.equal(calls.length,beforeExplicit);
  assert.throws(()=>app.selectUploadGrade('invalid'),error=>error.key==='chooseUploadGrade');assert.equal(app.state().uploadGrade,null);
  checks.push('actual_controller_requires_explicit_source_selection_before_first_import_without_committing_an_animation_grade');

  for(const sourceGrade of ['green','purple']){
    app.reset();app.selectUploadGrade(sourceGrade);progressEvents.length=0;
    importFailure=sourceGrade==='purple'?Error('import rejected'):null;
    const importing=app.importFiles(six);
    assert.deepEqual(progressEvents,['begin']);
    await importing;
    assert.deepEqual(progressEvents,['begin','finish']);
    assert.equal(app.state().currentError,importFailure);
  }
  importFailure=null;
  checks.push('actual_controller_finishes_indeterminate_upload_progress_on_success_and_failure');

  for(const nextGrade of ['green','purple']){
    app.reset();app.selectUploadGrade(nextGrade);assert.equal(app.state().grade,'green','Selecting a card changes only the upload target until a preview successfully loads');
    fields['dice-name'].value='新骰子';app.setPending(six);await app.importPending();
    assert.equal(calls.at(-1).body.grade,nextGrade);assert.equal(calls.at(-1).body.previewGrade,nextGrade);assert.equal(calls.at(-1).body.composition,'faces');assert.equal(calls.at(-1).body.mode,'all');assert.equal(calls.at(-1).body.point,1);
    assert.equal(calls.at(-1).body.purpleVariant,nextGrade==='purple'?'02':'05');
    assert.deepEqual(Array.from(calls.at(-1).body.files),six);assert.equal(app.state().pending.size,0);assert.equal(app.settingsDirty(),false);
    assert.equal(app.state().grade,nextGrade);assert.equal(app.state().session.grade,nextGrade);assert.equal(app.state().uploadGrade,null);assert.equal(app.state().previewGrade,nextGrade);
    assert.equal(app.state().session.candidate.kind,runtimeKind(nextGrade));assert.ok(app.state().session.resourceName.startsWith(`dice_${nextGrade}_`));
  }
  app.reset(fixtureSession('green'));app.selectUploadGrade('purple');app.setPending(six);await app.importPending();
  assert.equal(calls.at(-1).body.purpleVariant,'02','Changing source grade from green starts with the purple default');
  checks.push('actual_controller_successful_green_and_purple_source_imports_use_faces_and_commit_the_matching_animation_and_prefix');

  app.reset(fixtureSession('purple'));
  assert.equal(fields['purple-variant'].value,'05');
  fields['purple-variant'].value='02';
  await app.saveSettings();
  assert.equal(calls.at(-1).body.purpleVariant,'02');
  assert.equal(renderCalls.at(-1).type,'load','A new motion needs the full baked animation');
  assert.equal(app.state().session.purpleVariant,'02');
  assert.equal(app.settingsDirty(),false);
  fields['purple-variant'].value='05';
  loadFailure=Error('new motion could not be displayed');
  await assert.rejects(()=>app.saveSettings(),error=>error.key==='previewLoadFailed'&&error.cause===loadFailure);
  loadFailure=null;
  assert.equal(app.state().session.purpleVariant,'05');
  assert.equal(app.state().previewReady,false);
  assert.equal(app.state().session.revision,3,'The committed revision must remain available for retry');
  checks.push('actual_controller_switches_purple_motion_with_a_full_load_and_retains_the_committed_revision_on_display_failure');

  for(const composition of ['auto','digits']){
    app.reset(fixtureSession('purple',composition));assert.equal(app.settingsDirty(),false);assert.equal(app.settings().composition,composition);
    fields['dice-name'].value='已改名';assert.equal(app.settingsDirty(),true);await app.saveSettings();
    assert.equal(calls.at(-1).body.composition,composition);assert.equal(app.state().session.composition,composition);assert.equal(app.settingsDirty(),false);
    assert.equal(app.state().session.grade,'purple');assert.equal(app.state().session.candidate.kind,'purple-gyro');
    app.reset({...fixtureSession('purple',composition),mode:'single',point:6});app.selectUploadGrade('purple');app.setPending(six);await app.importPending();
    assert.equal(calls.at(-1).body.composition,'faces');assert.equal(calls.at(-1).body.mode,'all');assert.equal(calls.at(-1).body.point,1);
    assert.equal(calls.at(-1).body.purpleVariant,'05','Replacing purple assets preserves a manually selected style');
  }
  checks.push('actual_controller_legacy_auto_digits_are_clean_rename_preserves_composition_and_replacement_always_uses_faces');

  for(const previous of [null,fixtureSession('green')]){
    app.reset(previous);app.selectUploadGrade('purple');fields['dice-name'].value='新紫色';app.setPending(six);const pending=app.state().pending;
    const beforeFailures=forgotten.length;
    importFailure=Error('import rejected');await assert.rejects(()=>app.importPending(),error=>error===importFailure);
    assert.equal(app.state().session,previous);assert.equal(app.state().grade,'green');assert.equal(app.state().previewGrade,'green');assert.equal(app.state().pending,pending);assert.equal(app.state().pending.size,6);assert.equal(app.state().uploadGrade,'purple');importFailure=null;
    loadFailure=Error('renderer rejected');await assert.rejects(()=>app.importPending(),error=>error.key==='previewLoadFailed'&&error.cause===loadFailure);
    assert.equal(app.state().session,previous);assert.equal(app.state().grade,'green');assert.equal(app.state().previewGrade,'green');assert.equal(app.state().pending,pending);assert.equal(app.state().uploadGrade,'purple');assert.equal(app.state().rendererCandidate,previous?.candidate||null);assert.equal(app.state().hasCanvas,Boolean(previous));
    assert.deepEqual(forgotten.slice(beforeFailures),[renderCalls.at(-1).candidate.geometry.marker]);
    assert.equal(renderCalls.at(-1).state.grade,'green','Even while the replacement renderer loads, the committed source remains the old grade');loadFailure=null;
  }
  checks.push('actual_controller_first_or_replacement_import_and_renderer_failures_preserve_committed_source_background_preview_and_pending_files');

  app.reset(fixtureSession('purple'));
  const previousId=app.state().session.id;
  app.selectUploadGrade('purple');
  const firstAnchor={name:'anchor.png'},replacementAnchor={name:'anchor.png'};
  await app.stageFiles([...six.slice(0,2),firstAnchor]);
  await app.stageFiles([...six.slice(2),replacementAnchor]);
  assert.deepEqual(Array.from(calls.at(-1).body.files),[...six,replacementAnchor]);
  assert.equal(forgotten.at(-1),previousId);
  const importedId=app.state().session.id;
  app.selectUploadGrade('purple');
  await app.stageFiles([...six,replacementAnchor]);
  assert.equal(forgotten.at(-1),importedId);
  assert.equal(app.state().pending.size,0);
  checks.push('partial_batches_keep_latest_optional_asset_and_successful_reuploads_release_the_previous_preview');

  for(const sourceGrade of ['green','purple']){
    const original=fixtureSession(sourceGrade,sourceGrade==='purple'?'auto':'faces');app.reset(original);
    for(const nextBackground of [sourceGrade==='green'?'purple':'green',sourceGrade]){
      const prior=app.state().session,before=calls.length;await app.switchBackground(nextBackground);
      assert.equal(calls.length,before+1);assert.deepEqual({...calls.at(-1).body},{expectedRevision:prior.revision,previewGrade:nextBackground});
      const next=app.state().session;assert.equal(next.grade,sourceGrade);assert.equal(app.state().grade,sourceGrade);assert.equal(next.previewGrade,nextBackground);assert.equal(app.state().previewGrade,nextBackground);
      for(const key of ['name','resourceName','composition','resolvedComposition','files','anchor','audio'])assert.equal(next[key],original[key],'Background switching retains '+key);
      for(const key of ['kind','template','runtimeIdentity','json','geometry','atlas','texture','audio'])assert.equal(next.candidate[key],original.candidate[key],'Background switching cannot replace runtime '+key);
      assert.equal(next.revision,prior.revision+1);assert.notEqual(next.candidate.id,prior.candidate.id);assert.equal(renderCalls.at(-1).type,'patch');assert.equal(app.state().uploadGrade,null);assert.equal(app.settingsDirty(),false);
    }
    const count=calls.length;await app.switchBackground(sourceGrade);await app.switchBackground('invalid');assert.equal(calls.length,count,'Same or invalid backgrounds do not issue writes');
  }
  checks.push('actual_controller_background_roundtrips_post_only_preview_grade_and_revision_preserving_source_animation_prefix_assets_and_metadata');

  const dirtyOriginal=fixtureSession('purple','auto');app.reset(dirtyOriginal);
  fields['dice-name'].value='未保存的新名称';fields['sound-enabled'].checked=false;
  assert.equal(app.state().pending.size,0);assert.equal(app.settingsDirty(),true);const beforeDirty=calls.length;
  for(const nextBackground of ['green','purple']){
    const previous=app.state().session;await app.switchBackground(nextBackground);
    assert.deepEqual({...calls.at(-1).body},{expectedRevision:previous.revision,previewGrade:nextBackground},'Background changes do not silently submit dirty name or mute inputs');
    assert.equal(app.state().session.name,dirtyOriginal.name);assert.equal(app.state().session.soundEnabled,true);assert.equal(app.state().session.grade,'purple');assert.equal(app.state().session.candidate.kind,'purple-gyro');assert.equal(app.state().session.resourceName,dirtyOriginal.resourceName);
    assert.equal(fields['dice-name'].value,'未保存的新名称');assert.equal(fields['sound-enabled'].checked,false);assert.equal(audioChanges.at(-1),false,'The unsaved mute input and live audio remain in sync');
    assert.equal(app.state().pending.size,0);assert.equal(app.state().uploadGrade,null);assert.equal(app.settingsDirty(),true,'Unsaved name and mute remain available for the explicit apply action');
  }
  assert.equal(calls.length,beforeDirty+2);
  checks.push('actual_controller_background_roundtrip_preserves_unsaved_name_and_mute_without_pending_files_or_implicitly_applying_them');

  const original=fixtureSession('green'),extras=[Object.freeze({name:'anchor.png'}),Object.freeze({name:'dice_roll.mp3'})];app.reset(original);app.selectUploadGrade('purple');app.setPending(six.slice(0,2),extras);
  fields['dice-name'].value='紫色草稿';fields['sound-enabled'].checked=false;const pending=app.state().pending,beforeDraft=calls.length,revokedBeforeBackground=revoked.length;
  assert.throws(()=>app.selectUploadGrade('green'),error=>error.key==='finishPendingUpload');assert.equal(app.state().pending,pending);assert.equal(app.state().pending.size,2);assert.equal(app.state().uploadGrade,'purple');assert.equal(calls.length,beforeDraft);
  await app.switchBackground('purple');assert.equal(calls.length,beforeDraft+1);assert.deepEqual({...calls.at(-1).body},{expectedRevision:original.revision,previewGrade:'purple'});
  assert.equal(app.state().grade,'green');assert.equal(app.state().session.grade,'green');assert.equal(app.state().uploadGrade,'purple');assert.equal(app.state().pending,pending);assert.equal(app.state().extras,extras);
  assert.equal(fields['dice-name'].value,'紫色草稿');assert.equal(fields['sound-enabled'].checked,false);assert.equal(audioChanges.at(-1),false,'Restoring the draft mute checkbox also restores the audio player state');assert.equal(revoked.length,revokedBeforeBackground,'Background-only updates keep all draft preview URLs alive');assert.deepEqual(Array.from(pending.values(),file=>file.original),six.slice(0,2));
  const beforePartial=calls.length;await app.stageFiles([six[2]]);assert.equal(calls.length,beforePartial);assert.equal(app.state().pending.size,3);assert.equal(app.state().uploadGrade,'purple');assert.equal(app.state().session.candidate.kind,'six-face');
  settingsFailure=Error('background write rejected');const beforeFailure=app.state().session;await assert.rejects(()=>app.switchBackground('green'),error=>error===settingsFailure);settingsFailure=null;
  assert.equal(app.state().session,beforeFailure);assert.equal(app.state().previewGrade,'purple');assert.equal(app.state().pending,pending);assert.equal(fields['dice-name'].value,'紫色草稿');assert.equal(fields['sound-enabled'].checked,false);
  patchFailure=Error('background image rejected');await assert.rejects(()=>app.switchBackground('green'),error=>error===patchFailure);patchFailure=null;
  const committedFailure=app.state().session;assert.equal(committedFailure.id,beforeFailure.id);assert.equal(committedFailure.revision,beforeFailure.revision+1);assert.equal(committedFailure.previewGrade,'green');assert.equal(committedFailure.grade,'green');assert.equal(committedFailure.resourceName,beforeFailure.resourceName);
  assert.equal(app.state().rendererCandidate,beforeFailure.candidate,'The last complete rendered frame is retained after the server already accepted the background change');assert.equal(app.state().previewReady,false,'The retained old frame cannot be exported as the newly committed background');assert.equal(app.state().hasCanvas,true);
  assert.equal(app.state().pending,pending);assert.equal(app.state().uploadGrade,'purple');assert.equal(fields['dice-name'].value,'紫色草稿');assert.equal(fields['sound-enabled'].checked,false);assert.equal(audioChanges.at(-1),false);assert.equal(revoked.length,revokedBeforeBackground);
  await app.switchBackground('purple');assert.deepEqual({...calls.at(-1).body},{expectedRevision:committedFailure.revision,previewGrade:'purple'});assert.equal(app.state().previewReady,true);assert.equal(renderCalls.at(-1).type,'load','A failed presentation reloads safely rather than reusing the stale frame');assert.equal(app.state().rendererCandidate,app.state().session.candidate);assert.equal(audioChanges.at(-1),false);
  const recovered=app.state().session;app.releasePending();assert.equal(app.state().uploadGrade,null);assert.equal(app.state().pending.size,0);assert.equal(app.state().grade,'green');assert.equal(app.state().session,recovered);
  checks.push('actual_controller_partial_source_mixing_is_rejected_and_background_success_or_failure_keeps_draft_audio_and_current_revision_for_safe_reload');
}
console.log(JSON.stringify({ok:true,count:checks.length,checks,limits:'Mock DOM/Event/FileList, UploadPaste registration and actual preview controller contracts; native clipboard, file/directory pickers, rendering and browser layout require real browser QA.'},null,2));
