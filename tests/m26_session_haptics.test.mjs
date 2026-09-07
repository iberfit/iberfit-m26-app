import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SESSION_HAPTICS_STORAGE_KEY,
  sessionHapticsEnabled,
  setSessionHapticsEnabled,
  sessionHapticPattern,
  triggerSessionHaptic,
} from '../src/m26/experience/session-haptics.js';

function memoryStorage(){
  const values=new Map();
  return {
    getItem:(key)=>values.has(key)?values.get(key):null,
    setItem:(key,value)=>values.set(key,String(value)),
  };
}

test('la háptica está desactivada por defecto y requiere opt-in explícito',()=>{
  const storage=memoryStorage();
  assert.equal(sessionHapticsEnabled(storage),false);
  assert.equal(setSessionHapticsEnabled(true,storage),true);
  assert.equal(storage.getItem(SESSION_HAPTICS_STORAGE_KEY),'true');
  assert.equal(sessionHapticsEnabled(storage),true);
  assert.equal(setSessionHapticsEnabled(false,storage),false);
  assert.equal(sessionHapticsEnabled(storage),false);
});

test('sin consentimiento nunca llama a vibrate',()=>{
  const storage=memoryStorage();
  let calls=0;
  const navigatorLike={vibrate(){calls+=1;return true;}};
  assert.equal(triggerSessionHaptic('setComplete',{storage,navigatorLike}),false);
  assert.equal(calls,0);
});

test('con consentimiento usa patrones breves y distintos para serie y descanso',()=>{
  const storage=memoryStorage();
  setSessionHapticsEnabled(true,storage);
  const calls=[];
  const navigatorLike={vibrate(pattern){calls.push(pattern);return true;}};
  assert.equal(triggerSessionHaptic('setComplete',{storage,navigatorLike}),true);
  assert.equal(triggerSessionHaptic('restComplete',{storage,navigatorLike}),true);
  assert.deepEqual(calls[0],sessionHapticPattern('setComplete'));
  assert.deepEqual(calls[1],sessionHapticPattern('restComplete'));
  assert.notDeepEqual(calls[0],calls[1]);
});

test('navegadores sin Vibration API degradan silenciosamente',()=>{
  const storage=memoryStorage();
  setSessionHapticsEnabled(true,storage);
  assert.equal(triggerSessionHaptic('setComplete',{storage,navigatorLike:{}}),false);
});
