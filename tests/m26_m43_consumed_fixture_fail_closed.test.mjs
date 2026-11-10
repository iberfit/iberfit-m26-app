import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

// An interrupted browser job may already have completed its QA-only workout.
// Never mask missing startable sessions with synthetic data or auto replay.
test('M43 failed-only rerun refuses to re-open a previously completed session',()=>{
  const source=readFileSync(new URL('../qa/rc64/m43-client-interactive.spec.mjs',import.meta.url),'utf8');
  const probe=source.indexOf("const completedFixture=page.locator('[data-m43-session-history] [data-m43-completed-session]')");
  const startable=source.indexOf("await expect(card,'Only this GitHub run synthetic Client session is startable')");
  assert.ok(probe>0 && startable>probe,'check consumed fixture before requiring a startable one');
  assert.match(source,/filter\(\{hasText:LIVE\}\)/u);
  assert.match(source,/if\(await completedFixture\.count\(\)\)\{\s*throw Error\('M43_SYNTHETIC_FIXTURE_ALREADY_COMPLETED_NEW_RUN_REQUIRED'\);/u);
  assert.match(source,/expect\(unexpectedHttp\)\.toEqual\(\[\]\)/u,'HTTP 500 remains a hard failure');
  assert.doesNotMatch(source,/retry.*auto.?complete|force.?start|skip.*completed.*pass/iu);
});
