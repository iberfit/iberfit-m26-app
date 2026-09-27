import test from 'node:test';
import assert from 'node:assert/strict';

import {buildChallengeCreateCommand} from '../src/m26/engagement/command-builders.js';

const CLIENT='11111111-1111-4111-8111-111111111111';
const CHALLENGE='22222222-2222-4222-8222-222222222222';

test('group challenge intent fails closed until explicit opt-in community domain exists',()=>{
  assert.throws(
    ()=>buildChallengeCreateCommand({
      clientId:CLIENT,
      entityId:CHALLENGE,
      challenge:{
        type:'sessions',
        mode:'group',
        title:'Reto de grupo',
        target:8,
        days:28,
      },
    },{role:'coach'}),
    /M26_CHALLENGE_GROUP_REQUIRES_OPT_IN_DOMAIN/u
  );
});
