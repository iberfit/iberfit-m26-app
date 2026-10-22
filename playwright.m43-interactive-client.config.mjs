import {defineConfig} from '@playwright/test';

// Exactly ONE controlled browser mutates ONE fresh synthetic QA-only workout.
// Other devices keep their read-only M43 visual verification independently.
export default defineConfig({
  testDir:'./qa/rc64',
  testMatch:/m43-client-interactive\.spec\.mjs/,
  fullyParallel:false,workers:1,retries:0,
  reporter:'line',timeout:180_000,expect:{timeout:20_000},
  use:{
    baseURL:'http://127.0.0.1:4198',locale:'es-ES',
    timezoneId:'America/Santiago',serviceWorkers:'block',
    screenshot:'only-on-failure',trace:'off',reducedMotion:'reduce',
  },
  webServer:{
    command:'node qa/rc64/real-shell-server.mjs 4198 127.0.0.1',
    url:'http://127.0.0.1:4198/',reuseExistingServer:false,timeout:30_000,
  },
  projects:[{
    name:'m43-interactive-mobile-chromium',
    use:{browserName:'chromium',viewport:{width:390,height:844},hasTouch:true,isMobile:true},
  }],
});
