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

        Log.i(
            TAG,
            "DATALAYER_COMMAND_RECEIVED action=$action sourceNode=${messageEvent.sourceNodeId}"
        )

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

        Log.i(
            TAG,
            "DATALAYER_COMMAND_DISPATCH action=$action dispatched=$dispatched executionId=$executionId"
        )

        if (!dispatched) {
            Log.w(
                TAG,
                "Workout command could not be dispatched: $action"
            )
        }
    }

    companion object {
        private const val TAG =
            "IBERFITWearCommand"
    }
}