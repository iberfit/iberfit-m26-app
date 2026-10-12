package cl.iberfit.m26.phone

import cl.iberfit.healthconnect.IberfitHealthConnectReader

/**
 * Human-readable DEBUG-only local preview, never a remote data contract.
 *
 * Metrics may have data on DIFFERENT civil dates. The latest steps day must
 * not hide older but valid sleep or resting HR observations. An ungranted
 * category is not equivalent to an empty one, and an observed zero is a record.
 */
internal object Connected360LocalSummaryFormatter {
    fun render(
        records: List<IberfitHealthConnectReader.DailySummary>,
        grantedMetrics: Set<String>,
    ): String {
        if (records.isEmpty()) {
            return "No se encontraron registros accesibles durante los últimos 7 días. " +
                "Comprueba Datos y acceso en Salud conectada y si tu app de actividad " +
                "está compartiendo registros.\nNo se han enviado datos a IBERFIT."
        }

        val stepsDays = records.count { it.steps != null }
        val steps = when {
            "steps" !in grantedMetrics -> "sin permiso de lectura"
            stepsDays == 0 -> "sin registros accesibles"
            else -> {
                val period = if (stepsDays == 1) "1 día con registros" else "$stepsDays días con registros"
                "${records.mapNotNull { it.steps }.sum()} ($period)"
            }
        }

        val lastSleep = records.lastOrNull { it.sleepMinutes != null }
        val sleep = when {
            "sleepMinutes" !in grantedMetrics -> "sin permiso de lectura"
            lastSleep == null -> "sin registros accesibles"
            else -> "${lastSleep.sleepMinutes!! / 60} h " +
                "${lastSleep.sleepMinutes!! % 60} min (${lastSleep.date})"
        }

        val lastResting = records.lastOrNull { it.restingHeartRate != null }
        val resting = when {
            "restingHeartRate" !in grantedMetrics -> "sin permiso de lectura"
            lastResting == null -> "sin registros accesibles"
            else -> "${lastResting.restingHeartRate} lpm (${lastResting.date})"
        }

        return "Último día con algún registro: ${records.last().date}\n" +
            "Pasos de los últimos 7 días: $steps\n" +
            "Último sueño registrado: $sleep\n" +
            "Última FC en reposo registrada: $resting\n" +
            "No se han enviado datos a IBERFIT."
    }
}
