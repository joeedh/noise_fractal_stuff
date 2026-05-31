import http from 'http'

/* Headers required for SharedArrayBuffer and WebGL js-profiling. esbuild's
 * own serve cannot set custom response headers, so this thin proxy sits in
 * front of it on the public port and injects them. Mirrors serv.mjs. */
function addHeaders(res, origin, allowedOrigins) {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  if (allowedOrigins.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin)
  }
  res.setHeader('Document-Policy', 'js-profiling')
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin')
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin')
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp')
  res.setHeader('Vary', 'Origin')
}

/* Start an HTTP proxy on `publicPort` that forwards to the esbuild dev
 * server at `target` and injects the COOP/COEP headers on every response. */
export function startHeaderProxy({publicPort, host, target}) {
  const allowedOrigins = new Set([
    `http://${host}:${publicPort}/`,
    `http://${host}:${publicPort}`,
  ])

  const proxy = http.createServer((req, res) => {
    const origin = req.headers['origin'] || ''

    const opts = {
      hostname: target.host,
      port: target.port,
      path: req.url,
      method: req.method,
      headers: req.headers,
    }

    const upstream = http.request(opts, (up) => {
      addHeaders(res, origin, allowedOrigins)
      res.writeHead(up.statusCode ?? 502, up.headers)
      up.pipe(res, {end: true})
    })

    upstream.on('error', (err) => {
      res.statusCode = 502
      res.end('proxy error: ' + err.message)
    })

    req.pipe(upstream, {end: true})
  })

  return new Promise((resolve) => {
    proxy.listen(publicPort, host, () => {
      console.log(`Dev server (with COOP/COEP) on http://${host}:${publicPort}`)
      resolve(proxy)
    })
  })
}
