import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {assertNoPendingSessionOccurrences} from '../src/m26/workflows/occurrence-session-retirement-gate.js';

const owner='10000000-0000-4000-8000-000000000001';
const session='20000000-0000-4000-8000-000000000001';
const cycle='30000000-0000-4000-8000-000000000001';
const other='40000000-0000-4000-8000-000000000001';
const day='2026-12-15';
function fixture({startDate='2026-11-01',endDate='2027-02-01'}={}){
  return {collections:{
    sessions:[{id:session,clientId:owner,cycleId:cycle,status:'disponible'}],
    trainingCycles:[{id:cycle,clientId:owner,startDate,endDate,status:'publicado'}],
  }};
}
function calendarWith(rows=[],calls=[]){
  return async params=>{
    calls.push(params);
    return {clientId:params.clientId,startDate:params.startDate,
      endDate:params.endDate,count:rows.filter(x=>
        x.localDate>=params.startDate&&x.localDate<=params.endDate).length,
      occurrences:rows.filter(x=>
        x.localDate>=params.startDate&&x.localDate<=params.endDate),
    };
  };
}
function occurrence(status,id=session){
  return {id:'50000000-0000-4000-8000-000000000001',
    clientId:owner,sessionId:id,localDate:day,
    status,revision:2};
}
test('UNIVERSAL U60 full-cycle retirement searches all dates, not cached bootstrap / today-only',async()=>{
  const calls=[];
  const proof=await assertNoPendingSessionOccurrences({
    state:fixture(),clientId:owner,sessionId:session,
    readCalendar:calendarWith([occurrence('cancelada')],calls),
  });
  assert.equal(proof.ok,true);
  assert.equal(proof.verifiedOccurrences,1);
  assert.equal(proof.verifiedThrough,'2027-02-01');
  assert.equal(calls.length,2);
  assert.deepEqual(calls.map(x=>[x.startDate,x.endDate]),[
    ['2026-11-01','2027-01-31'],
    ['2027-02-01','2027-02-01'],
  ]);
  assert.ok(calls.every(c=>c.clientId===owner&&c.limit===50));
});
test('UNIVERSAL U60 actively planned, confirmed or in-progress dates prohibit session withdrawal',async()=>{
  for(const status of ['planificada','confirmada','en_curso']){
    const calls=[];
    await assert.rejects(()=>assertNoPendingSessionOccurrences({
      state:fixture(),clientId:owner,sessionId:session,
      readCalendar:calendarWith([occurrence(status)],calls),
    }),/U60_RETIRE_ACTIVE_OCCURRENCE_EXISTS/u,status);
    assert.equal(calls.length,1,status);
  }
  for(const status of ['cancelada','completada']){
    const proof=await assertNoPendingSessionOccurrences({
      state:fixture(),clientId:owner,sessionId:session,
      readCalendar:calendarWith([occurrence(status)]),
    });
    assert.equal(proof.ok,true);
  }
});
test('UNIVERSAL U60 does not confuse another session with the retired prescription',async()=>{
  const proof=await assertNoPendingSessionOccurrences({
    state:fixture(),clientId:owner,sessionId:session,
    readCalendar:calendarWith([occurrence('en_curso',other)]),
  });
  assert.equal(proof.ok,true);
  assert.equal(proof.verifiedOccurrences,0);
});
test('UNIVERSAL U60 missing cycles, unknown owners, unreadable calendar and partial result fail closed',async()=>{
  await assert.rejects(()=>assertNoPendingSessionOccurrences({
    state:{collections:{sessions:[],trainingCycles:[]}},clientId:owner,sessionId:session,
    readCalendar:calendarWith([]),
  }),/SESSION_SCOPE_UNVERIFIED/u);
  await assert.rejects(()=>assertNoPendingSessionOccurrences({
    state:{collections:{...fixture().collections,trainingCycles:[]}},
    clientId:owner,sessionId:session,readCalendar:calendarWith([]),
  }),/CYCLE_SCOPE_UNVERIFIED/u);
  await assert.rejects(()=>assertNoPendingSessionOccurrences({
    state:fixture(),clientId:other,sessionId:session,
    readCalendar:calendarWith([]),
  }),/SESSION_SCOPE_UNVERIFIED/u);
  await assert.rejects(()=>assertNoPendingSessionOccurrences({
    state:fixture(),clientId:owner,sessionId:session,
    readCalendar:async()=>{throw Error('U60_OFFLINE');},
  }),/U60_OFFLINE/u);
  await assert.rejects(()=>assertNoPendingSessionOccurrences({
    state:fixture(),clientId:owner,sessionId:session,
    readCalendar:async query=>({clientId:owner,startDate:query.startDate,
      endDate:query.endDate,count:0,occurrences:[occurrence('cancelada')]}),
  }),/CALENDAR_RESPONSE_INVALID/u);
});
test('UNIVERSAL U60 never treats truncated or contradictory calendar pages as complete',async()=>{
  const range={startDate:'2026-11-01',endDate:'2026-11-30'};
  const complete=query=>({clientId:owner,startDate:query.startDate,
    endDate:query.endDate,count:0,occurrences:[]});
  for(const partial of [
    {hasMore:true},
    {hasMore:'false'},
    {hasMore:false,nextCursor:{localDate:'2026-11-15',id:session}},
    {hasMore:true,nextCursor:{localDate:'2026-11-15',id:session}},
  ]){
    await assert.rejects(()=>assertNoPendingSessionOccurrences({
      state:fixture(range),clientId:owner,sessionId:session,
      readCalendar:async query=>({...complete(query),...partial}),
    }),/U60_RETIRE_CALENDAR_RESPONSE_INVALID/u,
    'unread pages or inconsistent continuation metadata cannot authorize withdrawal');
  }
  const proof=await assertNoPendingSessionOccurrences({
    state:fixture(range),clientId:owner,sessionId:session,
    readCalendar:async query=>({...complete(query),hasMore:false,nextCursor:null}),
  });
  assert.equal(proof.ok,true);
  assert.equal(proof.verifiedOccurrences,0);
});
test('UNIVERSAL U60 cycle scan is strictly bounded, correct for Gregorian leap dates',async()=>{
  await assert.rejects(()=>assertNoPendingSessionOccurrences({
    state:fixture({startDate:'2026-01-01',endDate:'2029-01-01'}),
    clientId:owner,sessionId:session,readCalendar:calendarWith([]),
  }),/CYCLE_RANGE_UNBOUNDED/u);
  const calls=[];
  await assertNoPendingSessionOccurrences({
    state:fixture({startDate:'2028-02-28',endDate:'2028-03-01'}),
    clientId:owner,sessionId:session,readCalendar:calendarWith([],calls),
  });
  assert.equal(calls.length,1);
  assert.equal(calls[0].startDate,'2028-02-28');
  assert.equal(calls[0].endDate,'2028-03-01');
});
test('UNIVERSAL session withdraw requires fresh authenticated U60 date proof before CAS',()=>{
  const app=readFileSync(new URL('../src/m26/app/application.js',import.meta.url),'utf8');
  const workflow=readFileSync(new URL('../src/m26/app/workflow-controller.js',import.meta.url),'utf8');
  const ui=readFileSync(new URL('../src/m26/workflows/occurrence-qa-ui.js',import.meta.url),'utf8');
  assert.match(app,/verifySessionDateRetirement:runtime.qaOnly===true&&runtime.canary===true/u);
  assert.match(ui,/assertNoPendingSessionOccurrences/u);
  assert.match(ui,/readCalendar:range=>runtime.calendar\(range\)/u);
  const manage=workflow.slice(workflow.indexOf('async function managePublication('),
    workflow.indexOf('async function availableReportDrafts(',workflow.indexOf('async function managePublication(')));
  const indexProof=manage.indexOf('verifySessionDateRetirement({');
  assert.ok(indexProof>manage.indexOf('sessionWithdrawalDependencies('));
  assert.ok(indexProof<manage.indexOf('buildPublicationCommand('));
  assert.match(manage,/M26_SESSION_WITHDRAW_ACTOR_CHANGED/u);
});
