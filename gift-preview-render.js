(function (root) {
  'use strict';

  const defaults = {mode: 'feather', zoom: 1, offsetX: 0, offsetY: 0, saturation: 100, brightness: 100, contrast: 100, feather: 10, radius: 22, rotation: 0};
  let maskCache = null;
  let brushCache = null;
  let lightCanvasCache = null;
  let foregroundCache = null;
  let restoreCanvas = null;

  function number(value, fallback) {
    return Number.isFinite(Number(value)) ? Number(value) : fallback;
  }
  function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }
  function settingsFor(settings = {}) {
    return {
      mode: settings.mode === 'transparent' ? 'transparent' : 'feather',
      zoom: clamp(number(settings.zoom, defaults.zoom), 0.05, 20),
      offsetX: number(settings.offsetX, defaults.offsetX),
      offsetY: number(settings.offsetY, defaults.offsetY),
      saturation: clamp(number(settings.saturation, defaults.saturation), 0, 300),
      brightness: clamp(number(settings.brightness, defaults.brightness), 0, 300),
      contrast: clamp(number(settings.contrast, defaults.contrast), 0, 300),
      feather: clamp(number(settings.feather, defaults.feather), 0, 50),
      radius: clamp(number(settings.radius, defaults.radius), 0, 50),
      rotation: clamp(number(settings.rotation, defaults.rotation), -180, 180),
      flipX: settings.flipX === true,
      flipY: settings.flipY === true,
      strokes: Array.isArray(settings.strokes) ? settings.strokes : [],
      baseMask: settings.baseMask || null
    };
  }
  function validSide(side) {
    if (!Number.isInteger(side) || side < 1) throw new RangeError('The output must have a positive integer side length.');
  }

  function getPlacement(sourceWidth, sourceHeight, side, settings = {}) {
    validSide(side);
    if (!Number.isFinite(sourceWidth) || !Number.isFinite(sourceHeight) || sourceWidth <= 0 || sourceHeight <= 0) {
      throw new RangeError('The image must be loaded before rendering.');
    }
    const config = settingsFor(settings);
    const radians = config.rotation * Math.PI / 180;
    const cosine = Math.abs(Math.cos(radians)) < 1e-12 ? 0 : Math.cos(radians);
    const sine = Math.abs(Math.sin(radians)) < 1e-12 ? 0 : Math.sin(radians);
    const boundsWidth = Math.abs(sourceWidth * cosine) + Math.abs(sourceHeight * sine);
    const boundsHeight = Math.abs(sourceWidth * sine) + Math.abs(sourceHeight * cosine);
    const fit = config.mode === 'transparent' ? Math.min : Math.max;
    const scale = fit(side / boundsWidth, side / boundsHeight) * config.zoom;
    const width = sourceWidth * scale;
    const height = sourceHeight * scale;
    const centerX = side / 2 + config.offsetX * side;
    const centerY = side / 2 + config.offsetY * side;
    return {x: centerX - width / 2, y: centerY - height / 2, width, height, scale,
      centerX, centerY, rotation: config.rotation, cosine, sine, flipX: config.flipX, flipY: config.flipY};
  }

  function canvasPoint(placement, point) {
    const x = (point.x - 0.5) * placement.width;
    const y = (point.y - 0.5) * placement.height;
    return {x: placement.centerX + (x * placement.cosine - y * placement.sine) * (placement.flipX ? -1 : 1),
      y: placement.centerY + (x * placement.sine + y * placement.cosine) * (placement.flipY ? -1 : 1)};
  }

  function toCanvasPoint(sourceWidth, sourceHeight, side, settings, point) {
    const result = canvasPoint(getPlacement(sourceWidth, sourceHeight, side, settings), point);
    return {x: result.x / side, y: result.y / side};
  }

  function toSourcePoint(sourceWidth, sourceHeight, side, settings, point) {
    const placement = getPlacement(sourceWidth, sourceHeight, side, settings);
    const x = (point.x * side - placement.centerX) * (placement.flipX ? -1 : 1);
    const y = (point.y * side - placement.centerY) * (placement.flipY ? -1 : 1);
    return {x: 0.5 + (x * placement.cosine + y * placement.sine) / placement.width,
      y: 0.5 + (-x * placement.sine + y * placement.cosine) / placement.height};
  }

  function sourceMask(sourceWidth, sourceHeight, side, config) {
    const output = new Uint8ClampedArray(side * side).fill(255), mask = config.baseMask;
    if (!mask) return output;
    if (!Number.isInteger(mask.width) || !Number.isInteger(mask.height) || mask.width < 1 || mask.height < 1 || mask.width > 2048 || mask.height > 2048 || mask.data?.length !== mask.width * mask.height) throw new RangeError('Invalid source alpha mask.');
    const p = getPlacement(sourceWidth, sourceHeight, side, config), sx = p.flipX ? -1 : 1, sy = p.flipY ? -1 : 1;
    if ((mask.recoverBlack === true || mask.foreground) && typeof document !== 'undefined') return canvasLightMask(mask, p, side);
    for (let y = 0; y < side; y++) for (let x = 0; x < side; x++) {
      const dx = (x + .5 - p.centerX) * sx, dy = (y + .5 - p.centerY) * sy;
      const u = .5 + (dx * p.cosine + dy * p.sine) / p.width, v = .5 + (-dx * p.sine + dy * p.cosine) / p.height;
      if (u < 0 || u > 1 || v < 0 || v > 1) { output[y * side + x] = 0; continue; }
      const mx = clamp(u * mask.width - .5, 0, mask.width - 1), my = clamp(v * mask.height - .5, 0, mask.height - 1);
      const x0 = Math.floor(mx), y0 = Math.floor(my), x1 = Math.min(x0 + 1, mask.width - 1), y1 = Math.min(y0 + 1, mask.height - 1), fx = mx - x0, fy = my - y0;
      output[y * side + x] = Math.round((mask.data[y0 * mask.width + x0] * (1 - fx) + mask.data[y0 * mask.width + x1] * fx) * (1 - fy) + (mask.data[y1 * mask.width + x0] * (1 - fx) + mask.data[y1 * mask.width + x1] * fx) * fy);
    }
    return output;
  }

  function paintPlaced(context, image, side, placement) {
    context.save();
    try {
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.globalCompositeOperation = 'source-over'; context.globalAlpha = 1;
      if ('filter' in context) context.filter = 'none';
      context.clearRect(0, 0, side, side);
      context.imageSmoothingEnabled = true; context.imageSmoothingQuality = 'high';
      if (placement.rotation || placement.flipX || placement.flipY) {
        const fx = placement.flipX ? -1 : 1, fy = placement.flipY ? -1 : 1;
        context.setTransform(placement.cosine * fx, placement.sine * fy, -placement.sine * fx, placement.cosine * fy, placement.centerX, placement.centerY);
        context.drawImage(image, -placement.width / 2, -placement.height / 2, placement.width, placement.height);
      } else context.drawImage(image, placement.x, placement.y, placement.width, placement.height);
    } finally { context.restore(); }
  }

  function canvasLightMask(mask, placement, side) {
    // Use the same area filter as the artwork: point-sampling a full-size matte
    // would skip tiny particles when exporting a 200px icon.
    if (!lightCanvasCache || lightCanvasCache.mask !== mask) {
      const source = document.createElement('canvas'); source.width = mask.width; source.height = mask.height;
      const ctx = source.getContext('2d', {willReadFrequently: true}), pixels = ctx.createImageData(mask.width, mask.height);
      for (let i = 0; i < mask.data.length; i++) {
        pixels.data[i * 4] = pixels.data[i * 4 + 1] = pixels.data[i * 4 + 2] = mask.foreground ? 255 : mask.data[i];
        pixels.data[i * 4 + 3] = mask.foreground ? mask.data[i] : 255;
      }
      ctx.putImageData(pixels, 0, 0);
      lightCanvasCache = {mask, source, output: document.createElement('canvas')};
    }
    const target = lightCanvasCache.output;
    if (target.width !== side || target.height !== side) target.width = target.height = side;
    const context = target.getContext('2d', {willReadFrequently: true});
    paintPlaced(context, lightCanvasCache.source, side, placement);
    const rgba = context.getImageData(0, 0, side, side).data, output = new Uint8ClampedArray(side * side);
    for (let i = 0; i < output.length; i++) output[i] = rgba[i * 4 + (mask.foreground ? 3 : 0)];
    return output;
  }

  function foregroundSource(mask) {
    if (!foregroundCache || foregroundCache.mask !== mask) {
      if (!(mask.foreground instanceof Uint8ClampedArray) || mask.foreground.length !== mask.width * mask.height * 4) throw new RangeError('Invalid foreground pixels.');
      const source = document.createElement('canvas'); source.width = mask.width; source.height = mask.height;
      const context = source.getContext('2d'), pixels = context.createImageData(mask.width, mask.height);
      pixels.data.set(mask.foreground); context.putImageData(pixels, 0, 0);
      foregroundCache = {mask, source};
    }
    return foregroundCache.source;
  }

  function retouchForeground(pixels, original, editedMask) {
    if (pixels.length !== original.length || pixels.length !== editedMask.length * 4) throw new RangeError('Invalid foreground retouch pixels.');
    for (let i = 0; i < editedMask.length; i++) {
      const offset = i * 4, base = pixels[offset + 3], target = editedMask[i], restored = Math.max(0, target - base);
      if (restored) for (let channel = 0; channel < 3; channel++) pixels[offset + channel] = Math.round((pixels[offset + channel] * base + original[offset + channel] * restored) / target);
      pixels[offset + 3] = target;
    }
    return pixels;
  }

  function brushCoverage(distance, radius, hardness) {
    if (!(radius > 0)) return 0;
    const softness = Math.max(0.5, radius * (1 - clamp(hardness, 0, 1)));
    const t = clamp((radius - distance) / softness, 0, 1);
    return t * t * (3 - 2 * t);
  }

  function paintBrushMask(sourceWidth, sourceHeight, side, settings, initialMask, startIndex = 0) {
    const placement = getPlacement(sourceWidth, sourceHeight, side, settings);
    const config = settingsFor(settings);
    const mask = initialMask ? initialMask.slice() : sourceMask(sourceWidth, sourceHeight, side, config);
    if (!config.strokes.length) return mask;
    // Only output-sized alpha planes are allocated, even for a very large upload.
    const coverage = new Uint8ClampedArray(side * side);
    for (let strokeIndex = startIndex; strokeIndex < config.strokes.length; strokeIndex++) {
      const stroke = config.strokes[strokeIndex];
      if (!stroke || !['erase', 'restore'].includes(stroke.mode) || !Array.isArray(stroke.points)) continue;
      const radius = clamp(number(stroke.size, 0), 0, 2) * Math.max(sourceWidth, sourceHeight) * placement.scale / 2;
      const hardness = clamp(number(stroke.hardness, 0.8), 0, 1);
      const opacity = clamp(number(stroke.opacity, 1), 0, 1);
      if (!radius || !opacity) continue;
      coverage.fill(0);
      let left = side, top = side, right = -1, bottom = -1;
      let previous = null;
      for (const point of stroke.points) {
        if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) { previous = null; continue; }
        const end = canvasPoint(placement, point);
        const start = !point.break && previous ? previous : end;
        const minX = Math.max(0, Math.floor(Math.min(start.x, end.x) - radius));
        const minY = Math.max(0, Math.floor(Math.min(start.y, end.y) - radius));
        const maxX = Math.min(side - 1, Math.ceil(Math.max(start.x, end.x) + radius));
        const maxY = Math.min(side - 1, Math.ceil(Math.max(start.y, end.y) + radius));
        const dx = end.x - start.x, dy = end.y - start.y;
        const lengthSquared = dx * dx + dy * dy;
        left = Math.min(left, minX); top = Math.min(top, minY);
        right = Math.max(right, maxX); bottom = Math.max(bottom, maxY);
        // A segment's bounding box, not the entire frame, is visited per segment.
        for (let y = minY; y <= maxY; y++) {
          for (let x = minX; x <= maxX; x++) {
            const projection = lengthSquared ? clamp(((x + 0.5 - start.x) * dx + (y + 0.5 - start.y) * dy) / lengthSquared, 0, 1) : 0;
            const distance = Math.hypot(x + 0.5 - start.x - projection * dx, y + 0.5 - start.y - projection * dy);
            const alpha = Math.round(brushCoverage(distance, radius, hardness) * 255);
            const index = y * side + x;
            if (alpha > coverage[index]) coverage[index] = alpha;
          }
        }
        previous = end;
      }
      // Repeated samples inside one stroke do not repeatedly darken its opacity.
      for (let y = Math.max(0, top); y <= Math.min(side - 1, bottom); y++) {
        for (let x = Math.max(0, left); x <= Math.min(side - 1, right); x++) {
          const index = y * side + x;
          const amount = coverage[index] / 255 * opacity;
          mask[index] = Math.round(stroke.mode === 'erase' ? mask[index] * (1 - amount) : mask[index] + (255 - mask[index]) * amount);
        }
      }
    }
    return mask;
  }

  function createBrushMask(sourceWidth, sourceHeight, side, settings = {}) {
    return paintBrushMask(sourceWidth, sourceHeight, side, settings, null);
  }

  function cachedBrushMask(sourceWidth, sourceHeight, side, config) {
    const geometry = [sourceWidth, sourceHeight, side, config.mode, config.zoom, config.offsetX, config.offsetY, config.rotation, config.flipX, config.flipY].join(':');
    // Value fingerprints also detect undo, in-place pointer edits, and replaced uploads.
    const keys = config.strokes.map(stroke => JSON.stringify(stroke));
    const previous = brushCache && brushCache.geometry === geometry && brushCache.baseMask === config.baseMask ? brushCache : null;
    const samePrefix = (count) => previous && keys.slice(0, count).every((key, index) => key === previous.keys[index]);
    if (previous && keys.length === previous.keys.length && samePrefix(keys.length)) return previous.mask;
    let prefixMask = null;
    if (previous && keys.length === previous.keys.length && samePrefix(keys.length - 1)) prefixMask = previous.prefixMask;
    if (previous && keys.length === previous.keys.length + 1 && samePrefix(previous.keys.length)) prefixMask = previous.mask;
    if (!prefixMask) prefixMask = paintBrushMask(sourceWidth, sourceHeight, side, {...config, strokes: config.strokes.slice(0, -1)}, null);
    const mask = paintBrushMask(sourceWidth, sourceHeight, side, config, prefixMask, keys.length - 1);
    // A single bounded cache: no full-resolution upload planes or per-undo bitmap history.
    brushCache = {geometry, keys, prefixMask, mask, baseMask: config.baseMask};
    return mask;
  }

  function applyBrushMask(pixels, mask) {
    if (pixels.length !== mask.length * 4) throw new RangeError('The brush mask must match the pixel buffer.');
    for (let index = 0; index < mask.length; index++) pixels[index * 4 + 3] = Math.round(pixels[index * 4 + 3] * mask[index] / 255);
    return pixels;
  }

  function recoverBlackPixels(pixels, baseMask, editedMask = baseMask) {
    if (pixels.length !== baseMask.length * 4 || editedMask.length !== baseMask.length) throw new RangeError('The light mask must match the pixel buffer.');
    for (let index = 0; index < baseMask.length; index++) {
      // A restore stroke brings back original black-backed RGB; erasing only fades the recovered light.
      const alpha = Math.max(baseMask[index], editedMask[index]);
      for (let channel = 0; channel < 3; channel++) pixels[index * 4 + channel] = alpha ? Math.min(255, Math.round(pixels[index * 4 + channel] * 255 / alpha)) : 0;
    }
    return pixels;
  }

  function createMask(side, settings = {}) {
    validSide(side);
    const config = settingsFor(settings);
    const mask = new Uint8ClampedArray(side * side);
    if (config.mode === 'transparent') { mask.fill(255); return mask; }
    const half = side / 2;
    const radius = side * config.radius / 100;
    const feather = side * config.feather / 100;
    const innerHalf = half - radius;
    for (let y = 0; y < side; y++) {
      const qy = Math.abs(y + 0.5 - half) - innerHalf;
      for (let x = 0; x < side; x++) {
        const qx = Math.abs(x + 0.5 - half) - innerHalf;
        const distance = radius - Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) - Math.min(Math.max(qx, qy), 0);
        let alpha;
        if (feather === 0) {
          alpha = clamp(distance + 0.5, 0, 1);
        } else {
          const t = clamp(distance / feather, 0, 1);
          // A smooth alpha transition, with no added color, follows the supplied reference's soft edges.
          alpha = t * t * t * (10 + t * (-15 + t * 6));
        }
        mask[y * side + x] = Math.round(alpha * 255);
      }
    }
    return mask;
  }

  function cachedMask(side, config) {
    const key = `${side}:${config.feather}:${config.radius}`;
    if (!maskCache || maskCache.key !== key) maskCache = {key, data: createMask(side, config)};
    return maskCache.data;
  }

  function applyPixels(pixels, width, height, settings = {}) {
    validSide(width);
    if (width !== height || pixels.length !== width * height * 4) throw new RangeError('The pixel buffer must match a square output.');
    const config = settingsFor(settings);
    const colorChanged = config.saturation !== 100 || config.brightness !== 100 || config.contrast !== 100;
    const mask = config.mode === 'feather' ? cachedMask(width, config) : null;
    if (!colorChanged && !mask) return pixels;
    const saturation = config.saturation / 100;
    const brightness = config.brightness / 100;
    const contrast = config.contrast / 100;
    for (let i = 0, pixel = 0; i < pixels.length; i += 4, pixel++) {
      if (colorChanged) {
        const red = pixels[i], green = pixels[i + 1], blue = pixels[i + 2];
        const luminance = red * 0.2126 + green * 0.7152 + blue * 0.0722;
        pixels[i] = Math.round(clamp(((luminance + (red - luminance) * saturation) * brightness - 127.5) * contrast + 127.5, 0, 255));
        pixels[i + 1] = Math.round(clamp(((luminance + (green - luminance) * saturation) * brightness - 127.5) * contrast + 127.5, 0, 255));
        pixels[i + 2] = Math.round(clamp(((luminance + (blue - luminance) * saturation) * brightness - 127.5) * contrast + 127.5, 0, 255));
      }
      // Cap alpha instead of multiplying: an already feathered upload must not fade a second time.
      if (mask) pixels[i + 3] = Math.min(pixels[i + 3], mask[pixel]);
    }
    return pixels;
  }

  function render(canvas, image, settings = {}) {
    const side = canvas.width;
    validSide(side);
    if (canvas.height !== side) throw new RangeError('The output canvas must be square.');
    const config = settingsFor(settings);
    const placement = getPlacement(image.naturalWidth || image.width, image.naturalHeight || image.height, side, config);
    const context = canvas.getContext('2d', {willReadFrequently: true});
    if (!context) throw new Error('A 2D canvas context is required.');
    const cutout = config.baseMask?.foreground;
    // Resize the already transparent, decontaminated pixels. Resizing the old
    // black-backed image first mixes black into the 200px edge a second time.
    paintPlaced(context, cutout ? foregroundSource(config.baseMask) : image, side, placement);
    if (!config.baseMask && !config.strokes.length && config.mode === 'transparent' && config.saturation === 100 && config.brightness === 100 && config.contrast === 100) return placement;
    const pixels = context.getImageData(0, 0, side, side);
    const brushMask = config.baseMask || config.strokes.length ? cachedBrushMask(image.naturalWidth || image.width, image.naturalHeight || image.height, side, config) : null;
    if (cutout && config.strokes.length) {
      if (!restoreCanvas) restoreCanvas = document.createElement('canvas');
      restoreCanvas.width = restoreCanvas.height = side;
      const original = restoreCanvas.getContext('2d', {willReadFrequently: true});
      paintPlaced(original, image, side, placement);
      retouchForeground(pixels.data, original.getImageData(0, 0, side, side).data, brushMask);
    } else if (config.baseMask?.recoverBlack === true) recoverBlackPixels(pixels.data, config.strokes.length ? sourceMask(image.naturalWidth || image.width, image.naturalHeight || image.height, side, config) : brushMask, brushMask);
    applyPixels(pixels.data, side, side, config);
    if (brushMask && !cutout) applyBrushMask(pixels.data, brushMask);
    context.putImageData(pixels, 0, 0);
    return placement;
  }

  const renderer = {render, getPlacement, toSourcePoint, toCanvasPoint, applyPixels, createMask, createBrushMask, applyBrushMask, recoverBlackPixels, retouchForeground, brushCoverage};
  root.GiftPreviewRenderer = renderer;
})(typeof window !== 'undefined' ? window : globalThis);
