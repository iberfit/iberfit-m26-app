import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const workflow=fs.readFileSync(
  new URL('../.github/workflows/production-promote.yml',import.meta.url),
  'utf8',
);

test('production promotion preserves the real previous Service Worker on same-SHA reruns',()=>{
  assert.match(workflow,/livePreviousVersion=.*PREVIOUS_VERSION/s);
  assert.match(
    workflow,
    /const previousVersion=liveVersion===releaseVersion\?livePreviousVersion:liveVersion;/,
  );
  assert.match(workflow,/LIVE_SW_PREVIOUS_VERSION_MISSING/);
  assert.match(workflow,/LIVE_SW_LINEAGE_COLLAPSED/);
  assert.match(
    workflow,
    /PREVIOUS_VERSION='\$\{previousVersion\}'/,
  );
  assert.doesNotMatch(
    workflow,
    /PREVIOUS_VERSION='\$\{liveVersion\}'/,
  );
});
