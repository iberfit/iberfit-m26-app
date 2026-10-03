import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=(path)=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');

test('informe IRI inicial no consulta ni inyecta historial iriAssessments',()=>{
  const workflow=read('src/m26/app/workflow-controller.js');
  assert.doesNotMatch(workflow,/confirmedIriHistoryForReport/u);
  assert.doesNotMatch(workflow,/longitudinalHistory/u);
  assert.match(
    workflow,
    /openIriReportPrint\(\{\.\.\.reportContext\(draft\),variant,externalReport,photogrammetryReport,printTarget\}\)/u
  );
});

test('el contrato del informe representa la referencia inicial y es independiente del motor longitudinal',()=>{
  const report=read('src/m26/workflows/iri-report-document.js');
  assert.doesNotMatch(report,/from '.\/iri-2-longitudinal\.js'/u);
  assert.doesNotMatch(report,/longitudinalHistory/u);
  assert.match(report,/referencia inicial/u);
  assert.match(report,/seguimiento y la evolución se registran por separado/u);
});

test('longitudinal comparison remains a separate follow-up capability rather than report input',()=>{
  const longitudinal=read('src/m26/workflows/iri-2-longitudinal.js');
  assert.match(longitudinal,/buildEvolutionProfile/u);
  assert.match(longitudinal,/EVOLUTION_FOLLOWUP_KIND/u);
  assert.match(longitudinal,/function protocolKey/u);
  assert.match(longitudinal,/function comparable/u);
  const report=read('src/m26/workflows/iri-report-document.js');
  assert.doesNotMatch(report,/buildEvolutionProfile|buildIri2LongitudinalProfile|iri2ComparisonSummary/u);
});


test('workflow and report routes reject explicit reevaluation rows as IRI report sources',()=>{
  const workflow=read('src/m26/app/workflow-controller.js');
  const routeVm=read('src/m26/modules/route-view-model.js');
  assert.match(workflow,/type==='inicial'/u);
  assert.match(routeVm,/area === 'informes'[\s\S]*type==='inicial'/u);
});
