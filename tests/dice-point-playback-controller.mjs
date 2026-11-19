import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};};
const settle=()=>new Promise(resolve=>setImmediate(resolve));
let clock=100,unlockGate=null;
class Audio {
  constructor(){this.enabled=true;this.ready=true;this.plays=[];this.stops=[];this.unlocks=0;}
  async unlock(){this.unlocks++;if(unlockGate)await unlockGate.promise;return true;}
  async load(){this.ready=true;}
  setEnabled(enabled){this.enabled=enabled;}
  playRound(options){this.plays.push({...options});}
  stop(channel){this.stops.push(channel);}
}
const fields=Object.fromEntries(['dice-name','purple-variant','preview-mode','preview-point','sound-enabled'].map(id=>[id,{value:'',checked:true}]));
const document={hidden:false,getElementById:id=>{assert(fields[id],id);return fields[id];}};
const context={document,DiceAudio:Audio,PurplePreviewAudio:Audio,localApi(){},URL,performance:{now:()=>clock},DEFAULT_PURPLE_VARIANT:'01R'};
vm.createContext(context);
const source=await readFile(new URL('../dice/preview-app.js',import.meta.url),'utf8');
vm.runInContext(source.slice(source.indexOf('const $ ='),source.indexOf('\napplyTranslations();'))+`
render=()=>{};
const rendererCalls=[];
renderer={visible:true,data:{},point:1,pointAt(x,y){rendererCalls.push({kind:'hit',x,y});return this.point;},
  playPoint(point){rendererCalls.push({kind:'point',point});},play(){rendererCalls.push({kind:'all'});},
  async load(){},configure(){},patchPresentation:async()=>true};
globalThis.test={syncRound,syncPoint,playCanvas,playCanvasKey,setPlaybackSoundEnabled,selectPlaybackAudio,stopPlaybackSounds,loadSession,
  green:greenAudio,purple:purpleAudio,renderer,rendererCalls,
  setGrade(sourceGrade){session={id:'session',candidate:{audio:{}},name:'hero',grade:sourceGrade,previewGrade:sourceGrade,purpleVariant:sourceGrade==='purple'?'01R':'05',mode:'all',point:1,composition:'faces',soundEnabled:true};
    selectPlaybackAudio(sourceGrade);fillSettings(session);previewReady=true;hasCanvas=true;busy=false;pending.clear();},
  setBusy(value){busy=value;},setPending(value){pending.clear();if(value)pending.set('sz_1',{});},session(){return session;}};
`,context);
const app=context.test;app.setGrade('purple');
const point=(point,extra={})=>app.syncPoint({point,playing:true,elapsed:0,reason:'start',...extra});

// Simultaneous requests retain independent channels, including a click before
// unlock finishes. Replaying one point invalidates only its previous request.
unlockGate=deferred();
point(1,{restartGroupAudio:true,groupElapsed:.4,groupPlaying:true,groupSix:true});
point(2);point(1);clock=130;
unlockGate.resolve();await settle();unlockGate=null;
assert.deepEqual(app.purple.plays.map(play=>play.channel),['preview','point-2','point-1']);
assert(Math.abs(app.purple.plays[0].elapsed-.43)<1e-9);
assert.equal(app.purple.plays[0].six,true);
const playsBeforeSix=app.purple.plays.length;
point(6,{restartGroupAudio:true,groupElapsed:.5,groupPlaying:true,groupSix:false});await settle();
assert.deepEqual(app.purple.plays.slice(playsBeforeSix).map(play=>[play.channel,play.six]),[['preview',false],['point-6',true]]);

const stopsBeforeScope=app.purple.stops.length;
app.syncRound({scope:'points',playing:false,elapsed:.6});
assert.equal(app.purple.stops.length,stopsBeforeScope,'Point status cannot stop all independent voices');
app.syncPoint({point:2,playing:false,elapsed:2,reason:'finish'});
assert.equal(app.purple.stops.at(-1),'point-2');
app.syncPoint({point:1,playing:false,elapsed:.2,reason:'pause'});
assert.deepEqual(app.purple.stops.slice(-2),['point-1','preview']);

async function rejectsStale(change){
 const before=app.purple.plays.length;unlockGate=deferred();point(3);await change();unlockGate.resolve();await settle();unlockGate=null;
 assert.equal(app.purple.plays.length,before,'A canceled delayed unlock played stale audio');
}
await rejectsStale(()=>{app.setPlaybackSoundEnabled(false);app.setPlaybackSoundEnabled(true);});
await rejectsStale(()=>{document.hidden=true;app.stopPlaybackSounds();document.hidden=false;});
await rejectsStale(()=>app.loadSession(app.session()));
await rejectsStale(()=>app.selectPlaybackAudio('green'));
app.setGrade('purple');
const globalBefore=app.purple.plays.length;
app.syncRound({playing:true,elapsed:0});await settle();
assert.equal(app.purple.plays.length,globalBefore+1);assert.equal(app.purple.plays.at(-1).channel,'preview');

app.rendererCalls.length=0;app.renderer.point=4;
app.playCanvas({clientX:25,clientY:50});
assert.deepEqual(Array.from(app.rendererCalls,call=>call.kind),['hit','point']);assert.equal(app.rendererCalls[1].point,4);
app.renderer.point=null;app.playCanvas({clientX:5,clientY:5});
assert.equal(app.rendererCalls.at(-1).kind,'all');
app.setBusy(true);const callsBeforeBusy=app.rendererCalls.length;app.playCanvas({clientX:25,clientY:50});assert.equal(app.rendererCalls.length,callsBeforeBusy);app.setBusy(false);
fields['dice-name'].value='unsaved';app.playCanvas({clientX:25,clientY:50});assert.equal(app.rendererCalls.length,callsBeforeBusy);fields['dice-name'].value='hero';

const key=(value,extra={})=>{let prevented=false;app.playCanvasKey({key:value,preventDefault(){prevented=true;},...extra});return prevented;};
app.rendererCalls.length=0;
assert.equal(key('4'),true);assert.equal(app.rendererCalls.at(-1).point,4);
assert.equal(key('Enter'),true);assert.equal(app.rendererCalls.at(-1).kind,'all');
assert.equal(key(' '),true);assert.equal(app.rendererCalls.at(-1).kind,'all');
const beforeIgnoredKeys=app.rendererCalls.length;
for(const value of ['0','7','ArrowRight','Escape','Tab'])assert.equal(key(value),false);
assert.equal(key('1',{metaKey:true}),false);assert.equal(key('1',{ctrlKey:true}),false);
assert.equal(key('1',{altKey:true}),false);assert.equal(key('1',{isComposing:true}),false);
app.setBusy(true);assert.equal(key('1'),false);app.setBusy(false);
app.setPending(true);assert.equal(key('Enter'),false);app.setPending(false);
fields['dice-name'].value='unsaved';assert.equal(key(' '),false);fields['dice-name'].value='hero';
assert.equal(app.rendererCalls.length,beforeIgnoredKeys,'Ignored or gated keys cannot play or capture browser shortcuts');

app.setGrade('green');app.rendererCalls.length=0;app.renderer.point=1;
app.playCanvas({clientX:25,clientY:50});assert.deepEqual(Array.from(app.rendererCalls,call=>call.kind),['all']);
assert.equal(key('1'),false);assert.equal(key('Enter'),false);assert.equal(key(' '),false);assert.equal(app.rendererCalls.length,1);
const greenBefore=app.green.plays.length;app.syncRound({playing:true,elapsed:0});
assert.equal(app.green.plays.length,greenBefore+1);assert.equal(app.green.plays.at(-1).six,true);
app.syncRound({playing:false,elapsed:.5});assert.equal(app.green.stops.at(-1),undefined);
console.log(JSON.stringify({ok:true,checks:['independent pending unlock and replay','inherited group offset and sixth override','point scope leaves other channels alone','finish/pause cleanup','mute-hide-load-grade switch cancel pending requests','global preview round','point and outside hit routing','busy/dirty click gates','number keys and Enter/Space replay only when handled','modifiers/composition/busy/pending/dirty keys remain unhandled','green keeps original whole-round audio and canvas route'],boundary:'Actual preview controller functions with mocked audio/renderer; browser hit geometry, sound, and rendered motion are tested separately.'}));
