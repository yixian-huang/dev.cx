import { useTranslation } from 'react-i18next';
import { useCallback, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth, type AuthUser } from '@/hooks/useAuth';
import PageShell from '@/components/feature/PageShell';
import LoginPrompt from '@/components/base/LoginPrompt';
import ProfileHero from '@/pages/profile/components/ProfileHero';
import ProfileTabs from '@/pages/profile/components/ProfileTabs';
import ImageUpload, { type ImageUploadResult } from '@/components/feature/ImageUpload';
import type { UIProfile } from '@/lib/adapters/types';
import { createClient, type ApiError } from '@/lib/api';
import { apiErrorMessage } from '@/lib/api-errors';
import { updateProfile } from '@/lib/actions';

// useAuth() 的 AuthUser 只是登录态最小集(handle/displayName/avatarUrl)——/me 是私有页,
// server.mjs 不为它预取完整档案(bio/status/weekly_status/links),这里只搬运 AuthUser 确实有
// 的字段,其余中性留空/默认,不编造。ProfileHero/ProfileTabs 的 prop 契约冻结为 UIProfile
// 形状,故仍以其为基底、只填真实可得的字段——status 字面量类型只允许 'BUILDING'
// (adaptProfile 同款回落,见该函数注释),不是遗漏。
function meProfile(u: AuthUser): UIProfile {
  return {
    id: u.handle,
    handle: u.handle,
    displayName: u.displayName,
    avatar: u.avatarUrl || '',
    status: 'BUILDING',
    bio: '',
    location: '',
    company: '',
    links: [],
    currentWork: { text: '', done: '', blockers: '', next: '', updatedAt: '' },
    works: [],
    stats: { worksCount: 0, followers: 0, following: 0 },
  };
}

export default function MePage() {
  const { t } = useTranslation();
  const { user, loading, logout } = useAuth();
  const navigate = useNavigate();
  // 头像没有草稿态(T11 brief 定案)——上传成功即刻 updateProfile,不等一个额外的"保存"按钮。
  // useAuth() 的 user 对象只在 login/logout/register 时刷新，这里没有对应的"重新拉取 /me"入口
  // (T10 未提供)，故成功后用本地覆盖值直接顶替 profile.avatar，保证同一页面立刻看到新头像。
  const [avatarOverride, setAvatarOverride] = useState<string | undefined>(undefined);
  const [avatarSaving, setAvatarSaving] = useState(false);
  // 非 401 内联展示 + 401 跳登录，跟 T10 的 status/settings 写路径同一套约定(见 status/page.tsx)。
  const [avatarError, setAvatarError] = useState<string | undefined>(undefined);

  // 周报邮件开关:乐观更新(点击即翻转显示),失败回滚。useAuth 的 user 不在此处刷新
  // (同 avatarOverride 的理由),用本地覆盖值顶替显示。
  const [emailWeeklyOverride, setEmailWeeklyOverride] = useState<boolean | undefined>(undefined);
  const toggleEmailWeekly = useCallback(
    async (next: boolean) => {
      setEmailWeeklyOverride(next);
      try {
        await updateProfile(createClient({ baseURL: '' }), { email_weekly: next });
      } catch (err) {
        const e = err as ApiError;
        if (e.status === 401) {
          navigate('/login');
          return;
        }
        setEmailWeeklyOverride(!next);
      }
    },
    [navigate],
  );

  const handleAvatarUploaded = useCallback(
    async (result: ImageUploadResult) => {
      setAvatarError(undefined);
      setAvatarSaving(true);
      try {
        await updateProfile(createClient({ baseURL: '' }), { avatar_url: result.url });
        setAvatarOverride(result.url);
      } catch (err) {
        const e = err as ApiError;
        if (e.status === 401) {
          navigate('/login');
          return;
        }
        setAvatarError(apiErrorMessage(e));
      } finally {
        setAvatarSaving(false);
      }
    },
    [navigate],
  );

  if (loading) {
    // 无现成骨架组件——留空(不展示 mock 的 Chip Zhang)。
    return <PageShell hideFooterCTA>{null}</PageShell>;
  }

  if (!user) {
    return (
      <PageShell hideFooterCTA>
        <LoginPrompt
          title={t('me.loginRequiredTitle')}
          description={t('me.loginRequiredDesc')}
          loginLabel={t('login.submit')}
          registerLabel={t('login.registerSubmit')}
        />
      </PageShell>
    );
  }

  const profile = meProfile(user);
  if (avatarOverride) profile.avatar = avatarOverride;
  const emailWeekly = emailWeeklyOverride ?? user.emailWeekly;

  return (
    <PageShell pageEnter hideFooterCTA>
      {/* ── Profile Hero with self-view actions ── */}
      <ProfileHero
        profile={profile}
        actions={
          <>
            <Link
              to="/me/profile"
              className="inline-flex items-center px-4 py-1.5 text-sm font-medium bg-primary-500 text-background-50 hover:bg-primary-600 rounded-xs whitespace-nowrap transition-colors duration-200"
            >
              {t('me.editProfile')}
            </Link>
            <Link
              to={`/@${profile.handle}`}
              className="inline-flex items-center px-4 py-1.5 text-sm text-foreground-600 hover:text-foreground-900 transition-colors duration-200 whitespace-nowrap"
            >
              {t('me.profilePreview')}
            </Link>
            <ImageUpload
              onUploaded={handleAvatarUploaded}
              disabled={avatarSaving}
              className="inline-flex items-center px-4 py-1.5 text-sm text-foreground-600 hover:text-foreground-900 transition-colors duration-200 whitespace-nowrap cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed bg-transparent border-none"
              label={t('me.changeAvatar')}
            >
              {avatarSaving ? t('me.status.saving') : t('me.changeAvatar')}
            </ImageUpload>
            {avatarError && <span className="text-[13px] text-primary-700">{avatarError}</span>}
          </>
        }
      />

      {/* ── 新账号完善引导(注册单屏化后,原三步向导收集的档案项在这里按场景承接)──
          没头像 ≈ 刚落地的账号:AuthUser 只有登录态最小集,avatarUrl 是这里唯一可判的
          完整度信号,不为它单独再拉一次 /api/me。 */}
      {!profile.avatar && (
        <div className="mb-6 bg-background-100/50 rounded-lg p-5">
          <p className="text-[13px] font-medium text-foreground-700 mb-3">{t('me.setup.title')}</p>
          <div className="space-y-2">
            <Link to="/me/profile" className="flex items-center gap-2 text-[13px] text-foreground-600 hover:text-primary-600 transition-colors duration-200">
              <i className="ri-user-3-line text-[14px] text-foreground-400"></i>
              {t('me.setup.profile')}
            </Link>
            <Link to="/new-project" className="flex items-center gap-2 text-[13px] text-foreground-600 hover:text-primary-600 transition-colors duration-200">
              <i className="ri-folder-add-line text-[14px] text-foreground-400"></i>
              {t('me.setup.project')}
            </Link>
            <Link to="/me/status" className="flex items-center gap-2 text-[13px] text-foreground-600 hover:text-primary-600 transition-colors duration-200">
              <i className="ri-pulse-line text-[14px] text-foreground-400"></i>
              {t('me.setup.status')}
            </Link>
          </div>
        </div>
      )}

      {/* ── Quick actions bar ── */}
      <div className="flex items-center gap-2 pb-6 border-b border-background-200/50">
        <Link
          to="/compose"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[13px] text-foreground-600 hover:text-foreground-900 bg-background-100 hover:bg-background-200/60 rounded-md transition-colors duration-200 whitespace-nowrap"
        >
          <span className="w-3.5 h-3.5 flex items-center justify-center">
            <i className="ri-add-line text-sm" />
          </span>
          {t('me.quickProject')}
        </Link>
        <Link
          to="/me/status"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[13px] text-foreground-600 hover:text-foreground-900 bg-background-100 hover:bg-background-200/60 rounded-md transition-colors duration-200 whitespace-nowrap"
        >
          <span className="w-3.5 h-3.5 flex items-center justify-center">
            <i className="ri-pulse-line text-sm" />
          </span>
          {t('me.statusUpdate')}
        </Link>
        <Link
          to="/me/projects"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[13px] text-foreground-600 hover:text-foreground-900 bg-background-100 hover:bg-background-200/60 rounded-md transition-colors duration-200 whitespace-nowrap"
        >
          <span className="w-3.5 h-3.5 flex items-center justify-center">
            <i className="ri-folder-3-line text-sm" />
          </span>
          {t('me.myProjects')}
        </Link>
        <Link
          to="/compose"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[13px] text-foreground-600 hover:text-foreground-900 bg-background-100 hover:bg-background-200/60 rounded-md transition-colors duration-200 whitespace-nowrap"
        >
          <span className="w-3.5 h-3.5 flex items-center justify-center">
            <i className="ri-draft-line text-sm" />
          </span>
          {t('me.drafts')}
        </Link>
        <Link
          to="/feed"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[13px] text-foreground-600 hover:text-foreground-900 bg-background-100 hover:bg-background-200/60 rounded-md transition-colors duration-200 whitespace-nowrap"
        >
          <span className="w-3.5 h-3.5 flex items-center justify-center">
            <i className="ri-bookmark-line text-sm" />
          </span>
          {t('me.bookmarks')}
        </Link>
      </div>

      {/* ── Tabs ── */}
      <ProfileTabs profile={profile} />

      {/* ── Footer: sign out ── */}
      <div className="pb-10 pt-6 border-t border-background-200/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              to="/me/projects"
              className="text-[13px] text-foreground-400 hover:text-foreground-700 transition-colors duration-200"
            >
              {t('me.settings')}
            </Link>
            {/* 原生 <a>:浏览器直接下载 attachment,SSR 下也只是普通链接。 */}
            <a
              href="/api/me/export"
              className="text-[13px] text-foreground-500 hover:text-primary-500 transition-colors duration-200"
            >
              {t('me.export')}
            </a>
            <button
              onClick={() => toggleEmailWeekly(!emailWeekly)}
              className="text-[13px] text-foreground-500 hover:text-primary-500 transition-colors duration-200 cursor-pointer bg-transparent border-none"
            >
              {t('me.emailWeekly')}：{emailWeekly ? t('me.emailWeeklyOn') : t('me.emailWeeklyOff')}
            </button>
          </div>
          <button
            onClick={logout}
            className="text-[13px] text-foreground-400 hover:text-foreground-700 transition-colors duration-200 cursor-pointer bg-transparent border-none"
          >
            {t('me.signOut')}
          </button>
        </div>
      </div>
    </PageShell>
  );
}