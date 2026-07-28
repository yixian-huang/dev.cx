/** 邀请注册链接：打开 /onboarding 并预填邀请码（见 onboarding/page.tsx `?code=`）。 */

export function inviteRegisterPath(code: string): string {
  const c = code.trim()
  if (!c) return '/onboarding'
  return `/onboarding?code=${encodeURIComponent(c)}`
}

/** 绝对 URL，供复制粘贴分享。origin 缺省时用当前站点（浏览器）或空串（SSR/测试需显式传入）。 */
export function inviteRegisterUrl(code: string, origin?: string): string {
  const path = inviteRegisterPath(code)
  const base =
    origin ??
    (typeof window !== 'undefined' && window.location?.origin ? window.location.origin : '')
  if (!base) return path
  return `${base.replace(/\/$/, '')}${path}`
}
