package cl.iberfit.m26.phone

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import cl.iberfit.nativebridge.runtime.IBERFITAndroidTelemetryDiagnostics
import cl.iberfit.nativebridge.runtime.IBERFITBluetoothBackgroundBridge
import cl.iberfit.nativebridge.runtime.IBERFITPreferredBleHeartRateRuntime

/**
 * Phone foreground-service owner for continuous Bluetooth HRS work.
 *
 * The service is prepared while the session is started from visible UI. It can
 * then keep the preferred Bluetooth sensor available while the app is merely
 * backgrounded or the screen is off, without launching a new FGS at failover.
 */
class IBERFITBluetoothHeartRateForegroundService :
    Service(),
    IBERFITBluetoothBackgroundBridge.Controller {
    private lateinit var preferredBle:
        IBERFITPreferredBleHeartRateRuntime

    private lateinit var diagnostics:
        IBERFITAndroidTelemetryDiagnostics

    private var activeExecutionId:
        String? = null

    private var foregroundStarted =
        false

    private var intentionalStop =
        false

    override fun onCreate() {
        super.onCreate()

        diagnostics =
            IBERFITAndroidTelemetryDiagnostics(
                this
            )

        diagnostics.record(
            "FGS_ON_CREATE"
        )

        createNotificationChannel()

        preferredBle =
            IBERFITPreferredBleHeartRateRuntime(
                context = this,
                onSample = {
                    sample ->
                    val id =
                        activeExecutionId

                    if (
                        id != null &&
                        sample.executionId ==
                            id
                    ) {
                        diagnostics.record(
                            "FGS_BLE_SAMPLE"
                        )

                        updateNotification(
                            "PulsÃ³metro Bluetooth activo"
                        )

                        IBERFITBluetoothBackgroundBridge
                            .emitSample(
                                sample
                            )
                    }
                },
                onProviderError = {
                    error ->
                    val id =
                        activeExecutionId

                    if (id != null) {
                        diagnostics.record(
                            "FGS_BLE_ERROR"
                        )

                        updateNotification(
                            "PulsÃ³metro Bluetooth no disponible"
                        )

                        IBERFITBluetoothBackgroundBridge
                            .emitProviderError(
                                id,
                                error
                            )
                    }
                }
            )

        IBERFITBluetoothBackgroundBridge
            .registerController(
                this
            )
    }

    override fun onStartCommand(
        intent: Intent?,
        flags: Int,
        startId: Int
    ): Int {
        val executionId =
            intent
                ?.getStringExtra(
                    IBERFITBluetoothBackgroundBridge
                        .EXTRA_EXECUTION_ID
                )
                ?.trim()
                .orEmpty()

        when (intent?.action) {
            IBERFITBluetoothBackgroundBridge
                .ACTION_PREPARE_SESSION -> {
                if (
                    executionId.isBlank() ||
                    !prepareSession(
                        executionId
                    )
                ) {
                    stopSelf()
                }
            }

            IBERFITBluetoothBackgroundBridge
                .ACTION_STOP_SESSION -> {
                if (
                    executionId.isNotBlank()
                ) {
                    stopSession(
                        executionId
                    )
                } else {
                    stopSelf()
                }
            }

            else ->
                stopSelf()
        }

        return START_NOT_STICKY
    }

    override fun startBle(
        executionId: String
    ): Boolean {
        diagnostics.record(
            "FGS_BLE_START_REQUEST"
        )

        if (
            !prepareSession(
                executionId
            )
        ) {
            IBERFITBluetoothBackgroundBridge
                .emitUnavailable(
                    executionId
                )

            return false
        }

        updateNotification(
            "Conectando pulsÃ³metro Bluetoothâ€¦"
        )

        val started =
            preferredBle.start(
                executionId
            )

        diagnostics.record(
            if (started) {
                "FGS_BLE_STARTED"
            } else {
                "FGS_BLE_NOT_STARTED"
            }
        )

        if (!started) {
            updateNotification(
                "PulsÃ³metro Bluetooth no disponible"
            )

            IBERFITBluetoothBackgroundBridge
                .emitUnavailable(
                    executionId
                )
        }

        return started
    }

    override fun pauseBle(
        executionId: String
    ) {
        diagnostics.record(
            "FGS_BLE_PAUSE"
        )

        if (
            activeExecutionId !=
                executionId
        ) {
            return
        }

        preferredBle.pause()

        updateNotification(
            "PulsÃ³metro Bluetooth en pausa"
        )
    }

    override fun resumeBle(
        executionId: String
    ) {
        diagnostics.record(
            "FGS_BLE_RESUME"
        )

        if (
            activeExecutionId !=
                executionId
        ) {
            return
        }

        preferredBle.resume()

        updateNotification(
            "PulsÃ³metro Bluetooth activo"
        )
    }

    override fun stopBle(
        executionId: String
    ) {
        diagnostics.record(
            "FGS_BLE_WARM_STOP"
        )

        if (
            activeExecutionId !=
                executionId
        ) {
            return
        }

        preferredBle.stop()

        updateNotification(
            "PulsÃ³metro Bluetooth preparado"
        )
    }

    override fun stopSession(
        executionId: String
    ) {
        diagnostics.record(
            "FGS_SESSION_STOP"
        )

        if (
            activeExecutionId !=
                executionId
        ) {
            return
        }

        intentionalStop =
            true

        preferredBle.stop()

        activeExecutionId =
            null

        stopForeground(
            STOP_FOREGROUND_REMOVE
        )

        foregroundStarted =
            false

        stopSelf()
    }

    override fun onTaskRemoved(
        rootIntent: Intent?
    ) {
        diagnostics.record(
            "FGS_TASK_REMOVED"
        )

        intentionalStop =
            true

        preferredBle.stop()

        stopSelf()

        super.onTaskRemoved(
            rootIntent
        )
    }

    override fun onDestroy() {
        diagnostics.record(
            "FGS_ON_DESTROY"
        )

        val interruptedExecutionId =
            activeExecutionId

        preferredBle.stop()

        activeExecutionId =
            null

        IBERFITBluetoothBackgroundBridge
            .unregisterController(
                this
            )

        if (
            !intentionalStop &&
            interruptedExecutionId !=
                null
        ) {
            IBERFITBluetoothBackgroundBridge
                .emitUnavailable(
                    interruptedExecutionId
                )
        }

        if (foregroundStarted) {
            stopForeground(
                STOP_FOREGROUND_REMOVE
            )
        }

        super.onDestroy()
    }

    override fun onBind(
        intent: Intent?
    ): IBinder? =
        null

    private fun prepareSession(
        executionId: String
    ): Boolean {
        diagnostics.record(
            "FGS_PREPARE_SESSION"
        )

        if (
            executionId.isBlank()
        ) {
            return false
        }

        if (
            activeExecutionId != null &&
            activeExecutionId !=
                executionId
        ) {
            preferredBle.stop()
        }

        activeExecutionId =
            executionId

        intentionalStop =
            false

        return promoteForeground(
            "PulsÃ³metro Bluetooth preparado"
        )
    }

    private fun promoteForeground(
        status: String
    ): Boolean {
        val notification =
            buildNotification(
                status
            )

        return try {
            if (!foregroundStarted) {
                if (
                    Build.VERSION.SDK_INT >=
                        Build.VERSION_CODES.Q
                ) {
                    startForeground(
                        NOTIFICATION_ID,
                        notification,
                        ServiceInfo
                            .FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE
                    )
                } else {
                    startForeground(
                        NOTIFICATION_ID,
                        notification
                    )
                }

                foregroundStarted =
                    true

                diagnostics.record(
                    "FGS_PROMOTED"
                )
            } else {
                notificationManager
                    .notify(
                        NOTIFICATION_ID,
                        notification
                    )
            }

            true
        } catch (_: SecurityException) {
            false
        } catch (_: IllegalArgumentException) {
            false
        }
    }

    private fun updateNotification(
        status: String
    ) {
        if (!foregroundStarted) {
            promoteForeground(
                status
            )

            return
        }

        notificationManager
            .notify(
                NOTIFICATION_ID,
                buildNotification(
                    status
                )
            )
    }

    private fun buildNotification(
        status: String
    ): Notification {
        val launchIntent =
            Intent(
                this,
                PhoneMainActivity::class.java
            )
                .addFlags(
                    Intent.FLAG_ACTIVITY_SINGLE_TOP
                )

        val pendingIntent =
            PendingIntent.getActivity(
                this,
                0,
                launchIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or
                    PendingIntent.FLAG_IMMUTABLE
            )

        return Notification.Builder(
            this,
            CHANNEL_ID
        )
            .setSmallIcon(
                android.R.drawable
                    .ic_menu_info_details
            )
            .setContentTitle(
                "IBERFIT Â· Frecuencia cardÃ­aca"
            )
            .setContentText(
                status
            )
            .setContentIntent(
                pendingIntent
            )
            .setCategory(
                Notification.CATEGORY_SERVICE
            )
            .setOnlyAlertOnce(
                true
            )
            .setOngoing(
                true
            )
            .build()
    }

    private fun createNotificationChannel() {
        val channel =
            NotificationChannel(
                CHANNEL_ID,
                "Frecuencia cardÃ­aca Bluetooth",
                NotificationManager.IMPORTANCE_LOW
            )
                .apply {
                    description =
                        "Mantiene activo el pulsÃ³metro Bluetooth durante una sesiÃ³n IBERFIT."
                }

        notificationManager
            .createNotificationChannel(
                channel
            )
    }

    private val notificationManager:
        NotificationManager
        get() =
            getSystemService(
                NotificationManager::class.java
            )

    companion object {
        private const val CHANNEL_ID =
            "iberfit_bluetooth_heart_rate"

        private const val NOTIFICATION_ID =
            57068
    }
}