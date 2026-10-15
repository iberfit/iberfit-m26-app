import {defineConfig,devices} from '@playwright/test';
export default defineConfig({
  testDir:'./qa/m44',
  testMatch:'evolution-report.spec.mjs',
  fullyParallel:false,
  forbidOnly:Boolean(process.env.CI),
  retries:0,
  workers:1,
  timeout:45_000,
  reporter:'line',
  use:{trace:'retain-on-failure',screenshot:'only-on-failure',locale:'es-CL',timezoneId:'America/Santiago'},
  projects:[
    {name:'m44-report-desktop',use:{browserName:'chromium',viewport:{width:1440,height:990}}},
    {name:'m44-report-tablet',use:{browserName:'chromium',viewport:{width:820,height:1180},hasTouch:true}},
    {name:'m44-report-mobile',use:{browserName:'chromium',...devices['iPhone 13']}},
  ],
});
