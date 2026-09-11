import {defineConfig} from '@playwright/test';

const CI=Boolean(process.env.CI);

export default defineConfig({
  testDir:'./qa/p0-pwa-upgrade',
  testMatch:'upgrade.spec.mjs',
  fullyParallel:false,
  forbidOnly:CI,
  retries:CI?1:0,
  workers:1,
  reporter:'line',
  timeout:45_000,
  expect:{timeout:5_000},
  use:{
    baseURL:'http://127.0.0.1:4186',
    browserName:'chromium',
    viewport:{width:390,height:844},
    hasTouch:true,
    isMobile:true,
    serviceWorkers:'allow',
    trace:'retain-on-failure',
    screenshot:'only-on-failure',
    video:'off',
  },
  webServer:{
    command:'node qa/p0-pwa-upgrade/server.mjs 4186 127.0.0.1',
    url:'http://127.0.0.1:4186/__p0/state',
    reuseExistingServer:!CI,
    timeout:30_000,
  },
  projects:[{
    name:'p0-installed-pwa-mobile-chromium',
    use:{browserName:'chromium'},
  }],
});
