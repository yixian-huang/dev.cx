import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import ChapterLabel from '@/components/base/ChapterLabel';
import StageBadge from '@/components/base/StageBadge';
import QuietProjectRow from '@/components/feature/QuietProjectRow';
import { useApiData } from '@/lib/use-api-data';
import { relativeTime } from '@/lib/adapters/time';
import type { ApiProject, ProjectsEnvelope } from '@/lib/adapters/api-types';

// 行本地形状——只把 API 数据映射到已渲染的字段上。hasFeedbackRequest 来自 B2 列表聚合
// has_feedback_request(7 天内有带 feedbackWanted 的关联帖)。
interface FocusWork {
  id: string;
  title: string;
  authorHandle: string;
  deck: string;
  stage: string;
  hasFeedbackRequest: boolean;
  updatedAt: string;
}

function adaptFocusWork(p: ApiProject): FocusWork {
  return {
    id: p.slug,
    title: p.name,
    authorHandle: p.author ? `@${p.author.handle}` : '',
    deck: p.tagline,
    stage: p.stage,
    hasFeedbackRequest: p.has_feedback_request ?? false,
    updatedAt: relativeTime(p.updated_at),
  };
}

interface FocusWorksProps {
  /** 紧凑态(画布 4a):Lead 缩为 19px、Quiet ×3、「全部产品」上移到章节头右侧。 */
  compact?: boolean;
  /** B2:stats.products,「全部 n 个产品」;无数据退化为不带数字。 */
  totalProducts?: number;
}

function FocusSkeleton({ compact }: { compact: boolean }) {
  return (
    <section className="w-full chapter-band" aria-hidden>
      <div className={`max-w-[720px] mx-auto px-6 ${compact ? 'py-6' : 'py-12 md:py-14'}`}>
        <div className="h-3 w-36 bg-foreground-200/40 rounded-xs mb-7" />
        <div className="h-7 w-2/3 max-w-md bg-foreground-200/45 rounded-xs mb-3" />
        {!compact && <div className="h-4 w-full max-w-lg bg-foreground-200/30 rounded-xs mb-2" />}
        {!compact && <div className="h-4 w-3/5 max-w-sm bg-foreground-200/25 rounded-xs mb-4" />}
        <div className="h-3 w-48 bg-foreground-200/30 rounded-xs mb-8" />
        <div className="space-y-0 border-t border-foreground-200/30">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-3 py-[13px] border-b border-foreground-200/25">
              <div className="h-4 flex-1 bg-foreground-200/30 rounded-xs" />
              <div className="h-3 w-12 bg-foreground-200/25 rounded-xs" />
              <div className="h-3 w-10 bg-foreground-200/20 rounded-xs" />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default function FocusWorks({ compact = false, totalProducts }: FocusWorksProps) {
  const { t } = useTranslation();
  // B2:焦点 = trending 前 5(近 7 天回复热度,server.mjs home 分支同源注入)。
  const { data, loading } = useApiData<ProjectsEnvelope>('projects', '/api/projects?sort=trending&limit=5');
  const works: FocusWork[] = data ? data.projects.map(adaptFocusWork) : [];

  // 取数中:骨架与正式布局同宽同节奏,避免空白闪断。
  if (!data && loading) return <FocusSkeleton compact={compact} />;
  // 确认为空:装饰性发现区块不是必需内容——直接隐藏整块。
  if (works.length === 0) return null;

  const [lead, ...rest] = works;
  const quiet = rest.slice(0, compact ? 3 : 4);

  const viewAll = (
    <Link
      to="/explore"
      className="text-[13px] text-foreground-400 hover:text-primary-500 transition-colors duration-200 whitespace-nowrap"
    >
      {totalProducts ? t('focus.viewAllCount', { count: totalProducts }) : t('focus.viewAll')} &rarr;
    </Link>
  );

  return (
    <section className="w-full chapter-band">
      <div className={`max-w-[720px] mx-auto px-6 ${compact ? 'py-7' : 'py-12 md:py-14'}`}>
        {/* Chapter kicker */}
        <div className={`flex items-baseline justify-between gap-4 ${compact ? 'mb-5' : 'mb-8'}`}>
          <ChapterLabel label={t('focus.label')} sublabel={t('focus.sublabel')} />
          {compact && viewAll}
        </div>

        {/* Lead row — 章节唯一「大声」条目:mono 热门编号 + display 大标题 + deck */}
        <div className={compact ? 'mb-1' : 'mb-1'}>
          <Link to={`/p/${lead.id}`} className="group block">
            <div className="flex items-start">
              <span
                className={`shrink-0 w-7 font-mono font-medium text-accent-500 tracking-[0.06em] select-none ${
                  compact ? 'text-[11px] mt-1.5' : 'text-[12px] mt-2'
                }`}
                aria-hidden
              >
                01
              </span>
              <div className="min-w-0 flex-1">
                <h3
                  className={`font-heading font-semibold text-foreground-950 group-hover:text-primary-500 transition-colors duration-200 text-pretty ${
                    compact
                      ? 'text-[19px] leading-[1.35]'
                      : 'text-[24px] md:text-[26px] leading-[1.3]'
                  }`}
                >
                  {lead.title}
                </h3>
                {!compact && lead.deck && (
                  <p className="mt-3 text-[15px] md:text-base leading-[1.75] text-foreground-700 max-w-[38em] text-pretty">
                    {lead.deck}
                  </p>
                )}
              </div>
            </div>
          </Link>
          <div
            className={`flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs pl-7 ${
              compact ? 'mt-2.5' : 'mt-3.5'
            }`}
          >
            {lead.authorHandle && (
              <span className="font-mono text-[13px] text-foreground-500">{lead.authorHandle}</span>
            )}
            <StageBadge stage={lead.stage} />
            {lead.hasFeedbackRequest && (
              <span className="inline-flex items-center gap-[5px] text-accent-600 font-medium">
                <span className="w-[5px] h-[5px] rounded-full bg-accent-500 animate-pulse-subtle" />
                {t('focus.feedback')}
              </span>
            )}
            <span className="text-foreground-400">{lead.updatedAt}</span>
          </div>
        </div>

        {/* Quiet rows — 排印列表,与 Lead 拉开节奏 */}
        <div className={`flex flex-col border-b border-foreground-200/35 ${compact ? 'mt-5' : 'mt-9'}`}>
          {quiet.map((work, i) => (
            <QuietProjectRow
              key={work.id}
              id={work.id}
              title={work.title}
              stage={work.stage}
              time={work.updatedAt}
              index={i + 2}
            />
          ))}
        </div>

        {!compact && <div className="mt-5 text-right">{viewAll}</div>}
      </div>
    </section>
  );
}
