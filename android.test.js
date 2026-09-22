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



test('Android WebView hides Render warm-up and retries until Radio ID is ready', () => {
  const activity = fs.readFileSync('android/app/src/main/java/com/radioid/app/MainActivity.java', 'utf8');
  assert.match(activity, /setVisibility\(View\.INVISIBLE\)/);
  assert.doesNotMatch(activity, /RETRY_DELAY_MS/);
  assert.match(activity, /HEALTH_URL/);
  assert.match(activity, /setReadTimeout\(120000\)/);
  assert.match(activity, /document\.querySelector\('\.app'\)/);
  assert.match(activity, /showRadio\(\)/);
});

test('Android launch theme switches to the no-action-bar theme', () => {
  const styles = fs.readFileSync('android/app/src/main/res/values/styles.xml', 'utf8');
  assert.match(styles, /postSplashScreenTheme.*AppTheme\.NoActionBar/);
  assert.match(styles, /Theme\.AppCompat\.DayNight\.NoActionBar/);
});
