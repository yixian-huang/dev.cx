import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'

let vite
async function ssrRender(url, data = {}) {
  vite ??= await createServer({ server: { middlewareMode: true }, appType: 'custom', root: process.cwd() })
  const mod = await vite.ssrLoadModule('/src/entry-server.tsx')
  return mod.render(url, data)
}

test('renders the home route to HTML on the server', async () => {
  const { html } = await ssrRender('/')
  assert.ok(html.length > 200, `html too short: ${html.slice(0, 200)}`)
  assert.ok(html.includes('dev.cx'), 'wordmark missing from SSR output')
  assert.ok(!html.includes('<!--app-html-->'), 'placeholder leaked into output')
})

test('renders an unknown route without throwing', async () => {
  const { html } = await ssrRender('/definitely-not-a-route')
  assert.ok(typeof html === 'string' && html.length > 0)
})

test.after(async () => { await vite?.close() })
