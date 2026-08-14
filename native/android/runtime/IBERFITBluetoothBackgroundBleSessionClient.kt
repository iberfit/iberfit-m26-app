package cl.iberfit.nativebridge.runtime

import android.Manifest
import android.bluetooth.BluetoothManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import cl.iberfit.nativebridge.ble.IBERFITBlePreferredDeviceStore
import cl.iberfit.nativebridge.heartrate.IBERFITHeartRateProviderError
import cl.iberfit.nativebridge.heartrate.IBERFITHeartRateSample

/**
 * In-process client for the phone foreground service that owns Bluetooth HRS
 * while a session can fall back to the user's preferred sensor.
 *
 * The foreground service is prepared at session START, while the user is
 * interacting with the app. Later stale-Wear failover therefore does not need
 * to launch a new foreground service from the background.
 */
class IBERFITBluetoothBackgroundBleSessionClient(
    context: Context,
    private val onSample:
        (IBERFITHeartRateSample) -> Unit,
    private val onProviderError:
        (IBERFITHeartRateProviderError) -> Unit =
        {},
    private val onUnavailable:
        (String) -> Unit =
        {}
) :
    IBERFITBluetoothBackgroundBridge.Listener {
    private val appContext =
        context.applicationContext

    private var executionId:
        String? = null

    init {
        IBERFITBluetoothBackgroundBridge.attach(
            this
        )
    }

    fun prepare(
        executionId: String
    ): Boolean {
        val prepared =
            IBERFITBluetoothBackgroundBridge.prepare(
                context = appContext,
                executionId = executionId
            )

        if (prepared) {
            this.executionId =
                executionId
        }

        return prepared
    }

    fun start(
        executionId: String
    ): Boolean {
        if (
            this.executionId !=
                executionId
        ) {
            return false
        }

        return IBERFITBluetoothBackgroundBridge
            .startBle(
                executionId
            )
    }

    fun pause() {
        val id =
            executionId
                ?: return

        IBERFITBluetoothBackgroundBridge
            .pauseBle(
                id
            )
    }

    fun resume() {
        val id =
            executionId
                ?: return

        IBERFITBluetoothBackgroundBridge
            .resumeBle(
                id
            )
    }

    /**
     * Stop only the BLE provider while keeping the foreground service warm.
     * This lets a late Wear recovery remain protected for a future stale gap.
     */
    fun stop() {
        val id =
            executionId
                ?: return

        IBERFITBluetoothBackgroundBridge
            .stopBle(
                id
            )
    }

    /**
     * End the full background lease for this session.
     */
    fun release() {
        val id =
            executionId
                ?: return

        executionId =
            null

        IBERFITBluetoothBackgroundBridge
            .stopSession(
                context = appContext,
                executionId = id
            )
    }

    fun destroy() {
        release()

        IBERFITBluetoothBackgroundBridge
            .detach(
                this
            )
    }

    override fun onBackgroundBleSample(
        sample: IBERFITHeartRateSample
    ) {
        if (
            sample.executionId ==
                executionId
        ) {
            onSample(
                sample
            )
        }
    }

    override fun onBackgroundBleProviderError(
        executionId: String,
        error: IBERFITHeartRateProviderError
    ) {
        if (
            executionId ==
                this.executionId
        ) {
            onProviderError(
                error
            )
        }
    }

    override fun onBackgroundBleUnavailable(
        executionId: String
    ) {
        if (
            executionId ==
                this.executionId
        ) {
            onUnavailable(
                executionId
            )
        }
    }
}

/**
 * Same-process control plane between the shared Android runtime and the
 * phone-only foreground service.
 *
 * No Bluetooth scan is performed here. The service only reconnects to the
 * explicitly tested preferred device saved by RC57.6E.
 */
object IBERFITBluetoothBackgroundBridge {
    interface Listener {
        fun onBackgroundBleSample(
            sample: IBERFITHeartRateSample
        )

        fun onBackgroundBleProviderError(
            executionId: String,
            error: IBERFITHeartRateProviderError
        )

        fun onBackgroundBleUnavailable(
            executionId: String
        )
    }

    interface Controller {
        fun startBle(
            executionId: String
        ): Boolean

        fun pauseBle(
            executionId: String
        )

        fun resumeBle(
            executionId: String
        )

        fun stopBle(
            executionId: String
        )

        fun stopSession(
            executionId: String
        )
    }

    private val lock =
        Any()

    @Volatile
    private var listener:
        Listener? = null

    @Volatile
    private var controller:
        Controller? = null

    private var preparedExecutionId:
        String? = null

    private var pendingBleStartExecutionId:
        String? = null

    fun attach(
        listener: Listener
    ) {
        this.listener =
            listener
    }

    fun detach(
        listener: Listener
    ) {
        if (
            this.listener ===
                listener
        ) {
            this.listener =
                null
        }
    }

    fun prepare(
        context: Context,
        executionId: String
    ): Boolean {
        if (
            executionId.isBlank() ||
            !canPrepare(
                context
            )
        ) {
            return false
        }

        synchronized(lock) {
            preparedExecutionId =
                executionId

            pendingBleStartExecutionId =
                null
        }

        val intent =
            serviceIntent(
                context = context,
                action =
                    ACTION_PREPARE_SESSION,
                executionId =
                    executionId
            )

        return try {
            context.startForegroundService(
                intent
            )

            true
        } catch (_: Throwable) {
            synchronized(lock) {
                if (
                    preparedExecutionId ==
                        executionId
                ) {
                    preparedExecutionId =
                        null
                }
            }

            false
        }
    }

    fun startBle(
        executionId: String
    ): Boolean {
        val currentController:
            Controller?

        synchronized(lock) {
            if (
                preparedExecutionId !=
                    executionId
            ) {
                return false
            }

            currentController =
                controller

            if (
                currentController ==
                    null
            ) {
                pendingBleStartExecutionId =
                    executionId

                return true
            }
        }

        return currentController
            ?.startBle(
                executionId
            )
            ?: false
    }

    fun pauseBle(
        executionId: String
    ) {
        if (
            preparedExecutionId ==
                executionId
        ) {
            controller
                ?.pauseBle(
                    executionId
                )
        }
    }

    fun resumeBle(
        executionId: String
    ) {
        if (
            preparedExecutionId ==
                executionId
        ) {
            controller
                ?.resumeBle(
                    executionId
                )
        }
    }

    fun stopBle(
        executionId: String
    ) {
        synchronized(lock) {
            if (
                pendingBleStartExecutionId ==
                    executionId
            ) {
                pendingBleStartExecutionId =
                    null
            }
        }

        if (
            preparedExecutionId ==
                executionId
        ) {
            controller
                ?.stopBle(
                    executionId
                )
        }
    }

    fun stopSession(
        context: Context,
        executionId: String
    ) {
        val currentController:
            Controller?

        synchronized(lock) {
            if (
                preparedExecutionId !=
                    executionId
            ) {
                return
            }

            preparedExecutionId =
                null

            pendingBleStartExecutionId =
                null

            currentController =
                controller
        }

        currentController
            ?.stopSession(
                executionId
            )

        runCatching {
            context.stopService(
                serviceIntent(
                    context = context,
                    action =
                        ACTION_STOP_SESSION,
                    executionId =
                        executionId
                )
            )
        }
    }

    fun registerController(
        controller: Controller
    ) {
        val pending:
            String?

        synchronized(lock) {
            this.controller =
                controller

            pending =
                pendingBleStartExecutionId

            pendingBleStartExecutionId =
                null
        }

        if (pending != null) {
            controller.startBle(
                pending
            )
        }
    }

    fun unregisterController(
        controller: Controller
    ) {
        synchronized(lock) {
            if (
                this.controller ===
                    controller
            ) {
                this.controller =
                    null
            }
        }
    }

    fun emitSample(
        sample: IBERFITHeartRateSample
    ) {
        val expected =
            synchronized(lock) {
                preparedExecutionId
            }

        if (
            expected != null &&
            sample.executionId ==
                expected
        ) {
            listener
                ?.onBackgroundBleSample(
                    sample
                )
        }
    }

    fun emitProviderError(
        executionId: String,
        error: IBERFITHeartRateProviderError
    ) {
        if (
            synchronized(lock) {
                preparedExecutionId
            } ==
                executionId
        ) {
            listener
                ?.onBackgroundBleProviderError(
                    executionId,
                    error
                )
        }
    }

    fun emitUnavailable(
        executionId: String
    ) {
        if (
            synchronized(lock) {
                preparedExecutionId
            } ==
                executionId
        ) {
            listener
                ?.onBackgroundBleUnavailable(
                    executionId
                )
        }
    }

    private fun canPrepare(
        context: Context
    ): Boolean {
        if (
            IBERFITBlePreferredDeviceStore(
                context
            ).load() == null
        ) {
            return false
        }

        if (
            Build.VERSION.SDK_INT >=
                Build.VERSION_CODES.S &&
            context.checkSelfPermission(
                Manifest.permission.BLUETOOTH_CONNECT
            ) !=
                PackageManager.PERMISSION_GRANTED
        ) {
            return false
        }

        val manager =
            context.getSystemService(
                BluetoothManager::class.java
            )

        val adapter =
            manager?.adapter
                ?: return false

        return try {
            adapter.isEnabled
        } catch (_: SecurityException) {
            false
        }
    }

    private fun serviceIntent(
        context: Context,
        action: String,
        executionId: String
    ): Intent =
        Intent()
            .setClassName(
                context.packageName,
                SERVICE_CLASS_NAME
            )
            .setAction(
                action
            )
            .putExtra(
                EXTRA_EXECUTION_ID,
                executionId
            )

    const val ACTION_PREPARE_SESSION =
        "cl.iberfit.m26.action.PREPARE_BLE_BACKGROUND_SESSION"

    const val ACTION_STOP_SESSION =
        "cl.iberfit.m26.action.STOP_BLE_BACKGROUND_SESSION"

    const val EXTRA_EXECUTION_ID =
        "executionId"

    const val SERVICE_CLASS_NAME =
        "cl.iberfit.m26.phone.IBERFITBluetoothHeartRateForegroundService"
}