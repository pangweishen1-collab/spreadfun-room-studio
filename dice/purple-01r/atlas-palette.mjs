import UPNG from '../vendor/upng/upng.mjs';

// 01R-only raw input path. The alpha classes and palette algorithm below
// mirror the frozen shared PNG path; that module and Green stay untouched.
// Generated atlas pages have no color-profile chunks to preserve.
export function quantizeAtlasRgba(width, height, pixels, colorLimit = 256, quantize = UPNG.quantize) {
  if (!Number.isInteger(colorLimit) || colorLimit < 8 || colorLimit > 256) return null;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 2048 || height > 2048) return null;
  const rgba = ArrayBuffer.isView(pixels)
    ? new Uint8Array(pixels.buffer, pixels.byteOffset, pixels.byteLength)
    : new Uint8Array(pixels);
  if (rgba.length !== width * height * 4) return null;

  let opaqueCount = 0;
  let partialCount = 0;
  let hiddenCount = 0;
  const hasHiddenColor = index => rgba[index] || rgba[index + 1] || rgba[index + 2];
  for (let index = 0; index < rgba.length; index += 4) {
    const alpha = rgba[index + 3];
    if (alpha === 255) opaqueCount++;
    else if (alpha > 0) partialCount++;
    else if (hasHiddenColor(index)) hiddenCount++;
  }
  // Give each alpha class its own colors. Empty atlas gaps stay invisible,
  // opaque dice stay opaque, and soft edges use a premultiplied palette.
  const opaque = new Uint8Array(opaqueCount * 4);
  const partial = new Uint8Array(partialCount * 4);
  const hidden = new Uint8Array(hiddenCount * 4);
  let opaqueOffset = 0;
  let partialOffset = 0;
  let hiddenOffset = 0;
  for (let index = 0; index < rgba.length; index += 4) {
    const alpha = rgba[index + 3];
    if (alpha === 255) {
      for (let channel = 0; channel < 4; channel++) opaque[opaqueOffset++] = rgba[index + channel];
    } else if (alpha > 0) {
      for (let channel = 0; channel < 3; channel++) {
        partial[partialOffset++] = Math.round(rgba[index + channel] * alpha / 255);
      }
      partial[partialOffset++] = alpha;
    } else if (hasHiddenColor(index)) {
      for (let channel = 0; channel < 3; channel++) hidden[hiddenOffset++] = rgba[index + channel];
      hidden[hiddenOffset++] = 255;
    }
  }
  // Green atlases carry RGB at alpha zero so straight-alpha bilinear filtering
  // can blend the visible edge with neighboring colors instead of black.
  const hiddenColors = Math.min(hiddenCount, Math.floor(colorLimit / 32) || 1);
  const visibleColors = colorLimit - hiddenColors - (opaqueCount + partialCount < rgba.length / 4 ? 1 : 0);
  const partialColors = opaqueCount ? Math.min(partialCount, Math.floor(visibleColors / 4)) : visibleColors;
  const opaquePalette = opaqueCount
    ? new Uint8Array(quantize(opaque.buffer, visibleColors - partialColors).abuf)
    : opaque;
  const partialPalette = partialCount
    ? new Uint8Array(quantize(partial.buffer, partialColors).abuf)
    : partial;
  const hiddenPalette = hiddenCount
    ? new Uint8Array(quantize(hidden.buffer, hiddenColors).abuf)
    : hidden;
  const remapped = new Uint8Array(rgba.length);
  opaqueOffset = 0;
  partialOffset = 0;
  hiddenOffset = 0;
  for (let index = 0; index < rgba.length; index += 4) {
    const alpha = rgba[index + 3];
    if (alpha === 255) {
      for (let channel = 0; channel < 3; channel++) remapped[index + channel] = opaquePalette[opaqueOffset++];
      remapped[index + 3] = 255;
      opaqueOffset++;
    } else if (alpha > 0) {
      const mappedAlpha = Math.max(1, Math.min(254, partialPalette[partialOffset + 3]));
      for (let channel = 0; channel < 3; channel++) {
        remapped[index + channel] = Math.min(255, Math.round(partialPalette[partialOffset++] * 255 / mappedAlpha));
      }
      remapped[index + 3] = mappedAlpha;
      partialOffset++;
    } else if (hasHiddenColor(index)) {
      for (let channel = 0; channel < 3; channel++) remapped[index + channel] = hiddenPalette[hiddenOffset++];
      hiddenOffset++;
    }
  }
  // The RGBA data already has at most 256 colors. Have the encoder write its
  // PNG palette without applying a second lossy pass.
  const output = UPNG.encode([remapped.buffer], width, height, 0, undefined, {});
  return new Uint8Array(output)[25] === 3 ? output : null;
}
