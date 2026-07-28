import { useTranslation } from 'react-i18next';
import { Navigate, useParams } from 'react-router-dom';
import PageShell from '@/components/feature/PageShell';
import EmptyState from '@/components/base/EmptyState';
import FollowButton from '@/components/feature/FollowButton';
import ProfileHero from '@/pages/profile/components/ProfileHero';
import ProfileTabs from '@/pages/profile/components/ProfileTabs';
import { useAuth } from '@/hooks/useAuth';
import { useApiData } from '@/lib/use-api-data';
import useDocumentTitle from '@/hooks/useDocumentTitle';
import { metaForRoute } from '@/lib/meta';
import { adaptProfile } from '@/lib/adapters/user';
import { unwrap, type ApiUser } from '@/lib/adapters/api-types';

export default function ProfilePage() {
  const { t } = useTranslation();
  const { user: viewer } = useAuth();
  // handleParam 来自 HandleRoute 挂的 "/:handleParam" 路由段(带 '@' 前缀,HandleRoute 已经
  // 校验过形状才会渲染到这个组件),本页与 HandleRoute 共享同一个匹配上下文,直接
  // useParams() 就能读到,不需要 HandleRoute 往下传 props。
  const { handleParam } = useParams();
  const handle = handleParam?.startsWith('@') ? handleParam.slice(1) : handleParam;
  // 修复前这里只读 SSR 注入的 'user' 值、没有客户端重取路径——SPA 从 /@a 导航到 /@b 时
  // (路由靠 src/router/index.tsx 的 key={location.pathname} 整页重挂载,而不是重新请求
  // SSR)拿到的要么是 undefined(渲染 404 空态)要么是 a 的陈旧数据,从没真的取过 b。
  // 现在跟线程页(src/pages/thread/page.tsx)同一套模式:key 'user' 先吃 SSR 注入值
  // (consume-once,首次落地不多打一次请求),之后每次导航到新 handle 都走客户端重取。
  // /api/resolve 客户端重取拿到的是 {user:{...}} 信封,SSR 侧已经用 r.user ?? r 解过一层
  // (server.mjs),这里统一用 unwrap 兼容两种形状(C2 评审 Finding I3)。
  const { data: rawUser, loading } = useApiData<unknown>(
    'user', handle ? `/api/resolve/${encodeURIComponent(handle)}` : null,
  );
  const apiUser = rawUser ? unwrap<ApiUser>(rawUser, 'user') : undefined;

  // SPA 导航同步标签页标题——复用 metaForRoute 保证与 SSR <title> 逐字一致。
  // 必须在下面 movedTo 的 early return 之前调用(hooks 规则)。
  useDocumentTitle(apiUser ? metaForRoute(`/@${handle}`, { user: apiUser }).title : undefined);

  // 改名后的旧 handle:/api/resolve 返回 {moved_to} 而非用户本体。SSR 侧 server.mjs 已按
  // 301 跳转;SPA 客户端重取拿到这个信封时之前直接把它当用户渲染成空白页(C3 清单项)——
  // 这里对齐 SSR 语义,客户端同样 replace 跳转到新 handle。
  const movedTo = (rawUser as { moved_to?: string } | undefined)?.moved_to;
  if (movedTo) {
    return <Navigate to={`/@${movedTo}`} replace />;
  }

  // 取数中(没有 SSR 值、客户端重取还未回来):没有骨架组件,留空,不展示上一个 handle 的
  // 陈旧内容或 mock 数据。
  if (!apiUser && loading) {
    return <PageShell width="wide">{null}</PageShell>;
  }

  // 确认为空(resolve 命中不了 —— 404/dangling):空态,不回落 mock 用户。
  if (!apiUser) {
    return (
      <PageShell width="wide">
        <EmptyState message={t('notFound.title')} hint={t('notFound.deck')} />
      </PageShell>
    );
  }

  const profile = adaptProfile(apiUser);

  return (
    <PageShell width="wide">
      {/* ── Profile Hero with public actions ── */}
      <ProfileHero
        profile={profile}
        actions={
          <>
            {viewer?.handle !== profile.handle && (
              <FollowButton
                kind="user"
                targetId={profile.handle}
                initialFollowing={profile.viewerFollowing}
                followLabel={t('profile.follow')}
                followingLabel={t('profile.following')}
              />
            )}
            {profile.stats.followers > 0 && (
              <span className="text-[13px] text-foreground-400">
                <span className="font-mono text-foreground-600">{profile.stats.followers}</span> {t('profile.followers')}
              </span>
            )}
            <button className="inline-flex items-center px-4 py-1.5 text-sm text-foreground-600 hover:text-foreground-900 transition-colors duration-200 whitespace-nowrap cursor-pointer bg-transparent border-none">
              {t('profile.share')}
            </button>
          </>
        }
      />

      {/* ── Tabs ── */}
      <ProfileTabs profile={profile} />
    </PageShell>
  );
}
