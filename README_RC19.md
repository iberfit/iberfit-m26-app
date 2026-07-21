# IBERFIT M26 · RC19 Final Local Audit

RC19 es la candidata local consolidada posterior a RC18. No está desplegada ni autorizada para producción.

## Validación local

- 179/179 pruebas automatizadas.
- 24/24 controles específicos RC19.
- 15/15 vistas Chromium.
- 2/2 recorridos integrados Coach/Cliente.
- 51 módulos web resueltos y cero ausentes.
- 367 ejercicios canónicos únicos.
- 44 comandos base y contrato extendido de 52 preservados.
- 122 archivos M25/M25.2 protegidos sin cambios, ausencias ni adiciones.

## Mejoras RC19

- Modalidades normalizadas en una única capa de dominio.
- Agenda con cronología, modalidad y ubicación presencial validadas.
- IRI con mediciones objetivas obligatorias y sin convertir ausencias en cero.
- Biblioteca con índice de búsqueda insensible a tildes y límite de resultados.
- Autosave de sesiones con debounce, flush previo y montaje idempotente.
- Formularios operables por teclado mediante eventos `submit` y validación nativa.
- Check-ins y hábitos con la misma semántica de formulario accesible.
- Service Worker con caché diferenciada, APIs/autenticación siempre fuera de caché.
- Ajustes de legibilidad, densidad, responsive y controles móviles.

## Ejecución

```bash
npm test
npm run build:rc19
npm run qa:visual:rc19
npm run qa:integrated:rc19
npm run audit:rc19
npm run validate:rc19
```

Las dos pruebas de navegador se ejecutan como comandos separados. `validate:rc19` verifica sus informes sellados y vuelve a ejecutar tests, build, grafo y gate estructural.

## Bloqueos externos

1. Comparar de forma autenticada las 52 definiciones remotas de Supabase.
2. Probar con las cuentas QA reales Coach y Cliente.
3. Validar iPhone, Android y tablet físicos.
4. Desplegar en `m26-canary.iberfit.cl`, observar y ensayar rollback M25.1.

Hasta cerrar esos gates, `deployable=false`.
