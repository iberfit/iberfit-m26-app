import {defineConfig} from '@playwright/test';

export default defineConfig({
  testDir:'./qa/m45-release-cert',
  testMatch:'m45-release-cert.spec.mjs',
  fullyParallel:false,
  forbidOnly:true,
  retries:0,
  workers:1,
  reporter:'line',
  timeout:240_000,
  expect:{timeout:20_000},
  use:{
    browserName:'chromium',
    trace:'retain-on-failure',
    screenshot:'only-on-failure',
    video:'off',
    serviceWorkers:'block',
  },
  projects:[{name:'qa-m45-release-cert-chromium'}],
});
