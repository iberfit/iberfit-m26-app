import {defineConfig} from '@playwright/test';

export default defineConfig({
  testDir:'./qa/coach-iri-document-privileged',
  testMatch:'iri-document-privileged.spec.mjs',
  fullyParallel:false,
  forbidOnly:true,
  retries:0,
  workers:1,
  reporter:'line',
  timeout:300_000,
  expect:{timeout:20_000},
  use:{
    browserName:'chromium',
    trace:'retain-on-failure',
    screenshot:'only-on-failure',
    video:'off',
    serviceWorkers:'block',
  },
  projects:[{name:'qa-coach-iri-document-privileged-chromium'}],
});
