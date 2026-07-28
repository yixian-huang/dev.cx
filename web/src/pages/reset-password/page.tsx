import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';
import PageShell from '@/components/feature/PageShell';
import { createClient } from '@/lib/api';
import { resetPassword } from '@/lib/actions';

export default function ResetPasswordPage() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [pw, setPw] = useState('');
  const [state, setState] = useState<'form' | 'ok' | 'fail'>('form');

  const submit = async () => {
    if (pw.length < 8) return;
    try {
      await resetPassword(createClient({ baseURL: '' }), token, pw);
      setState('ok');
    } catch {
      setState('fail');
    }
  };

  return (
    <PageShell pageEnter>
      <div className="py-24 max-w-sm mx-auto text-center">
        <div className="font-mono text-[11px] tracking-[0.24em] text-foreground-400 mb-3">
          {t('reset.label')}
        </div>
        {state === 'form' && (
          <>
            <p className="text-[14px] text-foreground-600 mb-4">{t('reset.hint')}</p>
            <input
              type="password"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void submit()}
              placeholder={t('reset.placeholder')}
              className="w-full px-3 py-2 text-[14px] bg-background-50 border border-background-200 rounded-md focus:outline-none focus:border-primary-500 mb-3"
            />
            <button
              onClick={() => void submit()}
              disabled={pw.length < 8}
              className="w-full px-4 py-2 text-[14px] bg-foreground-900 text-background-50 rounded-md cursor-pointer disabled:opacity-40"
            >
              {t('reset.submit')}
            </button>
          </>
        )}
        {state === 'ok' && (
          <>
            <p className="text-[15px] text-foreground-800">{t('reset.ok')}</p>
            <Link to="/login" className="mt-4 inline-block text-[13px] text-primary-600 hover:text-primary-700">
              {t('reset.goLogin')}
            </Link>
          </>
        )}
        {state === 'fail' && (
          <>
            <p className="text-[15px] text-foreground-800">{t('reset.fail')}</p>
            <p className="mt-2 text-[13px] text-foreground-400">{t('reset.failHint')}</p>
          </>
        )}
      </div>
    </PageShell>
  );
}
