import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");

const parserSource = () =>
  read("native/android/ble/IBERFITBleHeartRateParser.kt");

const providerSource = () =>
  read("native/android/ble/IBERFITBleHeartRateProvider.kt");

const transportSource = () =>
  read("native/android/ble/IBERFITAndroidBleHeartRateTransport.kt");

function parseHrsReference(bytes) {
  if (bytes.length === 0) return null;

  const flags = bytes[0];
  const uint16 = (flags & 0x01) !== 0;
  const contactSupported = (flags & 0x04) !== 0;
  const contactDetected =
    contactSupported ? (flags & 0x02) !== 0 : null;
  const energyPresent = (flags & 0x08) !== 0;
  const rrPresent = (flags & 0x10) !== 0;

  let offset = 1;

  const readU16 = () => {
    if (bytes.length < offset + 2) return null;
    const value = bytes[offset] | (bytes[offset + 1] << 8);
    offset += 2;
    return value;
  };

  let bpm;
  if (uint16) {
    bpm = readU16();
    if (bpm === null) return null;
  } else {
    if (bytes.length < offset + 1) return null;
    bpm = bytes[offset++];
  }

  let energyExpended = null;
  if (energyPresent) {
    energyExpended = readU16();
    if (energyExpended === null) return null;
  }

  const rrIntervalsMs = [];
  if (rrPresent) {
    if ((bytes.length - offset) % 2 !== 0) return null;

    while (bytes.length >= offset + 2) {
      const raw = readU16();
      if (raw === null) return null;
      rrIntervalsMs.push(raw * 1000 / 1024);
    }
  }

  return {
    bpm,
    contactDetected,
    energyExpended,
    rrIntervalsMs
  };
}

test("RC57.6D decodifica HRS uint8 sin inventar metadatos", () => {
  assert.deepEqual(
    parseHrsReference([0x00, 78]),
    {
      bpm: 78,
      contactDetected: null,
      energyExpended: null,
      rrIntervalsMs: []
    }
  );
});

test("RC57.6D preserva HRS uint16 incluso fuera del rango fisiologico", () => {
  const sample =
    parseHrsReference([0x01, 0x2c, 0x01]);

  assert.equal(sample.bpm, 300);

  const source = parserSource();
  assert.equal(
    source.includes("if (bpm !in 25..240) return null"),
    false
  );
});

test("RC57.6D interpreta correctamente sensor contact", () => {
  assert.equal(
    parseHrsReference([0x06, 80]).contactDetected,
    true
  );

  assert.equal(
    parseHrsReference([0x04, 80]).contactDetected,
    false
  );

  assert.equal(
    parseHrsReference([0x00, 80]).contactDetected,
    null
  );
});

test("RC57.6D conserva energy expended y todos los RR intervals", () => {
  const sample =
    parseHrsReference([
      0x18,
      80,
      0x34, 0x12,
      0x00, 0x04,
      0x00, 0x02,
      0x00, 0x00
    ]);

  assert.equal(sample.energyExpended, 0x1234);
  assert.deepEqual(
    sample.rrIntervalsMs,
    [1000, 500, 0]
  );

  const source = parserSource();
  assert.doesNotMatch(source, /250\.0\.\.2500\.0/);
  assert.doesNotMatch(source, /rr\.size\s*</);
});

test("RC57.6D rechaza payload RR truncado, no lo maquilla", () => {
  assert.equal(
    parseHrsReference([
      0x10,
      75,
      0x00
    ]),
    null
  );
});

test("RC57.6D mantiene contrato temporal del runtime Android existente", () => {
  const source = parserSource();

  assert.equal(
    source.includes("val provider: String"),
    true
  );

  assert.equal(
    source.includes('get() = "bluetooth_hrs"'),
    true
  );

  assert.equal(
    source.includes("val quality: String"),
    true
  );
});

test("RC57.6D provider normaliza calidad sin alterar bpm", () => {
  const source = providerSource();

  assert.match(
    source,
    /val bpm\s*=\s*parsed\.heartRateBpm\.toDouble\(\)/s
  );

  assert.match(
    source,
    /IBERFITHeartRateQuality\.OUT_OF_RANGE/
  );

  assert.match(
    source,
    /bpm = bpm/
  );

  assert.doesNotMatch(
    source,
    /coerceIn|coerceAtMost|coerceAtLeast/
  );
});

test("RC57.6D provider conserva contact status y RR en muestra canonica", () => {
  const source = providerSource();

  assert.match(
    source,
    /IBERFITHeartRateContactStatus\.DETECTED/
  );
  assert.match(
    source,
    /IBERFITHeartRateContactStatus\.NOT_DETECTED/
  );
  assert.match(
    source,
    /IBERFITHeartRateContactStatus\.UNSUPPORTED/
  );
  assert.match(
    source,
    /rrIntervalsMs = parsed\.rrIntervalsMs/
  );
});

test("RC57.6D pause resume es gate local y no desconecta GATT", () => {
  const source = providerSource();

  const pauseBody =
    source.match(
      /override fun pause\(\)\s*\{([\s\S]*?)\n    \}\n\n    override fun resume/
    )?.[1] ?? "";

  const resumeBody =
    source.match(
      /override fun resume\(\)\s*\{([\s\S]*?)\n    \}\n\n    override fun stop/
    )?.[1] ?? "";

  assert.match(pauseBody, /emissionPaused = true/);
  assert.match(resumeBody, /emissionPaused = false/);
  assert.doesNotMatch(pauseBody, /transport\.disconnect/);
  assert.doesNotMatch(resumeBody, /transport\.connect/);
});

test("RC57.6D Android GATT habilita notify y CCCD", () => {
  const source = transportSource();

  assert.match(source, /discoverServices\(\)/);
  assert.match(
    source,
    /setCharacteristicNotification/
  );
  assert.match(
    source,
    /CLIENT_CHARACTERISTIC_CONFIGURATION_UUID/
  );
  assert.match(
    source,
    /ENABLE_NOTIFICATION_VALUE/
  );
  assert.match(
    source,
    /onDescriptorWrite/
  );
  assert.match(
    source,
    /IBERFITBleHeartRateTransportState\.READY/
  );
});

test("RC57.6D Android GATT soporta callbacks modernos y legacy", () => {
  const source = transportSource();

  assert.match(
    source,
    /override fun onCharacteristicChanged\(\s*gatt: BluetoothGatt,\s*characteristic: BluetoothGattCharacteristic,\s*value: ByteArray/s
  );

  assert.match(
    source,
    /@Suppress\("DEPRECATION"\)\s*override fun onCharacteristicChanged/s
  );

  assert.match(
    source,
    /Build\.VERSION\.SDK_INT >= 33/
  );

  assert.match(
    source,
    /writeDescriptorLegacy/
  );
});