import { test } from 'node:test'
import assert from 'node:assert/strict'
import { stubAPI, startSSR } from './helpers.mjs'

test('notifications page renders empty state, no mock items', async () => {
  const api = await stubAPI({})
  const ssr = await startSSR(api.port, 5222)
  try {
    const html = await (await fetch('http://127.0.0.1:5222/notifications')).text()
    assert.ok(!html.includes('mock'), 'mock notification leaked')
  } finally { ssr.kill(); api.close() }
})

test('bare /p /t /weekly and multi-segment unknown paths return 404', async () => {
  const api = await stubAPI({})
  const ssr = await startSSR(api.port, 5223)
  try {
    for (const p of ['/p', '/t', '/weekly', '/foo/bar']) {
      assert.equal((await fetch(`http://127.0.0.1:5223${p}`)).status, 404, `${p} should 404`)
    }
  } finally { ssr.kill(); api.close() }
})

test('percent-encoded handle path behaves like the raw one', async () => {
  const api = await stubAPI({
    '/api/resolve/chip': { body: { user: { handle: 'chip', display_name: '编码测试', bio: '', avatar_url: '', status: 'building', weekly_status: '', github_verified: false, links: [] } } },
  })
  const ssr = await startSSR(api.port, 5224)
  try {
    const res = await fetch('http://127.0.0.1:5224/%40chip')
    assert.equal(res.status, 200)
    assert.ok((await res.text()).includes('编码测试'))
  } finally { ssr.kill(); api.close() }
})
