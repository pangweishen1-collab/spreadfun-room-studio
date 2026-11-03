/* One canvas treatment is shared by the editor bitmap and exported SVGA sprite. */
export const TEXT_STYLES=Object.freeze({
  plain:Object.freeze({}),
  brightGold:Object.freeze({baseColor:'#E9B83F',outlineColor:'#6D350A',outlineWidth:0.8}),
  champagne:Object.freeze({baseColor:'#D9BF87',outlineColor:'#765435',outlineWidth:0.7}),
  silver:Object.freeze({baseColor:'#B7C6D7',outlineColor:'#3B485B',outlineWidth:0.7}),
  roseGold:Object.freeze({baseColor:'#D79584',outlineColor:'#763C3B',outlineWidth:0.7})
});

function rgb(hex){const value=/^#[\da-f]{6}$/i.test(hex||'')?hex:'#E9B83F';return [1,3,5].map(i=>parseInt(value.slice(i,i+2),16))}
function mix(color,target,amount){return `rgb(${color.map((v,i)=>Math.round(v+(target[i]-v)*amount)).join(',')})`}
const WHITE=[255,255,255],BLACK=[0,0,0];
function gradient(ctx,top,bottom,colors){const value=ctx.createLinearGradient(0,top,0,bottom);for(const [stop,color] of colors)value.addColorStop(stop,color);return value}

export function textStylePadding(styleKey,size){return styleKey!=='plain'&&TEXT_STYLES[styleKey]?Math.ceil(size*.1+2):0}

export function drawStyledText(ctx,{lines,size,width,padding,font,color,strokeWidth=0,strokeColor='#000000',styleKey='plain'}){
  const metallic=styleKey!=='plain'&&!!TEXT_STYLES[styleKey],base=rgb(color||TEXT_STYLES[styleKey]?.baseColor),depth=Math.max(0.7,size*.07),bevel=Math.max(0.35,size*.018);
  ctx.save();ctx.font=font;ctx.textBaseline='alphabetic';ctx.textAlign='center';ctx.lineJoin='round';ctx.miterLimit=2;
  lines.forEach((line,i)=>{
    const x=width/2,y=padding+size+i*size*1.3;
    if(!metallic){ctx.fillStyle=color;ctx.strokeStyle=strokeColor;ctx.lineWidth=strokeWidth*2;if(strokeWidth>0)ctx.strokeText(line,x,y);ctx.fillText(line,x,y);return}
    const measured=ctx.measureText(line||' '),ascent=measured.actualBoundingBoxAscent||size*.8,descent=measured.actualBoundingBoxDescent||size*.18,top=y-ascent,bottom=y+descent;
    // A short, opaque extrusion avoids blurry shadows and survives small WebP previews.
    ctx.fillStyle=mix(base,BLACK,.68);ctx.strokeStyle=mix(base,BLACK,.75);ctx.lineWidth=strokeWidth*2+bevel*2;
    const steps=Math.ceil(depth*2);for(let step=steps;step>=1;step--){const offset=depth*step/steps;ctx.strokeText(line,x+offset*.7,y+offset);ctx.fillText(line,x+offset*.7,y+offset)}
    if(strokeWidth>0){ctx.strokeStyle=strokeColor;ctx.lineWidth=strokeWidth*2+bevel*2;ctx.strokeText(line,x,y)}
    // The narrow outer rim catches light above and turns dark below like a bevel.
    ctx.strokeStyle=gradient(ctx,top,bottom,[[0,mix(base,WHITE,.9)],[.38,mix(base,WHITE,.25)],[.52,mix(base,BLACK,.48)],[1,mix(base,BLACK,.68)]]);ctx.lineWidth=bevel*2;ctx.strokeText(line,x,y);
    // Tight light/dark bands give the face a polished reflection rather than a flat gold fill.
    ctx.fillStyle=gradient(ctx,top,bottom,[[0,mix(base,WHITE,.85)],[.15,mix(base,WHITE,.32)],[.31,mix(base,WHITE,.68)],[.44,mix(base,BLACK,.16)],[.49,mix(base,BLACK,.44)],[.52,mix(base,WHITE,.92)],[.59,mix(base,WHITE,.28)],[.78,mix(base,BLACK,.07)],[.94,mix(base,WHITE,.62)],[1,mix(base,BLACK,.31)]]);ctx.fillText(line,x,y);
  });ctx.restore();
}
