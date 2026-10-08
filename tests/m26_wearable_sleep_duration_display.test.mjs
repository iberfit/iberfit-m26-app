import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {formatSleepDuration} from '../src/m26/wearables/duration-format.js';

test('sleep minutes are displayed in hours and zero-padded minutes',()=>{
  assert.equal(formatSleepDuration(450),'7 h 30 min');
  assert.equal(formatSleepDuration(61),'1 h 01 min');
  assert.equal(formatSleepDuration(59),'0 h 59 min');
  assert.equal(formatSleepDuration(480),'8 h 00 min');
  assert.equal(formatSleepDuration(0),'0 h 00 min');
  assert.equal(formatSleepDuration(450,{perDay:true}),'7 h 30 min/día');
  assert.equal(formatSleepDuration(479.6),'8 h 00 min');
});

test('invalid or missing sleep duration does not show a fabricated value',()=>{
  for(const value of [null,undefined,'450','',-1,NaN,Infinity,-Infinity]){
    assert.equal(formatSleepDuration(value),null);
  }
});

test('preview, wellness context and confirmed overview all use sleep duration formatting',()=>{
  const controller=readFileSync(new URL('../src/m26/wearables/controller.js',import.meta.url),'utf8');
  const route=readFileSync(new URL('../src/m26/modules/route-render.js',import.meta.url),'utf8');
  assert.match(controller,/import \{formatSleepDuration\} from '\.\/duration-format\.js'/u);
  assert.equal((controller.match(/formatSleepDuration\(summary\.metrics\.sleepMinutes\)/gu)||[]).length,2);
  assert.doesNotMatch(controller,/'Sueño medio',[\s\S]{0,75}'min'/u);
  assert.match(route,/formatSleepDuration\(finiteOptionalNumber\(minutes\),\{perDay:true\}\)/u);
  assert.match(route,/sleepHoursPerDay\(wearableSummary\.metrics\.sleepMinutes\)/u);
});
