import { StrictMode } from 'react'
import { renderToString } from 'react-dom/server'
import { StaticRouter } from 'react-router-dom'
import { I18nextProvider } from 'react-i18next'
import i18n from './i18n'
import { ThemeProvider } from '@/hooks/useTheme'
import { AuthProvider } from '@/hooks/useAuth'
import { AppRoutes } from './router'
import { SSRDataProvider, type SSRData } from './lib/ssr-data'

export { createClient } from './lib/api'
export { metaForRoute, renderHeadTags, canonicalPath } from './lib/meta'

export async function render(url: string, data: SSRData): Promise<{ html: string }> {
  const html = renderToString(
    <StrictMode>
      <SSRDataProvider value={data}>
        <I18nextProvider i18n={i18n}>
          <ThemeProvider>
            <AuthProvider>
              <StaticRouter location={url} basename={__BASE_PATH__}>
                <AppRoutes />
              </StaticRouter>
            </AuthProvider>
          </ThemeProvider>
        </I18nextProvider>
      </SSRDataProvider>
    </StrictMode>,
  )
  return { html }
}
