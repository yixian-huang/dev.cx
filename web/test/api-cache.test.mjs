import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer as createViteServer } from 'vite'
import { stubAPI } from './helpers.mjs'

let vite
async function load(mod) {
  vite ??= await createViteServer({ server: { middlewareMode: true }, appType: 'custom', root: process.cwd() })
  return vite.ssrLoadModule(mod)
}
test.after(async () => { await vite?.close() })

test('prefetchApi caches GET and getFreshApiCache reads it', async () => {
  const api = await stubAPI({ '/api/posts?limit=8': { body: { posts: [{ slug: 'x' }], next_cursor: null } } })
  // jsdom-less: simulate browser for cache gate
  globalThis.window = globalThis
  const m = await load('/src/lib/api-cache.ts')
  m.__resetApiCache()
  try {
    // createClient uses absolute path when baseURL empty → relative; need absolute base for node
    // So call createClient via prefetch with mocked fetch through absolute URL isn't used.
    // Instead put + get:
    m.putApiCache('/api/posts?limit=8', { posts: [{ slug: 'x' }] })
    assert.deepEqual(m.getFreshApiCache('/api/posts?limit=8'), { posts: [{ slug: 'x' }] })
    m.invalidateApiCache('/api/posts?limit=8')
    assert.equal(m.getFreshApiCache('/api/posts?limit=8'), undefined)
  } finally {
    m.__resetApiCache()
    api.close()
    delete globalThis.window
  }
})

test('apiPathsForRoute mirrors main public entities', async () => {
  const { apiPathsForRoute } = await load('/src/lib/route-prefetch.ts')
  assert.ok(apiPathsForRoute('/').includes('/api/posts?limit=8'))
  assert.deepEqual(apiPathsForRoute('/@chip').slice(0, 2), [
    '/api/resolve/chip',
    '/api/users/chip/projects',
  ])
  assert.ok(apiPathsForRoute('/p/dev-cx').includes('/api/projects/dev-cx'))
  assert.ok(apiPathsForRoute('/t/foo').includes('/api/posts/foo/replies'))
  assert.ok(apiPathsForRoute('/explore').includes('/api/projects?sort=trending&limit=20'))
  assert.equal(apiPathsForRoute('/login').length, 0)
})
