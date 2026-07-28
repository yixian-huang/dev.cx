import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
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

export default function FocusWorks({ compact = false, totalProducts }: FocusWorksProps) {
  const { t } = useTranslation();
  // B2:焦点 = trending 前 5(近 7 天回复热度,server.mjs home 分支同源注入)。
  const { data, loading } = useApiData<ProjectsEnvelope>('projects', '/api/projects?sort=trending&limit=5');
  const works: FocusWork[] = data ? data.projects.map(adaptFocusWork) : [];

  // 取数中(没有 SSR 值、客户端重取还未回来):没有骨架组件,整块先不渲染,避免闪一下空态。
  if (!data && loading) return null;
  // 确认为空(取到了、就是没有项目):装饰性发现区块不是必需内容——直接隐藏整块,
  // 比硬塞一条编造的"暂无作品"空态更克制。
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
      <div className={`max-w-[720px] mx-auto px-6 ${compact ? 'py-6' : 'py-10 md:py-12'}`}>
        {/* Chapter kicker */}
        <div className={`flex items-baseline justify-between ${compact ? 'mb-4' : 'mb-7'}`}>
          <div className="font-mono text-[11px] tracking-[0.24em] text-foreground-400 uppercase">
            {t('focus.label')} · {t('focus.sublabel')}
          </div>
          {compact && viewAll}
        </div>

        {/* Lead row */}
        <div className="mb-2">
          <Link to={`/p/${lead.id}`} className="group block">
            <h3
              className={`font-heading font-semibold text-foreground-950 group-hover:text-primary-500 transition-colors duration-200 ${
                compact ? 'text-[19px] leading-[1.4]' : 'text-2xl leading-[1.35]'
              }`}
            >
              {lead.title}
            </h3>
            {!compact && lead.deck && (
              <p className="mt-2.5 text-[15px] leading-[1.8] text-foreground-700 max-w-[38em] text-pretty">
                {lead.deck}
              </p>
            )}
          </Link>
          <div className={`flex items-center gap-3 text-xs ${compact ? 'mt-[7px]' : 'mt-3'}`}>
            <span className="font-mono text-[13px] text-foreground-500">{lead.authorHandle}</span>
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

        {/* Quiet rows */}
        <div className={`flex flex-col border-b border-foreground-200/30 ${compact ? 'mt-4' : 'mt-7'}`}>
          {quiet.map((work) => (
            <QuietProjectRow
              key={work.id}
              id={work.id}
              title={work.title}
              stage={work.stage}
              time={work.updatedAt}
            />
          ))}
        </div>

        {!compact && <div className="mt-[18px] text-right">{viewAll}</div>}
      </div>
    </section>
  );
}
