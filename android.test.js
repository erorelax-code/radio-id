const fs = require('node:fs');
const test = require('node:test');
const assert = require('node:assert/strict');

test('Android manifest declares media playback and Android Auto', () => {
  const manifest = fs.readFileSync('android/app/src/main/AndroidManifest.xml', 'utf8');
  assert.match(manifest, /RadioPlaybackService/);
  assert.match(manifest, /foregroundServiceType="mediaPlayback"/);
  assert.match(manifest, /com\.google\.android\.gms\.car\.application/);
  assert.match(manifest, /FOREGROUND_SERVICE_MEDIA_PLAYBACK/);
});

test('Android Auto descriptor declares media support', () => {
  const descriptor = fs.readFileSync(
    'android/app/src/main/res/xml/automotive_app_desc.xml',
    'utf8'
  );
  assert.match(descriptor, /<uses name="media"\s*\/>/);
});

test('native service exposes a browsable radio catalogue', () => {
  const service = fs.readFileSync(
    'android/app/src/main/java/com/radioid/app/RadioPlaybackService.java',
    'utf8'
  );
  assert.match(service, /extends MediaLibraryService/);
  assert.match(service, /onGetLibraryRoot/);
  assert.match(service, /onGetChildren/);
  assert.match(service, /MEDIA_TYPE_RADIO_STATION/);
});

