// First-party counters, private suggestions and shared review templates.
const TOOLS = ['room', 'avatar', 'banner', 'gift', 'resources', 'vap'];
const EVENT_TYPES = ['generated', 'download'];
const MAX_BODY = 16 * 1024;
const MAX_REVIEW_BODY = 704 * 1024;
const MAX_REVIEW_ENTRIES = 100;
const TEMPLATES_PATH = '/api/vap-review-templates';
const BACKGROUNDS_PATH = '/api/vap-review-backgrounds';
const WEBP_DATA = 'data:image/webp;base64,';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

class ApiError extends Error {
  constructor(status, code) {
    super(code);
    this.status = status;
  }
}

function json(status, payload, head = false) {
  return new Response(head ? null : JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

function originKey(value) {
  try {
    if (value !== value.trim() || !/^https?:\/\/[^/?#]+$/i.test(value)) return null;
    const url = new URL(value);
    if (url.username || url.password || !['http:', 'https:'].includes(url.protocol)) return null;
    return url.origin;
  } catch {
    return null;
  }
}

function checkOrigin(request) {
  if (request.headers.get('Sec-Fetch-Site')?.toLowerCase() === 'cross-site') {
    throw new ApiError(403, 'origin_not_allowed');
  }
  const supplied = request.headers.get('Origin');
  // CLI clients have no Origin header, as with the local Python server.
  if (supplied !== null && originKey(supplied) !== new URL(request.url).origin) {
    throw new ApiError(403, 'origin_not_allowed');
  }
}

async function readJson(request, maxBody = MAX_BODY) {
  checkOrigin(request);
  if (request.headers.get('Content-Type')?.split(';', 1)[0].trim().toLowerCase() !== 'application/json') {
    throw new ApiError(415, 'json_required');
  }
  const length = request.headers.get('Content-Length');
  if (length !== null && !/^\d+$/.test(length)) throw new ApiError(400, 'invalid_json');
  if (length !== null && Number(length) > maxBody) throw new ApiError(413, 'body_too_large');

  // Streaming and chunked requests get the same actual-byte limit; headers are not trusted.
  const reader = request.body?.getReader();
  const chunks = [];
  let size = 0;
  if (reader) {
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > maxBody) {
          await reader.cancel();
          throw new ApiError(413, 'body_too_large');
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    const payload = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error();
    return payload;
  } catch {
    throw new ApiError(400, 'invalid_json');
  }
}

function validateEvent(payload) {
  if (Object.keys(payload).sort().join(',') !== 'count,id,tool,type'
      || typeof payload.id !== 'string' || !UUID.test(payload.id)
      || !TOOLS.includes(payload.tool) || !EVENT_TYPES.includes(payload.type)
      || !Number.isInteger(payload.count) || payload.count < 1 || payload.count > 100) {
    throw new ApiError(400, 'invalid_event');
  }
  return { ...payload, id: payload.id.toLowerCase() };
}

function validateRequest(payload) {
  if (Object.keys(payload).some(key => !['title', 'description', 'contact'].includes(key))) {
    throw new ApiError(400, 'invalid_request');
  }
  const result = {};
  for (const [key, maximum, required] of [['title', 100, true], ['description', 2000, true], ['contact', 120, false]]) {
    const value = Object.hasOwn(payload, key) ? payload[key] : '';
    // Count Unicode code points, matching Python's string limits instead of UTF-16 units.
    if (typeof value !== 'string' || [...value].length > maximum || value.includes('\0')
        || (required && !value.trim())) throw new ApiError(400, 'invalid_request');
    result[key] = value.trim();
  }
  return result;
}

async function allow(db, endpoint) {
  const [capacity, seconds] = endpoint === 'events' ? [600, 60] : [30, 600];
  const windowStart = Math.floor(Date.now() / (seconds * 1000)) * seconds;
  // ponytail: one atomic D1 fixed-window bucket per endpoint, shared across Worker isolates.
  // The boundary can permit two adjacent bursts; use a Durable Object if sliding windows are needed.
  const row = await db.prepare(`
    INSERT INTO rate_limits (endpoint, window_start, count) VALUES (?, ?, 1)
    ON CONFLICT (endpoint) DO UPDATE SET
      window_start = excluded.window_start,
      count = CASE WHEN rate_limits.window_start = excluded.window_start THEN rate_limits.count + 1 ELSE 1 END
    WHERE rate_limits.window_start < excluded.window_start
       OR (rate_limits.window_start = excluded.window_start AND rate_limits.count < ?)
    RETURNING count
  `).bind(endpoint, windowStart, capacity).first();
  if (!row) throw new ApiError(429, 'rate_limited');
}

async function stats(db) {
  const [counts, metadata] = await db.batch([
    db.prepare('SELECT tool, type, count FROM counters'),
    db.prepare('SELECT key, value FROM metadata'),
  ]);
  const tools = Object.fromEntries(TOOLS.map(tool => [tool, { generated: 0, downloads: 0 }]));
  for (const row of counts.results) {
    tools[row.tool][row.type === 'download' ? 'downloads' : 'generated'] = row.count;
  }
  const dates = Object.fromEntries(metadata.results.map(row => [row.key, row.value]));
  if (!dates.startedAt || !dates.updatedAt) throw new Error('missing_metadata');
  return {
    totals: Object.fromEntries(['generated', 'downloads'].map(key => [key,
      TOOLS.reduce((sum, tool) => sum + tools[tool][key], 0)])),
    tools,
    updatedAt: dates.updatedAt,
    startedAt: dates.startedAt,
  };
}

async function record(db, payload) {
  const inserted = await db.prepare(`
    INSERT INTO events (id, tool, type, count, created_at) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT (id) DO NOTHING RETURNING id
  `).bind(payload.id, payload.tool, payload.type, payload.count, new Date().toISOString()).first();
  if (inserted) return json(201, { accepted: true, duplicate: false });
  const prior = await db.prepare('SELECT tool, type, count FROM events WHERE id = ?').bind(payload.id).first();
  if (!prior || prior.tool !== payload.tool || prior.type !== payload.type || prior.count !== payload.count) {
    throw new ApiError(409, 'event_conflict');
  }
  return json(200, { accepted: true, duplicate: true });
}

async function saveRequest(db, payload) {
  const receipt = { id: crypto.randomUUID(), createdAt: new Date().toISOString() };
  await db.prepare('INSERT INTO requests (id, title, description, contact, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(receipt.id, payload.title, payload.description, payload.contact, receipt.createdAt).run();
  return json(201, receipt);
}

function hasFields(value, fields) {
  return value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).sort().join(',') === fields;
}

function reviewName(value, invalid) {
  if (typeof value !== 'string') invalid();
  const name = value.trim().normalize('NFC');
  if (!name || [...name].length > 40 || /[\u0000-\u001f\u007f\uD800-\uDFFF]/u.test(name)) invalid();
  return name;
}

function validateBackgroundImage(image, invalid) {
  if (typeof image !== 'string' || !image.startsWith(WEBP_DATA)) invalid();
  const encoded = image.slice(WEBP_DATA.length);
  if (encoded.length < 28 || encoded.length % 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) invalid();
  const padding = encoded.endsWith('==') ? 2 : encoded.endsWith('=') ? 1 : 0;
  const size = encoded.length / 4 * 3 - padding;
  if (size < 20 || size > 512 * 1024) invalid();
  const header = atob(encoded.slice(0, 28));
  const riffSize = header.charCodeAt(4) + header.charCodeAt(5) * 256 + header.charCodeAt(6) * 65536 + header.charCodeAt(7) * 16777216;
  if (header.slice(0, 4) !== 'RIFF' || header.slice(8, 12) !== 'WEBP' || riffSize !== size - 8
      || !['VP8 ', 'VP8L', 'VP8X'].includes(header.slice(12, 16))) invalid();
}

function validateBackground(payload) {
  const invalid = () => { throw new ApiError(400, 'invalid_background'); };
  if (!hasFields(payload, 'backgroundImage,name')) invalid();
  const name = reviewName(payload.name, invalid);
  validateBackgroundImage(payload.backgroundImage, invalid);
  return { name, backgroundImage: payload.backgroundImage };
}

function validateTemplate(payload) {
  const invalid = () => { throw new ApiError(400, 'invalid_template'); };
  const hasReference = Object.hasOwn(payload, 'backgroundId');
  if (!hasFields(payload, hasReference ? 'background,backgroundId,backgroundImage,name,slots' : 'background,backgroundImage,name,slots')) invalid();
  const name = reviewName(payload.name, invalid);
  const { background, backgroundId, backgroundImage, slots } = payload;
  if (!['ludo', 'dark', 'custom'].includes(background) || !Array.isArray(slots) || slots.length < 1 || slots.length > 6) invalid();
  for (const slot of slots) {
    if (!hasFields(slot, 'key,mask,offsetY,scale') || !Number.isInteger(slot.scale) || slot.scale < 25 || slot.scale > 110
        || !Number.isFinite(slot.offsetY) || Math.abs(slot.offsetY) > 50
        || !['auto', 'opaque', 'black_luma', 'white_luma', 'chroma_key'].includes(slot.key)
        || !hasFields(slot.mask, 'bottomEnd,bottomStart,enabled,topEnd,topStart')) invalid();
    const { enabled, topStart, topEnd, bottomStart, bottomEnd } = slot.mask;
    if (typeof enabled !== 'boolean' || ![topStart, topEnd, bottomStart, bottomEnd].every(Number.isFinite)
        || !(0 <= topStart && topStart < topEnd && topEnd <= bottomStart && bottomStart < bottomEnd && bottomEnd <= 1)) invalid();
  }
  const settings = { background, slots };
  if (hasReference) {
    if (background !== 'custom' || typeof backgroundId !== 'string' || !UUID.test(backgroundId) || backgroundImage !== null) invalid();
    settings.backgroundId = backgroundId.toLowerCase();
  } else if (background === 'custom') {
    validateBackgroundImage(backgroundImage, invalid);
  } else if (backgroundImage !== null) invalid();
  return { name, settings, backgroundImage };
}

async function reviewLibrary(request, db, path, collection) {
  const templates = collection === TEMPLATES_PATH;
  const key = templates ? 'template' : 'background';
  const table = templates ? 'vap_review_templates' : 'vap_review_backgrounds';
  const head = request.method === 'HEAD';
  if (path === collection && ['GET', 'HEAD'].includes(request.method)) {
    const { results } = await db.prepare(`SELECT id, name, created_at AS createdAt FROM ${table} ORDER BY created_at DESC, id LIMIT ?`)
      .bind(MAX_REVIEW_ENTRIES).all();
    return json(200, { [key + 's']: results }, head);
  }
  if (path !== collection && ['GET', 'HEAD'].includes(request.method)) {
    const id = path.slice(collection.length + 1);
    if (!UUID.test(id)) throw new ApiError(404, 'not_found');
    const row = await db.prepare(`SELECT id, name, created_at AS createdAt, background_image AS backgroundImage${templates ? ', settings' : ''} FROM ${table} WHERE id = ?`)
      .bind(id.toLowerCase()).first();
    if (!row) throw new ApiError(404, 'not_found');
    const { settings, ...entry } = row;
    return json(200, settings ? { ...entry, ...JSON.parse(settings) } : entry, head);
  }
  if (path !== collection || request.method !== 'POST') throw new ApiError(405, 'method_not_allowed');
  const payload = await readJson(request, MAX_REVIEW_BODY);
  const { name, settings, backgroundImage } = templates ? validateTemplate(payload) : validateBackground(payload);
  if (settings?.backgroundId && !await db.prepare('SELECT 1 FROM vap_review_backgrounds WHERE id = ?').bind(settings.backgroundId).first()) {
    throw new ApiError(409, 'background_missing');
  }
  const id = crypto.randomUUID(), nameKey = name.toLowerCase(), createdAt = new Date().toISOString();
  // Keep both the shared capacity and the short-window write limit atomic.
  const inserted = await db.prepare(`
    INSERT INTO ${table} (id, name, name_key, background_image, created_at${templates ? ', settings' : ''})
    SELECT ?, ?, ?, ?, ?${templates ? ', ?' : ''}
    WHERE (SELECT count(*) FROM ${table}) < ?
      AND (SELECT count(*) FROM ${table} WHERE created_at >= ?) < 6
    ON CONFLICT DO NOTHING RETURNING id
  `).bind(id, name, nameKey, backgroundImage, createdAt, ...(templates ? [JSON.stringify(settings)] : []),
    MAX_REVIEW_ENTRIES, new Date(Date.now() - 60000).toISOString()).first();
  if (inserted) return json(201, { id, name, createdAt });
  if (await db.prepare(`SELECT 1 FROM ${table} WHERE name_key = ?`).bind(nameKey).first()) throw new ApiError(409, key + '_exists');
  if ((await db.prepare(`SELECT count(*) AS count FROM ${table}`).first()).count >= MAX_REVIEW_ENTRIES) throw new ApiError(409, key + '_limit');
  throw new ApiError(429, 'rate_limited');
}

export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    const isApi = path === '/api' || path.startsWith('/api/');
    if (!isApi) {
      if (!['GET', 'HEAD'].includes(request.method)) return json(405, { error: 'method_not_allowed' });
      return env.ASSETS.fetch(request);
    }
    const head = request.method === 'HEAD';
    try {
      if (path === '/api/stats' && ['GET', 'HEAD'].includes(request.method)) {
        return json(200, await stats(env.DB.withSession('first-primary')), head);
      }
      const collection = [TEMPLATES_PATH, BACKGROUNDS_PATH].find(value => path === value || path.startsWith(value + '/'));
      if (collection) {
        return await reviewLibrary(request, env.DB.withSession('first-primary'), path, collection);
      }
      if (!['GET', 'HEAD', 'POST'].includes(request.method)) {
        throw new ApiError(405, 'method_not_allowed');
      }
      if (request.method !== 'POST' || !['/api/events', '/api/requests'].includes(path)) {
        throw new ApiError(404, 'not_found');
      }
      const payload = await readJson(request);
      const validated = path === '/api/events' ? validateEvent(payload) : validateRequest(payload);
      const db = env.DB.withSession('first-primary');
      await allow(db, path === '/api/events' ? 'events' : 'requests');
      return path === '/api/events' ? await record(db, validated) : await saveRequest(db, validated);
    } catch (error) {
      // Never log request bodies, contact details, file names or client identifiers.
      return json(error instanceof ApiError ? error.status : 503,
        { error: error instanceof ApiError ? error.message : 'storage_unavailable' }, head);
    }
  },
};
