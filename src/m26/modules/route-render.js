import * as base from './route-render-base.js';
export * from './route-render-base.js';

const ONBOARDING_FORM_MARKER='<form data-workflow-form="client-onboarding" class="m26-onboarding-form" novalidate>';
const ONBOARDING_LEGACY_ACTION='<div class="m26-sticky-actions"><p><strong>El acceso permanece desactivado.</strong> Primero se crea el expediente y se completa el diagnóstico IRI.</p><button type="submit" class="m26-primary-action" data-workflow-action="create-client-draft">Crear expediente y abrir primera sesión</button></div>';

function onboardingChoiceMarkup(){
  return `<section class="m26-form-section m26-panel-soft" data-onboarding-assessment-choice>
    <div class="m26-form-section-title"><span>→</span><div><h3>¿Cómo quieres empezar?</h3><p>El IRI aporta un diagnóstico más completo, pero no bloquea el inicio del trabajo. Puedes realizarlo después.</p></div></div>
    <div class="m26-field-grid">
      <label class="m26-consent"><input type="radio" name="initialAssessmentMode" value="deferred" checked> <span><strong>Empezar a trabajar</strong><small> Crea el expediente con los datos esenciales y continúa directamente con planificación, agenda y sesiones.</small></span></label>
      <label class="m26-consent"><input type="radio" name="initialAssessmentMode" value="iri"> <span><strong>Realizar evaluación IRI</strong><small> Crea el expediente y abre inmediatamente la evaluación inicial IBERFIT.</small></span></label>
    </div>
  </section>`;
}

export function enhanceClientOnboardingHtml(html=''){
  let output=String(html??'');
  if(!output.includes(ONBOARDING_FORM_MARKER)||output.includes('data-onboarding-assessment-choice'))return output;
  output=output.replace(ONBOARDING_FORM_MARKER,`${ONBOARDING_FORM_MARKER}${onboardingChoiceMarkup()}`);
  output=output.replace(ONBOARDING_LEGACY_ACTION,'<div class="m26-sticky-actions"><p data-onboarding-next-copy><strong>El acceso permanece desactivado.</strong> El expediente se crea primero; tú decides si empezar a trabajar o realizar ahora el IRI.</p><button type="submit" class="m26-primary-action" data-workflow-action="create-client-draft" data-onboarding-submit>Crear expediente y empezar a trabajar</button></div>');
  return output;
}

export function renderClientsRoute(...args){return enhanceClientOnboardingHtml(base.renderClientsRoute(...args));}
export function renderRouteView(...args){return enhanceClientOnboardingHtml(base.renderRouteView(...args));}
