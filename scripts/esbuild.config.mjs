import path from 'path'
import {fileURLToPath} from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const repoRoot = path.resolve(__dirname, '..')
export const appDir = path.join(repoRoot, 'app')

/* Output is written inside app/ so esbuild's serve can hand it back at
 * /.dev/entry_point.js alongside the static assets in app/. */
export const outDir = path.join(appDir, '.dev')

export function buildOptions(overrides = {}) {
  const {dev = false, ...rest} = overrides

  /* In dev we also build the shader hot-reload target (app/dev/shaders-entry.ts
   * → /.dev/shaders.js), which re-exports the shader registry + fresh pattern
   * classes so the dev client can re-import it and swap shaders without a page
   * reload. `__DEV__` is compiled out (to `false`) in production builds, so the
   * hot-reload client tree-shakes away. */
  const entryPoints = {entry_point: path.join(appDir, 'entry_point.ts')}
  if (dev) {
    entryPoints.shaders = path.join(appDir, 'dev', 'shaders-entry.ts')
  }

  return {
    entryPoints,
    outdir: outDir,
    bundle: true,
    format: 'esm',
    target: 'es2022',
    sourcemap: true,
    define: {__DEV__: dev ? 'true' : 'false'},
    /* path.ux's electron platform code references electron/node builtins via
     * require(); these code paths never run in the browser (haveElectron is
     * false), so leave the references external rather than bundling them. */
    external: [
      'electron',
      'fs',
      'path',
      'os',
      'url',
      'net',
      'http',
      'https',
      'module',
      'child_process',
      'crypto',
    ],
    /* esbuild rewrites `.js` import specifiers to their `.ts` siblings, so
     * the app's `.js` imports keep working after the rename to TypeScript. */
    resolveExtensions: ['.ts', '.tsx', '.js', '.jsx', '.json'],
    logLevel: 'info',
    ...rest,
  }
}
