package cl.iberfit.m26.phone

/**
 * Narrow WebView transport policy: no wildcards, no HTTP, no user-info,
 * no subframes and no nondefault ports. The QA channel never returns health
 * data, authentication tokens, authorization grants, or account identifiers.
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
