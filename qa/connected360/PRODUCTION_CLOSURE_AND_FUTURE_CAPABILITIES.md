# IBERFIT Connected 360 — cierre de producción y hoja de evolución

**Base publicada:** `17e7f5a03dc01977ef7dca4e07ee94874f19427f`. V46 en Supabase PROD conserva `enabled=false` hasta certificación nativa; no hay ingesta sanitaria productiva. La publicación del frontend no equivale a una APK Android firmada.

## Contrato permanente de medidas

- **Observación:** fuente, tipo de medida, unidad, intervalo temporal, huso horario, valor, cobertura, fecha de adquisición, identidad del titular y calidad de procedencia; dato ausente nunca es cero.
- **Semántica:** FC general ≠ FC reposo; una sesión deportiva observada ≠ entrenamiento IBERFIT prescrito/completado; pasos y sueño no prueban recuperación ni adherencia sin contexto adicional.
- **IRI y evolución:** el diagnóstico IRI es el punto de partida. Las observaciones posteriores pertenecen a Seguimiento, no reescriben un informe inicial aprobado.
- **Consentimiento:** permiso OS, acceso local, permiso de transmisión y permiso de uso para asesoramiento son decisiones separadas. Las categorías futuras nunca heredan consentimiento actual.
- **Ciclo de vida:** idempotencia, autenticación por sesión real, verificación de identidad antes y después de la lectura, cercado de grant/cursor/revocación, pausa, desconexión, borrado, reintentos y expiración.
- **Extensión:** ninguna nueva fuente, unidad, algoritmo, dato sensible o categoría entra al writer V46 por aparecer en el catálogo. Requiere nueva revisión de privacidad, backend, RLS, tests y permiso explícito.

## Capacidades futuras (no habilitadas)

| Dominio | Métricas y decisiones que aportarían valor | Límites |
|---|---|---|
| Running | distancia, ritmo/velocidad, duración, parciales, intervalos, cadencia, desnivel, zona FC, tendencia, prescripción de sesiones, volumen semanal | Distinguir ritmo objetivo del observado y sesiones prescritas de actividad detectada; GPS necesita consentimiento separado |
| Fuerza | patrón, series, repeticiones, carga, RPE/RIR, descanso, densidad, progresión, alternativas, superseries y circuitos | Control principal del Coach; no suponer que wearable conoce carga ni calidad de ejecución |
| Recuperación | sueño h:min, FC reposo si existe, VFC, variación personal, adherencia | Contexto de entrenamiento, no diagnóstico clínico ni readiness inferida de datos escasos |
| Ciclismo y otros | ruta/MTB, tiempo, distancia, cadencia, potencia cuando exista, natación e híbrido | Fuente y unidades explícitas; no transformar observaciones genéricas en potencia |
| Salud y dispositivos | Health Connect/Samsung via fuentes reales, posterior HealthKit, conexión y permisos simples, fallback sin datos | Sin vender soporte de iOS nativo hasta compilar y validar físicamente |

## Plan de cierre Connected 360

1. Conservar identidad Android Release y recuperar firma estable mediante el entorno restringido de GitHub. Nunca distribuir debug o unsigned como producción ni introducir otra clave de reemplazo.
2. Obtener APK/AAB firmados con comprobación de certificado, firma, package ID `cl.iberfit.m26` y versionCode. Actualización sobre instalación existente, si aplica.
3. Certificar físicamente Android + Galaxy Watch9 con cliente real: vinculación inicial, permisos de HR general/ejercicio y legado pasos/sueño/FC reposo, ausencia de datos, >7.000 muestras, running, cambios de cuenta y revocación.
4. Certificar token caducado, offline, red lenta, suspensión/reanudación, reintento, reinicio del proceso, permisos parciales, borrado y controles de privacidad; auditar que no hay duplicados ni filtraciones cruzadas.
5. Solo entonces autorizar un rollout pequeño, reversible y monitorizado del interruptor PROD V46; el estado del interruptor es control operativo, no un permiso delegado a la app.
6. iOS HealthKit tiene cierre independiente: implementación, revisión de permisos, distribución y pruebas reales cuando haya hardware.

## Siguiente macrobloque una vez cerrado

**Motor Entrenamiento + Running + Experiencia Premium:** velocidad del Coach en sesión, prescripción progresiva de carrera, carrera continua y por intervalos, ciclismo y fuerza, feedback, adherencia, recuperación, gráficos accionables y experiencia Cliente/Coach/Admin separada. Incluir auditoría móvil, accesibilidad, estabilidad, datos y seguridad. Una integración amplia y una promoción única a PROD por paquete, sin mezclar generación de imágenes en este hilo.
