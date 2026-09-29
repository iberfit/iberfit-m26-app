import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const indexPath = new URL('../public/m26/index.html', import.meta.url);
const preflightPath = new URL('../public/m26/pwa-preflight.js', import.meta.url);

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
}

test('PWA preflight is external, ordered before app bootstrap, and keeps inline scripts out', async () => {
  const html = await readFile(indexPath, 'utf8');
  const preflightTag = '<script src="/m26/pwa-preflight.js"></script>';
  const appTag = '<script type="module" src="/m26/app.js"></script>';

  assert.match(html, /<script src="\/m26\/pwa-preflight\.js"><\/script>/u);
  assert.ok(html.indexOf(preflightTag) < html.indexOf(appTag));
  assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>/iu);
});

test('PWA preflight adopts a worker that was already installing before listeners were attached', async () => {
  const source = await readFile(preflightPath, 'utf8');
  let stateChange = null;
  let updateFound = null;
  const messages = [];

  const installing = {
    state: 'installing',
    addEventListener(type, listener) {
      if (type === 'statechange') stateChange = listener;
    },
    removeEventListener() {},
  };

  const registration = {
    installing,
    waiting: null,
    addEventListener(type, listener) {
      if (type === 'updatefound') updateFound = listener;
    },
  };

  const serviceWorker = {
    controller: {},
    async getRegistration(scope) {
      assert.equal(scope, '/');
      return registration;
    },
  };

  vm.runInNewContext(source, { navigator: { serviceWorker } });
  await flushMicrotasks();

  assert.equal(typeof updateFound, 'function');
  assert.equal(typeof stateChange, 'function');

  registration.waiting = {
    postMessage(message) {
      messages.push(message);
    },
  };
  installing.state = 'installed';
  stateChange();

  assert.equal(messages.length, 1);
  assert.equal(messages[0]?.type, 'SKIP_WAITING');
});

test('PWA preflight activates an already waiting worker immediately', async () => {
  const source = await readFile(preflightPath, 'utf8');
  const messages = [];
  const registration = {
    installing: null,
    waiting: {
      postMessage(message) {
        messages.push(message);
      },
    },
    addEventListener() {},
  };
  const serviceWorker = {
    controller: {},
    async getRegistration() {
      return registration;
    },
  };

  vm.runInNewContext(source, { navigator: { serviceWorker } });
  await flushMicrotasks();

  assert.equal(messages.length, 1);
  assert.equal(messages[0]?.type, 'SKIP_WAITING');
});
