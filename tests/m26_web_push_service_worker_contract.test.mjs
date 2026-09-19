import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const source=await readFile(new URL('../public/m26/iberfit-sw.js',import.meta.url),'utf8');

test('canonical service worker registers visible push and click handlers',()=>{
  assert.match(source,/addEventListener\('push'/);
  assert.match(source,/registration\.showNotification/);
  assert.match(source,/addEventListener\('notificationclick'/);
  assert.match(source,/clients\.matchAll/);
  assert.match(source,/clients\.openWindow\('\/'\)/);
});

test('lock-screen push copy is generic and ignores remote payload content',()=>{
  assert.match(source,/Tienes una actualización en IBERFIT\./);
  assert.doesNotMatch(source,/event\.data/);
  assert.doesNotMatch(source,/payload\.(title|body)/);
  assert.doesNotMatch(source,/notification\.data\.url/);
});

test('push click cannot navigate to an untrusted remote deep link',()=>{
  assert.match(source,/new URL\(client\.url\)\.origin===self\.location\.origin/);
  assert.match(source,/openWindow\('\/'\)/);
  assert.doesNotMatch(source,/openWindow\([^'\"]*event/);
});
