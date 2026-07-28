import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import PageShell from '@/components/feature/PageShell';
import EmptyState from '@/components/base/EmptyState';
import { createClient } from '@/lib/api';
import {
  adminWarn, adminMute, adminUnmute, adminSuspend, adminUnsuspend,
} from '@/lib/actions';
import SettingsSection from './components/SettingsSection';
import InvitesSection from './components/InvitesSection';

interface AdminUser {
  id: string;
  handle: string;
  display_name: string;
  email: string;
  role: string;
  muted_until: string | null;
  suspended_at: string | null;
  warn_count: number;
  created_at: string;
}

interface AdminAction {
  id: string;
  action: string;
  target_kind: string;
  target_id: string;
  reason: string;
  created_at: string;
  actor: { handle: string } | null;
  post: { slug: string; title: string } | null;
  user_handle: string | null;
}

const client = () => createClient({ baseURL: '' });

export default function AdminPage() {
  const { t } = useTranslation();
  const { user, loading } = useAuth();
  const [query, setQuery] = useState('');
  const [target, setTarget] = useState<AdminUser | null>(null);
  const [lookupError, setLookupError] = useState('');
  const [actions, setActions] = useState<AdminAction[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);

  const loadActions = useCallback(async (after?: string | null) => {
    const path = after
      ? `/api/admin/actions?cursor=${encodeURIComponent(after)}`
      : '/api/admin/actions';
    const r = await client().get<{ actions: AdminAction[]; next_cursor: string | null }>(path);
    setActions((prev) => (after ? [...prev, ...r.actions] : r.actions));
    setCursor(r.next_cursor);
  }, []);

  useEffect(() => {
    if (user?.isAdmin) void loadActions();
  }, [user?.isAdmin, loadActions]);

  if (loading) return <PageShell pageEnter>{null}</PageShell>;
  if (!user?.isAdmin) {
    return (
      <PageShell pageEnter>
        <EmptyState message={t('notFound.title')} />
      </PageShell>
    );
  }

  const lookup = async () => {
    setLookupError('');
    setTarget(null);
    const h = query.trim().replace(/^@/, '').toLowerCase();
    if (!h) return;
    const r = await client().tryGet<{ user: AdminUser }>(`/api/admin/users/${h}`);
    if (!r) {
      setLookupError(t('admin.userNotFound'));
      return;
    }
    setTarget(r.user);
  };

  const refreshTarget = async () => {
    if (!target) return;
    const r = await client().tryGet<{ user: AdminUser }>(`/api/admin/users/${target.handle}`);
    if (r) setTarget(r.user);
    void loadActions();
  };

  const act = async (fn: () => Promise<void>) => {
    await fn();
    await refreshTarget();
  };

  return (
    <PageShell pageEnter>
      <h1 className="font-heading text-heading-lg text-foreground-950 mb-8">{t('admin.title')}</h1>

      {/* 用户处置 */}
      <section className="mb-12">
        <h2 className="font-mono text-[11px] tracking-[0.24em] text-foreground-400 mb-4">
          {t('admin.userSection')}
        </h2>
        <div className="flex gap-2 mb-4">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void lookup()}
            placeholder={t('admin.handlePlaceholder')}
            className="flex-1 px-3 py-2 text-[14px] bg-background-50 border border-background-200 rounded-md focus:outline-none focus:border-primary-500"
          />
          <button
            onClick={() => void lookup()}
            className="px-4 py-2 text-[13px] bg-foreground-900 text-background-50 rounded-md cursor-pointer"
          >
            {t('admin.lookup')}
          </button>
        </div>
        {lookupError && <p className="text-[13px] text-accent-600">{lookupError}</p>}
        {target && (
          <div className="border border-background-200/60 rounded-md p-4">
            <div className="flex items-center gap-2 mb-2">
              <Link to={`/@${target.handle}`} className="font-semibold text-foreground-900">
                {target.display_name}
              </Link>
              <span className="font-mono text-[12px] text-foreground-500">@{target.handle}</span>
              <span className="font-mono text-[11px] text-foreground-400">{target.role}</span>
            </div>
            <div className="text-[13px] text-foreground-500 space-y-1 mb-4">
              <p>{target.email} · {t('admin.warnCount')}: {target.warn_count}</p>
              {target.muted_until && <p className="text-accent-600">{t('admin.mutedUntil')}: {target.muted_until}</p>}
              {target.suspended_at && <p className="text-accent-600">{t('admin.suspendedAt')}: {target.suspended_at}</p>}
            </div>
            <div className="flex flex-wrap gap-3 text-[13px]">
              <button className="text-foreground-700 hover:text-accent-600 cursor-pointer" onClick={() => {
                const m = window.prompt(t('admin.warnPrompt'));
                if (m) void act(() => adminWarn(client(), target.handle, m));
              }}>{t('admin.warn')}</button>
              {!target.muted_until ? (
                <button className="text-foreground-700 hover:text-accent-600 cursor-pointer" onClick={() => {
                  const rsn = window.prompt(t('admin.reasonPrompt'));
                  if (rsn) void act(() => adminMute(client(), target.handle, rsn));
                }}>{t('admin.mute')}</button>
              ) : (
                <button className="text-foreground-700 hover:text-accent-600 cursor-pointer"
                  onClick={() => void act(() => adminUnmute(client(), target.handle))}>{t('admin.unmute')}</button>
              )}
              {!target.suspended_at ? (
                <button className="text-accent-600 hover:text-accent-700 cursor-pointer" onClick={() => {
                  const rsn = window.prompt(t('admin.suspendPrompt'));
                  if (rsn) void act(() => adminSuspend(client(), target.handle, rsn));
                }}>{t('admin.suspend')}</button>
              ) : (
                <button className="text-foreground-700 hover:text-accent-600 cursor-pointer"
                  onClick={() => void act(() => adminUnsuspend(client(), target.handle))}>{t('admin.unsuspend')}</button>
              )}
            </div>
          </div>
        )}
      </section>

      <SettingsSection />
      <InvitesSection />

      {/* 审计日志 */}
      <section className="pb-12">
        <h2 className="font-mono text-[11px] tracking-[0.24em] text-foreground-400 mb-4">
          {t('admin.auditSection')}
        </h2>
        {actions.length === 0 ? (
          <EmptyState message={t('admin.auditEmpty')} />
        ) : (
          <ul className="space-y-3">
            {actions.map((a) => (
              <li key={a.id} className="text-[13px] text-foreground-600 border-b border-background-200/40 pb-2">
                <span className="font-mono text-[11px] text-foreground-400 mr-2">
                  {a.created_at.slice(0, 16).replace('T', ' ')}
                </span>
                <span className="font-mono text-accent-600 mr-2">{a.action}</span>
                <span className="mr-2">@{a.actor?.handle ?? '?'}</span>
                {a.post && (
                  <Link to={`/t/${a.post.slug}`} className="text-primary-600 hover:text-primary-700 mr-2">
                    {a.post.title || a.post.slug}
                  </Link>
                )}
                {a.user_handle && (
                  <Link to={`/@${a.user_handle}`} className="text-primary-600 hover:text-primary-700 mr-2">
                    @{a.user_handle}
                  </Link>
                )}
                {a.reason && <span className="text-foreground-400">· {a.reason}</span>}
              </li>
            ))}
          </ul>
        )}
        {cursor && (
          <button
            onClick={() => void loadActions(cursor)}
            className="mt-4 text-[13px] text-foreground-500 hover:text-foreground-800 cursor-pointer"
          >
            {t('admin.loadMore')}
          </button>
        )}
      </section>
    </PageShell>
  );
}
