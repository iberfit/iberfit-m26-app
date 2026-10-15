import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {buildEvolutionReportHtml,openEvolutionReportPreview} from '../src/m26/workflows/evolution-report-document.js';

const basic={
  id:'weekly',ready:true,periodStart:'2026-10-09',periodEnd:'2026-10-15',
  title:'Resumen semanal',summary:'Tres sesiones confirmadas.',
  conclusions:'Actividad confirmada sin inferencias clínicas.',
  recommendations:'Revisar la siguiente semana con el coach.',
  evidence:[{label:'Entrenamientos',text:'3 confirmados',source:'sessionExecutions',quality:'confirmada'}],
  sourceType:'session_execution_period',
};
test('M44 premium document has a true A4 cover, evidence and professional interpretation',async()=>{
  const html=buildEvolutionReportHtml({report:basic,clientName:'Cliente sintético',coachName:'Equipo de prueba'});
  assert.equal((html.match(/class="m44-sheet /g)||[]).length,4);
  assert.match(html,/m44-cover/);
  assert.match(html,/BORRADOR PRIVADO/);
  assert.match(html,/Resultados verificables/);
  assert.match(html,/Decidir el siguiente paso/);
  assert.match(html,/Revisión profesional/);
  assert.match(html,/3 confirmados/);
  const css=await readFile(new URL('../public/m26/evolution-report.css',import.meta.url),'utf8');
  assert.match(css,/@page\{size:A4;margin:0\}/);
  assert.match(css,/height:297mm/);
  assert.match(css,/Source Serif 4 Variable/);
  assert.match(css,/@media print/);
});
test('M44 privacy: never presents draft as issued, approved, or delivered',()=>{
  const html=buildEvolutionReportHtml({report:basic});
  assert.match(html,/previsualización; no confirma aprobación, publicación ni entrega/);
  assert.doesNotMatch(html,/Documento publicado|Informe emitido y archivado/);
  assert.match(html,/data-m44-print disabled/);
});
test('M44 protects preview from HTML and script injection, including user-entered coach notes',()=>{
  const html=buildEvolutionReportHtml({report:{...basic,summary:'<script>alert(1)</script>',coachComment:'<img src=x onerror=alert(1)>',evidence:[{label:'<b>Etiqueta</b>',text:'<svg onload=alert(1)>',source:'sessionExecutions'}]},clientName:'</title><script>alert(2)</script>'});
  assert.doesNotMatch(html,/<script>|<svg onload|<img src=x onerror/);
  assert.match(html,/&lt;script&gt;/);
  assert.match(html,/&lt;svg onload/);
  assert.match(html,/&lt;img src=x/);
});
test('M44 rejects insufficient evidence, wrong reporting windows, unknown type and untrusted CSS',()=>{
  assert.throws(()=>buildEvolutionReportHtml({report:{...basic,evidence:[]}}),/EVIDENCE_REQUIRED/);
  assert.throws(()=>buildEvolutionReportHtml({report:{...basic,id:'iri'}}),/EVIDENCE_REQUIRED/);
  assert.throws(()=>buildEvolutionReportHtml({report:{...basic,periodStart:'2026-10-16'}}),/PERIOD_INVALID/);
  assert.throws(()=>buildEvolutionReportHtml({report:basic,stylesheetHref:'https://malicious.test/payload.css'}),/STYLESHEET_UNTRUSTED/);
});
test('M44 long evidence is paginated without hiding items',()=>{
  const evidence=Array.from({length:9},(_,i)=>({label:'Indicador '+i,text:'Valor confirmado '+i,source:'sessionExecutions'}));
  const html=buildEvolutionReportHtml({report:{...basic,evidence}});
  assert.equal((html.match(/class="m44-sheet /g)||[]).length,5);
  assert.match(html,/Indicador 8/);
  assert.match(html,/5 \/ 5/);
});
test('M44 popup guard fails safely when no browser origin is available',()=>{
  assert.throws(()=>openEvolutionReportPreview({report:basic,scope:{}}),/ORIGIN_REQUIRED/);
});

test('M44 evidence appendix numbering remains continuous across pages',()=>{
  const evidence=Array.from({length:9},(_,i)=>({label:'Resultado '+i,text:'Evidencia '+i,source:'sessionExecutions'}));
  const html=buildEvolutionReportHtml({report:{...basic,evidence}});
  assert.match(html,/m44-evidence-number">07<\/div>/u);
  assert.match(html,/m44-evidence-number">09<\/div>/u);
});
test('M44 validation checks page content overflow beyond the visible footer',async()=>{
  const source=await readFile(new URL('../src/m26/workflows/evolution-report-document.js',import.meta.url),'utf8');
  assert.match(source,/content\.scrollHeight/u);
  assert.match(source,/content\.clientHeight/u);
});

test('M44 validates the actual print-size layout even from a mobile preview',async()=>{
  const source=await readFile(new URL('../src/m26/workflows/evolution-report-document.js',import.meta.url),'utf8');
  const css=await readFile(new URL('../public/m26/evolution-report.css',import.meta.url),'utf8');
  assert.match(source,/async function verifyA4Layout/);
  assert.match(source,/max-width: 825px/);
  assert.match(source,/frame\.contentDocument/);
  assert.match(source,/target\.importNode\(page,true\)/);
  assert.match(source,/await verifyA4Layout\(doc,popup,scope\)/);
  assert.match(css,/\.m44-layout-preflight/);
});


test('M44 dated activity timeline has a grounded chart, a readable table and five A4 pages',()=>{
  const activitySeries=[
    {from:'2026-10-09',to:'2026-10-10',count:1},
    {from:'2026-10-11',to:'2026-10-12',count:0},
    {from:'2026-10-13',to:'2026-10-15',count:2},
  ];
  const html=buildEvolutionReportHtml({report:{...basic,activitySeries}});
  assert.equal((html.match(/class="m44-sheet /g)||[]).length,5);
  assert.match(html,/El ritmo del periodo/);
  assert.match(html,/Detalle accesible del ritmo de entrenamiento/);
  assert.match(html,/El eje vertical empieza en cero/);
  assert.match(html,/periodos sin registros se muestran como cero sesiones/);
  assert.match(html,/5 \/ 5/);
});


test('M44 client publication view has a different legal label and no private coach notes',()=>{
  const html=buildEvolutionReportHtml({report:basic,publicationStatus:'published'});
  assert.match(html,/CONSULTA DE INFORME PUBLICADO EN PLATAFORMA/);
  assert.match(html,/No constituye por sí sola un artefacto PDF firmado o archivado/);
  assert.doesNotMatch(html,/BORRADOR PRIVADO/);
  assert.doesNotMatch(html,/LA MIRADA DE TU COACH/);
});
