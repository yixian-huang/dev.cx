import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import StageBadge from '@/components/base/StageBadge';
import EmptyState from '@/components/base/EmptyState';
import QuietProjectRow from '@/components/feature/QuietProjectRow';
import type { UIProfile } from '@/lib/adapters/types';
import { useApiData } from '@/lib/use-api-data';
import { unwrap, type ApiProject } from '@/lib/adapters/api-types';
import { adaptExploreProject } from '@/lib/adapters/project';

// 画布 2c Works:Lead(serif 18px + deck + meta 行 + ↳ 最新讨论)+ Quiet 行(同首页 Focus)。
export default function WorksTab({ profile }: { profile: UIProfile }) {
  const { t } = useTranslation();
  // works 是纯客户端 tab 取数(非预取 key,server.mjs 不知道这个 key),按 handle 请求该用户的
  // 项目列表——不像 profile 页顶层那样有 mock 回落,取不到数据时中性留空,不编造/复用 mock。
  const { data: rawWorks, loading } = useApiData<unknown>(
    `works:${profile.handle}`,
    profile.handle ? `/api/users/${profile.handle}/projects` : null,
  );
  const apiWorks = rawWorks ? unwrap<ApiProject[]>(rawWorks, 'projects') : undefined;

  // 取数中:没有现成的骨架组件,留空(不展示旧/mock 数据)。
  if (!apiWorks && loading) return null;

  const works = apiWorks ? apiWorks.map(adaptExploreProject) : [];

  if (works.length === 0) {
    return <EmptyState message={t('profile.noProjects')} hint={t('profile.noProjectsHint')} />;
  }

  const [lead, ...quiet] = works;

  return (
    <div>
      {/* Lead */}
      <div className="pt-1 pb-3.5">
        <Link to={`/p/${lead.id}`} className="group block">
          <h3 className="font-heading text-[18px] leading-[1.4] font-semibold text-foreground-950 group-hover:text-primary-500 transition-colors duration-200">
            {lead.displayTitle}
          </h3>
          {lead.deck && (
            <p className="mt-2 text-[14px] leading-[1.8] text-foreground-700 max-w-[38em]">{lead.deck}</p>
          )}
        </Link>
        <div className="flex items-center gap-3 mt-2.5 text-xs">
          <StageBadge stage={lead.stage} />
          <span className="text-foreground-400">{t('project.metaUpdated', { time: lead.updatedAt })}</span>
        </div>
        {lead.latestThread && (
          <Link
            to={`/t/${lead.latestThread.id}`}
            className="block mt-2.5 text-xs text-foreground-500 hover:text-primary-500 transition-colors duration-200 truncate"
          >
            <span className="font-mono text-foreground-400">↳</span> {lead.latestThread.title} ·{' '}
            <span className="font-mono">{lead.latestThread.replyCount} {t('postList.replies')}</span>
          </Link>
        )}
      </div>

      {/* Quiet rows */}
      {quiet.length > 0 && (
        <div className="flex flex-col border-b border-foreground-200/30">
          {quiet.map((work) => (
            <QuietProjectRow
              key={work.id}
              id={work.id}
              title={work.displayTitle}
              stage={work.stage}
              time={work.updatedAt}
            />
          ))}
        </div>
      )}
    </div>
  );
}
