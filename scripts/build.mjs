import esbuild from 'esbuild'
import {buildOptions} from './esbuild.config.mjs'

await esbuild.build(
  buildOptions({
    minify: false,
    keepNames: true,
    sourcemap: true,
  })
)

console.log('build complete')
