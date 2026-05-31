import {defineConfig, devices} from '@playwright/test'

/* e2e tests drive the real app served by the esbuild dev server (port 5000,
 * with the COOP/COEP header proxy). WebGL must work in headless Chromium, so
 * fall back to ANGLE/SwiftShader software rendering. */
export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  expect: {
    toHaveScreenshot: {
      /* WebGL sampling is nondeterministic; allow a generous pixel diff. */
      maxDiffPixelRatio: 0.05,
    },
  },
  use: {
    baseURL: 'http://localhost:5000',
    viewport: {width: 1280, height: 720},
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          args: [
            '--use-gl=angle',
            '--use-angle=swiftshader',
            '--enable-unsafe-swiftshader',
            '--ignore-gpu-blocklist',
          ],
        },
      },
    },
  ],
  webServer: {
    command: 'node scripts/dev.mjs',
    url: 'http://localhost:5000/',
    reuseExistingServer: true,
    timeout: 60000,
  },
})
