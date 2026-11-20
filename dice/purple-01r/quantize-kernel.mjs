/*
 * Derived from Photopea UPNG.js, revision
 * 88f504b6577b726975f593caa38ba85d327c7c1f.
 * MIT License. Copyright (c) 2017 Photopea.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

const MAX_SOURCE_BYTES=4*1024*1024;
const MAX_MEMORY_BYTES=16*1024*1024;
const MAX_COLORS=256,NODE_BYTES=96;
const align=value=>(value+7)&~7;
let loading;

// An unavailable/blocked WASM codec is optional: the caller retains pinned UPNG.
export function loadQuantizeKernel({binary}={}){
  if(binary!==undefined)return instantiate(binary);
  return loading??=(async()=>{
    try{
      if(typeof WebAssembly!=='object')return null;
      const response=await fetch(new URL('./quantize-kernel.wasm',import.meta.url));
      return response.ok?instantiate(await response.arrayBuffer()):null;
    }catch{return null;}
  })();
}

async function instantiate(binary){
  try{
    if(typeof WebAssembly!=='object')return null;
    const {instance}=await WebAssembly.instantiate(binary);
    const {memory,findNearest,initialPca}=instance.exports;
    if(!memory||typeof findNearest!=='function'||typeof initialPca!=='function')return null;
    return {prepare};

    // Called before getKDtree consumes Math.random. Reserve every later working
    // region here, so a failed memory growth can safely use the original codec.
    // Jobs run synchronously and reuse this single memory, one source at a time.
    function prepare(source){
      if(!(source instanceof Uint8Array)||source.length===0||source.length%4||source.length>MAX_SOURCE_BYTES)return null;
      const count=source.length>>>2,srcPtr=8,indicesPtr=align(srcPtr+source.length);
      const mappedPtr=align(indicesPtr+count),nodesPtr=align(mappedPtr+source.length);
      const required=nodesPtr+(MAX_COLORS*2-1)*NODE_BYTES;
      if(required>MAX_MEMORY_BYTES)return null;
      let bytes,view;
      try{
        if(memory.buffer.byteLength<required)memory.grow(Math.ceil((required-memory.buffer.byteLength)/65536));
        bytes=new Uint8Array(memory.buffer);view=new DataView(memory.buffer);
        bytes.set(source,srcPtr);
      }catch{return null;}
      return {pca,nearest};

      function pca(root,indices,mapped){
        const nodes=[];
        function visit(node){nodes.push(node);if(node.left){visit(node.left);visit(node.right);}}
        visit(root);
        const pointers=new Map(nodes.map((node,i)=>[node,nodesPtr+i*NODE_BYTES]));
        for(let i=0;i<nodes.length;i++){
          const node=nodes[i],ptr=nodesPtr+i*NODE_BYTES;
          view.setInt32(ptr,node.left?pointers.get(node.left):0,true);
          view.setInt32(ptr+4,node.right?pointers.get(node.right):0,true);
          view.setInt32(ptr+8,node.ind||0,true);
          view.setUint32(ptr+12,node.est.rgba,true);
          if(node.left){
            for(let c=0;c<4;c++)view.setFloat64(ptr+16+c*8,node.est.e[c],true);
            view.setFloat64(ptr+48,node.est.eMq,true);
          }else for(let c=0;c<4;c++)view.setFloat64(ptr+56+c*8,node.est.q[c],true);
        }
        initialPca(srcPtr,indicesPtr,mappedPtr,nodesPtr,count);
        indices.set(bytes.subarray(indicesPtr,indicesPtr+count));
        new Uint8Array(mapped.buffer,mapped.byteOffset,mapped.byteLength).set(bytes.subarray(mappedPtr,mappedPtr+source.length));
      }

      function nearest(indices,colors){
        const K=colors.length>>>2,palettePtr=nodesPtr,radiusPtr=nodesPtr+MAX_COLORS*4;
        const radii=new Float64Array(memory.buffer,radiusPtr,K);
        // Keep the original sqrt -> half -> square rounding and palette order.
        for(let i=0;i<K;i++){
          const qi=i*4,r=colors[qi],g=colors[qi+1],b=colors[qi+2],a=colors[qi+3];let distance=1e9;
          for(let j=0;j<K;j++){
            if(i===j)continue;
            const qj=j*4,dr=r-colors[qj],dg=g-colors[qj+1],db=b-colors[qj+2],da=a-colors[qj+3];
            const error=dr*dr+dg*dg+db*db+da*da;
            if(error<distance)distance=error;
          }
          radii[i]=Math.sqrt(distance)*.5;radii[i]=radii[i]*radii[i];
        }
        bytes.set(indices,indicesPtr);bytes.set(colors,palettePtr);
        const error=findNearest(srcPtr,indicesPtr,palettePtr,radiusPtr,count,K);
        indices.set(bytes.subarray(indicesPtr,indicesPtr+count));
        return error;
      }
    }
  }catch{return null;}
}
