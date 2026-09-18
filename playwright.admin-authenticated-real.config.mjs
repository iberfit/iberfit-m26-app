// QA_ADMIN_AUTHENTICATED_REAL_TRIGGER\nimport {defineConfig} from '@playwright/test';

export default defineConfig({
  testDir:'./qa/admin-authenticated-real',
  testMatch:'admin-authenticated-real.spec.mjs',
  fullyParallel:false,
  forbidOnly:true,
  retries:0,
  workers:1,
  reporter:'line',
  timeout:150_000,
  expect:{timeout:20_000},
  use:{
    browserName:'chromium',
    trace:'retain-on-failure',
    screenshot:'only-on-failure',
    video:'off',
    serviceWorkers:'block',
  },
  projects:[
    {name:'qa-admin-authenticated-real-chromium'},
  ],
});
