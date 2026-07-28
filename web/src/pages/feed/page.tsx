import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import PageShell from '@/components/feature/PageShell';
import PostList from '@/components/feature/PostList';
import ChapterLabel from '@/components/base/ChapterLabel';
import { useApiData, clientFetch } from '@/lib/use-api-data';
import { adaptFeedItem } from '@/lib/adapters/post';
import type { ApiPost, PostsEnvelope, StatsEnvelope } from '@/lib/adapters/api-types';
import type { FeedItem } from '@/lib/adapters/types';
import { apiErrorMessage, type ApiErrorLike } from '@/lib/api-errors';

export default function FeedPage() {
  const { t } = useTranslation();

  // server.mjs 注入 API 原信封({posts,next_cursor})——客户端重取同一路径拿到同一形状,
  // 直接读 .posts/.next_cursor,不需要 unwrap。
  const { data, loading } = useApiData<PostsEnvelope>('posts', '/api/posts?limit=20');
  const { data: stats } = useApiData<StatsEnvelope>('stats', '/api/stats');
  // "下一页"把追加页塞进 extra;cursorOverride 用 undefined 作哨兵值——在第一次点击
  // 之前,游标跟随 data.next_cursor(不管它是 SSR 值还是客户端重取的结果);
  // 点击后游标就与 data 解耦,只认服务器刚给的下一页游标。
  const [extra, setExtra] = useState<ApiPost[]>([]);
  const [cursorOverride, setCursorOverride] = useState<string | null | undefined>(undefined);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState('');

  const items: FeedItem[] = data ? [...data.posts, ...extra].map(adaptFeedItem) : [];
  const cursor = cursorOverride !== undefined ? cursorOverride : (data?.next_cursor ?? null);

  const handleLoadMore = async () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    setLoadError('');
    try {
      const next = await clientFetch<PostsEnvelope>('', `/api/posts?limit=20&cursor=${encodeURIComponent(cursor)}`);
      setExtra((prev) => [...prev, ...next.posts]);
      setCursorOverride(next.next_cursor);
    } catch (e) {
      setLoadError(apiErrorMessage(e as ApiErrorLike));
    } finally {
      setLoadingMore(false);
    }
  };

  // 取数中(没有 SSR 值、客户端重取还未回来):没有骨架组件,留空,不展示 mock 计数/mock 列表。
  if (!data && loading) {
    return <PageShell pageEnter>{null}</PageShell>;
  }

  return (
    <PageShell pageEnter>
      <div className="py-10 md:py-12">
        <ChapterLabel label={t('discussion.label')} sublabel={t('feed.allDiscussions')} className="mb-3.5" />
        {/* 2a 刊头:页题 + dot leaders + mono 共 n 条(stats.discussions 真实总数,B2 点亮) */}
        <div className="flex items-baseline mb-[26px]">
          <h1 className="font-heading text-[32px] leading-[1.2] font-semibold text-foreground-950">
            {t('nav.discuss')}
          </h1>
          {stats && (
            <>
              <span className="dot-leaders" />
              <span className="font-mono text-xs text-foreground-500">
                {t('feed.totalDiscussions', { count: stats.discussions })}
              </span>
            </>
          )}
        </div>

        <PostList showHeader={false} groupByTime items={items} />

        {/* 画布 2a 的 mono 数字页码需要 offset 分页;API 是 keyset 游标,只有「下一页」是
            诚实的——不渲染编造的页码序列。 */}
        {cursor && (
          <div className="flex flex-col items-center gap-2 mt-9 pt-5 border-t border-foreground-200/35">
            <button
              onClick={handleLoadMore}
              disabled={loadingMore}
              className="font-mono text-[13px] text-foreground-700 hover:text-primary-500 transition-colors duration-200 cursor-pointer bg-transparent border-none p-0 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loadingMore ? '…' : `${t('postList.nextPage')} →`}
            </button>
            {loadError && <p className="text-[13px] text-primary-700">{loadError}</p>}
          </div>
        )}
      </div>
    </PageShell>
  );
}
