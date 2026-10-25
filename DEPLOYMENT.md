# Fun Toolkit deployment

- Website: https://fun-toolkit.pages.dev/
- Test website: https://fun-toolkit-pages-test.pages.dev/
- Legacy Workers compatibility address: https://fun-toolkit.pangweishen1.workers.dev/
- Source: https://github.com/pangweishen1-collab/spreadfun-room-studio
- Legacy entrance: https://pangweishen1-collab.github.io/spreadfun-room-studio/
- Hosting: Cloudflare Pages, an advanced-mode API Worker and the existing `fun-toolkit-production` D1 database.
- GitHub Pages: main branch, `/docs`; this folder only redirects to the canonical website and preserves the tool hash.

## Publish an update

Use Node.js 22+ and pnpm. Authentication stays in the owner's GitHub and Wrangler login sessions; never commit tokens or `.env` files.

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm exec wrangler whoami
pnpm deploy:pages
```

`pnpm deploy` is an alias for `pnpm deploy:pages`. The Pages command rebuilds the site, then deploys `dist-pages/public` to project `fun-toolkit` on branch `main`. `pnpm deploy:pages:test` targets the separate test project. The legacy Worker command remains `pnpm deploy:worker`; it is not part of the default release.

Commit and push the matching source to GitHub. A GitHub push alone does not publish the Pages site. No CI credentials have been added. Keep both Wrangler configuration files and `pnpm-lock.yaml` with the source. Update `docs/index.html` when the canonical domain changes; it preserves existing tool hashes while redirecting.

`dist/` is generated from an explicit public-file list. `build:pages` copies it to `dist-pages/public`, adds `_worker.js` and limits Worker execution to `/api` and `/api/*`. The generated Pages configuration stays outside the public asset directory. Python code, migrations, tests, documentation, databases, local tool state and credentials stay out of the website assets. Third-party licences remain alongside their libraries. The local matting model is split into chunks of at most 20 MiB for static hosting.

This release does not change the database schema. Do not migrate, initialize, import or reset the shared production database for a routine Pages release. Only a release containing a reviewed schema change should apply its new migrations.

## Data and requests

The production Pages site, test Pages site and legacy Worker share the existing D1 database; local test records are not imported. Events use UUID idempotency and an SQLite trigger so an event and its cumulative count commit atomically. The production rate limits are global fixed windows: 600 event submissions per minute, 30 suggestions per 10 minutes. Window boundaries may permit adjacent bursts. No IP address or browser identifier is stored by this application.

Suggestions have no public list API. The owner can read them through their authenticated Cloudflare dashboard or CLI:

```sh
pnpm exec wrangler d1 execute fun-toolkit-production --remote --command 'SELECT id,title,description,contact,created_at FROM requests ORDER BY created_at DESC' --json
```

Do not publish the result or place database exports in the website/repository. Source images and SVGA files continue to be processed in the visitor's browser.

## Isolated backend verification

```sh
pnpm build
pnpm exec wrangler d1 migrations apply fun-toolkit-production --local
pnpm dev
python3 tests/worker_api_test.py --base-url http://127.0.0.1:8787
```

The Worker suite refuses non-local URLs and writes synthetic events and suggestions. Use fresh local Wrangler state, never real user data. The Python preview remains available through `start-preview.command`; its SQLite database is separate from D1.

## Rollback

Use the `fun-toolkit` Pages project's deployment history to restore a previous production deployment. This does not revert D1 data or schema. The original GitHub source history remains available. The legacy Worker's deployment history applies only to that compatibility address. Do not delete or reset production tables as part of a code rollback.
