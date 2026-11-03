# Local compatibility patch for SVGAPlayer-Web 2.3.2

The original MIT license is retained in SVGA-LICENSE.

2026-11-03: in the canvas renderer drawFrame masked-group exit, use the previous sprite's matteKey when flushing its group. The next sprite can be an unmasked custom text layer and has no matteKey. The group-exit lookup changes from `n.get(i.matteKey)` to `n.get(f.matteKey)`. The new-group guard also treats an empty string matteKey as unmasked, matching the existing group-exit guard. Final-group flushing is unchanged.

This prevents valid SVGA files with an appended unmasked text layer from throwing in the pinned web renderer. It does not change the SVGA format or the exported source animation. Covered by the renderer regression in tests/avatar-custom.cjs and a masked-source export/re-import browser fixture.

Upstream: https://github.com/svga/SVGAPlayer-Web/blob/master/src/Canvas/renderer.js
