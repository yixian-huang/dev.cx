import { useTranslation } from 'react-i18next';
import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import type { FeedItem, FeedType } from '@/lib/adapters/types';
import TypeLabel from '@/components/base/TypeLabel';
import ChapterLabel from '@/components/base/ChapterLabel';

type SortMode = 'latest' | 'hottest';

interface PostListProps {
  showHeader?: boolean;
  /** 按 timeGroup(今天/昨天/本周早些时候)分组并加 mono kicker——Feed 页(画布 2a)开启。 */
  groupByTime?: boolean;
  className?: string;
  items: FeedItem[];
}

const TIME_GROUPS: FeedItem['timeGroup'][] = ['today', 'yesterday', 'thisWeek'];

function textFilterClass(isActive: boolean): string {
  return `transition-colors duration-200 whitespace-nowrap cursor-pointer bg-transparent border-none p-0 text-[13px] ${
    isActive ? 'text-foreground-950 font-medium' : 'text-foreground-400 hover:text-foreground-700'
  }`;
}

function PostRow({ item }: { item: FeedItem }) {
  const { t } = useTranslation();
  const projectSuffix = item.projectPath ? ` / ${item.projectPath}` : '';
  return (
    <Link key={item.id} to={`/t/${item.id}`} className="block group py-[15px] border-b border-background-100 last:border-b-0">
      {/* 行 1:66px mono 类型列 + serif 标题 + dot leaders + mono 回复数 */}
      <div className="flex items-baseline min-w-0">
        <span className="w-[66px] shrink-0">
          <TypeLabel type={item.type} className="!text-[10px] font-medium tracking-[0.14em]" />
        </span>
        <span className="font-heading text-base font-medium leading-normal text-foreground-900 truncate group-hover:text-primary-500 transition-colors duration-200">
          {item.title}
        </span>
        <span className="dot-leaders" />
        <span className="shrink-0 font-mono text-xs text-foreground-500">
          {item.replyCount} {t('postList.replies')}
        </span>
      </div>
      {/* 行 2:@handle / product-path(mono)· 时间 */}
      <div className="mt-[5px] pl-[66px] text-xs text-foreground-400">
        <span className="font-mono">@{item.authorHandle}{projectSuffix}</span> · {item.time}
      </div>
    </Link>
  );
}

export default function PostList({ showHeader = true, groupByTime = false, className = '', items }: PostListProps) {
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
        <div className="flex items-baseline justify-between mb-6">
          <ChapterLabel label={t('discussion.label')} sublabel={t('discussion.sublabel')} />
          <Link
            to="/feed"
            className="text-[13px] text-foreground-400 hover:text-primary-500 transition-colors duration-200 whitespace-nowrap"
          >
            {t('discussion.viewAll')} &rarr;
          </Link>
        </div>
      )}

      {/* 文字态筛选行(画布 1b/2a:纯文字变色,无底色 chip) */}
      <div className="flex items-center gap-4 pb-3.5 border-b border-foreground-200/35">
        {typeOptions.map((opt) => (
          <button key={opt.key} onClick={() => setTypeFilter(opt.key)} className={textFilterClass(typeFilter === opt.key)}>
            {opt.label}
          </button>
        ))}
        <button onClick={() => setSortMode('latest')} className={`ml-auto ${textFilterClass(sortMode === 'latest')}`}>
          {t('discussion.sortLatest')}
        </button>
        <button onClick={() => setSortMode('hottest')} className={textFilterClass(sortMode === 'hottest')}>
          {t('discussion.sortHottest')}
        </button>
      </div>

      {filtered.length === 0 ? (
        <div className="py-16 text-center">
          <p className="text-[13px] text-foreground-400">{t('feed.noResults')}</p>
        </div>
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
