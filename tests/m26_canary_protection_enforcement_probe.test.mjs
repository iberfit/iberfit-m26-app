import test from 'node:test';
import assert from 'node:assert/strict';

test('IBERFIT Canary protection enforcement probe - intentional failure', () => {
  assert.fail('INTENTIONAL_CANARY_PROTECTION_PROBE');
});