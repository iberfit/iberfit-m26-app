import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import {
  IBERFIT_DESIGN_TOKENS,
  M26_DESIGN_TOKENS,
  M26_PALETTE,
  auditPaletteContrast,
  contrastRatio,
} from '../src/m26/ui/design-system.js';

const read=(path)=>fs.readFileSync(path,'utf8').replace(/\r\n/g,'\n');
const tokensCss=read('src/m26/design/tokens.css');
const shellCss=read('src/m26/shell/shell.css');
const rc42Css=read('src/m26/rc42/rc42.css');
const adminCss=read('src/m26/admin/admin.css');
const indexHtml=read('public/m26/index.html');
const phoneXml=read('native/android-host/phone-app/src/main/res/values/iberfit_design_tokens.xml');
const wearXml=read('native/android-host/wear-app/src/main/res/values/iberfit_design_tokens.xml');
const foundation=read('docs/RC58_1_TOKEN_FOUNDATION.md');

test('RC58.1 usa una fuente canÃ³nica y generaciÃ³n reproducible',()=>{
  assert.equal(IBERFIT_DESIGN_TOKENS.version,'58.1.0');
  assert.equal(IBERFIT_DESIGN_TOKENS.meta.sourceOfTruth,true);
  const check=spawnSync(process.execPath,['scripts/generate_rc58_design_tokens.mjs','--check'],{
    cwd:process.cwd(),encoding:'utf8'
  });
  assert.equal(check.status,0,`${check.stdout}\n${check.stderr}`);
  assert.match(check.stdout,/RC58_DESIGN_TOKEN_GENERATION=CHECK_PASS/);
});

test('contrato RC12 conserva paleta y escala pÃºblica',()=>{
  assert.deepEqual(M26_PALETTE,{
    forest950:'#07150f',
    forest900:'#0d2419',
    forest800:'#143424',
    forest700:'#1d4933',
    cream100:'#f7f1e4',
    cream300:'#ddd4c1',
    muted:'#c8c0af',
    gold500:'#c8a65d',
    gold300:'#e4cd98',
    danger:'#d79a91',
    success:'#8bc7a2',
  });
  assert.deepEqual(M26_DESIGN_TOKENS.spacing,['0.25rem','0.5rem','0.75rem','1rem','1.5rem','2rem','3rem']);
  assert.equal(M26_DESIGN_TOKENS.touchTargetPx,44);
  assert.equal(auditPaletteContrast().ok,true);
});

test('tokens CSS preceden al shell y el shell consume aliases canÃ³nicos',()=>{
  const tokenPosition=indexHtml.indexOf('/src/m26/design/tokens.css');
  const shellPosition=indexHtml.indexOf('/src/m26/shell/shell.css');
  assert.ok(tokenPosition>0);
  assert.ok(shellPosition>tokenPosition);
  assert.match(tokensCss,/--iberfit-color-canvas:\s*#07150f/);
  assert.match(tokensCss,/--m26-forest-950:\s*var\(--iberfit-color-forest-950\)/);
  assert.match(shellCss,/--m26-forest-950:\s*var\(--iberfit-color-forest-950\)/);
  assert.match(shellCss,/--m26-serif:\s*var\(--iberfit-font-family-editorial\)/);
  assert.match(rc42Css,/--m26-touch-target:\s*var\(--iberfit-size-touch-target\)/);
  assert.match(adminCss,/--m26-admin:var\(--iberfit-color-role-admin-accent\)/);
});

test('mappings Android Phone y Wear derivan del mismo source',()=>{
  assert.equal(phoneXml,wearXml);
  assert.match(phoneXml,/name="iberfit_color_canvas">#FF07150F</);
  assert.match(phoneXml,/name="iberfit_touch_target">44dp</);
  assert.match(phoneXml,/name="iberfit_color_admin_accent">#FF31A898</);
});

test('data-viz foundation tiene seis series distintas y contraste visible',()=>{
  const palette=IBERFIT_DESIGN_TOKENS.color.dataViz;
  const series=[1,2,3,4,5,6].map((index)=>palette[`series${index}`]);
  assert.equal(new Set(series).size,6);
  for(const color of series){
    assert.ok(
      contrastRatio(color,IBERFIT_DESIGN_TOKENS.color.semantic.canvas)>=3,
      `${color} no alcanza contraste 3:1 sobre canvas`
    );
  }
  assert.notEqual(palette.missing,series[0]);
});

test('densidad por rol mantiene mÃ­nimo tÃ¡ctil seguro',()=>{
  assert.ok(IBERFIT_DESIGN_TOKENS.density.client.controlMinPx>=44);
  assert.ok(IBERFIT_DESIGN_TOKENS.density.coach.controlMinPx>=44);
  assert.ok(IBERFIT_DESIGN_TOKENS.density.admin.controlMinPx>=44);
});

test('foundation es incremental y no introduce supply-chain runtime',()=>{
  assert.match(foundation,/RC58_1_VISUAL_DELTA=INTENTIONALLY_MINIMAL/);
  assert.match(foundation,/aÃ±ade cero dependencias externas/);
  assert.doesNotMatch(tokensCss,/@import|https?:\/\//i);
  assert.match(foundation,/NEXT_ACTION=RC58_2_ICON_TYPOGRAPHY_SYSTEM/);
  assert.match(foundation,/NEXT_SECURITY_ACTION=SR0_THREAT_MODEL_AND_SECURITY_INVENTORY_READ_ONLY/);
});