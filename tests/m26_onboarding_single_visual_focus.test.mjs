import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source=()=>fs.readFileSync('src/m26/onboarding/progressive-onboarding.js','utf8').replace(/\r\n/g,'\n');

test('guided tour visually de-emphasizes the progressive panel without removing capabilities',()=>{
  const text=source();
  const start=text.indexOf('const PROGRESSIVE_ONBOARDING_COMPACT_STYLE_TEXT=');
  assert.ok(start>=0);
  const styles=text.slice(start,start+7000);

  assert.ok(styles.includes('.m26-progressive-onboarding{'));
  assert.ok(styles.includes('opacity:.62'));
  assert.ok(styles.includes('filter:saturate(.82) brightness(.9)'));
  assert.ok(styles.includes('.m26-guided-tour{'));
  assert.ok(styles.includes('background:color-mix('));
  assert.ok(styles.includes('box-shadow:0 28px 90px'));
  assert.doesNotMatch(styles,/display\s*:\s*none|visibility\s*:\s*hidden|pointer-events\s*:\s*none/iu);
});

test('compact mobile guided tour further reduces background competition without blocking it',()=>{
  const text=source();
  const start=text.indexOf('@media (max-width:900px)');
  assert.ok(start>=0);
  const mobile=text.slice(start,start+1800);

  assert.ok(mobile.includes('.m26-progressive-onboarding'));
  assert.ok(mobile.includes('opacity:.54'));
  assert.ok(mobile.includes('filter:saturate(.78) brightness(.86)'));
  assert.ok(mobile.includes('.m26-guided-tour'));
  assert.ok(mobile.includes('max-height:min(58vh,32rem)'));
  assert.doesNotMatch(mobile,/display\s*:\s*none|visibility\s*:\s*hidden|pointer-events\s*:\s*none/iu);
});

test('reduced motion also covers progressive panel focus transition',()=>{
  const text=source();
  const start=text.indexOf('@media (prefers-reduced-motion:reduce)');
  assert.ok(start>=0);
  const reduced=text.slice(start,start+900);
  assert.ok(reduced.includes('.m26-progressive-onboarding'));
  assert.ok(reduced.includes('transition:none'));
});

test('guided-tour-open lifecycle remains attribute driven and fail-soft',()=>{
  const text=source();
  assert.ok(text.includes("export const PROGRESSIVE_ONBOARDING_TOUR_OPEN_ATTRIBUTE='data-m26-guided-tour-open'"));
  assert.ok(text.includes("if(open)root?.setAttribute?.(PROGRESSIVE_ONBOARDING_TOUR_OPEN_ATTRIBUTE,'true');"));
  assert.ok(text.includes('else root?.removeAttribute?.(PROGRESSIVE_ONBOARDING_TOUR_OPEN_ATTRIBUTE);'));
  assert.ok(text.includes('onOpenChange:(open)=>tourOpenState.set(open)'));
  assert.ok(text.includes('tourOpenState.clear()'));
});
