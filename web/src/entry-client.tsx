import { StrictMode } from 'react'
import { hydrateRoot, createRoot } from 'react-dom/client'
import './i18n'
import './index.css'
import App from './App.tsx'
import { SSRDataProvider } from './lib/ssr-data'

declare global {
  interface Window { __DEVCX_DATA__?: Record<string, unknown> }
}

const data = window.__DEVCX_DATA__ ?? {}
const container = document.getElementById('root')!
const tree = (
  <StrictMode>
    <SSRDataProvider value={data}>
      <App />
    </SSRDataProvider>
  </StrictMode>
)

// 服务端渲染过的页面走 hydrate；降级返回的空骨架走 createRoot。
if (container.hasChildNodes()) {
  hydrateRoot(container, tree)
} else {
  createRoot(container).render(tree)
}
