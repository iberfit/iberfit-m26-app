import {defineConfig} from '@playwright/test';

export default defineConfig({
  testDir:'./qa/coach-today',
  testMatch:'coach-today-visual-evidence.spec.mjs',
  fullyParallel:false,
  forbidOnly:true,
  retries:0,
  workers:1,
  reporter:'line',
  timeout:60_000,
  expect:{timeout:10_000},
  use:{
    baseURL:'http://127.0.0.1:4210',
    locale:'es-ES',
    timezoneId:'America/Santiago',
    serviceWorkers:'block',
    trace:'off',
    screenshot:'off',
    video:'off',
    reducedMotion:'reduce',
  },
  webServer:{
    command:'node qa/rc64/static-server.mjs 4210 127.0.0.1',
    url:'http://127.0.0.1:4210/qa/coach-today/fixture.html',
    reuseExistingServer:false,
    timeout:30_000,
  },
  projects:[
    {name:'coach-hoy-desktop',use:{browserName:'chromium',viewport:{width:1440,height:1000},hasTouch:false,isMobile:false}},
    {name:'coach-hoy-mobile',use:{browserName:'chromium',viewport:{width:390,height:844},hasTouch:true,isMobile:true}},
  ],
});
