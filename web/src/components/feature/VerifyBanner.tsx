import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/hooks/useAuth';
import { createClient } from '@/lib/api';
import { resendVerification } from '@/lib/actions';

// 登录且邮箱未验证时的全宽提醒条。独立成组件挂进 PageShell,让 PageShell 保持纯布局无状态。
export default function VerifyBanner() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [resent, setResent] = useState(false);

  if (!user || user.emailVerified) return null;

  return (
    <div className="w-full bg-accent-100/50 border-b border-accent-500/30 px-6 py-2 text-center text-[13px] text-foreground-700">
      {t('verify.banner')}
      <button
        onClick={async () => {
          try {
            await resendVerification(createClient({ baseURL: '' }));
            setResent(true);
          } catch { setResent(true); }
        }}
        className="ml-2 underline hover:text-accent-600 cursor-pointer"
        disabled={resent}
      >
        {resent ? t('verify.resent') : t('verify.resend')}
      </button>
    </div>
  );
}
