# Local WebP encoder

Pinned source: `@jsquash/webp` 1.5.0, from the npm registry.

- Tarball: https://registry.npmjs.org/@jsquash/webp/-/webp-1.5.0.tgz
- Verified npm integrity: `sha512-KggLoj2MnRSfIqTeKe1EmbljTX2vuV7mh79k89PCL1pyqiDULcPM1L47twxXt0hkb68F70bXiL31MxsuoZtKFw==`
- Upstream: https://github.com/jamsinclair/jSquash/tree/main/packages/webp

Only the non-SIMD encoder, its Wasm binary and option defaults are included.
`webp_enc.js` and `meta.js` have been renamed to `.mjs` without changing their contents.
The shared wrapper defaults to the high-quality profile and retains an explicit exact-lossless profile. High quality compares fixed high-quality lossy RGB and lossless candidates by actual size; it may change RGB pixels and must not be described as pixel-lossless. Both profiles keep alpha lossless. Exact lossless uses `lossless=1`, `near_lossless=100`, `exact=1` and `alpha_quality=100`, preserving all rendered RGBA, including transparent RGB. Its bounded search compares compression-effort presets and retains the smallest actual result.

No CDN or external upload is used at runtime. All image tools use the shared preference. A bounded local worker pool handles independent jobs; worker fallback uses the same codec and selected profile. Errors do not silently change profiles or fall back to a browser encoder. Rendering, source decoding and crop/resize happen first; neither profile restores detail already lost there. Candidate comparison does not guarantee the globally smallest file.

Licenses: Apache-2.0 in `LICENSE`; Google codec license in `LICENSE.codec.md`.
