import {defineConfig,devices} from '@playwright/test';

const CI=Boolean(process.env.CI);
const baseURL=String(process.env.M26_PROD_APP_URL||'https://app.iberfit.cl').replace(/\/+$/u,'');

export default defineConfig({
  testDir:'./qa/production-entry',
  testMatch:'production-entry.spec.mjs',
  fullyParallel:false,
  forbidOnly:CI,
  retries:0,
  workers:1,
  reporter:'line',
  timeout:50_000,
  expect:{timeout:8_000},
  use:{
    baseURL,
    locale:'es-ES',
    timezoneId:'America/Santiago',
    serviceWorkers:'allow',
    trace:'retain-on-failure',
    screenshot:'only-on-failure',
    video:'off',
  },
  projects:[
    {
      name:'production-entry-desktop-chromium',
      use:{
        browserName:'chromium',
        viewport:{width:1366,height:900},
      },
    },
    {
      name:'production-entry-tablet-chromium',
      use:{
        browserName:'chromium',
        viewport:{width:820,height:1180},
        hasTouch:true,
        isMobile:true,
        deviceScaleFactor:2,
      },
    },
    {
      name:'production-entry-mobile-chromium',
      use:{
        browserName:'chromium',
        ...devices['iPhone 13'],
      },
    },
  ],
});
