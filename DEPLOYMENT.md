# Fun Toolkit deployment

- Website: https://fun-toolkit.pangweishen1.workers.dev
- Source: https://github.com/pangweishen1-collab/spreadfun-room-studio
- Legacy entrance: https://pangweishen1-collab.github.io/spreadfun-room-studio/
- Hosting: Cloudflare Worker Static Assets and a dedicated D1 database.
- GitHub Pages: main branch, `/docs`; this folder only redirects to the canonical website and preserves the tool hash.

## Publish an update

Use Node.js 22+ and pnpm. Authentication stays in the owner's GitHub and Wrangler login sessions; never commit tokens or `.env` files.

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm test
# Apply new schema migrations only when a release includes them.
pnpm exec wrangler d1 migrations apply fun-toolkit-production --remote
pnpm deploy
```

Commit and push the matching source to GitHub. A GitHub push alone does not deploy the Worker. No CI credentials have been added. Keep `wrangler.jsonc` and `pnpm-lock.yaml` with the source.

`dist/` is generated from an explicit public-file list. Python code, Worker source, migrations, tests, documentation, databases, local tool state and credentials stay out of the website assets. Third-party licences remain alongside their libraries.

## Data and requests

Production starts with its own database; local test records are not imported. Events use UUID idempotency and an SQLite trigger so an event and its cumulative count commit atomically. The production rate limits are global fixed windows: 600 event submissions per minute, 30 suggestions per 10 minutes. Window boundaries may permit adjacent bursts. No IP address or browser identifier is stored by this application.

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

Use Cloudflare's Worker deployment history to select a previous version. This does not revert D1 data or schema. The original GitHub source history remains available. Do not delete or reset production tables as part of a code rollback.
