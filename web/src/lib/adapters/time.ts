import { adapterLocale } from './locale'

// C3:相对时间文案不再硬编码中文——按 adapter locale(见 ./locale.ts)选串。
const STRINGS = {
  zh: {
    justNow: '刚刚',
    minutesAgo: (n: number) => `${n} 分钟前`,
    hoursAgo: (n: number) => `${n} 小时前`,
    yesterday: '昨天',
    daysAgo: (n: number) => `${n} 天前`,
  },
  en: {
    justNow: 'just now',
    minutesAgo: (n: number) => `${n} min ago`,
    hoursAgo: (n: number) => `${n} h ago`,
    yesterday: 'yesterday',
    daysAgo: (n: number) => `${n} d ago`,
  },
} as const

export function relativeTime(iso: string, now: Date = new Date()): string {
  const s = STRINGS[adapterLocale()]
  const ms = now.getTime() - Date.parse(iso)
  const min = Math.floor(ms / 60e3)
  if (min < 1) return s.justNow
  if (min < 60) return s.minutesAgo(min)
  const h = Math.floor(min / 60)
  if (h < 24) return s.hoursAgo(h)
  const d = Math.floor(h / 24)
  if (d === 1) return s.yesterday
  if (d < 30) return s.daysAgo(d)
  return iso.slice(0, 10)
}

export function timeGroup(iso: string, now: Date = new Date()): 'today' | 'yesterday' | 'thisWeek' {
  const start = new Date(now); start.setHours(0, 0, 0, 0)
  const t = Date.parse(iso)
  if (t >= start.getTime()) return 'today'
  if (t >= start.getTime() - 24 * 3600e3) return 'yesterday'
  return 'thisWeek'
}
