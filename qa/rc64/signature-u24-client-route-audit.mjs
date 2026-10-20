import {expect} from '@playwright/test';

// This is authenticated QA read-only coverage for actual production route bodies,
// not a substitute for data-populated, offline, write, multi-device and expiry E2E.
export const CLIENT_SIGNATURE_U24_AREAS=Object.freeze([
  'hoy','planificacion','sesion','progreso',
  'informes','actividad','mensajes','retos','ajustes',
]);

const CONTRACT=Object.freeze({
  hoy:{selector:'.m26-client-home-v1'},
  planificacion:{selector:'.m26-rc39-planning'},
  sesion:{selector:'.m26-rc39-sessions'},
  progreso:{selector:'[data-client-progress-stage]'},
  informes:{selector:'.m26-route'},
  actividad:{selector:'.m26-route'},
  mensajes:{selector:'.m26-communication-route'},
  retos:{selector:'.m26-challenges-route'},
  ajustes:{selector:'.m26-settings-route'},
});

export async function certifyClientSignatureRoute(page,requested){
  if(!Object.hasOwn(CONTRACT,requested))throw Error('SIGNATURE_U24_UNKNOWN_CLIENT_AREA');
  const root=page.locator('.m26-shell[data-m26-role="client"]');
  await expect(root,requested+': Client-only shell remains mounted').toBeVisible();
  await expect(page.locator('[data-m26-interactive="ready"]'),requested+': authenticated runtime stays interactive')
    .toHaveCount(1);
  await expect(page.locator('.m26-role-choice[role="dialog"]'),requested+': no privileged app gateway')
    .toHaveCount(0);
  await expect(page.locator('[data-auth-action="mfa-continue-webauthn"]'),requested+': Client cannot inherit privileged MFA')
    .toHaveCount(0);
  await expect(page.locator('.m26-main'),requested+': no stranded inert navigation')
    .not.toHaveAttribute('inert','');
  await expect(page.locator('.m26-topbar'),requested+': no stranded inert header')
    .not.toHaveAttribute('inert','');

  const shell=page.locator('.m26-client-route-shell');
  const expected=requested==='mensajes'?/^(communication|communication-unavailable)$/u:requested;
  await expect(shell,requested+': actual Client renderer').toHaveAttribute('data-client-bottom-nav-route',expected);
  const body=shell.locator(':scope > :not(.m26-client-bottom-nav-layer)').first();
  await expect(body,requested+': nonempty screen body').toBeVisible();
  await expect(body.locator(CONTRACT[requested].selector).first(),requested+': actual route component').toBeVisible();
  await expect(body.locator('h2,h3').first(),requested+': meaningful screen heading').toBeVisible();
  await expect(body.locator('.m26-route-placeholder'),requested+': never silently show placeholder').toHaveCount(0);

  const state=await page.evaluate((area)=>{
    const route=document.querySelector('.m26-client-route-shell');
    const body=route?.querySelector(':scope > :not(.m26-client-bottom-nav-layer)');
    const has=(selector)=>Boolean(body?.querySelector(selector));
    let observation='visible';
    if(area==='hoy')observation='daily-home';
    if(area==='planificacion')observation=has('.m30-planning-overview.is-pending')?'unpublished-plan':'plan-present';
    if(area==='sesion')observation=body?.querySelector('.m26-rc39-sessions')?.getAttribute('data-client-session-state')||'missing';
    if(area==='progreso')observation=body?.querySelector('[data-client-progress-stage]')?.getAttribute('data-client-progress-stage')||'missing';
    if(area==='informes')observation=has('[data-iri-diagnosis]')?'iri-confirmed':'iri-pending';
    if(area==='actividad')observation=has('[data-engagement-form="checkin"]')?'checkin-available':'training-unavailable';
    if(area==='mensajes')observation=has('[data-m45-communication-retry]')?'remote-unavailable':'inbox-ready';
    if(area==='retos')observation='optional-private-community';
    if(area==='ajustes')observation='preference-controls';
    return {
      role:document.querySelector('.m26-shell')?.getAttribute('data-m26-role')||'unknown',
      actualKind:route?.getAttribute('data-client-bottom-nav-route')||'missing',
      viewport:innerWidth,
      horizontalOverflow:Math.max(document.documentElement.scrollWidth,document.body.scrollWidth)>innerWidth+2,
      observation,
      headingPresent:Boolean(body?.querySelector('h2,h3')),
      clientBottomMoreOpen:Boolean(document.querySelector('details.m26-client-bottom-nav-more[open]')),
      visibleRoleDialog:Boolean(document.querySelector('.m26-role-choice[role="dialog"]')),
    };
  },requested);
  expect(state.role,requested+': no cross-role leakage').toBe('client');
  expect(state.horizontalOverflow,requested+': no document-level sideways scroll').toBe(false);
  expect(state.headingPresent,requested+': heading survives route transition').toBe(true);
  expect(state.clientBottomMoreOpen,requested+': Más must close after navigating').toBe(false);
  expect(state.visibleRoleDialog,requested+': no unexpected role dialog').toBe(false);

  if(requested==='planificacion'){
    await expect(body.locator('#m26-client-next-appointment'),
      'Planning must distinguish confirmed appointments from empty state').toBeVisible();
  }
  if(requested==='sesion'){
    expect(['empty','published','ready'],'Client session outcome cannot silently be unknown')
      .toContain(state.observation);
    await expect(body.locator('[data-workflow-action="open-session-builder"]'),
      'Client must never get the Coach session builder').toHaveCount(0);
    if(state.observation==='empty'){
      await expect(body.locator('[data-workflow-action="start-published-session"]')).toHaveCount(0);
    }
  }
  if(requested==='progreso'){
    expect(state.observation,'Progress must declare a meaningful presentation stage').not.toBe('missing');
    if(await body.locator('.m26-client-progress-stage.is-empty').count()){
      await expect(body.locator('.m26-progress-overview'),
        'No synthetic adherence percentage when no history exists').toHaveCount(0);
    }
  }
  if(requested==='informes'){
    await expect(body.locator('[data-workflow-action="issue-client-iri-report"]'),
      'Only a privileged professional may issue documents').toHaveCount(0);
    if(state.observation==='iri-confirmed'){
      await expect(body.locator('[data-iri-diagnosis] h2')).toContainText('Diagnóstico IRI');
    }else{
      await expect(body).toContainText('Diagnóstico IRI pendiente');
    }
  }
  if(requested==='actividad'){
    if(state.observation==='checkin-available'){
      await expect(body.locator('[data-engagement-form="checkin"] select[name="energy"]')).toBeVisible();
      await expect(body.locator('[data-engagement-form="checkin"] textarea[name="notes"]')).toBeVisible();
    }else{
      await expect(body).toContainText('Seguimiento diario no activado');
      await expect(body.locator('[data-engagement-form="checkin"]')).toHaveCount(0);
    }
  }
  if(requested==='mensajes'){
    if(state.observation==='remote-unavailable'){
      await expect(body.locator('[data-m45-communication-retry]'),'Communication has an explicit retry').toBeVisible();
    }else{
      await expect(body.locator('.m26-communication-grid'),'Communication must display real inbox').toBeVisible();
      await expect(body.locator('[data-communication-form="thread-open"]'),
        'Client may not create Coach threads').toHaveCount(0);
    }
  }
  if(requested==='retos'){
    await expect(body).toContainText('no publica automáticamente');
    await expect(body.locator('[data-m26-area="ajustes"]'),'Community privacy remains accessible').toBeVisible();
  }
  if(requested==='ajustes'){
    for(const selector of ['[data-m26-ui-language]','[data-m26-ui-locale]','#m26-settings-notifications','#m26-settings-privacy']){
      await expect(body.locator(selector),selector+': visible consent/preference section').toBeVisible();
    }
  }
  // Never persist names, messages, identities, form values or health measurements.
  return Object.freeze({
    area:requested,
    actualKind:state.actualKind,
    viewport:state.viewport,
    observation:state.observation,
    authenticated:true,
    readOnly:true,
    syntheticQaAccount:true,
    routeBodyVerified:true,
    fullFunctionalAcceptance:false,
  });
}
