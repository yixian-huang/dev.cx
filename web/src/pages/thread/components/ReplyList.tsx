import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import type { ThreadReply, SubReply } from '@/lib/adapters/types';
import Markdown from '@/components/base/Markdown';

const INITIAL_VISIBLE = 5;
const LOAD_MORE_COUNT = 5;

/* ──────────────── Sub-reply (楼中楼) ──────────────── */

function ChildReplyItem({
  child,
  parentFloor,
  replyToName,
  replyToHandle,
  isAdmin,
  onAdminHideReply,
  onAdminUnhideReply,
  onAdminDeleteReply,
}: {
  child: SubReply;
  parentFloor: number;
  replyToName: string;
  replyToHandle: string;
  isAdmin?: boolean;
  onAdminHideReply?: (id: string) => void;
  onAdminUnhideReply?: (id: string) => void;
  onAdminDeleteReply?: (id: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="pl-7 border-l border-background-200/40 ml-1 py-2.5 reply-fade-in">
      <div className="flex items-start gap-2">
        <Link to={`/@${child.author.handle}`} className="shrink-0">
          <img
            src={child.author.avatar}
            alt={child.author.name}
            className="w-[18px] h-[18px] rounded-xs object-cover bg-background-100"
          />
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <Link
              to={`/@${child.author.handle}`}
              className="font-body text-[13.5px] font-semibold text-foreground-900 hover:text-primary-500 transition-colors duration-200 tracking-[0.005em]"
            >
              {child.author.name}
            </Link>
            <span className="font-mono text-[11px] text-foreground-500">
              @{child.author.handle}
            </span>
            {/* @mention target — who this reply is addressing */}
            <span className="inline-flex items-center gap-0.5 text-[11px] text-accent-600 bg-accent-100/60 px-1.5 py-0.5 rounded-xs">
              <i className="ri-reply-line text-[10px]"></i>
              <span className="font-medium">@{replyToHandle}</span>
            </span>
            <span className="text-foreground-400 text-[11px]">{child.time}</span>
            {isAdmin && (
              <span className="ml-2 font-mono text-[10px] text-foreground-300">
                {!child.hidden ? (
                  <button className="hover:text-accent-600 cursor-pointer" onClick={() => onAdminHideReply?.(child.id)}>{t('admin.hide')}</button>
                ) : (
                  <button className="hover:text-accent-600 cursor-pointer" onClick={() => onAdminUnhideReply?.(child.id)}>{t('admin.unhide')}</button>
                )}
                {' · '}
                <button className="hover:text-accent-600 cursor-pointer" onClick={() => onAdminDeleteReply?.(child.id)}>{t('admin.delete')}</button>
              </span>
            )}
          </div>
          <div className="font-body text-[13.5px] text-foreground-700 leading-[1.8] tracking-[0.01em]">
            {/* 隐藏回复:正文为空 = 他人视角 → 墓碑占位;有正文 = 作者/admin 视角 → 提示行 + 原文。 */}
            {child.hidden && !child.body ? (
              <p className="italic text-[13px] text-foreground-400">
                {t('thread.hiddenReply')}
                {child.hiddenReason ? ` · ${child.hiddenReason}` : ''}
              </p>
            ) : (
              <>
                {child.hidden && (
                  <p className="text-[11px] text-accent-600 mb-1">{t('thread.hiddenReplyOwn')}</p>
                )}
                <Markdown>{child.body}</Markdown>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ──────────────── Reply item (一级回复) ──────────────── */

function ReplyItem({
  reply,
  index,
  onReply,
  isLoggedIn,
  threadAuthorHandle,
  isAdmin,
  onAdminHideReply,
  onAdminUnhideReply,
  onAdminDeleteReply,
}: {
  reply: ThreadReply;
  index: number;
  onReply: (floor: number, author: string, replyId: string) => void;
  isLoggedIn: boolean;
  threadAuthorHandle: string;
  isAdmin?: boolean;
  onAdminHideReply?: (id: string) => void;
  onAdminUnhideReply?: (id: string) => void;
  onAdminDeleteReply?: (id: string) => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [childrenExpanded, setChildrenExpanded] = useState(false);
  const hasChildren = reply.children.length > 0;

  // Build a lookup: childId → { name, handle } for resolving @mentions
  const childAuthorMap = useMemo(() => {
    const map: Record<string, { name: string; handle: string }> = {};
    reply.children.forEach((c) => {
      map[c.id] = { name: c.author.name, handle: c.author.handle };
    });
    return map;
  }, [reply.children]);

  // Resolve who a child reply is addressing
  const resolveReplyTarget = (child: SubReply): { name: string; handle: string } => {
    if (child.replyToId === reply.id) {
      return { name: reply.author.name, handle: reply.author.handle };
    }
    const target = childAuthorMap[child.replyToId];
    return target ?? { name: reply.author.name, handle: reply.author.handle };
  };

  // Staggered animation delay based on list position
  const animationDelay = `${Math.min(index * 60, 600)}ms`;

  const handleReplyClick = () => {
    if (!isLoggedIn) {
      navigate('/login');
      return;
    }
    onReply(reply.floor, reply.author.handle, reply.id);
  };

  return (
    <article
      className="py-5 border-t border-background-200/30 first:border-t-0 reply-fade-in hover:bg-background-100/40 -mx-2 px-2 rounded-md transition-colors duration-150"
      style={{ animationDelay }}
    >
      <div className="flex items-start gap-2.5">
        {/* 楼层号:mono #01 双位(画布 6a) */}
        <span className="shrink-0 w-8 text-right font-mono text-[10px] pt-0.5 select-none text-foreground-300">
          #{String(reply.floor).padStart(2, '0')}
        </span>

        <Link to={`/@${reply.author.handle}`} className="shrink-0">
          <img
            src={reply.author.avatar}
            alt={reply.author.name}
            className="w-[22px] h-[22px] rounded-xs object-cover bg-background-100"
          />
        </Link>

        <div className="flex-1 min-w-0">
          {/* Author row */}
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <Link
              to={`/@${reply.author.handle}`}
              className="font-body text-[14.5px] font-semibold text-foreground-900 hover:text-primary-500 transition-colors duration-200 tracking-[0.005em]"
            >
              {reply.author.name}
            </Link>
            <span className="font-mono text-mono-sm text-foreground-500">
              @{reply.author.handle}
            </span>
            {/* 作者回复:朱砂描边「作者」小章(画布 6a) */}
            {threadAuthorHandle && reply.author.handle === threadAuthorHandle && (
              <span className="inline-flex items-center px-1 text-[10px] border border-accent-500 text-accent-500 rounded-xs leading-[1.6]">
                {t('thread.authorBadge')}
              </span>
            )}
            <span className="text-foreground-400 text-body-sm">{reply.time}</span>
            {isAdmin && (
              <span className="ml-2 font-mono text-[10px] text-foreground-300">
                {!reply.hidden ? (
                  <button className="hover:text-accent-600 cursor-pointer" onClick={() => onAdminHideReply?.(reply.id)}>{t('admin.hide')}</button>
                ) : (
                  <button className="hover:text-accent-600 cursor-pointer" onClick={() => onAdminUnhideReply?.(reply.id)}>{t('admin.unhide')}</button>
                )}
                {' · '}
                <button className="hover:text-accent-600 cursor-pointer" onClick={() => onAdminDeleteReply?.(reply.id)}>{t('admin.delete')}</button>
              </span>
            )}
          </div>

          {/* Body:隐藏回复正文为空 = 他人视角 → 墓碑占位;有正文 = 作者/admin 视角 → 提示行 + 原文。 */}
          <div className="font-body text-[15px] text-foreground-800 leading-[1.8] tracking-[0.01em]">
            {reply.hidden && !reply.body ? (
              <p className="italic text-[13px] text-foreground-400">
                {t('thread.hiddenReply')}
                {reply.hiddenReason ? ` · ${reply.hiddenReason}` : ''}
              </p>
            ) : (
              <>
                {reply.hidden && (
                  <p className="text-[11px] text-accent-600 mb-1">{t('thread.hiddenReplyOwn')}</p>
                )}
                <Markdown>{reply.body}</Markdown>
              </>
            )}
          </div>

          {/* Action bar */}
          <div className="flex items-center gap-4 mt-3">
            <button
              onClick={handleReplyClick}
              className="inline-flex items-center gap-1 text-[12px] text-foreground-400 hover:text-primary-500 transition-colors duration-200 cursor-pointer whitespace-nowrap"
            >
              <i className="ri-chat-1-line text-[13px]"></i>
              <span>{isLoggedIn ? t('thread.reply') : t('thread.replyLogin')}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Children (楼中楼) */}
      {hasChildren && (
        <div className="mt-2 ml-8">
          <button
            onClick={() => setChildrenExpanded(!childrenExpanded)}
            className="inline-flex items-center gap-1.5 text-[12px] text-foreground-400 hover:text-foreground-600 transition-colors duration-200 cursor-pointer"
          >
            <i
              className={`${
                childrenExpanded ? 'ri-arrow-up-s-line' : 'ri-arrow-down-s-line'
              } text-[13px]`}
            ></i>
            <span>
              {childrenExpanded
                ? t('thread.collapseChildren')
                : t('thread.expandChildren', { count: reply.children.length })}
            </span>
          </button>
          {childrenExpanded && (
            <div className="mt-2">
              {reply.children.map((child) => {
                const target = resolveReplyTarget(child);
                return (
                  <ChildReplyItem
                    key={child.id}
                    child={child}
                    parentFloor={reply.floor}
                    replyToName={target.name}
                    replyToHandle={target.handle}
                    isAdmin={isAdmin}
                    onAdminHideReply={onAdminHideReply}
                    onAdminUnhideReply={onAdminUnhideReply}
                    onAdminDeleteReply={onAdminDeleteReply}
                  />
                );
              })}
            </div>
          )}
        </div>
      )}
    </article>
  );
}

/* ──────────────── ReplyList ──────────────── */

interface ReplyListProps {
  replies: ThreadReply[];
  onReply: (floor: number, author: string, replyId: string) => void;
  isLoggedIn: boolean;
  /** 帖子作者 handle——作者的回复带朱砂描边「作者」小章。 */
  threadAuthorHandle?: string;
  /** admin 就地处置(Task 9):不传即普通视角,按钮不渲染。 */
  isAdmin?: boolean;
  onAdminHideReply?: (id: string) => void;
  onAdminUnhideReply?: (id: string) => void;
  onAdminDeleteReply?: (id: string) => void;
}

export default function ReplyList({
  replies,
  onReply,
  isLoggedIn,
  threadAuthorHandle = '',
  isAdmin,
  onAdminHideReply,
  onAdminUnhideReply,
  onAdminDeleteReply,
}: ReplyListProps) {
  const { t } = useTranslation();
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  const visibleReplies = replies.slice(0, visibleCount);
  const hasMore = visibleCount < replies.length;

  const loadMore = useCallback(() => {
    setVisibleCount((prev) => Math.min(prev + LOAD_MORE_COUNT, replies.length));
  }, [replies.length]);

  // IntersectionObserver for infinite scroll
  useEffect(() => {
    const el = loadMoreRef.current;
    if (!el || !hasMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          loadMore();
        }
      },
      { rootMargin: '200px' }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, loadMore]);

  return (
    <div>
      {visibleReplies.map((reply, index) => (
        <ReplyItem
          key={reply.id}
          reply={reply}
          index={index}
          onReply={onReply}
          isLoggedIn={isLoggedIn}
          threadAuthorHandle={threadAuthorHandle}
          isAdmin={isAdmin}
          onAdminHideReply={onAdminHideReply}
          onAdminUnhideReply={onAdminUnhideReply}
          onAdminDeleteReply={onAdminDeleteReply}
        />
      ))}

      {/* Load more sentinel */}
      <div ref={loadMoreRef} className="py-4 text-center">
        {hasMore ? (
          <button
            onClick={loadMore}
            className="inline-flex items-center gap-1.5 text-[13px] text-foreground-400 hover:text-foreground-600 transition-colors duration-200 cursor-pointer"
          >
            <i className="ri-arrow-down-line"></i>
            <span>{t('thread.loadMore')}</span>
          </button>
        ) : visibleReplies.length > INITIAL_VISIBLE ? (
          <span className="text-[12px] text-foreground-300">
            {t('thread.allRepliesLoaded')}
          </span>
        ) : null}
      </div>
    </div>
  );
}