# IBERFIT — Auditoría de historial de migraciones

El comando `scripts/data-safety/audit_migration_ledger.mjs` compara únicamente **nombres** y **marcas de versión** de migraciones. No se conecta a Supabase, no requiere credenciales, no escribe archivos ni ejecuta SQL.

## Entradas

Exportar, mediante una conexión autorizada y en cada entorno de forma independiente, las columnas no sensibles `version` y `name` de `supabase_migrations.schema_migrations`. Guardarlas como un array JSON:

```json
[
  {"version":"20261001000000","name":"example_safe_migration"}
]
```

Ejecutar desde la raíz del repositorio:

```sh
node scripts/data-safety/audit_migration_ledger.mjs /secure/path/qa-history.json /secure/path/prod-history.json
```

El directorio `supabase/migrations` es la tercera fuente. El informe, impreso en salida estándar, incluye conteos, versiones divergentes, nombres duplicados, migraciones sin registro literal en cada entorno y entradas del historial sin archivo de igual nombre. Sus salidas no contienen datos de Clientes, claves ni cadenas de conexión.

## Interpretación y límites

- `attentionRequired=true` significa **revisión humana/técnica**, no una instrucción para aplicar ni reparar migraciones.
- Una migración cuyo archivo está en el repositorio y no aparece en PROD puede estar destinada exclusivamente a QA. Nunca inferir que debe aplicarse.
- Una migración con el mismo nombre y distinto sello puede estar ya instalada correctamente; verificar la **semántica del esquema** (definiciones SQL, constraints, índices, RLS, grants y dependencias) antes de cualquier decisión.
- Un nombre de migración repetido no demuestra que un cambio se haya aplicado dos veces: investigar historial, versión y contenido.
- No ejecutar `supabase db push` ni `supabase migration repair` automáticamente. Una reparación de historial no aplica ni revierte el SQL correspondiente.
- Conservar evidencia y plan de rollback antes de eventuales acciones de reconciliación. Las operaciones se controlarán por separado en el issue #764.

El auditor deliberadamente **no es un gate de despliegue** mientras exista drift histórico: evita bloquear entregas correctas por discrepancias previamente conocidas. Su función es producir un inventario reproducible y seguro antes de tomar decisiones.
