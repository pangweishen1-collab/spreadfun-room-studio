// Time-envelope correctness; actual H.264 alpha and SDK playback are verified
// separately with downloaded browser exports.
const assert=require('node:assert/strict'),path=require('node:path');
const {pathToFileURL}=require('node:url');
(async()=>{
  const {normalizeGiftFade,giftFadeOpacity,applyGiftFade}=await import(pathToFileURL(path.join(__dirname,'../vap-gift-fade.mjs')));
  const defaults={enabled:true,fadeIn:1,fadeOut:1},disabled={enabled:false,fadeIn:1,fadeOut:1};
  assert.deepEqual(normalizeGiftFade(),defaults,'fresh options enable one-second fade-in and fade-out');
  const source={enabled:true,fadeIn:.5,fadeOut:2},normalized=normalizeGiftFade(source);assert.deepEqual(normalized,source);assert.notEqual(normalized,source,'normalization owns its settings');
  assert.equal(normalizeGiftFade({enabled:false}).enabled,false);
  assert.deepEqual(normalizeGiftFade({enabled:true,fadeIn:0,fadeOut:0}),{enabled:true,fadeIn:0,fadeOut:0});
  for(const invalid of [null,[],true,'fade',{enabled:'true'},...[-1,120.01,NaN,Infinity,'1',null].flatMap(value=>[{...defaults,fadeIn:value},{...defaults,fadeOut:value}])])assert.throws(()=>normalizeGiftFade(invalid),error=>error instanceof RangeError||error instanceof TypeError,'invalid fade settings are rejected');
  const close=(actual,expected,label)=>assert.ok(Math.abs(actual-expected)<1e-9,`${label}: ${actual} vs ${expected}`);
  // Five seconds at 24 fps end on the last encoded sample, not an imaginary
  // frame at duration. Thus both the first and last output frames are clear.
  const duration=5,fps=24,last=119/24;
  for(const [time,expected]of [[0,0],[.25,.25],[.5,.5],[1,1],[2.5,1],[last-1,1],[last-.75,.75],[last-.5,.5],[last-.25,.25],[last,0],[duration,0]])close(giftFadeOpacity(time,duration,fps,defaults),expected,'linear one-second fades');
  for(const time of [0,.25,1,last,5])close(giftFadeOpacity(time,duration,fps,disabled),1,'disabled effect never changes opacity');
  const instant={enabled:true,fadeIn:0,fadeOut:0};for(const time of [0,.5,last,5])close(giftFadeOpacity(time,duration,fps,instant),1,'zero duration is an immediate show/hide without division by zero');
  for(const [fade,time,expected]of [[{enabled:true,fadeIn:0,fadeOut:1},0,1],[{enabled:true,fadeIn:1,fadeOut:0},last,1]])close(giftFadeOpacity(time,duration,fps,fade),expected,'individual fade can be disabled');
  // When a clip is shorter than the two requested fades, shorten both by the
  // same ratio so their ramps meet once, rather than dimming the entire clip.
  const shortDuration=1,shortLast=23/24;
  for(const [time,expected]of [[0,0],[shortLast*.25,.5],[shortLast*.5,1],[shortLast*.75,.5],[shortLast,0]])close(giftFadeOpacity(time,shortDuration,fps,defaults),expected,'short clip proportional fades');
  const unequal={enabled:true,fadeIn:1,fadeOut:3},peak=shortLast/4;
  close(giftFadeOpacity(peak,shortDuration,fps,unequal),1,'short unequal fades retain their ratio');close(giftFadeOpacity(peak/2,shortDuration,fps,unequal),.5,'short unequal entrance');close(giftFadeOpacity(peak+(shortLast-peak)/2,shortDuration,fps,unequal),.5,'short unequal exit');
  for(const count of [1,2])for(let index=0;index<count;index++)close(giftFadeOpacity(index/24,count/24,24,defaults),1,'one/two-frame clips retain their picture: no middle sample can be visible between clear endpoints');
  for(const [index,expected]of [[0,0],[1,1],[2,0]])close(giftFadeOpacity(index/24,3/24,24,defaults),expected,'three frames can represent entrance, peak and exit');
  for(const opacity of [0,.25,.5,1]){
    const image={width:4,height:1,data:new Uint8ClampedArray([17,41,99,255,8,13,21,128,254,31,4,1,73,61,49,0])},before=image.data.slice(),returned=applyGiftFade(image,opacity);
    assert.equal(returned,image,'preview retains the existing ImageData object');
    for(let offset=0;offset<before.length;offset+=4){assert.deepEqual(image.data.slice(offset,offset+3),before.slice(offset,offset+3),'fade never recolors foreground, shadows or particles');assert.equal(image.data[offset+3],Math.round(before[offset+3]*opacity),'only original alpha is multiplied once');}
  }
  console.log('vap-gift-fade: default one-second entrance/exit, linear endpoints at the final encoded frame, disabled/zero durations, proportional short clips, one/two-frame visibility safeguard, three-frame peak, unequal ramps, validation and alpha-only preview passed. Actual codec pixels require browser acceptance.');
})().catch(error=>{console.error(error);process.exitCode=1});
