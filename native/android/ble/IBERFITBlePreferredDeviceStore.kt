package cl.iberfit.nativebridge.ble

import android.annotation.SuppressLint
import android.content.Context

data class IBERFITBlePreferredDevice(
    val stableId: String,
    val displayName: String,
    internal val address: String
)

/**
 * Stores the connection key privately for reconnect while exposing only
 * friendly identity to presentation code.
 */
class IBERFITBlePreferredDeviceStore(
    context: Context
) {
    private val preferences =
        context.applicationContext
            .getSharedPreferences(
                PREFERENCES_NAME,
                Context.MODE_PRIVATE
            )

    @SuppressLint("MissingPermission")
    fun save(
        device: IBERFITBleDiscoveredDevice
    ) {
        val address =
            runCatching {
                device.bluetoothDevice.address
            }.getOrNull()
                ?: return

        preferences
            .edit()
            .putString(
                KEY_STABLE_ID,
                device.stableId
            )
            .putString(
                KEY_DISPLAY_NAME,
                device.displayName
            )
            .putString(
                KEY_INTERNAL_ADDRESS,
                address
            )
            .apply()
    }

    fun load():
        IBERFITBlePreferredDevice? {
        val stableId =
            preferences.getString(
                KEY_STABLE_ID,
                null
            )
                ?: return null

        val displayName =
            preferences.getString(
                KEY_DISPLAY_NAME,
                null
            )
                ?: return null

        val address =
            preferences.getString(
                KEY_INTERNAL_ADDRESS,
                null
            )
                ?: return null

        return IBERFITBlePreferredDevice(
            stableId = stableId,
            displayName = displayName,
            address = address
        )
    }

    fun clear() {
        preferences
            .edit()
            .remove(KEY_STABLE_ID)
            .remove(KEY_DISPLAY_NAME)
            .remove(KEY_INTERNAL_ADDRESS)
            .apply()
    }

    companion object {
        private const val PREFERENCES_NAME =
            "iberfit_ble_devices"

        private const val KEY_STABLE_ID =
            "preferred_stable_id"

        private const val KEY_DISPLAY_NAME =
            "preferred_display_name"

        private const val KEY_INTERNAL_ADDRESS =
            "preferred_connection_key"
    }
}