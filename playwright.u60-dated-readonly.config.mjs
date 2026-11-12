import {defineConfig} from '@playwright/test';
export default defineConfig({
  testDir:'./qa/rc64',testMatch:'u60-dated-ui-readonly.spec.mjs',
  fullyParallel:false,forbidOnly:true,retries:0,workers:1,reporter:'line',
  timeout:150000,expect:{timeout:20000},
  use:{baseURL:'http://127.0.0.1:4196',serviceWorkers:'block',trace:'off',screenshot:'off',video:'off'},
  webServer:{command:'node qa/rc64/real-shell-server.mjs 4196 127.0.0.1',
    url:'http://127.0.0.1:4196/',reuseExistingServer:false,timeout:30000},
  projects:[
    {name:'u60-readonly-desktop',use:{browserName:'chromium',viewport:{width:1440,height:900}}},
    {name:'u60-readonly-tablet',use:{browserName:'chromium',viewport:{width:1024,height:768},hasTouch:true,isMobile:true}},
    {name:'u60-readonly-mobile',use:{browserName:'chromium',viewport:{width:390,height:844},hasTouch:true,isMobile:true}},
    {name:'u60-readonly-small',use:{browserName:'chromium',viewport:{width:320,height:720},hasTouch:true,isMobile:true}},
  ],
});
