import {keyPixels,applyVerticalMask,normalizeVerticalMask} from './vap-matte.mjs?v=20261029-detail1';

const scope=globalThis.self;
const workspace={};
let options=null;
function dimensions(width,height){
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width>4096||height>4096||width*height>8388608)throw new RangeError('Chroma frame dimensions exceed the local processing limit');
}
function report(error,id){scope.postMessage({type:'error',id,message:error?.message||'Chroma worker failed'});}
scope.addEventListener('message',event=>{
  const value=event.data;
  try{
    if(value?.type==='init'){
      if(options)throw new Error('Chroma worker already initialized');
      const input=value.options||{};dimensions(input.width,input.height);
      options={width:input.width,height:input.height,matteMethod:'chroma_key',screenColor:input.screenColor||'auto',verticalMask:{...normalizeVerticalMask(input.verticalMask)}};
      if(input.lightRecovery!==undefined){if(typeof input.lightRecovery!=='boolean')throw new TypeError('Invalid light recovery mode');options.lightRecovery=input.lightRecovery;}
      for(const key of ['keyTolerance','edgeSoftness','spill'])if(Number.isFinite(input[key]))options[key]=input[key];
      if(input.background!==undefined){
        if(!Array.isArray(input.background)||input.background.length!==3||!input.background.every(v=>Number.isInteger(v)&&v>=0&&v<=255))throw new TypeError('Invalid screen RGB');
        options.background=input.background.slice();
      }
      scope.postMessage({type:'ready'});return;
    }
    if(value?.type!=='frame'||!options)throw new Error('Chroma worker is not initialized');
    const {width,height}=options;
    if(value.width!==width||value.height!==height||!(value.buffer instanceof ArrayBuffer)||!Number.isInteger(value.byteOffset)||value.byteOffset<0||value.byteOffset+width*height*4>value.buffer.byteLength)throw new TypeError('Invalid chroma RGBA frame');
    const start=performance.now(),input=new Uint8ClampedArray(value.buffer,value.byteOffset,width*height*4);
    const keyed=keyPixels(input,width,height,options,workspace),out=applyVerticalMask(keyed,width,height,options.verticalMask);
    scope.postMessage({type:'result',id:value.id,width,height,buffer:out.buffer,workerMs:Math.max(0,performance.now()-start)},[out.buffer]);
  }catch(error){report(error,value?.id);}
});
