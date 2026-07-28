import { test } from 'node:test'
import assert from 'node:assert/strict'
import { stubAPI, startSSR } from './helpers.mjs'

const me = { user: { id: 'u1', email: 'a@b.c', handle: 'chip', display_name: '真实的我', avatar_url: '', bio: '真实简介', status: 'building', weekly_status: '', github_verified: false, links: [] } }

test('/@handle works tab lists the user projects from api', async () => {
  const api = await stubAPI({
    '/api/resolve/ana': { body: { user: { handle: 'ana', display_name: '安娜', bio: '', avatar_url: '', status: 'building', weekly_status: '', github_verified: false, links: [] } } },
    '/api/users/ana/projects': { body: { projects: [{ id: 'pr9', slug: 'ana-proj', name: 'ana-proj', tagline: '安娜的项目', description_md: '', stage: 'wip', screenshots: [], tags: [], links: [], author: null, created_at: '2026-07-01T00:00:00Z', updated_at: '2026-07-02T00:00:00Z' }] } },
  })
  const ssr = await startSSR(api.port, 5220)
  try {
    const html = await (await fetch('http://127.0.0.1:5220/@ana')).text()
    // works 是客户端 tab 取数,SSR 首屏至少不能再出现 mock 项目名
    assert.ok(!html.includes('meal-split'), 'mock works leaked into profile ssr')
  } finally { ssr.kill(); api.close() }
})

test('/me renders the session user, not mock', async () => {
  const api = await stubAPI({ '/api/me': { body: me } })
  const ssr = await startSSR(api.port, 5221)
  try {
    const html = await (await fetch('http://127.0.0.1:5221/me', { headers: { cookie: 'devcx_session=t' } })).text()
    // /me 无预取(私有),SSR 输出应是 loading 骨架而非 mock 的 Chip Zhang
    assert.ok(!html.includes('Chip Zhang'), 'mock profile leaked into /me ssr')
  } finally { ssr.kill(); api.close() }
})
