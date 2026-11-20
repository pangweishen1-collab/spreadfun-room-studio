/*
 * Derived from Photopea UPNG.js, pinned at
 * https://github.com/photopea/UPNG.js/tree/88f504b6577b726975f593caa38ba85d327c7c1f
 * Source notes: ../vendor/upng/SOURCE.md. This adapter is private to Purple 01R.
 *
 * MIT License
 * Copyright (c) 2017 Photopea
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
import UPNG from '../vendor/upng/upng.mjs';

// This factory leaves palette discovery and refinement order unchanged.
// Only the two nearest-color loops run in the exact, preallocated kernel.
export function createQuantizer(kernel){
  if(!kernel || typeof kernel.prepare!=='function') return UPNG.quantize;
	function quantize(abuf, ps, doKmeans)
	{
		var sb = new Uint8Array(abuf);
        if (!Number.isInteger(ps) || ps<1 || ps>256 || sb.length>4*1024*1024 || sb.length%4) return UPNG.quantize(abuf,ps,doKmeans);
        // Allocate before discovering the palette. Failure preserves the old
        // path's random sequence and does not leave a partly quantized image.
        var job;
        try { job=kernel.prepare(sb); } catch {}
        if (!job) return UPNG.quantize(abuf,ps,doKmeans);
        var tb=sb.slice(0), tb32=new Uint32Array(tb.buffer);

		var KD = UPNG.quantize.getKDtree(tb, ps);
		var root = KD[0], leafs = KD[1], K=leafs.length;


		var cl32 = new Uint32Array(K), clr8=new Uint8Array(cl32.buffer);
		for(var i=0; i<K; i++) cl32[i]=leafs[i].est.rgba;

		var len=sb.length;

		var inds = new Uint8Array(len>>2);
		if(K<=60) {  job.nearest(inds,clr8);  remap(inds,tb32,cl32);  }
		else job.pca(root,inds,tb32);


		if(doKmeans || sb.length*K<10*4e6) {
			var le = 1e9;
			for(var i=0; i<10; i++) {
				updatePalette(sb,inds,clr8);
				var ce=job.nearest(inds,clr8);
				if(ce/le>0.997) break;  le=ce;
			}
			for(var i=0; i<K; i++) leafs[i].est.rgba = cl32[i];
			remap(inds,tb32,cl32);
		}

		return {  abuf:tb.buffer, inds:inds, plte:leafs  };
	}
  return quantize;
}

	function remap(inds,tb32,pl32) {  for(var i=0; i<inds.length; i++) tb32[i]=pl32[inds[i]];  }
	function updatePalette(sb,inds,plte) {
		var K = plte.length>>>2;
		var sums = new Uint32Array(K*4), cnts = new Uint32Array(K);

		for(var i=0; i<sb.length; i+=4) {
			var ind = inds[i>>>2], qi=ind*4;
			cnts[ind]++;
			sums[qi  ]+=sb[i  ];  sums[qi+1]+=sb[i+1];
			sums[qi+2]+=sb[i+2];  sums[qi+3]+=sb[i+3];
		}
		for(var i=0; i<plte.length; i++) plte[i]=Math.round(sums[i]/cnts[i>>>2]);
	}
