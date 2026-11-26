import test from 'node:test';
import assert from 'node:assert/strict';
import {sessionDeliveryOwnership,sessionDeliveryModality,actorCanExecuteSession,sessionRequiresConfirmedAppointment,sessionVisibilityLevel} from '../src/m26/rc39/session-policy.js';
const session=extra=>({status:'disponible',deliveryModality:'guiada_en_app',clientVisibilityLevel:'full',visibleToClient:true,blocks:[{type:'exercise',exerciseId:'a'}],...extra});
const can=s=>actorCanExecuteSession({role:'client',session:s});
test('legacy and explicit guided autonomous stay executable',()=>{for(const s of [session({}),session({deliveryOwnership:'client_autonomous'}),session({deliveryOwnership:'autonoma',body:{delivery_ownership:'client_autonomous'}})])assert.equal(can(s),true);});
test('unknown explicit ownership cannot become autonomous',()=>{const s=session({deliveryOwnership:'unknown'});assert.equal(can(s),false);assert.equal(sessionRequiresConfirmedAppointment({role:'coach',session:s}),true);});
test('explicit body and envelope ownership disagreement cannot grant start',()=>{const s=session({deliveryOwnership:'client_autonomous',body:{delivery_ownership:'coach_led'}});assert.equal(can(s),false);assert.equal(sessionVisibilityLevel(s),'summary_only');});
test('equivalent modality aliases are compatible',()=>assert.equal(can(session({modality:'guided_app'})),true));
test('conflicting modality aliases and unknown explicit modality close start',()=>{for(const s of [session({modality:'presencial'}),session({body:{delivery_modality:'online'}}),session({deliveryModality:'typo'})]){assert.equal(sessionDeliveryModality(s),'unknown');assert.equal(can(s),false);}});
test('online cannot bypass appointment through autonomous ownership',()=>{const s=session({deliveryModality:'online',deliveryOwnership:'client_autonomous'});assert.equal(sessionDeliveryOwnership(s),'live_online');assert.equal(sessionRequiresConfirmedAppointment({role:'coach',session:s}),true);assert.equal(can(s),false);});
test('presential supervision and explicit hidden remain protected',()=>{assert.equal(can(session({deliveryModality:'presencial',deliveryOwnership:'client_autonomous'})),false);assert.equal(can(session({visibleToClient:false,deliveryOwnership:'client_autonomous'})),false);});

test('summary-only and invalid explicit visibility never grant full execution',()=>{for(const s of [session({body:{clientVisibilityLevel:'summary_only'}}),session({clientVisibilityLevel:'typo'})]){assert.equal(sessionVisibilityLevel(s),'summary_only');assert.equal(can(s),false);}});
