import {mkdir,writeFile} from 'node:fs/promises';
import {test,expect} from '@playwright/test';
import {
  CANARY_ORIGIN,
  QA_PROJECT_REF,
  SUPABASE_ORIGIN,
  installCurrentSourceQaNetworkPolicy,
  qaRequestLabel,
} from './secure-current-source-auth.mjs';

const OUT_DIR='recovery/p0-authenticated-interaction';
const REQUIRED=[
  'M26_SUPABASE_URL','M26_SUPABASE_PUBLISHABLE_KEY','M26_PROJECT_REF','M26_QA_ONLY',
  'M26_QA_CLIENT_B_EMAIL','M26_QA_CLIENT_B_PASSWORD',
];
const READ_ONLY_RPCS=new Set([
  'iberfit_bootstrap_v26',
  'iberfit_authorized_application_roles_v13',
  'iberfit_appointment_change_requests_v13',
  'iberfit_application_context_v14',
  'iberfit_privileged_assurance_context_v65d',
  'iberfit_communication_bootstrap_v14',
  'm26_backend_bootstrap_v43',
  'm26_wearable_bootstrap_v44',
  'iberfit_exercise_catalog_public_v1',
  'iberfit_exercise_media_manifest_v1',
]);
const BLOCKED_NOTIFICATION_PREFERENCE_UPSERT='POST qa-supabase /rest/v1/rpc/iberfit_notification_preferences_upsert_v1';

function safeSlug(value){return String(value||'unknown').toLowerCase().replace(/[^a-z0-9]+/gu,'-').replace(/^-+|-+$/gu,'').slice(0,80)||'unknown';}
async function dismissGuidance(page){
  const welcome=page.locator('[data-m26-client-guided-welcome]');
  await welcome.waitFor({state:'visible',timeout:2_000}).catch(()=>{});
  if(await welcome.isVisible().catch(()=>false)){
    const pause=page.locator('[data-m26-client-guided-welcome-pause]').first();
    if(await pause.count())await pause.click();
  }
  const tour=page.locator('[data-m26-guided-tour]');
  if(await tour.count()){
    const close=page.locator('[data-m26-guided-tour-close]').first();
    if(await close.count())await close.click();
  }
  const contextGuide=page.locator('[data-m26-client-context-guide]:visible').first();
  if(await contextGuide.count()&&await contextGuide.isVisible().catch(()=>false)){
    const ack=contextGuide.locator('[data-m26-client-context-guide-ack]').first();
    const close=contextGuide.locator('[data-m26-client-context-guide-close]').first();
    if(await ack.count())await ack.click();
    else if(await close.count())await close.click();
    await expect(contextGuide).toBeHidden({timeout:5_000}).catch(()=>{});
  }
}
async function expectViewportHittable(locator,label){
  await locator.scrollIntoViewIfNeeded();
  const hit=await locator.evaluate((el)=>{
    const rect=el.getBoundingClientRect();
    const x=rect.left+rect.width/2;
    const y=rect.top+rect.height/2;
    const node=document.elementFromPoint(x,y);
    return {
      rect:{left:rect.left,top:rect.top,right:rect.right,bottom:rect.bottom,width:rect.width,height:rect.height},
      viewport:{width:innerWidth,height:innerHeight},
      matches:node===el||Boolean(el.contains(node)),
    };
  });
  expect(hit.rect.left,`${label} left`).toBeGreaterThanOrEqual(0);
  expect(hit.rect.right,`${label} right`).toBeLessThanOrEqual(hit.viewport.width+1);
  expect(hit.rect.top,`${label} top`).toBeGreaterThanOrEqual(0);
  expect(hit.rect.bottom,`${label} bottom`).toBeLessThanOrEqual(hit.viewport.height+1);
  expect(hit.matches,`${label} must receive pointer hit`).toBe(true);
}
async function openArea(page,area){
  await dismissGuidance(page);
  const visible=page.locator(`[data-m26-area="${area}"]:visible`).first();
  if(await visible.count()&&await visible.isVisible().catch(()=>false)){
    await visible.click();
    await dismissGuidance(page);
    return;
  }
  if(area==='ajustes'){
    const settingsMenu=page.locator('.m26-settings-menu:visible').first();
    if(await settingsMenu.count()&&await settingsMenu.isVisible().catch(()=>false)){
      const summary=settingsMenu.locator(':scope > summary').first();
      await expect(summary).toBeVisible();
      await expectViewportHittable(summary,'Settings trigger');
      await summary.click();
      const target=settingsMenu.locator('[data-m26-area="ajustes"]').first();
      await expect(target).toBeVisible();
      await expectViewportHittable(target,'Settings target');
      await target.click();
      await dismissGuidance(page);
      return;
    }
  }
  const more=page.locator('.m26-client-bottom-nav-more > summary:visible').first();
  await expect(more,`Responsive navigation must expose ${area}`).toBeVisible();
  await expectViewportHittable(more,'Client More');
  await more.click();
  const target=page.locator(`.m26-client-bottom-nav-menu [data-m26-area="${area}"]:visible`).first();
  await expect(target).toBeVisible();
  await expectViewportHittable(target,`${area} target`);
  await target.click();
  await dismissGuidance(page);
}
async function activate(page,locator,touch){
  await locator.scrollIntoViewIfNeeded();
  if(touch){await locator.tap();return;}
  const box=await locator.boundingBox();
  expect(box,'control must expose a pointer box').not.toBeNull();
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2);
  await page.mouse.down();
  await page.mouse.up();
}
async function expectTouchTarget(locator,touch){
  if(!touch)return;
  const metrics=await locator.evaluate((node)=>({height:node.getBoundingClientRect().height,fontSize:parseFloat(getComputedStyle(node).fontSize)}));
  expect(metrics.height).toBeGreaterThanOrEqual(44);
  expect(metrics.fontSize).toBeGreaterThanOrEqual(16);
}

test('authenticated Client-only QA keeps inputs textarea selects and mobile More usable after pointer release',async({page,context},testInfo)=>{
  const missing=REQUIRED.filter((name)=>!process.env[name]);
  expect(missing,'Missing authorized QA environment').toEqual([]);
  expect(process.env.M26_PROJECT_REF).toBe(QA_PROJECT_REF);
  expect(String(process.env.M26_QA_ONLY).toLowerCase()).toBe('true');
  expect(new URL(process.env.M26_SUPABASE_URL).origin).toBe(SUPABASE_ORIGIN);
  expect(String(process.env.M26_SUPABASE_PUBLISHABLE_KEY)).not.toMatch(/service[_-]?role/iu);
  expect(String(process.env.M26_QA_CLIENT_B_EMAIL||'').toLowerCase()).toBe('qa.rc74.client-b@iberfit.cl');

  const touch=/mobile|tablet/iu.test(testInfo.project.name);
  const blocked=[];
  const unexpectedFailures=[];
  const consoleErrors=[];
  const pageErrors=[];
  await installCurrentSourceQaNetworkPolicy(context,{
    readOnlyRpcs:READ_ONLY_RPCS,
    onBlocked:(label)=>blocked.push(label),
  });
  page.on('requestfailed',(request)=>{const label=qaRequestLabel(request);if(!blocked.includes(label))unexpectedFailures.push(label);});
  page.on('console',(message)=>{if(message.type()==='error')consoleErrors.push(String(message.text()||'').slice(0,400));});
  page.on('pageerror',(error)=>pageErrors.push(String(error?.message||error||'PAGE_ERROR').slice(0,400)));

  const navigation=await page.goto(CANARY_ORIGIN+'/',{waitUntil:'networkidle',timeout:20_000});
  expect(navigation?.ok()).toBeTruthy();
  await page.getByRole('textbox',{name:'Correo',exact:true}).fill(process.env.M26_QA_CLIENT_B_EMAIL);
  await page.locator('#m26-login-password').fill(process.env.M26_QA_CLIENT_B_PASSWORD);
  await page.getByRole('button',{name:'Entrar',exact:true}).click();

  const shell=page.locator('.m26-shell[data-m26-role="client"]');
  await expect(shell,'Client-only QA must open Client directly without privileged MFA').toBeVisible({timeout:25_000});
  await expect(page.locator('[data-m26-interactive="ready"]')).toHaveCount(1,{timeout:10_000});
  await expect(page.locator('.m26-role-choice[role="dialog"]'),'Client-only identity must not receive app choice').toHaveCount(0);
  await expect(page.locator('[data-auth-action="mfa-continue-webauthn"]'),'Client-only identity must not be forced through privileged WebAuthn').toHaveCount(0);
  await dismissGuidance(page);

  await openArea(page,'actividad');
  const checkin=page.locator('[data-engagement-form="checkin"]');
  await expect(checkin).toBeVisible({timeout:10_000});
  const energy=checkin.locator('input[name="energy"]');
  await activate(page,energy,touch);
  await page.waitForTimeout(250);
  await expect(energy).toBeFocused();
  await page.keyboard.type('7');
  await expect(energy).toHaveValue('7');
  await expectTouchTarget(energy,touch);
  const sleep=checkin.locator('input[name="sleep"]');
  await activate(page,sleep,touch);
  await page.waitForTimeout(250);
  await expect(sleep).toBeFocused();
  await page.keyboard.type('8');
  await expect(sleep).toHaveValue('8');
  await expect(energy).toHaveValue('7');
  await expectTouchTarget(sleep,touch);
  const notes=checkin.locator('textarea[name="notes"]');
  await activate(page,notes,touch);
  await page.waitForTimeout(250);
  await expect(notes).toBeFocused();
  await page.keyboard.type('Interacción QA sin enviar datos.');
  await expect(notes).toHaveValue('Interacción QA sin enviar datos.');
  await expectTouchTarget(notes,touch);
  await page.waitForTimeout(1_100);
  await expect(notes,'Background hydration must not steal active text entry').toBeFocused();
  await expect(energy).toHaveValue('7');
  await expect(sleep).toHaveValue('8');
  await expect(notes).toHaveValue('Interacción QA sin enviar datos.');

  await openArea(page,'ajustes');
  await expect(page.locator('details.m26-client-bottom-nav-more[open]')).toHaveCount(0);
  const settings=page.locator('.m26-settings-route');
  await expect(settings).toBeVisible({timeout:10_000});
  const language=settings.locator('[data-m26-ui-language]');
  const locale=settings.locator('[data-m26-ui-locale]');
  for(const [name,select] of [['language',language],['locale',locale]]){
    await select.evaluate((node,key)=>{
      globalThis.__IBERFIT_AUTH_INTERACTION_NODES__=globalThis.__IBERFIT_AUTH_INTERACTION_NODES__||Object.create(null);
      globalThis.__IBERFIT_AUTH_INTERACTION_NODES__[key]=node;
    },name);
    const original=await select.inputValue();
    await activate(page,select,touch);
    await page.waitForTimeout(180);
    const same=await select.evaluate((node,key)=>globalThis.__IBERFIT_AUTH_INTERACTION_NODES__?.[key]===node,name);
    expect(same,`${name} select must not be replaced on pointer release`).toBe(true);
    if(!touch)await expect(select).toBeFocused();
    await select.selectOption(original);
    await expect(select).toHaveValue(original);
    await expectTouchTarget(select,touch);
  }

  const notification=settings.locator('[data-m26-preference^="notifications."]').first();
  await expect(notification).toBeVisible();
  const wasChecked=await notification.isChecked();
  if(touch)await notification.tap();else await notification.click();
  await expect(notification).toBeChecked({checked:!wasChecked});
  if(touch)await notification.tap();else await notification.click();
  await expect(notification).toBeChecked({checked:wasChecked});

  await page.waitForTimeout(500);
  const blockedPreferenceSyncAttempts=blocked.filter((label)=>label===BLOCKED_NOTIFICATION_PREFERENCE_UPSERT);
  const unexpectedBlocked=blocked.filter((label)=>label!==BLOCKED_NOTIFICATION_PREFERENCE_UPSERT);
  expect(blockedPreferenceSyncAttempts,'Preference toggles must try to persist, while this read-only QA gate blocks the writes').toHaveLength(2);
  expect(unexpectedBlocked,'Authenticated interaction attempted an unexpected business mutation or foreign request').toEqual([]);
  expect(unexpectedFailures).toEqual([]);
  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);

  await mkdir(OUT_DIR,{recursive:true});
  const evidence={
    schema:'iberfit.p0.authenticated-client-interaction.v3',
    source:'current-source-intercepted-at-canary-origin',
    projectRef:QA_PROJECT_REF,
    project:safeSlug(testInfo.project.name),
    account:'client_b',
    role:'client',
    authenticated:true,
    privilegedMfaRequired:false,
    applicationChoiceRequired:false,
    mutationsPerformed:false,
    businessMutationsPerformed:false,
    blockedPreferenceSyncAttempts:blockedPreferenceSyncAttempts.length,
    authMutationPerformed:false,
    serviceWorkersBlocked:true,
    controls:['checkin.energy','checkin.sleep','checkin.notes','settings.language','settings.locale','settings.notification','client.mobile-more'],
  };
  await writeFile(`${OUT_DIR}/${safeSlug(testInfo.project.name)}.json`,`${JSON.stringify(evidence,null,2)}\n`,'utf8');
});