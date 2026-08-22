import {defineConfig} from '@playwright/test';

const CI=Boolean(process.env.CI);

export default defineConfig({
  testDir:'./qa/rc64',
  testMatch:'real-shell.spec.mjs',
  fullyParallel:false,
  forbidOnly:CI,
  retries:CI?1:0,
  workers:1,
  reporter:'line',
  timeout:30_000,
  expect:{timeout:5_000},
  use:{
    baseURL:'http://127.0.0.1:4184',
    trace:'retain-on-failure',
    screenshot:'only-on-failure',
    video:'off',
  },
  webServer:{
    command:'node qa/rc64/real-shell-server.mjs 4184 127.0.0.1',
    url:'http://127.0.0.1:4184/',
    reuseExistingServer:!CI,
    timeout:30_000,
  },
  projects:[
    {
      name:'real-shell-desktop-chromium',
      use:{browserName:'chromium',viewport:{width:1440,height:1000},hasTouch:false,isMobile:false},
    },
    {
      name:'real-shell-laptop-chromium',
      use:{browserName:'chromium',viewport:{width:1366,height:768},hasTouch:false,isMobile:false},
    },
    {
      name:'real-shell-tablet-chromium',
      use:{browserName:'chromium',viewport:{width:1024,height:1366},hasTouch:true,isMobile:true},
    },
    {
      name:'real-shell-tablet-landscape-chromium',
      use:{browserName:'chromium',viewport:{width:1366,height:1024},hasTouch:true,isMobile:true},
    },
    {
      name:'real-shell-mobile-chromium',
      use:{browserName:'chromium',viewport:{width:390,height:844},hasTouch:true,isMobile:true},
    },
    {
      name:'real-shell-mobile-small-chromium',
      use:{browserName:'chromium',viewport:{width:360,height:800},hasTouch:true,isMobile:true},
    },
  ],
});