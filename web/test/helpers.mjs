import { createServer } from 'node:http'
import { spawn } from 'node:child_process'

export function stubAPI(routes) {
  const calls = []
  const srv = createServer((req, res) => {
    let raw = ''
    req.on('data', (c) => { raw += c })
    req.on('end', () => {
      let body = null
      try { body = raw ? JSON.parse(raw) : null } catch { body = raw }
      calls.push({ method: req.method, url: req.url, body })
      const h = routes[`${req.method} ${req.url}`] ?? routes[req.url]
      res.setHeader('content-type', 'application/json')
      if (!h) { res.statusCode = 404; res.end('{"error":"not_found"}'); return }
      res.statusCode = h.status ?? 200
      res.end(JSON.stringify(h.body ?? {}))
    })
  })
  return new Promise((resolve) =>
    srv.listen(0, () => resolve({ srv, port: srv.address().port, calls, close: () => srv.close() })))
}

export async function startSSR(apiPort, port) {
  const child = spawn('node', ['server.mjs'], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: String(port), API_BASE: `http://127.0.0.1:${apiPort}`, NODE_ENV: 'development' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const deadline = Date.now() + 30000
  while (Date.now() < deadline) {
    try { if ((await fetch(`http://127.0.0.1:${port}/healthz-ssr`)).ok) break } catch {}
    await new Promise((r) => setTimeout(r, 300))
  }
  return { child, kill: () => child.kill() }
}
