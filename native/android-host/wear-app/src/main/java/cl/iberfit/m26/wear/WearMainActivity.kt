package cl.iberfit.m26.wear

import android.Manifest
import android.app.Activity
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.widget.LinearLayout
import android.widget.TextView

class WearMainActivity : Activity() {
    companion object {
        private const val REQUEST_HEART_RATE_PERMISSION = 5704
        private const val REQUEST_BACKGROUND_HEALTH_PERMISSION = 5705

        private const val READ_HEART_RATE_PERMISSION =
            "android.permission.health.READ_HEART_RATE"

        private const val READ_HEALTH_DATA_IN_BACKGROUND_PERMISSION =
            "android.permission.health.READ_HEALTH_DATA_IN_BACKGROUND"
    }

    private lateinit var status: TextView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        status = TextView(this).apply {
            text = "IBERFIT Wear Â· preparando permisos"
            textSize = 16f
        }

        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(24, 32, 24, 24)
            addView(status)
        }

        setContentView(root)
        ensureHealthPermissions()
    }

    override fun onResume() {
        super.onResume()

        if (::status.isInitialized) {
            updatePermissionStatus()
        }
    }

    private fun ensureHealthPermissions() {
        if (!hasHeartRatePermission()) {
            status.text =
                "IBERFIT Wear Â· solicitando permiso de FC"

            requestPermissions(
                arrayOf(requiredHeartRatePermission()),
                REQUEST_HEART_RATE_PERMISSION
            )
            return
        }

        val backgroundPermission =
            requiredBackgroundHealthPermission()

        if (
            backgroundPermission != null &&
            checkSelfPermission(backgroundPermission) !=
                PackageManager.PERMISSION_GRANTED
        ) {
            status.text =
                "IBERFIT Wear Â· solicitando FC en segundo plano"

            requestPermissions(
                arrayOf(backgroundPermission),
                REQUEST_BACKGROUND_HEALTH_PERMISSION
            )
            return
        }

        updatePermissionStatus()
    }

    private fun requiredHeartRatePermission(): String =
        if (Build.VERSION.SDK_INT >= 36) {
            READ_HEART_RATE_PERMISSION
        } else {
            Manifest.permission.BODY_SENSORS
        }

    private fun requiredBackgroundHealthPermission(): String? =
        when {
            Build.VERSION.SDK_INT >= 36 ->
                READ_HEALTH_DATA_IN_BACKGROUND_PERMISSION

            Build.VERSION.SDK_INT >= 33 ->
                Manifest.permission.BODY_SENSORS_BACKGROUND

            else -> null
        }

    private fun hasHeartRatePermission(): Boolean =
        checkSelfPermission(requiredHeartRatePermission()) ==
            PackageManager.PERMISSION_GRANTED

    private fun hasBackgroundHealthPermission(): Boolean {
        val permission =
            requiredBackgroundHealthPermission() ?: return true

        return checkSelfPermission(permission) ==
            PackageManager.PERMISSION_GRANTED
    }

    private fun updatePermissionStatus() {
        status.text =
            if (
                hasHeartRatePermission() &&
                hasBackgroundHealthPermission()
            ) {
                "IBERFIT Wear Â· runtime de entrenamiento listo"
            } else if (!hasHeartRatePermission()) {
                "IBERFIT Wear Â· falta permiso de FC"
            } else {
                "IBERFIT Wear Â· falta permiso de FC en segundo plano"
            }
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

        when (requestCode) {
            REQUEST_HEART_RATE_PERMISSION -> {
                if (
                    grantResults.isNotEmpty() &&
                    grantResults[0] ==
                        PackageManager.PERMISSION_GRANTED
                ) {
                    ensureHealthPermissions()
                } else {
                    updatePermissionStatus()
                }
            }

            REQUEST_BACKGROUND_HEALTH_PERMISSION -> {
                updatePermissionStatus()
            }
        }
    }
}