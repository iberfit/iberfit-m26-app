import {defineConfig} from '@playwright/test';

if(process.platform!=='linux'){
  throw new Error('RC64_2B_VISUAL_BASELINE_LINUX_ONLY');
}

export default defineConfig({
  testDir:'./qa/rc64',
  testMatch:'visual.spec.mjs',
  fullyParallel:false,
  forbidOnly:true,
  retries:0,
  workers:1,
  reporter:'line',
  timeout:30_000,
  expect:{
    timeout:5_000,
    toHaveScreenshot:{
      animations:'disabled',
      caret:'hide',
      scale:'css',
      maxDiffPixelRatio:0.002,
    },
  },
  use:{
    baseURL:'http://127.0.0.1:4195',
    locale:'es-ES',
    timezoneId:'America/Santiago',
    colorScheme:'dark',
    reducedMotion:'reduce',
    serviceWorkers:'block',
    trace:'off',
    screenshot:'off',
    video:'off',
  },
  webServer:{
    command:'node qa/rc64/real-shell-server.mjs 4195 127.0.0.1',
    url:'http://127.0.0.1:4195/',
    reuseExistingServer:false,
    timeout:30_000,
  },
  projects:[
    {
      name:'visual-desktop-chromium',
      use:{browserName:'chromium',viewport:{width:1440,height:1000},hasTouch:false,isMobile:false},
    },
    {
      name:'visual-mobile-chromium',
      use:{browserName:'chromium',viewport:{width:390,height:844},hasTouch:true,isMobile:true},
    },
  ],
});
