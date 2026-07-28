import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';
import PageShell from '@/components/feature/PageShell';
import { createClient } from '@/lib/api';
import { verifyEmail } from '@/lib/actions';

type State = 'pending' | 'ok' | 'fail';

export default function VerifyEmailPage() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const [state, setState] = useState<State>('pending');
  const token = params.get('token') ?? '';

  useEffect(() => {
    if (!token) { setState('fail'); return; }
    verifyEmail(createClient({ baseURL: '' }), token)
      .then(() => setState('ok'))
      .catch(() => setState('fail'));
  }, [token]);

  return (
    <PageShell pageEnter>
      <div className="py-24 text-center">
        <div className="font-mono text-[11px] tracking-[0.24em] text-foreground-400 mb-3">
          {t('verify.label')}
        </div>
        {state === 'pending' && <p className="text-[15px] text-foreground-600">{t('verify.pending')}</p>}
        {state === 'ok' && (
          <>
            <p className="text-[15px] text-foreground-800">{t('verify.ok')}</p>
            <Link to="/" className="mt-4 inline-block text-[13px] text-primary-600 hover:text-primary-700">
              {t('verify.goHome')}
            </Link>
          </>
        )}
        {state === 'fail' && (
          <>
            <p className="text-[15px] text-foreground-800">{t('verify.fail')}</p>
            <p className="mt-2 text-[13px] text-foreground-400">{t('verify.failHint')}</p>
          </>
        )}
      </div>
    </PageShell>
  );
}
