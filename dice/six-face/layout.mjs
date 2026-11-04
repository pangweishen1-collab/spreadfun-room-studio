// Fit visible content, rather than transparent canvas margins, into each cell.
export function previewPose(prepared,point,all=true){
 const source=prepared?.sourceSize,crop=prepared?.crop,offset=prepared?.cropOffset;
 if(!Number.isFinite(source)||source<=0||!crop||!offset||!Number.isInteger(point)||point<1||point>6)throw Error('预览布局参数无效');
 const ratio=Math.max(crop[2],crop[3])/source;if(!Number.isFinite(ratio)||ratio<=0||ratio>1)throw Error('骰面裁框超出画布');
 const fit=Math.min(1,.655/ratio),size=(all?172:300)*fit;
 return {point,size,scale:size/200,x:(all?[118,280,442][(point-1)%3]:280)-offset[0]*size/source,y:(all?(point<=3?150:333):240)-offset[1]*size/source};
}
