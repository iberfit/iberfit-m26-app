# IBERFIT M26 · Wearables, UX y privacidad

## Alcance RC20

RC20 incorpora un contrato neutral de proveedores, normalización diaria, deduplicación, resumen de siete días, detección de frescura, vista previa local JSON/CSV, separación de permisos Cliente/Coach, contrato de puente nativo y migración Supabase guardada.

No activa conexiones remotas ni solicita permisos reales. La PWA no simula acceso directo a Apple Health ni Health Connect. Estas fuentes requieren una aplicación móvil con puente nativo. Garmin, Fitbit y Oura requieren OAuth o acceso de programa desde servidor.

## Principios de experiencia

1. El cliente mantiene el control sobre consentimiento, pausa y revocación.
2. Se solicita solo la métrica necesaria y en el momento en que aporta valor.
3. El Coach ve resúmenes confirmados, procedencia, fecha y calidad.
4. El check-in subjetivo no se reemplaza por el wearable.
5. Ningún dato produce diagnóstico o progresión automática de carga.
6. Datos ausentes permanecen ausentes; no se convierten en cero.
7. RC20 conserva resúmenes diarios y evita almacenar frecuencia cardiaca segundo a segundo.
8. Tokens y credenciales nunca se incluyen en el frontend ni en campos JSON de métricas.

## Métricas iniciales

- Pasos.
- Minutos activos.
- Minutos de sueño.
- Frecuencia cardiaca en reposo.
- HRV, cuando la fuente la aporta de forma comparable.
- Energía activa.
- Minutos de entrenamiento.

## Gates externos

- Aplicación móvil iOS con HealthKit y permisos reales.
- Aplicación móvil Android con Health Connect y permisos reales.
- Aprobación/acceso comercial del proveedor cuando corresponda.
- Política de privacidad publicada y flujo de consentimiento revisado.
- Pruebas con datos sintéticos y cuenta QA antes de datos reales.
- Comparación de duplicados entre fuentes y reglas de prioridad acordadas.
