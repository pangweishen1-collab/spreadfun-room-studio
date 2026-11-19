// Preserve every RGBA byte, including transparent RGB. Hashes only select
// candidates; a full pixel comparison decides whether a region can be reused.
// Quarter turns reuse storage without changing the attachment's world image.
function rotatedShape(region, turns) {
  return turns % 2 ? [region.h, region.w] : [region.w, region.h];
}

function sourcePixel(region, x, y, turns) {
  if (turns === 1) return ((region.h - 1 - x) * region.w + y) * 4;
  if (turns === 2) return ((region.h - 1 - y) * region.w + region.w - 1 - x) * 4;
  if (turns === 3) return (x * region.w + region.w - 1 - y) * 4;
  return (y * region.w + x) * 4;
}

function signature(region, turns = 0) {
  const [width, height] = rotatedShape(region, turns);
  let hash = 2166136261;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const offset = sourcePixel(region, x, y, turns);
    for (let channel = 0; channel < 4; channel++) hash = Math.imul(hash ^ region.pixels[offset + channel], 16777619);
  }
  return width + ':' + height + ':' + (hash >>> 0);
}

function identical(region, candidate, turns) {
  for (let y = 0; y < region.h; y++) for (let x = 0; x < region.w; x++) {
    const target = (y * region.w + x) * 4;
    const source = sourcePixel(candidate, x, y, turns);
    for (let channel = 0; channel < 4; channel++) {
      if (region.pixels[target + channel] !== candidate.pixels[source + channel]) return false;
    }
  }
  return true;
}

function aliasAttachment(attachment, id, turns) {
  const result = {...attachment, path: id};
  if (turns % 2) {
    [result.width, result.height] = [result.height, result.width];
    if (result.scaleX !== undefined || result.scaleY !== undefined) {
      const scaleX = result.scaleX ?? 1;
      result.scaleX = result.scaleY ?? 1;
      result.scaleY = scaleX;
    }
  }
  if (turns) result.rotation = (result.rotation ?? 0) - turns * 90;
  return result;
}

/** Pack packedRegions; build the skeleton from allRegions. Both retain IDs.
 *  Only attachment.path/quarter-turn geometry changes for proven duplicates.
 *  Anchor keeps its own atlas key because its rig attachment is predefined. */
export function reuseRegions(regions) {
  const buckets = new Map();
  const bucketShapes = new Set(), remainingShapes = new Map();
  for (const {id,w,h,pixels} of regions) {
    if (!Number.isInteger(w) || !Number.isInteger(h) || w < 1 || h < 1 || pixels?.length !== w * h * 4) {
      throw Error('01R 图集复用需要完整 RGBA 区域：' + id);
    }
    if (id !== 'anchor') {
      const shape=w+':'+h;
      remainingShapes.set(shape,(remainingShapes.get(shape)||0)+1);
    }
  }
  const packedRegions = [];
  let reusedCount = 0, rotationReusedCount = 0, sourcePixels = 0, storedPixels = 0;
  const allRegions = regions.map(region => {
    const {id, w, h, pixels} = region;
    sourcePixels += w * h;
    let directKey;
    if (id !== 'anchor') {
      const shape=w+':'+h;
      remainingShapes.set(shape,remainingShapes.get(shape)-1);
      const match = bucketShapes.has(shape) && buckets.get(directKey=signature(region))
        ?.find(({region: candidate, turns}) => identical(region, candidate, turns));
      if (match) {
        reusedCount++;
        if (match.turns) rotationReusedCount++;
        return {...region, attachment: aliasAttachment(region.attachment, match.region.id, match.turns)};
      }
    }
    packedRegions.push(region);
    storedPixels += w * h;
    if (id !== 'anchor') for (let turns = 0; turns < 4; turns++) {
      // Exact or quarter-turn reuse is impossible if no later image has this
      // orientation's dimensions. Skip its full RGBA hash, not its pixels.
      const shape=rotatedShape(region,turns).join(':');
      if (!remainingShapes.get(shape)) continue;
      const key = turns===0 && directKey!==undefined ? directKey : signature(region, turns);
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push({region, turns});
      bucketShapes.add(shape);
    }
    return region;
  });
  return {
    packedRegions, allRegions,
    attachments: Object.fromEntries(allRegions.map(({id, attachment}) => [id, attachment])),
    reusedCount, rotationReusedCount, sourcePixels, storedPixels,
    reusedBytesRGBA: (sourcePixels - storedPixels) * 4,
  };
}
