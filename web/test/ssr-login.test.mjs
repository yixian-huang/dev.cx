import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('login page no longer fakes oauth with mock credentials', async () => {
  const src = await readFile('src/pages/login/page.tsx', 'utf8')
  assert.ok(!src.includes('oauth+'), 'mock oauth credential still present')
  assert.ok(src.includes('githubStart'), 'githubStart not wired')
})

test('onboarding page submits via register action', async () => {
  const src = await readFile('src/pages/onboarding/page.tsx', 'utf8')
  assert.ok(src.includes('register('), 'register not wired')
  assert.ok(src.includes('invite'), 'invite code field not wired')
})
