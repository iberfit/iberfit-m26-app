import {defineConfig} from '@playwright/test';

export default defineConfig({
  testDir:'./qa/coach-webauthn-recurring',
  testMatch:'coach-webauthn-recurring.spec.mjs',
  fullyParallel:false,
  forbidOnly:true,
  retries:0,
  workers:1,
  reporter:'line',
  timeout:180_000,
  expect:{timeout:20_000},
  use:{
    browserName:'chromium',
    trace:'retain-on-failure',
    screenshot:'only-on-failure',
    video:'off',
    serviceWorkers:'block',
  },
  projects:[{name:'qa-coach-webauthn-recurring-chromium'}],
});
