const { createClient } = require('redis');

const REDIS_URL = process.env.REDIS_URL || null;
const DEFAULT_TTL = Number(process.env.REDIS_TTL_SECONDS) || 300; // seconds

let client = null;
let ready = false;

async function init() {
  if (client || !REDIS_URL) return;
  client = createClient({ url: REDIS_URL });
  client.on('error', (err) => console.error('[Redis] error', err.message));
  try {
    await client.connect();
    ready = true;
    console.log('[Redis] connected');
  } catch (err) {
    console.error('[Redis] connect failed:', err.message);
    client = null;
  }
}

async function get(key) {
  if (!REDIS_URL) return null;
  if (!client) await init();
  if (!client) return null;
  try {
    const v = await client.get(key);
    return v ? JSON.parse(v) : null;
  } catch (err) {
    console.warn('[Redis] get failed', err.message);
    return null;
  }
}

async function set(key, value, ttlSeconds = DEFAULT_TTL) {
  if (!REDIS_URL) return;
  if (!client) await init();
  if (!client) return;
  try {
    const s = JSON.stringify(value);
    if (ttlSeconds > 0) {
      await client.setEx(key, ttlSeconds, s);
    } else {
      await client.set(key, s);
    }
  } catch (err) {
    console.warn('[Redis] set failed', err.message);
  }
}

// atomic get-or-set using a promise lock per key (dedupe concurrent calls)
const inflight = new Map();
async function getOrSet(key, fn, ttlSeconds = DEFAULT_TTL) {
  const cached = await get(key);
  if (cached !== null) return cached;
  if (inflight.has(key)) return inflight.get(key);
  const p = (async () => {
    try {
      const v = await fn();
      if (v !== undefined) await set(key, v, ttlSeconds);
      return v;
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, p);
  return p;
}

module.exports = { init, get, set, getOrSet };
