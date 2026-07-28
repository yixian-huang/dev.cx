import { useTranslation } from 'react-i18next';
import { useState, useMemo } from 'react';
import PageShell from '@/components/feature/PageShell';
import ProjectListItem from '@/components/feature/ProjectListItem';
import ChapterLabel from '@/components/base/ChapterLabel';
import EmptyState from '@/components/base/EmptyState';
import PageSkeleton from '@/components/base/PageSkeleton';
import type { StageKey } from '@/lib/adapters/types';
import { useApiData, clientFetch } from '@/lib/use-api-data';
import { adaptExploreProject } from '@/lib/adapters/project';
import type { ApiProject, ProjectsEnvelope, StatsEnvelope } from '@/lib/adapters/api-types';
import { apiErrorMessage, type ApiErrorLike } from '@/lib/api-errors';

type SortMode = 'trending' | 'latest';

// B2:「热门」= API trending(近 7 天回复热度,无 keyset 分页);「最新」= created_at 页
// + 客户端按 updated_at 排(C3 语义)。默认热门(画布 3a),编号在热门态转 accent。
export default function ExplorePage() {
  const { t } = useTranslation();
  const [stageFilter, setStageFilter] = useState<StageKey | 'all'>('all');
  const [sortBy, setSortBy] = useState<SortMode>('trending');

  // SSR 注入:trending 前 20 + stats。
  const { data, loading } = useApiData<ProjectsEnvelope>('projects', '/api/projects?sort=trending&limit=20');
  const { data: stats } = useApiData<StatsEnvelope>('stats', '/api/stats');

  // 「最新」模式的独立取数(切换时惰性拉取,cursor 分页只在此模式下有意义)。
  const [latestData, setLatestData] = useState<ApiProject[] | null>(null);
  const [latestCursor, setLatestCursor] = useState<string | null>(null);
  const [loadingLatest, setLoadingLatest] = useState(false);
  const [loadError, setLoadError] = useState('');

  const switchSort = async (mode: SortMode) => {
    setSortBy(mode);
    setLoadError('');
    if (mode === 'latest' && latestData === null && !loadingLatest) {
      setLoadingLatest(true);
      try {
        const r = await clientFetch<ProjectsEnvelope>('', '/api/projects?limit=20');
        setLatestData(r.projects);
        setLatestCursor(r.next_cursor);
      } catch (e) {
        setLoadError(apiErrorMessage(e as ApiErrorLike));
        setSortBy('trending');
      } finally {
        setLoadingLatest(false);
      }
    }
  };

  const handleLoadMore = async () => {
    if (!latestCursor || loadingLatest) return;
    setLoadingLatest(true);
    setLoadError('');
    try {
      const next = await clientFetch<ProjectsEnvelope>('', `/api/projects?limit=20&cursor=${encodeURIComponent(latestCursor)}`);
      setLatestData((prev) => [...(prev ?? []), ...next.projects]);
      setLatestCursor(next.next_cursor);
    } catch (e) {
      setLoadError(apiErrorMessage(e as ApiErrorLike));
    } finally {
      setLoadingLatest(false);
    }
  };

  const filtered = useMemo(() => {
    const raw = sortBy === 'trending' ? (data?.projects ?? []) : (latestData ?? []);
    const ordered =
      sortBy === 'latest'
        ? [...raw].sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
        : raw;
    const adapted = ordered.map(adaptExploreProject);
    return stageFilter === 'all' ? adapted : adapted.filter((p) => p.stage === stageFilter);
  }, [sortBy, data, latestData, stageFilter]);

  const stageOptions = [
    { key: 'all' as const, label: t('explore.stageAll') },
    { key: 'idea' as StageKey, label: t('project.stageIdea') },
    { key: 'wip' as StageKey, label: t('project.stageWIP') },
    { key: 'shipped' as StageKey, label: t('project.stageShipped') },
    { key: 'paused' as StageKey, label: t('project.stagePaused') },
  ];

  const textBtn = (active: boolean) =>
    `transition-colors duration-200 whitespace-nowrap cursor-pointer bg-transparent border-none p-0 text-[13px] ${
      active ? 'text-foreground-950 font-medium' : 'text-foreground-400 hover:text-foreground-700'
    }`;

  // 取数中(无 SSR / 预取未命中):列表骨架。
  if (!data && loading) {
    return <PageSkeleton variant="list" />;
  }

  return (
    <PageShell pageEnter>
      <div className="py-10 md:py-12">
        <ChapterLabel label={t('explore.label')} sublabel={t('explore.allProducts')} className="mb-3.5" />
        {/* 3a 刊头:页题 + dot leaders + mono 共 n 个产品(stats 真实总数) */}
        <div className="flex items-baseline mb-[26px]">
          <h1 className="font-heading text-[32px] leading-[1.2] font-semibold text-foreground-950">
            {t('explore.title')}
          </h1>
          {stats && (
            <>
              <span className="dot-leaders" />
              <span className="font-mono text-xs text-foreground-500">
                {t('explore.totalProducts', { count: stats.products })}
              </span>
            </>
          )}
        </div>

        {/* 筛选行:阶段文字态 + 右侧 热门/最新(画布 3a) */}
        <div className="flex items-center gap-4 pb-3.5 border-b border-foreground-200/35">
          {stageOptions.map((opt) => (
            <button key={opt.key} onClick={() => setStageFilter(opt.key)} className={textBtn(stageFilter === opt.key)}>
              {opt.label}
            </button>
          ))}
          <button onClick={() => switchSort('trending')} className={`ml-auto ${textBtn(sortBy === 'trending')}`}>
            {t('explore.sortTrending')}
          </button>
          <button onClick={() => switchSort('latest')} className={textBtn(sortBy === 'latest')}>
            {t('explore.sortLatest')}
          </button>
        </div>

        {loadingLatest && filtered.length === 0 ? null : filtered.length === 0 ? (
          <EmptyState message={t('explore.noResults')} />
        ) : (
          <div>
            {filtered.map((proj, i) => (
              <ProjectListItem
                key={proj.id}
                index={i}
                id={proj.id}
                displayTitle={proj.displayTitle}
                authorHandle={proj.authorHandle}
                stage={proj.stage}
                updatedAt={proj.updatedAt}
                trending={sortBy === 'trending'}
                replyCount={proj.replyCount}
                latestThread={proj.latestThread}
              />
            ))}
          </div>
        )}

        {loadError && <p className="text-[13px] text-primary-700 mt-4 text-center">{loadError}</p>}

        {sortBy === 'latest' && latestCursor && (
          <div className="flex justify-center mt-9 pt-5 border-t border-foreground-200/35">
            <button
              onClick={handleLoadMore}
              disabled={loadingLatest}
              className="font-mono text-[13px] text-foreground-700 hover:text-primary-500 transition-colors duration-200 cursor-pointer bg-transparent border-none p-0 disabled:opacity-50"
            >
              {loadingLatest ? '…' : `${t('postList.nextPage')} →`}
            </button>
          </div>
        )}
      </div>
    </PageShell>
  );
}
