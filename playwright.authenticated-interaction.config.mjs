import {defineConfig} from '@playwright/test';

export default defineConfig({
  testDir:'./qa/rc64',
  testMatch:'authenticated-interaction-multiapp.spec.mjs',
  fullyParallel:false,
  forbidOnly:true,
  retries:0,
  workers:1,
  reporter:'line',
  timeout:120_000,
  expect:{timeout:20_000},
  use:{
    baseURL:'http://127.0.0.1:4197',
    locale:'es-ES',
    timezoneId:'America/Santiago',
    serviceWorkers:'block',
    trace:'retain-on-failure',
    screenshot:'only-on-failure',
    video:'off',
    reducedMotion:'reduce',
  },
  webServer:{
    command:'node qa/rc64/real-shell-server.mjs 4197 127.0.0.1',
    url:'http://127.0.0.1:4197/',
    reuseExistingServer:false,
    timeout:30_000,
  },
  projects:[
    {name:'auth-interaction-desktop-chromium',use:{browserName:'chromium',viewport:{width:1440,height:1000},hasTouch:false,isMobile:false}},
    {name:'auth-interaction-tablet-chromium',use:{browserName:'chromium',viewport:{width:1024,height:1366},hasTouch:true,isMobile:true}},
    {name:'auth-interaction-tablet-768-landscape-chromium',use:{browserName:'chromium',viewport:{width:1024,height:768},hasTouch:true,isMobile:true}},
    {name:'auth-interaction-tablet-landscape-chromium',use:{browserName:'chromium',viewport:{width:1366,height:1024},hasTouch:true,isMobile:true}},
    {name:'auth-interaction-mobile-chromium',use:{browserName:'chromium',viewport:{width:390,height:844},hasTouch:true,isMobile:true}},
  ],
});