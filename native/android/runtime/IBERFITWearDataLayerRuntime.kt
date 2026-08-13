package cl.iberfit.nativebridge.runtime

import android.content.Context
import com.google.android.gms.wearable.MessageClient
import com.google.android.gms.wearable.MessageEvent
import com.google.android.gms.wearable.Wearable
import org.json.JSONObject

class IBERFITWearDataLayerRuntime(
    private val context: Context,
    private val onSample: (JSONObject) -> Unit = {},
    private val onCommand: (String, JSONObject) -> Unit = { _, _ -> }
) : MessageClient.OnMessageReceivedListener {
    companion object {
        const val SAMPLE_PATH = "/iberfit/live-heart-rate"
        const val COMMAND_PATH = "/iberfit/live-command"
    }

    private val messageClient get() =
        Wearable.getMessageClient(context)

    private val nodeClient get() =
        Wearable.getNodeClient(context)

    fun startListening() {
        messageClient.addListener(this)
    }

    fun stopListening() {
        messageClient.removeListener(this)
    }

    fun sendSample(
        sample: JSONObject,
        completion: (Boolean) -> Unit = {}
    ) {
        send(SAMPLE_PATH, sample, completion)
    }

    fun sendCommand(
        action: String,
        executionId: String?,
        completion: (Boolean) -> Unit = {}
    ) {
        val payload =
            JSONObject()
                .put("type", "command")
                .put("action", action)

        if (!executionId.isNullOrBlank()) {
            payload.put("executionId", executionId)
        }

        send(COMMAND_PATH, payload, completion)
    }

    private fun send(
        path: String,
        payload: JSONObject,
        completion: (Boolean) -> Unit
    ) {
        nodeClient.connectedNodes
            .addOnSuccessListener { nodes ->
                val targets =
                    nodes.filter { it.isNearby }
                        .ifEmpty { nodes }

                if (targets.isEmpty()) {
                    completion(false)
                    return@addOnSuccessListener
                }

                var queued = 0
                targets.forEach { node ->
                    messageClient
                        .sendMessage(
                            node.id,
                            path,
                            payload.toString().toByteArray()
                        )
                        .addOnSuccessListener {
                            queued += 1
                            if (queued == 1) {
                                completion(true)
                            }
                        }
                }
            }
            .addOnFailureListener {
                completion(false)
            }
    }

    override fun onMessageReceived(event: MessageEvent) {
        val payload =
            runCatching {
                JSONObject(String(event.data))
            }.getOrNull() ?: return

        when (event.path) {
            SAMPLE_PATH -> {
                val bpm =
                    payload.optDouble(
                        "heartRateBpm",
                        Double.NaN
                    )
                val provider =
                    payload.optString("provider")

                if (
                    provider.isNotBlank() &&
                    !bpm.isNaN() &&
                    !bpm.isInfinite()
                ) {
                    onSample(payload)
                }
            }

            COMMAND_PATH -> {
                val action =
                    payload.optString("action")

                if (
                    action in
                        setOf(
                            "start",
                            "pause",
                            "resume",
                            "stop"
                        )
                ) {
                    onCommand(action, payload)
                }
            }
        }
    }
}