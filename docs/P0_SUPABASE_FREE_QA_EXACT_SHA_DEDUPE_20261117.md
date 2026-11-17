# IBERFIT P0 · Supabase Free · deduplicación QA exact-SHA sin pérdida de certificación

**Base auditada:** Canary `586062e4be137a04296ebdaa8b83ce8b0fcd1112`, posterior a #1363. **Ámbito:** GitHub Actions `qa-real-write-cert.yml`; QA remoto y PROD sin cambios.

## Hallazgo real

`priorQaRunCanSubstitute` consideraba suficiente `some(job.conclusion === 'success')`. Una ejecución anterior con solo 1/5 trabajos auténticos aprobados, o todavía en curso, podía suprimir la siguiente ejecución del mismo SHA. Si los cuatro restantes fallaban/se omitían, se perdía cobertura real de persistencia, RLS avatar, Connected360 y Coach–Cliente. Esto no era una certificación segura.

## Corrección

La deduplicación se permite **únicamente** cuando el run anterior corresponde al mismo SHA, rama, evento PR y workflow, es anterior al actual, terminó `success` y contiene **exactamente uno de cada uno** de los cinco trabajos requeridos con `status=completed` y `conclusion=success`. Todo estado parcial, pendiente, fallido, cancelado, duplicado o ambiguo **ejecuta** la certificación completa.

La consulta inicial descarta runs incompletos antes de buscar jobs, ahorrando tráfico a GitHub. Los tests cubren los cinco jobs, parcialidades, cancelaciones, duplicados, in-progress, cambios de SHA/rama, errores API y la permanencia de todos los jobs en el workflow.

**Integridad:** sin SQL, migraciones, RLS, datos, JWT, endpoints, PROD ni cambios al producto. No se tocan los límites de latencia, criterios de calidad ni pruebas autenticadas. **Rollback:** revert del squash único.

**Coste:** mantiene ahorro de ejecuciones duplicadas *ya certificadas*, evitando recortes inseguros. No se atribuye ahorro de egress facturable ni se cierra #1209 sin Usage oficial comparable.
