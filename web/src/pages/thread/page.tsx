import { useTranslation } from 'react-i18next';
import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import PageShell from '@/components/feature/PageShell';
import EmptyState from '@/components/base/EmptyState';
import PageSkeleton from '@/components/base/PageSkeleton';
import type { BaseThread, ThreadReply } from '@/lib/adapters/types';
import { useApiData } from '@/lib/use-api-data';
import useDocumentTitle from '@/hooks/useDocumentTitle';
import { metaForRoute } from '@/lib/meta';
import { createClient, type ApiError } from '@/lib/api';
import { apiErrorMessage } from '@/lib/api-errors';
import { unwrap, type ApiPost, type ApiReply } from '@/lib/adapters/api-types';
import Markdown, { type Components } from '@/components/base/Markdown';
import { adaptThread } from '@/lib/adapters/post';
import {
  createReply,
  adminHidePost,
  adminUnhidePost,
  adminHideReply,
  adminUnhideReply,
  adminDeleteReply,
} from '@/lib/actions';
import ThreadHeader from './components/ThreadHeader';
import MergedFromBanner from './components/MergedFromBanner';
import ReplyList from './components/ReplyList';
import ReplyComposer from './components/ReplyComposer';

type SortOrder = 'latest' | 'earliest';

// 中性空占位——只在还没确认 apiPost 是否存在的窗口内让下面依赖 thread 形状的 hooks
// (useMemo 排序回复)有安全的值可用,不会真的渲染出来(渲染分支在拿到/确认缺失后才决定)。
const EMPTY_THREAD: BaseThread = {
  id: '', type: 'DISCUSS', title: '',
  author: { name: '', handle: '', avatar: '' },
  createdAt: '', formattedTime: '',
  feedbackWanted: [], uncertainties: [], body: '', replies: [],
};

// 帖子正文:16px 阅读字号由 article 容器继承,段距放宽到 mb-5 保持原有阅读节奏。
const threadBodyComponents: Components = {
  p: ({ children }) => <p className="mb-5 last:mb-0">{children}</p>,
};

export default function ThreadPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id: slug } = useParams();
  const { isLoggedIn, user } = useAuth();
  const [sortOrder, setSortOrder] = useState<SortOrder>('earliest');
  const [replyToFloor, setReplyToFloor] = useState<number | undefined>(undefined);
  const [replyToAuthor, setReplyToAuthor] = useState<string | undefined>(undefined);
  const [replyToId, setReplyToId] = useState<string | undefined>(undefined);
  const [docked, setDocked] = useState(false);
  // 非 401 的写失败要内联呈现(spec §3:"无 toast" 只禁止 toast 通知,不禁止内联表单错误——
  // Task 6 的登录页已经是这个先例),而不是像旧版那样静默吞掉、还把用户打好的草稿清空。
  const [sendError, setSendError] = useState<string | undefined>(undefined);
  // 回复提交成功后 bump 这个 token 让 useApiData 绕开"data 已存在则不重取"的守卫,重新拉取回复列表
  // （不能用 location.reload——那会把整页状态都丢掉）。
  const [repliesRefresh, setRepliesRefresh] = useState(0);
  // admin 隐藏/恢复帖子后 bump,让帖子本体也绕开 useApiData 的"已有数据不重取"守卫。
  const [postRefresh, setPostRefresh] = useState(0);

  const dockSentinelRef = useRef<HTMLDivElement>(null);

  // 客户端重取路径拿到的是信封({post:{...}}/{replies:[...]}),SSR 注入的是裸对象/裸数组——
  // 用 unwrap 在页面层统一解一次信封。
  const { data: rawPost, loading: postLoading } = useApiData<unknown>(
    'post', slug ? `/api/posts/${slug}` : null, postRefresh,
  );
  const { data: rawReplies } = useApiData<unknown>(
    'replies', slug ? `/api/posts/${slug}/replies` : null, repliesRefresh,
  );
  const apiPost = rawPost ? unwrap<ApiPost>(rawPost, 'post') : undefined;

  // SPA 导航同步标签页标题——复用 metaForRoute 保证与 SSR <title> 逐字一致。
  useDocumentTitle(apiPost ? metaForRoute(`/t/${slug}`, { post: apiPost }).title : undefined);
  const apiReplies = rawReplies ? unwrap<ApiReply[]>(rawReplies, 'replies') : undefined;

  // 拿不到真实帖子时用中性空占位撑住下面几个 hook 的形状要求(见 EMPTY_THREAD 注释)——
  // 是否渲染真内容由下面 postLoading/apiPost 的分支决定,不是回落 mock。
  const thread: BaseThread = apiPost ? adaptThread(apiPost, apiReplies ?? []) : EMPTY_THREAD;

  // Sort replies
  const sortedReplies: ThreadReply[] = useMemo(() => {
    return [...thread.replies].sort((a, b) => {
      if (sortOrder === 'latest') {
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });
  }, [thread.replies, sortOrder]);

  // IntersectionObserver: when sentinel enters viewport → dock the composer
  useEffect(() => {
    const el = dockSentinelRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        setDocked(entries[0].isIntersecting);
      },
      { rootMargin: '0px 0px -80px 0px' }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // 返回值告诉 ReplyComposer 是否发送成功——失败时它要保留草稿、不折叠,不能像 onCancelReply
  // 那样交给页面直接清掉 replyToFloor/replyToAuthor/replyToId(那是"回复目标"状态,发送失败
  // 时用户仍在回复同一楼层,不该被重置)。
  const handleSend = useCallback(async (text: string): Promise<boolean> => {
    setSendError(undefined);
    if (!slug) return true;
    try {
      await createReply(createClient({ baseURL: '' }), slug, text, replyToId);
      setRepliesRefresh((n) => n + 1);
      return true;
    } catch (err) {
      const e = err as ApiError;
      if (e.status === 401) {
        navigate('/login');
        return false;
      }
      setSendError(apiErrorMessage(e));
      return false;
    }
  }, [slug, replyToId, navigate]);

  const handleCancelReply = useCallback(() => {
    setReplyToFloor(undefined);
    setReplyToAuthor(undefined);
    setReplyToId(undefined);
    setSendError(undefined);
  }, []);

  const handleReplyClick = useCallback((floor: number, author: string, replyId: string) => {
    setReplyToFloor(floor);
    setReplyToAuthor(author);
    setReplyToId(replyId);
  }, []);

  // 取数中(无 SSR / 预取未命中):文章骨架,避免整页空白。
  if (!apiPost && postLoading) {
    return <PageSkeleton variant="article" />;
  }
  // 确认为空(取到了、帖子确实不存在——404):空态,不回落 mock 帖子。
  if (!apiPost) {
    return (
      <PageShell pageEnter>
        <EmptyState message={t('notFound.title')} hint={t('notFound.deck')} />
      </PageShell>
    );
  }

  // 软隐藏(spec §3):他人 → 墓碑整页替换;作者/admin → 横幅 + 原文照常。
  // API 对他人已清空 title/body;title 建帖时强制非空,是可靠的视角判别字段
  // (body_md 允许为空,不能用它判断)。
  const hiddenTombstone = thread.hidden && !thread.title;
  if (hiddenTombstone) {
    return (
      <PageShell pageEnter>
        <div className="py-24 text-center">
          <div className="font-mono text-[11px] tracking-[0.24em] text-foreground-400 mb-3">
            {t('thread.hiddenLabel')}
          </div>
          <p className="text-[15px] text-foreground-600">{t('thread.hiddenPost')}</p>
          {thread.hidden?.reason && (
            <p className="mt-2 text-[13px] text-foreground-400">
              {t('thread.hiddenReasonLabel')}: {thread.hidden.reason}
            </p>
          )}
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell pageEnter>
      <ThreadHeader thread={thread} />

      {/* admin 就地处置条:admin 视角不会走上面的墓碑早退(API 保留了 body),
          所以隐藏帖上此条仍可见,可执行恢复。reason 用 window.prompt——最小 UI,不为一个入参造模态。 */}
      {user?.isAdmin && apiPost && (
        <div className="mb-4 flex items-center gap-3 font-mono text-[11px] text-foreground-400">
          <span className="tracking-[0.24em]">{t('admin.inlineLabel')}</span>
          {!apiPost.hidden ? (
            <button
              className="hover:text-accent-600 cursor-pointer"
              onClick={async () => {
                const reason = window.prompt(t('admin.reasonPrompt'));
                if (!reason) return;
                await adminHidePost(createClient({ baseURL: '' }), slug!, reason);
                setPostRefresh((n) => n + 1);
              }}
            >
              {t('admin.hidePost')}
            </button>
          ) : (
            <button
              className="hover:text-accent-600 cursor-pointer"
              onClick={async () => {
                await adminUnhidePost(createClient({ baseURL: '' }), slug!);
                setPostRefresh((n) => n + 1);
              }}
            >
              {t('admin.unhidePost')}
            </button>
          )}
        </div>
      )}

      {/* 求反馈色带(画布 6a):bg-100 整段,朱砂点 label + chips。作者的具体提问在正文里
          (compose 侧的引导),不做摘录编造。 */}
      {thread.feedbackWanted.length > 0 && (
        <div className="mb-6 -mx-6 px-6 chapter-band">
          <div className="py-4">
            <div className="flex items-center gap-2 font-mono text-[11px] tracking-[0.24em] text-foreground-400">
              <span className="w-1.5 h-1.5 rounded-full bg-accent-500" />
              {t('thread.feedbackWanted')}
            </div>
            <div className="flex items-center gap-2 mt-2.5 flex-wrap">
              {thread.feedbackWanted.map((chip) => (
                <span
                  key={chip}
                  className="inline-flex items-center px-2.5 py-[3px] text-[13px] bg-secondary-100 text-foreground-900 rounded-xs"
                >
                  {chip}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Merge history banner */}
      {thread.mergeInfo?.mergedFrom && thread.mergeInfo.mergedFrom.length > 0 && (
        <MergedFromBanner mergeInfo={thread.mergeInfo} />
      )}

      {thread.mergeInfo?.mergedInto && (
        <div className="mb-6 px-4 py-3 bg-background-100 border border-background-200/50 rounded-md">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 flex items-center justify-center text-foreground-400">
              <i className="ri-git-merge-line text-[14px]"></i>
            </div>
            <span className="text-[13px] text-foreground-500">{t('thread.mergedInto')}</span>
            <Link
              to={`/t/${thread.mergeInfo.mergedInto.id}`}
              className="text-[13px] text-primary-600 hover:text-primary-700 transition-colors duration-200 truncate min-w-0"
            >
              {thread.mergeInfo.mergedInto.title}
            </Link>
          </div>
        </div>
      )}

      {/* 作者/admin 视角:隐藏帖不走墓碑早退(API 保留了原文),这里给可见横幅。 */}
      {thread.hidden && (
        <div className="mb-6 px-4 py-3 bg-accent-100/40 border border-accent-500/30 rounded-md text-[13px] text-foreground-600">
          {t('thread.hiddenOwnBanner')}
          {thread.hidden.reason && <span> · {thread.hidden.reason}</span>}
        </div>
      )}

      {/* Post body — 真实 Markdown 渲染(与 compose 预览同一套映射);
          逐块 stagger 动画改为整篇一次 fade-in。 */}
      <article className="pt-4 pb-6 font-body text-[16px] text-foreground-800 leading-[1.85] tracking-[0.012em] content-fade-in">
        <Markdown components={threadBodyComponents}>{thread.body}</Markdown>
      </article>

      {/* Replies section */}
      <section className="pb-8">
        <div className="flex items-center justify-between mb-6">
          <span className="text-body-sm text-foreground-500">
            {thread.replies.length} {t('thread.replyCount')}
          </span>
          <div className="flex items-center gap-2">
            <span className="text-body-sm text-foreground-400">{t('thread.sort')}</span>
            <button
              onClick={() => setSortOrder('earliest')}
              className={`text-body-sm transition-colors duration-200 whitespace-nowrap cursor-pointer ${
                sortOrder === 'earliest'
                  ? 'text-foreground-900 font-medium'
                  : 'text-foreground-500 hover:text-foreground-800'
              }`}
            >
              {t('thread.sortEarliest')}
            </button>
            <span className="text-foreground-300 text-body-sm">/</span>
            <button
              onClick={() => setSortOrder('latest')}
              className={`text-body-sm transition-colors duration-200 whitespace-nowrap cursor-pointer ${
                sortOrder === 'latest'
                  ? 'text-foreground-900 font-medium'
                  : 'text-foreground-500 hover:text-foreground-800'
              }`}
            >
              {t('thread.sortLatest')}
            </button>
            <span className="text-foreground-300 text-body-sm">·</span>
            <a
              href={`mailto:report@dev.cx?subject=${encodeURIComponent('[report] ' + (typeof window !== 'undefined' ? window.location.href : `/t/${slug ?? ''}`))}`}
              className="text-body-sm text-foreground-400 hover:text-foreground-700 transition-colors duration-200"
            >
              {t('thread.report')}
            </a>
          </div>
        </div>

        <ReplyList
          replies={sortedReplies}
          onReply={handleReplyClick}
          isLoggedIn={isLoggedIn}
          threadAuthorHandle={thread.author.handle}
          isAdmin={user?.isAdmin ?? false}
          onAdminHideReply={async (id) => {
            const reason = window.prompt(t('admin.reasonPrompt'));
            if (!reason) return;
            await adminHideReply(createClient({ baseURL: '' }), id, reason);
            setRepliesRefresh((n) => n + 1);
          }}
          onAdminUnhideReply={async (id) => {
            await adminUnhideReply(createClient({ baseURL: '' }), id);
            setRepliesRefresh((n) => n + 1);
          }}
          onAdminDeleteReply={async (id) => {
            const reason = window.prompt(t('admin.deletePrompt'));
            if (!reason) return;
            await adminDeleteReply(createClient({ baseURL: '' }), id, reason);
            setRepliesRefresh((n) => n + 1);
          }}
        />
      </section>

      {/* Docking sentinel */}
      <div ref={dockSentinelRef} className="h-1" />

      {/* Spacer for floating composer when not docked; mobile 再加底栏高度 */}
      {!docked && isLoggedIn && <div className="h-20 lg:h-20 mb-14 lg:mb-0" aria-hidden />}

      {/* Composer: floats or docks based on scroll */}
      <ReplyComposer
        onSend={handleSend}
        replyToFloor={replyToFloor}
        replyToAuthor={replyToAuthor}
        onCancelReply={handleCancelReply}
        docked={docked}
        isLoggedIn={isLoggedIn}
        error={sendError}
      />
    </PageShell>
  );
}