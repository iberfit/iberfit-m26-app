import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {renderCommunicationRoute} from '../src/m26/communication/route-render.js';

const read=(path)=>fs.readFileSync(path,'utf8').replace(/\r\n/g,'\n');

test('Activity keeps the full wellbeing workflow while making it the primary surface',()=>{
  const source=read('src/m26/modules/route-render-base.js');
  assert.ok(source.includes('m30-activity-route'));
  assert.ok(source.includes('m30-activity-primary'));
  assert.ok(source.includes('aria-labelledby="m30-activity-checkin-title"'));
  assert.ok(source.includes('m30-wellbeing-fields'));
  assert.ok(source.includes('m30-activity-submit'));
  for(const name of ['energy','sleep','stress','pain','fatigue','motivation','notes']){
    assert.ok(source.includes('name="'+name+'"'),'missing wellbeing field '+name);
  }
  for(const action of ['save-checkin-draft','submit-checkin','save-habit-draft','define-habit','log-habit']){
    assert.ok(source.includes('data-engagement-action="'+action+'"'),'missing engagement action '+action);
  }
});

test('Activity preserves the complete optional device workflow',()=>{
  const source=read('src/m26/modules/route-render-base.js');
  assert.ok(source.includes('m30-device-drawer'));
  assert.ok(source.includes('Dispositivos e integraciones opcionales'));
  assert.ok(source.includes('data-wearable-import'));
  for(const action of ['download-template','clear-preview']){
    assert.ok(source.includes('data-wearable-action="'+action+'"'),'missing wearable action '+action);
  }
  for(const provider of ['health_connect','samsung_health','strava','apple_health','fitbit','oura','garmin_connect']){
    assert.ok(source.includes('value="'+provider+'"'),'missing wearable provider '+provider);
  }
});

test('Messages keeps conversation actions and prioritizes notification center in markup',()=>{
  const vm={
    communication:true,
    kind:'communication',
    role:'client',
    canOpenThread:false,
    clients:[],
    notifications:[],
    coachCockpit:null,
    threads:[{
      id:'thread-1',
      coachName:'Entrenador',
      clientName:'Cliente',
      unreadCount:2,
      messages:[{senderRole:'coach',body:'Mensaje de prueba',createdAt:'2026-09-10T10:00:00Z'}],
    }],
  };
  const html=renderCommunicationRoute(vm);
  const notifications=html.indexOf('m26-notification-center');
  const conversations=html.indexOf('m30-conversation-panel');
  assert.ok(notifications>=0&&conversations>notifications,'notifications should precede conversations in source order');
  assert.ok(html.includes('class="m30-thread-unread"'));
  assert.ok(html.includes('data-thread-unread="2"'));
  assert.ok(html.includes('data-communication-form="message-send" class="m30-message-compose"'));
  assert.ok(html.includes('data-communication-form="thread-read" class="m30-thread-read"'));
  assert.ok(html.includes('<button type="submit" class="m26-primary-action">Enviar</button>'));
  assert.ok(html.includes('Mensaje de prueba'));
});

test('Coach can still open a new conversation after messaging redesign',()=>{
  const html=renderCommunicationRoute({
    communication:true,
    kind:'communication',
    role:'coach',
    canOpenThread:true,
    clients:[{id:'client-1',name:'Cliente Uno'}],
    notifications:[],
    coachCockpit:{items:[]},
    threads:[],
  });
  assert.ok(html.includes('data-communication-form="thread-open"'));
  assert.ok(html.includes('value="client-1"'));
  assert.ok(html.includes('m30-thread-open'));
  assert.ok(html.includes('<button type="submit" class="m26-primary-action">Abrir</button>'));
});

test('responsive activity and messaging refinements never hide or lock existing controls',()=>{
  const signature=read('src/m26/design/signature-ux-v2.css');
  const activity=signature.slice(signature.indexOf('/* Signature UX V2.3'));
  const communication=read('src/m26/communication/communication.css');
  for(const selector of ['.m30-activity-primary','.m30-wellbeing-fields','.m30-activity-submit','.m30-device-drawer']){
    assert.ok(activity.includes(selector),'missing activity refinement '+selector);
  }
  assert.ok(activity.includes('@media (max-width:900px)'));
  assert.ok(activity.includes('@media (max-width:580px)'));
  assert.ok(activity.includes('@media (max-width:360px)'));
  assert.doesNotMatch(activity,/display\s*:\s*none|visibility\s*:\s*hidden|pointer-events\s*:\s*none/iu);
  assert.ok(communication.includes('.m30-message-compose'));
  assert.ok(communication.includes('.m30-communication-grid>.m26-notification-center{grid-column:auto;order:-1}'));
  assert.doesNotMatch(communication.slice(communication.indexOf('/* IBERFIT M30')),/display\s*:\s*none|visibility\s*:\s*hidden|pointer-events\s*:\s*none/iu);
});
