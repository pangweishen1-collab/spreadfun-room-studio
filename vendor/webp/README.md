# Local WebP encoder

Pinned source: `@jsquash/webp` 1.5.0, from the npm registry.

- Tarball: https://registry.npmjs.org/@jsquash/webp/-/webp-1.5.0.tgz
- Verified npm integrity: `sha512-KggLoj2MnRSfIqTeKe1EmbljTX2vuV7mh79k89PCL1pyqiDULcPM1L47twxXt0hkb68F70bXiL31MxsuoZtKFw==`
- Upstream: https://github.com/jamsinclair/jSquash/tree/main/packages/webp

Only the non-SIMD encoder, its Wasm binary and option defaults are included.
`webp_enc.js` and `meta.js` have been renamed to `.mjs` without changing their contents.
The local wrapper uses lossless mode, no near-lossless preprocessing, exact transparent RGB and lossless alpha.
No CDN or external upload is used at runtime. The codec is loaded on the first Banner upload.

Licenses: Apache-2.0 in `LICENSE`; Google codec license in `LICENSE.codec.md`.
