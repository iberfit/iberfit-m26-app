import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const edge=fs.readFileSync('supabase/functions/iberfit-admin-client-invite-v1/index.ts','utf8');
const catalog=fs.readFileSync('src/m26/admin/command-catalog.js','utf8');
const transport=fs.readFileSync('src/m26/admin/transport.js','utf8');
const service=fs.readFileSync('src/m26/admin/service.js','utf8');
const controller=fs.readFileSync('src/m26/admin/controller.js','utf8');
const render=fs.readFileSync('src/m26/admin/route-render.js','utf8');

test('invitation resend is a registered privileged client command routed through the same edge',()=>{
  assert.match(catalog,/ADMIN_CLIENTE_REENVIAR_INVITACION:\{entityType:'client'/u);
  assert.match(transport,/\['ADMIN_CLIENTE_CREAR','ADMIN_CLIENTE_REENVIAR_INVITACION'\]\.includes\(type\)/u);
  assert.match(service,/PRIVILEGED_REAUTH_COMMANDS=new Set\(\[[^\]]*'ADMIN_CLIENTE_REENVIAR_INVITACION'/u);
  assert.match(controller,/type:'ADMIN_CLIENTE_REENVIAR_INVITACION'/u);
  assert.match(controller,/kind==='client-invite-resend'/u);
});

test('resend command is client-scoped and cannot accidentally create another client',()=>{
  assert.match(edge,/const FUNCTION_VERSION='admin-client-invite-v26\.4'/u);
  assert.match(edge,/\['ADMIN_CLIENTE_CREAR','ADMIN_CLIENTE_REENVIAR_INVITACION'\]\.includes\(type\)/u);
  assert.match(edge,/if\(type==='ADMIN_CLIENTE_REENVIAR_INVITACION'\)[\s\S]{0,500}V26_INVITATION_CLIENT_INVALID/u);

  const branchStart=edge.indexOf("if(normalized.type==='ADMIN_CLIENTE_CREAR'){");
  const prepare=edge.indexOf("userClient.rpc('iberfit_admin_client_invitation_prepare_v26'",branchStart);
  assert.ok(branchStart>=0&&prepare>branchStart);
  const dispatch=edge.slice(branchStart,prepare);
  assert.match(dispatch,/iberfit_admin_execute_v14/u);
  assert.match(dispatch,/else\{[\s\S]*commandType:normalized\.type/u);

  const resendElse=dispatch.slice(dispatch.indexOf('}else{'));
  assert.doesNotMatch(resendElse,/iberfit_admin_execute_v14/u);
  assert.match(resendElse,/clientId,/u);
});

test('provider failures preserve the original command type for audit traceability',()=>{
  assert.match(edge,/commandType:normalized\.type,entityId:clientId/u);
  assert.doesNotMatch(edge,/commandType:'ADMIN_CLIENTE_CREAR',entityId:clientId/u);
});

test('security failures stay 403 so Admin service can perform WebAuthn reauthentication',()=>{
  const catchStart=edge.indexOf('}catch(error){');
  assert.ok(catchStart>=0);
  const tail=edge.slice(catchStart);
  assert.match(tail,/ADMIN_REQUIRED\|AUTH_REQUIRED\|WEBAUTHN\|ASSURANCE\|FORBIDDEN/u);
  assert.match(tail,/return reply\(403,\{ok:false,code:errorCode,version:FUNCTION_VERSION\},origin\)/u);
});

test('Admin exposes retry only for failed delivery and never for pending or sent states',()=>{
  assert.match(render,/function clientInvitationRetry\(c\)/u);
  assert.match(render,/if\(delivery!=='error'\)return ''/u);
  assert.match(render,/['"]client-invite-resend['"]/u);
  assert.match(render,/Reintentar invitación/u);
  assert.match(controller,/client-invite-resend/u);
  assert.match(controller,/client:\$\{value\('clientId'\)\|\|'unknown'\}/u);
});

test('resend success copy distinguishes sent, already-sent, pending and retryable error',()=>{
  assert.match(controller,/function invitationResendSuccess\(result=\{\}\)/u);
  assert.match(controller,/Invitación reenviada correctamente/u);
  assert.match(controller,/no se duplicó el correo/u);
  assert.match(controller,/Reenvío solicitado/u);
  assert.match(controller,/sigue pendiente para reintento/u);
});
