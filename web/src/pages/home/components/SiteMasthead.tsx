import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import type { StatsEnvelope, ApiWeeklyIssue } from '@/lib/adapters/api-types';

interface SiteMastheadProps {
  /** 回访/登录态的紧凑刊头(画布 4a);完整刊头见 1b。 */
  compact?: boolean;
  /** B2 点亮:colophon 统计行(本周社区 … n Builder · n 产品 · n 讨论);无数据不渲染。 */
  stats?: StatsEnvelope;
  /** B2 点亮:上期周刊(latest 已发布期);VOL 期号也随它走,无则回落日历周。 */
  weekly?: ApiWeeklyIssue;
}

// ISO 周号(周一起始)——与周刊期号同一取法。纯日历事实,SSR/客户端可一致计算,
// 不属于「编造数据」;真正的周刊内容(上期主题、社区统计)仍等 B2 的真实来源。
function isoWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

const CN_DIGITS = '〇一二三四五六七八九';
const CN_MONTHS = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二'];

function kickerDate(date: Date, lang: string): string {
  if (lang.startsWith('zh')) {
    const year = String(date.getFullYear()).split('').map((c) => CN_DIGITS[Number(c)]).join('');
    return `${year}年${CN_MONTHS[date.getMonth()]}月`;
  }
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }).toUpperCase();
}

/** 标题中的「×」朱砂描边方章(1b 30px / 4a 18px)。 */
function CrossSeal({ compact }: { compact: boolean }) {
  return (
    <span
      className={`inline-flex items-center justify-center border-accent-500 text-accent-500 rounded-xs font-mono font-medium -rotate-6 select-none align-middle ${
        compact
          ? 'w-[18px] h-[18px] mx-2 border-[1.2px] text-[10px] -translate-y-0.5'
          : 'w-[22px] h-[22px] md:w-[30px] md:h-[30px] mx-2.5 md:mx-4 border-[1.5px] text-[13px] md:text-[16px] -translate-y-1'
      }`}
      aria-hidden
    >
      ×
    </span>
  );
}

export default function SiteMasthead({ compact = false, stats, weekly }: SiteMastheadProps) {
  const { t, i18n } = useTranslation();
  const now = new Date();
  // VOL 期号:有已发布周刊时 = 其周号 + 1(当前正在进行的一期);否则回落日历 ISO 周。
  const kicker = `DEV.CX — VOL.${weekly ? weekly.week + 1 : isoWeek(now)}`;

  // colophon 数字段(画布 1b/4a:`248 Builder · 63 产品 · 186 讨论`)
  const colophonNums = stats ? (
    <span>
      <strong className="font-semibold text-foreground-800">{stats.builders}</strong> {t('masthead.colBuilders')} ·{' '}
      <strong className="font-semibold text-foreground-800">{stats.products}</strong> {t('masthead.colProducts')} ·{' '}
      <strong className="font-semibold text-foreground-800">{stats.discussions}</strong> {t('masthead.colDiscussions')}
    </span>
  ) : null;

  const tagline = t('masthead.tagline');
  const parts = tagline.split(' × ');
  const title =
    parts.length === 2 ? (
      <>
        <span>{parts[0]}</span>
        <CrossSeal compact={compact} />
        <span>{parts[1]}</span>
      </>
    ) : (
      tagline
    );

  if (compact) {
    // 4a 紧凑刊头:两行。行 1 kicker(+社区统计);行 2 字标(+上期周刊)。
    return (
      <section className="w-full content-fade-in">
        <div className="max-w-[720px] mx-auto px-6 pt-[26px]">
          <div className="flex items-baseline justify-between gap-4">
            <div className="font-mono text-[11px] tracking-[0.24em] text-foreground-400">{kicker}</div>
            {colophonNums && (
              <div className="font-mono text-[11px] text-foreground-500 hidden sm:block">{colophonNums}</div>
            )}
          </div>
          <div className="flex items-center justify-between gap-4 mt-3 pb-[18px] border-b border-foreground-200/40">
            <h2 className="font-heading text-xl font-semibold text-foreground-950 tracking-tight">{title}</h2>
            {weekly && (
              <Link
                to={`/weekly/${weekly.week}`}
                className="group flex items-center gap-2 text-xs text-foreground-400 whitespace-nowrap transition-colors duration-200"
              >
                <span className="inline-flex items-center justify-center px-1 border border-accent-500/55 rounded-xs text-accent-500 font-mono text-[9px] font-medium tracking-[0.1em]">
                  W{weekly.week}
                </span>
                <span className="group-hover:text-primary-500 transition-colors duration-200">
                  {t('masthead.prevWeekly')}{`《${weekly.title}》`} →
                </span>
              </Link>
            )}
          </div>
        </div>
      </section>
    );
  }

  // 1b 完整刊头 — 全站唯一「大声」type zone:kicker → display 标题 → 单段 deck → colophon。
  return (
    <section className="w-full paper-grain content-fade-in">
      <div className="max-w-[720px] mx-auto px-6 pt-12 md:pt-16 pb-10 md:pb-12">
        <div className="font-mono text-[11px] tracking-[0.24em] text-foreground-400 mb-5">
          {kicker} · {kickerDate(now, i18n.language)}
        </div>
        {/* 画布大声档:桌面 46px / 行高 ~1.2(高于 token display-xl 42px,保证刊头响度) */}
        <h1 className="font-heading text-[30px] md:text-[46px] leading-[1.25] font-semibold text-foreground-950 tracking-[0.005em]">
          {title}
        </h1>
        <p className="mt-[18px] text-[15px] leading-[1.9] text-foreground-700 max-w-[34em] text-pretty">
          {t('masthead.deck')}
        </p>
        {/* colophon 行(1b):本周社区 …(dot leaders)… n Builder · n 产品 · n 讨论 */}
        {colophonNums && (
          <div className="flex items-baseline mt-10 font-mono text-xs text-foreground-500">
            <span className="text-foreground-400">{t('masthead.colophonLabel')}</span>
            <span className="dot-leaders" />
            {colophonNums}
          </div>
        )}
        {/* 上期周刊行(1b):W{n} 描边小章 + 《主题》 + 阅读 → */}
        {weekly ? (
          <Link
            to={`/weekly/${weekly.week}`}
            className="group flex items-center gap-3 mt-4 pt-4 border-t border-foreground-200/40 transition-colors duration-200"
          >
            <span className="inline-flex items-center justify-center px-1.5 py-px border border-accent-500/55 rounded-xs text-accent-500 font-mono text-[10px] font-medium tracking-[0.1em]">
              W{weekly.week}
            </span>
            <span className="text-[13px] text-foreground-700 group-hover:text-foreground-900 transition-colors duration-200">
              {t('masthead.prevWeekly')}{`《${weekly.title}》`}
            </span>
            <span className="ml-auto text-[13px] text-foreground-400 group-hover:text-primary-500 transition-colors duration-200">
              {t('masthead.readWeekly')} →
            </span>
          </Link>
        ) : (
          <div className="mt-10 border-t border-foreground-200/35" aria-hidden />
        )}
      </div>
    </section>
  );
}
