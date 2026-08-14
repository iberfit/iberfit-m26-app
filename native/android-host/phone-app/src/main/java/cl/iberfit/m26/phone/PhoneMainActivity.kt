package cl.iberfit.m26.phone

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.bluetooth.BluetoothManager
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.widget.Button
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import cl.iberfit.nativebridge.ble.IBERFITAndroidBleHeartRateTransport
import cl.iberfit.nativebridge.ble.IBERFITBleDeviceDiscoveryListener
import cl.iberfit.nativebridge.ble.IBERFITBleDeviceDiscoveryManager
import cl.iberfit.nativebridge.ble.IBERFITBleDiscoveredDevice
import cl.iberfit.nativebridge.ble.IBERFITBleDiscoveryState
import cl.iberfit.nativebridge.ble.IBERFITBleHeartRateProvider
import cl.iberfit.nativebridge.ble.IBERFITBlePreferredDeviceStore
import cl.iberfit.nativebridge.heartrate.IBERFITHeartRateProviderError
import cl.iberfit.nativebridge.heartrate.IBERFITHeartRateProviderListener
import cl.iberfit.nativebridge.heartrate.IBERFITHeartRateProviderSnapshot
import cl.iberfit.nativebridge.heartrate.IBERFITHeartRateProviderState
import cl.iberfit.nativebridge.heartrate.IBERFITHeartRateSample
import cl.iberfit.nativebridge.heartrate.IBERFITHeartRateSessionContext
import cl.iberfit.nativebridge.runtime.IBERFITWearDataLayerRuntime
import org.json.JSONObject
import kotlin.math.roundToInt

class PhoneMainActivity : Activity() {
    private lateinit var status:
        TextView

    private lateinit var deviceStatus:
        TextView

    private lateinit var preferredStatus:
        TextView

    private lateinit var deviceList:
        LinearLayout

    private lateinit var dataLayer:
        IBERFITWearDataLayerRuntime

    private lateinit var discovery:
        IBERFITBleDeviceDiscoveryManager

    private lateinit var preferredStore:
        IBERFITBlePreferredDeviceStore

    private var executionId:
        String? = null

    private var pendingBluetoothAction:
        (() -> Unit)? = null

    private var activeBleTestProvider:
        IBERFITBleHeartRateProvider? = null

    private var discoveredDeviceCount =
        0

    override fun onCreate(
        savedInstanceState: Bundle?
    ) {
        super.onCreate(
            savedInstanceState
        )

        val brandMarkSize =
            resources.getDimensionPixelSize(
                R.dimen.iberfit_native_brand_mark
            )

        val brandMark =
            ImageView(this).apply {
                setImageResource(
                    R.drawable.iberfit_brand_mark
                )
                adjustViewBounds =
                    true
                scaleType =
                    ImageView.ScaleType.FIT_CENTER
                contentDescription =
                    null
                layoutParams =
                    LinearLayout.LayoutParams(
                        brandMarkSize,
                        brandMarkSize
                    ).apply {
                        bottomMargin =
                            resources.getDimensionPixelSize(
                                R.dimen.iberfit_space_3
                            )
                    }
            }

        status =
            TextView(this).apply {
                text =
                    "IBERFIT Phone Â· DataLayer preparado"
                textSize =
                    18f
            }

        val start =
            Button(this).apply {
                text =
                    "Iniciar en reloj"

                setOnClickListener {
                    sendCommand(
                        "start"
                    )
                }
            }

        val pause =
            Button(this).apply {
                text =
                    "Pausar en reloj"

                setOnClickListener {
                    sendCommand(
                        "pause"
                    )
                }
            }

        val resume =
            Button(this).apply {
                text =
                    "Reanudar en reloj"

                setOnClickListener {
                    sendCommand(
                        "resume"
                    )
                }
            }

        val stop =
            Button(this).apply {
                text =
                    "Detener en reloj"

                setOnClickListener {
                    sendCommand(
                        "stop"
                    )
                }
            }

        val devicesTitle =
            TextView(this).apply {
                text =
                    "Dispositivos"
                textSize =
                    22f

                setPadding(
                    0,
                    40,
                    0,
                    8
                )
            }

        deviceStatus =
            TextView(this).apply {
                text =
                    "AÃ±ade un pulsÃ³metro Bluetooth compatible."
            }

        preferredStatus =
            TextView(this)

        val addDevice =
            Button(this).apply {
                text =
                    "AÃ±adir dispositivo"

                setOnClickListener {
                    ensureBluetoothPermissions {
                        beginDiscovery()
                    }
                }
            }

        val testPreferred =
            Button(this).apply {
                text =
                    "Probar dispositivo preferido"

                setOnClickListener {
                    ensureBluetoothPermissions {
                        testPreferredDevice()
                    }
                }
            }

        val forgetPreferred =
            Button(this).apply {
                text =
                    "Olvidar dispositivo preferido"

                setOnClickListener {
                    preferredStore.clear()
                    refreshPreferredStatus()
                    deviceStatus.text =
                        "Dispositivo preferido eliminado."
                }
            }

        deviceList =
            LinearLayout(this).apply {
                orientation =
                    LinearLayout.VERTICAL
            }

        val content =
            LinearLayout(this).apply {
                orientation =
                    LinearLayout.VERTICAL

                setPadding(
                    32,
                    48,
                    32,
                    32
                )

                addView(brandMark)
                addView(status)
                addView(start)
                addView(pause)
                addView(resume)
                addView(stop)
                addView(devicesTitle)
                addView(deviceStatus)
                addView(preferredStatus)
                addView(addDevice)
                addView(testPreferred)
                addView(forgetPreferred)
                addView(deviceList)
            }

        val root =
            ScrollView(this).apply {
                addView(content)
            }

        setContentView(root)

        preferredStore =
            IBERFITBlePreferredDeviceStore(
                this
            )

        discovery =
            IBERFITBleDeviceDiscoveryManager(
                context = this,
                listener =
                    object :
                        IBERFITBleDeviceDiscoveryListener {
                        override fun onDiscoveryStateChanged(
                            state: IBERFITBleDiscoveryState
                        ) {
                            runOnUiThread {
                                renderDiscoveryState(
                                    state
                                )
                            }
                        }

                        override fun onDeviceFound(
                            device: IBERFITBleDiscoveredDevice
                        ) {
                            runOnUiThread {
                                addDiscoveredDevice(
                                    device
                                )
                            }
                        }

                        override fun onDiscoveryError(
                            code: String
                        ) {
                            runOnUiThread {
                                deviceStatus.text =
                                    friendlyDiscoveryError(
                                        code
                                    )
                            }
                        }
                    }
            )

        dataLayer =
            IBERFITWearDataLayerRuntime(
                this,
                onSample = {
                    sample ->
                    showSample(
                        sample
                    )
                },
                onCommand = {
                    action,
                    payload ->
                    runOnUiThread {
                        status.text =
                            "Comando recibido: $action Â· " +
                                payload.optString(
                                    "executionId"
                                )
                    }
                }
            )

        dataLayer.startListening()
        refreshPreferredStatus()
    }

    private fun sendCommand(
        action: String
    ) {
        if (action == "start") {
            executionId =
                "rc57-" +
                    System.currentTimeMillis()
        }

        dataLayer.sendCommand(
            action,
            executionId
        ) { queued ->
            runOnUiThread {
                status.text =
                    if (queued) {
                        "Comando $action enviado Â· " +
                            (
                                executionId
                                    ?: "sin executionId"
                                )
                    } else {
                        "Sin nodo Wear OS disponible"
                    }
            }
        }
    }

    private fun showSample(
        sample: JSONObject
    ) {
        runOnUiThread {
            val bpm =
                sample.optDouble(
                    "heartRateBpm",
                    Double.NaN
                )

            val provider =
                sample.optString(
                    "provider"
                )

            val sampleExecutionId =
                sample.optString(
                    "executionId"
                )

            status.text =
                "FC recibida: $bpm bpm Â· " +
                    "$provider Â· " +
                    sampleExecutionId
                        .ifBlank {
                            "sin executionId"
                        }
        }
    }

    private fun beginDiscovery() {
        activeBleTestProvider
            ?.stop()

        activeBleTestProvider =
            null

        discoveredDeviceCount =
            0

        deviceList.removeAllViews()

        deviceStatus.text =
            "Buscando pulsÃ³metros cercanosâ€¦"

        discovery.startScan()
    }

    private fun renderDiscoveryState(
        state: IBERFITBleDiscoveryState
    ) {
        when (state) {
            IBERFITBleDiscoveryState.IDLE ->
                Unit

            IBERFITBleDiscoveryState.SCANNING ->
                deviceStatus.text =
                    "Buscando pulsÃ³metros cercanosâ€¦"

            IBERFITBleDiscoveryState.FINISHED ->
                deviceStatus.text =
                    if (
                        discoveredDeviceCount == 0
                    ) {
                        "No encontramos pulsÃ³metros. " +
                            "Acerca el dispositivo y vuelve a intentarlo."
                    } else {
                        "Elige un dispositivo para probarlo."
                    }

            IBERFITBleDiscoveryState.BLUETOOTH_DISABLED ->
                deviceStatus.text =
                    "Activa Bluetooth para buscar dispositivos."

            IBERFITBleDiscoveryState.UNSUPPORTED ->
                deviceStatus.text =
                    "Este telÃ©fono no admite bÃºsqueda Bluetooth LE."

            IBERFITBleDiscoveryState.ERROR ->
                if (
                    deviceStatus.text
                        .toString()
                        .startsWith(
                            "Buscando"
                        )
                ) {
                    deviceStatus.text =
                        "No pudimos completar la bÃºsqueda."
                }
        }
    }

    private fun addDiscoveredDevice(
        device: IBERFITBleDiscoveredDevice
    ) {
        discoveredDeviceCount +=
            1

        val button =
            Button(this).apply {
                text =
                    "${device.displayName}\n" +
                        device.signalLabel

                contentDescription =
                    "Probar ${device.displayName}"

                setOnClickListener {
                    testDevice(
                        device
                    )
                }
            }

        deviceList.addView(
            button
        )

        deviceStatus.text =
            "Selecciona el pulsÃ³metro que quieras usar."
    }

    private fun testDevice(
        device: IBERFITBleDiscoveredDevice
    ) {
        discovery.stopScan()

        activeBleTestProvider
            ?.stop()

        val transport =
            IBERFITAndroidBleHeartRateTransport(
                context = this,
                device =
                    device.bluetoothDevice,
                deviceId =
                    device.stableId
            )

        val provider =
            IBERFITBleHeartRateProvider(
                transport =
                    transport
            )

        activeBleTestProvider =
            provider

        provider.setListener(
            object :
                IBERFITHeartRateProviderListener {
                override fun onProviderStateChanged(
                    snapshot:
                        IBERFITHeartRateProviderSnapshot
                ) {
                    runOnUiThread {
                        when (
                            snapshot.state
                        ) {
                            IBERFITHeartRateProviderState.CONNECTING,
                            IBERFITHeartRateProviderState.ACQUIRING ->
                                deviceStatus.text =
                                    "Conectando con ${device.displayName}â€¦"

                            IBERFITHeartRateProviderState.ACTIVE ->
                                deviceStatus.text =
                                    "Conectado. Esperando pulsacionesâ€¦"

                            IBERFITHeartRateProviderState.ERROR ->
                                deviceStatus.text =
                                    "No pudimos conectar con el dispositivo."

                            else ->
                                Unit
                        }
                    }
                }

                override fun onHeartRateSample(
                    sample:
                        IBERFITHeartRateSample
                ) {
                    preferredStore.save(
                        device
                    )

                    runOnUiThread {
                        deviceStatus.text =
                            "Conectado: ${device.displayName} Â· " +
                                "${sample.bpm.roundToInt()} bpm\n" +
                                "Guardado como preferido."

                        refreshPreferredStatus()
                    }

                    provider.stop()

                    if (
                        activeBleTestProvider ===
                            provider
                    ) {
                        activeBleTestProvider =
                            null
                    }
                }

                override fun onProviderError(
                    error:
                        IBERFITHeartRateProviderError
                ) {
                    runOnUiThread {
                        deviceStatus.text =
                            friendlyProviderError(
                                error.code
                            )
                    }
                }
            }
        )

        provider.start(
            IBERFITHeartRateSessionContext(
                sessionId =
                    "ble-device-test",
                executionId =
                    "ble-test-" +
                        System.currentTimeMillis(),
                startedAtEpochMs =
                    System.currentTimeMillis()
            )
        )
    }

    @SuppressLint("MissingPermission")
    private fun testPreferredDevice() {
        val preferred =
            preferredStore.load()

        if (preferred == null) {
            deviceStatus.text =
                "TodavÃ­a no hay un dispositivo preferido."
            return
        }

        val manager =
            getSystemService(
                BluetoothManager::class.java
            )

        val adapter =
            manager?.adapter

        if (
            adapter == null ||
            !adapter.isEnabled
        ) {
            deviceStatus.text =
                "Activa Bluetooth para conectar el dispositivo."
            return
        }

        val device =
            runCatching {
                adapter.getRemoteDevice(
                    preferred.address
                )
            }.getOrNull()

        if (device == null) {
            deviceStatus.text =
                "No pudimos recuperar el dispositivo guardado. " +
                    "BÃºscalo de nuevo."
            return
        }

        testDevice(
            IBERFITBleDiscoveredDevice(
                stableId =
                    preferred.stableId,
                displayName =
                    preferred.displayName,
                signalLabel =
                    "Dispositivo preferido",
                bluetoothDevice =
                    device
            )
        )
    }

    private fun refreshPreferredStatus() {
        val preferred =
            preferredStore.load()

        preferredStatus.text =
            if (preferred == null) {
                "Preferido: ninguno"
            } else {
                "Preferido: ${preferred.displayName}"
            }
    }

    private fun friendlyDiscoveryError(
        code: String
    ): String =
        when (code) {
            "BLUETOOTH_PERMISSION_REQUIRED" ->
                "Falta permiso para buscar dispositivos cercanos."

            "BLUETOOTH_SCANNER_UNAVAILABLE" ->
                "Bluetooth no estÃ¡ disponible en este momento."

            else ->
                "No pudimos completar la bÃºsqueda Bluetooth."
        }

    private fun friendlyProviderError(
        code: String
    ): String =
        when (code) {
            "BLUETOOTH_CONNECT_PERMISSION_REQUIRED" ->
                "Falta permiso para conectar con el dispositivo."

            "HEART_RATE_SERVICE_NOT_FOUND",
            "HEART_RATE_MEASUREMENT_NOT_FOUND",
            "HEART_RATE_MEASUREMENT_NOT_NOTIFIABLE" ->
                "El dispositivo no ofrece pulsaciones compatibles."

            else ->
                "No pudimos conectar. Intenta de nuevo."
        }

    private fun ensureBluetoothPermissions(
        action: () -> Unit
    ) {
        val missing =
            requiredBluetoothPermissions()
                .filter {
                    checkSelfPermission(
                        it
                    ) !=
                        PackageManager.PERMISSION_GRANTED
                }

        if (missing.isEmpty()) {
            action()
            return
        }

        pendingBluetoothAction =
            action

        requestPermissions(
            missing.toTypedArray(),
            REQUEST_BLUETOOTH_PERMISSIONS
        )
    }

    private fun requiredBluetoothPermissions():
        Array<String> =
        if (
            Build.VERSION.SDK_INT >=
                Build.VERSION_CODES.S
        ) {
            arrayOf(
                Manifest.permission.BLUETOOTH_SCAN,
                Manifest.permission.BLUETOOTH_CONNECT
            )
        } else {
            arrayOf(
                Manifest.permission.ACCESS_FINE_LOCATION
            )
        }

    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray
    ) {
        super.onRequestPermissionsResult(
            requestCode,
            permissions,
            grantResults
        )

        if (
            requestCode !=
                REQUEST_BLUETOOTH_PERMISSIONS
        ) {
            return
        }

        val action =
            pendingBluetoothAction

        pendingBluetoothAction =
            null

        val granted =
            grantResults.isNotEmpty() &&
                grantResults.all {
                    it ==
                        PackageManager.PERMISSION_GRANTED
                }

        if (granted) {
            action?.invoke()
        } else {
            deviceStatus.text =
                "Para aÃ±adir un pulsÃ³metro, permite el acceso Bluetooth necesario."
        }
    }

    override fun onDestroy() {
        activeBleTestProvider
            ?.stop()

        activeBleTestProvider =
            null

        discovery.stopScan()
        dataLayer.stopListening()

        super.onDestroy()
    }

    companion object {
        private const val
            REQUEST_BLUETOOTH_PERMISSIONS =
                5706
    }
}