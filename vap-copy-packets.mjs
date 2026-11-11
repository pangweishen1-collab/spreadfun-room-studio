import {exposeAvcPadding} from './vap-avc-padding.mjs';
import {appendVapcBox,insertVapcBox,isStandardVapCodec,makeVapc,readSourceVapConfig,validateVapc} from './vap-protocol.mjs?v=20261111-official-pack';

// avc1 uses the parameter sets in avcC. A sample that carries its own
// parameter sets could restore the old crop after the container is rewritten.
function canCopyAccessUnit(data){
  const view=new DataView(data.buffer,data.byteOffset,data.byteLength);
  let offset=0,hasPicture=false;
  while(offset<data.length){
    if(offset+4>=data.length)return false;
    const size=view.getUint32(offset);offset+=4;
    if(!size||offset+size>data.length||(data[offset]&0x80))return false;
    const type=data[offset]&31;
    if(type===1||type===5)hasPicture=true;
    else if(type!==6&&type!==9&&type!==12)return false;
    offset+=size;
  }
  return hasPicture;
}

const sameRect=(a,b)=>a?.length===4&&b?.length===4&&a.every((value,index)=>value===b[index]);
const shortTag=tag=>tag.replace(/^\[(.*)\]$/,'$1');

function matchesTextStyle(source,resource){
  const style=source.fontStyle,font=typeof style==='string'?style:style?.font;
  const size=typeof font==='string'&&font.length<=256?Number(font.match(/(?:^|\s)(\d+(?:\.\d+)?)px(?=\s|\/|$)/)?.[1]):NaN;
  const expectedSize=size>=8&&size<=256?size:Math.max(8,Math.min(256,Math.round((source.h||49)*.75)));
  const color=[source.color,style?.color].find(value=>typeof value==='string'&&/^#[0-9a-f]{6}$/i.test(value))||'#ffffff';
  return resource.fontSize===expectedSize&&resource.color.toLowerCase()===color.toLowerCase();
}

function sameResourceLayout(config,options,layout){
  if(!config.info.isVapx)return !options.resources.length;
  if(options.resourceMode!=='dynamic'||!layout.officialResourceMasks||config.src.length!==options.resources.length)return false;
  const byId=new Map();
  for(const [index,source] of config.src.entries()){
    const resource=options.resources[index];
    if(resource.sourceId!==source.srcId||shortTag(source.srcTag)!==resource.tag||
      resource.type!==(source.srcType==='img'?'image':'text')||resource.offsetX!==0||resource.offsetY!==0||
      resource.scaleX!==1||resource.scaleY!==1||resource.opacity!==1||resource.shape!=='square'||
      resource.avatarFrame||resource.transparentAvatar!==undefined||resource.animation==='float-pop'||
      resource.type==='text'&&!matchesTextStyle(source,resource))return false;
    byId.set(source.srcId,resource);
  }
  const [left,top,width,height]=layout.resourceMaskRegion;
  for(const {i,obj} of config.frame){
    const time=i/config.info.fps;
    for(const item of obj){
      const resource=byId.get(item.srcId),[x,y,w,h]=item.mFrame;
      if(!resource||time+1e-7<resource.start||resource.end!==null&&time>=resource.end-1e-7||
        item.mt!==0||x<left||y<top||x+w>left+width||y+h>top+height)return false;
    }
  }
  return true;
}

function copyProjectConfig(config,resourceConfig){
  const saved=config.funToolkit||{},prepared=resourceConfig?.funToolkit;
  const funToolkit={...saved,rgbAlphaMode:'premultiplied'};
  if(prepared){
    const existing=new Map((saved.resourceManifest||[]).map(item=>[item.tag,item]));
    Object.assign(funToolkit,prepared);
    funToolkit.resourceManifest=prepared.resourceManifest.map(item=>{
      // The source can already contain the baked badge. Keep its project flags
      // while binding the filenames and placeholder state from this download.
      const {file,placeholder,text,...source}=existing.get(item.tag)||{};
      return {...source,...item};
    });
  }
  return {...config,funToolkit};
}

async function copyFixedStandard(M,file,options,metadata,plan,signal,prepareAudioTrack){
  const declared=options.sourceVapConfig,source=declared?.info,layout=plan.layout;
  if(!source||!metadata.nativeOpaqueSource||options.verticalMask.enabled||options.giftFade.enabled||
    options.videoOffsetY!==0||options.rgbAlphaMode!=='premultiplied'||declared.funToolkit?.rgbAlphaMode==='straight'||
    source.w!==layout.w||source.h!==layout.h||source.videoW!==layout.videoW||source.videoH!==layout.videoH||
    source.fps!==options.fps||!sameRect(source.rgbFrame,layout.rgbFrame)||!sameRect(source.aFrame,layout.aFrame)||
    typeof globalThis.VideoDecoder?.isConfigSupported!=='function')return null;

  const started=performance.now();
  let input,output,verification;
  const abort=()=>{input?.dispose();void output?.cancel().catch(()=>{});};
  signal?.addEventListener('abort',abort,{once:true});
  try{
    if(signal?.aborted)return null;
    const embedded=await readSourceVapConfig(file);
    if(!embedded||JSON.stringify(embedded)!==JSON.stringify(declared))return null;
    validateVapc(embedded);
    if(!sameResourceLayout(embedded,options,layout))return null;
    input=new M.Input({source:new M.BlobSource(file),formats:[M.MP4]});
    const track=await input.getPrimaryVideoTrack(),decode=await track?.getDecoderConfig();
    if(!isStandardVapCodec(decode?.codec)||(decode.description?.[4]&3)!==3||
      await track.getCodedWidth()!==source.videoW||await track.getCodedHeight()!==source.videoH||
      !(await VideoDecoder.isConfigSupported(decode)).supported)return null;

    let packetBytes=0;
    const packets=[];
    for await(const packet of new M.EncodedPacketSink(track).packets()){
      if(signal?.aborted)return null;
      packetBytes+=packet.byteLength;
      if(packetBytes>plan.byteLimit||packets.length>=source.f||
        !Number.isFinite(packet.timestamp)||!Number.isFinite(packet.duration)||
        Math.abs(packet.timestamp-packets.length/source.fps)>.00001||
        Math.abs(packet.duration-1/source.fps)>.00001||
        (!packets.length&&packet.type!=='key')||!canCopyAccessUnit(packet.data))return null;
      packets.push(packet);
    }
    if(packets.length!==source.f||signal?.aborted)return null;

    let audio, audioMode=metadata.hasAudio?'muted':'none';
    if(metadata.hasAudio&&options.keepAudio&&options.audioGain>0){
      const track=await input.getPrimaryAudioTrack();
      if(!track)return null;
      if(prepareAudioTrack)audio=await prepareAudioTrack(track);
      else if(metadata.audioCodec==='aac'&&options.audioGain===1){
        const source=new M.EncodedAudioPacketSource('aac');
        audio={source,mode:'copied',async write(){
          const decoderConfig=await track.getDecoderConfig();
          if(!decoderConfig)throw new Error('Missing AAC decoder configuration');
          let first=true;
          for await(const packet of new M.EncodedPacketSink(track).packets()){
            if(signal?.aborted)throw signal.reason;
            await source.add(packet,first?{decoderConfig}:undefined);first=false;
          }
        }};
      }
      if(!audio)return null;
      audioMode=audio.mode;
    }

    const target=new M.BufferTarget();
    output=new M.Output({format:new M.Mp4OutputFormat({fastStart:'in-memory'}),target});
    const video=new M.EncodedVideoPacketSource('avc');
    output.addVideoTrack(video,{frameRate:source.fps});
    if(audio)output.addAudioTrack(audio.source);
    await output.start();
    const writeTrack=async (track,write)=>{
      try{await write();}
      catch(error){void output.cancel().catch(()=>{});throw error;}
      finally{track.close();}
    };
    const writes=[writeTrack(video,async()=>{
      for(const [index,packet] of packets.entries()){
        if(signal?.aborted)throw signal.reason;
        await video.add(packet,index===0?{decoderConfig:decode}:undefined);
      }
    })];
    if(audio)writes.push(writeTrack(audio.source,audio.write));
    if((await Promise.allSettled(writes)).some(result=>result.status==='rejected')||signal?.aborted)return null;
    await output.finalize();
    const config=copyProjectConfig(embedded,plan.resourceConfig);
    const bytes=insertVapcBox(new Uint8Array(target.buffer),config);
    if(bytes.byteLength>plan.byteLimit||signal?.aborted)return null;
    const blob=new Blob([bytes],{type:'video/mp4'});
    verification=new M.Input({source:new M.BlobSource(blob),formats:[M.MP4]});
    const remuxed=await verification.getPrimaryVideoTrack();
    if(!remuxed||await remuxed.getDisplayWidth()!==source.videoW||await remuxed.getDisplayHeight()!==source.videoH)return null;
    const first=await new M.CanvasSink(remuxed,{poolSize:1,width:2,height:2,fit:'fill'}).getCanvas(0);
    if(!first||signal?.aborted)return null;
    return {blob,config,layout,frames:source.f,audioMode,actualCodec:decode.codec,requestedCodec:decode.codec,
      bitrate:Math.round(packetBytes*8*source.fps/source.f),processingPath:'native-vap-copy',times:{wallMs:performance.now()-started}};
  }catch{
    return null;
  }finally{
    signal?.removeEventListener('abort',abort);
    if(output?.state==='started')await output.cancel().catch(()=>{});
    verification?.dispose();
    input?.dispose();
  }
}

export async function copyPackedVideo(M,file,options,metadata,plan,signal,{prepareAudioTrack}={}){
  if(options.fixedStandard)return copyFixedStandard(M,file,options,metadata,plan,signal,prepareAudioTrack);
  const source=options.sourceVapConfig?.info;
  if(options.sourceVapCopyEligible!==true||!source||source.isVapx!==0||options.resources.length||
    options.verticalMask.enabled||options.giftFade.enabled||options.videoOffsetY!==0||
    options.rgbAlphaMode!=='premultiplied'||source.w!==options.width||source.h!==options.height||
    source.fps!==options.fps||source.aFrame[2]!==plan.layout.aFrame[2]||source.aFrame[3]!==plan.layout.aFrame[3]||
    !metadata.nativeOpaqueSource||(metadata.hasAudio&&options.keepAudio&&options.audioGain>0)||
    file.size>plan.byteLimit||typeof globalThis.VideoDecoder?.isConfigSupported!=='function')return null;

  const started=performance.now();
  let input,output,verification;
  try{
    input=new M.Input({source:new M.BlobSource(file),formats:[M.MP4]});
    const track=await input.getPrimaryVideoTrack(),decoderConfig=await track?.getDecoderConfig();
    if(!decoderConfig?.codec.startsWith('avc1.')||(decoderConfig.description?.[4]&3)!==3)return null;
    const padded=exposeAvcPadding(decoderConfig.description,source.videoW,source.videoH);
    if(!padded||padded.width>4096||padded.height>4096)return null;
    const decode={...decoderConfig,description:padded.description,codedWidth:padded.width,codedHeight:padded.height};
    if(!(await VideoDecoder.isConfigSupported(decode)).supported)return null;

    const packets=[],seen=new Uint8Array(source.f);
    let packetBytes=0;
    for await(const packet of new M.EncodedPacketSink(track).packets()){
      if(signal?.aborted)return null;
      packetBytes+=packet.data.length;
      const index=Math.round(packet.timestamp*source.fps);
      if(packetBytes>plan.byteLimit||index<0||index>=source.f||seen[index]||packet.timestamp!==index/source.fps||
        packet.duration!==1/source.fps||(!packets.length&&(index!==0||packet.type!=='key'))||
        !canCopyAccessUnit(packet.data))return null;
      seen[index]=1;packets.push(packet);
    }
    if(packets.length!==source.f||signal?.aborted)return null;
    const bitrate=Math.round(packetBytes*8*source.fps/source.f);

    const target=new M.BufferTarget();
    output=new M.Output({format:new M.Mp4OutputFormat({fastStart:'in-memory'}),target});
    const video=new M.EncodedVideoPacketSource('avc');
    output.addVideoTrack(video,{frameRate:source.fps});
    await output.start();
    for(const [index,packet] of packets.entries()){
      if(signal?.aborted)return null;
      await video.add(packet,index===0?{decoderConfig:decode}:undefined);
    }
    video.close();await output.finalize();
    const layout={...source,videoW:padded.width,videoH:padded.height,
      legacyDimensionWarning:Math.max(padded.width,padded.height)>1504};
    const config=makeVapc({fps:source.fps,frames:source.f,packedLayout:layout});
    config.funToolkit={exportRevision:'packet-copy-v1',rgbAlphaMode:options.rgbAlphaMode};
    const bytes=appendVapcBox(new Uint8Array(target.buffer),config);
    if(bytes.length>plan.byteLimit||signal?.aborted)return null;
    const blob=new Blob([bytes],{type:'video/mp4'});
    // A supported config does not guarantee that the browser accepts the
    // adjusted SPS in an actual MP4. Confirm the first frame before shipping it.
    verification=new M.Input({source:new M.BlobSource(blob),formats:[M.MP4]});
    const remuxedTrack=await verification.getPrimaryVideoTrack();
    if(!remuxedTrack||await remuxedTrack.getDisplayWidth()!==padded.width||await remuxedTrack.getDisplayHeight()!==padded.height)return null;
    const first=await new M.CanvasSink(remuxedTrack,{poolSize:1,width:2,height:2,fit:'fill'}).getCanvas(0);
    if(!first||signal?.aborted)return null;
    return {blob,config,layout,frames:source.f,
      audioMode:metadata.hasAudio?'muted':'none',actualCodec:decode.codec,requestedCodec:decode.codec,
      bitrate,
      processingPath:'native-vap-copy',times:{wallMs:performance.now()-started}};
  }catch{
    // This is an optimization. Unsupported containers and decoder layouts
    // use the existing encode path with the selected settings and size cap.
    return null;
  }finally{
    if(output?.state==='started')await output.cancel().catch(()=>{});
    verification?.dispose();
    input?.dispose();
  }
}
