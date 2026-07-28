import { test } from 'node:test'
import assert from 'node:assert/strict'
import { stubAPI, startSSR } from './helpers.mjs'

const posts = { posts: [{
  id: 'p1', slug: 'api-feed-post', type: 'discuss', title: '来自 API 的 feed 标题',
  body_md: 'x', feedback_wanted: [], uncertainties: [], links: [],
  author: { id: 'u1', handle: 'ana', display_name: '安娜', avatar_url: '' },
  created_at: new Date().toISOString(), merged_into: null, reply_count: 2,
  // 挂了项目的帖子(project 非 null)——用来钉住 Finding C1 的回归:PostList 曾经按
  // `${projectPath}-${type}` 这套 mock 时代路由拼链接,真实数据下 item.id 才是帖子 slug,
  // 那套拼接路由从未存在过,会让每个挂项目的帖子都 404。
  project: { slug: 'some-proj', name: 'X' },
}], next_cursor: null }
const projects = { projects: [{
  id: 'pr1', slug: 'api-explore-proj', name: 'api-explore-proj', tagline: '来自 API 的项目一句话',
  description_md: '', stage: 'wip', screenshots: [], tags: [], links: [],
  author: { id: 'u1', handle: 'ana', display_name: '安娜', avatar_url: '' },
  created_at: '2026-07-01T00:00:00Z', updated_at: '2026-07-25T00:00:00Z',
}], next_cursor: null }

test('feed renders api posts, not mock', async () => {
  const api = await stubAPI({ '/api/posts?limit=20': { body: posts }, '/api/posts': { body: posts } })
  const ssr = await startSSR(api.port, 5217)
  try {
    const html = await (await fetch('http://127.0.0.1:5217/feed')).text()
    assert.ok(html.includes('来自 API 的 feed 标题'))
    assert.ok(!html.includes('用图论把 12 笔转账变成 3 笔'), 'mock feed leaked')
    // Finding C1 回归:即便帖子挂了项目,链接也必须直接用帖子 slug(item.id),不能拼
    // mock 时代的 `${projectPath}-${type}` 路由方案 —— 那套路由从不存在,真实数据下会 404。
    assert.ok(html.includes('/t/api-feed-post'), 'thread link must use the post slug directly')
    assert.ok(!html.includes('/t/some-proj-'), 'thread link must not use the mock-era projectPath-type scheme')
  } finally { ssr.kill(); api.close() }
})

test('explore renders api projects, not mock', async () => {
  const api = await stubAPI({ '/api/projects?sort=trending&limit=20': { body: projects }, '/api/projects?limit=20': { body: projects }, '/api/projects': { body: projects }, '/api/stats': { body: { builders: 2, products: 3, discussions: 4 } } })
  const ssr = await startSSR(api.port, 5218)
  try {
    const html = await (await fetch('http://127.0.0.1:5218/explore')).text()
    assert.ok(html.includes('api-explore-proj'))
  } finally { ssr.kill(); api.close() }
})

test('home renders discussions and latest projects from api', async () => {
  // 与 server.mjs home 预取 + DiscussionPreview 客户端 path 对齐:全类型 /api/posts?limit=8
  // (不再只拉 discuss|ask——show/build 帖在硬刷新时也会进首屏)。
  const api = await stubAPI({
    '/api/posts?limit=8': { body: posts },
    '/api/projects?sort=trending&limit=5': { body: projects },
    '/api/stats': { body: { builders: 2, products: 3, discussions: 4 } },
  })
  const ssr = await startSSR(api.port, 5219)
  try {
    const html = await (await fetch('http://127.0.0.1:5219/')).text()
    assert.ok(html.includes('来自 API 的 feed 标题'), 'home discussions missing')
    assert.ok(html.includes('api-explore-proj'), 'home focus projects missing')
  } finally { ssr.kill(); api.close() }
})

test('notifications page renders real feed with unread badge (B2)', async () => {
  const api = await stubAPI({
    '/api/me': { body: { user: { id: 'u1', handle: 'chip', display_name: 'Chip Zhang', avatar_url: '', bio: '', status: 'building', weekly_status: '', github_verified: false, links: [], unread_notifications: 2 } } },
    '/api/notifications': { body: { notifications: [
      { id: 'n1', kind: 'reply', read: false, created_at: new Date().toISOString(),
        actor: { id: 'u2', handle: 'ana', display_name: 'Ana', avatar_url: '' },
        post: { slug: 'p-1', title: '来自 API 的通知标题' }, project: null, reply_excerpt: '回复摘录' },
      { id: 'n2', kind: 'project_update', read: true, created_at: new Date().toISOString(),
        actor: { id: 'u3', handle: 'bob', display_name: 'Bob', avatar_url: '' },
        post: { slug: 'p-2', title: '产品更新帖' }, project: { slug: 'meal-split', name: 'AA 分账' }, reply_excerpt: null },
    ], next_cursor: null, unread_count: 1 } },
  })
  const ssr = await startSSR(api.port, 5222)
  try {
    const html = await (await fetch('http://127.0.0.1:5222/notifications', { headers: { cookie: 'devcx_session=tok' } })).text()
    assert.ok(html.includes('来自 API 的通知标题'), 'notification post title missing')
    assert.ok(html.includes('@bob / meal-split'), 'project_update mono path missing')
    assert.ok(html.includes('回复摘录'), 'reply excerpt missing')
    const n = api.calls.find((c) => c.url.startsWith('/api/notifications'))
    assert.equal(n?.method, 'GET', 'notifications not prefetched')
  } finally { ssr.kill(); api.close() }
})
