import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {legacyClientDraftPayload} from '../src/m26/workflows/client-onboarding.js';

const workflow=fs.readFileSync('src/m26/workflows/client-onboarding.js','utf8');
const transport=fs.readFileSync('src/m26/supabase-transport.js','utf8');
const application=fs.readFileSync('src/m26/app/application.js','utf8');
const routeRender=fs.readFileSync('src/m26/modules/route-render.js','utf8');

test('client creation stays on the authenticated RPC and never reroutes through retired onboarding Edge code',()=>{
  assert.doesNotMatch(workflow,/iberfit-client-onboarding-v1/u);
  assert.doesNotMatch(workflow,/installClientOnboardingInvitationTransport/u);
  assert.doesNotMatch(workflow,/invitationTarget/u);
  assert.match(transport,/request\(\`\/rest\/v1\/rpc\/\$\{CLIENT_ONBOARDING_RPC\.create\}\`/u);
  assert.match(transport,/method:'POST',token,body/u);
  assert.match(application,/transport\.clientOnboardingPreflight\(token\)/u);
  assert.match(application,/transport\.createClientDraft\(token,payload\)/u);
});

test('shared Coach/Admin create payload creates an expediente without implicitly requesting app access',()=>{
  const payload=legacyClientDraftPayload({
    initialAssessmentMode:'deferred',
    name:'Persona QA',
    email:'persona.qa@example.invalid',
    phone:'+56911111111',
    birthDate:'1990-01-01',
    modality:'online',
  });
  assert.equal(payload.accessEnabled,false);
  assert.equal(payload.inviteClient,false);
  assert.equal(payload.onboardingVersion,'m26-v12.5-expediente');
});

test('shared onboarding UI states that client access is managed separately by Administration',()=>{
  assert.match(routeRender,/El acceso a la app se gestiona por separado desde Administración\./u);
  assert.match(routeRender,/El acceso del cliente se gestiona por separado desde Administración\./u);
  assert.doesNotMatch(routeRender,/IBERFIT enviará la invitación al correo cuando corresponda\./u);
  assert.doesNotMatch(routeRender,/se prepara el acceso asociado al correo/u);
});

test('canonical Admin invitation remains a separate protected surface',()=>{
  const adminTransport=fs.readFileSync('src/m26/admin/transport.js','utf8');
  const inviteEdge=fs.readFileSync('supabase/functions/iberfit-admin-client-invite-v1/index.ts','utf8');
  assert.match(adminTransport,/iberfit-admin-client-invite-v1/u);
  assert.match(inviteEdge,/await userClient\.auth\.getUser\(\)/u);
  assert.match(inviteEdge,/iberfit_admin_execute_v14/u);
});
