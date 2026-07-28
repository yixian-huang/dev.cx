import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { mkdtempSync, copyFileSync, rmSync } from 'node:fs'
import { resolve as resolvePath } from 'node:path'

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

async function startSSR(apiPort, port = 5199) {
  const child = spawn('node', ['server.mjs'], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: String(port), API_BASE: `http://127.0.0.1:${apiPort}`, NODE_ENV: 'development' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const deadline = Date.now() + 30000
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/healthz-ssr`)
      if (r.ok) break
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 300))
  }
  return { child, port }
}

test('serves server-rendered html for the home route', async () => {
  const api = await stubAPI({})
  const ssr = await startSSR(api.port)
  try {
    const res = await fetch(`http://127.0.0.1:${ssr.port}/`)
    const html = await res.text()
    assert.equal(res.status, 200)
    assert.ok(html.includes('<title>'), 'no title injected')
    assert.ok(html.includes('property="og:title"'), 'no og tags injected')
    assert.ok(!html.includes('<!--app-html-->'), 'placeholder not replaced')
    assert.ok(html.includes('id="root"'))
  } finally { ssr.child.kill(); api.srv.close() }
})

test('injects prefetched data as window.__DEVCX_DATA__', async () => {
  const api = await stubAPI({
    '/api/resolve/chip': { body: { user: { handle: 'chip', display_name: 'Chip Zhang', bio: 'bio here' } } },
  })
  const ssr = await startSSR(api.port)
  try {
    const res = await fetch(`http://127.0.0.1:${ssr.port}/@chip`)
    const html = await res.text()
    assert.equal(res.status, 200)
    assert.ok(html.includes('__DEVCX_DATA__'), 'data script missing')
    assert.ok(html.includes('Chip Zhang'), 'prefetched name not in html')
  } finally { ssr.child.kill(); api.srv.close() }
})

test('falls back to the SPA shell when rendering throws', async () => {
  // API 返回 500 会让 prefetch 抛错；服务器必须降级而不是 500 白屏
  const api = await stubAPI({ '/api/resolve/boom': { status: 500, body: { error: 'internal' } } })
  const ssr = await startSSR(api.port)
  try {
    const res = await fetch(`http://127.0.0.1:${ssr.port}/@boom`)
    const html = await res.text()
    assert.equal(res.status, 200, 'fallback must still be 200')
    assert.ok(html.includes('id="root"'), 'shell missing')
    assert.ok(html.includes('entry-client'), 'client bootstrap missing from fallback')
  } finally { ssr.child.kill(); api.srv.close() }
})

test('static asset requests are not swallowed by the ssr handler', async () => {
  const api = await stubAPI({})
  const ssr = await startSSR(api.port)
  try {
    const res = await fetch(`http://127.0.0.1:${ssr.port}/src/entry-client.tsx`)
    assert.ok(res.status === 200, `expected vite to serve the module, got ${res.status}`)
  } finally { ssr.child.kill(); api.srv.close() }
})

// 确定性地触发"模板本身加载失败"分支：把 server.mjs 拷贝到一个不含
// index.html 的临时目录里运行——它的 __dirname 跟着拷贝位置走，
// readFile('index.html') 必然 ENOENT，而不用改动任何共享源文件（那样
// 会和并发跑的其它测试文件抢同一份 index.html/src，引入不确定性）。
async function startBrokenSSR(apiPort) {
  const tmpDir = mkdtempSync(resolvePath(process.cwd(), '.tmp-broken-ssr-'))
  const serverCopy = resolvePath(tmpDir, 'server.mjs')
  copyFileSync(resolvePath(process.cwd(), 'server.mjs'), serverCopy)

  const port = 5198
  const child = spawn('node', [serverCopy], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: String(port), API_BASE: `http://127.0.0.1:${apiPort}`, NODE_ENV: 'development' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const deadline = Date.now() + 30000
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/healthz-ssr`)
      if (r.ok) break
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 300))
  }
  return { child, port, cleanup: () => rmSync(tmpDir, { recursive: true, force: true }) }
}

test('falls back to a hardcoded shell when the template itself fails to load', async () => {
  const api = await stubAPI({})
  const ssr = await startBrokenSSR(api.port)
  try {
    const res = await fetch(`http://127.0.0.1:${ssr.port}/`)
    const html = await res.text()
    assert.equal(res.status, 200, 'must degrade to 200, never a white page/500')
    assert.ok(html.includes('id="root"'), 'fallback shell missing root mount point')
    assert.ok(html.includes('entry-client'), 'fallback shell missing client bootstrap script')
  } finally {
    ssr.child.kill()
    api.srv.close()
    ssr.cleanup()
  }
})

// 回归测试：display_name/bio 里的 $'/$& 曾经会被字符串形式的 .replace()
// 当作特殊替换模式解析（$& = 整个匹配，$' = 匹配之后的模板剩余部分），
// 导致占位符注释原样漏进 DOM，甚至让 __DEVCX_DATA__ 的 <script> 提前
// 被模板里后续的 </script> 截断，水合数据丢失、客户端静默摔回 mock 数据。
// 用函数形式的替换参数修复后，这里的用户内容必须被当作纯字面量写入。
test('user content with $ replacement patterns does not corrupt template injection', async () => {
  const bio = "Rock $'n' Roll $& co"
  const api = await stubAPI({
    '/api/resolve/dollar': {
      body: { user: { handle: 'dollar', display_name: "Dollar $& Corp $' Inc", bio } },
    },
  })
  const ssr = await startSSR(api.port, 5206)
  try {
    const res = await fetch(`http://127.0.0.1:${ssr.port}/@dollar`)
    const html = await res.text()
    assert.equal(res.status, 200)
    assert.ok(html.includes('__DEVCX_DATA__'), 'data script missing')
    assert.ok(!html.includes('<!--app-html-->'), 'app-html placeholder leaked into DOM')
    assert.ok(!html.includes('<!--app-data-->'), 'app-data placeholder leaked into DOM')
    assert.ok(html.includes(bio), 'hydration data corrupted: bio with $ patterns not intact')
    assert.equal(res.headers.get('cache-control'), 'no-store', 'ssr html response must be no-store')
  } finally { ssr.child.kill(); api.srv.close() }
})

// 回归测试：dist/client/index.html（生产态同理走 vite 的 /index.html）是
// SSR 模板本体，带着未替换的占位符注释；sirv/vite 若把它当静态资源原样
// 吐出去，客户端 entry 会对着空注释节点 hydrate。必须 301 回 '/' 落回 SSR。
test('/index.html redirects to / instead of serving the raw SSR template', async () => {
  const api = await stubAPI({})
  const ssr = await startSSR(api.port, 5207)
  try {
    const res = await fetch(`http://127.0.0.1:${ssr.port}/index.html`, { redirect: 'manual' })
    assert.equal(res.status, 301)
    assert.equal(res.headers.get('location'), '/')
  } finally { ssr.child.kill(); api.srv.close() }
})
