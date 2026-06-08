import {createRequire} from 'module'
import {spawn} from 'child_process'
import path from 'path'
import {fileURLToPath} from 'url'
import esbuild from 'esbuild'
import {buildOptions} from './esbuild.config.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')

// Build without identifier minification — nstructjs relies on constructor names.
console.log('Building for Electron...')
await esbuild.build(buildOptions({}))
console.log('Build complete.')

const require = createRequire(import.meta.url)
const electronBin = require('electron')

const proc = spawn(String(electronBin), [path.join(repoRoot, 'electron_base', 'main.cjs')], {
  stdio: 'inherit',
  cwd: repoRoot,
})

proc.on('close', code => process.exit(code ?? 0))
