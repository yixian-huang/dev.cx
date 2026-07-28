import { test } from 'node:test'
import assert from 'node:assert/strict'
import { stubAPI, startSSR } from './helpers.mjs'

const project = {
  id: 'pr1', slug: 'real-proj', name: 'real-proj', tagline: '来自 API 的一句话',
  description_md: '来自 API 的项目说明', stage: 'wip', screenshots: [], tags: ['Go'],
  links: [], author: { id: 'u1', handle: 'ana', display_name: '安娜', avatar_url: '' },
  created_at: '2026-07-01T00:00:00Z', updated_at: '2026-07-25T00:00:00Z',
  stats: { timeline_count: 1, discuss_count: 0, feedback_count: 0 },
}
const timeline = { timeline: [{
  id: 'p2', slug: 'tl-post', type: 'build', title: '来自 API 的时间线标题', body_md: '进展',
  feedback_wanted: [], uncertainties: [], links: [], author: null,
  created_at: '2026-07-20T00:00:00Z', merged_into: null,
}], discussions: [] }

test('project page renders api project and timeline, not mock', async () => {
  const api = await stubAPI({
    '/api/projects/real-proj': { body: { project } },
    '/api/projects/real-proj/timeline': { body: timeline },
  })
  const ssr = await startSSR(api.port, 5215)
  try {
    const res = await fetch('http://127.0.0.1:5215/p/real-proj')
    const html = await res.text()
    assert.equal(res.status, 200)
    assert.ok(html.includes('来自 API 的一句话'))
    assert.ok(html.includes('来自 API 的时间线标题'))
    assert.ok(!html.includes('meal-split 解决了一个常见但烦人的问题'), 'mock project leaked')
    // SSR 页必须只有一套 head:index.html 的 seo-fallback 块要被剔除,否则每页双 <title>,
    // 且第一个 canonical 恒指首页——搜索引擎会把全站归并到首页。
    assert.equal((html.match(/<title>/g) ?? []).length, 1, 'exactly one <title>')
    assert.equal((html.match(/rel="canonical"/g) ?? []).length, 1, 'exactly one canonical')
    assert.ok(html.includes('rel="canonical" href="http://localhost:5215/p/real-proj"'), 'canonical points at the page itself')
  } finally {
    ssr.kill(); api.close()
  }
})

test('unknown project slug returns 404', async () => {
  const api = await stubAPI({})
  const ssr = await startSSR(api.port, 5216)
  try {
    assert.equal((await fetch('http://127.0.0.1:5216/p/nope')).status, 404)
  } finally {
    ssr.kill(); api.close()
  }
})
