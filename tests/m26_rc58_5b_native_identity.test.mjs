import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';

const read=(path)=>fs.readFileSync(path,'utf8').replace(/\r\n/g,'\n');
const sha=(path)=>crypto.createHash('sha256').update(fs.readFileSync(path)).digest('hex');

const truth=JSON.parse(read('src/m26/design/brand-truth.json'));
const phoneManifest=read('native/android-host/phone-app/src/main/AndroidManifest.xml');
const wearManifest=read('native/android-host/wear-app/src/main/AndroidManifest.xml');
const phoneActivity=read('native/android-host/phone-app/src/main/java/cl/iberfit/m26/phone/PhoneMainActivity.kt');
const wearActivity=read('native/android-host/wear-app/src/main/java/cl/iberfit/m26/wear/WearMainActivity.kt');

const modules=[
  'native/android-host/phone-app/src/main/res',
  'native/android-host/wear-app/src/main/res',
];

function pngSize(path){
  const data=fs.readFileSync(path);
  assert.ok(data.length>=24,`${path} too small`);
  assert.deepEqual([...data.subarray(0,8)],[137,80,78,71,13,10,26,10],`${path} signature`);
  return {width:data.readUInt32BE(16),height:data.readUInt32BE(20)};
}

test('Phone y Wear empaquetan exactamente el asset oficial',()=>{
  const official=truth.officialAsset.path;
  const officialHash=truth.officialAsset.sha256;
  assert.equal(sha(official),officialHash);

  for(const res of modules){
    const nativeMark=`${res}/drawable-nodpi/iberfit_brand_mark.png`;
    assert.equal(sha(nativeMark),officialHash,nativeMark);
  }
});

test('launcher adaptativo usa canvas canónico y artwork oficial sin recolor',()=>{
  for(const res of modules){
    const adaptive=read(`${res}/mipmap-anydpi-v26/ic_launcher.xml`);
    const background=read(`${res}/drawable/iberfit_launcher_background.xml`);
    const foreground=read(`${res}/drawable/iberfit_launcher_foreground.xml`);

    assert.match(adaptive,/adaptive-icon/);
    assert.match(adaptive,/@drawable\/iberfit_launcher_background/);
    assert.match(adaptive,/@drawable\/iberfit_launcher_foreground/);
    assert.doesNotMatch(adaptive,/<monochrome\b/);
    assert.match(background,/@color\/iberfit_color_canvas/);
    assert.doesNotMatch(background,/#[0-9a-f]{6,8}/i);
    assert.match(foreground,/@drawable\/iberfit_brand_mark/);
    assert.match(foreground,/android:insetLeft="21dp"/);
    assert.doesNotMatch(foreground,/tint|colorFilter/i);
  }
});

test('fallback launcher PNGs existen en densidades Android estándar',()=>{
  const expected=[
    ['mipmap-mdpi/ic_launcher.png',48],
    ['mipmap-hdpi/ic_launcher.png',72],
    ['mipmap-xhdpi/ic_launcher.png',96],
    ['mipmap-xxhdpi/ic_launcher.png',144],
    ['mipmap-xxxhdpi/ic_launcher.png',192],
  ];

  for(const res of modules){
    for(const [suffix,size] of expected){
      assert.deepEqual(pngSize(`${res}/${suffix}`),{width:size,height:size});
    }
  }
});

test('manifests usan launcher y theme IBERFIT sin tocar servicios',()=>{
  for(const manifest of [phoneManifest,wearManifest]){
    assert.match(manifest,/android:icon="@mipmap\/ic_launcher"/);
    assert.match(manifest,/android:roundIcon="@mipmap\/ic_launcher"/);
    assert.match(manifest,/android:theme="@style\/IBERFITNativeTheme"/);
  }

  assert.match(phoneManifest,/IBERFITBluetoothHeartRateForegroundService/);
  assert.match(wearManifest,/IBERFITWearWorkoutService/);
  assert.match(wearManifest,/IBERFITWearCommandListenerService/);
});

test('theme nativo consume tokens generados y no copia hex',()=>{
  for(const res of modules){
    const theme=read(`${res}/values/iberfit_native_identity.xml`);
    assert.match(theme,/@color\/iberfit_color_canvas/);
    assert.match(theme,/@color\/iberfit_color_accent/);
    assert.match(theme,/@color\/iberfit_color_text_primary/);
    assert.match(theme,/@color\/iberfit_color_text_secondary/);
    assert.doesNotMatch(theme,/#[0-9a-f]{6,8}/i);
  }
});

test('shells técnicos muestran la marca pero conservan lógica',()=>{
  assert.match(phoneActivity,/import android\.widget\.ImageView/);
  assert.match(phoneActivity,/R\.drawable\.iberfit_brand_mark/);
  assert.match(phoneActivity,/addView\(brandMark\)/);
  assert.match(phoneActivity,/sendCommand\(\s*"start"/);
  assert.match(phoneActivity,/sendCommand\(\s*"pause"/);
  assert.match(phoneActivity,/sendCommand\(\s*"resume"/);
  assert.match(phoneActivity,/sendCommand\(\s*"stop"/);

  assert.match(wearActivity,/import android\.widget\.ImageView/);
  assert.match(wearActivity,/R\.drawable\.iberfit_brand_mark/);
  assert.match(wearActivity,/addView\(brandMark\)/);
  assert.match(wearActivity,/ensureHealthPermissions\(\)/);
});

test('Brand Truth registra alineación nativa sin inventar monochrome',()=>{
  assert.equal(truth.version,'58.5.1');
  assert.equal(truth.propagation.appIcons,'native-derived-from-official-asset');
  assert.equal(truth.propagation.nativeIdentity.phone,'aligned');
  assert.equal(truth.propagation.nativeIdentity.wear,'aligned');
  assert.equal(truth.propagation.nativeIdentity.launcherForeground,'official-asset-as-is');
  assert.equal(truth.propagation.nativeIdentity.monochrome,'deferred-until-approved-vector-master');
  assert.equal(truth.officialAsset.vectorMasterProven,false);
});