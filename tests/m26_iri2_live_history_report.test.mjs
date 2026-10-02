import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=(path)=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');

test('baseline IRI report never queries or injects iriAssessments history',()=>{
  const workflow=read('src/m26/app/workflow-controller.js');
  assert.doesNotMatch(workflow,/confirmedIriHistoryForReport/u);
  assert.doesNotMatch(workflow,/longitudinalHistory/u);
  assert.match(
    workflow,
    /openIriReportPrint\(\{\.\.\.reportContext\(draft\),variant,externalReport,printTarget\}\)/u
  );
});

test('report document contract is baseline-only and independent from longitudinal engine',()=>{
  const report=read('src/m26/workflows/iri-report-document.js');
  assert.doesNotMatch(report,/from '.\/iri-2-longitudinal\.js'/u);
  assert.doesNotMatch(report,/longitudinalHistory/u);
  assert.match(report,/Baseline inicial/u);
  assert.match(report,/seguimiento longitudinal se mantiene fuera del Diagnóstico IRI/u);
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
