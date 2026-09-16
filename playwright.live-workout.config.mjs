import {defineConfig} from '@playwright/test';

export default defineConfig({
  testDir:'./qa/live-workout',
  testMatch:'live-workout-browser.spec.mjs',
  fullyParallel:false,
  forbidOnly:true,
  retries:0,
  workers:1,
  reporter:'line',
  timeout:75_000,
  expect:{timeout:10_000},
  use:{
    baseURL:'http://127.0.0.1:4211',
    locale:'es-ES',
    timezoneId:'America/Santiago',
    serviceWorkers:'block',
    trace:'retain-on-failure',
    screenshot:'only-on-failure',
    video:'off',
    reducedMotion:'reduce',
  },
  webServer:{
    command:'node qa/rc64/static-server.mjs 4211 127.0.0.1',
    url:'http://127.0.0.1:4211/qa/live-workout/fixture.html',
    reuseExistingServer:false,
    timeout:30_000,
  },
  projects:[
    {name:'live-workout-desktop-chromium',use:{browserName:'chromium',viewport:{width:1440,height:1000},hasTouch:false,isMobile:false}},
    {name:'live-workout-tablet-chromium',use:{browserName:'chromium',viewport:{width:1024,height:1366},hasTouch:true,isMobile:true}},
    {name:'live-workout-mobile-chromium',use:{browserName:'chromium',viewport:{width:390,height:844},hasTouch:true,isMobile:true}},
    {name:'live-workout-mobile-webkit',use:{browserName:'webkit',viewport:{width:390,height:844},hasTouch:true,isMobile:true}},
  ],
});
