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



test('Android opens the bundled Radio ID interface immediately', () => {
  const activity = fs.readFileSync('android/app/src/main/java/com/radioid/app/MainActivity.java', 'utf8');
  assert.match(activity, /extends BridgeActivity/);
  assert.doesNotMatch(activity, /HEALTH_URL|ProgressBar|waitForServer/);
  const page = fs.readFileSync('index.html', 'utf8');
  assert.match(page, /NATIVE_BACKEND=location\.hostname==='localhost'/);
  assert.match(page, /connectTimeout:20000/);
});

test('Android launch theme switches to the no-action-bar theme', () => {
  const styles = fs.readFileSync('android/app/src/main/res/values/styles.xml', 'utf8');
  assert.match(styles, /postSplashScreenTheme.*AppTheme\.NoActionBar/);
  assert.match(styles, /Theme\.AppCompat\.DayNight\.NoActionBar/);
});


test('Capacitor native HTTP is enabled for Android API calls', () => {
  const config = fs.readFileSync('capacitor.config.json', 'utf8');
  assert.match(config, /\"CapacitorHttp\"\s*:\s*\{\s*\"enabled\"\s*:\s*true/);
  const page = fs.readFileSync('index.html', 'utf8');
  const nativeFunction = page.slice(page.indexOf('async function nativeBackendFetch'), page.indexOf('window.fetch='));
  assert.ok(nativeFunction.indexOf('const plugin=nativeHttp()') < nativeFunction.indexOf('browserFetch(url,options)'));
});

test('Android recognition uses short start and status requests with visible diagnostics', () => {
  const page = fs.readFileSync('index.html', 'utf8');
  assert.match(page, /\/api\/recognize\/start/);
  assert.match(page, /\/api\/recognize\/status/);
  assert.match(page, /recognitionProgress/);
  assert.match(page, /connectTimeout:20000/);
  assert.match(page, /setInterval\(\(\)=>recognitionProgress/);
  assert.match(page, /STATUS timeout po 90 s/);
  assert.doesNotMatch(page, /createElement\('iframe'\)/);
});

test('changing station cancels stale recognition and unlocks the button', () => {
  const page = fs.readFileSync('index.html', 'utf8');
  assert.match(page, /function cancelRecognition\(\)/);
  assert.match(page, /cancelRecognition\(\);current=s/);
  assert.match(page, /const run=\+\+recognitionRun/);
  assert.match(page, /run===recognitionRun/);
});

test('station catalogue separates language and country and inline script parses', () => {
  const vm = require('node:vm');
  const page = fs.readFileSync('index.html', 'utf8');
  const script = page.match(/<script>([\s\S]*?)<\/script>/);
  assert.ok(script, 'inline application script exists');
  assert.doesNotThrow(() => new vm.Script(script[1]));
  assert.match(page, /id="languageFilter"/);
  assert.match(page, /id="countryFilter"/);
  assert.match(page, /function stationMatches\(s\)/);
  assert.match(page, /\/stations\/search\?/);
});


test('language and country filters do not mix Polish and English stations', () => {
  const vm = require('node:vm');
  const page = fs.readFileSync('index.html', 'utf8');
  const source = page.match(/function stationMatches\(s\)\{[^\n]+\}/);
  assert.ok(source);
  const scope = {selectedLanguage: 'polish', selectedCountry: ''};
  const matches = vm.runInNewContext(source[0] + '; stationMatches', scope);
  const polishUK = {language: 'polish', countrycode: 'GB'};
  const englishUK = {language: 'english', countrycode: 'GB'};
  const polishPL = {language: 'polish', countrycode: 'PL'};
  assert.equal(matches(polishUK), true);
  assert.equal(matches(englishUK), false);
  scope.selectedCountry = 'PL';
  assert.equal(matches(polishUK), false);
  assert.equal(matches(polishPL), true);
  scope.selectedLanguage = 'english';
  scope.selectedCountry = 'GB';
  assert.equal(matches(englishUK), true);
  assert.equal(matches(polishUK), false);
});


test('country flags, catalogue languages and eight interface translations stay selectable', () => {
  const vm = require('node:vm');
  const page = fs.readFileSync('index.html', 'utf8');
  const script = page.match(/<script>([\s\S]*?)<\/script>/);
  assert.ok(script);
  assert.doesNotThrow(() => new vm.Script(script[1]));
  const country = page.indexOf('id="countryFilter"');
  const language = page.indexOf('id="languageFilter"');
  assert.ok(country >= 0 && language > country, 'country is before station language');
  assert.match(page, /\/languages\?hidebroken=true/);
  assert.match(page, /\/countrycodes\?hidebroken=true/);
  assert.match(page, /function flag\(code\)/);
  assert.match(page, /data-i18n="appLanguage"/);
  const keys = JSON.parse(script[1].match(/const UI_KEYS=(\[[^\n]+\]);/)[1]);
  const translations = JSON.parse(script[1].match(/const UI_TEXT=(\{[^\n]+\});/)[1]);
  assert.deepEqual(Object.keys(translations).sort(), ['de','en','es','fr','it','pl','ro','uk']);
  for (const values of Object.values(translations)) {
    assert.equal(values.length, keys.length);
    assert.ok(values.every(value => typeof value === 'string' && value.length > 0));
  }
  const flag = vm.runInNewContext(script[1].match(/function flag\(code\)\{[^\n]+\}/)[0] + ';flag');
  assert.equal(flag('PL'), '🇵🇱');
  assert.equal(flag('GB'), '🇬🇧');
});
