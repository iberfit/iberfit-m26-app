package cl.iberfit.m26.phone

import android.app.Activity
import android.os.Bundle
import cl.iberfit.nativebridge.runtime.IBERFITAndroidTelemetryDiagnostics
import cl.iberfit.nativebridge.runtime.IBERFITBluetoothBackgroundBridge

/**
 * Debug-build-only ADB control surface for RC57.6I physical E2E.
 *
 * It is never part of the main/release manifest. It does not create or fake a
 * preferred sensor; RC57.6E must have already tested and saved a real HRS
 * device before BLE physical E2E can pass.
 */
class IBERFITBluetoothPhysicalE2EActivity :
    Activity() {
    private lateinit var diagnostics:
        IBERFITAndroidTelemetryDiagnostics

    override fun onCreate(
        savedInstanceState: Bundle?
    ) {
        super.onCreate(
            savedInstanceState
        )

        diagnostics =
            IBERFITAndroidTelemetryDiagnostics(
                this
            )

        val action =
            intent.getStringExtra(
                EXTRA_QA_ACTION
            )
                ?.trim()
                ?.lowercase()
                .orEmpty()

        val executionId =
            intent.getStringExtra(
                EXTRA_EXECUTION_ID
            )
                ?.trim()
                .orEmpty()

        when (action) {
            "start" ->
                startPhysicalSession(
                    executionId
                )

            "pause" ->
                if (
                    executionId.isNotBlank()
                ) {
                    diagnostics.record(
                        "QA_PAUSE"
                    )

                    IBERFITBluetoothBackgroundBridge
                        .pauseBle(
                            executionId
                        )
                }

            "resume" ->
                if (
                    executionId.isNotBlank()
                ) {
                    diagnostics.record(
                        "QA_RESUME"
                    )

                    IBERFITBluetoothBackgroundBridge
                        .resumeBle(
                            executionId
                        )
                }

            "stop" ->
                if (
                    executionId.isNotBlank()
                ) {
                    diagnostics.record(
                        "QA_STOP"
                    )

                    IBERFITBluetoothBackgroundBridge
                        .stopBle(
                            executionId
                        )

                    IBERFITBluetoothBackgroundBridge
                        .stopSession(
                            context =
                                applicationContext,
                            executionId =
                                executionId
                        )
                }

            else ->
                diagnostics.record(
                    "QA_INVALID_ACTION"
                )
        }

        finish()
    }

    private fun startPhysicalSession(
        executionId: String
    ) {
        diagnostics.clear()
        diagnostics.record(
            "QA_START"
        )

        if (executionId.isBlank()) {
            diagnostics.record(
                "QA_INVALID_EXECUTION"
            )
            return
        }

        val prepared =
            IBERFITBluetoothBackgroundBridge
                .prepare(
                    context =
                        applicationContext,
                    executionId =
                        executionId
                )

        diagnostics.record(
            if (prepared) {
                "QA_PREPARE_OK"
            } else {
                "QA_PREPARE_FAILED"
            }
        )

        if (!prepared) {
            return
        }

        val startAccepted =
            IBERFITBluetoothBackgroundBridge
                .startBle(
                    executionId
                )

        diagnostics.record(
            if (startAccepted) {
                "QA_BLE_START_ACCEPTED"
            } else {
                "QA_BLE_START_REJECTED"
            }
        )
    }

    companion object {
        private const val EXTRA_QA_ACTION =
            "qaAction"

        private const val EXTRA_EXECUTION_ID =
            "executionId"
    }
}
