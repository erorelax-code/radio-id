const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { STREAMS, normalizeAuddResult, resolveStreamSource } = require('./server');

function request(server, options = {}) {
  const address = server.address();
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: address.port, ...options }, res => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: body ? JSON.parse(body) : null }));
    });
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

test('uses the trusted URL for a built-in station', () => {
  assert.equal(resolveStreamSource({ station: 'fix', url: '/api/stream/fix' }), STREAMS.fix);
});

test('accepts a public absolute stream URL', () => {
  const url = 'https://example.com/live.mp3';
  assert.equal(resolveStreamSource({ station: 'custom', url }), url);
  assert.equal(resolveStreamSource({ streamUrl: url }), url);
});

test('rejects relative and unsupported stream URLs', () => {
  assert.equal(resolveStreamSource({ url: '/api/stream/fix' }), null);
  assert.equal(resolveStreamSource({ url: 'file:///tmp/audio.mp3' }), null);
});

test('normalizes a successful AudD response', () => {
  const result = normalizeAuddResult({ result: {
    artist: 'Artist', title: 'Song', album: 'Album', song_link: 'https://example.com/song',
    spotify: { external_urls: { spotify: 'https://open.spotify.com/track/1' }, album: { images: [{ url: 'https://example.com/cover.jpg' }] } },
    apple_music: { url: 'https://music.apple.com/song/1' }
  } });
  assert.equal(result.ok, true);
  assert.equal(result.found, true);
  assert.equal(result.title, 'Song');
  assert.equal(result.spotify, 'https://open.spotify.com/track/1');
  assert.equal(result.artwork, 'https://example.com/cover.jpg');
});

test('normalizes an empty AudD result', () => {
  assert.deepEqual(normalizeAuddResult({ result: null }), {
    ok: true,
    found: false,
    message: 'Nie rozpoznano utworu. Spróbuj ponownie za chwilę.'
  });
});

test('health reports AudD configuration without exposing the token', async t => {
  const previous = process.env.AUDD_API_TOKEN;
  delete process.env.AUDD_API_TOKEN;
  const server = require('./server').createServer().listen(0, '127.0.0.1');
  t.after(() => { server.close(); if (previous) process.env.AUDD_API_TOKEN = previous; });
  await new Promise(resolve => server.once('listening', resolve));
  const response = await request(server, { path: '/health' });
  assert.equal(response.status, 200);
  assert.equal(response.body.auddConfigured, false);
  assert.equal(JSON.stringify(response.body).includes('token'), false);
});

test('recognition returns a clear configuration error before fetching audio', async t => {
  const previous = process.env.AUDD_API_TOKEN;
  delete process.env.AUDD_API_TOKEN;
  const server = require('./server').createServer().listen(0, '127.0.0.1');
  t.after(() => { server.close(); if (previous) process.env.AUDD_API_TOKEN = previous; });
  await new Promise(resolve => server.once('listening', resolve));
  const body = JSON.stringify({ station: 'fix', url: '/api/stream/fix' });
  const response = await request(server, {
    path: '/api/recognize', method: 'POST', body,
    headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) }
  });
  assert.equal(response.status, 503);
  assert.deepEqual(response.body, { ok: false, error: 'audd_not_configured' });
});

test('asynchronous recognition returns a short job response', async t => {
  const previous = process.env.AUDD_API_TOKEN;
  delete process.env.AUDD_API_TOKEN;
  const server = require('./server').createServer().listen(0, '127.0.0.1');
  t.after(() => { server.close(); if (previous) process.env.AUDD_API_TOKEN = previous; });
  await new Promise(resolve => server.once('listening', resolve));
  const body = JSON.stringify({ station: 'prl' });
  const start = await request(server, {
    path: '/api/recognize/start', method: 'POST', body,
    headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) }
  });
  assert.equal(start.status, 202);
  assert.equal(typeof start.body.job, 'string');
  await new Promise(resolve => setImmediate(resolve));
  const result = await request(server, { path: '/api/recognize/status?id=' + encodeURIComponent(start.body.job) });
  assert.equal(result.status, 503);
  assert.equal(result.body.error, 'audd_not_configured');
});

test('Android can start recognition with a simple GET and inspect its result', async t => {
  const previous = process.env.AUDD_API_TOKEN;
  delete process.env.AUDD_API_TOKEN;
  const server = require('./server').createServer().listen(0, '127.0.0.1');
  t.after(() => { server.close(); if (previous) process.env.AUDD_API_TOKEN = previous; });
  await new Promise(resolve => server.once('listening', resolve));
  const start = await request(server, { path: '/api/recognize/start?station=prl', method: 'GET' });
  assert.equal(start.status, 202);
  assert.equal(start.body.stage, 'queued');
  await new Promise(resolve => setImmediate(resolve));
  const result = await request(server, { path: '/api/recognize/status?id=' + encodeURIComponent(start.body.job) });
  assert.equal(result.status, 503);
  assert.equal(result.body.error, 'audd_not_configured');
});

test('iframe recognition returns a callback page for Android WebView', async t => {
  const previous = process.env.AUDD_API_TOKEN;
  delete process.env.AUDD_API_TOKEN;
  const server = require('./server').createServer().listen(0, '127.0.0.1');
  t.after(() => { server.close(); if (previous) process.env.AUDD_API_TOKEN = previous; });
  await new Promise(resolve => server.once('listening', resolve));
  const address = server.address();
  const body = await new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port: address.port, path: '/api/recognize-frame?station=prl&requestId=test-1' }, res => {
      let out = ''; res.on('data', chunk => { out += chunk; }); res.on('end', () => resolve(out));
    }).on('error', reject);
  });
  assert.match(body, /postMessage\(\{type:'radio-id-recognition',id:"test-1",status:503/);
  assert.match(body, /audd_not_configured/);
});

test('allows API requests from the bundled Capacitor app', async t => {
  const server = require('./server').createServer().listen(0, '127.0.0.1');
  t.after(() => server.close());
  await new Promise(resolve => server.once('listening', resolve));
  const response = await request(server, {
    path: '/api/recognize',
    method: 'OPTIONS',
    headers: { origin: 'https://localhost' }
  });
  assert.equal(response.status, 204);
  assert.equal(response.headers['access-control-allow-origin'], '*');
  assert.match(response.headers['access-control-allow-methods'], /POST/);
});


test('publishes Digital Asset Links for the full-screen Android app', async t => {
  const server = require('./server').createServer().listen(0, '127.0.0.1');
  t.after(() => server.close());
  await new Promise(resolve => server.once('listening', resolve));
  const response = await request(server, { path: '/.well-known/assetlinks.json' });
  assert.equal(response.status, 200);
  assert.equal(response.body[0].target.package_name, 'com.radioid.app');
  assert.equal(response.body[0].target.sha256_cert_fingerprints[0], 'C7:79:9B:0C:7E:9A:15:DF:77:17:3E:2C:62:E9:BA:61:7E:CC:3F:D1:D4:C2:71:C0:E7:9E:6E:FE:90:CD:FE:CA');
});
