package cl.iberfit.m26.phone

/**
 * Narrow WebView transport policy: no wildcards, no HTTP, no user-info,
 * no subframes and no nondefault ports. A one-shot QA read can return
 * approved health summaries to Canary; never account IDs, grants or tokens.
 */
internal object Connected360OriginGate {
    const val QA_ORIGIN = "https://m26-canary.iberfit.cl"
    const val QA_HOST = "m26-canary.iberfit.cl"
    const val CHANNEL = "IBERFIT_CONNECTED360_QA"
    private val requestIds = Regex("^[a-zA-Z0-9_-]{8,72}$")

    fun trusted(
        scheme: String?,
        host: String?,
        port: Int,
        userInfo: String?,
        isMainFrame: Boolean,
    ): Boolean =
        isMainFrame &&
            scheme == "https" &&
            host == QA_HOST &&
            (port == -1 || port == 443) &&
            userInfo.isNullOrEmpty()

    fun requestIdAllowed(value: String): Boolean = requestIds.matches(value)
}

/**
 * UI-thread-only fence for Android WebView QA reads.
 *
 * A native read may suspend while Health Connect responds. A navigation,
 * background transition, certificate error or Activity destruction retires
 * the generation so that a reply to an old document cannot be delivered to
 * another account after the web app has navigated.
 */
internal class Connected360PageFence {
    private var generation = 0L

    fun capture(): Long = generation

    fun retire() {
        generation += 1L
    }

    fun isCurrent(lease: Long): Boolean = generation == lease
}
