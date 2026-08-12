package cl.iberfit.m26.phone

import android.app.Activity
import android.os.Bundle
import android.view.View
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import cl.iberfit.nativebridge.runtime.IBERFITWearDataLayerRuntime
import org.json.JSONObject

class PhoneMainActivity : Activity() {
    private lateinit var status: TextView
    private lateinit var dataLayer: IBERFITWearDataLayerRuntime
    private var executionId: String? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        status = TextView(this).apply {
            text = "IBERFIT Phone Â· DataLayer preparado"
            textSize = 18f
        }

        val start = Button(this).apply {
            text = "Iniciar en reloj"
            setOnClickListener { sendCommand("start") }
        }
        val stop = Button(this).apply {
            text = "Detener en reloj"
            setOnClickListener { sendCommand("stop") }
        }

        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(32, 48, 32, 32)
            addView(status)
            addView(start)
            addView(stop)
        }
        setContentView(root)

        dataLayer = IBERFITWearDataLayerRuntime(
            this,
            onSample = { sample -> showSample(sample) },
            onCommand = { action, payload ->
                runOnUiThread {
                    status.text = "Comando recibido: $action Â· ${payload.optString("executionId")}"
                }
            }
        )
        dataLayer.startListening()
    }

    private fun sendCommand(action: String) {
        if (action == "start") {
            executionId = "rc57-" + System.currentTimeMillis()
        }
        dataLayer.sendCommand(action, executionId) { queued ->
            runOnUiThread {
                status.text = if (queued) {
                    "Comando $action enviado Â· ${executionId ?: "sin executionId"}"
                } else {
                    "Sin nodo Wear OS disponible"
                }
            }
        }
    }

    private fun showSample(sample: JSONObject) {
        runOnUiThread {
            val bpm = sample.optDouble("heartRateBpm", Double.NaN)
            val provider = sample.optString("provider")
            status.text = "FC recibida: $bpm bpm Â· $provider"
        }
    }

    override fun onDestroy() {
        dataLayer.stopListening()
        super.onDestroy()
    }
}