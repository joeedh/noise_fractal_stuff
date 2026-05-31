import esbuild from 'esbuild'
import {buildOptions} from './esbuild.config.mjs'

await esbuild.build(
  buildOptions({
    minify: true,
    sourcemap: true,
  })
)

console.log('build complete')
