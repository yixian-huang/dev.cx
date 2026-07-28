import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer as createViteServer } from 'vite'
import { stubAPI } from './helpers.mjs'

let vite
async function load(mod) {
  vite ??= await createViteServer({ server: { middlewareMode: true }, appType: 'custom', root: process.cwd() })
  return vite.ssrLoadModule(mod)
}
async function clientFor(port) {
  const { createClient } = await load('/src/lib/api.ts')
  return createClient({ baseURL: `http://127.0.0.1:${port}` })
}

test('createPost sends the exact request body and returns slug', async () => {
  const { createPost } = await load('/src/lib/actions.ts')
  const api = await stubAPI({ 'POST /api/posts': { status: 201, body: { post: { slug: 'my-post' } } } })
  try {
    const out = await createPost(await clientFor(api.port), {
      type: 'show', project_slug: 'meal-split', title: '标题', body_md: '正文',
    })
    assert.equal(out.slug, 'my-post')
    const call = api.calls.find((c) => c.method === 'POST')
    assert.deepEqual(call.body, { type: 'show', project_slug: 'meal-split', title: '标题', body_md: '正文' })
  } finally { api.close() }
})

test('createReply posts body_md with optional parent_id', async () => {
  const { createReply } = await load('/src/lib/actions.ts')
  const api = await stubAPI({ 'POST /api/posts/t-1/replies': { status: 201, body: { reply: { id: 'r1' } } } })
  try {
    await createReply(await clientFor(api.port), 't-1', '回复正文', 'parent-1')
    assert.deepEqual(api.calls[0].body, { body_md: '回复正文', parent_id: 'parent-1' })
  } finally { api.close() }
})

test('register posts the five-field body', async () => {
  const { register } = await load('/src/lib/actions.ts')
  const api = await stubAPI({ 'POST /api/auth/register': { status: 201, body: {} } })
  try {
    await register(await clientFor(api.port), {
      invite_code: 'inv-1', email: 'a@b.c', password: 'longpass1', handle: 'newbie', display_name: '新人',
    })
    assert.deepEqual(api.calls[0].body, {
      invite_code: 'inv-1', email: 'a@b.c', password: 'longpass1', handle: 'newbie', display_name: '新人',
    })
  } finally { api.close() }
})

test('updateProfile PATCHes only provided fields', async () => {
  const { updateProfile } = await load('/src/lib/actions.ts')
  const api = await stubAPI({ 'PATCH /api/me': { body: { user: {} } } })
  try {
    await updateProfile(await clientFor(api.port), { bio: '新简介' })
    assert.deepEqual(api.calls[0].body, { bio: '新简介' })
  } finally { api.close() }
})

test('apiErrorMessage maps known codes and falls back generically', async () => {
  const { apiErrorMessage } = await load('/src/lib/api-errors.ts')
  assert.match(apiErrorMessage({ status: 400, code: 'handle_taken' }), /占用/)
  assert.match(apiErrorMessage({ status: 400, code: 'password_too_short' }), /8/)
  assert.match(apiErrorMessage({ status: 400, code: 'email_required' }), /邮箱/)
  assert.match(apiErrorMessage({ status: 400, code: 'display_name_required' }), /显示名/)
  assert.match(apiErrorMessage({ status: 500, code: 'whatever' }), /稍后/)
})

test.after(async () => { await vite?.close() })

test('follow/unfollow hit the follows endpoints idempotently', async () => {
  const { follow, unfollow } = await load('/src/lib/actions.ts')
  const api = await stubAPI({
    'PUT /api/follows/project/meal-split': { status: 204, body: null },
    'DELETE /api/follows/user/chip': { status: 204, body: null },
  })
  try {
    await follow(await clientFor(api.port), 'project', 'meal-split')
    await unfollow(await clientFor(api.port), 'user', 'chip')
    assert.ok(api.calls.some((c) => c.method === 'PUT' && c.url.includes('/api/follows/project/meal-split')))
    assert.ok(api.calls.some((c) => c.method === 'DELETE' && c.url.includes('/api/follows/user/chip')))
  } finally { api.close() }
})
