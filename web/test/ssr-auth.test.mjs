import { test } from 'node:test'
import assert from 'node:assert/strict'
import { stubAPI, startSSR } from './helpers.mjs'

test('logged-in session renders authed navbar on first paint', async () => {
  const api = await stubAPI({
    '/api/me': { body: { user: { id: 'u1', email: 'a@b.c', handle: 'chip', display_name: 'Chip Zhang', avatar_url: '', bio: '', status: 'building', weekly_status: '', github_verified: false, links: [] } } },
  })
  const ssr = await startSSR(api.port, 5211)
  try {
    const html = await (await fetch('http://127.0.0.1:5211/feed', { headers: { cookie: 'devcx_session=tok' } })).text()
    assert.ok(html.includes('"auth"'), 'auth key missing from __DEVCX_DATA__')
    assert.ok(html.includes('/compose'), 'authed navbar entry missing')
    const me = api.calls.find((c) => c.url === '/api/me')
    assert.equal(me?.method, 'GET')
  } finally {
    ssr.kill(); api.close()
  }
})

test('anonymous session renders login entry and null auth', async () => {
  const api = await stubAPI({})   // /api/me → 404/401 → tryGet null
  const ssr = await startSSR(api.port, 5212)
  try {
    const html = await (await fetch('http://127.0.0.1:5212/feed')).text()
    assert.ok(html.includes('/login'), 'login entry missing for anonymous')
  } finally {
    ssr.kill(); api.close()
  }
})
