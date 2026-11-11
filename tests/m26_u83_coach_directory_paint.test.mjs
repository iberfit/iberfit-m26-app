import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const css=readFileSync(new URL('../src/m26/design/role-surfaces.css',import.meta.url),'utf8');
const routeQa=readFileSync(new URL('../qa/signature-u26-authenticated-professional-routes.mjs',import.meta.url),'utf8');

test('U83 Coach directory retains every interactive card and applies offscreen paint containment only on compatible browsers',()=>{
  assert.match(css,/@supports \(content-visibility: auto\)/u);
  assert.match(css,/\.m26-shell\[data-m26-role="coach"\] \.m26-followup-panel/u);
  assert.match(css,/\.m26-shell\[data-m26-role="coach"\] \.m26-coach-productivity-toolbar/u);
  assert.match(css,/\.m26-shell\[data-m26-role="coach"\] \.m26-client-card/u);
  assert.match(css,/content-visibility: auto/u);
  assert.match(css,/contain-intrinsic-size: auto 20rem/u);
});

test('U83 the real trusted route-to-paint SLA remains 5 seconds with bounded, anonymous long-task diagnostics',()=>{
  assert.match(routeQa,/toBeLessThanOrEqual\(5_000\)/u);
  assert.match(routeQa,/event\.isTrusted!==true/u);
  assert.match(routeQa,/readLongTasks/u);
  assert.match(routeQa,/long-animation-frame/u);
  assert.match(routeQa,/durationMs:Math\.round\(duration\)/u);
  assert.doesNotMatch(routeQa,/toBeLessThanOrEqual\(6_000\)/u);
});
