import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const readme = () =>
  fs.readFileSync(
    "README_RC57.md",
    "utf8"
  );

test(
  "RC57 software queda cerrado sin falsear el E2E BLE físico",
  () => {
    const source =
      readme();

    assert.equal(
      source.includes(
        "RC57_SOFTWARE_STATUS=PASS"
      ),
      true
    );

    assert.equal(
      source.includes(
        "RC57_SOFTWARE_CLOSED=TRUE"
      ),
      true
    );

    assert.equal(
      source.includes(
        "RC57_BLE_PHYSICAL_E2E=BLOCKED_NO_HRS_HARDWARE"
      ),
      true
    );

    assert.equal(
      source.includes(
        "RC57_BLE_CODE_FAILURE=FALSE"
      ),
      true
    );

    assert.equal(
      source.includes(
        "RC57_FULL_PHYSICAL_BLE_CLOSED=FALSE"
      ),
      true
    );
  }
);

test(
  "RC57 conserva evidencia Wear OS física como PASS",
  () => {
    const source =
      readme();

    for(
      const marker of [
        "WEAR_OS_REAL_SENSOR_E2E=PASS",
        "WEAR_OS_BACKGROUND_E2E=PASS",
        "WEAR_OS_PAUSE_RESUME=PASS",
        "WEAR_OS_STOP_RESTART=PASS",
        "WEAR_OS_EXECUTION_ID_CORRELATION=PASS"
      ]
    ) {
      assert.equal(
        source.includes(marker),
        true
      );
    }
  }
);

test(
  "RC57 documenta toda la cadena BLE ya cerrada por software",
  () => {
    const source =
      readme();

    for(
      const marker of [
        "BLUETOOTH_HRS_PROTOCOL_TESTS=PASS",
        "BLUETOOTH_HRS_PROVIDER_TESTS=PASS",
        "BLUETOOTH_HRS_DISCOVERY_UX=PASS",
        "BLUETOOTH_HRS_PREFERRED_RUNTIME=PASS",
        "BLUETOOTH_HRS_FAILOVER_HARDENING=PASS",
        "BLUETOOTH_HRS_BACKGROUND_RELIABILITY=PASS",
        "BLUETOOTH_HRS_BACKGROUND_OBSERVABILITY=PASS"
      ]
    ) {
      assert.equal(
        source.includes(marker),
        true
      );
    }
  }
);

test(
  "RC57 mantiene production Supabase y canary fuera del cierre",
  () => {
    const source =
      readme();

    for(
      const marker of [
        "PRODUCTION_TOUCHED=FALSE",
        "SUPABASE_TOUCHED=FALSE",
        "CANARY_REMOTE_TOUCHED=FALSE"
      ]
    ) {
      assert.equal(
        source.includes(marker),
        true
      );
    }
  }
);

test(
  "RC57 no inventa alcance RC58",
  () => {
    const source =
      readme();

    assert.equal(
      source.includes(
        "NEXT_ACTION=RC58_SCOPE_DISCOVERY"
      ),
      true
    );

    assert.equal(
      source.includes(
        "no existe todavía un contrato RC58 canónico"
      ),
      true
    );
  }
);