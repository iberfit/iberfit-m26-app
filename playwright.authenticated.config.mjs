import {defineConfig} from '@playwright/test';

export default defineConfig({
  testDir:'./qa/rc64',
  testMatch:'authenticated-current-contract.spec.mjs',
  fullyParallel:false,
  forbidOnly:true,
  retries:0,
  workers:1,
  reporter:'line',
  timeout:90_000,
  expect:{timeout:20_000},
  use:{
    baseURL:'http://127.0.0.1:4196',
    serviceWorkers:'block',
    trace:'off',
    screenshot:'off',
    video:'off',
  },
  webServer:{
    command:'node qa/rc64/real-shell-server.mjs 4196 127.0.0.1',
    url:'http://127.0.0.1:4196/',
    reuseExistingServer:false,
    timeout:30_000,
  },
  projects:[
    {
      name:'authenticated-readonly-chromium',
      use:{browserName:'chromium',viewport:{width:1440,height:1000},hasTouch:false,isMobile:false},
    },
    {
      name:'authenticated-readonly-tablet-chromium',
      use:{browserName:'chromium',viewport:{width:1024,height:1366},hasTouch:true,isMobile:true},
    },
    {
      name:'authenticated-readonly-tablet-landscape-chromium',
      use:{browserName:'chromium',viewport:{width:1366,height:1024},hasTouch:true,isMobile:true},
    },
    {
      name:'authenticated-readonly-mobile-chromium',
      use:{browserName:'chromium',viewport:{width:390,height:844},hasTouch:true,isMobile:true},
    },
  ],
});