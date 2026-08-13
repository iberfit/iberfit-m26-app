package cl.iberfit.m26.wear

import android.util.Log
import cl.iberfit.nativebridge.runtime.IBERFITWearDataLayerRuntime
import com.google.android.gms.wearable.MessageEvent
import com.google.android.gms.wearable.WearableListenerService
import org.json.JSONObject

class IBERFITWearCommandListenerService :
    WearableListenerService() {

    override fun onMessageReceived(
        messageEvent: MessageEvent
    ) {
        if (
            messageEvent.path !=
                IBERFITWearDataLayerRuntime.COMMAND_PATH
        ) {
            super.onMessageReceived(
                messageEvent
            )
            return
        }

        val payload =
            runCatching {
                JSONObject(
                    String(
                        messageEvent.data,
                        Charsets.UTF_8
                    )
                )
            }.getOrNull() ?: return

        val action =
            payload.optString("action")

        if (
            !IBERFITWearWorkoutService
                .isSupportedAction(action)
        ) {
            return
        }

        val executionId =
            payload
                .optString("executionId")
                .takeIf { it.isNotBlank() }

        val dispatched =
            IBERFITWearWorkoutService
                .dispatch(
                    context = this,
                    action = action,
                    executionId = executionId
                )

        if (!dispatched) {
            Log.w(
                "IBERFITWearCommand",
                "Workout command could not be dispatched: $action"
            )
        }
    }
}