# IBERFIT · Website Master

Estado: consolidación pendiente de revalidar repositorio/live

## Objetivo

La web pública debe convertir demanda relevante en conversaciones y diagnósticos IRI. No es una versión pública de la app M26 ni debe compartir despliegues accidentalmente.

## Fuente técnica histórica

Una auditoría previa propuso:

- `iberfit/iberfitweb` como repositorio oficial de la web;
- `iberfit/iberfit-web` como duplicado histórico a archivar sin borrar inicialmente;
- `iberfit/iberfit-assets` como repositorio de assets a conservar/normalizar.

**No tratar esto como hecho actual hasta volver a consultar GitHub y comparar contra `iberfit.cl` live.**

## Propuesta de valor

Frase núcleo histórica:

> Entrenamiento personal con criterio: diagnóstico, planificación, control y seguimiento.

La web debe hacer tangible esa diferencia mediante:

1. problema/objetivo del cliente;
2. método IBERFIT;
3. Diagnóstico IRI;
4. modalidades Presencial / Híbrido / Online;
5. prueba/credibilidad/casos;
6. CTA claro a contacto/diagnóstico.

## Público prioritario histórico

Santiago, especialmente:

- Las Condes;
- Vitacura;
- Providencia;
- Lo Barnechea;
- Ñuñoa.

No llenar páginas con comunas sólo para SEO. Cada landing debe responder a una intención y oferta real.

## Deuda histórica a preservar

Auditorías previas detectaron como trabajo pendiente:

- unificar reglas comerciales;
- corregir residuo/CTA de IRI;
- eliminar redacción duplicada;
- revisar selector de idioma;
- verificar `mailto:`;
- no mezclar web pública con superficies sintéticas o App Cliente no aprobadas.

## Arquitectura de conversión deseada

`Google/SEO/RRSS/referral -> landing relevante -> confianza -> IRI -> WhatsApp/contacto -> diagnóstico agendado -> cliente`

## Páginas mínimas a evaluar

- Home;
- Método / IBERFIT;
- Diagnóstico IRI;
- Entrenamiento personal presencial;
- Entrenamiento híbrido;
- Entrenamiento online;
- Resultados / casos / testimonios con consentimiento;
- zonas/servicio local sólo donde aporte valor;
- contacto / WhatsApp;
- legal/privacidad/cookies según implementación.

No crear páginas hasta auditar las existentes.

## CRO

Cada página comercial debe tener:

- una intención principal;
- un CTA primario;
- microcopy que reduzca incertidumbre;
- prueba de confianza;
- tracking de eventos;
- móvil primero;
- carga rápida;
- sin claims clínicos o resultados garantizados.

Eventos sugeridos:

- `view_service`;
- `view_iri`;
- `click_whatsapp`;
- `start_contact`;
- `submit_contact`;
- `book_iri` cuando exista reserva medible.

## SEO

Priorizar intención comercial y local antes que volumen genérico:

- entrenador personal + zona;
- entrenamiento personal + objetivo;
- evaluación/diagnóstico de entrenamiento cuando exista demanda;
- modalidad híbrida/online;
- contenido experto que apoye la conversión.

Google Search Console fue activado históricamente y ya había impresiones en junio de 2026. Recuperar datos actuales antes de elegir keywords.

## Google Business

Dato histórico de julio de 2026: 108 vistas, 1 llamada, 2 visitas web y 3 interacciones. Es una base baja y con oportunidad clara de conversión; recuperar datos actuales antes de atribuir tendencia.

## Próxima acción

1. revalidar repositorios web;
2. inspeccionar `iberfit.cl` live;
3. comparar live vs repositorio;
4. extraer todo el trabajo aprobado de hilos/documentos históricos;
5. construir `WEBSITE_BACKLOG.md` priorizado por impacto comercial y riesgo;
6. implementar sobre rama separada de la web, nunca desde M26 por conveniencia.
