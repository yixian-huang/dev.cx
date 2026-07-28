import { useTranslation } from 'react-i18next';
import { useState, useCallback, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import MarkdownEditor from './MarkdownEditor';
import { useAuth } from '@/hooks/useAuth';
import { useMyProjects } from '@/hooks/useMyProjects';
import { createClient, type ApiError } from '@/lib/api';
import { apiErrorMessage } from '@/lib/api-errors';
import { createPost, patchPost } from '@/lib/actions';
import FormAlert from '@/components/base/FormAlert';

export type PostType = 'show' | 'build' | 'discuss';

export type DraftSeed = {
  slug: string;
  type: PostType;
  title: string;
  body_md: string;
  project_slug?: string;
  feedback_wanted?: string[];
  /** draft = 草稿；edit = 已发布短窗编辑 */
  mode?: 'draft' | 'edit';
};

interface UnifiedEditorProps {
  initialType: PostType;
  /** 锁定态(反馈/写进度/分享成果入口):类型不可切、关联产品固定。 */
  locked?: boolean;
  lockedProjectId?: string | null;
  /** 从 /compose?draft= 恢复 */
  seed?: DraftSeed | null;
  onPublished: (slug: string) => void;
  onDraftSaved: (slug: string, at: Date) => void;
}

const TYPE_META: Record<PostType, { subtitleKey: string; titleKey: string; bodyKey: string }> = {
  show: { subtitleKey: 'compose.showSubtitle', titleKey: 'compose.showTitlePlaceholder', bodyKey: 'compose.bodyPlaceholder' },
  build: { subtitleKey: 'compose.buildSubtitle', titleKey: 'compose.buildTitlePlaceholder', bodyKey: 'compose.buildBodyPlaceholder' },
  discuss: { subtitleKey: 'compose.discussSubtitle', titleKey: 'compose.discussTitlePlaceholder', bodyKey: 'compose.discussBodyPlaceholder' },
};

const PRESET_CHIP_KEYS = [
  'compose.feedbackChip.correctness',
  'compose.feedbackChip.performance',
  'compose.feedbackChip.uiux',
  'compose.feedbackChip.copy',
];

// 画布 2f:三个类型表单合并成一个编辑器。类型 = 标题上方一行 mono 字标(选中朱砂下划线),
// 切换不重置内容——title/body/求反馈都在本组件的单一 state 里,与 postType 无关;
// 「关联产品」收进类型行右侧;求反馈区 = 点选 chips,无文本输入(具体问题写进正文)。
export default function UnifiedEditor({
  initialType,
  locked = false,
  lockedProjectId,
  seed = null,
  onPublished,
  onDraftSaved,
}: UnifiedEditorProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const myProjects = useMyProjects();
  const emailVerified = user?.emailVerified !== false;

  const [postType, setPostType] = useState<PostType>(seed?.type ?? initialType);
  const [projectId, setProjectId] = useState(seed?.project_slug ?? lockedProjectId ?? '');
  const [title, setTitle] = useState(seed?.title ?? '');
  const [body, setBody] = useState(seed?.body_md ?? '');
  const [feedback, setFeedback] = useState<string[]>(seed?.feedback_wanted ?? []);
  const [customChips, setCustomChips] = useState<string[]>([]);
  const [customInput, setCustomInput] = useState('');
  const [customOpen, setCustomOpen] = useState(false);
  const editMode = seed?.mode === 'edit';
  const [draftSlug, setDraftSlug] = useState<string | null>(
    seed?.mode === 'edit' ? null : (seed?.slug ?? null),
  );
  const editSlug = editMode ? seed?.slug ?? null : null;

  const [projectOpen, setProjectOpen] = useState(false);
  const projectRef = useRef<HTMLDivElement>(null);

  const [publishing, setPublishing] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [publishError, setPublishError] = useState<string | undefined>(undefined);
  const [draftError, setDraftError] = useState<string | undefined>(undefined);

  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftSlugRef = useRef(draftSlug);
  draftSlugRef.current = draftSlug;
  // 最新表单快照供 debounce 回调读取，避免闭包过期
  const formRef = useRef({ postType, projectId, title, body, feedback });
  formRef.current = { postType, projectId, title, body, feedback };

  useEffect(() => {
    if (!projectOpen) return;
    const close = (e: MouseEvent) => {
      if (projectRef.current && !projectRef.current.contains(e.target as Node)) setProjectOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [projectOpen]);

  useEffect(() => {
    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  }, []);

  const saveDraft = useCallback(async (opts?: { silent?: boolean }) => {
    const { postType: tp, projectId: pid, title: ti, body: bo, feedback: fb } = formRef.current;
    const needsProject = tp === 'show' || tp === 'build';
    // 空内容 no-op；show/build 未选产品时跳过自动保存（避免 project_required 刷错）
    if (!ti.trim() && !bo.trim()) return;
    if (needsProject && !pid.trim()) {
      if (!opts?.silent) setDraftError(t('compose.draftNeedsProject'));
      return;
    }
    if (!opts?.silent) setDraftError(undefined);
    setSavingDraft(true);
    try {
      const client = createClient({ baseURL: '' });
      if (editMode && editSlug) {
        // 已发布短窗：自动保存 = PATCH
        await patchPost(client, editSlug, {
          title: ti.trim(),
          body_md: bo,
          ...(fb.length > 0 ? { feedback_wanted: fb } : { feedback_wanted: [] }),
        });
        onDraftSaved(editSlug, new Date());
      } else {
        const result = await createPost(client, {
          type: tp,
          project_slug: pid || undefined,
          title: ti.trim(),
          body_md: bo,
          status: 'draft',
          ...(draftSlugRef.current ? { draft_slug: draftSlugRef.current } : {}),
          ...(fb.length > 0 ? { feedback_wanted: fb } : {}),
        });
        setDraftSlug(result.slug);
        draftSlugRef.current = result.slug;
        onDraftSaved(result.slug, new Date());
        if (typeof window !== 'undefined') {
          const url = new URL(window.location.href);
          url.searchParams.set('draft', result.slug);
          window.history.replaceState({}, '', url.pathname + url.search);
        }
      }
    } catch (err) {
      const e = err as ApiError;
      if (e.status === 401) {
        navigate('/login');
        return;
      }
      if (!opts?.silent) setDraftError(apiErrorMessage(e));
    } finally {
      setSavingDraft(false);
    }
  }, [navigate, onDraftSaved, t, editMode, editSlug]);

  const scheduleAutoSave = useCallback(() => {
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => {
      void saveDraft({ silent: true });
    }, 3000);
  }, [saveDraft]);

  const trigger = scheduleAutoSave;

  const toggleChip = (label: string) => {
    setFeedback((prev) => (prev.includes(label) ? prev.filter((c) => c !== label) : [...prev, label]));
    trigger();
  };

  const addCustomChip = () => {
    const v = customInput.trim();
    if (!v) return;
    if (!customChips.includes(v)) setCustomChips((prev) => [...prev, v]);
    if (!feedback.includes(v)) setFeedback((prev) => [...prev, v]);
    setCustomInput('');
    setCustomOpen(false);
    trigger();
  };

  // show/build 必须挂靠已有产品(api handleCreatePost 的 project_required);discuss 可独立。
  const needsProject = postType === 'show' || postType === 'build';
  // 表单是否齐备——仅作样式提示;真正拦截在 handleSubmit 里给出可理解的错误文案。
  // 旧逻辑 disabled={!canPublish} 会让「未选产品 / 未验证邮箱」时点击完全无反应。
  const formReady =
    title.trim().length > 0 &&
    body.trim().length > 0 &&
    (!needsProject || projectId.trim().length > 0) &&
    emailVerified;

  const handleSubmit = useCallback(async () => {
    if (publishing) return;
    setPublishError(undefined);
    if (!emailVerified) {
      setPublishError(t('compose.needEmailVerify'));
      return;
    }
    if (!title.trim()) {
      setPublishError(t('compose.needTitle'));
      return;
    }
    if (!body.trim()) {
      setPublishError(t('compose.needBody'));
      return;
    }
    if (needsProject && !projectId.trim()) {
      setPublishError(
        myProjects.length === 0 ? t('compose.needProjectCreateFirst') : t('compose.needProjectToPublish'),
      );
      return;
    }
    setPublishing(true);
    try {
      const client = createClient({ baseURL: '' });
      if (editMode && editSlug) {
        const result = await patchPost(client, editSlug, {
          title: title.trim(),
          body_md: body,
          ...(feedback.length > 0 ? { feedback_wanted: feedback } : { feedback_wanted: [] }),
        });
        onPublished(result.slug);
      } else {
        const result = await createPost(client, {
          type: postType,
          project_slug: projectId || undefined,
          title: title.trim(),
          body_md: body,
          status: 'published',
          ...(draftSlug ? { draft_slug: draftSlug } : {}),
          ...(feedback.length > 0 ? { feedback_wanted: feedback } : {}),
        });
        onPublished(result.slug);
      }
    } catch (err) {
      const e = err as ApiError;
      if (e.status === 401) {
        navigate('/login');
        return;
      }
      setPublishError(apiErrorMessage(e));
    } finally {
      setPublishing(false);
    }
  }, [
    publishing,
    emailVerified,
    needsProject,
    myProjects.length,
    postType,
    projectId,
    title,
    body,
    feedback,
    draftSlug,
    navigate,
    onPublished,
    editMode,
    editSlug,
    t,
  ]);

  const selectedProject = myProjects.find((p) => p.id === projectId);
  const presetChips = PRESET_CHIP_KEYS.map((k) => t(k));

  return (
    <div>
      {/* 类型行:mono 字标 + 副题;右侧关联产品 */}
      <div className="flex items-center gap-5 mt-2 py-3.5 border-t border-b border-foreground-200/35 flex-wrap">
        <div className="flex items-center gap-4 font-mono text-[11px] font-medium tracking-[0.12em]">
          {(['show', 'build', 'discuss'] as PostType[]).map((tp) => {
            if (locked && tp !== postType) return null;
            const active = tp === postType;
            return (
              <button
                key={tp}
                onClick={() => { if (!locked) { setPostType(tp); trigger(); } }}
                disabled={locked}
                className={`uppercase bg-transparent border-0 p-0 transition-colors duration-200 ${
                  active
                    ? 'text-accent-600 border-b-[1.5px] border-accent-500 pb-0.5'
                    : 'text-foreground-400 hover:text-foreground-700 cursor-pointer'
                }`}
              >
                {tp}
              </button>
            );
          })}
        </div>
        <span className="text-xs text-foreground-400 hidden sm:inline">
          {t(TYPE_META[postType].subtitleKey)}{locked ? '' : ` — ${t('compose.typeKeepHint')}`}
        </span>

        {/* 关联产品(收进同行右侧) */}
        <div className="ml-auto relative" ref={projectRef}>
          {locked ? (
            <span className="text-xs text-foreground-500">
              {t('compose.project')} · <span className="font-mono text-foreground-700">{projectId}</span>
            </span>
          ) : (
            <button
              onClick={() => setProjectOpen((v) => !v)}
              className="text-xs text-foreground-500 hover:text-foreground-800 transition-colors duration-200 cursor-pointer bg-transparent border-none p-0 whitespace-nowrap"
            >
              {t('compose.project')} ·{' '}
              {selectedProject ? (
                <span className="font-mono text-foreground-700">{selectedProject.slug}</span>
              ) : (
                <span className="text-foreground-400">{needsProject ? t('compose.projectRequired') : t('compose.projectNone')}</span>
              )}{' '}
              <span className="text-foreground-400">▾</span>
            </button>
          )}

          {projectOpen && !locked && (
            <div className="absolute z-10 top-full right-0 mt-1.5 w-56 bg-background-50 border border-foreground-200/40 rounded-xs max-h-48 overflow-y-auto">
              {!needsProject && (
                <button
                  onClick={() => { setProjectId(''); setProjectOpen(false); trigger(); }}
                  className="w-full text-left px-3 py-2 text-[13px] text-foreground-500 hover:bg-background-100 transition-colors duration-150 cursor-pointer"
                >
                  {t('compose.projectNone')}
                </button>
              )}
              {myProjects.length === 0 ? (
                <div className="px-3 py-2.5 space-y-1.5">
                  <p className="text-xs text-foreground-400">{t('compose.noProjectsYet')}</p>
                  <Link
                    to="/new-project"
                    className="block text-[13px] text-primary-600 hover:text-primary-500"
                    onClick={() => setProjectOpen(false)}
                  >
                    {t('compose.createProjectFirst')}
                  </Link>
                </div>
              ) : (
                myProjects.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => { setProjectId(p.id); setProjectOpen(false); trigger(); }}
                    className={`w-full text-left px-3 py-2 text-[13px] hover:bg-background-100 transition-colors duration-150 cursor-pointer ${
                      p.id === projectId ? 'text-foreground-950 font-medium' : 'text-foreground-700'
                    }`}
                  >
                    <span className="font-mono text-xs">{p.slug}</span> · {p.name}
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {needsProject && myProjects.length === 0 && (
        <div className="mt-4 px-3.5 py-3 bg-background-100 border border-foreground-200/40 rounded-xs text-[13px] text-foreground-700 leading-relaxed">
          {t('compose.noProjectsYet')}{' '}
          <Link to="/new-project" className="text-primary-600 hover:text-primary-500 underline-offset-2 hover:underline">
            {t('compose.createProjectFirst')}
          </Link>
        </div>
      )}

      {!emailVerified && (
        <FormAlert tone="info" className="mt-4">
          {t('compose.needEmailVerify')}
        </FormAlert>
      )}

      {/* 标题 */}
      <div className="pt-5">
        <input
          type="text"
          value={title}
          onChange={(e) => { setTitle(e.target.value); trigger(); }}
          placeholder={t(TYPE_META[postType].titleKey)}
          className="w-full text-[20px] font-heading font-semibold text-foreground-950 bg-transparent placeholder:text-foreground-300 py-1 outline-none border-none"
        />
      </div>

      {/* 正文 */}
      <div className="pt-3">
        <MarkdownEditor
          value={body}
          onChange={(v) => { setBody(v); trigger(); }}
          placeholder={t(TYPE_META[postType].bodyKey)}
          minHeight={260}
        />
      </div>

      {/* 求反馈区(可选,点选 chips,无文本输入) */}
      <div className="mt-6 pt-5 border-t border-foreground-200/35">
        <div className="flex items-center gap-2 font-mono text-[11px] tracking-[0.24em] text-foreground-400">
          <span className="w-1.5 h-1.5 rounded-full bg-accent-500" />
          {t('compose.feedbackWanted')}
          <span className="tracking-normal text-foreground-300 ml-1">· {t('compose.feedbackOptional')}</span>
        </div>
        <div className="flex items-center gap-2 mt-3 flex-wrap">
          {[...presetChips, ...customChips].map((label) => {
            const active = feedback.includes(label);
            return (
              <button
                key={label}
                onClick={() => toggleChip(label)}
                className={`inline-flex items-center gap-[5px] px-2.5 py-[3px] text-[13px] rounded-xs transition-colors duration-200 cursor-pointer ${
                  active
                    ? 'bg-secondary-100 text-foreground-950 font-medium border border-transparent'
                    : 'text-foreground-500 border border-foreground-200/50 bg-transparent hover:text-foreground-700'
                }`}
              >
                {active && <span className="w-[5px] h-[5px] rounded-full bg-primary-500" />}
                {label}
              </button>
            );
          })}
          {customOpen ? (
            <input
              autoFocus
              value={customInput}
              onChange={(e) => setCustomInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') addCustomChip(); if (e.key === 'Escape') setCustomOpen(false); }}
              onBlur={addCustomChip}
              placeholder={t('compose.addFeedbackChip')}
              className="w-32 text-[13px] bg-background-100 text-foreground-900 placeholder:text-foreground-300 px-2.5 py-[3px] rounded-xs outline-none border-none"
            />
          ) : (
            <button
              onClick={() => setCustomOpen(true)}
              className="px-1.5 py-[3px] text-[13px] text-foreground-300 hover:text-foreground-600 transition-colors duration-200 cursor-pointer bg-transparent border-none"
            >
              {t('compose.feedbackAddCustom')}
            </button>
          )}
        </div>
        <p className="mt-2.5 text-xs text-foreground-400">{t('compose.feedbackHint')}</p>
      </div>

      {(publishError || draftError) && (
        <FormAlert className="mt-4">
          {publishError || draftError}
          {publishError === t('compose.needProjectCreateFirst') && (
            <>
              {' '}
              <Link to="/new-project" className="underline underline-offset-2 hover:opacity-80">
                {t('compose.createProjectFirst')}
              </Link>
            </>
          )}
        </FormAlert>
      )}

      {/* 动作行 */}
      <div className="flex items-center justify-end gap-3 pt-5 pb-8">
        <button
          type="button"
          onClick={() => void saveDraft()}
          disabled={savingDraft}
          className="inline-flex items-center px-4 py-2 text-sm text-foreground-500 hover:text-foreground-800 transition-colors duration-200 whitespace-nowrap cursor-pointer bg-transparent border-none disabled:opacity-40"
        >
          {savingDraft
            ? t('compose.savingDraft')
            : editMode
              ? t('compose.saveEdit')
              : t('compose.saveDraft')}
        </button>
        <button
          type="button"
          onClick={() => void handleSubmit()}
          disabled={publishing}
          className={`inline-flex items-center px-5 py-2 text-sm font-medium bg-primary-500 text-background-50 hover:bg-primary-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-200 rounded-xs whitespace-nowrap cursor-pointer ${
            !formReady && !publishing ? 'opacity-70' : ''
          }`}
        >
          {publishing
            ? t('compose.publishing')
            : editMode
              ? t('compose.saveAndView')
              : t('compose.publish')}
        </button>
      </div>
    </div>
  );
}
