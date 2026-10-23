// First-party anonymous usage counts and private tool suggestions. No source assets are accepted.
const TOOLS = ['room', 'avatar', 'banner'];
const EVENT_TYPES = ['generated', 'download'];
const MAX_BODY = 16 * 1024;
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

async function readJson(request) {
  checkOrigin(request);
  if (request.headers.get('Content-Type')?.split(';', 1)[0].trim().toLowerCase() !== 'application/json') {
    throw new ApiError(415, 'json_required');
  }
  const length = request.headers.get('Content-Length');
  if (length !== null && !/^\d+$/.test(length)) throw new ApiError(400, 'invalid_json');
  if (length !== null && Number(length) > MAX_BODY) throw new ApiError(413, 'body_too_large');

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
        if (size > MAX_BODY) {
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
