// Fixed-template patch, not a general Spine binary writer. Offsets were located
// with the official 4.2.120 reader. Every unrelated byte is copied verbatim.
const SOURCE_SHA256='cab760956e1b7bbc3b86ea3f90a17bfca9fd62c2121e8bfd4070db1c26ac15ef';
const SOURCE_BYTES=5579,EVENT_DATA_OFFSET=2757,ANIMATION_COUNT_OFFSET=2758;
const SPINS=[
  {name:'spin_1',start:2766,event:3061},
  {name:'spin_2',start:3069,event:3364},
  {name:'spin_3',start:3372,event:3667},
  {name:'spin_4',start:3675,event:3970},
  {name:'spin_5',start:3978,event:4273},
  {name:'spin_6',start:4281,event:4576},
];
const unsupported=()=>new Error('紫色模板与声音补丁不匹配，未修改骨架，请使用已验证的原始模板');
const concat=parts=>{const out=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let offset=0;for(const part of parts){out.set(part,offset);offset+=part.length;}return out;};
const byte=value=>Uint8Array.of(value);
const float=value=>{const bytes=new Uint8Array(4);new DataView(bytes.buffer).setFloat32(0,value,false);return bytes;};
const string=value=>{const bytes=new TextEncoder().encode(value);if(bytes.length>=127)throw unsupported();return concat([byte(bytes.length+1),bytes]);};
const definition=name=>concat([string(name),byte(0),float(0),string(''),string('sound/'+name+'.mp3'),float(1),float(0)]);
const frame=(time,index)=>concat([float(time),byte(index),byte(0),float(0),byte(0),float(1),float(0)]);

/** Accept the pristine bundled template only; reject unknown/already-patched
 * binaries rather than duplicating events or guessing their binary layout.
 * Blob, ArrayBuffer and typed-array views are accepted. The input is untouched.
 */
export async function patchTemplateSounds(input){
  if(input&&typeof input.arrayBuffer==='function')input=await input.arrayBuffer();
  let bytes;
  if(ArrayBuffer.isView(input))bytes=new Uint8Array(input.buffer,input.byteOffset,input.byteLength).slice();
  else if(input instanceof ArrayBuffer)bytes=new Uint8Array(input.slice(0));
  else throw unsupported();
  if(bytes.length!==SOURCE_BYTES)throw unsupported();
  if(!globalThis.crypto?.subtle)throw new Error('当前环境无法校验紫色模板，请使用HTTPS或本地服务');
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');
  if(hash!==SOURCE_SHA256||bytes[EVENT_DATA_OFFSET]!==0||bytes[ANIMATION_COUNT_OFFSET]!==12)throw unsupported();
  const edits=[{offset:EVENT_DATA_OFFSET,replacement:concat([byte(2),definition('dice_roll'),definition('sound_ui_dice6')])}];
  for(const spin of SPINS){
    const label=concat([byte(spin.name.length+1),new TextEncoder().encode(spin.name)]);
    if(bytes[spin.start]!==13||bytes[spin.event]!==0||!label.every((value,i)=>bytes[spin.start-label.length+i]===value))throw unsupported();
    edits.push({offset:spin.start,replacement:byte(14)},
      {offset:spin.event,replacement:spin.name==='spin_6'?concat([byte(2),frame(0,0),frame(.6,1)]):concat([byte(1),frame(0,0)])});
  }
  edits.sort((a,b)=>a.offset-b.offset);
  const parts=[];let offset=0;
  for(const edit of edits){parts.push(bytes.subarray(offset,edit.offset),edit.replacement);offset=edit.offset+1;}
  parts.push(bytes.subarray(offset));return concat(parts);
}
