const assert=require('node:assert/strict');
(async()=>{
 const {keyPixels}=await import('../vap-matte.mjs');
 const width=96,height=128;
 function plate({subject=true,padding=false}={}){
  const data=new Uint8ClampedArray(width*height*4);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
   const i=(y*width+x)*4;
   if(padding&&(x<5||x>=width-5||y<12||y>=height-12))continue;
   const n=((x*7+y*11)%5)-2,r=40+40*x/width+25*y/height+n,g=125+20*x/width+40*y/height+n,b=25+15*x/width+20*y/height+n;
   data.set([r,g,b,255],i);
   if(x>8&&x<25&&y>92&&y<105)for(let c=0;c<3;c++)data[i+c]=Math.round(data[i+c]*.6);
   if(subject&&x>32&&x<66&&y>35&&y<105)data.set([180,100,45,255],i);
  }
  for(const [x,y,color] of [[10,96,[21,59,9]],[11,97,[0,27,0]],[12,98,[2,23,0]],[13,99,[0,11,0]],[6,110,[36,119,54]],[8,108,[0,41,6]],[9,109,[3,34,12]],[15,100,[53,127,58]]])data.set([...color,255],(y*width+x)*4);
  if(subject)data.set([53,127,58,255],(90*width+50)*4);
  if(subject){for(const [x,y,color] of [[43,50,[10,100,140]],[46,58,[12,18,25]],[52,70,[245,245,245]],[55,85,[40,100,190]],[18,36,[255,190,60]]])data.set([...color,255],(y*width+x)*4);}
  return data;
 }
 const opts={matteMethod:'chroma_key',background:[75,155,47],adaptiveChroma:true},raw=plate(),copy=raw.slice(),workspace={};
 const out=keyPixels(raw,width,height,opts,workspace);assert.deepEqual(raw,copy,'keying never mutates source pixels');
 for(const [x,y] of [[1,1],[width-2,2],[10,96],[11,97],[12,98],[13,99],[6,110],[8,108],[9,109],[15,100],[50,90],[20,100],[80,115],[47,115]])assert.equal(out[(y*width+x)*4+3],0,'gradient/shadow plate is fully transparent');
 for(const [x,y] of [[43,50],[46,58],[52,70],[55,85],[18,36],[45,80]])assert.deepEqual(out.slice((y*width+x)*4,(y*width+x)*4+4),raw.slice((y*width+x)*4,(y*width+x)*4+4),'turquoise/dark/white/blue/gold foreground stays intact');
 for(const permutation of [[1,0,2],[2,0,1]]){
  const permuted=new Uint8ClampedArray(raw.length);for(let i=0;i<raw.length;i+=4){for(let c=0;c<3;c++)permuted[i+c]=raw[i+permutation[c]];permuted[i+3]=raw[i+3];}
  const result=keyPixels(permuted,width,height,{...opts,background:permutation.map(c=>opts.background[c])});
  for(const [x,y] of [[1,1],[10,96],[80,115]])assert.equal(result[(y*width+x)*4+3],0,'red and blue dominant plates share varying-screen cleanup');
  for(const [x,y] of [[46,58],[52,70],[45,80]])assert.deepEqual(result.slice((y*width+x)*4,(y*width+x)*4+4),permuted.slice((y*width+x)*4,(y*width+x)*4+4),'other key channels preserve foreground cores');
 }
 const protectedPixels=plate();for(const [x,y,color] of [[43,60,[3,6,20]],[44,60,[17,10,5]],[45,60,[9,11,10]],[46,60,[120,100,5]],[47,60,[10,46,48]],[48,60,[2,46,11]]])protectedPixels.set([...color,255],(y*width+x)*4);
 const protectedOut=keyPixels(protectedPixels,width,height,opts);for(const x of [43,44,45,47,48])assert.deepEqual(protectedOut.slice((60*width+x)*4,(60*width+x)*4+4),protectedPixels.slice((60*width+x)*4,(60*width+x)*4+4),'enclosed blue/brown/neutral/cyan and screen-coloured dark foreground cores remain protected');
 assert(protectedOut[(60*width+46)*4+3]>=190&&protectedOut[(60*width+46)*4]>protectedOut[(60*width+46)*4+1]+20,'low-luminance warm details stay visible and warm; exact mixed-pixel reconstruction is not asserted');
 const flat=keyPixels(raw,width,height,{...opts,adaptiveChroma:false});assert.deepEqual(flat,keyPixels(raw,width,height,{matteMethod:'chroma_key',background:opts.background}),'disabled path preserves old bytes');
 assert.throws(()=>keyPixels(raw,width,height,{...opts,adaptiveChroma:'yes'}),/渐变/);
 const clear=keyPixels(plate({subject:false}),width,height,opts,workspace);assert(clear.every((v,i)=>i%4!==3||v===0),'reused exterior/reference scratch clears an actor-free frame');
 const padded=plate({padding:true}),contained=keyPixels(padded,width,height,opts,workspace);assert.equal(contained[3],0);assert.equal(contained[(80*width+45)*4+3],255,'transparent contain padding still seeds exterior cleanup');
 const wide=plate({padding:true});for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(x<24||x>=width-24)wide.fill(0,(y*width+x)*4,(y*width+x)*4+4);const wideOut=keyPixels(wide,width,height,opts,workspace);assert.equal(wideOut[(20*width+25)*4+3],0,'wide horizontal contain bars do not defeat plate calibration');assert.equal(wideOut[(80*width+45)*4+3],255);
 const tiny=new Uint8ClampedArray([20,200,30,255]);assert.deepEqual(keyPixels(tiny,1,1,opts),keyPixels(tiny,1,1,{...opts,adaptiveChroma:false}),'unreliable small calibration falls back');
 console.log('vap-adaptive-chroma: smooth varying plate/shadow cleanup, source immutability, turquoise/dark/white/blue/gold preservation, transparent padding, fresh reused scratch, disabled byte parity and small-frame fallback passed. Real video edges checked separately.');
})().catch(e=>{console.error(e);process.exitCode=1});
