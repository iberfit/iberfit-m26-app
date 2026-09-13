# IBERFIT Dark Premium V2

Estado: activo como capa visual final del producto autenticado.

## Objetivo

Consolidar una identidad IBERFIT propia: verde-negro profundo, superficies bosque/grafito, texto marfil y dorado reservado para valor, selección y marca. El sistema evita tanto el SaaS negro/neón genérico como el workspace crema que fragmentaba la experiencia entre navegación y contenido.

## Principios

- **Canvas**: verde-negro profundo, nunca negro puro.
- **Superficies**: bosque/grafito con diferencias pequeñas pero claras de elevación.
- **Texto**: marfil cálido para primer nivel; gris verdoso claro para segundo nivel.
- **Dorado**: marca, selección, focos de valor y señalización; no relleno masivo.
- **Acción primaria**: verde funcional profundo con texto marfil.
- **Estados**: éxito, atención, riesgo e información tienen color funcional independiente.
- **Contraste**: WCAG 2.2 AA como mínimo.
- **Densidad por rol**: Cliente más respirado, Coach operativo, Admin compacto.
- **Dispositivo por contexto**: desktop construye/analiza; tablet entrena/opera; móvil actúa.

## Orden de capas

`tokens.css` sigue siendo la fuente generada desde `tokens.json`.
`brand-vision.css` conserva compatibilidad histórica.
`dark-iberfit-v2.css` se carga al final y define el contrato visual final de superficies autenticadas.

## No altera

Auth, permisos, RLS, datos, comandos, rutas ni lógica de negocio.
