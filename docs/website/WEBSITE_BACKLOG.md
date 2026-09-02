# IBERFIT · Website Backlog

## P0/P1 · Fuente y despliegue

- [ ] Identificar proyecto Cloudflare Pages exacto que sirve `iberfit.cl`.
- [ ] Obtener deployment id / fecha / source SHA o snapshot del LIVE actual.
- [ ] Evitar cualquier deploy desde `iberfitweb/main` hasta reconciliar divergencia con LIVE.
- [ ] Crear backup/snapshot reproducible de la fuente LIVE antes de editar.
- [ ] Definir repositorio y rama canónicos de la web después de reconciliar.

## P1 · Auditoría funcional

- [ ] comprobar todos los enlaces y CTA WhatsApp;
- [ ] comprobar formulario/contacto si existe;
- [ ] comprobar `mailto:`;
- [ ] comprobar ES/EN y hreflang/canonical;
- [ ] comprobar 404/redirects;
- [ ] comprobar privacidad/cookies;
- [ ] revisar navegación móvil;
- [ ] medir Core Web Vitals y tamaño de assets;
- [ ] revisar accesibilidad.

## P1 · CRO

- [ ] instrumentar `click_whatsapp`, `view_iri`, `start_contact`, `submit_contact`, `book_iri`;
- [ ] definir una conversión primaria;
- [ ] medir Home -> IRI -> WhatsApp;
- [ ] revisar si el precio IRI visible ayuda o reduce conversión de leads cualificados;
- [ ] reforzar prueba social y casos verificables;
- [ ] mejorar continuidad entre CTA y guion de WhatsApp;
- [ ] comprobar experiencia móvil de CTA sticky/sin interferencias.

## P1/P2 · SEO

- [ ] recuperar datos actuales de Search Console;
- [ ] revisar sitemap/robots/indexación;
- [ ] comprobar páginas locales existentes y evitar doorway pages;
- [ ] mapear keyword -> intención -> página;
- [ ] revisar titles/descriptions/canonicals/schema;
- [ ] comparar páginas que reciben impresiones con las que convierten;
- [ ] reforzar entidad local IBERFIT y Google Business.

## P2 · Contenido

- [ ] consolidar Método IBERFIT sin duplicación;
- [ ] hacer tangible el IRI con ejemplo pedagógico y límites claros;
- [ ] explicar Híbrido frente a Presencial/Online;
- [ ] casos/resultados con consentimiento;
- [ ] contenido experto derivado de preguntas reales de clientes;
- [ ] evitar artículos genéricos fabricados para SEO.

## P2 · Diseño

- [ ] usar logotipo/isotipo real de IBERFIT;
- [ ] preservar verde oscuro/dorado/crema;
- [ ] revisar fotografía/imaginería para evitar apariencia stock/IA;
- [ ] sistema de espaciado/tipografía/componentes coherente;
- [ ] optimizar móvil primero;
- [ ] elevar percepción premium sin sacrificar velocidad.

## P3 · Experimentación

- [ ] A/B de mensaje principal sólo tras disponer de tracking fiable;
- [ ] CTA `Solicitar IRI` vs `Hablar con IBERFIT` según intención;
- [ ] landing por modalidad/caso de uso si existe demanda real;
- [ ] integración de reserva sólo si reduce fricción frente a WhatsApp.
