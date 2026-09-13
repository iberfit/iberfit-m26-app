import {defineConfig} from '@playwright/test';

export default defineConfig({
  testDir:'./qa/admin-interaction',
  testMatch:'admin-visual-evidence.spec.mjs',
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
    trace:'off',
    screenshot:'off',
    video:'off',
    reducedMotion:'reduce',
  },
  webServer:{
    command:'node qa/rc64/static-server.mjs 4208 127.0.0.1',
    url:'http://127.0.0.1:4208/qa/admin-interaction/fixture.html',
    reuseExistingServer:false,
    timeout:30_000,
  },
  projects:[
    {name:'admin-visual-desktop',use:{browserName:'chromium',viewport:{width:1440,height:1000},hasTouch:false,isMobile:false}},
    {name:'admin-visual-tablet',use:{browserName:'chromium',viewport:{width:1024,height:1366},hasTouch:true,isMobile:true}},
    {name:'admin-visual-tablet-landscape',use:{browserName:'chromium',viewport:{width:1366,height:1024},hasTouch:true,isMobile:true}},
    {name:'admin-visual-mobile',use:{browserName:'chromium',viewport:{width:390,height:844},hasTouch:true,isMobile:true}},
  ],
});
