// Spine 4.2 binary writer for this tool's generated, non-weighted region/mesh rig.
// Format checked against the official spine-core 4.2.120 SkeletonBinary reader:
// https://github.com/EsotericSoftware/spine-runtimes/blob/4.2/spine-ts/spine-core/src/SkeletonBinary.ts
// This is binary animation data, not a native .spine Editor project.
function fail(message){throw Error('Spine 二进制导出：'+message);}
function keys(value,allowed,label){
  if(!value||typeof value!=='object'||Array.isArray(value))fail(label+'需要是对象');
  for(const key of Object.keys(value))if(!allowed.includes(key))fail(label+'不支持 '+key);
}
function number(value,fallback=0){
  value=value??fallback;
  if(typeof value!=='number'||!Number.isFinite(value)||!Number.isFinite(Math.fround(value)))fail('存在无效数值');
  return value;
}
function index(map,name,label){if(!map.has(name))fail(label+'不存在：'+name);return map.get(name);}
function rgba(value='ffffffff'){
  if(typeof value!=='string'||!/^([\da-f]{6}|[\da-f]{8})$/i.test(value))fail('颜色需要为 RGB/RGBA 十六进制');
  return Number.parseInt(value.length===6?value+'ff':value,16)>>>0;
}
function frames(value,label){
  if(!Array.isArray(value)||!value.length||value.length>10000)fail(label+'关键帧数量无效');
  let previous=-1;
  for(const frame of value){const t=number(frame.time);if(t<0||t<previous)fail(label+'关键帧时间需要有序且非负');previous=t;}
  return value;
}
function curve(frame){
  if(frame.curve===undefined||frame.curve==='linear')return 0;
  if(frame.curve==='stepped')return 1;
  fail('仅支持当前生成器的线性或阶跃曲线');
}
class Output {
  bytes=new Uint8Array(65536);view=new DataView(this.bytes.buffer);length=0;
  reserve(size){
    if(this.length+size>32*1024*1024)fail('骨架超过32 MiB');
    if(this.length+size<=this.bytes.length)return;
    const next=new Uint8Array(Math.max(this.bytes.length*2,this.length+size));next.set(this.bytes);this.bytes=next;this.view=new DataView(next.buffer);
  }
  byte(value){this.reserve(1);this.bytes[this.length++]=value;}
  int32(value){this.reserve(4);this.view.setInt32(this.length,value|0);this.length+=4;}
  float(value){this.reserve(4);this.view.setFloat32(this.length,number(value));this.length+=4;}
  int(value,positive=true){
    if(!Number.isInteger(value)||value< -2147483648||value>2147483647)fail('整数超出32位范围');
    let bits=positive?value>>>0:((value<<1)^(value>>31))>>>0;
    while(bits>127){this.byte((bits&127)|128);bits>>>=7;}this.byte(bits);
  }
  string(value){
    if(value==null){this.int(0);return;}
    if(typeof value!=='string')fail('字符串无效');
    // The official reader decodes UTF-8 BMP code units. Rig identifiers are ASCII.
    const bytes=[];
    for(let i=0;i<value.length;i++){
      const c=value.charCodeAt(i);if(c>=0xd800&&c<=0xdfff)fail('标识暂不支持非BMP字符');
      if(c<128)bytes.push(c);else if(c<2048)bytes.push(192|(c>>6),128|(c&63));else bytes.push(224|(c>>12),128|((c>>6)&63),128|(c&63));
    }
    this.int(bytes.length+1);this.reserve(bytes.length);this.bytes.set(bytes,this.length);this.length+=bytes.length;
  }
  finish(){return this.bytes.slice(0,this.length);}
}

export function writeSpineBinary(input){
  const json=typeof input==='string'?JSON.parse(input):input;
  keys(json,['skeleton','bones','slots','skins','events','animations'],'骨架');
  if(!/^4\.2\.\d+$/.test(json.skeleton?.spine||''))fail('仅支持 Spine 4.2 数据');
  if(!Array.isArray(json.bones)||!json.bones.length||!Array.isArray(json.slots)||!json.slots.length)fail('缺少骨骼或插槽');
  if(json.skins?.length!==1||json.skins[0].name!=='default')fail('仅支持本项目的单个 default skin');
  const bones=new Map(json.bones.map((bone,i)=>[bone.name,i])),slots=new Map(json.slots.map((slot,i)=>[slot.name,i]));
  if(bones.size!==json.bones.length||slots.size!==json.slots.length)fail('骨骼或插槽重名');
  const strings=new Map();
  function collect(value){
    if(typeof value==='string'&&value&&!strings.has(value))strings.set(value,strings.size+1);
    else if(Array.isArray(value))for(const item of value)collect(item);
    else if(value&&typeof value==='object')for(const [key,item]of Object.entries(value)){collect(key);collect(item);}
  }
  collect(json);
  const out=new Output(),ref=value=>out.int(value==null?0:index(strings,value,'字符串'));
  out.int32(0);out.int32(0);out.string(json.skeleton.spine);
  for(const key of ['x','y','width','height'])out.float(number(json.skeleton[key]));
  out.float(number(json.skeleton.referenceScale,100));out.byte(1); // nonessential fields preserve image paths and mesh sizes.
  out.float(number(json.skeleton.fps,30));out.string(json.skeleton.images??null);out.string(json.skeleton.audio??null);
  out.int(strings.size);for(const text of strings.keys())out.string(text);
  out.int(json.bones.length);
  for(const [i,bone]of json.bones.entries()){
    keys(bone,['name','parent','rotation','x','y','scaleX','scaleY','shearX','shearY','length','inherit','skin','color'],'骨骼');
    out.string(bone.name);
    if(i){const parent=index(bones,bone.parent,'父骨骼');if(parent>=i)fail('父骨骼必须排在子骨骼之前');out.int(parent);}
    else if(bone.parent)fail('root不能有父骨骼');
    for(const key of ['rotation','x','y','scaleX','scaleY','shearX','shearY','length'])out.float(number(bone[key],key.startsWith('scale')?1:0));
    if(bone.inherit&&bone.inherit.toLowerCase()!=='normal')fail('仅支持 normal 骨骼继承');
    out.byte(0);out.byte(bone.skin?1:0);out.int32(rgba(bone.color??'00000000'));out.string(null);out.byte(0);
  }
  out.int(json.slots.length);
  for(const slot of json.slots){
    keys(slot,['name','bone','color','attachment','blend'],'插槽');
    if(slot.blend&&slot.blend!=='normal')fail('仅支持 normal 混合');
    out.string(slot.name);out.int(index(bones,slot.bone,'插槽骨骼'));out.int32(rgba(slot.color));out.int32(-1);ref(slot.attachment??null);out.int(0);out.byte(1);
  }
  for(let i=0;i<4;i++)out.int(0); // IK, transform, path, physics constraints.
  const attachments=json.skins[0].attachments;
  keys(json.skins[0],['name','attachments'],'皮肤');
  const skinEntries=Object.entries(attachments);
  out.int(skinEntries.length);
  for(const [slotName,map]of skinEntries){
    out.int(index(slots,slotName,'附件插槽'));out.int(Object.keys(map).length);
    for(const [name,a]of Object.entries(map)){
      ref(name);
      const mesh=a.type==='mesh';
      if(!mesh&&a.type&&a.type!=='region')fail('仅支持 region 与非加权 mesh 附件');
      keys(a,mesh?['type','name','path','color','width','height','uvs','triangles','vertices','hull','edges']:
        ['type','name','path','color','rotation','x','y','scaleX','scaleY','width','height'],'附件');
      const renamed=a.name&&a.name!==name,rotation=number(a.rotation);
      out.byte((mesh?2:0)|16|32|(renamed?8:0)|(!mesh&&rotation?128:0));
      if(renamed)ref(a.name);ref(a.path??a.name??name);out.int32(rgba(a.color));
      if(mesh){
        if(!Array.isArray(a.vertices)||!Array.isArray(a.uvs)||a.vertices.length!==a.uvs.length||a.vertices.length%2)fail('不支持加权或不完整网格');
        const hull=a.hull??0,vertices=a.vertices.length;
        if(!Number.isInteger(hull)||hull<0||hull>vertices/2||a.triangles?.length!==(vertices-hull-2)*3)fail('网格三角形数量与 hull 不匹配');
        out.int(hull);out.int(vertices/2);for(const value of a.vertices)out.float(value);for(const value of a.uvs)out.float(value);
        for(const value of a.triangles){if(!Number.isInteger(value)||value<0||value>=vertices/2)fail('网格三角形索引无效');out.int(value);}
        out.int(a.edges?.length||0);for(const edge of a.edges||[])out.int(edge);out.float(number(a.width));out.float(number(a.height));
      }else{
        if(rotation)out.float(rotation);
        for(const key of ['x','y','scaleX','scaleY','width','height'])out.float(number(a[key],key.startsWith('scale')?1:0));
      }
    }
  }
  out.int(0); // Additional skins; no linked meshes.
  const eventEntries=Object.entries(json.events||{}),events=new Map(eventEntries.map(([name],i)=>[name,i]));
  out.int(eventEntries.length);
  for(const [name,event]of eventEntries){
    keys(event,['int','float','string','audio','volume','balance'],'事件定义');
    out.string(name);out.int(event.int??0,false);out.float(number(event.float));out.string(event.string??'');out.string(event.audio??null);
    if(event.audio){out.float(number(event.volume,1));out.float(number(event.balance));}
  }
  const animations=Object.entries(json.animations||{});out.int(animations.length);
  for(const [name,animation]of animations){
    keys(animation,['slots','bones','attachments','drawOrder','events'],'动画');out.string(name);
    const slotGroups=Object.entries(animation.slots||{}),boneGroups=Object.entries(animation.bones||{});
    const deformSkins=Object.entries(animation.attachments||{});
    if(deformSkins.some(([name])=>name!=='default'))fail('仅支持 default skin 的变形');
    const deformGroups=Object.entries(animation.attachments?.default||{}),order=animation.drawOrder||[],eventFrames=animation.events||[];
    const timelineCount=slotGroups.reduce((n,[,v])=>n+Object.keys(v).length,0)+boneGroups.reduce((n,[,v])=>n+Object.keys(v).length,0)+
      deformGroups.reduce((n,[,v])=>n+Object.keys(v).length,0)+(order.length?1:0)+(eventFrames.length?1:0);
    out.int(timelineCount);
    out.int(slotGroups.length);
    for(const [slotName,timelines]of slotGroups){
      keys(timelines,['attachment','rgba'],'插槽时间线');out.int(index(slots,slotName,'时间线插槽'));out.int(Object.keys(timelines).length);
      for(const [type,raw]of Object.entries(timelines)){
        const list=frames(raw,type);out.byte(type==='attachment'?0:1);out.int(list.length);
        if(type==='attachment')for(const frame of list){keys(frame,['time','name'],'换图帧');out.float(number(frame.time));ref(frame.name??null);}
        else{
          out.int(0); // No Beziers in generated numeric motion.
          for(const [i,frame]of list.entries()){
            keys(frame,['time','color','curve'],'颜色帧');out.float(number(frame.time));const color=rgba(frame.color);
            for(const shift of [24,16,8,0])out.byte((color>>>shift)&255);
            if(i)out.byte(curve(list[i-1]));
          }
          curve(list.at(-1));
        }
      }
    }
    out.int(boneGroups.length);
    for(const [boneName,timelines]of boneGroups){
      keys(timelines,['translate','scale'],'骨骼时间线');out.int(index(bones,boneName,'时间线骨骼'));out.int(Object.keys(timelines).length);
      for(const [type,raw]of Object.entries(timelines)){
        const list=frames(raw,type);out.byte(type==='translate'?1:4);out.int(list.length);out.int(0);
        for(const [i,frame]of list.entries()){
          keys(frame,['time','x','y','curve'],'骨骼帧');out.float(number(frame.time));out.float(number(frame.x,type==='scale'?1:0));out.float(number(frame.y,type==='scale'?1:0));
          if(i)out.byte(curve(list[i-1]));
        }
        curve(list.at(-1));
      }
    }
    for(let i=0;i<4;i++)out.int(0); // Constraint animation groups.
    out.int(deformGroups.length?1:0);
    if(deformGroups.length){out.int(0);out.int(deformGroups.length);}
    for(const [slotName,map]of deformGroups){
      out.int(index(slots,slotName,'变形插槽'));out.int(Object.keys(map).length);
      for(const [attachmentName,timelines]of Object.entries(map)){
        keys(timelines,['deform'],'附件时间线');const a=attachments[slotName]?.[attachmentName];if(a?.type!=='mesh')fail('变形目标需要是 mesh');
        const list=frames(timelines.deform,'deform');ref(attachmentName);out.byte(0);out.int(list.length);out.int(0);out.float(number(list[0].time));
        for(const [i,frame]of list.entries()){
          keys(frame,['time','vertices','offset','curve'],'变形帧');if(i){out.float(number(frame.time));out.byte(curve(list[i-1]));}
          const vertices=frame.vertices||[],offset=frame.offset??0;
          if(!Array.isArray(vertices)||!Number.isInteger(offset)||offset<0||offset+vertices.length>a.vertices.length)fail('变形坐标范围无效');
          out.int(vertices.length);if(vertices.length){out.int(offset);for(const value of vertices)out.float(value);}
        }
        curve(list.at(-1));
      }
    }
    out.int(order.length);
    for(const frame of order){
      keys(frame,['time','offsets'],'换层帧');out.float(number(frame.time));
      const offsets=frame.offsets||[];out.int(offsets.length);let previous=-1;
      for(const value of offsets){keys(value,['slot','offset'],'换层偏移');const slot=index(slots,value.slot,'换层插槽');
        if(slot<=previous||!Number.isInteger(value.offset)||slot+value.offset<0||slot+value.offset>=slots.size)fail('换层索引或顺序无效');
        out.int(slot);out.int(value.offset);previous=slot;
      }
    }
    out.int(eventFrames.length);
    for(const frame of eventFrames){
      keys(frame,['time','name','int','float','string','volume','balance'],'事件帧');out.float(number(frame.time));out.int(index(events,frame.name,'事件'));
      const event=json.events[frame.name];out.int(frame.int??event.int??0,false);out.float(number(frame.float,event.float??0));out.string(frame.string??null);
      if(event.audio){out.float(number(frame.volume,1));out.float(number(frame.balance));}
    }
  }
  return out.finish();
}
