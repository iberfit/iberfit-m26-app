import test from 'node:test';
import assert from 'node:assert/strict';

import { createSessionController } from '../src/m26/workflows/session-controller.js';

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function createButton(action) {
  const attributes = new Map([['data-session-action', action]]);
  return {
    disabled: false,
    closest(selector) {
      return selector === '[data-session-action]' ? this : null;
    },
    getAttribute(name) {
      return attributes.has(name) ? attributes.get(name) : null;
    },
    setAttribute(name, value) {
      attributes.set(name, String(value));
    },
    removeAttribute(name) {
      attributes.delete(name);
    },
  };
}

function createRoot() {
  const listeners = new Map();
  const templateName = { value: 'Plantilla sesión' };

  return {
    ownerDocument: { activeElement: null },

    addEventListener(type, handler) {
      const current = listeners.get(type) || [];
      current.push(handler);
      listeners.set(type, current);
    },

    removeEventListener(type, handler) {
      const current = listeners.get(type) || [];
      listeners.set(type, current.filter((entry) => entry !== handler));
    },

    querySelector(selector) {
      if (selector === '[data-session-template-name]') return templateName;
      return null;
    },

    querySelectorAll() {
      return [];
    },

    async emitClick(button) {
      const event = {
        target: button,
        preventDefault() {},
      };
      for (const handler of listeners.get('click') || []) {
        await handler(event);
      }
    },
  };
}

function passiveEventTarget(extra = {}) {
  return {
    ...extra,
    addEventListener() {},
    removeEventListener() {},
  };
}

test('session actions serialize across re-renders and release the lock after failure', async () => {
  const root = createRoot();
  const firstAttempt = deferred();
  const firstStarted = deferred();
  const errors = [];
  let saveCalls = 0;

  const context = {
    actionState: null,
    async saveTemplate(name) {
      assert.equal(name, 'Plantilla sesión');
      saveCalls += 1;

      if (saveCalls === 1) {
        firstStarted.resolve();
        return await firstAttempt.promise;
      }

      return { ok: true };
    },
  };

  const telemetry = {
    start() {},
    pause() {},
    resume() {},
    stop() {},
  };

  const controller = createSessionController({
    root,
    getContext: () => context,
    render() {},
    onError: (error) => errors.push(error),
    liveTelemetryController: telemetry,
    lifecycleTarget: passiveEventTarget(),
    visibilityTarget: passiveEventTarget({ visibilityState: 'visible' }),
    clockTarget: {},
  });

  controller.mount();

  const firstButton = createButton('save-template');
  const firstClick = root.emitClick(firstButton);

  await firstStarted.promise;
  assert.equal(saveCalls, 1);

  const replacementButton = createButton('save-template');
  await root.emitClick(replacementButton);

  assert.equal(
    saveCalls,
    1,
    'a replacement DOM button must not dispatch while a session action is pending',
  );

  firstAttempt.reject(new Error('simulated persistence failure'));
  await firstClick;

  assert.equal(errors.length, 1);
  assert.match(errors[0]?.message || '', /simulated persistence failure/);

  const retryButton = createButton('save-template');
  await root.emitClick(retryButton);

  assert.equal(saveCalls, 2, 'session action lock must be released after failure');

  controller.destroy();
});
