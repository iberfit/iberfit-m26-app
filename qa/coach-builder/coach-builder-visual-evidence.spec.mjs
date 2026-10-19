import {mkdir,writeFile} from 'node:fs/promises';
import {test,expect} from '@playwright/test';

const OUT='recovery/daily-use-visual/coach-builder';
test.beforeAll(async()=>{await mkdir(OUT,{recursive:true});});

test('SIGNATURE U14 builder review: real CSS, synthetic Coach shell, all responsive widths',async({page},testInfo)=>{
  await page.goto('/qa/coach-builder/fixture.html',{waitUntil:'domcontentloaded'});
  await expect.poll(()=>page.evaluate(()=>globalThis.__IBERFIT_COACH_BUILDER_VISUAL__?.mounted===true)).toBe(true);
  await page.evaluate(()=>document.fonts?.ready);
  await page.emulateMedia({reducedMotion:'reduce'});
  const shell=page.locator('.m26-shell[data-m26-role="coach"]');
  const finish=page.locator('[data-session-builder-finish]');
  const buttons=finish.locator('button');
  await expect(shell).toBeVisible();
  await expect(finish).toHaveCount(1);
  await expect(buttons).toHaveCount(3);
  await expect(finish.locator('[data-session-action="preview"]')).toBeVisible();
  await expect(finish.locator('[data-session-action="save-draft"]')).toBeVisible();
  await expect(finish.locator('[data-session-jump="library"]')).toBeVisible();
  await expect(finish.locator('[data-session-action="publish"]')).toHaveCount(0);
  const markupOrder=await page.evaluate(()=>{
    const blocks=document.querySelector('.m26-builder-blocks');
    const finish=document.querySelector('[data-session-builder-finish]');
    return Boolean(blocks&&finish&&(blocks.compareDocumentPosition(finish)&Node.DOCUMENT_POSITION_FOLLOWING));
  });
  expect(markupOrder,'Review actions must follow the final training block').toBe(true);
  const metrics=await page.evaluate(()=>{
    const finish=document.querySelector('[data-session-builder-finish]');
    const root=document.querySelector('#qa-root');
    const style=getComputedStyle(finish);
    const box=finish.getBoundingClientRect();
    return {
      width:innerWidth,height:innerHeight,
      documentWidth:document.documentElement.scrollWidth,bodyWidth:document.body.scrollWidth,
      rootWidth:root.scrollWidth,footerLeft:box.left,footerRight:box.right,
      footerPosition:style.position,footerVisible:box.width>0&&box.height>0,
      buttons:[...finish.querySelectorAll('button')].map(node=>{const rect=node.getBoundingClientRect(),style=getComputedStyle(node),parent=getComputedStyle(node.parentElement);return {action:node.dataset.sessionAction||node.dataset.sessionJump,height:rect.height,width:rect.width,computedMinHeight:style.minHeight,computedHeight:style.height,transform:style.transform,display:style.display,parentDisplay:parent.display,parentTransform:parent.transform};}),
    };
  });
  expect(Math.max(metrics.documentWidth,metrics.bodyWidth,metrics.rootWidth),'No horizontal overflow').toBeLessThanOrEqual(metrics.width+2);
  expect(metrics.footerLeft).toBeGreaterThanOrEqual(-2);
  expect(metrics.footerRight).toBeLessThanOrEqual(metrics.width+2);
  expect(metrics.footerVisible).toBe(true);
  expect(metrics.footerPosition,'No overlay or sticky control over mobile navigation').not.toMatch(/fixed|sticky/);
  for(const button of metrics.buttons){
    expect(button.height,`Touch controls must be at least 48px tall: ${JSON.stringify(button)}`).toBeGreaterThanOrEqual(47);
    expect(button.width).toBeGreaterThan(40);
  }
  const lastButton=buttons.last();
  await lastButton.scrollIntoViewIfNeeded();
  await lastButton.focus();
  await expect(lastButton).toBeFocused();
  const hit=await lastButton.evaluate(node=>{
    const rect=node.getBoundingClientRect();
    const x=Math.round(rect.left+rect.width/2),y=Math.round(rect.top+rect.height/2);
    return y>=0&&y<innerHeight&&node.contains(document.elementFromPoint(x,y));
  });
  expect(hit,'Review action must be tappable and not obscured by mobile dock').toBe(true);
  const name=testInfo.project.name;
  await page.screenshot({path:`${OUT}/coach-builder-editing-${name}.png`,fullPage:true,animations:'disabled',caret:'hide'});

  await page.evaluate(()=>globalThis.__IBERFIT_COACH_BUILDER_VISUAL__.setMode('empty'));
  await expect(page.locator('[data-session-builder-empty]')).toBeVisible();
  await expect(page.locator('[data-session-builder-empty] [data-session-jump="library"]')).toBeVisible();
  await expect(page.locator('[data-session-builder-finish]')).toHaveCount(0);
  await page.screenshot({path:`${OUT}/coach-builder-empty-${name}.png`,fullPage:true,animations:'disabled',caret:'hide'});

  await page.evaluate(()=>globalThis.__IBERFIT_COACH_BUILDER_VISUAL__.setMode('preview'));
  await expect(page.locator('[data-session-builder-finish]')).toHaveCount(0);
  await expect(page.locator('[data-session-action="publish"]')).toHaveCount(1);
  await page.screenshot({path:`${OUT}/coach-builder-preview-${name}.png`,fullPage:true,animations:'disabled',caret:'hide'});
  await writeFile(`${OUT}/coach-builder-${name}.json`,JSON.stringify({
    schema:'iberfit.signature.coach-builder.synthetic-visual.v1',
    source:'actual renderSessionBuilder and canonical CSS in QA synthetic shell',
    syntheticQa:true,authenticatedBusinessLifecycle:false,
    noBusinessWrites:true,role:'coach',name,metrics,states:['editing','empty','preview'],
    files:['editing','empty','preview'].map(state=>`coach-builder-${state}-${name}.png`),
  },null,2)+'\n');
});
