import init, {optimise} from './vendor/oxipng/squoosh_oxipng.mjs';

self.onmessage = async ({data:{png, level, colorLimit}}) => {
  try {
    const input = await png.arrayBuffer();
    let output = new Uint8Array(input);
    try {
      const {quantizeAtlasPng} = await import('./atlas-png-palette.mjs');
      const indexed = quantizeAtlasPng(input, colorLimit);
      if (indexed && indexed.byteLength < input.byteLength) {
        output = new Uint8Array(indexed);
      }
    } catch {
      // Unsupported input or codec failure can still use the lossless path.
    }
    try {
      await init();
      const optimized = optimise(output, output.byteLength < input.byteLength ? 1 : level, false, false);
      if (optimized.byteLength > 0 && optimized.byteLength < output.byteLength) output = optimized;
    } catch {
      // Keep a successful palette result if the optional lossless pass fails.
    }
    self.postMessage(output.byteLength < input.byteLength ? new Blob([output], {type: 'image/png'}) : null);
  } catch {
    self.postMessage(null);
  }
};
