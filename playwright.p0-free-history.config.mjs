import {defineConfig} from '@playwright/test';
export default defineConfig({
 testDir:'./qa/p0-free-history',testMatch:'live-client-a.spec.mjs',
 fullyParallel:false,workers:1,retries:0,forbidOnly:true,reporter:'line',
 timeout:200000,expect:{timeout:20000},
 use:{baseURL:'https://m26-canary.iberfit.cl',locale:'es-ES',
 timezoneId:'America/Santiago',serviceWorkers:'block',
 trace:'retain-on-failure',screenshot:'only-on-failure',video:'off',reducedMotion:'reduce'},
 projects:[{name:'qa-client-history-live-chromium',use:{browserName:'chromium',viewport:{width:1440,height:960}}}]
});