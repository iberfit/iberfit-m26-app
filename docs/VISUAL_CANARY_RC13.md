# IBERFIT M26 · RC13 Visual Canary

RC13 introduces executable browser QA for the visual and responsive layer without changing production.

## Browser matrix

Fifteen deterministic views are generated from the real M26 renderers and inspected in system Chromium:

- Coach: Hoy, Clientes, Expediente, Progreso, Actividad, Notas privadas and Verificación with conflicts.
- Cliente: Hoy, Progreso and Actividad.
- Sessions: builder desktop/mobile, active execution, paused execution and feedback.
- Sizes: 390×844, 768×1024, 820×1180 and 1440×960.

## Blocking assertions

Every view must satisfy all of the following:

- no horizontal document overflow;
- no visible element outside the viewport;
- every visible button, input, select and textarea is at least 44×44 px;
- no duplicate IDs;
- no unnamed button or unlabeled form control;
- no broken image;
- visible focus outline of at least 2 px;
- correct desktop/mobile navigation mode;
- DOM below the agreed budget;
- local render below the performance budget;
- no browser console or page errors.

The report and screenshots are stored in `recovery/RC13_VISUAL_QA_REPORT.json` and `qa/rc13_visual_artifacts/`.

## Aesthetic correction from the first run

The first screenshots showed overly tall single-column metric cards on narrow phones. RC13 changes only the mobile metric presentation to a compact two-column layout with reduced card height. The corrected views were rerun and remained free of overflow at 390 px.

## Contrast

The premium dark-green, cream and gold palette is now audited mathematically. Primary, secondary, muted, gold, danger and success combinations all meet WCAG AA for normal text against their intended dark surfaces.

## Limits

This browser pass uses deterministic rendered states and system Chromium. It does not replace authenticated tests against Supabase, Safari/iOS hardware, Android hardware or a production canary. The Supabase read-only preflight was attempted but the connector was disabled; no remote change occurred.
