import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { createServer as createViteServer } from 'vite'

let vite
async function loadApi() {
  vite ??= await createViteServer({ server: { middlewareMode: true }, appType: 'custom', root: process.cwd() })
  return vite.ssrLoadModule('/src/lib/api.ts')
}

function stubAPI(handler) {
  const srv = createServer(handler)
  return new Promise((resolve) => srv.listen(0, () => resolve({ srv, port: srv.address().port })))
}

test('get returns parsed json', async () => {
  const { createClient } = await loadApi()
  const { srv, port } = await stubAPI((req, res) => {
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify({ user: { handle: 'chip' } }))
  })
  try {
    const c = createClient({ baseURL: `http://127.0.0.1:${port}` })
    assert.deepEqual(await c.get('/api/users/chip'), { user: { handle: 'chip' } })
  } finally { srv.close() }
})

test('get throws ApiError carrying status and code', async () => {
  const { createClient } = await loadApi()
  const { srv, port } = await stubAPI((req, res) => {
    res.statusCode = 404
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify({ error: 'not_found' }))
  })
  try {
    const c = createClient({ baseURL: `http://127.0.0.1:${port}` })
    await assert.rejects(() => c.get('/api/users/nope'), (e) => e.status === 404 && e.code === 'not_found')
  } finally { srv.close() }
})

test('tryGet swallows 4xx as null but rethrows 5xx', async () => {
  const { createClient } = await loadApi()
  const four = await stubAPI((req, res) => { res.statusCode = 404; res.end('{"error":"not_found"}') })
  try {
    const c4 = createClient({ baseURL: `http://127.0.0.1:${four.port}` })
    assert.equal(await c4.tryGet('/x'), null)
  } finally { four.srv.close() }

  const five = await stubAPI((req, res) => { res.statusCode = 500; res.end('{"error":"internal"}') })
  try {
    const c5 = createClient({ baseURL: `http://127.0.0.1:${five.port}` })
    await assert.rejects(() => c5.tryGet('/x'), (e) => e.status === 500)
  } finally { five.srv.close() }
})

test('forwards cookie header when provided', async () => {
  const { createClient } = await loadApi()
  let seen = null
  const { srv, port } = await stubAPI((req, res) => { seen = req.headers.cookie ?? null; res.end('{}') })
  try {
    const c = createClient({ baseURL: `http://127.0.0.1:${port}`, cookie: 'devcx_session=abc' })
    await c.get('/x')
    assert.equal(seen, 'devcx_session=abc')
  } finally { srv.close() }
})

test.after(async () => { await vite?.close() })
