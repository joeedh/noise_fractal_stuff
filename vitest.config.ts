import {defineConfig} from 'vitest/config'

export default defineConfig({
  test: {
    /* Unit tests live next to sources as *.test.ts, plus tests/unit.
     * Playwright e2e specs live under tests/e2e and are excluded here. */
    include: ['app/**/*.test.ts', 'tests/unit/**/*.test.ts'],
    exclude: ['node_modules', 'app/path.ux', 'oldstuff', 'tests/e2e'],
    environment: 'node',
  },
})
