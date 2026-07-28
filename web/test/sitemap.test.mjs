import { test } from 'node:test'
import assert from 'node:assert/strict'
import { stubAPI, startSSR } from './helpers.mjs'

test('sitemap.xml lists static routes, projects, posts and author profiles', async () => {
  const api = await stubAPI({
    '/api/projects?limit=50': {
      body: {
        projects: [
          { slug: 'img-li', author: { handle: 'yixian' } },
          { slug: 'nav-ax', author: { handle: 'yixian' } },
        ],
        next_cursor: null,
      },
    },
    '/api/posts?limit=50': {
      body: {
        posts: [{ slug: 'first-post', author: { handle: 'chip' } }],
        next_cursor: null,
      },
    },
  })
  const ssr = await startSSR(api.port, 5218)
  try {
    const res = await fetch('http://127.0.0.1:5218/sitemap.xml')
    assert.equal(res.status, 200)
    assert.match(res.headers.get('content-type'), /application\/xml/)
    const xml = await res.text()
    for (const path of ['/', '/explore', '/about', '/p/img-li', '/p/nav-ax', '/t/first-post', '/@yixian', '/@chip']) {
      assert.ok(xml.includes(`<loc>http://localhost:5218${path}</loc>`), `sitemap misses ${path}`)
    }
    // 私有路径绝不能进 sitemap
    assert.ok(!xml.includes('/me'), 'private path leaked into sitemap')
    // 同一作者两个项目只收录一次主页
    assert.equal((xml.match(/@yixian<\/loc>/g) ?? []).length, 1)
  } finally {
    ssr.kill(); api.close()
  }
})

test('robots.txt is served and points at the sitemap', async () => {
  const api = await stubAPI({})
  const ssr = await startSSR(api.port, 5219)
  try {
    const res = await fetch('http://127.0.0.1:5219/robots.txt')
    assert.equal(res.status, 200)
    const body = await res.text()
    assert.match(body, /Sitemap: https:\/\/dev\.cx\/sitemap\.xml/)
    assert.match(body, /Disallow: \/me/)
  } finally {
    ssr.kill(); api.close()
  }
})
