# IBERFIT M26 · RC71.2 · Social consent, notifications and i18n foundation

## Objetivo

Cerrar la arquitectura de preferencias de experiencia sin activar comportamientos que todavía no existen en backend.

## Social

- Privado por defecto.
- Consentimiento explícito por cuenta autenticada.
- Alcance permitido actualmente: solo yo o Coach.
- Resumen de sesión e hitos requieren opt-in.
- Publicación automática permanece bloqueada.
- Ranking público permanece bloqueado.
- Peso, IMC, dolor, IRI, notas privadas y datos clínicos no se convierten en contenido social.

## Avisos

Se registran preferencias granulares para:

- próxima sesión;
- cambios de agenda;
- plan publicado;
- mensajes del Coach;
- retos;
- hitos.

Estas preferencias son consentimiento, no una afirmación de que exista push real. Los avisos esenciales de conflicto/sincronización permanecen visibles dentro de la app.

## Idioma y región

Se separan dos conceptos:

- `language`: idioma de los textos;
- `locale`: formato regional de fechas, números y unidades.

Catálogo arquitectónico:

- Español;
- English;
- Deutsch;
- Français;
- Português.

Solo se expone un idioma cuando su bundle está completo. En RC71.2 Español permanece como único idioma seleccionable; English/Deutsch/Français/Português quedan declarados pero incompletos. Los locales previstos ya están modelados para una habilitación futura.

## Privacidad

Las preferencias sociales y de avisos usan storage con scope por identidad autenticada para impedir que otra cuenta del mismo navegador herede el consentimiento.

## No incluido

- push notifications reales;
- publicación social remota;
- leaderboard público;
- pagos;
- traducciones incompletas.

## Próximos gates de lanzamiento

1. Completar bundles de traducción antes de exponer cada idioma.
2. Cerrar los tres fallos históricos del test suite.
3. QA de recorrido Cliente / Coach / Admin.
4. Hardening auth/RLS y privacidad.
5. Offline/sync/recovery extremo.
6. QA móvil/PWA y release candidate.
