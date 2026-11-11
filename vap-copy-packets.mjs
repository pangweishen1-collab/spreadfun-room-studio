import {exposeAvcPadding} from './vap-avc-padding.mjs';
import {appendVapcBox,makeVapc} from './vap-protocol.mjs?v=20261111-packed-alpha';

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

export async function copyPackedVideo(M,file,options,metadata,plan,signal){
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
      bitrate:Math.round(packetBytes*8*source.fps/source.f),
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
