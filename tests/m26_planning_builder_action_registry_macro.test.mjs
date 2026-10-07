import test from 'node:test';
import assert from 'node:assert/strict';
import {M26_ACTION_REGISTRY,assertActionAllowed} from '../src/m26/ui/interactive-audit.js';

test('acciones nuevas del builder están registradas y restringidas a Admin/Coach',()=>{
  for(const action of ['restore-block','clear-library-filters']){
    assert.deepEqual(M26_ACTION_REGISTRY[action],{roles:['admin','coach'],domain:'session'});
    assert.equal(assertActionAllowed(action,'admin'),true);
    assert.equal(assertActionAllowed(action,'coach'),true);
    assert.equal(assertActionAllowed(action,'client'),false);
  }
});
