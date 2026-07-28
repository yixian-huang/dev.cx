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

test('known handle renders the profile page', async () => {
  const api = await stubAPI({
    '/api/resolve/chip': { body: { user: { handle: 'chip', display_name: 'Chip Zhang', bio: 'b' } } },
  })
  const child = await startSSR(api.port, 5201)
  try {
    const res = await fetch('http://127.0.0.1:5201/@chip', { redirect: 'manual' })
    const html = await res.text()
    assert.equal(res.status, 200)
    assert.ok(html.includes('Chip Zhang'), 'profile name not rendered')
    assert.ok(!html.includes('页面尚未生成'), '404 page rendered instead of profile')
  } finally { child.kill(); api.srv.close() }
})

test('renamed handle 301s to the new address', async () => {
  const api = await stubAPI({ '/api/resolve/oldname': { body: { moved_to: 'newname' } } })
  const child = await startSSR(api.port, 5202)
  try {
    const res = await fetch('http://127.0.0.1:5202/@oldname', { redirect: 'manual' })
    assert.equal(res.status, 301)
    assert.equal(res.headers.get('location'), '/@newname')
  } finally { child.kill(); api.srv.close() }
})

test('unknown handle returns http 404', async () => {
  const api = await stubAPI({})   // resolve 返回 404
  const child = await startSSR(api.port, 5203)
  try {
    const res = await fetch('http://127.0.0.1:5203/@nobody', { redirect: 'manual' })
    assert.equal(res.status, 404)
  } finally { child.kill(); api.srv.close() }
})

test('non-handle single-segment path still 404s', async () => {
  const api = await stubAPI({})
  const child = await startSSR(api.port, 5204)
  try {
    const res = await fetch('http://127.0.0.1:5204/random-segment', { redirect: 'manual' })
    assert.equal(res.status, 404)
  } finally { child.kill(); api.srv.close() }
})
