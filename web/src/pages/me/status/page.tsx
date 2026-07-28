import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PageShell from '@/components/feature/PageShell';
import StatusUpdateForm from '@/components/feature/StatusUpdateForm';
import { useAuth } from '@/hooks/useAuth';
import { createClient, type ApiError } from '@/lib/api';
import { apiErrorMessage } from '@/lib/api-errors';
import { updateProfile } from '@/lib/actions';

export default function StatusPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  // 非 401 的写失败内联展示(spec §3 约定,Task 7 先例),不吞、不用 toast。
  const [saveError, setSaveError] = useState<string | undefined>(undefined);

  const handleSubmit = async (value: string) => {
    setSaveError(undefined);
    setSaving(true);
    try {
      await updateProfile(createClient({ baseURL: '' }), { weekly_status: value.trim() });
      setSaving(false);
      setSaved(true);
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

  const profileHref = user?.handle ? `/@${user.handle}` : '/me';

  if (saved) {
    return (
      <PageShell width="narrow" pageEnter>
        <div className="py-20 text-center fade-in-up">
          <div className="mb-6">
            <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-primary-100 flex items-center justify-center">
              <i className="ri-check-line text-primary-600 text-xl"></i>
            </div>
            <p className="font-heading text-[22px] font-medium text-foreground-950 mb-1">
              {t('me.status.saved', '状态已更新')}
            </p>
            <p className="text-body-sm text-foreground-500">
              {t('me.status.savedDesc', '你的主页已显示最新状态')}
            </p>
          </div>
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={() => navigate(profileHref)}
              className="inline-flex items-center px-4 py-2 text-sm font-medium bg-primary-500 text-background-50 hover:bg-primary-600 transition-colors duration-200 rounded-xs whitespace-nowrap cursor-pointer"
            >
              {t('me.status.viewProfile', '查看主页')}
            </button>
            <button
              onClick={() => {
                setSaved(false);
                setSaving(false);
              }}
              className="inline-flex items-center px-4 py-2 text-sm text-foreground-600 hover:text-foreground-900 transition-colors duration-200 whitespace-nowrap cursor-pointer"
            >
              {t('me.status.updateAgain', '继续编辑')} →
            </button>
          </div>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell width="narrow" pageEnter>
      <header className="py-8 pb-4">
        <h1 className="font-heading text-[28px] font-semibold text-foreground-950 leading-tight">
          {t('me.status.title', '更新状态')}
        </h1>
        <p className="text-[13px] text-foreground-400 mt-1">
          {t('me.status.deck', '记录本周的进展，让社区了解你的节奏')}
        </p>
      </header>

      {saveError && (
        <div className="px-5 text-[13px] text-primary-700">{saveError}</div>
      )}

      <div className="p-5 pb-6">
        {/* 初值留空(不预填现值):API 只有单一 weekly_status 文本字段,这里语义是「写这周的
            新状态」而非编辑旧文。 */}
        <StatusUpdateForm
          initialValue=""
          onSubmit={handleSubmit}
          onCancel={() => navigate(-1)}
          submitting={saving}
        />
      </div>

      <div className="h-12" />
    </PageShell>
  );
}
