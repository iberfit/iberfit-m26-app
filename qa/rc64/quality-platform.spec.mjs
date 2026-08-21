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
test('RC64.2B onboarding observer settles and still reacts to external navigation',async({page})=>{
  const runtimeErrors=await installRuntimeErrorGates(page);
  await page.goto('/qa/rc64/fixture.html?role=coach&state=normal');

  const result=await page.evaluate(async()=>{
    document.body.innerHTML=`
      <div id="rc64-onboarding-root">
        <header>
          <div class="m26-topbar-actions"></div>
        </header>
        <nav>
          <button type="button" data-m26-area="hoy" aria-current="page">Hoy</button>
          <button type="button" data-m26-area="clientes">Clientes</button>
        </nav>
        <main id="m26-main"></main>
      </div>
    `;

    const root=document.querySelector('#rc64-onboarding-root');
    const module=await import('/src/m26/onboarding/progressive-onboarding.js');

    const records=new Map();
    const storage={
      getItem(key){
        return records.has(String(key))
          ?records.get(String(key))
          :null;
      },
      setItem(key,value){
        records.set(String(key),String(value));
      },
    };

    let mutationCount=0;
    const probe=new MutationObserver((mutations)=>{
      mutationCount+=mutations.length;
    });

    probe.observe(root,{
      childList:true,
      subtree:true,
      attributes:true,
      attributeFilter:['aria-current'],
    });

    const controller=module.createProgressiveOnboardingController({
      root,
      storage,
      identityProvider:()=>({
        role:'coach',
        userId:'rc64-v6-coach',
      }),
      scope:globalThis,
    });

    const yieldTask=()=>new Promise((resolve)=>setTimeout(resolve,0));
    const settle=async()=>{
      await yieldTask();
      await yieldTask();
      await new Promise((resolve)=>setTimeout(resolve,25));
    };

    controller.mount();
    await settle();

    const initialBefore=mutationCount;
    await new Promise((resolve)=>setTimeout(resolve,40));
    const initialAfter=mutationCount;

    const launcher=root.querySelector('[data-progressive-onboarding-launcher]');
    const initialLauncherText=launcher?.textContent||'';

    const hoy=root.querySelector('nav [data-m26-area="hoy"]');
    const clientes=root.querySelector('nav [data-m26-area="clientes"]');
    if(!hoy||!clientes)throw new Error('RC64_ONBOARDING_NAV_FIXTURE_MISSING');
    hoy.removeAttribute('aria-current');
    clientes.setAttribute('aria-current','page');

    await settle();

    const externalBefore=mutationCount;
    await new Promise((resolve)=>setTimeout(resolve,40));
    const externalAfter=mutationCount;

    const persisted=[...records.values()]
      .map((value)=>{
        try{return JSON.parse(value);}
        catch{return null;}
      })
      .filter(Boolean);

    const visited=persisted.flatMap((value)=>
      Array.isArray(value.visited)
        ?value.visited
        :[]
    );

    const panelPresentAfterNavigation=Boolean(
      root.querySelector('[data-progressive-onboarding-panel]')
    );

    controller.destroy();
    probe.disconnect();

    return {
      initialBefore,
      initialAfter,
      externalBefore,
      externalAfter,
      initialLauncherText,
      visited:[...new Set(visited)].sort(),
      panelPresentAfterNavigation,
    };
  });

  expect(result.initialAfter).toBe(result.initialBefore);
  expect(result.externalAfter).toBe(result.externalBefore);
  expect(result.initialLauncherText).toBe('Gu\u00eda');
  expect(result.visited).toContain('coach-today');
  expect(result.visited).toContain('coach-clients');
  expect(result.panelPresentAfterNavigation).toBe(false);
  expect(runtimeErrors).toEqual([]);
});
