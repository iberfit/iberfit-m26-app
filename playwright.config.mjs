import {defineConfig} from '@playwright/test';

const CI=Boolean(process.env.CI);

export default defineConfig({
  testDir:'./qa/rc64',
  testMatch:'quality-platform.spec.mjs',
  fullyParallel:true,
  forbidOnly:CI,
  retries:CI?1:0,
  workers:CI?2:undefined,
  reporter:'line',
  timeout:30_000,
  expect:{timeout:5_000},
  use:{
    baseURL:'http://127.0.0.1:4173',
    trace:'retain-on-failure',
    screenshot:'only-on-failure',
    video:'off',
  },
  webServer:{
    command:'node qa/rc64/static-server.mjs 4173 127.0.0.1',
    url:'http://127.0.0.1:4173/qa/rc64/fixture.html',
    reuseExistingServer:!CI,
    timeout:30_000,
  },
  projects:[
    {
      name:'desktop-chromium',
      use:{
        browserName:'chromium',
        viewport:{width:1440,height:1000},
        hasTouch:false,
        isMobile:false,
      },
    },
    {
      name:'tablet-chromium',
      use:{
        browserName:'chromium',
        viewport:{width:1024,height:1366},
        hasTouch:true,
        isMobile:true,
      },
    },
    {
      name:'mobile-chromium',
      use:{
        browserName:'chromium',
        viewport:{width:390,height:844},
        hasTouch:true,
        isMobile:true,
      },
    },
  ],
});