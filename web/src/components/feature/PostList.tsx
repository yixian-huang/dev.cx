import { useTranslation } from 'react-i18next';
import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import type { FeedItem, FeedType } from '@/lib/adapters/types';
import TypeLabel from '@/components/base/TypeLabel';
import ChapterLabel from '@/components/base/ChapterLabel';
import EmptyState from '@/components/base/EmptyState';

type SortMode = 'latest' | 'hottest';

interface PostListProps {
  showHeader?: boolean;
  /** 按 timeGroup(今天/昨天/本周早些时候)分组并加 mono kicker——Feed 页(画布 2a)开启。 */
  groupByTime?: boolean;
  className?: string;
  items: FeedItem[];
  /** 取数中且尚无 items 时展示行骨架(首页 Discussion 等)。 */
  loading?: boolean;
}

const TIME_GROUPS: FeedItem['timeGroup'][] = ['today', 'yesterday', 'thisWeek'];

function textFilterClass(isActive: boolean): string {
  return `ink-filter transition-colors duration-200 whitespace-nowrap cursor-pointer bg-transparent border-none p-0 text-[13px] ${
    isActive
      ? 'ink-filter-active text-foreground-950 font-medium'
      : 'text-foreground-400 hover:text-foreground-700'
  }`;
}

function PostRow({ item }: { item: FeedItem }) {
  const { t } = useTranslation();
  const projectSuffix = item.projectPath ? ` / ${item.projectPath}` : '';
  return (
    <Link
      key={item.id}
      to={`/t/${item.id}`}
      className="ink-row block group py-[15px] -mx-2 px-2 border-b border-foreground-200/30 last:border-b-0 rounded-xs"
    >
      {/* 行 1:66px mono 类型列 + serif 标题 + dot leaders + mono 回复数 */}
      <div className="flex items-baseline min-w-0">
        <span className="w-[66px] shrink-0">
          <TypeLabel type={item.type} className="!text-[10px] font-medium tracking-[0.14em]" />
        </span>
        <span className="font-heading text-base font-medium leading-normal text-foreground-900 truncate group-hover:text-primary-500 transition-colors duration-200">
          {item.title}
        </span>
        <span className="dot-leaders" />
        <span className="shrink-0 font-mono text-xs text-foreground-500 tabular-nums">
          {item.replyCount} {t('postList.replies')}
        </span>
      </div>
      {/* 行 2:@handle / product-path(mono)· 时间 */}
      <div className="mt-[5px] pl-[66px] text-xs text-foreground-400">
        <span className="font-mono">@{item.authorHandle}{projectSuffix}</span>
        <span className="text-foreground-300"> · </span>
        <span>{item.time}</span>
      </div>
    </Link>
  );
}

function PostListSkeleton() {
  return (
    <div className="flex flex-col border-t border-foreground-200/30" aria-hidden>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="py-[15px] border-b border-foreground-200/25 last:border-b-0">
          <div className="flex items-center gap-3">
            <div className="h-3 w-10 bg-foreground-200/35 rounded-xs shrink-0" />
            <div className="h-4 flex-1 max-w-sm bg-foreground-200/40 rounded-xs" />
            <div className="h-3 w-12 bg-foreground-200/25 rounded-xs ml-auto" />
          </div>
          <div className="mt-2 pl-[66px] h-3 w-40 bg-foreground-200/25 rounded-xs" />
        </div>
      ))}
    </div>
  );
}

export default function PostList({
  showHeader = true,
  groupByTime = false,
  className = '',
  items,
  loading = false,
}: PostListProps) {
  const { t } = useTranslation();
  const [typeFilter, setTypeFilter] = useState<FeedType | 'all'>('all');
  const [sortMode, setSortMode] = useState<SortMode>('latest');

  const filtered = useMemo(() => {
    let result = items.filter((item) => typeFilter === 'all' || item.type === typeFilter);
    if (sortMode === 'hottest') {
      result = [...result].sort((a, b) => b.replyCount - a.replyCount);
    }
    return result;
  }, [items, typeFilter, sortMode]);

  // 最热排序下时间分组失去意义,退回平铺列表。
  const grouped = useMemo(() => {
    if (!groupByTime || sortMode === 'hottest') return null;
    return TIME_GROUPS.map((g) => ({ group: g, rows: filtered.filter((i) => i.timeGroup === g) }))
      .filter((g) => g.rows.length > 0);
  }, [groupByTime, sortMode, filtered]);

  const typeOptions = [
    { key: 'all' as const, label: t('feed.all') },
    { key: 'SHOW' as const, label: t('feed.show') },
    { key: 'BUILD' as const, label: t('feed.build') },
    { key: 'DISCUSS' as const, label: t('feed.discuss') },
  ];

  return (
    <div className={className}>
      {showHeader && (
        <div className="flex items-baseline justify-between mb-7">
          <ChapterLabel label={t('discussion.label')} sublabel={t('discussion.sublabel')} />
          <Link
            to="/feed"
            className="text-[13px] text-foreground-400 hover:text-primary-500 transition-colors duration-200 whitespace-nowrap"
          >
            {t('discussion.viewAll')} &rarr;
          </Link>
        </div>
      )}

      {/* 文字态筛选行(画布 1b/2a:纯文字变色 + 墨线下划线选中态) */}
      <div className="flex items-center gap-4 pb-3.5 border-b border-foreground-200/40">
        {typeOptions.map((opt) => (
          <button
            key={opt.key}
            type="button"
            onClick={() => setTypeFilter(opt.key)}
            className={textFilterClass(typeFilter === opt.key)}
          >
            {opt.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setSortMode('latest')}
          className={`ml-auto ${textFilterClass(sortMode === 'latest')}`}
        >
          {t('discussion.sortLatest')}
        </button>
        <button
          type="button"
          onClick={() => setSortMode('hottest')}
          className={textFilterClass(sortMode === 'hottest')}
        >
          {t('discussion.sortHottest')}
        </button>
      </div>

      {loading && items.length === 0 ? (
        <PostListSkeleton />
      ) : filtered.length === 0 ? (
        <EmptyState message={t('feed.noResults')} />
      ) : grouped ? (
        grouped.map(({ group, rows }) => (
          <div key={group}>
            <div className="font-mono text-[11px] tracking-[0.24em] text-foreground-400 uppercase pt-7 pb-1">
              {t(`feed.${group}`)}
            </div>
            <div className="flex flex-col">
              {rows.map((item) => (
                <PostRow key={item.id} item={item} />
              ))}
            </div>
          </div>
        ))
      ) : (
        <div className="flex flex-col">
          {filtered.map((item) => (
            <PostRow key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}
