# IBERFIT M26 RC31 — Estrategia de desarrollo y control

## Principio

RC31 será una versión integral de lanzamiento, pero se desarrollará mediante commits pequeños, auditables y reversibles.

## Secuencia de commits prevista

1. `docs(rc31): add launch audit and acceptance gates`
2. `test(rc31): add privacy and publication regression gates`
3. `fix(rc31): enforce appointment modality and proposal privacy`
4. `fix(rc31): normalize civil dates and shared status projections`
5. `feat(rc31): add guided evidence-based IRI foundation`
6. `feat(rc31): add body composition attachments and protected files`
7. `feat(rc31): structure planning cycles and editorial workflow`
8. `feat(rc31): complete exercise prescription model`
9. `feat(rc31): add visual exercise detail and catalog integrity`
10. `feat(rc31): rebuild evidence-linked reports`
11. `feat(rc31): improve wellbeing habits progress and AI context`
12. `style(rc31): apply global responsive design system`
13. `test(rc31): add authenticated A-B isolation and PWA gates`
14. `chore(rc31): seal launch candidate evidence`

## Reglas de commit

- Un objetivo funcional por commit.
- Test antes o junto con la corrección.
- No incluir artefactos generados innecesarios.
- No incluir claves.
- No hacer push hasta completar el bloque local correspondiente.
- No modificar producción.
