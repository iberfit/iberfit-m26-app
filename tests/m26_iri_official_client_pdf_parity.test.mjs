import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const renderer=()=>fs.readFileSync(new URL('../supabase/functions/iberfit-iri-report-emission-v1/index.ts',import.meta.url),'utf8');

test('official Client PDF has a dedicated premium editorial renderer',()=>{
  const source=renderer();
  assert.match(source,/function renderClientPdf/u);
  assert.match(source,/if\(audience==='cliente'\)return renderClientPdf/u);
  assert.match(source,/const TEMPLATE_VERSION='m26-iri-report-premium-v4'/u);
  assert.match(source,/page\.drawText\('Tu punto'/u);\n  assert.match(source,/page\.drawText\('de partida\.'/u);
  assert.match(source,/Movimiento y movilidad/u);
  assert.match(source,/Capacidad de esfuerzo/u);
  assert.match(source,/Qué merece atención/u);
  assert.match(source,/Qué repetiremos para saber si mejoras/u);
  assert.match(source,/Tu punto de partida queda documentado/u);
});

test('official Client PDF keeps human ratings separate from normative comparability',()=>{
  const source=renderer();
  assert.match(source,/pdfClientAreaMetric\(page,fonts,'Movimiento y movilidad',ratings\.movement/u);
  assert.match(source,/pdfClientAreaMetric\(page,fonts,'Fuerza',ratings\.strength/u);
  assert.match(source,/pdfClientAreaMetric\(page,fonts,'Recuperación',ratings\.recovery/u);
  assert.match(source,/COMPARABILIDAD NORMATIVA/u);
  assert.match(source,/No se presenta una nota global cuando la cobertura normativa es parcial/u);
  assert.match(source,/baremo compatible/u);
  assert.match(source,/valoración orientativa/u);
  assert.match(source,/referencia individual/u);
});

test('official Client PDF preserves privacy, evidence and longitudinal comparability',()=>{
  const source=renderer();
  assert.match(source,/PRIVACIDAD DE LAS IMÁGENES/u);
  assert.match(source,/no existe permiso específico para publicarlas/u);
  assert.match(source,/El archivo original se incorpora íntegro al final de este informe emitido/u);
  assert.match(source,/Qué repetiremos para saber si mejoras/u);
  assert.match(source,/esta página no puntúa resultados/u);
  assert.match(source,/appendExternal\(pdf,externalBytes,annex\)/u);
});

test('Coach/Admin renderer remains on the deterministic technical path',()=>{
  const source=renderer();
  assert.match(source,/audience==='cliente'\?'Diagnóstico inicial IRI':'Dossier técnico IRI'/u);
  assert.match(source,/Cribado y condiciones relevantes/u);
  assert.match(source,/Protocolos registrados/u);
  assert.match(source,/pdf-lib\/deterministic-v1/u);
});
