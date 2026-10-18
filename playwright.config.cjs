const {defineConfig} = require('@playwright/test');
module.exports = defineConfig({
  testDir: './test/browser',
  outputDir: 'output/playwright/results',
  workers: 1,
  use: {baseURL: 'http://127.0.0.1:4173', browserName: 'chromium', headless: true},
  webServer: {command: 'node test/server.cjs', url: 'http://127.0.0.1:4173', reuseExistingServer: false}
});
