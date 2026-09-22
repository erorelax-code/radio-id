const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const dns = require('dns').promises;
const net = require('net');
const crypto = require('crypto');

const root = __dirname;
const port = process.env.PORT || 8080;
const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.json': 'application/json',
  '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml'
};
const STREAMS = {
  sami: 'https://s2.radio.co/s0dc6b5c9b/listen',
  fix: 'https://stream.rcs.revma.com/pq7npt2nzbuvv',
  prl: 'https://stream.rcs.revma.com/prfmwmwy768uv'
};
const agents = {
  http: new http.Agent({ keepAlive: true, maxSockets: 100 }),
  https: new https.Agent({ keepAlive: true, maxSockets: 100 })
};
const recognitionJobs = new Map();

function json(res, code, obj) {
  if (res.headersSent) return res.destroy();
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(obj));
}

function recognitionFrame(res, requestId, code, body) {
  const id = JSON.stringify(String(requestId || '')).replace(/</g, '\\u003c');
  const payload = JSON.stringify(body).replace(/</g, '\\u003c');
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
  res.end(`<!doctype html><meta charset="utf-8"><script>parent.postMessage({type:'radio-id-recognition',id:${id},status:${code},body:${payload}},'*')<\/script>`);
}

function privateIP(ip) {
  if (net.isIP(ip) === 4) {
    const a = ip.split('.').map(Number);
    return a[0] === 10 || a[0] === 127 || a[0] === 0 || (a[0] === 169 && a[1] === 254) ||
      (a[0] === 172 && a[1] >= 16 && a[1] <= 31) || (a[0] === 192 && a[1] === 168);
  }
  return ip === '::1' || ip.startsWith('fc') || ip.startsWith('fd') || ip.startsWith('fe80:');
}

async function safeUrl(raw) {
  let u;
  try { u = new URL(raw); } catch { return null; }
  if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password) return null;
  if (u.port && !['80', '443'].includes(u.port)) return null;
  try {
    const addrs = await dns.lookup(u.hostname, { all: true });
    if (!addrs.length || addrs.some(a => privateIP(a.address))) return null;
  } catch { return null; }
  return u;
}

async function proxyStream(req, res, raw, depth = 0) {
  if (depth > 6) return json(res, 502, { error: 'too_many_redirects' });
  const u = await safeUrl(raw);
  if (!u) return json(res, 400, { error: 'invalid_stream_url' });
  const lib = u.protocol === 'https:' ? https : http;
  const up = lib.get(u, {
    headers: { 'User-Agent': 'Mozilla/5.0 RadioID/18', 'Icy-MetaData': '0', Accept: 'audio/*,*/*;q=.5', 'Accept-Encoding': 'identity' },
    agent: u.protocol === 'https:' ? agents.https : agents.http
  }, r => {
    if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location) {
      r.resume();
      return proxyStream(req, res, new URL(r.headers.location, u).toString(), depth + 1);
    }
    if (r.statusCode < 200 || r.statusCode >= 300) {
      r.resume();
      return json(res, 502, { error: `upstream_${r.statusCode}` });
    }
    res.writeHead(200, { 'content-type': r.headers['content-type'] || 'audio/mpeg', 'cache-control': 'no-store', 'access-control-allow-origin': '*' });
    res.flushHeaders?.();
    r.pipe(res);
    const close = () => r.destroy();
    req.once('aborted', close);
    res.once('close', close);
  });
  up.setTimeout(20000, () => up.destroy());
  up.on('error', () => res.headersSent ? res.destroy() : json(res, 502, { error: 'stream_unavailable' }));
}

async function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 200000) {
        reject(new Error('body_too_large'));
        req.destroy();
      }
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function resolveStreamSource(payload = {}) {
  if (typeof payload.station === 'string' && STREAMS[payload.station]) return STREAMS[payload.station];
  const raw = payload.url || payload.streamUrl;
  return typeof raw === 'string' && /^https?:\/\//i.test(raw) ? raw : null;
}

function capture(raw, seconds = 12, depth = 0) {
  return new Promise(async (resolve, reject) => {
    if (depth > 6) return reject(new Error('too_many_redirects'));
    const u = await safeUrl(raw);
    if (!u) return reject(new Error('invalid_stream_url'));
    const lib = u.protocol === 'https:' ? https : http;
    let chunks = [], bytes = 0, finished = false, timer;
    const done = (err, data) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      err ? reject(err) : resolve(data);
    };
    const request = lib.get(u, {
      headers: { 'User-Agent': 'Mozilla/5.0 RadioID-Recognition/18', 'Icy-MetaData': '0', Accept: 'audio/*,*/*;q=.5', 'Accept-Encoding': 'identity' },
      agent: u.protocol === 'https:' ? agents.https : agents.http
    }, response => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        response.resume();
        request.destroy();
        capture(new URL(response.headers.location, u).toString(), seconds, depth + 1).then(resolve, reject);
        return;
      }
      if (response.statusCode < 200 || response.statusCode >= 300) {
        response.resume();
        return done(new Error(`upstream_${response.statusCode}`));
      }
      response.on('data', chunk => {
        chunks.push(chunk);
        bytes += chunk.length;
        if (bytes >= 8 * 1024 * 1024) {
          response.destroy();
          done(null, Buffer.concat(chunks));
        }
      });
      response.on('end', () => done(null, Buffer.concat(chunks)));
      timer = setTimeout(() => {
        response.destroy();
        done(null, Buffer.concat(chunks));
      }, seconds * 1000);
    });
    request.setTimeout(15000, () => request.destroy(new Error('stream_timeout')));
    request.on('error', error => done(error));
  });
}

function auddRecognize(buffer) {
  return new Promise((resolve, reject) => {
    const token = process.env.AUDD_API_TOKEN;
    if (!token) return reject(new Error('audd_not_configured'));
    const boundary = `----RadioID${Date.now().toString(16)}`;
    const pre = Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="api_token"\r\n\r\n${token}\r\n` +
      `--${boundary}\r\nContent-Disposition: form-data; name="return"\r\n\r\napple_music,spotify\r\n` +
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="radio-audio.bin"\r\n` +
      'Content-Type: application/octet-stream\r\n\r\n'
    );
    const post = Buffer.from(`\r\n--${boundary}--\r\n`);
    const body = Buffer.concat([pre, buffer, post]);
    const request = https.request('https://api.audd.io/', {
      method: 'POST',
      headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}`, 'Content-Length': body.length, 'User-Agent': 'RadioID/18' }
    }, response => {
      let out = '';
      response.setEncoding('utf8');
      response.on('data', chunk => {
        out += chunk;
        if (out.length > 1024 * 1024) request.destroy(new Error('audd_response_too_large'));
      });
      response.on('end', () => {
        if (response.statusCode < 200 || response.statusCode >= 300) return reject(new Error(`audd_http_${response.statusCode}`));
        try { resolve(JSON.parse(out)); } catch { reject(new Error('invalid_audd_response')); }
      });
    });
    request.setTimeout(30000, () => request.destroy(new Error('audd_timeout')));
    request.on('error', reject);
    request.end(body);
  });
}

function normalizeAuddResult(auddResponse) {
  if (!auddResponse?.result) return { ok: true, found: false, message: 'Nie rozpoznano utworu. Spróbuj ponownie za chwilę.' };
  const song = auddResponse.result;
  return {
    ok: true, found: true, artist: song.artist, title: song.title, album: song.album || null,
    release_date: song.release_date || null, song_link: song.song_link || null,
    spotify: song.spotify?.external_urls?.spotify || null,
    apple_music: song.apple_music?.url || null,
    artwork: song.spotify?.album?.images?.[0]?.url || song.apple_music?.artwork?.url?.replace('{w}', '600').replace('{h}', '600') || null
  };
}

async function recognizePayload(payload) {
  if (!process.env.AUDD_API_TOKEN) return { code: 503, body: { ok: false, error: 'audd_not_configured' } };
  try {
    const raw = resolveStreamSource(payload);
    if (!raw) return { code: 400, body: { ok: false, error: 'missing_or_invalid_stream' } };
    const clip = await capture(raw, 12);
    if (clip.length < 4096) return { code: 502, body: { ok: false, error: 'audio_clip_too_small' } };
    const result = await auddRecognize(clip);
    if (result.status !== 'success') return { code: 502, body: { ok: false, error: 'audd_error', details: result.error || null } };
    return { code: 200, body: normalizeAuddResult(result) };
  } catch (error) {
    return { code: 502, body: { ok: false, error: error.message || 'recognition_failed' } };
  }
}

async function recognize(req, res, suppliedPayload = null) {
  let payload = suppliedPayload;
  if (!payload) {
    try { const body = await readBody(req); payload = body ? JSON.parse(body) : {}; }
    catch { return json(res, 400, { ok: false, error: 'invalid_json' }); }
  }
  const result = await recognizePayload(payload);
  return json(res, result.code, result.body);
}

async function startRecognitionJob(req, res) {
  let payload;
  try { const body = await readBody(req); payload = body ? JSON.parse(body) : {}; }
  catch { return json(res, 400, { ok: false, error: 'invalid_json' }); }
  if (!resolveStreamSource(payload)) return json(res, 400, { ok: false, error: 'missing_or_invalid_stream' });
  const id = crypto.randomUUID();
  recognitionJobs.set(id, { state: 'pending', created: Date.now() });
  recognizePayload(payload).then(result => {
    recognitionJobs.set(id, { state: 'done', created: Date.now(), ...result });
    setTimeout(() => recognitionJobs.delete(id), 5 * 60 * 1000).unref?.();
  });
  return json(res, 202, { ok: true, job: id });
}

function serve(req, res, pathname) {
  const file = path.join(root, pathname === '/' ? 'index.html' : pathname);
  if (!file.startsWith(root)) return res.writeHead(403).end();
  fs.stat(file, (error, stat) => {
    if (error || !stat.isFile()) {
      res.writeHead(404);
      return res.end('Not found');
    }
    res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache, no-store, must-revalidate' });
    fs.createReadStream(file).pipe(res);
  });
}

function createServer() {
  return http.createServer((req, res) => {
    // Public radio endpoints do not use cookies or private user data. A wildcard
    // lets the bundled Capacitor WebView call them regardless of its local scheme.
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      return res.end();
    }
    const u = new URL(req.url, 'http://localhost');
    if (u.pathname === '/.well-known/assetlinks.json') return json(res, 200, [{
      relation: ['delegate_permission/common.handle_all_urls'],
      target: {
        namespace: 'android_app',
        package_name: 'com.radioid.app',
        sha256_cert_fingerprints: ['C7:79:9B:0C:7E:9A:15:DF:77:17:3E:2C:62:E9:BA:61:7E:CC:3F:D1:D4:C2:71:C0:E7:9E:6E:FE:90:CD:FE:CA']
      }
    }]);
    if (u.pathname === '/health') return json(res, 200, { ok: true, app: 'Radio ID v18', auddConfigured: !!process.env.AUDD_API_TOKEN });
    if (u.pathname === '/api/recognize') {
      if (req.method === 'GET') return recognize(req, res, { station: u.searchParams.get('station'), url: u.searchParams.get('url') });
      if (req.method === 'POST') return recognize(req, res);
      return json(res, 405, { ok: false, error: 'method_not_allowed' });
    }
    if (u.pathname === '/api/recognize/start' && req.method === 'POST') return startRecognitionJob(req, res);
    if (u.pathname === '/api/recognize/status' && req.method === 'GET') {
      const job = recognitionJobs.get(u.searchParams.get('id'));
      if (!job) return json(res, 404, { ok: false, error: 'job_not_found' });
      if (job.state === 'pending') return json(res, 200, { ok: true, pending: true });
      return json(res, job.code, job.body);
    }
    if (u.pathname === '/api/recognize-frame' && req.method === 'GET') {
      const payload = { station: u.searchParams.get('station'), url: u.searchParams.get('url') };
      return recognizePayload(payload).then(result => recognitionFrame(res, u.searchParams.get('requestId'), result.code, result.body));
    }
    const match = u.pathname.match(/^\/api\/stream\/(sami|fix|prl)$/);
    if (match) return proxyStream(req, res, STREAMS[match[1]]);
    if (u.pathname === '/api/stream') {
      const raw = u.searchParams.get('url');
      if (!raw) return json(res, 400, { error: 'missing_url' });
      return proxyStream(req, res, raw);
    }
    serve(req, res, u.pathname);
  });
}

if (require.main === module) {
  createServer().listen(port, '0.0.0.0', () => console.log(`Radio ID v18: http://0.0.0.0:${port}`));
}

module.exports = { STREAMS, createServer, normalizeAuddResult, resolveStreamSource };
