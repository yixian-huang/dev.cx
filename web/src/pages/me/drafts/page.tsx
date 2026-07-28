import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/hooks/useAuth';
import Navbar from '@/components/feature/Navbar';
import Footer from '@/components/feature/Footer';
import MobileTabs from '@/components/feature/MobileTabs';
import LoginPrompt from '@/components/base/LoginPrompt';
import ChapterLabel from '@/components/base/ChapterLabel';
import { createClient, type ApiError } from '@/lib/api';
import { apiErrorMessage } from '@/lib/api-errors';
import { deleteDraft, listMyDrafts } from '@/lib/actions';
import type { ApiPost } from '@/lib/adapters/api-types';

export default function MyDraftsPage() {
  const { t, i18n } = useTranslation();
  const { isLoggedIn } = useAuth();
  const navigate = useNavigate();
  const [posts, setPosts] = useState<ApiPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();

  const load = useCallback(async () => {
    setError(undefined);
    setLoading(true);
    try {
      const client = createClient({ baseURL: '' });
      const res = await listMyDrafts(client);
      setPosts((res.posts ?? []) as unknown as ApiPost[]);
    } catch (err) {
      const e = err as ApiError;
      if (e.status === 401) {
        navigate('/login');
        return;
      }
      setError(apiErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  useEffect(() => {
    if (isLoggedIn) void load();
    else setLoading(false);
  }, [isLoggedIn, load]);

  const onDelete = async (slug: string) => {
    try {
      await deleteDraft(createClient({ baseURL: '' }), slug);
      setPosts((prev) => prev.filter((p) => p.slug !== slug));
    } catch (err) {
      setError(apiErrorMessage(err as ApiError));
    }
  };

  const fmt = (iso?: string) => {
    if (!iso) return '';
    try {
      return new Date(iso).toLocaleString(i18n.language === 'zh' ? 'zh-CN' : 'en-US', {
        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
      });
    } catch {
      return iso;
    }
  };

  return (
    <div className="min-h-screen bg-background-50">
      <Navbar />
      <main className="pt-14 pb-14 md:pb-0 page-enter">
        <div className="max-w-[640px] mx-auto px-6">
          <header className="pt-10 pb-6">
            <ChapterLabel label="Drafts" sublabel={t('me.drafts')} className="mb-3" />
            <h1 className="font-heading text-[28px] font-semibold text-foreground-950 leading-[1.3]">
              {t('me.drafts')}
            </h1>
            <p className="text-[13px] text-foreground-400 mt-1.5">{t('drafts.deck')}</p>
          </header>

          {!isLoggedIn ? (
            <LoginPrompt
              title={t('compose.loginRequiredTitle', '需要登录')}
              description={t('drafts.loginRequired')}
              loginLabel={t('login.submit', '登录')}
              registerLabel={t('login.registerSubmit', '注册')}
            />
          ) : loading ? (
            <p className="py-12 text-[13px] text-foreground-400 text-center">{t('drafts.loading')}</p>
          ) : error ? (
            <p className="py-12 text-[13px] text-primary-700 text-center">{error}</p>
          ) : posts.length === 0 ? (
            <div className="py-16 text-center">
              <p className="text-[13px] text-foreground-400 mb-4">{t('drafts.empty')}</p>
              <Link
                to="/compose"
                className="inline-flex items-center px-4 py-2 text-sm font-medium bg-primary-500 text-background-50 hover:bg-primary-600 rounded-xs"
              >
                {t('drafts.write')}
              </Link>
            </div>
          ) : (
            <ul className="space-y-0 border-t border-background-200/50">
              {posts.map((p) => (
                <li
                  key={p.slug}
                  className="flex items-start gap-3 py-4 border-b border-background-200/40"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono text-[10px] tracking-[0.14em] uppercase text-foreground-400">
                        {p.type}
                      </span>
                      <span className="font-mono text-[11px] text-foreground-300">
                        {fmt(p.updated_at ?? p.created_at)}
                      </span>
                    </div>
                    <Link
                      to={`/compose?draft=${encodeURIComponent(p.slug)}`}
                      className="font-heading text-[17px] font-semibold text-foreground-950 hover:text-primary-600 transition-colors"
                    >
                      {p.title?.trim() || t('drafts.untitled')}
                    </Link>
                    {p.project?.name && (
                      <p className="mt-1 text-[12px] text-foreground-400 font-mono">
                        {p.project.slug}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0 pt-1">
                    <Link
                      to={`/compose?draft=${encodeURIComponent(p.slug)}`}
                      className="text-[12px] text-primary-600 hover:text-primary-700"
                    >
                      {t('drafts.continue')}
                    </Link>
                    <button
                      type="button"
                      onClick={() => void onDelete(p.slug)}
                      className="text-[12px] text-foreground-400 hover:text-accent-600 cursor-pointer bg-transparent border-none p-0"
                    >
                      {t('drafts.delete')}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
      <Footer />
      <MobileTabs />
    </div>
  );
}
