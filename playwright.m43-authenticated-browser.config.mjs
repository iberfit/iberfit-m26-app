import {defineConfig} from '@playwright/test';

export default defineConfig({
  testDir:'./qa/rc64',
  testMatch:/m43-(?:client-real-history|coach-real-workspace)\.spec\.mjs/,
  fullyParallel:false,workers:1,retries:0,
  reporter:'line',timeout:120_000,
  expect:{timeout:15_000},
  use:{baseURL:'http://127.0.0.1:4198',locale:'es-ES',
    timezoneId:'America/Santiago',serviceWorkers:'block',
    screenshot:'only-on-failure',trace:'off',
    reducedMotion:'reduce'},
  webServer:{command:'node qa/rc64/real-shell-server.mjs 4198 127.0.0.1',
    url:'http://127.0.0.1:4198/',reuseExistingServer:false,timeout:30_000},
  projects:[
    {name:'m43-desktop-chromium',use:{browserName:'chromium',
      viewport:{width:1440,height:960},hasTouch:false,isMobile:false}},
    {name:'m43-tablet-touch-chromium',use:{browserName:'chromium',
      viewport:{width:1024,height:768},hasTouch:true,isMobile:true}},
    {name:'m43-mobile-touch-chromium',use:{browserName:'chromium',
      viewport:{width:390,height:844},hasTouch:true,isMobile:true}},
    {name:'m43-mobile-320-touch-chromium',use:{browserName:'chromium',
      viewport:{width:320,height:700},hasTouch:true,isMobile:true}},
  ],
});
