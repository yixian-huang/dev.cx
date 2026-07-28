import { useTranslation } from 'react-i18next';
import { useState, useCallback, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import MarkdownEditor from './MarkdownEditor';
import { useMyProjects } from '@/hooks/useMyProjects';
import { createClient, type ApiError } from '@/lib/api';
import { apiErrorMessage } from '@/lib/api-errors';
import { createPost } from '@/lib/actions';

export type PostType = 'show' | 'build' | 'discuss';

interface UnifiedEditorProps {
  initialType: PostType;
  /** 锁定态(反馈/写进度/分享成果入口):类型不可切、关联产品固定。 */
  locked?: boolean;
  lockedProjectId?: string | null;
  onPublished: (slug: string) => void;
  onSaveDraft: () => void;
  onAutoSaveTrigger: () => void;
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
  onPublished,
  onSaveDraft,
  onAutoSaveTrigger,
}: UnifiedEditorProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const myProjects = useMyProjects();

  const [postType, setPostType] = useState<PostType>(initialType);
  const [projectId, setProjectId] = useState(lockedProjectId ?? '');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [feedback, setFeedback] = useState<string[]>([]);
  const [customChips, setCustomChips] = useState<string[]>([]);
  const [customInput, setCustomInput] = useState('');
  const [customOpen, setCustomOpen] = useState(false);

  const [projectOpen, setProjectOpen] = useState(false);
  const projectRef = useRef<HTMLDivElement>(null);

  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!projectOpen) return;
    const close = (e: MouseEvent) => {
      if (projectRef.current && !projectRef.current.contains(e.target as Node)) setProjectOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [projectOpen]);

  const trigger = onAutoSaveTrigger;

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
  const canPublish =
    title.trim().length > 0 && body.trim().length > 0 && (!needsProject || projectId.trim().length > 0) && !publishing;

  const handleSubmit = useCallback(async () => {
    if (!canPublish) return;
    setPublishError(undefined);
    setPublishing(true);
    try {
      const client = createClient({ baseURL: '' });
      const result = await createPost(client, {
        type: postType,
        project_slug: projectId || undefined,
        title: title.trim(),
        body_md: body,
        ...(feedback.length > 0 ? { feedback_wanted: feedback } : {}),
      });
      onPublished(result.slug);
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
  }, [canPublish, postType, projectId, title, body, feedback, navigate, onPublished]);

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
                onClick={() => { if (!locked) setPostType(tp); }}
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
                <div className="px-3 py-2 text-xs text-foreground-400">{t('compose.noProjectMatch')}</div>
              ) : (
                myProjects.map((p) => (
                  <button
                    key={p.id}
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

      {publishError && <p className="text-[13px] text-primary-700 mt-4">{publishError}</p>}

      {/* 动作行 */}
      <div className="flex items-center justify-end gap-3 pt-5 pb-8">
        <button
          onClick={onSaveDraft}
          className="inline-flex items-center px-4 py-2 text-sm text-foreground-500 hover:text-foreground-800 transition-colors duration-200 whitespace-nowrap cursor-pointer bg-transparent border-none"
        >
          {t('compose.saveDraft')}
        </button>
        <button
          onClick={handleSubmit}
          disabled={!canPublish}
          className="inline-flex items-center px-5 py-2 text-sm font-medium bg-primary-500 text-background-50 hover:bg-primary-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-200 rounded-xs whitespace-nowrap cursor-pointer"
        >
          {publishing ? t('compose.publishing') : t('compose.publish')}
        </button>
      </div>
    </div>
  );
}
