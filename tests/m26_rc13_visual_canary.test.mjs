import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {auditPaletteContrast} from '../src/m26/ui/design-system.js';

const root=new URL('..',import.meta.url);
const readJson=(relative)=>JSON.parse(fs.readFileSync(new URL(relative,root),'utf8'));
const sha=(relative)=>crypto.createHash('sha256').update(fs.readFileSync(new URL(relative,root))).digest('hex');

test('isotipo publicado existe y coincide con el activo protegido',()=>{
  assert.equal(fs.existsSync(new URL('public/isotipo-iberfit.png',root)),true);
  assert.equal(sha('public/isotipo-iberfit.png'),sha('baseline_m25_2/public/isotipo-iberfit.png'));
});

test('informe visual RC13 aprueba las quince vistas',()=>{
  const report=readJson('recovery/RC13_VISUAL_QA_REPORT.json');
  assert.equal(report.case_count,15);assert.equal(report.passed,15);assert.equal(report.failed,0);
  assert.ok(report.results.every((item)=>item.ok&&item.errors.length===0));
});

test('browser QA confirma overflow, foco, etiquetas e imágenes',()=>{
  const report=readJson('recovery/RC13_VISUAL_QA_REPORT.json');
  for(const item of report.results){
    const m=item.metrics;assert.equal(m.horizontalOverflow,false,item.case.name);assert.deepEqual(m.overflowingElements,[],item.case.name);
    assert.deepEqual(m.smallTargets,[],item.case.name);assert.deepEqual(m.duplicateIds,[],item.case.name);assert.equal(m.unnamedButtons,0,item.case.name);
    assert.equal(m.unlabeledControls,0,item.case.name);assert.deepEqual(m.brokenImages,[],item.case.name);assert.equal(m.mainPresent,true,item.case.name);
    assert.notEqual(m.focusOutline?.style,'none',item.case.name);assert.ok(Number.parseFloat(m.focusOutline?.width)>=2,item.case.name);
  }
});

test('capturas y hoja de contacto forman parte del artefacto',()=>{
  const report=readJson('recovery/RC13_VISUAL_QA_REPORT.json');
  assert.ok(fs.statSync(new URL(report.contact_sheet,root)).size>10_000);
  for(const item of report.results)assert.ok(fs.statSync(new URL(item.screenshot,root)).size>5_000,item.case.name);
});

test('matriz de casos cubre roles y sesiones críticas',()=>{
  const cases=readJson('qa/rc13_visual_cases.json');const keys=new Set(cases.map((item)=>`${item.role}:${item.route}`));
  for(const key of ['coach:hoy','coach:actividad','coach:notas','coach:verificacion','client:hoy','client:progreso','client:actividad','coach:builder','client:execution','client:paused','client:feedback'])assert.ok(keys.has(key),key);
});

test('paleta RC13 conserva contraste AA',()=>{assert.equal(auditPaletteContrast().ok,true);});

test('preflight remoto fue solo lectura y no modificó producción',()=>{
  const status=readJson('recovery/RC13_REMOTE_PREFLIGHT_STATUS.json');
  assert.equal(status.mode,'read_only');assert.equal(status.production_modified,false);assert.equal(status.engagement_extension_installed,false);assert.equal(status.catalog_remote_validated,false);
});
