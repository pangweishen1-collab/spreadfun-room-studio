const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const nodes=new Map();
function el(){const handlers={};const classes=new Set();return {dataset:{},textContent:'',value:'',disabled:false,open:false,handlers,classList:{toggle(k,on){on?classes.add(k):classes.delete(k)},contains:k=>classes.has(k)},addEventListener(k,fn){handlers[k]=fn},reportValidity(){return true},reset(){['hubRequestTitle','hubRequestDescription','hubRequestContact'].forEach(id=>get(id).value='')},showModal(){this.open=true},close(){this.open=false},focus(){}}}
const get=id=>{if(!nodes.has(id))nodes.set(id,el());return nodes.get(id)};
const total=el();total.dataset.stat='generated';const tool=el();tool.dataset.toolStat='room.downloads';const status=el(),unit=el();unit.dataset.hubI18n='times';
let mode='good',releaseStats;const calls=[];
const valid={totals:{generated:1234,downloads:20},tools:{room:{generated:1200,downloads:10},avatar:{generated:2,downloads:5},banner:{generated:32,downloads:5}},startedAt:'2026-10-23T00:00:00Z',updatedAt:'2026-10-23T10:00:00Z'};
const sandbox={document:{getElementById:get,querySelectorAll(s){if(s==='[data-stat]')return[total];if(s==='[data-tool-stat]')return[tool];if(s==='[data-stats-status]')return[status];if(s==='[data-hub-i18n]')return[unit];return[]}},language:'zh',window:{addEventListener(){}},location:{hash:'#home'},AbortController,setTimeout,clearTimeout,crypto,Intl,Date,Number,Promise,Error,JSON,globalThis:null,fetch:async(path,options)=>{calls.push({path,...options});if(mode==='fail')throw Error('offline');if(path==='/api/stats'){if(mode==='delayed'){mode='good';const snapshot=JSON.parse(JSON.stringify(valid));return await new Promise(resolve=>releaseStats=()=>resolve({ok:true,json:async()=>snapshot}))}return {ok:true,json:async()=>valid}}if(path==='/api/requests')return {ok:true,json:async()=>({receipt:'REQ-123'})};if(path==='/api/events')valid.totals.generated+=JSON.parse(options.body).count;return {ok:true,json:async()=>({ok:true})}}};sandbox.globalThis=sandbox;
vm.createContext(sandbox);vm.runInContext(fs.readFileSync(path.join(__dirname,'../hub.js'),'utf8'),sandbox);
const hub=sandbox.window.Hub;
const flush=async()=>{for(let i=0;i<40;i++)await Promise.resolve()};
(async()=>{
  await hub.refreshStats();assert.equal(total.textContent,'1,234');assert.equal(tool.textContent,'10');assert.equal(status.textContent,'');
  mode='fail';await hub.refreshStats();assert.equal(total.textContent,'\u2014');assert.equal(tool.textContent,'\u2014');assert.equal(status.dataset.state,'error');assert.ok(status.textContent);
  mode='good';hub.record('room','generated',250);await flush();
  const events=calls.filter(x=>x.path==='/api/events').map(x=>JSON.parse(x.body));assert.deepEqual(events.map(x=>x.count),[100,100,50]);assert.equal(new Set(events.map(x=>x.id)).size,3);
  hub.record('room','generated',0);hub.record('bogus','generated',1);await flush();assert.equal(calls.filter(x=>x.path==='/api/events').length,3);
  const readsBefore=calls.filter(x=>x.path==='/api/stats').length;mode='delayed';const pending=hub.refreshStats();hub.record('banner','generated',1);await flush();assert.equal(calls.filter(x=>x.path==='/api/stats').length,readsBefore+1);releaseStats();await pending;await flush();assert.equal(calls.filter(x=>x.path==='/api/stats').length,readsBefore+2);assert.equal(total.textContent,'1,485');
  get('hubRequestTitle').value='Task';get('hubRequestDescription').value='Details';get('hubRequestContact').value='Contact';mode='fail';await get('hubRequestForm').handlers.submit({preventDefault(){}});assert.equal(get('hubRequestTitle').value,'Task');assert.equal(get('hubRequestDescription').value,'Details');assert.equal(get('hubRequestResult').dataset.state,'error');
  mode='good';await get('hubRequestForm').handlers.submit({preventDefault(){}});assert.equal(get('hubRequestResult').dataset.state,'success');assert.match(get('hubRequestResult').textContent,/REQ-123/);assert.equal(get('hubRequestTitle').value,'');
  assert.equal(unit.textContent,'次');sandbox.language='en';hub.syncLanguage();assert.match(get('hubRequestResult').textContent,/Suggestion received/);assert.equal(unit.textContent,'');
  console.log('Hub checks passed: real stats, unavailable placeholders, 250-file chunking, post-write refresh race, request retry and bilingual receipt.');
})().catch(error=>{console.error(error);process.exitCode=1});
