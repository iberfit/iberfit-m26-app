package cl.iberfit.m26.wear

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.util.Log
import cl.iberfit.nativebridge.heartrate.IBERFITHeartRateProviderChange
import cl.iberfit.nativebridge.heartrate.IBERFITHeartRateProviderError
import cl.iberfit.nativebridge.heartrate.IBERFITHeartRateProviderSnapshot
import cl.iberfit.nativebridge.heartrate.IBERFITHeartRateSample
import cl.iberfit.nativebridge.heartrate.IBERFITHeartRateSessionContext
import cl.iberfit.nativebridge.heartrate.IBERFITHeartRateSessionListener
import cl.iberfit.nativebridge.heartrate.IBERFITHeartRateSessionManager
import cl.iberfit.nativebridge.runtime.IBERFITWearDataLayerRuntime
import cl.iberfit.nativebridge.wear.IBERFITWearHealthServicesBridge
import java.time.Instant
import org.json.JSONArray
import org.json.JSONObject

class IBERFITWearWorkoutService : Service() {
    private lateinit var healthProvider:
        IBERFITWearHealthServicesBridge

    private lateinit var sessionManager:
        IBERFITHeartRateSessionManager

    private lateinit var dataLayer:
        IBERFITWearDataLayerRuntime

    private var foregroundStarted = false

    private val commandReceiver =
        object : BroadcastReceiver() {
            override fun onReceive(
                context: Context?,
                intent: Intent?
            ) {
                if (
                    intent?.action !=
                        INTERNAL_COMMAND_BROADCAST
                ) {
                    return
                }

                handleCommand(
                    action =
                        intent.getStringExtra(
                            EXTRA_COMMAND_ACTION
                        ),
                    executionId =
                        intent.getStringExtra(
                            EXTRA_EXECUTION_ID
                        )
                )
            }
        }

    private val sessionListener =
        object : IBERFITHeartRateSessionListener {
            override fun onPrimaryProviderChanged(
                change: IBERFITHeartRateProviderChange
            ) {
                updateNotification(
                    "Fuente FC Â· " +
                        (
                            change.nextProviderId ?:
                                "sin fuente activa"
                        )
                )
            }

            override fun onProviderStateChanged(
                snapshot: IBERFITHeartRateProviderSnapshot
            ) {
                updateNotification(
                    "Frecuencia cardiaca Â· ${snapshot.state}"
                )
            }

            override fun onHeartRateSample(
                sample: IBERFITHeartRateSample
            ) {
                dataLayer.sendSample(
                    sample.toDataLayerJson()
                )

                updateNotification(
                    "FC ${sample.bpm.toInt()} bpm Â· entrenamiento activo"
                )
            }

            override fun onProviderError(
                error: IBERFITHeartRateProviderError
            ) {
                updateNotification(
                    "FC Â· ${error.code}"
                )
            }
        }

    override fun onCreate() {
        super.onCreate()

        running = true
        registerCommandReceiver()

        healthProvider =
            IBERFITWearHealthServicesBridge(this)

        sessionManager =
            IBERFITHeartRateSessionManager(
                listOf(healthProvider)
            )

        dataLayer =
            IBERFITWearDataLayerRuntime(
                context = this
            )
    }

    override fun onStartCommand(
        intent: Intent?,
        flags: Int,
        startId: Int
    ): Int {
        val action =
            intent?.getStringExtra(
                EXTRA_COMMAND_ACTION
            )

        val executionId =
            intent?.getStringExtra(
                EXTRA_EXECUTION_ID
            )

        if (action == null) {
            stopSelf(startId)
            return START_NOT_STICKY
        }

        ensureForeground(
            initialText =
                when (action) {
                    ACTION_START ->
                        "Preparando entrenamiento"

                    ACTION_PAUSE ->
                        "Pausando entrenamiento"

                    ACTION_RESUME ->
                        "Reanudando entrenamiento"

                    ACTION_STOP ->
                        "Finalizando entrenamiento"

                    else ->
                        "IBERFIT activo"
                }
        )

        handleCommand(action, executionId)
        return START_NOT_STICKY
    }

    private fun handleCommand(
        action: String?,
        executionId: String?
    ) {
        when (action) {
            ACTION_START ->
                startHeartRateSession(executionId)

            ACTION_PAUSE -> {
                sessionManager.pause()
                updateNotification(
                    "Entrenamiento en pausa"
                )
            }

            ACTION_RESUME -> {
                sessionManager.resume()
                updateNotification(
                    "Reanudando entrenamiento"
                )
            }

            ACTION_STOP ->
                stopWorkout()
        }
    }

    private fun startHeartRateSession(
        commandExecutionId: String?
    ) {
        val now = System.currentTimeMillis()

        val executionId =
            commandExecutionId
                ?.takeIf { it.isNotBlank() }
                ?: "wear-$now"

        val started =
            sessionManager.start(
                context =
                    IBERFITHeartRateSessionContext(
                        sessionId = "hr-$executionId",
                        executionId = executionId,
                        startedAtEpochMs = now
                    ),
                listener = sessionListener,
                preferredProviderId =
                    IBERFITWearHealthServicesBridge.PROVIDER_ID
            )

        if (!started) {
            updateNotification(
                "No se pudo iniciar una nueva sesiÃ³n de FC"
            )
        }
    }

    private fun stopWorkout() {
        sessionManager.stop()

        if (foregroundStarted) {
            stopForeground(STOP_FOREGROUND_REMOVE)
            foregroundStarted = false
        }

        stopSelf()
    }

    private fun registerCommandReceiver() {
        val filter =
            IntentFilter(
                INTERNAL_COMMAND_BROADCAST
            )

        if (Build.VERSION.SDK_INT >= 33) {
            registerReceiver(
                commandReceiver,
                filter,
                Context.RECEIVER_NOT_EXPORTED
            )
        } else {
            @Suppress("DEPRECATION")
            registerReceiver(
                commandReceiver,
                filter
            )
        }
    }

    private fun ensureForeground(
        initialText: String
    ) {
        createNotificationChannel()

        val notification =
            buildNotification(initialText)

        if (Build.VERSION.SDK_INT >= 34) {
            startForeground(
                NOTIFICATION_ID,
                notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_HEALTH
            )
        } else {
            startForeground(
                NOTIFICATION_ID,
                notification
            )
        }

        foregroundStarted = true
    }

    private fun updateNotification(
        text: String
    ) {
        if (!foregroundStarted) return

        val manager =
            getSystemService(
                NotificationManager::class.java
            )

        manager.notify(
            NOTIFICATION_ID,
            buildNotification(text)
        )
    }

    private fun createNotificationChannel() {
        val manager =
            getSystemService(
                NotificationManager::class.java
            )

        val channel =
            NotificationChannel(
                NOTIFICATION_CHANNEL_ID,
                "Entrenamiento IBERFIT",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description =
                    "Mantiene activo el entrenamiento y la frecuencia cardiaca."
                setShowBadge(false)
            }

        manager.createNotificationChannel(channel)
    }

    private fun buildNotification(
        text: String
    ): Notification {
        val openIntent =
            Intent(
                this,
                WearMainActivity::class.java
            ).apply {
                flags =
                    Intent.FLAG_ACTIVITY_SINGLE_TOP or
                        Intent.FLAG_ACTIVITY_CLEAR_TOP
            }

        val pendingIntent =
            PendingIntent.getActivity(
                this,
                0,
                openIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or
                    PendingIntent.FLAG_IMMUTABLE
            )

        return Notification.Builder(
            this,
            NOTIFICATION_CHANNEL_ID
        )
            .setContentTitle("IBERFIT")
            .setContentText(text)
            .setSmallIcon(
                android.R.drawable.ic_media_play
            )
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .setCategory(Notification.CATEGORY_SERVICE)
            .build()
    }

    private fun IBERFITHeartRateSample.toDataLayerJson():
        JSONObject {
        val json =
            JSONObject()
                .put("type", "sample")
                .put("provider", providerId)
                .put("heartRateBpm", bpm)
                .put(
                    "quality",
                    quality.name.lowercase()
                )
                .put(
                    "deviceType",
                    deviceType.name.lowercase()
                )
                .put(
                    "contactStatus",
                    contactStatus.name.lowercase()
                )
                .put(
                    "receivedAtEpochMs",
                    receivedAtEpochMs
                )
                .put(
                    "recordedAt",
                    Instant.ofEpochMilli(
                        recordedAtEpochMs ?:
                            receivedAtEpochMs
                    ).toString()
                )

        recordedAtEpochMs?.let {
            json.put(
                "recordedAtEpochMs",
                it
            )
        }

        latencyMs?.let {
            json.put(
                "latencyMs",
                it
            )
        }

        deviceId
            ?.takeIf { it.isNotBlank() }
            ?.let {
                json.put(
                    "deviceId",
                    it
                )
            }

        executionId
            ?.takeIf { it.isNotBlank() }
            ?.let {
                json.put(
                    "executionId",
                    it
                )
            }

        sessionId
            ?.takeIf { it.isNotBlank() }
            ?.let {
                json.put(
                    "sessionId",
                    it
                )
            }

        val rrIntervals =
            JSONArray()

        rrIntervalsMs.forEach {
            rrIntervals.put(it)
        }

        json.put(
            "rrIntervalsMs",
            rrIntervals
        )

        return json
    }

    override fun onBind(intent: Intent?): IBinder? =
        null

    override fun onDestroy() {
        running = false

        runCatching {
            unregisterReceiver(
                commandReceiver
            )
        }

        if (
            this::sessionManager.isInitialized
        ) {
            sessionManager.stop()
        }

        if (
            this::healthProvider.isInitialized
        ) {
            healthProvider.close()
        }

        super.onDestroy()
    }

    companion object {
        const val ACTION_START = "start"
        const val ACTION_PAUSE = "pause"
        const val ACTION_RESUME = "resume"
        const val ACTION_STOP = "stop"

        private const val EXTRA_COMMAND_ACTION =
            "cl.iberfit.m26.extra.WORKOUT_ACTION"

        private const val EXTRA_EXECUTION_ID =
            "cl.iberfit.m26.extra.EXECUTION_ID"

        private const val INTERNAL_COMMAND_BROADCAST =
            "cl.iberfit.m26.wear.INTERNAL_WORKOUT_COMMAND"

        private const val NOTIFICATION_CHANNEL_ID =
            "iberfit_workout"

        private const val NOTIFICATION_ID =
            57601

        @Volatile
        private var running =
            false

        fun dispatch(
            context: Context,
            action: String,
            executionId: String?
        ): Boolean {
            if (!isSupportedAction(action)) {
                return false
            }

            if (running) {
                val broadcast =
                    Intent(
                        INTERNAL_COMMAND_BROADCAST
                    ).apply {
                        setPackage(
                            context.packageName
                        )

                        putExtra(
                            EXTRA_COMMAND_ACTION,
                            action
                        )

                        if (
                            !executionId
                                .isNullOrBlank()
                        ) {
                            putExtra(
                                EXTRA_EXECUTION_ID,
                                executionId
                            )
                        }
                    }

                context.sendBroadcast(
                    broadcast
                )

                return true
            }

            if (action != ACTION_START) {
                return false
            }

            val serviceIntent =
                Intent(
                    context,
                    IBERFITWearWorkoutService::class.java
                ).apply {
                    putExtra(
                        EXTRA_COMMAND_ACTION,
                        action
                    )

                    if (
                        !executionId
                            .isNullOrBlank()
                    ) {
                        putExtra(
                            EXTRA_EXECUTION_ID,
                            executionId
                        )
                    }
                }

            return try {
                context.startForegroundService(
                    serviceIntent
                )
                true
            } catch (throwable: Throwable) {
                Log.e(
                    "IBERFITWorkout",
                    "Unable to start foreground workout service",
                    throwable
                )
                false
            }
        }

        fun isSupportedAction(
            action: String
        ): Boolean =
            action in
                setOf(
                    ACTION_START,
                    ACTION_PAUSE,
                    ACTION_RESUME,
                    ACTION_STOP
                )
    }
}