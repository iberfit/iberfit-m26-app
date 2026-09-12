# IBERFIT · Website State

Última verificación: 2026-09-02

## Repositorios

### `iberfit/iberfitweb`

- activo: sí;
- archivado: no;
- visibilidad: public;
- rama por defecto: `main`;
- HEAD observado: `d716156e127ff0cc3acd325f36b319618cb700c0`;
- commit: `source repo import` por `cloudflare[bot]`;
- fecha: 2026-06-22.

### `iberfit/iberfit-web`

- archivado: sí;
- tratar como histórico y no reactivar automáticamente.

### `iberfit/iberfit-assets`

- activo;
- no archivado;
- conservar como fuente de assets hasta auditar relación exacta con la web live.

## Hallazgo crítico de fuente

La Home de `iberfit.cl` verificada el 2026-09-02 **no coincide** con `iberfit/iberfitweb@main`.

Ejemplos:

- el repositorio `main` contiene un hero con texto `Un método premium para entrenar...` y CTA `Agenda tu Diagnóstico IBERFIT IRI`;
- LIVE contiene `Evaluamos tu punto de partida...` y una estructura distinta con secciones `Acompañamiento real`, `El Sistema IBERFIT`, `Qué recibes`, `El criterio en acción` y testimonios Google;
- LIVE muestra actualmente el precio del Diagnóstico IRI: `$30.000` y que puede bonificarse al contratar un plan mensual;
- LIVE usa el posicionamiento `Diagnóstico, planificación, control y seguimiento dentro de una misma experiencia`.

Conclusión: **no modificar ni desplegar `iberfitweb/main` suponiendo que reproduce la web actual**. Antes hay que localizar/exportar la fuente exacta del LIVE actual o reconstruirla de forma verificable desde el artefacto desplegado.

## Estado de LIVE observado

Home accesible en `https://iberfit.cl/`.

Navegación observada:

- Inicio;
- Diagnóstico IRI;
- Método;
- Presencial;
- Híbrido;
- Online;
- Sobre IBERFIT;
- Contacto;
- ES / EN;
- CTA WhatsApp.

Contenido comercial observado:

- propuesta central clara;
- explicación del sistema en 4 decisiones: Diagnóstico, Planificación, Ejecución y control, Seguimiento;
- explicación del Informe IRI;
- modalidades Presencial/Híbrida/Online;
- testimonios Google;
- CTA final a Diagnóstico IRI;
- valor IRI $30.000 con posible bonificación.

## Riesgo

P1 de gobernanza web: fuente desplegada y fuente Git conocida están divergentes. Cualquier cambio directo en `iberfitweb/main` podría sobrescribir una versión LIVE más avanzada.

## Siguiente acción exacta

1. identificar en Cloudflare Pages cuál es el proyecto que sirve `iberfit.cl` y su source/deployment actual;
2. recuperar SHA/artefacto/fuente del deploy LIVE;
3. comparar con `iberfitweb` y cualquier rama/source snapshot;
4. crear una rama web desde la fuente LIVE real;
5. recién entonces continuar CRO/SEO/diseño y trabajo pendiente.
