import esbuild from 'esbuild'
import fs from 'fs/promises'
import path from 'path'
import {appDir, outDir, repoRoot, buildOptions} from './esbuild.config.mjs'

/* Assemble a clean static site for GitHub Pages.
 *
 * `pnpm build` emits the minified bundle into app/.dev/. The browser only needs
 * index.html, that bundle, and app/assets/, so we copy just those into dist/
 * rather than uploading the whole app/ tree (which carries the TS sources and
 * the path.ux submodule). The bootstrap import in index.html is relative
 * (./.dev/entry_point.js), so the site works under the project subpath
 * (joeedh.github.io/noise_fractal_stuff/). */

const distDir = path.join(repoRoot, 'dist')

/* Whitespace-only minification: strips whitespace/comments (~30% smaller) but
 * does NOT mangle identifiers or rewrite syntax. The app relies on runtime
 * reflection — nstructjs registers structs by constructor name — so esbuild's
 * full `minify` renames classes and throws "Struct a is already registered".
 * (esbuild's `keepNames` is NOT a usable workaround here: its __name() class
 * wrappers break the render loop. Whitespace-only avoids both problems.) */
await esbuild.build(
  buildOptions({
    minifyWhitespace: true,
    minifySyntax: false,
    minifyIdentifiers: false,
    sourcemap: true,
  })
)

await fs.rm(distDir, {recursive: true, force: true})
await fs.mkdir(path.join(distDir, '.dev'), {recursive: true})

await fs.copyFile(path.join(appDir, 'index.html'), path.join(distDir, 'index.html'))

for (const name of ['entry_point.js', 'entry_point.js.map']) {
  await fs.copyFile(path.join(outDir, name), path.join(distDir, '.dev', name))
}

await fs.cp(path.join(appDir, 'assets'), path.join(distDir, 'assets'), {recursive: true})

/* Belt-and-suspenders: ensure GitHub never runs Jekyll (which would strip the
 * dot-prefixed .dev/ directory). The Pages-via-Actions artifact deploy doesn't
 * run Jekyll anyway, but this keeps the output safe under any serving path. */
await fs.writeFile(path.join(distDir, '.nojekyll'), '')

console.log('pages build complete →', distDir)
