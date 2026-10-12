package cl.iberfit.m26.phone

import android.content.pm.ApplicationInfo
import android.os.Bundle
import android.view.WindowManager
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
    private lateinit var generalHeartRateButton: Button
    private lateinit var generalHeartRateStatus: TextView
    private var permissionRequestPending = false
    private var generalHeartRateRequestPending = false

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

    private val generalHeartRatePermissionLauncher = registerForActivityResult(
        PermissionController.createRequestPermissionResultContract()
    ) { granted ->
        generalHeartRateRequestPending = false
        if (Connected360GeneralHeartRateDiagnostic.permission !in granted) {
            generalHeartRateStatus.text =
                "Sin permiso de lectura de FC general. No se han enviado datos a IBERFIT."
            generalHeartRateButton.isEnabled = true
        } else {
            readGeneralHeartRateCount()
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // This local-only permission proof also displays health measurements.
        // Keep them out of screenshots and Android's recent-app thumbnails.
        window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
        // QA permission diagnostics are NOT a production health integration.
        // Fail closed even if a future release accidentally exposes this Activity.
        if ((applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE) == 0) {
            finish()
            return
        }
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
        generalHeartRateButton = Button(this).apply {
            text = "Comprobar FC general · diagnóstico opcional"
            setOnClickListener { authorizeGeneralHeartRateFromUserAction() }
        }
        generalHeartRateStatus = TextView(this).apply {
            text = "FC general y FC en reposo son datos distintos. " +
                "Esta comprobación solicita un permiso independiente y no guarda mediciones."
            textSize = 16f
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
        column.addView(generalHeartRateButton)
        column.addView(generalHeartRateStatus)
        setContentView(ScrollView(this).apply { addView(column) })
    }

    private fun authorizeFromUserAction() {
        if (permissionRequestPending || generalHeartRateRequestPending) return
        if (HealthConnectClient.getSdkStatus(this) != HealthConnectClient.SDK_AVAILABLE) {
            message.text = "Health Connect no está disponible. Revisa Android o actualiza Health Connect."
            return
        }
        linkButton.isEnabled = false
        localScope.launch {
            try {
                val current = Connected360ReadBudget.run {
                    HealthConnectClient.getOrCreate(this@Connected360HealthPermissionsActivity)
                        .permissionController.getGrantedPermissions()
                }
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
                val (metrics, possibleRecords) = Connected360ReadBudget.run {
                    val healthConnect = HealthConnectClient.getOrCreate(
                        this@Connected360HealthPermissionsActivity
                    )
                    val granted = healthConnect.permissionController.getGrantedPermissions()
                    val allowed = requested.filterValues { it in granted }.keys
                    val records = if (allowed.isEmpty()) null else {
                        IberfitHealthConnectReader(healthConnect)
                            .readDaily(allowed.toSet(), days = 7)
                    }
                    allowed to records
                }
                if (metrics.isEmpty()) {
                    message.text = "No se ha autorizado ninguna categoría."
                    summary.text = "Sin datos. IBERFIT no ha vinculado este dispositivo."
                    return@launch
                }
                val records = requireNotNull(possibleRecords)
                message.text = "Permisos de lectura comprobados: ${metrics.joinToString()}. " +
                    "Consulta local completada. Tener permiso no garantiza que existan registros."
                summary.text = Connected360LocalSummaryFormatter.render(records, metrics)
            } catch (_: Exception) {
                message.text = "La lectura no se ha completado. Revisa permisos y vuelve a intentar."
                summary.text = "No hay conexión remota."
            } finally {
                linkButton.isEnabled = true
            }
        }
    }

    private fun authorizeGeneralHeartRateFromUserAction() {
        if (permissionRequestPending || generalHeartRateRequestPending) return
        if (HealthConnectClient.getSdkStatus(this) != HealthConnectClient.SDK_AVAILABLE) {
            generalHeartRateStatus.text = "Health Connect no está disponible."
            return
        }
        generalHeartRateButton.isEnabled = false
        generalHeartRateStatus.text = "Comprobando permiso para FC general…"
        localScope.launch {
            try {
                val granted = Connected360ReadBudget.run {
                    HealthConnectClient.getOrCreate(this@Connected360HealthPermissionsActivity)
                        .permissionController.getGrantedPermissions()
                }
                val permission = Connected360GeneralHeartRateDiagnostic.permission
                if (permission in granted) {
                    readGeneralHeartRateCount()
                } else {
                    generalHeartRateRequestPending = true
                    generalHeartRatePermissionLauncher.launch(setOf(permission))
                }
            } catch (_: Exception) {
                generalHeartRateRequestPending = false
                generalHeartRateStatus.text =
                    "No se pudo comprobar el permiso de FC general. Puedes reintentar."
                generalHeartRateButton.isEnabled = true
            }
        }
    }

    private fun readGeneralHeartRateCount() {
        generalHeartRateStatus.text = "Consultando FC general localmente; no es FC en reposo…"
        localScope.launch {
            try {
                val count = Connected360ReadBudget.run {
                    val client = HealthConnectClient.getOrCreate(
                        this@Connected360HealthPermissionsActivity
                    )
                    Connected360GeneralHeartRateDiagnostic(client).countMeasurements()
                }
                generalHeartRateStatus.text =
                    Connected360GeneralHeartRateDiagnostic.resultText(count)
            } catch (_: Exception) {
                generalHeartRateStatus.text =
                    "No fue posible leer FC general. Comprueba el permiso en Salud conectada. " +
                    "No se han enviado datos a IBERFIT."
            } finally {
                generalHeartRateButton.isEnabled = true
            }
        }
    }

    override fun onDestroy() {
        localScope.cancel()
        super.onDestroy()
    }
}
