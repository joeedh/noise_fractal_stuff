import esbuild from 'esbuild'
import {appDir, buildOptions} from './esbuild.config.mjs'
import {startHeaderProxy} from './serve-proxy.mjs'

const PUBLIC_PORT = 5000
const HOST = 'localhost'
const INTERNAL_PORT = 5001

const ctx = await esbuild.context(buildOptions({dev: true}))

await ctx.watch()

const server = await ctx.serve({
  servedir: appDir,
  port: INTERNAL_PORT,
  host: HOST,
  fallback: `${appDir}/index.html`,
})

await startHeaderProxy({
  publicPort: PUBLIC_PORT,
  host: HOST,
  target: {host: server.host, port: server.port},
})

console.log(`esbuild serve on http://${server.host}:${server.port} (internal)`)
