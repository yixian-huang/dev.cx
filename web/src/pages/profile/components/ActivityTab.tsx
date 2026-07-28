import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import EmptyState from '@/components/base/EmptyState';
import { useApiData } from '@/lib/use-api-data';
import { unwrap, type ApiPost } from '@/lib/adapters/api-types';
import { adaptFeedItem } from '@/lib/adapters/post';
import type { FeedItem, UIProfile } from '@/lib/adapters/types';

function getActivityIcon(type: FeedItem['type']) {
  switch (type) {
    case 'BUILD':
      return 'ri-git-commit-line';
    case 'SHOW':
      return 'ri-lightbulb-flash-line';
    case 'DISCUSS':
      return 'ri-quill-pen-line';
    default:
      return 'ri-circle-line';
  }
}

function getActivityColor(type: FeedItem['type']) {
  switch (type) {
    case 'BUILD':
      return 'text-primary-500 bg-primary-100/60';
    case 'SHOW':
      return 'text-primary-500 bg-primary-100/60';
    case 'DISCUSS':
      return 'text-secondary-500 bg-secondary-100/60';
    default:
      return 'text-foreground-400 bg-background-100';
  }
}

// 每条动态就是一篇帖子本身(/api/posts?author= 返回的就是帖子列表),链接目标恒为该帖详情页——
// 不像 mock 的 ActivityEvent 那样区分 threadId/projectId 两种目标,故恒非 null；保留 string|null
// 的函数签名与下方 JSX 的 if/else 分支结构,只是 else 分支在真实数据下不会被走到。
function getActivityLink(event: FeedItem): string | null {
  return event.id ? `/t/${event.id}` : null;
}

export default function ActivityTab({ profile }: { profile: UIProfile }) {
  const { t } = useTranslation();
  // activity 是纯客户端 tab 取数(非预取 key),按 handle 请求该用户发布的帖子列表。
  const { data: rawActivity, loading } = useApiData<unknown>(
    `activity:${profile.handle}`,
    profile.handle ? `/api/posts?author=${profile.handle}` : null,
  );
  const apiPosts = rawActivity ? unwrap<ApiPost[]>(rawActivity, 'posts') : undefined;

  // 取数中:没有现成的骨架组件,留空(不展示旧/mock 数据)。
  if (!apiPosts && loading) return null;

  const activityEvents = apiPosts ? apiPosts.map(adaptFeedItem) : [];

  if (activityEvents.length === 0) {
    return <EmptyState message={t('profile.noActivity')} />;
  }

  return (
    <div className="py-2 space-y-0">
      {activityEvents.map((event) => {
        const link = getActivityLink(event);
        const content = (
          <div className="flex items-start gap-3 py-3 group">
            <div className={`w-7 h-7 flex items-center justify-center rounded-md shrink-0 mt-0.5 ${getActivityColor(event.type)}`}>
              <i className={`${getActivityIcon(event.type)} text-[14px]`}></i>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-[13px] font-medium text-foreground-800 leading-snug">
                  {event.title}
                </span>
              </div>
              {/* API 的帖子列表无独立的活动摘要字段(mock 独有的 description)——中性空串,
                  不编造,JSX 结构保留让它自然渲染为空。 */}
              <p className="text-[12px] text-foreground-500 leading-relaxed mb-1">
                {''}
              </p>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-foreground-400">{event.time}</span>
                {event.projectName && (
                  <>
                    <span className="text-foreground-300 text-[10px]">·</span>
                    <span className="text-[11px] text-foreground-500">{event.projectName}</span>
                  </>
                )}
              </div>
            </div>
            {link && (
              <Link
                to={link}
                className="shrink-0 w-6 h-6 flex items-center justify-center text-foreground-300 hover:text-foreground-600 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
              >
                <i className="ri-arrow-right-up-line text-[13px]"></i>
              </Link>
            )}
          </div>
        );

        return link ? (
          <Link key={event.id} to={link} className="block hover:bg-background-100/60 rounded-md -mx-2 px-2 transition-colors duration-150 cursor-pointer">
            {content}
          </Link>
        ) : (
          <div key={event.id} className="rounded-md -mx-2 px-2">
            {content}
          </div>
        );
      })}
    </div>
  );
}
