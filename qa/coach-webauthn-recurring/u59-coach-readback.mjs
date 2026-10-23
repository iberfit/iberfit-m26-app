/**
 * SIGNATURE U59: real Coach WebAuthn -> confirmed training evidence.
 * Read-only postcondition of U58 on the exact pre-existing U56 QA session.
 * This helper is never invoked while U58 has not completed and been verified.
 *
 * No service key, mutation allowance, execution start or hidden state writing.
 * Return no client identifiers in the portable evidence summary.
 */
import {openU56ClientReadOnly} from './u56-qa-publish.mjs';

const TARGET='QA U56 · Coach UI 39887295351-1';

export async function certifyU59CoachConfirmedReadback({
  browser,page,cdp,installPolicy,setDevice,evidence,
}){
  const {expect}=await import('@playwright/test');
  if(process.env.M26_QA_U59_READBACK!=='true')throw new Error('U59_NOT_AUTHORIZED');
  for(const mode of ['M26_QA_U56_PUBLISH','M26_QA_U58_EXECUTE']){
    expect(process.env[mode],'Coach readback must never enable QA writes').not.toBe('true');
  }

  // Client first proves actual completed U58 fixture under its own RLS, not
  // merely a planner's optimistic local state or a published but idle card.
  const client=await openU56ClientReadOnly(browser,installPolicy);
  const clientId=client.clientId;
  try{
    const dismissClientGuidance=async()=>{
      const welcome=client.page.locator('[data-m26-client-guided-welcome]');
      if(await welcome.isVisible().catch(()=>false)){
        const pause=client.page.locator('[data-m26-client-guided-welcome-pause]').first();
        if(await pause.isVisible().catch(()=>false))await pause.click();
      }
      for(const selector of [
        '[data-m26-guided-tour-close]:visible',
        '[data-m26-client-context-guide-close]:visible',
      ]){
        const button=client.page.locator(selector).first();
        if(await button.isVisible().catch(()=>false))await button.click();
      }
    };
    await dismissClientGuidance();
    await client.page.locator('[data-m26-area="sesion"]:visible').first().click();
    const history=client.page.locator(
      '[data-m43-session-history] [data-m43-completed-session]',
    ).filter({hasText:TARGET});
    await expect(history,'U58 must exist as one server-confirmed completion')
      .toHaveCount(1,{timeout:30_000});
    await expect(history).toContainText('4 registros');
    await expect(history).toContainText('Completada');
    await expect(client.page.locator('[data-rc39-session]').filter({hasText:TARGET}))
      .toHaveCount(0);
    await client.page.reload({waitUntil:'domcontentloaded',timeout:25_000});
    await expect(client.page.locator('[data-m26-interactive="ready"]'))
      .toHaveCount(1,{timeout:30_000});
    await dismissClientGuidance();
    await client.page.locator('[data-m26-area="sesion"]:visible').first().click();
    await expect(client.page.locator(
      '[data-m43-session-history] [data-m43-completed-session]',
    ).filter({hasText:TARGET})).toHaveCount(1,{timeout:30_000});
    expect(client.evidence.blocked,'Client readback never writes or crosses RLS')
      .toEqual([]);
    expect(client.pageErrors).toEqual([]);
  }finally{
    await client.context.close().catch(()=>{});
  }

  // Reuse the authentically MFA-verified Coach page/context that already
  // passed the existing Coach recurring gate. Never substitute Client auth.
  await setDevice(page,cdp,{
    name:'u59-coach-confirmed-desktop',width:1440,height:1000,mobile:false,touch:false,
  });
  const select=page.locator('[data-m26-client-select]');
  await expect(select.locator('option[value="'+clientId+'"]'),
    'Coach must be authorized for the exact same synthetic Client A')
    .toHaveCount(1,{timeout:15_000});
  await select.selectOption(clientId);
  // U59R routes are NOT covered by the older Sessions/Planning-only
  // openCertifiedCoachArea helper. Use real, role-scoped Coach navigation.
  // The page remains online here because this readback runs before U55.
  const openReadbackArea=async(area,visibleWorkspace)=>{
    await expect(page.locator('.m26-shell[data-m26-role="coach"]'),
      'U59 must retain independently verified Coach MFA context')
      .toBeVisible({timeout:15_000});
    const target=page.locator(`.m26-shell[data-m26-role="coach"] [data-m26-area="${area}"]:visible`).first();
    await expect(target,'U59 navigation '+area+' must be reachable').toBeVisible({timeout:12_000});
    await target.click();
    await expect(page.locator(`.m26-shell[data-m26-role="coach"] [data-m26-area="${area}"][aria-current="page"]`).first(),
      'U59 selected Coach area must retain aria-current').toHaveCount(1,{timeout:12_000});
    await expect(visibleWorkspace,'U59 '+area+' live workspace must be visible')
      .toBeVisible({timeout:20_000});
  };
  await openReadbackArea('progreso',page.locator('[data-evolution-plan-execution]'));
  const plan=page.locator('[data-evolution-plan-execution]');
  await expect(plan,'Coach progress must compare published plan with server-confirmed execution')
    .toBeVisible({timeout:25_000});
  await expect(plan,'Coach latest comparable session must be U56')
    .toContainText(TARGET,{timeout:20_000});
  await expect(plan).toContainText('Series registradas');
  await expect(plan).toContainText('Series previstas');

  await openReadbackArea('expediente',
    page.locator('[data-coach-client-workspace][data-client-id="'+clientId+'"]'));
  const workspace=page.locator('[data-coach-client-workspace][data-client-id="'+clientId+'"]');
  await expect(workspace,'Coach expediente must retain assigned Client context')
    .toBeVisible({timeout:25_000});
  await expect(workspace,'The Coach sees server-confirmed session feedback')
    .toContainText('IBERFIT QA U58 · cierre sintético de la sesión U56',{timeout:20_000});
  await expect(workspace).toContainText('RPE 7');
  const historyCards=workspace.locator('.m26-coach-workspace-brief');
  await expect(historyCards.first()).toBeVisible();

  // Only portable booleans: no Client ID, JWT, PII, command payload or secret.
  evidence.u59CoachReadback={
    verified:true,
    clientConfirmedFourSets:true,
    clientReloadedSameCompletion:true,
    coachPlanExecutionVisible:true,
    coachFeedbackVisible:true,
    independentCoachMfa:true,
    backendMutationCertified:false,
    qaOnly:true,
  };
}
