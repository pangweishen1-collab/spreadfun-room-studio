# Purple 01R exact nearest-color kernel

Derived from the pinned Photopea UPNG.js quantizer at revision `88f504b6577b726975f593caa38ba85d327c7c1f`, MIT, Copyright (c) 2017 Photopea. The full notice is retained in `quantize-kernel.mjs` and [the upstream license](../vendor/upng/LICENSE). Shared UPNG and Green codecs are unchanged.

`quantize-kernel.wat` ports only the pixel loops of `findNearest` and precise PCA `getNearest`. It retains the original integer RGBA errors, float64 tree values, normalization and expression order, recursive branch order, local pruning, tie rules and error accumulation. It does not reduce colors or frames, change palette discovery, kmeans updates, termination or PNG compression. The JS wrapper retains the original radius calculation.

`loadQuantizeKernel()` resolves to a kernel or `null` on unavailable WASM, failed fetching/compiling or invalid exports. `kernel.prepare(source)` reserves memory and copies the source before palette discovery consumes random numbers. A failed allocation returns `null`, allowing the caller to use the unchanged codec. A synchronous job exposes `pca(root, indices, mappedUint32)` and `nearest(indices, paletteRGBA)`. Jobs reuse one memory sequentially, support at most 256 colors and a 4 MiB RGBA source, and have a hard 16 MiB WASM memory maximum. No additional worker is used.

The committed WASM is built with WABT 1.0.39. Reproduce from the repository root using the official WABT CLI installed in a temporary build directory, without changing project dependencies:

```sh
npm install --prefix /tmp/purple-quantize-wabt --ignore-scripts --no-audit --no-fund wabt@1.0.39
node /tmp/purple-quantize-wabt/node_modules/wabt/bin/wat2wasm dice/purple-01r/quantize-kernel.wat -o dice/purple-01r/quantize-kernel.wasm
node tests/dice-purple-quantize-kernel.mjs
```

The browser consumes only the small WASM binary and wrapper; WABT is a build-time dependency. No synthetic warmup is used: cold actual quantization with initialization included already improved all five tested themes, while warmup added unnecessary CPU for themes without kmeans.
