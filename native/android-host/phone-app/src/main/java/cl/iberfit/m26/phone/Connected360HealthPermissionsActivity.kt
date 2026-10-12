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
    private var workoutRequestPending = false
    private lateinit var workoutButton: Button
    private lateinit var workoutStatus: TextView

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
            readGeneralHeartRateProfile()
        }
    }

    private val workoutPermissionLauncher = registerForActivityResult(
        PermissionController.createRequestPermissionResultContract()
    ) { granted ->
        workoutRequestPending = false
        if (Connected360WorkoutReadOnlyQa.requiredPermission !in granted) {
            workoutStatus.text = "Sin permiso para leer sesiones deportivas. No se envían datos."
            workoutButton.isEnabled = true
        } else {
            readLocalWorkouts()
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
        workoutButton = Button(this).apply {
            text = "Comprobar carrera y HIIT · sesiones deportivas"
            setOnClickListener { authorizeWorkoutFromUserAction() }
        }
        workoutStatus = TextView(this).apply {
            text = "Consulta opcional de sesiones deportivas reales de Salud conectada. " +
                "Solo se leen resúmenes de los últimos 7 días en el teléfono."
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
        column.addView(workoutButton)
        column.addView(workoutStatus)
        setContentView(ScrollView(this).apply { addView(column) })
    }

    private fun authorizeFromUserAction() {
        if (permissionRequestPending || generalHeartRateRequestPending || workoutRequestPending) return
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
        if (permissionRequestPending || generalHeartRateRequestPending || workoutRequestPending) return
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
                    readGeneralHeartRateProfile()
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

    private fun readGeneralHeartRateProfile() {
        generalHeartRateStatus.text = "Consultando FC general localmente; no es FC en reposo…"
        localScope.launch {
            try {
                val daily = Connected360ReadBudget.run {
                    val client = HealthConnectClient.getOrCreate(
                        this@Connected360HealthPermissionsActivity
                    )
                    Connected360GeneralHeartRateDiagnostic(client).readDailyRanges()
                }
                val envelope = Connected360V46QaEnvelope.build(
                    daily, emptyList(), java.time.ZoneId.systemDefault(), java.time.Instant.now()
                )
                val ready = (envelope["heartRateDaily"] as List<*>).size
                generalHeartRateStatus.text =
                    Connected360GeneralHeartRateDiagnostic.dailyText(daily) +
                    "\\n\\nContrato local V46 QA: $ready días preparados. Sin envío a IBERFIT."
            } catch (_: Exception) {
                generalHeartRateStatus.text =
                    "No fue posible leer FC general. Comprueba el permiso en Salud conectada. " +
                    "No se han enviado datos a IBERFIT."
            } finally {
                generalHeartRateButton.isEnabled = true
            }
        }
    }

    private fun authorizeWorkoutFromUserAction() {
        if (permissionRequestPending || generalHeartRateRequestPending || workoutRequestPending) return
        if (HealthConnectClient.getSdkStatus(this) != HealthConnectClient.SDK_AVAILABLE) {
            workoutStatus.text = "Salud conectada no está disponible."
            return
        }
        workoutButton.isEnabled = false
        workoutStatus.text = "Comprobando los permisos para actividad y FC…"
        localScope.launch {
            try {
                val granted = Connected360ReadBudget.run {
                    HealthConnectClient.getOrCreate(this@Connected360HealthPermissionsActivity)
                        .permissionController.getGrantedPermissions()
                }
                val missing = Connected360WorkoutReadOnlyQa.permissions.values.toSet() - granted
                if (missing.isEmpty()) {
                    readLocalWorkouts()
                } else {
                    workoutRequestPending = true
                    workoutPermissionLauncher.launch(missing)
                }
            } catch (_: Exception) {
                workoutRequestPending = false
                workoutStatus.text = "No se pudieron comprobar los permisos. Puedes reintentar."
                workoutButton.isEnabled = true
            }
        }
    }

    private fun readLocalWorkouts() {
        workoutStatus.text = "Leyendo solo los resúmenes deportivos locales…"
        localScope.launch {
            try {
                val data = Connected360ReadBudget.run {
                    val client = HealthConnectClient.getOrCreate(this@Connected360HealthPermissionsActivity)
                    Connected360WorkoutReadOnlyQa(client).read()
                }
                val envelope = Connected360V46QaEnvelope.build(
                    emptyList(), data.workouts, java.time.ZoneId.systemDefault(), java.time.Instant.now()
                )
                val ready = (envelope["exerciseEvidence"] as List<*>).size
                workoutStatus.text = Connected360WorkoutReadOnlyQa.render(data) +
                    "\\n\\nContrato local V46 QA: $ready sesiones con identificador seguro preparadas. " +
                    "Sin envío a IBERFIT."
            } catch (_: Exception) {
                workoutStatus.text = "No se pudo leer la actividad deportiva. " +
                    "Comprueba los permisos y la sincronización en Samsung Health. " +
                    "No se enviaron datos a IBERFIT."
            } finally {
                workoutButton.isEnabled = true
            }
        }
    }

    override fun onDestroy() {
        localScope.cancel()
        super.onDestroy()
    }
}
