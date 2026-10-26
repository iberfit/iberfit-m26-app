# IBERFIT SIGNATURE · Referencia visual y funcional — 26 octubre 2026

Documento operativo derivado del informe externo aportado por dirección, contrastado contra el SHA 9dd870c47fd6. Referencia para futuras iteraciones; no copiar un parche RC29 obsoleto sobre el sistema actual.

## Reglas estables

- Identidad: verde oscuro, crema, dorado cálido; jerarquía editorial, control visual, alta legibilidad y estética deportiva sobria.
- Glass solo en elementos flotantes, nunca indiscriminadamente en tarjetas. Una sola superficie hero dominante por pantalla. Evitar efectos, máscaras y degradados que penalicen móviles.
- Cliente: acción principal clara, pocas decisiones, bienestar accesible, progreso genuino, nada de jerga interna ni alarmas rojas permanentes.
- Coach: velocidad durante la sesión, agenda útil, selección y registro sin fricción, KPI con números tabulares y texto largo a tamaño de lectura.
- Admin: trazabilidad, privilegios verificados, operaciones densas pero no confusas.
- Transiciones solo por cambios reales de ruta, respetando reduce-motion; never activar entradas en cada render de innerHTML.
- Foco visible, teclado, táctil, contraste forzado, zonas >=44px, responsive y PWA sin bloqueos.
- Nunca fabricar porcentajes, hitos, diagnósticos, progreso de carga, estado de publicación o confirmación remota.
- Diagnóstico IRI inicial es punto de partida; la evolución/reevaluación posterior es otra entidad y estado.

## Estado comprobado en el código actual

- No se añade Tailwind ni una hoja RC30 nueva: ya existe un sistema propio con tokens y CSS SIGNATURE avanzado.
- Hoy Cliente YA contiene Tu proceso de entrenamiento y Registrar cómo estoy. El informe RC29 tiene un hallazgo históricamente desactualizado.
- B22: se corrige la etiqueta de progreso de los campos obligatorios, la legibilidad de KPI textuales y el pill ancho; se evita estiramiento de columnas Coach.
- Los seis selectores 0–10 siguen nativos de momento. El test autenticado existente depende de selectOption y de que cero real no se confunda con dato ausente. No sustituir hasta que una escala de chips equivalente pase validación HTML, teclado, lector de pantalla, móviles, restore de borrador y E2E.
- No habilitar autoguardado indiscriminado de bienestar sin verificar el repositorio privado, caducidad, permiso y restauración cifrada. El borrador nunca se anuncia como publicación.
- Semáforo LISTO/AJUSTAR/REDUCIR solo después de protocolos y umbrales calibrados, como sugerencia Coach, nunca modificación automática de sesiones.
- Anillos/sparklines fantasma son opcionales solo si resultan claros y no se confunden con valores reales; no animar ni vibrar sobre datos sin confirmar.
- Resolver mensajes IRI contradictorios desde una fuente de estado canónica, no con maquillaje visual.

## Criterio de terminación

Revisión de rama/SHA real, validación de seguridad, integridad y permisos, pruebas de regresión, visual mobile/tablet/desktop, QA autenticada, accesibilidad y distinción explícita entre PR, Canary y producción. No dar por publicado algo solo porque compile.
