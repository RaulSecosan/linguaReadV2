const MAX_TEXT = 2000;
const APP_ORIGINS = new Set(['https://lingua-59cff.web.app', 'https://lingua-59cff.firebaseapp.com']);
export async function handleSpeech(request, env, { fetchAudio = fetch, cache = globalThis.caches?.default } = {}) {
  const origin = request.headers.get('Origin') || (() => { try { return new URL(request.headers.get('Referer')).origin; } catch { return ''; } })();
  if (!APP_ORIGINS.has(origin) && !/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)) return new Response('Forbidden', { status: 403 });
  const headers = { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS', 'Access-Control-Allow-Headers': 'Range', 'Access-Control-Expose-Headers': 'X-Pronunciation-Cache', Vary: 'Origin' };
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (!['GET', 'HEAD'].includes(request.method)) return new Response('Method not allowed', { status: 405, headers });
  const url = new URL(request.url), text = (url.searchParams.get('text') || '').trim(), lang = url.searchParams.get('lang') || 'en-US';
  if (!text || text.length > MAX_TEXT || !['en-US', 'en-GB', 'ro-RO'].includes(lang)) return new Response('Invalid pronunciation text or language', { status: 400, headers });
  if (!env.OPENAI_API_KEY) return new Response('Pronuntia audio nu este configurata.', { status: 503, headers });
  const model = env.OPENAI_TTS_MODEL || 'gpt-4o-mini-tts', voice = env.OPENAI_TTS_VOICE || 'coral';
  const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify({ text, lang, model, voice }))))].map(x => x.toString(16).padStart(2, '0')).join('');
  // Internal cache keys contain no book text; this path is not exposed as a route.
  const cacheKey = new Request(`${url.origin}/internal-speech-cache/${hash}`);
  let full = await cache?.match(cacheKey), hit = Boolean(full);
  if (!full) {
    const response = await fetchAudio('https://api.openai.com/v1/audio/speech', {
      method: 'POST', headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, voice, input: text, speed: .92, response_format: 'mp3',
        ...(!model.startsWith('tts-1') ? { instructions: `Read only the supplied text, clearly and naturally, in ${lang === 'ro-RO' ? 'Romanian' : lang === 'en-GB' ? 'British English' : 'American English'}.` } : {}) }),
      signal: AbortSignal.timeout(18000),
    }).catch(() => null);
    if (!response?.ok || !(response.headers.get('Content-Type') || '').startsWith('audio/')) return new Response('Pronuntia audio nu a putut fi generata.', { status: 502, headers });
    const data = await response.arrayBuffer();
    if (!data.byteLength) return new Response('Pronuntia audio este goala.', { status: 502, headers });
    full = new Response(data, { headers: { 'Content-Type': 'audio/mpeg', 'Content-Length': String(data.byteLength), 'Cache-Control': 'public, max-age=604800' } });
    try { await cache?.put(cacheKey, full.clone()); } catch { /* Cache availability must not prevent playback. */ }
  }
  const data = await full.arrayBuffer(), size = data.byteLength;
  Object.assign(headers, { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'private, max-age=86400', 'Accept-Ranges': 'bytes', 'Content-Length': String(size), 'X-Pronunciation-Cache': hit ? 'HIT' : 'MISS' });
  const range = request.headers.get('Range');
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    let start = match?.[1] ? Number(match[1]) : 0, end = match?.[2] ? Number(match[2]) : size - 1;
    if (match && !match[1] && match[2]) { start = Math.max(0, size - Number(match[2])); end = size - 1; }
    if (!match || (!match[1] && !match[2]) || start > end || start >= size) return new Response(null, { status: 416, headers: { ...headers, 'Content-Length': '0', 'Content-Range': `bytes */${size}` } });
    end = Math.min(end, size - 1);
    return new Response(request.method === 'HEAD' ? null : data.slice(start, end + 1), { status: 206, headers: { ...headers, 'Content-Length': String(end - start + 1), 'Content-Range': `bytes ${start}-${end}/${size}` } });
  }
  return new Response(request.method === 'HEAD' ? null : data, { headers });
}
