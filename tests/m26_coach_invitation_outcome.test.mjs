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
