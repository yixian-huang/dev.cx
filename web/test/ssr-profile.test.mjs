import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'

function stubAPI(routes) {
  const srv = createServer((req, res) => {
    const h = routes[req.url]
    res.setHeader('content-type', 'application/json')
    if (!h) { res.statusCode = 404; res.end('{"error":"not_found"}'); return }
    res.statusCode = h.status ?? 200
    res.end(JSON.stringify(h.body))
  })
  return new Promise((r) => srv.listen(0, () => r({ srv, port: srv.address().port })))
}

async function startSSR(apiPort, port) {
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
  return child
}

test('profile page renders api data, not mock data', async () => {
  const api = await stubAPI({
    '/api/resolve/realuser': {
      body: { user: {
        handle: 'realuser', display_name: '真实用户', bio: '这是来自 API 的简介',
        avatar_url: '', status: 'building', weekly_status: '本周在写 SSR', github_verified: true, links: [],
      } },
    },
  })
  const child = await startSSR(api.port, 5205)
  try {
    const html = await (await fetch('http://127.0.0.1:5205/@realuser')).text()
    assert.ok(html.includes('真实用户'), 'api display_name not rendered')
    assert.ok(html.includes('这是来自 API 的简介'), 'api bio not rendered')
    assert.ok(!html.includes('Chip Zhang'), 'mock data leaked into ssr output')
  } finally { child.kill(); api.srv.close() }
})
