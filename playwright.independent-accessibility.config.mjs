import {defineConfig} from '@playwright/test';

export default defineConfig({
  testDir: './qa/rc64',
  testMatch: 'independent-accessibility.spec.mjs',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: 1,
  reporter: 'line',
  timeout: 45_000,
  use: {
    baseURL: 'http://127.0.0.1:4184',
    trace: 'off',
    screenshot: 'off',
    video: 'off',
  },
  webServer: {
    command: 'node qa/rc64/real-shell-server.mjs 4184 127.0.0.1',
    url: 'http://127.0.0.1:4184/',
    reuseExistingServer: false,
    timeout: 30_000,
  },
  projects: [
    {name: 'axe-mobile-320', use: {browserName: 'chromium', viewport: {width: 320, height: 760}, hasTouch: true, isMobile: true}},
    {name: 'axe-mobile-390', use: {browserName: 'chromium', viewport: {width: 390, height: 844}, hasTouch: true, isMobile: true}},
    {name: 'axe-tablet-834', use: {browserName: 'chromium', viewport: {width: 834, height: 1112}, hasTouch: true, isMobile: true}},
    {name: 'axe-desktop-1440', use: {browserName: 'chromium', viewport: {width: 1440, height: 900}, hasTouch: false, isMobile: false}},
  ],
});
