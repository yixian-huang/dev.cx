import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import PageShell from '@/components/feature/PageShell';
import { useApiData } from '@/lib/use-api-data';
import useDocumentTitle from '@/hooks/useDocumentTitle';
import { metaForRoute } from '@/lib/meta';
import type { ApiWeeklyIssue } from '@/lib/adapters/api-types';

// B2 点亮:周刊由 mkweekly 拼装发布(GET /api/weekly/{year}/{week},未发布 404)。
// 版式按画布 2d:76px 朱砂描边方章(W{n}+主题,该屏唯一章记)、编者按 bg-100 色带 +
// serif 首字下沉、精选 mono 双位编号目录体、标题字重 600。
// 路由只有周号(/weekly/:weekNumber,C 阶段冻结),年份取当前年——首批期刊同年,跨年再扩。
export default function WeeklyPage() {
  const { t } = useTranslation();
  const { weekNumber } = useParams();
  const year = new Date().getFullYear();
  const week = Number.parseInt(weekNumber ?? '', 10);
  const path = Number.isFinite(week) && week > 0 ? `/api/weekly/${year}/${week}` : null;

  const { data: issue, loading } = useApiData<ApiWeeklyIssue | null>('weekly', path);

  // SPA 导航同步标签页标题——复用 metaForRoute 保证与 SSR <title> 逐字一致。
  useDocumentTitle(Number.isFinite(week) && week > 0 ? metaForRoute(`/weekly/${week}`, {}).title : undefined);

  if (!issue && loading) {
    return <PageShell pageEnter>{null}</PageShell>;
  }

  // 未发布/不存在:诚实空态(不编造期号与精选)。
  if (!issue) {
    return (
      <PageShell pageEnter>
        <Link
          to="/"
          className="inline-block pt-8 pb-4 text-[13px] text-foreground-400 hover:text-primary-500 transition-colors duration-200"
        >
          {t('weekly.back')}
        </Link>
        <div className="py-24 text-center">
          <p className="text-body-md text-foreground-500">{t('weekly.comingSoon')}</p>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell pageEnter>
      {/* 顶部:返回 + 周导航 */}
      <div className="flex items-baseline justify-between pt-8 pb-6">
        <Link
          to="/"
          className="text-[13px] text-foreground-400 hover:text-primary-500 transition-colors duration-200"
        >
          {t('weekly.back')}
        </Link>
        <div className="flex items-center gap-4 font-mono text-xs">
          {issue.prev ? (
            <Link to={`/weekly/${issue.prev.week}`} className="text-foreground-500 hover:text-primary-500 transition-colors duration-200">
              ← {t('weekly.bannerPrev')}
            </Link>
          ) : (
            <span className="text-foreground-300">← {t('weekly.bannerPrev')}</span>
          )}
          {issue.next ? (
            <Link to={`/weekly/${issue.next.week}`} className="text-foreground-500 hover:text-primary-500 transition-colors duration-200">
              {t('weekly.bannerNext')} →
            </Link>
          ) : (
            <span className="text-foreground-300">{t('weekly.bannerNext')} →</span>
          )}
        </div>
      </div>

      {/* 刊头:76px 朱砂描边方章(该屏唯一章记)+ 标题 */}
      <header className="flex items-center gap-6 pb-8">
        <div className="shrink-0 w-[76px] h-[76px] border-[1.5px] border-accent-500 rounded-xs -rotate-6 flex flex-col items-center justify-center text-accent-500 select-none">
          <span className="font-mono text-[13px] font-semibold tracking-[0.08em]">W{issue.week}</span>
          <span className="font-heading text-[12px] leading-tight text-center px-1.5 mt-0.5 line-clamp-2">
            {issue.title}
          </span>
        </div>
        <div className="min-w-0">
          <div className="font-mono text-[11px] tracking-[0.24em] text-foreground-400 mb-2 uppercase">
            {t('weekly.weekNav', { week: issue.week })} · {issue.year}
          </div>
          <h1 className="font-heading text-[28px] leading-[1.3] font-semibold text-foreground-950">
            {issue.title}
          </h1>
        </div>
      </header>

      {/* 编者按:bg-100 整段色带 + serif 首字下沉 */}
      {issue.editor_note_md && (
        <section className="chapter-band -mx-6 px-6 mb-8">
          <div className="py-6">
            <div className="font-mono text-[11px] tracking-[0.24em] text-foreground-400 mb-3 uppercase">
              {t('weekly.editorNote')}
            </div>
            <p className="text-[15px] leading-[1.9] text-foreground-800 max-w-[40em] first-letter:font-heading first-letter:text-[30px] first-letter:font-semibold first-letter:float-left first-letter:mr-1.5 first-letter:leading-none">
              {issue.editor_note_md}
            </p>
          </div>
        </section>
      )}

      {/* 精选:mono 双位编号目录体(01–04+) */}
      {issue.highlights.length > 0 && (
        <section className="pb-12">
          <div className="font-mono text-[11px] tracking-[0.24em] text-foreground-400 mb-2 uppercase">
            {t('weekly.highlights')}
          </div>
          <div className="flex flex-col">
            {issue.highlights.map((h, i) => (
              <Link
                key={`${h.kind}-${h.slug}`}
                to={h.kind === 'project' ? `/p/${h.slug}` : `/t/${h.slug}`}
                className="group flex gap-4 py-[18px] border-b border-background-100 last:border-b-0"
              >
                <span className="shrink-0 w-[34px] text-right font-mono text-sm text-foreground-300">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2.5 min-w-0">
                    <span className="shrink-0 font-mono text-[10px] font-medium tracking-[0.14em] text-foreground-500 uppercase">
                      {t(h.kind === 'project' ? 'weekly.projectHighlight' : 'weekly.discussionHighlight')}
                    </span>
                    <span className="font-heading text-base font-semibold leading-normal text-foreground-950 truncate group-hover:text-primary-500 transition-colors duration-200">
                      {h.title}
                    </span>
                    <span className="dot-leaders" />
                    <span className="shrink-0 font-mono text-xs text-foreground-500">
                      {h.reply_count} {t('postList.replies')}
                    </span>
                  </div>
                  {h.deck && (
                    <p className="mt-1.5 text-[13px] leading-[1.7] text-foreground-700 line-clamp-2 max-w-[38em]">
                      {h.deck}
                    </p>
                  )}
                  <p className="mt-1 font-mono text-xs text-foreground-400">@{h.author_handle}</p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </PageShell>
  );
}
