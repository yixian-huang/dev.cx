import { useTranslation } from 'react-i18next';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PageShell from '@/components/feature/PageShell';
import LoginPrompt from '@/components/base/LoginPrompt';
import RichTextarea from '@/components/base/RichTextarea';
import { useAuth } from '@/hooks/useAuth';
import { createClient, type ApiError } from '@/lib/api';
import { apiErrorMessage } from '@/lib/api-errors';
import { updateProfile } from '@/lib/actions';
import type { ApiUser } from '@/lib/adapters/api-types';

export type StatusKey = 'building' | 'exploring' | 'paused' | 'supporting';

// 与旧注册向导 StepIdentity 相同的写入词表(API status 是自由文本字段,这套词表是前端约定)。
const statusOptions: { key: StatusKey; labelKey: string }[] = [
  { key: 'building', labelKey: 'onboarding.statusBuilding' },
  { key: 'exploring', labelKey: 'onboarding.statusExploring' },
  { key: 'paused', labelKey: 'onboarding.statusPaused' },
  { key: 'supporting', labelKey: 'onboarding.statusSupporting' },
];

function toStatusKey(s: string): StatusKey {
  return (statusOptions.some((o) => o.key === s) ? s : 'building') as StatusKey;
}

// 编辑资料页:注册单屏化后,display_name/bio/status 的唯一编辑入口(旧流程里它们只在
// 注册向导里收集,注册完就再也改不了——/me 的「编辑资料」甚至链回 /onboarding)。
export default function EditProfilePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, loading } = useAuth();

  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [status, setStatus] = useState<StatusKey>('building');
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  // 非 401 的写失败内联展示(spec §3 约定),401 跳登录——同 /me/status 的写路径约定。
  const [saveError, setSaveError] = useState<string | undefined>(undefined);

  // useAuth 的 AuthUser 是登录态最小集(没有 bio/status)——表单初值得再问一次 /api/me。
  useEffect(() => {
    if (!user || loaded) return;
    let alive = true;
    createClient({ baseURL: '' })
      .tryGet<{ user: ApiUser }>('/api/me')
      .then((r) => {
        if (!alive || !r?.user) return;
        setDisplayName(r.user.display_name);
        setBio(r.user.bio);
        setStatus(toStatusKey(r.user.status));
        setLoaded(true);
      });
    return () => {
      alive = false;
    };
  }, [user, loaded]);

  const handleSave = async () => {
    if (!displayName.trim() || saving) return;
    setSaveError(undefined);
    setSaving(true);
    try {
      await updateProfile(createClient({ baseURL: '' }), {
        display_name: displayName.trim(),
        bio: bio.trim(),
        status,
      });
      navigate('/me');
    } catch (err) {
      const e = err as ApiError;
      if (e.status === 401) {
        navigate('/login');
        return;
      }
      setSaveError(apiErrorMessage(e));
      setSaving(false);
    }
  };

  if (loading) {
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

  return (
    <PageShell width="narrow" pageEnter hideFooterCTA>
      <header className="py-8 pb-6">
        <h1 className="font-heading text-[28px] font-semibold text-foreground-950 leading-tight">
          {t('me.profile.title')}
        </h1>
        <p className="text-[13px] text-foreground-400 mt-1">{t('me.profile.deck')}</p>
      </header>

      {saveError && (
        <div className="mb-6 px-4 py-3 bg-primary-50/60 rounded-xs text-[13px] text-primary-700">
          {saveError}
        </div>
      )}

      <div className="space-y-8 pb-16">
        {/* Display Name */}
        <div className="space-y-2">
          <p className="text-label text-foreground-500">{t('onboarding.displayName')}</p>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder={t('onboarding.displayNamePlaceholder')}
            className="w-full text-display-md font-heading text-foreground-950 bg-background-100 placeholder:text-foreground-300 px-3 py-2.5 rounded-xs outline-none transition-colors duration-200"
          />
        </div>

        {/* Bio */}
        <div className="space-y-2">
          <p className="text-label text-foreground-500">{t('onboarding.bio')}</p>
          <RichTextarea
            value={bio}
            onChange={setBio}
            placeholder={t('onboarding.bioPlaceholder')}
            rows={3}
            minHeight="90px"
          />
        </div>

        {/* Status */}
        <div className="space-y-3">
          <p className="text-label text-foreground-500">{t('onboarding.status')}</p>
          <div className="flex items-stretch gap-0">
            {statusOptions.map((opt) => {
              const isActive = status === opt.key;
              return (
                <button
                  key={opt.key}
                  onClick={() => setStatus(opt.key)}
                  className={`flex-1 text-center px-3 py-2 text-sm transition-colors duration-200 rounded-xs cursor-pointer ${
                    isActive
                      ? 'bg-background-100 text-foreground-950 font-medium'
                      : 'text-foreground-500 hover:text-foreground-800 hover:bg-background-100'
                  }`}
                >
                  {t(opt.labelKey)}
                </button>
              );
            })}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            onClick={() => navigate(-1)}
            disabled={saving}
            className="px-4 py-2 text-sm text-foreground-500 hover:text-foreground-800 transition-colors duration-200 whitespace-nowrap cursor-pointer disabled:opacity-40"
          >
            {t('compose.cancel')}
          </button>
          <button
            onClick={handleSave}
            disabled={!displayName.trim() || saving}
            className="inline-flex items-center px-5 py-2 text-sm font-medium bg-primary-500 text-background-50 hover:bg-primary-600 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200 rounded-xs whitespace-nowrap cursor-pointer"
          >
            {saving ? t('me.status.saving') : t('me.profile.save')}
          </button>
        </div>
      </div>
    </PageShell>
  );
}
