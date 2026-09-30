import test from 'node:test';
import assert from 'node:assert/strict';

import {summarizeWearableData} from '../src/m26/wearables/normalization.js';
import {buildProgressHub} from '../src/m26/engagement/progress-hub.js';
import {buildIberfitDecisionBrief} from '../src/m26/intelligence/decision-brief.js';

const NOW=new Date('2026-09-28T12:00:00.000Z');
const CLIENT='wearable-decision-client';

function wearable(date,{quality='alta',steps=8000}={}){
  return {
    id:`health-connect:${CLIENT}:${date}`,
    clientId:CLIENT,
    provider:'health_connect',
    date,
    steps,
    quality,
    sourceUpdatedAt:`${date}T23:00:00.000Z`,
  };
}

function stateWithWearables(records){
  return {
    collections:{
      wearableDailySummaries:records,
      appointments:[],
      sessions:[],
      sessionExecutions:[],
      checkins:[],
      iriAssessments:[],
    },
    pendingOperations:[],
    conflicts:[],
    rejectedOperations:[],
  };
}

test('wearable summary preserves window coverage while separating current decision evidence',()=>{
  const summary=summarizeWearableData([
    wearable('2026-09-28'),
    wearable('2026-09-27'),
    wearable('2026-09-23'),
  ],{now:NOW,days:7});

  assert.equal(summary.daysWithData,3);
  assert.equal(summary.freshness,'reciente');
  assert.equal(summary.decision.eligible,true);
  assert.equal(summary.decision.currentEvidenceDays,2);
  assert.equal(summary.decision.historicalContextDays,1);
  assert.deepEqual(summary.decision.providers,['health_connect']);
  assert.equal(summary.decision.quality,'media');
});

test('stale wearable coverage remains visible but is not eligible as current evidence',()=>{
  const summary=summarizeWearableData([
    wearable('2026-09-24'),
    wearable('2026-09-23'),
  ],{now:NOW,days:7});

  assert.equal(summary.daysWithData,2);
  assert.equal(summary.freshness,'atrasada');
  assert.equal(summary.decision.eligible,false);
  assert.equal(summary.decision.currentEvidenceDays,0);
  assert.equal(summary.decision.historicalContextDays,2);
  assert.deepEqual(summary.decision.providers,[]);
});

test('Progress Hub does not inflate recent evidence with stale wearable days',()=>{
  const hub=buildProgressHub(
    stateWithWearables([
      wearable('2026-09-24'),
      wearable('2026-09-23'),
    ]),
    CLIENT,
    {now:NOW},
  );
  const activity=hub.pillars.find((pillar)=>pillar.id==='activity');

  assert.equal(activity.status,'insufficient');
  assert.equal(activity.value,null);
  assert.match(activity.evidence,/2 días con datos disponibles/u);
  assert.match(activity.evidence,/sin evidencia suficientemente reciente/u);
  assert.match(activity.context,/Atrasada/u);
  assert.equal(hub.evidenceCount,0);
  assert.equal(hub.headline,'Construyendo tu seguimiento');
});

test('Progress Hub counts only fresh wearable days as current activity evidence',()=>{
  const hub=buildProgressHub(
    stateWithWearables([
      wearable('2026-09-28'),
      wearable('2026-09-27'),
      wearable('2026-09-23'),
    ]),
    CLIENT,
    {now:NOW},
  );
  const activity=hub.pillars.find((pillar)=>pillar.id==='activity');

  assert.equal(activity.status,'strong');
  assert.equal(activity.value,2);
  assert.equal(activity.unit,'días con evidencia actual');
  assert.match(activity.evidence,/2 días con datos actuales/u);
  assert.match(activity.context,/1 día solo como contexto histórico/u);
  assert.equal(hub.evidenceCount,1);
});

test('Decision Brief keeps stale wearable data as a limitation instead of evidence',()=>{
  const wearableSummary=summarizeWearableData([
    wearable('2026-09-24'),
    wearable('2026-09-23'),
  ],{now:NOW,days:7});
  const brief=buildIberfitDecisionBrief({summary:{wearable:wearableSummary}});

  assert.equal(brief.evidenceCount,0);
  assert.ok(brief.limitations.some((item)=>/frescura \(atrasada\).*no permite tratarlos como evidencia actual/u.test(item)));
  assert.equal(brief.signals.some((item)=>/datos actuales de dispositivo/u.test(item)),false);
});

test('Decision Brief accepts fresh wearable context without inventing values',()=>{
  const wearableSummary=summarizeWearableData([
    wearable('2026-09-28'),
  ],{now:NOW,days:7});
  const brief=buildIberfitDecisionBrief({summary:{wearable:wearableSummary}});

  assert.equal(brief.evidenceCount,1);
  assert.ok(brief.signals.some((item)=>/1 día con datos actuales de dispositivo/u.test(item)));
  assert.equal(brief.limitations.some((item)=>/frescura/u.test(item)),false);
});
