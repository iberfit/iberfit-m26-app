# IBERFIT M26 · RC9

Paquete acumulativo de recuperación offline y preparación de canario.

- Estado: no desplegable.
- Producción: no modificada.
- Pruebas: 88/88.
- Gates: 144/144.
- Ejercicios: 367 únicos.
- Capas M25 y M25.2: preservadas.

## Validación local

```text
npm test
npm run gate
```

El gate de recuperación compara M25 con el ZIP físico oficial, que debe encontrarse junto al directorio extraído con el nombre `IBERFIT_M25_CLOUDFLARE_PRODUCTION(1).zip`.

## QA autenticado

```text
npm run qa:authenticated
```

Requiere las variables descritas en `docs/AUTHENTICATED_CANARY_RUNBOOK_RC9.md`. No contiene credenciales.
