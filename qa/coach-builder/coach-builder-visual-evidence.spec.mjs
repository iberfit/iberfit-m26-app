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
  // U15: disable impossible reorders at each boundary in the actual Coach
  // renderer on 320/390/tablet/desktop, without hiding valid controls.
  const editors=page.locator('.m26-builder-editor');
  await expect(editors).toHaveCount(2);
  await expect(editors.first().locator('[data-session-action="move-up"]')).toBeDisabled();
  await expect(editors.first().locator('[data-session-action="move-down"]')).toBeEnabled();
  await expect(editors.last().locator('[data-session-action="move-up"]')).toBeEnabled();
  await expect(editors.last().locator('[data-session-action="move-down"]')).toBeDisabled();
  for(const editor of [editors.first(),editors.last()]){
    for(const action of ['move-up','move-down']){
      const element=editor.locator(`[data-session-action="${action}"]`);
      const attr=await element.getAttribute('aria-disabled');
      expect(attr,'Native and ARIA disabled must agree').toBe(await element.isDisabled()?'true':null);
    }
  }
  await expect(finish.locator('[data-session-action="preview"]')).toBeVisible();
  await expect(finish.locator('[data-session-action="save-draft"]')).toBeVisible();
  await expect(finish.locator('[data-session-jump="library"]')).toBeVisible();
  await expect(finish.locator('[data-session-action="publish"]')).toHaveCount(0);
  // B8: the whole command bar must be actionable at 320/390/tablet/desktop,
  // keep publication behind preview, and never cover the editing surface.
  const commandbar=page.locator('.m26-session-builder-v2 .m26-builder-commandbar');
  const secondary=commandbar.locator('[data-session-builder-secondary-actions]');
  await expect(commandbar).toBeVisible();
  await expect(commandbar.locator('[data-session-action="save-draft"]')).toBeVisible();
  await expect(commandbar.locator('[data-session-action="preview"]')).toBeVisible();
  await expect(commandbar.locator('[data-session-action="publish"]')).toHaveCount(0);
  await expect(secondary).toHaveCount(1);
  await expect(secondary).not.toHaveAttribute('open');
  await expect(secondary.locator('[data-session-action="exit-session"]')).toBeHidden();
  const position=await commandbar.evaluate(node=>getComputedStyle(node).position);
  expect(position,'Coach editing command bar must not obscure working fields').not.toMatch(/fixed|sticky/);
  const secondarySummary=secondary.locator(':scope > summary');
  await secondarySummary.focus();
  await expect(secondarySummary).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(secondary).toHaveAttribute('open','');
  const exit=secondary.locator('[data-session-action="exit-session"]');
  await expect(exit).toBeVisible();
  const discard=secondary.locator('.m26-draft-discard');
  await discard.locator('summary').click();
  await expect(discard).toHaveAttribute('open','');
  const dangerousAction=discard.locator('[data-session-action="discard-draft"]');
  await expect(dangerousAction).toBeVisible();
  const touchTargets=[commandbar.locator('[data-session-action="save-draft"]'),secondarySummary,exit,discard.locator('summary'),dangerousAction,commandbar.locator('[data-session-action="preview"]')];
  for(const target of touchTargets){
    const height=await target.evaluate(node=>node.getBoundingClientRect().height);
    expect(height,'B8 Coach command control must be finger-sized').toBeGreaterThanOrEqual(47.95);
  }
  await secondarySummary.click();
  await expect(secondary).not.toHaveAttribute('open');
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
    expect(button.height,`Touch controls must be at least 48px tall: ${JSON.stringify(button)}`).toBeGreaterThanOrEqual(47.95);
    expect(button.width).toBeGreaterThan(40);
  }
  // Editing fixture has the complete canonical prescription: Review is focusable.
  const lastButton=buttons.last();
  await expect(lastButton,'Valid Coach prescription enables Review').toBeEnabled();
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

  // B10: a truly invalid prescription must remain editable and saveable.
  // Native disabled Review is not keyboard-focusable; use Save for focus QA.
  await page.evaluate(()=>globalThis.__IBERFIT_COACH_BUILDER_VISUAL__.setMode('editing-invalid'));
  const invalidFinish=page.locator('[data-session-builder-finish]');
  const invalidReview=invalidFinish.locator('[data-session-action="preview"]');
  const invalidSave=invalidFinish.locator('[data-session-action="save-draft"]');
  const invalidLibrary=invalidFinish.locator('[data-session-jump="library"]');
  await expect(invalidReview,'Incomplete prescriptions must not be reviewable').toBeDisabled();
  await expect(invalidReview).toHaveAttribute('aria-disabled','true');
  await expect(invalidReview).toHaveAttribute('aria-describedby','m26-builder-review-readiness');
  await expect(page.locator('[data-session-review-readiness]')).toContainText('Revisa las series');
  await expect(invalidSave).toBeEnabled();
  await expect(invalidLibrary).toBeEnabled();
  await invalidSave.scrollIntoViewIfNeeded();
  await invalidSave.focus();
  await expect(invalidSave,'Save remains keyboard accessible in invalid draft').toBeFocused();
  for(const control of [invalidReview,invalidSave,invalidLibrary]){
    const rect=await control.boundingBox();
    expect(rect?.height,'B10 invalid draft controls remain touch sized').toBeGreaterThanOrEqual(47.95);
  }
  await page.screenshot({path:`${OUT}/coach-builder-editing-invalid-${name}.png`,fullPage:true,animations:'disabled',caret:'hide'});

  await page.evaluate(()=>globalThis.__IBERFIT_COACH_BUILDER_VISUAL__.setMode('empty'));
  await expect(page.locator('[data-session-builder-empty]')).toBeVisible();
  const emptyCTA=page.locator('[data-session-builder-empty] [data-session-jump="library"]');
  await expect(emptyCTA).toBeVisible();
  const emptyHeight=await emptyCTA.evaluate(node=>node.getBoundingClientRect().height);
  expect(emptyHeight,'Empty-state library action must remain 48px tappable').toBeGreaterThanOrEqual(47.95);
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
    noBusinessWrites:true,role:'coach',name,metrics,states:['editing','editing-invalid','empty','preview'],
    files:['editing','editing-invalid','empty','preview'].map(state=>`coach-builder-${state}-${name}.png`),
  },null,2)+'\n');
});
