import {defineConfig} from '@playwright/test';

export default defineConfig({
  testDir:'./qa/device-experience',
  testMatch:'device-experience.spec.mjs',
  fullyParallel:false,
  forbidOnly:true,
  retries:0,
  workers:1,
  reporter:'line',
  timeout:120_000,
  expect:{timeout:10_000},
  use:{
    baseURL:'http://127.0.0.1:4216',
    browserName:'chromium',
    serviceWorkers:'block',
    trace:'retain-on-failure',
    screenshot:'only-on-failure',
    video:'off',
    reducedMotion:'reduce',
  },
  webServer:{
    command:'node qa/rc64/static-server.mjs 4216 127.0.0.1',
    url:'http://127.0.0.1:4216/qa/rc64/fixture.html',
    reuseExistingServer:false,
    timeout:30_000,
  },
  projects:[
    {name:'device-desktop-chromium',use:{viewport:{width:1440,height:1000},hasTouch:false,isMobile:false}},
    {name:'device-tablet-portrait-chromium',use:{viewport:{width:1024,height:1366},hasTouch:true,isMobile:true,deviceScaleFactor:2}},
    {name:'device-tablet-landscape-chromium',use:{viewport:{width:1366,height:1024},hasTouch:true,isMobile:true,deviceScaleFactor:2}},
    {name:'device-mobile-chromium',use:{viewport:{width:390,height:844},hasTouch:true,isMobile:true,deviceScaleFactor:3}},
  ],
});
