import {CanvasSpineRenderer} from '../six-face/canvas-spine.mjs';
import {prepareFaces} from '../six-face/prepare-faces.mjs';
import {buildSpineJson} from '../six-face/spine-builder.mjs';

function canvas(width, height) {
  return Object.assign(document.createElement('canvas'), {width, height});
}

// Reuse the existing rounded mesh to generate only the two missing paintings.
// The exported animation still runs the original binary, not the mesh rig.
export function generateReferenceRollArt(faces) {
  const prepared = prepareFaces(faces);
  const [left, top, width, height] = prepared.crop;
  const sheet = canvas(width * 6, height * 2);
  const ctx = sheet.getContext('2d');
  const atlasText = ['angles.png', `size: ${sheet.width}, ${sheet.height}`];
  const inset = Math.round(Math.min(width, height) * .06);
  for (let point = 1; point <= 6; point++) {
    const x = (point - 1) * width;
    // Remove the outer rim that was painted into the flat face; otherwise
    // two rims appear back-to-back where the rounded surfaces join.
    ctx.drawImage(prepared.textures[point], inset, inset, width - 2 * inset, height - 2 * inset,
      x, 0, width, height);
    ctx.drawImage(prepared.landingImages[point], left, top, width, height, x, height, width, height);
    atlasText.push(`roll_${point}`, `bounds: ${x}, 0, ${width}, ${height}`,
      `flat_${point}`, `bounds: ${x}, ${height}, ${width}, ${height}`);
  }
  const spine = globalThis.spine;
  const atlas = new spine.TextureAtlas(atlasText.join('\n') + '\n');
  const json = buildSpineJson(prepared);
  json.slots = json.slots.filter(slot => slot.name !== 'anchor' && slot.name !== 'shadow');
  for (const skin of json.skins) {
    delete skin.attachments.anchor;
    delete skin.attachments.shadow;
  }
  // The two removed slots precede every moving slot, so draw-order offsets are unchanged.
  for (const animation of Object.values(json.animations)) {
    if (animation.slots) delete animation.slots.shadow;
  }
  const data = new spine.SkeletonJson(new spine.AtlasAttachmentLoader(atlas)).readSkeletonData(json);
  const renderer = new CanvasSpineRenderer(atlas, sheet, {width: 256, height: 256});
  try {
    // Choose two three-quarter poses from the same roll; different result
    // tracks could rotate back to nearly the same face configuration.
    const animation = data.findAnimation('spin_1');
    return [.08, .308333].map(time => {
      const skeleton = new spine.Skeleton(data);
      skeleton.x = skeleton.y = 128;
      animation.apply(skeleton, 0, time, false, null, 1, spine.MixBlend.setup, spine.MixDirection.mixIn);
      skeleton.updateWorldTransform(spine.Physics.update);
      const angle = canvas(256, 256);
      renderer.draw(angle.getContext('2d'), skeleton);
      return angle;
    });
  } finally {
    renderer.dispose();
  }
}
