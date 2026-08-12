package cl.iberfit.m26.wear

import android.app.Activity
import android.os.Bundle
import android.widget.LinearLayout
import android.widget.TextView
import cl.iberfit.nativebridge.runtime.IBERFITWearDataLayerRuntime
import cl.iberfit.nativebridge.wear.IBERFITWearHealthServicesBridge

class WearMainActivity : Activity() {
    private lateinit var status: TextView
    private lateinit var dataLayer: IBERFITWearDataLayerRuntime
    private lateinit var health: IBERFITWearHealthServicesBridge

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        status = TextView(this).apply {
            text = "IBERFIT Wear Â· preparando"
            textSize = 16f
        }

        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(24, 32, 24, 24)
            addView(status)
        }
        setContentView(root)

        health = IBERFITWearHealthServicesBridge(this)
        dataLayer = IBERFITWearDataLayerRuntime(
            this,
            onSample = { },
            onCommand = { action, payload ->
                runOnUiThread {
                    val executionId = payload.optString("executionId")
                    status.text = "Comando: $action Â· $executionId"
                }
            }
        )
        dataLayer.startListening()

        status.text =
            "IBERFIT Wear Â· DataLayer + Health Services preparados Â· sensor aÃºn no iniciado"
    }

    override fun onDestroy() {
        dataLayer.stopListening()
        super.onDestroy()
    }
}