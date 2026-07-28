import { useTranslation } from 'react-i18next';
import { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import Navbar from '@/components/feature/Navbar';
import Footer from '@/components/feature/Footer';
import MobileTabs from '@/components/feature/MobileTabs';
import VerifyBanner from '@/components/feature/VerifyBanner';
import LoginPrompt from '@/components/base/LoginPrompt';
import ChapterLabel from '@/components/base/ChapterLabel';
import { createClient, type ApiError } from '@/lib/api';
import { apiErrorMessage } from '@/lib/api-errors';
import { createProject } from '@/lib/actions';
import type { ApiPost } from '@/lib/adapters/api-types';
import { deriveSlug } from '@/lib/project-form';
import QuickProjectForm, { type QuickProjectEntry } from './components/QuickProjectForm';
import UnifiedEditor, { type DraftSeed, type PostType } from './components/UnifiedEditor';
import LockedHeader, { type LockedKind } from './components/LockedHeader';
import AutoSaveStatus from './components/AutoSaveStatus';
import SuccessState from './components/SuccessState';

function asPostType(t: string | undefined): PostType {
  if (t === 'show' || t === 'build' || t === 'discuss' || t === 'ask') {
    return t === 'ask' ? 'discuss' : t;
  }
  return 'show';
}

export default function ComposePage() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { isLoggedIn } = useAuth();

  const quickMode = searchParams.get('quick') === '1';
  const lockedParam = searchParams.get('locked');
  const typeParam = searchParams.get('type') as PostType | null;
  const projectParam = searchParams.get('project');
  const draftParam = (searchParams.get('draft') ?? '').trim();
  const editParam = (searchParams.get('edit') ?? '').trim();
  const loadSlug = draftParam || editParam;
  const loadMode: 'draft' | 'edit' | null = draftParam ? 'draft' : editParam ? 'edit' : null;

  const validType = typeParam === 'show' || typeParam === 'build' || typeParam === 'discuss';
  // C3 修复:锁定不再只认 discuss——项目页三个入口(提交反馈=discuss、写进度=build、
  // 分享成果=show)都要锁定类型与关联产品。
  // 编辑已发布帖时锁定类型与产品（不允许改 type/project）
  const editLocked = Boolean(editParam);
  const initialType: PostType = validType ? (typeParam as PostType) : 'show';
  // 没有按 slug 查项目展示名的取数(锁定态只从 URL query 拿到 slug 本身)——直接显示 slug,
  // 不编造/回落 mock 的项目名。
  const lockedKind: LockedKind = typeParam === 'build' ? 'build' : typeParam === 'show' ? 'show' : 'feedback';

  const [publishedSlug, setPublishedSlug] = useState('');
  const [editorEpoch, setEditorEpoch] = useState(0);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [draftSeed, setDraftSeed] = useState<DraftSeed | null>(null);
  const isLocked =
    (lockedParam === '1' && validType && !!projectParam) ||
    (editLocked && Boolean(draftSeed));
  const lockedProjectId = isLocked
    ? (projectParam ?? draftSeed?.project_slug ?? null)
    : null;
  const [draftLoadError, setDraftLoadError] = useState<string | undefined>(undefined);
  const [draftLoading, setDraftLoading] = useState(Boolean(loadSlug && isLoggedIn));

  const [quickCreated, setQuickCreated] = useState(false);
  const [quickProjectSlug, setQuickProjectSlug] = useState('');
  const [quickCreating, setQuickCreating] = useState(false);
  // 非 401 的写失败内联展示(spec §3 约定,new-project/page.tsx 先例),不吞、不用 toast;
  // 失败时表单内容不清空(QuickProjectForm 自己持有输入状态,失败不卸载它就自然保留)。
  const [quickError, setQuickError] = useState<string | undefined>(undefined);

  // 加载 ?draft= / ?edit= 预填
  useEffect(() => {
    if (!loadSlug || !isLoggedIn || !loadMode) {
      setDraftLoading(false);
      return;
    }
    let cancelled = false;
    setDraftLoading(true);
    setDraftLoadError(undefined);
    (async () => {
      try {
        const client = createClient({ baseURL: '' });
        const { post } = await client.get<{ post: ApiPost }>(`/api/posts/${encodeURIComponent(loadSlug)}`);
        if (cancelled) return;
        if (loadMode === 'draft') {
          if (post.status && post.status !== 'draft') {
            setDraftLoadError(t('compose.draftNotEditable'));
            setDraftLoading(false);
            return;
          }
        } else {
          if (post.status === 'draft') {
            setDraftLoadError(t('compose.draftNotEditable'));
            setDraftLoading(false);
            return;
          }
          if (!post.can_edit) {
            setDraftLoadError(t('compose.editNotAllowed'));
            setDraftLoading(false);
            return;
          }
        }
        setDraftSeed({
          slug: post.slug,
          type: asPostType(post.type),
          title: post.title ?? '',
          body_md: post.body_md ?? '',
          project_slug: post.project?.slug,
          feedback_wanted: post.feedback_wanted ?? [],
          mode: loadMode,
        });
        setEditorEpoch((n) => n + 1);
      } catch (err) {
        if (cancelled) return;
        const e = err as ApiError;
        if (e.status === 401) {
          navigate('/login');
          return;
        }
        setDraftLoadError(apiErrorMessage(e));
      } finally {
        if (!cancelled) setDraftLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [loadSlug, loadMode, isLoggedIn, navigate, t]);

  const handlePublished = useCallback((slug: string) => {
    // 编辑模式保存后回帖子页
    if (editParam) {
      navigate(`/t/${slug}`, { replace: true });
      return;
    }
    setPublishedSlug(slug);
    setLastSaved(null);
    setDraftSeed(null);
    // 清掉 ?draft= 残留,成功页 URL 干净,避免用户以为还在草稿态
    // 注意:先设 publishedSlug 再 replace 路由 query,组件仍在同一 /compose 页
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.delete('draft');
      url.searchParams.delete('edit');
      window.history.replaceState({}, '', url.pathname + (url.search || ''));
    }
  }, [editParam, navigate]);

  const handleDraftSaved = useCallback((_slug: string, at: Date) => {
    setLastSaved(at);
  }, []);

  const handleNewPost = useCallback(() => {
    setPublishedSlug('');
    setLastSaved(null);
    setDraftSeed(null);
    // 重挂载编辑器,让下一篇从干净状态开始。
    setEditorEpoch((n) => n + 1);
    navigate('/compose', { replace: true });
  }, [navigate]);

  // 跟 new-project/page.tsx 同一条写路径:actions.createProject,成功用接口返回的真实
  // slug 导航,失败按写路径约定内联展示错误、401 转登录。链接按 new-project 的约定过滤:
  // label 与 url 都非空才提交(API 对 links 两项都要求非空,空 label 会 400 bad_link——
  // C3 parked 修复)。
  const handleQuickCreated = useCallback(async (entry: QuickProjectEntry) => {
    setQuickError(undefined);
    setQuickCreating(true);
    try {
      const client = createClient({ baseURL: '' });
      const result = await createProject(client, {
        slug: deriveSlug(entry.name),
        name: entry.name,
        tagline: entry.deck,
        // 快速创建没有正文输入框——中性空串,不编造描述,同 new-project 页对可选字段的处理。
        description_md: '',
        stage: entry.stage,
        tags: [],
        screenshots: [],
        links: [entry.link].filter((l) => l.label && l.url),
      });
      setQuickProjectSlug(result.slug);
      setQuickCreated(true);
    } catch (err) {
      const e = err as ApiError;
      if (e.status === 401) {
        navigate('/login');
        return;
      }
      setQuickError(apiErrorMessage(e));
    } finally {
      setQuickCreating(false);
    }
  }, [navigate]);

  const handleQuickCancel = useCallback(() => {
    navigate('/me');
  }, [navigate]);

  /* ── Quick project mode ── */
  if (quickMode) {
    if (quickCreated) {
      return (
        <div className="min-h-screen bg-background-50">
          <Navbar />
          <VerifyBanner />
          <main className="pt-14 pb-14 md:pb-0 page-enter">
            <div className="max-w-[640px] mx-auto px-6">
              <div className="py-20 text-center fade-in-up">
                <div className="mb-6">
                  {/* 创建成功 = 确认时刻:朱砂方章盖章一次(seal-stamp 交互规则) */}
                  <div className="w-10 h-10 mx-auto mb-4 rounded-xs bg-accent-500 text-accent-50 flex items-center justify-center seal-stamp">
                    <span className="font-mono text-[13px] font-semibold tracking-[-0.02em]">cx</span>
                  </div>
                  <p className="font-heading text-[22px] font-semibold text-foreground-950 mb-1">
                    {t('newProject.successTitle')}
                  </p>
                  <p className="text-body-sm text-foreground-500">
                    {t('newProject.successDesc')}
                  </p>
                </div>
                <div className="flex items-center justify-center gap-3">
                  <button
                    onClick={() => navigate(`/p/${quickProjectSlug}`)}
                    className="inline-flex items-center px-4 py-2 text-sm font-medium bg-primary-500 text-background-50 hover:bg-primary-600 transition-colors duration-200 rounded-xs whitespace-nowrap cursor-pointer"
                  >
                    {t('newProject.viewProject')}
                  </button>
                  <button
                    onClick={() => {
                      setQuickCreated(false);
                      setQuickProjectSlug('');
                    }}
                    className="inline-flex items-center px-4 py-2 text-sm text-foreground-600 hover:text-foreground-900 transition-colors duration-200 whitespace-nowrap cursor-pointer bg-transparent border-none"
                  >
                    {t('newProject.createAnother')} →
                  </button>
                </div>
              </div>
            </div>
          </main>
          <Footer />
          <MobileTabs />
        </div>
      );
    }

    return (
      <div className="min-h-screen bg-background-50">
        <Navbar />
        <VerifyBanner />
        <main className="pt-14 pb-14 md:pb-0 page-enter">
          <div className="max-w-[640px] mx-auto px-6">
            <header className="py-8 pb-4">
              <h1 className="font-heading text-[28px] font-semibold text-foreground-950 leading-tight">
                {t('me.quickProject')}
              </h1>
              <p className="text-[13px] text-foreground-400 mt-1">
                {t('me.quickProjectDeck')}
              </p>
            </header>

            {!isLoggedIn ? (
              <LoginPrompt
                title={t('compose.loginRequiredTitle', '需要登录')}
                description={t('compose.loginRequiredDesc', '登录后才能发布内容、获取反馈和创建产品')}
                loginLabel={t('login.submit', '登录')}
                registerLabel={t('login.registerSubmit', '注册')}
              />
            ) : (
              <div className="pb-6">
                <QuickProjectForm
                  onCreated={handleQuickCreated}
                  onCancel={handleQuickCancel}
                  creating={quickCreating}
                  error={quickError}
                />
              </div>
            )}

            <div className="h-12" />
          </div>
        </main>
        <Footer />
        <MobileTabs />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background-50">
      <Navbar />
      <VerifyBanner />

      <main className="pt-14 pb-14 md:pb-0 page-enter">
        <div className="max-w-[640px] mx-auto px-6">
          <header className="pt-10 pb-1">
            <ChapterLabel label="Compose" sublabel={t('compose.title')} className="mb-3" />
            <h1 className="font-heading text-[28px] font-semibold text-foreground-950 leading-[1.3]">
              {t('compose.title')}
            </h1>
            <p className="text-[13px] text-foreground-400 mt-1.5">
              {t('compose.deck')}
            </p>
          </header>

          {!isLoggedIn ? (
            <LoginPrompt
              title={t('compose.loginRequiredTitle', '需要登录')}
              description={t('compose.loginRequiredDesc', '登录后才能发布内容、获取反馈和创建产品')}
              loginLabel={t('login.submit', '登录')}
              registerLabel={t('login.registerSubmit', '注册')}
            />
          ) : publishedSlug ? (
            <SuccessState slug={publishedSlug} onNewPost={handleNewPost} />
          ) : draftLoading ? (
            <p className="py-16 text-[13px] text-foreground-400 text-center">{t('compose.loadingDraft')}</p>
          ) : draftLoadError ? (
            <p className="py-16 text-[13px] text-primary-700 text-center">{draftLoadError}</p>
          ) : (
            <>
              {isLocked && (
                <LockedHeader kind={lockedKind} projectName={lockedProjectId ?? ''} />
              )}

              <div className="pb-6">
                <UnifiedEditor
                  key={editorEpoch}
                  initialType={draftSeed?.type ?? initialType}
                  locked={isLocked}
                  lockedProjectId={lockedProjectId}
                  seed={draftSeed}
                  onPublished={handlePublished}
                  onDraftSaved={handleDraftSaved}
                />
              </div>

              {/* Floating bottom bar with auto-save */}
              <div className="sticky bottom-0 z-20 -mx-6 px-6 py-3 bg-background-50/90 backdrop-blur-sm border-t border-background-200/50 flex items-center justify-between">
                <AutoSaveStatus lastSaved={lastSaved} />
              </div>
            </>
          )}
        </div>
      </main>

      <Footer />
      <MobileTabs />
    </div>
  );
}
