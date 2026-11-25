import { execFileSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const [id, screenshotPath, ...extra] = process.argv.slice(2);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
if (extra.length || (id && !uuid.test(id)) || (screenshotPath && !screenshotPath.endsWith('.webp'))) {
  throw new Error('Usage: node scripts/view-issues.mjs [receipt UUID [screenshot.webp]]');
}
const fields = 'id, description, context, created_at, screenshot IS NOT NULL AS has_screenshot';
const sql = id
  ? `SELECT ${fields}${screenshotPath ? ', screenshot' : ''} FROM issue_reports WHERE id = '${id.toLowerCase()}'`
  : 'SELECT id, substr(description, 1, 180) AS description, created_at, screenshot IS NOT NULL AS has_screenshot FROM issue_reports ORDER BY created_at DESC LIMIT 25';

const [result] = JSON.parse(execFileSync('pnpm', [
  'exec', 'wrangler', 'd1', 'execute', 'fun-toolkit-production', '--remote', '--json', '--command', sql
], {cwd:fileURLToPath(new URL('../', import.meta.url)), encoding:'utf8', maxBuffer:4 * 1024 * 1024}));
if (!result?.success) throw new Error('Issue reports could not be read.');
if (id && !result.results.length) throw new Error('Issue report not found.');

for (const row of result.results) {
  if (screenshotPath && row.screenshot) {
    const prefix = 'data:image/webp;base64,';
    if (!row.screenshot.startsWith(prefix)) throw new Error('Invalid screenshot format.');
    await writeFile(screenshotPath, Buffer.from(row.screenshot.slice(prefix.length), 'base64'), {flag:'wx', mode:0o600});
    row.screenshot_file = screenshotPath;
  }
  delete row.screenshot;
}
console.log(JSON.stringify(id ? result.results[0] : result.results, null, 2));
