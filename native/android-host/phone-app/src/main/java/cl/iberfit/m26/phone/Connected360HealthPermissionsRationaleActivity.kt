package cl.iberfit.m26.phone

import android.app.Activity
import android.os.Bundle
import android.widget.ScrollView
import android.widget.TextView

/** Local QA disclosure. Must be reconciled with the published Play privacy policy before release. */
class Connected360HealthPermissionsRationaleActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val disclosure = TextView(this).apply {
            text = "IBERFIT · Health Connect\n\n" +
                "La aplicación solicita acceso de solo lectura a pasos, sueño y frecuencia " +
                "cardíaca en reposo, exclusivamente mediante el diálogo oficial de Android.\n\n" +
                "Puedes conceder solo algunas categorías o denegarlas. La pantalla de " +
                "pruebas consulta hasta siete días de datos en este dispositivo para " +
                "mostrar un resumen local. No envía datos de salud a servidores, " +
                "no los vincula a una cuenta IBERFIT ni los comparte con terceros.\n\n" +
                "Puedes retirar los permisos desde los ajustes de Health Connect. " +
                "Esta compilación es exclusivamente para validación técnica y no " +
                "sustituye la política de privacidad publicada para una distribución oficial."
            textSize = 17f
            setPadding(40, 48, 40, 48)
        }
        setContentView(ScrollView(this).apply { addView(disclosure) })
    }
}
