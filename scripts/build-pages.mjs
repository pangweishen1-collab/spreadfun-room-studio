import './build-site.mjs';
import {cp, copyFile, rm, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(root, 'dist-pages');
const assets = path.join(output, 'public');
await rm(output, {recursive: true, force: true});
await cp(path.join(root, 'dist'), assets, {recursive: true});
// An isolated config directory keeps Pages from reading the production Worker config.
await copyFile(path.join(root, 'wrangler.pages.jsonc'), path.join(output, 'wrangler.jsonc'));
// Pages advanced mode runs the existing API against the same D1 binding.
await copyFile(path.join(root, 'worker/index.mjs'), path.join(assets, '_worker.js'));
await writeFile(path.join(assets, '_routes.json'), JSON.stringify({
  version: 1,
  include: ['/api', '/api/*'],
  exclude: [],
}, null, 2) + '\n');
console.log('Pages build ready; only /api routes invoke the shared API worker.');
