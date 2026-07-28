import { useTranslation } from 'react-i18next';
import { useState, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import PageShell from '@/components/feature/PageShell';
import EmptyState from '@/components/base/EmptyState';
import LoginPrompt from '@/components/base/LoginPrompt';
import { useApiData, clientFetch } from '@/lib/use-api-data';
import { createClient } from '@/lib/api';
import { markNotificationsRead } from '@/lib/actions';
import { relativeTime, timeGroup } from '@/lib/adapters/time';
import type { ApiNotification, NotificationsEnvelope } from '@/lib/adapters/api-types';

// B2 点亮:数据来自 GET /api/notifications(SSR 预取 + 客户端重取同 key),结构仍是
// 画布 6b——44px mono 类型列、朱砂未读点(标已读淡出)、更新类主语 mono 产品路径。

interface ViewItem {
  id: string;
  kind: ApiNotification['kind'];
  read: boolean;
  time: string;
  timeGroup: 'today' | 'yesterday' | 'thisWeek';
  actorName: string;
  actorHandle: string;
  post: { slug: string; title: string } | null;
  project: { slug: string; name: string } | null;
  excerpt: string | null;
}

function adaptNotification(n: ApiNotification): ViewItem {
  return {
    id: n.id,
    kind: n.kind,
    read: n.read,
    time: relativeTime(n.created_at),
    timeGroup: timeGroup(n.created_at),
    actorName: n.actor?.display_name ?? '',
    actorHandle: n.actor?.handle ?? '',
    post: n.post,
    project: n.project,
    excerpt: n.kind === 'moderation' ? (n.message ?? null) : n.reply_excerpt,
  };
}

const groupOrder: { key: ViewItem['timeGroup']; labelKey: string }[] = [
  { key: 'today', labelKey: 'notifications.today' },
  { key: 'yesterday', labelKey: 'notifications.yesterday' },
  { key: 'thisWeek', labelKey: 'notifications.thisWeek' },
];

// 画布 6b:44px 固定 mono 类型列——提及=accent、回复=primary、关注/更新=fg-500。
const TYPE_META: Record<ViewItem['kind'], { labelKey: string; color: string; actionKey: string }> = {
  mention: { labelKey: 'notifications.typeMention', color: 'text-accent-600', actionKey: 'notifications.mentionedYou' },
  reply: { labelKey: 'notifications.typeReply', color: 'text-primary-600', actionKey: 'notifications.repliedTo' },
  follow: { labelKey: 'notifications.typeFollow', color: 'text-foreground-500', actionKey: 'notifications.followedYou' },
  project_update: { labelKey: 'notifications.typeUpdate', color: 'text-foreground-500', actionKey: 'notifications.projectUpdate' },
  moderation: { labelKey: 'notifications.typeModeration', color: 'text-accent-600', actionKey: 'notifications.moderationNotice' },
};

function notificationLink(n: ViewItem): string {
  if (n.kind === 'moderation') return '/guidelines';
  if (n.kind === 'follow') return n.actorHandle ? `/@${n.actorHandle}` : '/feed';
  if (n.post) return `/t/${n.post.slug}`;
  if (n.project) return `/p/${n.project.slug}`;
  return '/feed';
}

export default function NotificationsPage() {
  const { t } = useTranslation();
  const { isLoggedIn } = useAuth();

  const { data, loading } = useApiData<NotificationsEnvelope | null>(
    'notifications', isLoggedIn ? '/api/notifications' : null,
  );
  const [extra, setExtra] = useState<ApiNotification[]>([]);
  const [cursorOverride, setCursorOverride] = useState<string | null | undefined>(undefined);
  const [loadingMore, setLoadingMore] = useState(false);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());

  const items: ViewItem[] = useMemo(
    () => (data ? [...data.notifications, ...extra].map(adaptNotification) : []),
    [data, extra],
  );
  const cursor = cursorOverride !== undefined ? cursorOverride : (data?.next_cursor ?? null);
  const unreadCount = useMemo(
    () => Math.max(0, (data?.unread_count ?? 0) - readIds.size),
    [data, readIds],
  );

  const grouped = useMemo(() => {
    const map: Record<string, ViewItem[]> = { today: [], yesterday: [], thisWeek: [] };
    items.forEach((n) => {
      if (map[n.timeGroup]) map[n.timeGroup].push(n);
    });
    return map;
  }, [items]);

  const handleLoadMore = async () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const next = await clientFetch<NotificationsEnvelope>('', `/api/notifications?cursor=${encodeURIComponent(cursor)}`);
      setExtra((prev) => [...prev, ...next.notifications]);
      setCursorOverride(next.next_cursor);
    } catch {
      /* 追加失败保持现状,下次点击重试 */
    } finally {
      setLoadingMore(false);
    }
  };

  const markAllRead = useCallback(() => {
    setReadIds(new Set(items.filter((n) => !n.read).map((n) => n.id)));
    // fire-and-forget:本地即时淡出,服务端失败下次进页会重新出现——不吞语义,只不阻塞交互。
    void markNotificationsRead(createClient({ baseURL: '' }), { all: true }).catch(() => {});
  }, [items]);

  const markOneRead = useCallback((n: ViewItem) => {
    if (n.read || readIds.has(n.id)) return;
    setReadIds((prev) => new Set(prev).add(n.id));
    void markNotificationsRead(createClient({ baseURL: '' }), { ids: [n.id] }).catch(() => {});
  }, [readIds]);

  if (!isLoggedIn) {
    return (
      <PageShell pageEnter>
        <LoginPrompt
          title={t('notifications.loginRequiredTitle')}
          description={t('notifications.loginRequiredDesc')}
          loginLabel={t('login.submit')}
          registerLabel={t('login.registerSubmit')}
        />
      </PageShell>
    );
  }

  if (!data && loading) {
    return <PageShell pageEnter>{null}</PageShell>;
  }

  return (
    <PageShell pageEnter>
      {/* 6b 刊头:h1 + mono 未读数(accent)+ dot leaders + 全部标为已读 */}
      <header className="pt-10 pb-2">
        <div className="flex items-baseline">
          <h1 className="font-heading text-[28px] leading-[1.3] font-semibold text-foreground-950">
            {t('notifications.title')}
          </h1>
          {unreadCount > 0 && (
            <span className="ml-3.5 font-mono text-xs text-accent-600">
              {unreadCount} {t('notifications.unreadCount')}
            </span>
          )}
          <span className="dot-leaders" />
          {unreadCount > 0 && (
            <button
              onClick={markAllRead}
              className="text-[13px] text-foreground-700 hover:text-primary-500 transition-colors duration-200 cursor-pointer bg-transparent border-none p-0 whitespace-nowrap"
            >
              {t('notifications.markAllRead')}
            </button>
          )}
        </div>
      </header>

      {items.length === 0 ? (
        <EmptyState message={t('notifications.empty')} />
      ) : (
        <div>
          {groupOrder.map((group) => {
            const rows = grouped[group.key];
            if (!rows || rows.length === 0) return null;

            return (
              <section key={group.key}>
                <p className="font-mono text-[11px] tracking-[0.2em] text-foreground-400 uppercase pt-7 pb-1.5">
                  {t(group.labelKey)}
                </p>

                <div className="flex flex-col">
                  {rows.map((item) => {
                    const isRead = item.read || readIds.has(item.id);
                    const meta = TYPE_META[item.kind];
                    const actorMono = item.kind === 'project_update' && item.project;

                    return (
                      <Link
                        key={item.id}
                        to={notificationLink(item)}
                        onClick={() => markOneRead(item)}
                        className="block py-[15px] border-b border-background-100 last:border-b-0 group"
                      >
                        <div className="flex gap-3.5">
                          <span className={`shrink-0 w-[44px] font-mono text-[10px] font-medium tracking-[0.1em] pt-1 ${meta.color}`}>
                            {t(meta.labelKey)}
                          </span>

                          <div className="min-w-0 flex-1">
                            <div className="flex items-baseline gap-2 flex-wrap">
                              {/* 未读朱砂点:标记已读后淡出 */}
                              <span
                                className={`w-1.5 h-1.5 rounded-full bg-accent-500 shrink-0 self-center transition-opacity duration-200 ${
                                  isRead ? 'opacity-0' : 'opacity-100'
                                }`}
                              />
                              {actorMono ? (
                                <span className="font-mono text-[13px] font-medium text-foreground-950">
                                  {`@${item.actorHandle} / ${item.project?.slug ?? ''}`}
                                </span>
                              ) : (
                                <>
                                  <span className="text-[14px] font-medium text-foreground-950">{item.actorName}</span>
                                  {item.actorHandle && (
                                    <span className="font-mono text-[12px] text-foreground-400">@{item.actorHandle}</span>
                                  )}
                                </>
                              )}
                              <span className="text-[13px] text-foreground-700">{t(meta.actionKey)}</span>
                              <span className="ml-auto text-[12px] text-foreground-400">{item.time}</span>
                            </div>
                            {item.post && (
                              <p className="mt-1.5 pl-3.5 font-heading text-[14px] font-medium text-foreground-800 group-hover:text-primary-500 transition-colors duration-200">
                                {item.post.title}
                              </p>
                            )}
                            {item.excerpt && (
                              <p className="mt-1 pl-3.5 text-[13px] leading-[1.7] text-foreground-700 line-clamp-2">
                                {item.excerpt}
                              </p>
                            )}
                            {!item.post && item.project && item.kind !== 'project_update' && (
                              <p className="mt-1 pl-3.5 text-[12px] text-foreground-400">{item.project.name}</p>
                            )}
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </section>
            );
          })}

          {cursor && (
            <div className="flex justify-center mt-9 pt-5 border-t border-foreground-200/35">
              <button
                onClick={handleLoadMore}
                disabled={loadingMore}
                className="font-mono text-[13px] text-foreground-700 hover:text-primary-500 transition-colors duration-200 cursor-pointer bg-transparent border-none p-0 disabled:opacity-50"
              >
                {loadingMore ? '…' : `${t('postList.nextPage')} →`}
              </button>
            </div>
          )}
        </div>
      )}
    </PageShell>
  );
}
