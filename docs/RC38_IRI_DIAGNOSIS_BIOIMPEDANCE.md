# RC38 · Diagnóstico IRI con bioimpedancia integrada

RC38 conserva el contrato privado de documentos externos de RC37 y presenta el informe de bioimpedancia como documento complementario dentro del Diagnóstico IRI Cliente.

## Producto

- App Cliente → Informes muestra un único bloque documental para el Diagnóstico IRI confirmado.
- La bioimpedancia visible incluye solo nombre original, formato, fecha de subida y versión.
- PDF, JPEG y PNG se abren en un visor accesible dentro de la aplicación; la URL firmada se solicita al pulsar y se renueva en cada nuevo acceso.
- El PDF IRI Cliente contiene un hipervínculo real a `https://m26-canary.iberfit.cl/?area=informes&assessmentId=<uuid>&open=bioimpedancia` únicamente cuando el registro es visible y corresponde a la evaluación confirmada.
- Coach y Admin conservan la carga, reemplazo y reintento de registro de RC37. Cliente permanece en solo lectura.

## Seguridad

- La ruta estable no acepta `clientId`, `objectPath`, bucket, token, correo ni redirección.
- El `assessmentId` debe ser UUID, visible para la identidad autenticada y corresponder a una evaluación confirmada.
- Un destino pendiente existe solo en memoria hasta completar el login y se elimina antes de resolverlo.
- Las URL firmadas no se guardan en almacenamiento local, no se imprimen y no forman parte del service worker.
- La política CSP limita visor e imágenes al origen Supabase canónico `pjhmrhejsoofmouedavw.supabase.co`.
- No se añade ninguna migración ni se modifica el contrato Supabase RC37.

## Release

- Versión: `26.0.0-canary.38-iri-diagnosis-bioimpedance`
- Release: `IBERFIT_M26_CANARY_RC38_IRI_DIAGNOSIS_BIOIMPEDANCE`
- Service worker: `m26-rc38-iri-diagnosis-bioimpedance-canary-v4`
- Rama: `canary/rc38`
- Destino exclusivo: `https://m26-canary.iberfit.cl`

La validación local completa se ejecuta con `npm run validate:rc38:ci`. La evidencia se escribe en `recovery/RC38_*.json` y no contiene credenciales ni documentos QA.

El presupuesto JavaScript RC38 es 850.000 bytes. El aumento acotado de 30.000 bytes sobre el presupuesto histórico cubre el visor, la continuación autenticada y la integración documental; los releases anteriores conservan su límite de 820.000 bytes.
