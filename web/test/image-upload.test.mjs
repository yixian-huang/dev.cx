import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer as createViteServer } from 'vite'
import { createServer } from 'node:http'

let vite
async function load(mod) {
  vite ??= await createViteServer({ server: { middlewareMode: true }, appType: 'custom', root: process.cwd() })
  return vite.ssrLoadModule(mod)
}

test('uploadImage posts multipart and unwraps url', async () => {
  const { uploadImage } = await load('/src/lib/actions.ts')
  let seenAuth = null, seenCT = null
  const srv = createServer((req, res) => {
    seenCT = req.headers['content-type']
    seenAuth = req.headers.authorization ?? null
    res.setHeader('content-type', 'application/json')
    res.end('{"url":"https://img.li/i/k.png","thumbnail_url":"https://img.li/t/k.jpg"}')
  })
  await new Promise((r) => srv.listen(0, r))
  try {
    const port = srv.address().port
    const fakeFetch = (path, init) => fetch(`http://127.0.0.1:${port}${path}`, init)
    const file = new File([new Uint8Array([1, 2, 3])], 'a.png', { type: 'image/png' })
    const out = await uploadImage(fakeFetch, file)
    assert.equal(out.url, 'https://img.li/i/k.png')
    assert.match(seenCT, /multipart\/form-data/)
    assert.equal(seenAuth, null)   // 浏览器侧绝不能出现 img.li token
  } finally { srv.close() }
})

test('ImageUpload renders on the server without crashing', async () => {
  const { renderToString } = await load('react-dom/server')
  const React = (await load('react')).default
  const { default: ImageUpload } = await load('/src/components/feature/ImageUpload.tsx')
  const html = renderToString(React.createElement(ImageUpload, { onUploaded: () => {} }))
  assert.ok(html.length > 0)
})

test.after(async () => { await vite?.close() })
