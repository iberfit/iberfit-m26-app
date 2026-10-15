import {defineConfig,devices} from '@playwright/test';
export default defineConfig({
  testDir:'./qa/m44',
  testMatch:['evolution-report.spec.mjs','evolution-issued-ui.spec.mjs'],
  fullyParallel:false,
  forbidOnly:Boolean(process.env.CI),
  retries:0,
  workers:1,
  timeout:45_000,
  reporter:'line',
  use:{baseURL:'http://127.0.0.1:4184',trace:'retain-on-failure',screenshot:'only-on-failure',locale:'es-CL',timezoneId:'America/Santiago'},
  webServer:{
    command:'node qa/rc64/static-server.mjs 4184 127.0.0.1',
    url:'http://127.0.0.1:4184/qa/rc64/fixture.html',
    timeout:30_000,reuseExistingServer:!process.env.CI,
  },
  projects:[
    {name:'m44-report-desktop',use:{browserName:'chromium',viewport:{width:1440,height:990}}},
    {name:'m44-report-tablet',use:{browserName:'chromium',viewport:{width:820,height:1180},hasTouch:true}},
    {name:'m44-report-mobile',use:{browserName:'chromium',...devices['iPhone 13']}},
  ],
});
