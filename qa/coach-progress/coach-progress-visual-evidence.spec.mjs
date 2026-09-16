import {mkdir,writeFile} from 'node:fs/promises';
import {test,expect} from '@playwright/test';

const OUT='recovery/daily-use-visual/coach-progress';

async function settle(page){
  await page.evaluate(async()=>{
    await document.fonts?.ready;
    document.documentElement.setAttribute('data-coach-progress-visual','true');
  });
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.waitForTimeout(180);
}

test.beforeAll(async()=>{await mkdir(OUT,{recursive:true});});

test('Coach Progreso visual evidence makes exercise decisions scannable without automating them',async({page},testInfo)=>{
  await page.goto('/qa/coach-progress/fixture.html',{waitUntil:'domcontentloaded'});
  await expect.poll(()=>page.evaluate(()=>globalThis.__IBERFIT_COACH_PROGRESS_VISUAL__?.mounted===true)).toBe(true);
  await settle(page);

  const shell=page.locator('.m26-shell[data-m26-role="coach"]');
  const workspace=page.locator('[data-m27-exercise-focus]');
  const options=page.locator('[data-m27-exercise-select]');
  const active=page.locator('.m27-exercise-focus-active');
  const summary=page.locator('.m27-exercise-focus-summary');

  await expect(shell).toBeVisible();
  await expect(workspace).toBeVisible();
  await expect(options).toHaveCount(4);
  await expect(summary.locator('[data-state="review"]')).toContainText('1 revisar');
  await expect(summary.locator('[data-state="progress"]')).toContainText('1 evolución');
  await expect(summary.locator('[data-state="stable"]')).toContainText('1 estables');
  await expect(summary.locator('[data-state="insufficient"]')).toContainText('1 sin comparación');

  await expect(options.filter({hasText:'Remo con mancuerna'})).toHaveAttribute('data-m27-exercise-state','review');
  await expect(options.filter({hasText:'Press de pecho'})).toHaveAttribute('data-m27-exercise-state','progress');
  await expect(options.filter({hasText:'Sentadilla goblet'})).toHaveAttribute('data-m27-exercise-state','stable');
  await expect(options.filter({hasText:'Elevación lateral'})).toHaveAttribute('data-m27-exercise-state','insufficient');

  const selected=options.filter({hasText:'Remo con mancuerna'});
  await expect(selected).toHaveAttribute('aria-pressed','true');
  await expect(active).toContainText('Remo con mancuerna a una mano');
  await expect(active).toContainText('La última exposición combina menor carga');

  const search=page.locator('[data-m27-exercise-search]');
  await search.fill('press');
  await expect(options.filter({hasText:'Press de pecho'})).toBeVisible();
  await expect(options.filter({hasText:'Remo con mancuerna'})).toBeHidden();
  await search.fill('');
  await expect(options).toHaveCount(4);

  await expect.poll(async()=>page.locator('m26-echart[data-chart-state="ready"]').count()).toBeGreaterThan(0);

  const metrics=await page.evaluate(()=>{
    const list=document.querySelector('.m27-exercise-focus-list')?.getBoundingClientRect()||null;
    const activeCard=document.querySelector('.m27-exercise-focus-active .m26-exercise-progress-card')?.getBoundingClientRect()||null;
    return {
      viewport:{width:innerWidth,height:innerHeight},
      pageScrollWidth:document.documentElement.scrollWidth,
      listHeight:list?.height??null,
      activeCardWidth:activeCard?.width??null,
      stateLabels:[...document.querySelectorAll('.m27-exercise-focus-state')].map((node)=>node.textContent?.trim()||''),
    };
  });

  expect(metrics.pageScrollWidth).toBeLessThanOrEqual(metrics.viewport.width+1);
  expect(metrics.listHeight).not.toBeNull();
  expect(metrics.activeCardWidth).not.toBeNull();
  expect(metrics.stateLabels).toEqual(expect.arrayContaining(['Revisar','Evolución','Estable','Sin comparación']));

  await page.evaluate(()=>window.scrollTo(0,0));
  await page.waitForTimeout(60);

  const file=`coach-progress-${testInfo.project.name}.png`;
  await page.screenshot({
    path:`${OUT}/${file}`,
    fullPage:true,
    animations:'disabled',
    caret:'hide',
  });

  await writeFile(
    `${OUT}/coach-progress-${testInfo.project.name}.json`,
    `${JSON.stringify({
      schema:'iberfit.coach-progress-visual.v1',
      project:testInfo.project.name,
      syntheticQa:true,
      currentSource:true,
      authBypassed:false,
      productionAuthModified:false,
      decisionStates:['review','progress','stable','insufficient'],
      metrics,
      file,
    },null,2)}\n`,
    'utf8',
  );
});
