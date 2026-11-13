const assert=require('node:assert/strict');
(async()=>{
  const {TEXT_STYLES,defaultTextHighlight,drawStyledText}=await import('../avatar-text-style.mjs');
  const make=()=>{const calls=[],gradients=[];return {calls,gradients,save(){calls.push(['save'])},restore(){calls.push(['restore'])},measureText(){return {actualBoundingBoxAscent:24,actualBoundingBoxDescent:6}},strokeText(...args){calls.push(['stroke',this.strokeStyle,this.lineWidth,...args])},fillText(...args){calls.push(['fill',this.fillStyle,...args])},createLinearGradient(...coords){const stops=[];gradients.push({coords,stops});return {addColorStop(...args){stops.push(args)}}}}};
  const options={lines:['ROYAL VIP','GOLD'],size:30,width:240,padding:20,font:'800 30px serif',color:'#E9B83F',strokeWidth:0.8,strokeColor:'#6D350A'};
  const plain=make();drawStyledText(plain,options);assert.equal(plain.gradients.length,0);assert.deepEqual(plain.calls.filter(c=>c[0]==='stroke'||c[0]==='fill').map(c=>[c[0],...c.slice(-3)]),[['stroke','ROYAL VIP',120,50],['fill','ROYAL VIP',120,50],['stroke','GOLD',120,89],['fill','GOLD',120,89]]);
  for(const key of ['brightGold','champagne','silver','roseGold']){
    const ctx=make(),base=TEXT_STYLES[key].baseColor;
    drawStyledText(ctx,{...options,styleKey:key,color:base});
    assert.deepEqual(ctx.gradients,[[0,26,0,56],[0,65,0,95]].map(coords=>({coords,stops:[[0,defaultTextHighlight(base)],[1,base]]})));
    assert.equal(ctx.calls.filter(c=>c[0]==='fill').length,2,'each line is painted once');
    assert.equal(ctx.calls.filter(c=>c[0]==='stroke').length,2,'only the configured outline is painted');
    assert.equal(ctx.calls.at(-1)[0],'restore');
  }
  const custom=make();
  drawStyledText(custom,{...options,styleKey:'brightGold',color:'#2388EE',highlightColor:'#F97EBB',strokeWidth:0});
  assert.deepEqual(custom.gradients[0].stops,[[0,'#F97EBB'],[1,'#2388EE']]);
  assert.equal(custom.calls.filter(c=>c[0]==='stroke').length,0);
  const threeTone=make();
  drawStyledText(threeTone,{...options,styleKey:'threeToneGold',color:undefined});
  assert.deepEqual(threeTone.gradients.map(gradient=>gradient.stops),
    Array.from({length:2},()=>[[0,'#FFF3BD'],[.5,'#F4C64F'],[1,'#A96317']]));
  const edited=make();
  drawStyledText(edited,{...options,styleKey:'threeToneGold',color:'#69330C',highlightColor:'#FFF0CD',midColor:'#DE9118'});
  assert.deepEqual(edited.gradients[0].stops,[[0,'#FFF0CD'],[.5,'#DE9118'],[1,'#69330C']]);
  const fallback=make();drawStyledText(fallback,{...options,styleKey:'unknown'});assert.equal(fallback.gradients.length,0);
  console.log('avatar-text-style: solid fill, two- and three-stop presets, per-line gradients, editable colors and optional outlines passed.');
})().catch(error=>{console.error(error);process.exitCode=1});
