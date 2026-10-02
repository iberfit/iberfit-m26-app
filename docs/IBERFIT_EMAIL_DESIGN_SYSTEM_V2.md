# IBERFIT Email Design System V2

Estado: referencia canónica para Hosted Auth y correos transaccionales de IBERFIT.

## Principios

IBERFIT debe sentirse premium, profesional, humano, sobrio, elegante, deportivo y tecnológico. Los correos no son piezas SaaS genéricas ni publicidad de gimnasio.

Paleta canónica:
- Forest: #0B1310
- Gold: #C5A059
- Gold light: #D7BA7C
- Cream canvas: #F3EEE3
- Paper: #FFFDF8
- Ink: #15271E
- Secondary text: #46584E
- Muted: #718078

Tipografía:
- Títulos editoriales: Georgia, Times New Roman, serif.
- Interfaz/cuerpo/CTA: Arial, Helvetica, sans-serif.
- No depender de web fonts para evitar degradaciones en Gmail, Outlook y Apple Mail.

## Tres densidades

1. Editorial
   - Solo invitación/bienvenida.
   - Puede usar hero fotográfico IBERFIT aprobado.
   - Incluye metodología Diagnóstico / Planificación / Control / Seguimiento.

2. Action
   - Confirmación, recuperación y cambio de correo.
   - Sin hero.
   - Una acción primaria inequívoca.
   - Mensaje de seguridad visible y breve.

3. Code / Notice
   - OTP/reauthentication: código grande y legible, sin hero.
   - Notificaciones de seguridad: compactas, sin CTA falso ni enlaces inventados.

## Hero de bienvenida

- Asset aprobado actual: `/public/iberfit/email/access-hero-v3-c3a8345b.jpg`.
- SHA-256 aprobado: `c3a8345b4b91cb4e1c52bd5504803a66230555ee22929a2e6182028303515f50`.
- Los assets visuales de email son inmutables: si cambia el contenido, debe cambiar el filename/fingerprint. No reutilizar URLs ya enviadas.
- Debe ser una pieza visual IBERFIT aprobada, no stock/genérico fitness.
- Sin texto rasterizado.
- El isotipo oficial de cabecera se carga desde `/public/iberfit-email-isotipo.png`.
- Objetivo de render: 620 px de ancho y aproximadamente 170 px de alto.
- JPEG baseline RGB, <=500 KB.

## Reglas UX

- Una acción primaria por correo.
- CTA dorado con texto verde oscuro.
- Títulos cortos y claros.
- No usar hero en flujos donde retrase la lectura de código o acción.
- No introducir métricas, claims o enlaces que el flujo no soporte.
- El email debe entenderse sin imágenes; las imágenes sólo refuerzan marca.
- Responsive desde 320 px.
- Mantener variables Supabase exactamente según el manifest.

## Criterio de calidad

Una plantilla no está terminada porque compile. Debe pasar:
- contrato de variables y URLs;
- validación binaria de assets;
- build canónico;
- Hosted Auth sync;
- preview;
- verificación real en Gmail/Outlook/Apple Mail cuando corresponda;
- no regresión de claridad, accesibilidad y seguridad.
