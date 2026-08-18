import {test,expect} from '@playwright/test';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url);
const axePath=require.resolve('axe-core/axe.min.js');

const ROLES=Object.freeze(['client','coach','admin']);
const STATES=Object.freeze(['normal','loading','empty','error','retry','conflict','offline']);

async function installRuntimeErrorGates(page){
  const errors=[];
  page.on('pageerror',(error)=>errors.push(`pageerror:${error.message}`));
  page.on('console',(message)=>{
    if(message.type()==='error')errors.push(`console:${message.text()}`);
  });
  page.on('requestfailed',(request)=>{
    errors.push(`requestfailed:${request.method()}:${request.url()}:${request.failure()?.errorText||'unknown'}`);
  });
  return errors;
}

async function assertAxe(page){
  await page.addScriptTag({path:axePath});
  const violations=await page.evaluate(async()=> {
    const result=await globalThis.axe.run(document,{
      runOnly:{
        type:'tag',
        values:['wcag2a','wcag2aa','wcag21aa','wcag22aa'],
      },
    });
    return result.violations.map((violation)=>({
      id:violation.id,
      impact:violation.impact,
      nodes:violation.nodes.length,
      help:violation.help,
    }));
  });
  expect(violations).toEqual([]);
}

async function assertNoOverflow(page){
  const overflow=await page.evaluate(()=>({
    documentScrollWidth:document.documentElement.scrollWidth,
    documentClientWidth:document.documentElement.clientWidth,
    bodyScrollWidth:document.body.scrollWidth,
    bodyClientWidth:document.body.clientWidth,
  }));
  expect(overflow.documentScrollWidth).toBeLessThanOrEqual(overflow.documentClientWidth+1);
  expect(overflow.bodyScrollWidth).toBeLessThanOrEqual(overflow.bodyClientWidth+1);
}

async function assertTouchTargets(page){
  const small=await page.locator('[data-quality-action]').evaluateAll((elements)=>elements
    .map((element)=>{
      const rect=element.getBoundingClientRect();
      return {
        text:(element.textContent||'').trim(),
        width:rect.width,
        height:rect.height,
      };
    })
    .filter((item)=>item.width<44||item.height<44));
  expect(small).toEqual([]);
}

for(const role of ROLES){
  for(const state of STATES){
    test(`${role}/${state} passes deterministic accessibility layout and runtime-error gates`,async({page})=>{
      const runtimeErrors=await installRuntimeErrorGates(page);
      await page.goto(`/qa/rc64/fixture.html?role=${role}&state=${state}`,{waitUntil:'networkidle'});
      await expect(page.locator('#quality-root')).toHaveAttribute('data-quality-ready','true');
      await expect(page.locator('[data-quality-fixture]')).toHaveAttribute('data-quality-role',role);
      await expect(page.locator('[data-quality-fixture]')).toHaveAttribute('data-quality-state',state);
      await assertNoOverflow(page);
      await assertTouchTargets(page);
      await assertAxe(page);
      expect(runtimeErrors).toEqual([]);
    });
  }

  test(`${role}/normal keeps keyboard focus on visible interactive controls`,async({page})=>{
    await page.goto(`/qa/rc64/fixture.html?role=${role}&state=normal`);
    await page.keyboard.press('Tab');
    await expect(page.locator('.quality-skip')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('#quality-main')).toBeFocused();
    await page.keyboard.press('Tab');
    const focused=page.locator(':focus');
    await expect(focused).toBeVisible();
    await expect(focused).toHaveAttribute('data-quality-action','');
  });
}

test('invalid role and state fail closed to the deterministic client normal fixture',async({page})=>{
  await page.goto('/qa/rc64/fixture.html?role=superadmin&state=success');
  await expect(page.locator('[data-quality-fixture]')).toHaveAttribute('data-quality-role','client');
  await expect(page.locator('[data-quality-fixture]')).toHaveAttribute('data-quality-state','normal');
});