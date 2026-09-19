import {defineConfig} from '@playwright/test';

export default defineConfig({
  testDir:'./qa/admin-interaction',
  testMatch:['mobile-hit-diagnostic.spec.mjs'],
  fullyParallel:false,
  forbidOnly:true,
  retries:0,
  workers:1,
  reporter:'line',
  timeout:60_000,
  expect:{timeout:10_000},
  use:{
    baseURL:'http://127.0.0.1:4208',
    serviceWorkers:'block',
    trace:'retain-on-failure',
    screenshot:'only-on-failure',
    video:'off',
  },
  webServer:{
    command:'node qa/rc64/static-server.mjs 4208 127.0.0.1',
    url:'http://127.0.0.1:4208/qa/admin-interaction/client-form-continuity.fixture.html',
    reuseExistingServer:false,
    timeout:30_000,
  },
  projects:[
    {name:'admin-mobile-chromium',use:{browserName:'chromium',viewport:{width:390,height:844},hasTouch:true,isMobile:true}},
    {name:'admin-mobile-webkit',use:{browserName:'webkit',viewport:{width:390,height:844},hasTouch:true,isMobile:true}},
  ],
});
