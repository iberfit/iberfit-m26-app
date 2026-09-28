import {mkdir} from 'node:fs/promises';
import {test,expect} from '@playwright/test';

const OUT='recovery/device-experience';

function safeSlug(value){
  return String(value||'unknown')
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu,'-')
    .replace(/^-+|-+$/gu,'')
    .slice(0,90)||'unknown';
}

test.beforeAll(async()=>{await mkdir(OUT,{recursive:true});});

test('Client Progress decision evidence mounts above collapsed longitudinal detail',async({page},testInfo)=>{
  const response=await page.goto(
    '/qa/rc13_visual_cases/client_progreso_tablet.html',
    {waitUntil:'domcontentloaded',timeout:15_000},
  );
  expect(response?.ok(),'Client Progress fixture must load').toBeTruthy();

  await page.addScriptTag({
    type:'module',
    url:'/src/m26/data-experience/progress-decision-ui.js',
  });

  const decision=page.locator('[data-progress-decision-layer="true"]');
  const detail=page.locator('details.m26-client-progress-detail').first();

  await expect(decision,'Decision evidence must render exactly once').toHaveCount(1);
  await expect(decision,'Decision evidence must be visible without opening detail').toBeVisible();
  await expect(decision).toContainText('¿Estoy progresando?');
  await expect(detail,'Longitudinal detail disclosure must remain available').toBeVisible();
  await expect(detail,'Longitudinal detail must remain collapsed by default').not.toHaveAttribute('open','');
  await expect(
    page.locator('m26-progress-decision-portal'),
    'Transient portal must be removed after runtime mount',
  ).toHaveCount(0);

  const placement=await page.evaluate(()=>{
    const decisionNode=document.querySelector('[data-progress-decision-layer="true"]');
    const detailNode=document.querySelector('details.m26-client-progress-detail');
    if(!decisionNode||!detailNode){
      return {decisionPresent:Boolean(decisionNode),detailPresent:Boolean(detailNode),insideDetail:null,precedesDetail:null};
    }
    return {
      decisionPresent:true,
      detailPresent:true,
      insideDetail:detailNode.contains(decisionNode),
      precedesDetail:Boolean(decisionNode.compareDocumentPosition(detailNode)&Node.DOCUMENT_POSITION_FOLLOWING),
    };
  });

  expect(placement).toEqual({
    decisionPresent:true,
    detailPresent:true,
    insideDetail:false,
    precedesDetail:true,
  });

  await expect(
    decision.locator('[data-progress-baseline="iri"]'),
    'Confirmed synthetic IRI baseline must remain visible as a separate starting point',
  ).toBeVisible();
  await expect(
    decision,
    'Client summary must not expose insufficient-data filler cards',
  ).not.toContainText('Datos insuficientes');

  await page.screenshot({
    path:`${OUT}/${safeSlug(testInfo.project.name)}-client-progress-decision-runtime.png`,
    fullPage:true,
    animations:'disabled',
    caret:'hide',
  });
});
