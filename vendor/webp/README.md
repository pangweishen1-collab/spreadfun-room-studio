# Local WebP encoder

Pinned source: `@jsquash/webp` 1.5.0, from the npm registry.

- Tarball: https://registry.npmjs.org/@jsquash/webp/-/webp-1.5.0.tgz
- Verified npm integrity: `sha512-KggLoj2MnRSfIqTeKe1EmbljTX2vuV7mh79k89PCL1pyqiDULcPM1L47twxXt0hkb68F70bXiL31MxsuoZtKFw==`
- Upstream: https://github.com/jamsinclair/jSquash/tree/main/packages/webp

Only the non-SIMD encoder, its Wasm binary and option defaults are included.
`webp_enc.js` and `meta.js` have been renamed to `.mjs` without changing their contents.
The local wrapper uses lossless mode, no near-lossless preprocessing, exact transparent RGB and lossless alpha.
No CDN or external upload is used at runtime. The shared codec is loaded on the first image export, with a local module worker when available. All image tools use the same exact-lossless settings. A bounded search compares three compression-effort presets and retains the smallest actual result; it never lowers image fidelity or silently falls back to a lossy browser encoder. This optimizes the rendered output pixels; source decoding and crop/resize happen first.

Licenses: Apache-2.0 in `LICENSE`; Google codec license in `LICENSE.codec.md`.
