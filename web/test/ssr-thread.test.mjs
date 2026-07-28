import { test } from 'node:test'
import assert from 'node:assert/strict'
import { stubAPI, startSSR } from './helpers.mjs'

const post = {
  id: 'p1', slug: 'real-thread', type: 'show', title: '来自 API 的帖子标题',
  body_md: '来自 API 的正文', feedback_wanted: ['算法'], uncertainties: [],
  links: [], author: { id: 'u1', handle: 'ana', display_name: '安娜', avatar_url: '' },
  created_at: '2026-07-25T10:00:00Z', merged_into: null, reply_count: 1, project: null,
}
const replies = [{
  id: 'r1', author: { id: 'u2', handle: 'bob', display_name: '鲍勃', avatar_url: '' },
  body_md: '来自 API 的回复', parent_id: null, floor: 1, created_at: '2026-07-25T11:00:00Z', children: [],
}]

test('thread page renders api post and replies, not mock', async () => {
  const api = await stubAPI({
    '/api/posts/real-thread': { body: { post } },
    '/api/posts/real-thread/replies': { body: { replies } },
  })
  const ssr = await startSSR(api.port, 5213)
  try {
    const res = await fetch('http://127.0.0.1:5213/t/real-thread')
    const html = await res.text()
    assert.equal(res.status, 200)
    assert.ok(html.includes('来自 API 的帖子标题'))
    assert.ok(html.includes('来自 API 的回复'))
    assert.ok(!html.includes('用图论把 12 笔转账变成 3 笔'), 'mock thread leaked')
  } finally {
    ssr.kill(); api.close()
  }
})

test('unknown thread slug returns 404 status', async () => {
  const api = await stubAPI({})
  const ssr = await startSSR(api.port, 5214)
  try {
    const res = await fetch('http://127.0.0.1:5214/t/nope')
    assert.equal(res.status, 404)
  } finally {
    ssr.kill(); api.close()
  }
})
