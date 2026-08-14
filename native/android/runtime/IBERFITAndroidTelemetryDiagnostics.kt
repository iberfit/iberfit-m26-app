package cl.iberfit.nativebridge.runtime

import android.content.Context
import android.content.pm.ApplicationInfo
import java.io.File

/**
 * Debug-only, health-value-free observability for RC57 physical E2E.
 *
 * Release builds do not write this file. Events intentionally contain only
 * lifecycle/state names: no BPM, RR, device address, client id or execution id.
 */
class IBERFITAndroidTelemetryDiagnostics(
    context: Context
) {
    private val appContext =
        context.applicationContext

    private val enabled =
        (
            appContext.applicationInfo.flags and
                ApplicationInfo.FLAG_DEBUGGABLE
            ) != 0

    fun clear() {
        if (!enabled) return

        synchronized(FILE_LOCK) {
            file()
                .writeText(
                    "",
                    Charsets.UTF_8
                )
        }
    }

    fun record(
        event: String
    ) {
        if (!enabled) return

        val normalized =
            event
                .trim()
                .uppercase()

        if (
            !EVENT_PATTERN.matches(
                normalized
            )
        ) {
            return
        }

        val line =
            System.currentTimeMillis()
                .toString() +
                "\t" +
                normalized +
                "\n"

        synchronized(FILE_LOCK) {
            file()
                .appendText(
                    line,
                    Charsets.UTF_8
                )
        }
    }

    private fun file(): File =
        File(
            appContext.filesDir,
            FILE_NAME
        )

    companion object {
        const val FILE_NAME =
            "rc57_6i_telemetry_diagnostics.log"

        private val FILE_LOCK =
            Any()

        private val EVENT_PATTERN =
            Regex(
                "^[A-Z0-9_]+$"
            )
    }
}
