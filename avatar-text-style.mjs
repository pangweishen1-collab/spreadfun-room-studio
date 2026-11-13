/* The editor bitmap and the exported SVGA text layer use the same fill. */
export const TEXT_STYLES = Object.freeze({
  plain: Object.freeze({}),
  brightGold: Object.freeze({baseColor: '#E9B83F'}),
  champagne: Object.freeze({baseColor: '#D9BF87'}),
  silver: Object.freeze({baseColor: '#B7C6D7'}),
  roseGold: Object.freeze({baseColor: '#D79584'}),
  threeToneGold: Object.freeze({highlightColor: '#FFF3BD', midColor: '#F4C64F', baseColor: '#A96317'})
});

export function defaultTextHighlight(color) {
  const base = /^#[\da-f]{6}$/i.test(color) ? color : TEXT_STYLES.brightGold.baseColor;
  const channels = [1, 3, 5].map(index => {
    const channel = parseInt(base.slice(index, index + 2), 16);
    return Math.round(channel + (255 - channel) * .65).toString(16).padStart(2, '0');
  });
  return '#' + channels.join('');
}

export function textGradientStops(styleKey, baseColor, highlightColor, midColor) {
  const preset = Object.hasOwn(TEXT_STYLES, styleKey) ? TEXT_STYLES[styleKey] : null;
  if (!preset?.baseColor) return [];
  const base = baseColor || preset.baseColor;
  const stops = [[0, highlightColor || preset.highlightColor || defaultTextHighlight(base)]];
  if (preset.midColor) stops.push([.5, midColor || preset.midColor]);
  stops.push([1, base]);
  return stops;
}

export function drawStyledText(ctx, {
  lines, size, width, padding, font, color, strokeWidth = 0,
  strokeColor = '#000000', styleKey = 'plain', highlightColor, midColor
}) {
  const stops = textGradientStops(styleKey, color, highlightColor, midColor);

  ctx.save();
  ctx.font = font;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'center';
  ctx.lineJoin = 'round';
  ctx.miterLimit = 2;
  ctx.strokeStyle = strokeColor;
  if (strokeWidth > 0) ctx.lineWidth = strokeWidth * 2;

  lines.forEach((line, index) => {
    const x = width / 2;
    const y = padding + size + index * size * 1.3;
    ctx.fillStyle = color || '#FFFFFF';
    if (stops.length) {
      const measured = ctx.measureText(line || ' ');
      const ascent = measured.actualBoundingBoxAscent || size * .8;
      const descent = measured.actualBoundingBoxDescent ?? size * .18;
      const fill = ctx.createLinearGradient(0, y - ascent, 0, y + descent);
      for (const [offset, value] of stops) fill.addColorStop(offset, value);
      ctx.fillStyle = fill;
    }
    if (strokeWidth > 0) ctx.strokeText(line, x, y);
    ctx.fillText(line, x, y);
  });
  ctx.restore();
}
