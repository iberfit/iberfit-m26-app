import test from 'node:test';
import assert from 'node:assert/strict';
import {coachInvitationOutcome} from '../src/m26/workflows/coach-invitation-outcome.js';
const receipt=(deliveryStatus,reason)=>({ok:true,invitation:{deliveryStatus,reason}});

test('Coach distinguishes provider confirmed, pending, denied and unknown delivery',()=>{
  assert.equal(coachInvitationOutcome(receipt('sent',null)).kind,'sent');
  assert.equal(coachInvitationOutcome(receipt('sent','already_sent')).kind,'sent');
  assert.equal(coachInvitationOutcome(receipt(null,'already_active')).kind,'existing');
  assert.equal(coachInvitationOutcome(receipt('pending','operation_already_prepared')).kind,'pending');
  assert.equal(coachInvitationOutcome(receipt('pending',null)).confirmed,false);
  assert.equal(coachInvitationOutcome(receipt('error',null)).confirmed,false);
  assert.equal(coachInvitationOutcome(receipt(null,null)).confirmed,false);
  assert.equal(coachInvitationOutcome({ok:true}).confirmed,false);
  assert.equal(coachInvitationOutcome({ok:false,invitation:{deliveryStatus:'sent'}}).confirmed,false);
});
test('Provider acknowledgment is not evidence that the customer opened email',()=>{
  const {message}=coachInvitationOutcome(receipt('sent',null));
  assert.match(message,/proveedor/u);
  assert.match(message,/recepción debe confirmarla el cliente/u);
});


test('All Coach invitation receipt messages have four-language static translations',async()=>{
  const {iberfitSurfaceTranslate}=await import('../src/m26/ui/i18n-surface.js');
  const messages=[
    'El proveedor no confirmó la invitación.',
    'La invitación falló. Comprueba su estado antes de volver a enviarla.',
    'Este cliente ya tiene acceso IBERFIT activo.',
    'El proveedor aceptó la invitación. La recepción debe confirmarla el cliente.',
    'Hay una invitación en curso. Comprueba su estado antes de volver a enviarla.',
    'No se pudo confirmar el estado de la invitación.',
  ];
  for(const message of messages)for(const language of ['en','fr','pt']){
    const translation=iberfitSurfaceTranslate(message,{language});
    assert.notEqual(translation,message,language+': '+message);
  }
});
