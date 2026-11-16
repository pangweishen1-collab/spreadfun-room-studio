/* The editor bitmap and the exported SVGA text layer use the same fill. */
export const TEXT_STYLES = Object.freeze({
  plain: Object.freeze({}),
  brightGold: Object.freeze({baseColor: '#E9B83F'}),
  champagne: Object.freeze({baseColor: '#D9BF87'}),
  silver: Object.freeze({baseColor: '#B7C6D7'}),
  roseGold: Object.freeze({baseColor: '#D79584'}),
  threeToneGold: Object.freeze({highlightColor: '#FFF3BD', midColor: '#F4C64F', baseColor: '#A96317'}),
  honeyGold: Object.freeze({
    baseColor: '#FFE29A', highlightColor: '#FFFFFF', outlineColor: '#C59130', shadeColor: '#D4A344',
    outlineWidth: .75, depth: .075, bevel: .022,
    reflection: [[0,.93],[.23,.46],[.43,.28],[.59,-.23],[.76,.48],[1,-.26]]
  }),
  gleamGold: Object.freeze({
    baseColor: '#FFD85A', highlightColor: '#FFFFFF', outlineColor: '#C78A24', shadeColor: '#D69A2C',
    outlineWidth: .65, depth: .055, bevel: .018,
    reflection: [[0,.84],[.22,.17],[.38,-.12],[.45,-.49],[.48,.98],[.54,.76],[.64,.15],[.84,-.21],[1,.46]]
  }),
  sunGold: Object.freeze({
    baseColor: '#FFC63D', highlightColor: '#FFFFFF', outlineColor: '#C58217', shadeColor: '#D59624',
    outlineWidth: .8, depth: .09, bevel: .026,
    reflection: [[0,.78],[.15,.45],[.35,.05],[.55,-.28],[.61,.66],[.74,.22],[1,-.27]]
  }),
  reliefGold: Object.freeze({
    baseColor: '#FFE06E', highlightColor: '#FFFFFF', outlineColor: '#C68A24', shadeColor: '#D4A02E',
    outlineWidth: .85, depth: .13, bevel: .034,
    reflection: [[0,.92],[.18,.61],[.35,.24],[.54,-.28],[.67,-.42],[.74,.37],[.87,.54],[1,-.36]]
  })
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

function goldLine(ctx, line, x, y, {
  size, strokeWidth, strokeColor, color, highlightColor, preset
}) {
  const channels = hex => [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16));
  const base = channels(color || preset.baseColor);
  const shade = channels(preset.shadeColor);
  const highlight = channels(highlightColor || preset.highlightColor);
  const mix = (target, amount) => 'rgb(' + base.map((channel, index) =>
    Math.round(channel + (target[index] - channel) * amount)).join(',') + ')';
  const depth = Math.max(.7, size * preset.depth);
  const bevel = Math.max(.35, size * preset.bevel);
  const metrics = ctx.measureText(line || ' ');
  const top = y - (metrics.actualBoundingBoxAscent || size * .8);
  const bottom = y + (metrics.actualBoundingBoxDescent || size * .18);
  const gradient = stops => {
    const paint = ctx.createLinearGradient(0, top, 0, bottom);
    for (const [at, light] of stops) paint.addColorStop(at, mix(light < 0 ? shade : highlight, Math.abs(light)));
    return paint;
  };

  ctx.fillStyle = mix(shade, .68);
  ctx.strokeStyle = mix(shade, .75);
  ctx.lineWidth = strokeWidth * 2 + bevel * 2;
  const steps = Math.ceil(depth * 2);
  for (let step = steps; step >= 1; step--) {
    const offset = depth * step / steps;
    ctx.strokeText(line, x + offset * .7, y + offset);
    ctx.fillText(line, x + offset * .7, y + offset);
  }
  if (strokeWidth > 0) {
    ctx.strokeStyle = strokeColor;
    ctx.strokeText(line, x, y);
  }
  ctx.strokeStyle = gradient([[0,.9],[.38,.25],[.52,-.48],[1,-.68]]);
  ctx.lineWidth = bevel * 2;
  ctx.strokeText(line, x, y);
  ctx.fillStyle = gradient(preset.reflection);
  ctx.fillText(line, x, y);
}

export function drawStyledText(ctx, {
  lines, size, width, padding, font, color, strokeWidth = 0,
  strokeColor = '#000000', styleKey = 'plain', highlightColor, midColor
}) {
  const preset = TEXT_STYLES[styleKey];
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
    if (preset?.reflection) {
      goldLine(ctx, line, x, y, {size, strokeWidth, strokeColor, color, highlightColor, preset});
      return;
    }
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
