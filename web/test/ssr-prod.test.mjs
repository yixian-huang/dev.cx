import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn, execFileSync } from 'node:child_process'
import { createServer } from 'node:http'
import { existsSync } from 'node:fs'

test('production build produces both bundles', () => {
  execFileSync('npm', ['run', 'build'], { cwd: process.cwd(), stdio: 'inherit' })
  assert.ok(existsSync('dist/client/index.html'), 'client bundle missing')
  assert.ok(existsSync('dist/server/entry-server.js'), 'server bundle missing')
})

test('production server renders and serves assets', async () => {
  const api = createServer((req, res) => {
    res.setHeader('content-type', 'application/json')
    res.statusCode = 404
    res.end('{"error":"not_found"}')
  })
  await new Promise((r) => api.listen(0, r))
  const port = 5210
  const child = spawn('node', ['server.mjs'], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: String(port), NODE_ENV: 'production', API_BASE: `http://127.0.0.1:${api.address().port}` },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const deadline = Date.now() + 30000
  while (Date.now() < deadline) {
    try { if ((await fetch(`http://127.0.0.1:${port}/healthz-ssr`)).ok) break } catch {}
    await new Promise((r) => setTimeout(r, 300))
  }
  try {
    const res = await fetch(`http://127.0.0.1:${port}/`)
    const html = await res.text()
    assert.equal(res.status, 200)
    assert.ok(html.includes('<title>'), 'no ssr title in prod')
    assert.ok(html.includes('/assets/'), 'no hashed asset reference in prod html')

    // 拿到 html 里的第一个 js 资源，确认能被静态服务
    const m = html.match(/src="(\/assets\/[^"]+\.js)"/)
    assert.ok(m, 'no js asset in prod html')
    const asset = await fetch(`http://127.0.0.1:${port}${m[1]}`)
    assert.equal(asset.status, 200, 'asset not served')
    // C3:/assets/ 下是内容指纹文件,必须带一年 immutable 缓存头
    assert.match(asset.headers.get('cache-control') ?? '', /max-age=31536000.*immutable/,
      'hashed asset missing immutable cache header')
  } finally { child.kill(); api.close() }
})
