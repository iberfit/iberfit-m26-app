import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const render=fs.readFileSync('src/m26/admin/route-render.js','utf8');
const controller=fs.readFileSync('src/m26/admin/controller.js','utf8');

function clientEditFormSource(){
  const match=render.match(/data-admin-form="client-profile-update"[\s\S]*?<\/form>/u);
  assert.ok(match,'client profile update form must exist');
  return match[0];
}

test('Admin client editor requires explicit missing modality and IRI decisions',()=>{
  const form=clientEditFormSource();
  assert.match(form,/data-guided-required-form/u);
  assert.match(form,/name="modality" required><option value="">Seleccionar modalidad/u);
  assert.match(form,/name="initialAssessmentMode" required><option value="">Seleccionar situación del IRI/u);
  assert.match(form,/data-guided-required-progress/u);
});

test('Admin profile update never replaces an absent IRI choice with an implicit value',()=>{
  const start=controller.indexOf("if(kind==='client-profile-update')");
  const end=controller.indexOf("if(kind==='client-create')",start);
  assert.ok(start>=0&&end>start);
  const block=controller.slice(start,end);
  assert.match(block,/initialAssessmentMode:text\(data,'initialAssessmentMode',30\),/u);
  assert.doesNotMatch(block,/initialAssessmentMode:text\(data,'initialAssessmentMode',30\)\|\|'iri'/u);
});

test('Admin editor directs an incomplete record to the first required missing field',()=>{
  assert.match(controller,/focusFirstNeededControl/u);
  assert.match(controller,/focusFirstNeededControl\(ready\.form,\{requiredOnly:true\}\)/u);
});
