package cl.iberfit.m26.phone

import android.os.Bundle
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import androidx.activity.ComponentActivity
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.PermissionController
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.RestingHeartRateRecord
import androidx.health.connect.client.records.SleepSessionRecord
import androidx.health.connect.client.records.StepsRecord
import cl.iberfit.healthconnect.IberfitHealthConnectReader
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch

/**
 * Local-only validation of the official Health Connect permission ceremony.
 * No health data is sent, no client identity is assumed and no IBERFIT account
 * is marked connected. Remote authentication, consent epochs, RLS and E2E
 * are separate release gates.
 */
class Connected360HealthPermissionsActivity : ComponentActivity() {
    private val localScope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private val requested = linkedMapOf(
        "steps" to HealthPermission.getReadPermission(StepsRecord::class),
        "sleepMinutes" to HealthPermission.getReadPermission(SleepSessionRecord::class),
        "restingHeartRate" to HealthPermission.getReadPermission(RestingHeartRateRecord::class),
    )
    private lateinit var message: TextView
    private lateinit var summary: TextView
    private lateinit var linkButton: Button
    private var permissionRequestPending = false

    private val permissionLauncher = registerForActivityResult(
        PermissionController.createRequestPermissionResultContract()
    ) { granted ->
        permissionRequestPending = false
        if (granted.isEmpty()) {
            message.text = "No se han concedido permisos. Puedes volver cuando quieras."
            linkButton.isEnabled = true
        } else {
            readLocalSummary()
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val column = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(40, 52, 40, 48)
        }
        val heading = TextView(this).apply {
            text = "IBERFIT · Tu actividad"
            textSize = 24f
        }
        val explainer = TextView(this).apply {
            text = "Autoriza en Android únicamente los datos que quieras compartir. " +
                "Esta vista de pruebas muestra los datos en el teléfono; todavía NO los " +
                "sincroniza con tu cuenta IBERFIT."
            textSize = 16f
        }
        linkButton = Button(this).apply {
            text = "Autorizar Health Connect"
            setOnClickListener { authorizeFromUserAction() }
        }
        message = TextView(this).apply {
            text = "Sin permisos comprobados. No hay dispositivo vinculado a IBERFIT."
            textSize = 16f
        }
        summary = TextView(this).apply {
            text = "Todavía no hay datos consultados."
            textSize = 16f
        }
        column.addView(heading)
        column.addView(explainer)
        column.addView(linkButton)
        column.addView(message)
        column.addView(summary)
        setContentView(ScrollView(this).apply { addView(column) })
    }

    private fun authorizeFromUserAction() {
        if (permissionRequestPending) return
        if (HealthConnectClient.getSdkStatus(this) != HealthConnectClient.SDK_AVAILABLE) {
            message.text = "Health Connect no está disponible. Revisa Android o actualiza Health Connect."
            return
        }
        linkButton.isEnabled = false
        localScope.launch {
            try {
                val current = HealthConnectClient.getOrCreate(this@Connected360HealthPermissionsActivity)
                    .permissionController.getGrantedPermissions()
                val missing = requested.values.toSet() - current
                if (missing.isEmpty()) {
                    readLocalSummary()
                } else {
                    permissionRequestPending = true
                    permissionLauncher.launch(missing)
                }
            } catch (_: Exception) {
                permissionRequestPending = false
                message.text = "No se pudo comprobar el permiso. Puedes reintentar."
                linkButton.isEnabled = true
            }
        }
    }

    private fun readLocalSummary() {
        linkButton.isEnabled = false
        message.text = "Comprobando permisos y leyendo el resumen local…"
        localScope.launch {
            try {
                val healthConnect = HealthConnectClient.getOrCreate(this@Connected360HealthPermissionsActivity)
                val granted = healthConnect.permissionController.getGrantedPermissions()
                val metrics = requested.filterValues { it in granted }.keys
                if (metrics.isEmpty()) {
                    message.text = "No se ha autorizado ninguna categoría."
                    summary.text = "Sin datos. IBERFIT no ha vinculado este dispositivo."
                    return@launch
                }
                val records = IberfitHealthConnectReader(healthConnect)
                    .readDaily(metrics.toSet(), days = 7)
                val last = records.lastOrNull()
                val totalSteps = records.mapNotNull { it.steps }.sum()
                val stepsDays = records.count { it.steps != null }
                val sleep = last?.sleepMinutes?.let { "${it / 60} h ${it % 60} min" } ?: "Sin dato"
                val pulse = last?.restingHeartRate?.let { "$it lpm" } ?: "Sin dato"
                message.text = "Permisos concedidos: ${metrics.joinToString()}. " +
                    "Lectura completada solo en el teléfono."
                summary.text = if (last == null) {
                    "Sin registros en los últimos 7 días. No hay conexión remota."
                } else {
                    "Último día con datos: ${last.date}\n" +
                        "Pasos de los últimos 7 días: $totalSteps ($stepsDays días con datos)\n" +
                        "Sueño último día: $sleep\n" +
                        "FC reposo último día: $pulse\n" +
                        "No se han enviado datos a IBERFIT."
                }
            } catch (_: Exception) {
                message.text = "La lectura no se ha completado. Revisa permisos y vuelve a intentar."
                summary.text = "No hay conexión remota."
            } finally {
                linkButton.isEnabled = true
            }
        }
    }

    override fun onDestroy() {
        localScope.cancel()
        super.onDestroy()
    }
}
