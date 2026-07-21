# RC17 · Validación integral de lanzamiento local

## Alcance

La validación RC17 recorre autenticación, bootstrap, roles, aislamiento por cliente, Command Bus, catálogo de comandos, IRI, planificación, agenda, sesión guiada, engagement, notas privadas, progreso, conflictos, recuperación offline, PWA, accesibilidad, responsive, seguridad de transporte, build y rollback protegido.

## Orquestación

`npm run gate` ejecuta `scripts/run_rc17_release_validation.mjs`. El orquestador evita cadenas anidadas de procesos de navegador y aplica tiempos máximos a cada proceso Node. Ejecuta las 167 pruebas, reconstruye el build, verifica el grafo y el registro, y recorre directamente las 18 familias de gates. Los informes visual e integrado sellados se validan por versión y resultado.

La QA de navegador completa permanece disponible mediante:

```bash
npm run qa:visual:rc17
npm run qa:integrated:rc17
```

## Criterio de aprobación

La versión falla de forma cerrada ante cualquier prueba fallida, gate incompleto, versión de informe distinta, módulo ausente, presupuesto excedido, alteración de las capas protegidas o discrepancia del catálogo.

## Resultado

- Pruebas: 167/167.
- Gates: 285/285 en 18 familias.
- Visual: 15/15.
- Integrada: 2/2.
- Producción modificada: no.
- Despliegue autorizado: no.
