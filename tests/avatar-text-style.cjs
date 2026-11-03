const assert=require('node:assert/strict');
(async()=>{
  const {TEXT_STYLES,textStylePadding,drawStyledText}=await import('../avatar-text-style.mjs');
  const make=()=>{const calls=[],gradients=[];return {calls,gradients,save(){calls.push(['save'])},restore(){calls.push(['restore'])},measureText(){return {actualBoundingBoxAscent:24,actualBoundingBoxDescent:6}},strokeText(...args){calls.push(['stroke',this.strokeStyle,this.lineWidth,...args])},fillText(...args){calls.push(['fill',this.fillStyle,...args])},createLinearGradient(...coords){const stops=[];gradients.push({coords,stops});return {addColorStop(...args){stops.push(args)}}}}};
  const options={lines:['ROYAL VIP','GOLD'],size:30,width:240,padding:20,font:'800 30px serif',color:'#E9B83F',strokeWidth:0.8,strokeColor:'#6D350A'};
  const plain=make();drawStyledText(plain,options);assert.equal(plain.gradients.length,0);assert.deepEqual(plain.calls.filter(c=>c[0]==='stroke'||c[0]==='fill').map(c=>[c[0],...c.slice(-3)]),[['stroke','ROYAL VIP',120,50],['fill','ROYAL VIP',120,50],['stroke','GOLD',120,89],['fill','GOLD',120,89]]);
  for(const key of ['brightGold','champagne','silver','roseGold']){const ctx=make();drawStyledText(ctx,{...options,styleKey:key,color:TEXT_STYLES[key].baseColor});assert.equal(ctx.gradients.length,4);assert.equal(ctx.gradients[1].stops.length,10);assert.deepEqual(ctx.gradients[1].coords,[0,26,0,56]);assert.equal(ctx.calls.at(-1)[0],'restore');const extent=textStylePadding(key,30);assert.ok(extent>=30*.07+30*.018);assert.ok(ctx.calls.filter(c=>c[0]==='fill').some(c=>c.at(-1)>89));}
  const custom=make();drawStyledText(custom,{...options,styleKey:'brightGold',color:'#2388EE'});const gold=make();drawStyledText(gold,{...options,styleKey:'brightGold'});assert.notDeepEqual(custom.gradients[1].stops,gold.gradients[1].stops,'edited fill must tint metal');
  assert.equal(textStylePadding('plain',30),0);assert.equal(textStylePadding('unknown',30),0);
  const fallback=make();drawStyledText(fallback,{...options,styleKey:'unknown'});assert.equal(fallback.gradients.length,0);
  console.log('avatar-text-style: plain fidelity, four metallic palettes, editable tint, per-line reflections, extrusion bounds and context restoration passed.');
})().catch(error=>{console.error(error);process.exitCode=1});
