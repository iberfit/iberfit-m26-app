import {defineConfig} from '@playwright/test';
export default defineConfig({
  testDir:'./qa/coach-builder',
  testMatch:'coach-builder-visual-evidence.spec.mjs',
  fullyParallel:false,forbidOnly:true,retries:0,workers:1,reporter:'line',timeout:75_000,
  expect:{timeout:10_000},
  use:{baseURL:'http://127.0.0.1:4210',locale:'es-ES',timezoneId:'America/Santiago',
    serviceWorkers:'block',trace:'off',screenshot:'off',video:'off',reducedMotion:'reduce'},
  webServer:{command:'node qa/rc64/static-server.mjs 4210 127.0.0.1',
    url:'http://127.0.0.1:4210/qa/coach-builder/fixture.html',reuseExistingServer:false,timeout:30_000},
  projects:[
    {name:'coach-builder-mobile-320',use:{browserName:'chromium',viewport:{width:320,height:720},hasTouch:true,isMobile:true}},
    {name:'coach-builder-mobile-390',use:{browserName:'chromium',viewport:{width:390,height:844},hasTouch:true,isMobile:true}},
    {name:'coach-builder-tablet',use:{browserName:'chromium',viewport:{width:1024,height:768},hasTouch:true,isMobile:true}},
    {name:'coach-builder-desktop',use:{browserName:'chromium',viewport:{width:1440,height:1000},hasTouch:false,isMobile:false}},
  ],
});
