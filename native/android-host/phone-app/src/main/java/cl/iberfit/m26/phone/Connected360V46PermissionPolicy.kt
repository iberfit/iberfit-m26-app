package cl.iberfit.m26.phone

/**
 * The signed web session holds the server-side scope grant. Android permission
 * prompts are still independent and explicit. Only the same selected categories
 * may be requested through the production WebView bridge.
 */
internal object Connected360V46PermissionPolicy {
    const val EXTRA_SCOPES = "cl.iberfit.m26.phone.V46_SELECTED_SCOPES"
    private val supported = setOf("generalHeartRate", "exerciseSessions")

    fun parseScopes(values: List<String>?): Set<String>? {
        if (values == null || values.isEmpty() || values.size > supported.size) return null
        val unique = values.toSet()
        return unique.takeIf { it.size == values.size && it.all(supported::contains) }
    }

    fun osPermissions(scopes: Set<String>): Set<String> {
        require(scopes.isNotEmpty() && supported.containsAll(scopes))
        val permissions = linkedSetOf<String>()
        if ("generalHeartRate" in scopes)
            permissions.add(Connected360GeneralHeartRateDiagnostic.permission)
        if ("exerciseSessions" in scopes)
            permissions.add(Connected360WorkoutReadOnlyQa.requiredPermission)
        return permissions
    }
}
