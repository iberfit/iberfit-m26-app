import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {sessionFocusPlan,sessionFocusSecondarySelectors} from '../src/m26/ui/session-readiness.js';

test('modo foco conserva la acción principal según el estado real de Live Workout',()=>{
  assert.equal(sessionFocusPlan({state:'ready'}).targetSelector,'[data-session-action="start"]');
  assert.equal(sessionFocusPlan({state:'feedback'}).targetSelector,'[data-session-action="finish"]');
  assert.equal(sessionFocusPlan({state:'paused'}).targetSelector,'[data-session-action="resume"]');
  assert.equal(sessionFocusPlan({state:'active',hasCompleteSet:true}).targetSelector,'[data-session-action="complete-set"]');
  assert.equal(sessionFocusPlan({state:'rest',hasNext:true}).targetSelector,'[data-session-action="next"]');
  assert.equal(sessionFocusPlan({state:'completed'}),null);
  assert.equal(sessionFocusPlan({state:'cancelled'}),null);
});

test('mando rápido del Coach solo expone proxies seguros ya existentes',()=>{
  assert.deepEqual(
    sessionFocusSecondarySelectors({
      state:'active',
      role:'coach',
      hasRepeat:true,
    }),
    ['[data-session-action="repeat-previous-set"]']
  );
  assert.deepEqual(
    sessionFocusSecondarySelectors({
      state:'rest',
      role:'coach',
      hasRestMinus:true,
      hasRestPlus:true,
    }),
    [
      '[data-session-action="rest-minus"]',
      '[data-session-action="rest-plus"]',
    ]
  );
  assert.deepEqual(
    sessionFocusSecondarySelectors({
      state:'active',
      role:'client',
      hasRepeat:true,
    }),
    []
  );
  assert.deepEqual(
    sessionFocusSecondarySelectors({
      state:'rest',
      role:'client',
      hasRestMinus:true,
      hasRestPlus:true,
    }),
    []
  );
});


test('dock de sesión actúa como proxy y no duplica la lógica de entrenamiento',async()=>{
  const ui=await readFile(new URL('../src/m26/ui/session-readiness.js',import.meta.url),'utf8');
  assert.match(ui,/data-session-focus-proxy/);
  assert.match(ui,/target\.click\?\.\(\)/);
  assert.match(ui,/data-session-action="complete-set"/);
  assert.match(ui,/data-session-action="next"/);
  assert.match(ui,/data-session-action="repeat-previous-set"/);
  assert.match(ui,/data-session-action="rest-minus"/);
  assert.match(ui,/data-session-action="rest-plus"/);
  assert.match(ui,/data-session-focus-role/);
  assert.match(ui,/target\.getAttribute\?\.\('aria-label'\)/);
  assert.match(ui,/target\.getAttribute\?\.\('title'\)/);
  assert.match(ui,/state\.role=role/);
  assert.match(ui,/m27-session-focus-coach/);
  assert.match(ui,/m27-session-focus-dock:not\(\.is-coach\)/);
  assert.match(ui,/m27-session-focus-dock\.is-coach/);
  assert.match(ui,/@media \(min-width:761px\) and \(max-width:1180px\)/);
  assert.match(ui,/@media \(max-width:760px\)/);
  assert.match(ui,/@media \(forced-colors:active\)/);
  assert.match(ui,/safe-area-inset-bottom/);
  assert.match(ui,/touch-action:manipulation/);
  assert.doesNotMatch(ui,/MutationObserver/);
  assert.doesNotMatch(ui,/innerHTML/);
  assert.doesNotMatch(ui,/service[_-]?role/i);
});

test('mantiene la pantalla activa solo durante trabajo o descanso y libera recursos al destruir',async()=>{
  const [ui,shell]=await Promise.all([
    readFile(new URL('../src/m26/ui/session-readiness.js',import.meta.url),'utf8'),
    readFile(new URL('../src/m26/shell/shell-controller.js',import.meta.url),'utf8'),
  ]);
  assert.match(ui,/ACTIVE_WAKE_STATES=new Set\(\['active','rest'\]\)/);
  assert.match(ui,/wakeLock\.request\('screen'\)/);
  assert.match(ui,/visibilitychange/);
  assert.match(ui,/releaseWakeLock/);
  assert.match(shell,/enhanceSessionReadiness\(\{root,viewModel,state\}\);\s*enhanceSessionFocus\(\{root,viewModel\}\);/);
  assert.match(shell,/teardownSessionFocus\(\{root\}\)/);
});

test('session focus dock preserves mobile touch access without overlaying readiness, pause or feedback',async()=>{
  const [ui,staticStyles]=await Promise.all([
    readFile(new URL('../src/m26/ui/session-readiness.js',import.meta.url),'utf8'),
    readFile(new URL('../src/m26/design/runtime-static.css',import.meta.url),'utf8'),
  ]);
  assert.match(ui,/\['ready','feedback','paused'\]\.includes\(plan\.state\)/u);
  assert.match(ui,/dock\.classList\.contains\('is-inline'\)/u);
  assert.match(ui,/live\.classList\?\.remove\?\.\('m27-session-focus-inline'\)/u);
  for(const source of [ui,staticStyles]){
    assert.match(source,/\.m27-session-focus-dock\.is-inline\{position:static/u);
    assert.match(source,/\.m27-session-focus-active\.m27-session-focus-inline\{padding-bottom:0\}/u);
    assert.match(source,/\.m27-session-focus-dock\.is-inline \.m27-session-focus-actions\{width:100%;max-width:none\}/u);
    assert.match(source,/\.m27-session-focus-dock\{position:fixed/u);
  }
});

test('pausa y feedback mantienen controles primarios ANTES del panel de telemetría en móvil',async()=>{
  const source=await readFile(new URL('../src/m26/workflows/session-ui.js',import.meta.url),'utf8');
  const paused=source.split("if(execution.status==='paused'){")[1]?.split("if(execution.status==='cancelled'){")[0];
  const feedback=source.split("if(execution.status==='awaiting_feedback'){")[1]?.split("if(execution.status==='paused'){")[0];
  assert.ok(paused&&feedback);
  assert.ok(paused.indexOf('data-session-action="resume"')<paused.indexOf('${liveTelemetryStrip(execution,catalog)}'));
  assert.ok(feedback.indexOf('data-session-action="finish"')<feedback.indexOf('${liveTelemetryStrip(execution,catalog)}'));
  assert.ok(paused.includes('data-session-action="exit-session"'));
  assert.ok(feedback.includes('data-session-feedback-rpe'));
  assert.equal((paused.match(/\$\{liveTelemetryStrip\(execution,catalog\)\}/g)||[]).length,1);
  assert.equal((feedback.match(/\$\{liveTelemetryStrip\(execution,catalog\)\}/g)||[]).length,1);
});

test('paused workout keeps actual Resume and Exit above potentially long title and metrics',async()=>{
  const source=await readFile(new URL('../src/m26/workflows/session-ui.js',import.meta.url),'utf8');
  const section=source.split("if(execution.status==='paused'){")[1]?.split("if(execution.status==='cancelled'){")[0];
  assert.ok(section);
  const eyebrow=section.indexOf('Sesión en pausa');
  const controls=section.indexOf('data-session-paused-early-controls');
  const resume=section.indexOf('data-session-action="resume"');
  const heading=section.indexOf('<h2>');
  const metrics=section.indexOf('$'+'{sessionLiveSummary(execution,session)}');
  const telemetry=section.indexOf('$'+'{liveTelemetryStrip(execution,catalog)}');
  assert.ok(eyebrow>=0&&controls>eyebrow&&resume>controls);
  assert.ok(heading>resume&&metrics>heading&&telemetry>metrics);
  assert.equal((section.match(/data-session-action="resume"/g)||[]).length,1);
});

test('primary touch controls remain locked across an in-flight session ACK and restore from real validity',async()=>{
  const source=await readFile(new URL('../src/m26/workflows/session-controller.js',import.meta.url),'utf8');
  assert.match(source,/function syncPendingNextControls\(\)/u);
  assert.match(source,/querySelectorAll\?\.\('\[data-session-focus-proxy\]'\)/u);
  assert.match(source,/data-session-focus-target/u);
  assert.match(source,/if\(target\)targets[.]add\(target\)/u);
  assert.match(source,/data-m26-wait-for-ack/u);
  assert.match(source,/button[.]disabled=true/u);
  assert.match(source,/data-m28-set-validation/u);
  assert.match(source,/data-valid/u);
  assert.match(source,/if\(sessionActionPending\)queueMicrotask\(syncPendingNextControls\)/u);
  assert.match(source,/sessionActionPending=false;if\(root[.]dataset\)delete root[.]dataset[.]m26SessionActionPending;syncPendingNextControls\(\)/u);
  assert.match(source,/ensureSessionClockTicker\(getContext\(\)\);syncPendingNextControls\(\)/u);
});

test('session focus proxies cannot resurrect any next primary command during an outstanding remote action',async()=>{
  const controller=await readFile(new URL('../src/m26/workflows/session-controller.js',import.meta.url),'utf8');
  const focus=await readFile(new URL('../src/m26/ui/session-readiness.js',import.meta.url),'utf8');
  assert.match(controller,/root[.]dataset[.]m26SessionActionPending='true'/u);
  assert.match(controller,/delete root[.]dataset[.]m26SessionActionPending/u);
  assert.match(focus,/data-m26-session-action-pending="true"/u);
  assert.match(focus,/const waitingForAck=root[.]dataset\?[.]m26SessionActionPending==='true'/u);
  assert.match(focus,/const waitingForAck=Boolean\(live[.]closest\?\.\('\[data-m26-session-action-pending="true"\]'\)\)/u);
  assert.match(focus,/target&&!target[.]disabled&&!waitingForAck&&!proxy[.]disabled/u);
  assert.match(focus,/proxy[.]dataset[.]m26WaitForAck='true'/u);
  assert.match(focus,/state[.]onInput=\(event\)=>\{[\s\S]*?scheduleFocusRefresh\(root,state\)/u);
  assert.match(focus,/root[.]addEventListener\?\.\('input',state[.]onInput\)/u);
  assert.match(focus,/root[.]removeEventListener\?\.\('input',state[.]onInput\)/u);
  assert.doesNotMatch(focus,/selector==='\[data-session-action="next"\]'\s*&&/u);
});

test('feedback closure is the first actionable mobile panel and inline dock stays beside its phase',async()=>{
  const [ui,focus]=await Promise.all([
    readFile(new URL('../src/m26/workflows/session-ui.js',import.meta.url),'utf8'),
    readFile(new URL('../src/m26/ui/session-readiness.js',import.meta.url),'utf8'),
  ]);
  const feedback=ui.split("if(execution.status==='awaiting_feedback'){")[1]?.split("if(execution.status==='paused'){")[0];
  assert.ok(feedback);
  assert.ok(feedback.indexOf('data-session-live-feedback')<feedback.indexOf('m26-session-live-hero'));
  assert.ok(feedback.indexOf('data-session-action="finish"')<feedback.indexOf('m26-session-live-hero'));
  assert.equal((feedback.match(/data-session-action="finish"/g)||[]).length,1);
  assert.ok(feedback.indexOf('data-session-feedback-pain-detail')<feedback.indexOf('data-session-action="finish"'));
  assert.match(focus,/plan[.]state==='feedback'/u);
  assert.match(focus,/inlineAnchor[.]insertAdjacentElement\('afterend',dock\)/u);
  assert.match(focus,/else live[.]append\(dock\)/u);
});
