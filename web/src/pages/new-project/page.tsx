import { useTranslation } from 'react-i18next';
import { useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import PageShell from '@/components/feature/PageShell';
import ProjectFormFields from '@/components/feature/ProjectFormFields';
import { useAuth } from '@/hooks/useAuth';
import { createClient, type ApiError } from '@/lib/api';
import { apiErrorMessage } from '@/lib/api-errors';
import { createProject } from '@/lib/actions';
import {
  type ProjectDraft,
  type DraftErrors,
  type FieldError,
  emptyDraft,
  slugStem,
  validateSlug,
  validateDraft,
  hasErrors,
  draftToPayload,
  collectFieldErrors,
  firstInvalidFieldId,
  focusProjectField,
} from '@/lib/project-form';

// 发布页 = 共享 ProjectFormFields + 创建壳。字段、顺序、文案、校验与设置页
// (project/settings)完全一致;slug 是可编辑字段:随名称实时派生预填(用户手改后
// 停止跟随),不再无条件加随机后缀——URL 即档案的一部分,所见即最终地址。

const NO_ERRORS: DraftErrors = {};

export default function NewProjectPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const emailVerified = user?.emailVerified !== false;

  const [draft, setDraft] = useState<ProjectDraft>(emptyDraft);
  const [slug, setSlug] = useState('');
  // 用户手动编辑过 slug 后,名称变更不再覆盖它
  const [slugTouched, setSlugTouched] = useState(false);
  // 服务端回弹的 slug 错误(slug_taken/slug_invalid)——展示在字段下方,不落底部通用槽
  const [slugServerError, setSlugServerError] = useState<FieldError | undefined>(undefined);
  // 首次提交前不亮错——只在用户点过「创建」后才逐字段展示
  const [showErrors, setShowErrors] = useState(false);
  const [creating, setCreating] = useState(false);
  // 非 401 的写失败内联展示(spec §3 约定),不吞、不用 toast;失败时保留表单内容不清空,
  // 用户可以直接改改重试。
  const [createError, setCreateError] = useState<string | undefined>(undefined);

  const errors = useMemo(() => validateDraft(draft), [draft]);
  const slugError = slugServerError ?? validateSlug(slug);
  const fieldErrors = useMemo(
    () => (showErrors ? collectFieldErrors(errors, slugError) : []),
    [showErrors, errors, slugError],
  );

  const handleChange = useCallback((patch: Partial<ProjectDraft>) => {
    setDraft((prev) => ({ ...prev, ...patch }));
    if (patch.name !== undefined) {
      setSlugTouched((touched) => {
        if (!touched) {
          setSlug(slugStem(patch.name ?? ''));
          setSlugServerError(undefined);
        }
        return touched;
      });
    }
    setCreateError(undefined);
  }, []);

  const handleSlugChange = useCallback((v: string) => {
    setSlugTouched(true);
    setSlug(v.toLowerCase().trim());
    setSlugServerError(undefined);
    setCreateError(undefined);
  }, []);

  const revealValidation = useCallback((nextErrors: DraftErrors, nextSlugError?: FieldError) => {
    setShowErrors(true);
    const items = collectFieldErrors(nextErrors, nextSlugError);
    const summary =
      items.length === 0
        ? t('newProject.fixIncomplete')
        : t('newProject.fixIncompleteCount', { count: items.length });
    setCreateError(summary);
    // 等错误态渲染后再滚到首错并 focus——否则 getElementById 可能还拿旧 DOM
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        focusProjectField(firstInvalidFieldId(nextErrors, nextSlugError));
      });
    });
  }, [t]);

  // 成功即 navigate('/p/'+slug),失败内联展示、401 转登录。
  // 按钮不因「表单未齐」而 disabled——点创建必须给出可理解反馈并聚焦首错。
  const handleCreate = useCallback(async () => {
    if (creating) return;

    if (!emailVerified) {
      setShowErrors(true);
      setCreateError(t('compose.needEmailVerify'));
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    const liveErrors = validateDraft(draft);
    const liveSlugError = slugServerError ?? validateSlug(slug);
    if (hasErrors(liveErrors) || liveSlugError) {
      revealValidation(liveErrors, liveSlugError);
      return;
    }

    setCreateError(undefined);
    setCreating(true);
    try {
      const client = createClient({ baseURL: '' });
      const result = await createProject(client, {
        slug,
        ...draftToPayload(draft),
      });
      navigate(`/p/${result.slug}`);
    } catch (err) {
      const e = err as ApiError;
      if (e.status === 401) {
        navigate('/login');
        return;
      }
      if (e.code === 'slug_taken' || e.code === 'slug_invalid') {
        const se: FieldError = {
          key: e.code === 'slug_taken' ? 'project.err.slugTaken' : 'project.err.slugInvalid',
        };
        setSlugServerError(se);
        revealValidation(validateDraft(draft), se);
        return;
      }
      setShowErrors(true);
      setCreateError(apiErrorMessage(e));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setCreating(false);
    }
  }, [creating, emailVerified, draft, slug, slugServerError, navigate, revealValidation, t]);

  return (
    <PageShell pageEnter>
      {/* Header */}
      <header className="pt-10 pb-6">
        <h1 className="font-heading text-[28px] font-semibold text-foreground-950 leading-[1.3]">
          {t('newProject.title')}
        </h1>
        <p className="text-[13px] text-foreground-400 mt-1.5">{t('newProject.deck')}</p>
        <p className="text-[12px] text-foreground-400 mt-2">
          {t('newProject.requiredHint')}
        </p>
      </header>

      {/* 提交失败摘要:顶栏可见,不依赖滚到页底才能看到错误 */}
      {showErrors && (fieldErrors.length > 0 || createError) && (
        <div
          role="alert"
          className="mb-6 px-4 py-3.5 bg-primary-50 border border-primary-100 rounded-xs"
        >
          <p className="text-[13px] font-medium text-primary-700 leading-relaxed">
            {createError ?? t('newProject.formIncomplete')}
          </p>
          {fieldErrors.length > 0 && (
            <ul className="mt-2 space-y-1">
              {fieldErrors.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => focusProjectField(item.id)}
                    className="text-left text-[13px] text-primary-700/90 hover:text-primary-600 underline-offset-2 hover:underline cursor-pointer bg-transparent border-none p-0"
                  >
                    · {t(item.error.key, item.error.params)}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {!emailVerified && (
        <div className="mb-6 px-4 py-3 bg-accent-100/50 border border-accent-500/30 rounded-xs text-[13px] text-foreground-700 leading-relaxed">
          {t('compose.needEmailVerify')}
        </div>
      )}

      <ProjectFormFields
        draft={draft}
        errors={showErrors ? errors : NO_ERRORS}
        onChange={handleChange}
        slugField={{
          value: slug,
          onChange: handleSlugChange,
          error: showErrors ? slugError : slugServerError,
        }}
      />

      {/* Actions — sticky 底栏,错误文案贴在按钮旁,避免长表单「点了没反应」 */}
      <div className="sticky bottom-0 z-20 -mx-6 px-6 mt-10 pt-4 pb-4 md:pb-6 bg-background-50/95 backdrop-blur-sm border-t border-foreground-200/40">
        {(createError || (showErrors && fieldErrors.length > 0)) && (
          <p role="alert" className="text-[13px] font-medium text-primary-700 mb-3 leading-relaxed">
            {createError ?? t('newProject.formIncomplete')}
            {fieldErrors[0] && (
              <>
                {' · '}
                <button
                  type="button"
                  onClick={() => focusProjectField(fieldErrors[0].id)}
                  className="underline underline-offset-2 hover:text-primary-600 cursor-pointer bg-transparent border-none p-0 text-inherit"
                >
                  {t('newProject.jumpToError')}
                </button>
              </>
            )}
          </p>
        )}
        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="px-4 py-2 text-[14px] text-foreground-500 hover:text-foreground-800 transition-colors duration-200 whitespace-nowrap cursor-pointer bg-transparent border-none"
          >
            {t('newProject.cancel')}
          </button>
          <button
            type="button"
            onClick={() => void handleCreate()}
            disabled={creating}
            className="inline-flex items-center gap-2 px-5 py-2 text-[14px] font-medium bg-primary-500 text-background-50 hover:bg-primary-600 transition-colors duration-200 rounded-xs whitespace-nowrap cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {creating ? t('newProject.creating') : t('newProject.create')}
          </button>
        </div>
      </div>
    </PageShell>
  );
}
