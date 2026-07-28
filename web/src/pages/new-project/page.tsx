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

// 创建产品页:紧凑双栏表单,成功后 replace 跳转产品详情 /p/:slug。

const NO_ERRORS: DraftErrors = {};

export default function NewProjectPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const emailVerified = user?.emailVerified !== false;

  const [draft, setDraft] = useState<ProjectDraft>(emptyDraft);
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [slugServerError, setSlugServerError] = useState<FieldError | undefined>(undefined);
  const [showErrors, setShowErrors] = useState(false);
  const [creating, setCreating] = useState(false);
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
        ? t('newProject.formIncomplete')
        : t('newProject.formIncompleteCount', { count: items.length });
    setCreateError(summary);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        focusProjectField(firstInvalidFieldId(nextErrors, nextSlugError));
      });
    });
  }, [t]);

  // 成功:replace 进产品详情,避免返回键回到空表单。
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
      navigate(`/p/${result.slug}`, { replace: true });
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
    <PageShell width="wide" pageEnter contentClassName="pb-4">
      {/* 紧凑刊头 */}
      <header className="pt-6 pb-4 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2">
        <div>
          <h1 className="font-heading text-[22px] md:text-[24px] font-semibold text-foreground-950 leading-tight">
            {t('newProject.title')}
          </h1>
          <p className="text-[12px] text-foreground-400 mt-1">
            {t('newProject.deckCompact')}
          </p>
        </div>
        <p className="text-[11px] text-foreground-400 shrink-0">
          {t('newProject.requiredHint')}
        </p>
      </header>

      {showErrors && (fieldErrors.length > 0 || createError) && (
        <div
          role="alert"
          className="mb-3 px-3.5 py-2.5 bg-primary-50 border border-primary-100 rounded-xs"
        >
          <p className="text-[13px] font-medium text-primary-700 leading-relaxed">
            {createError ?? t('newProject.formIncomplete')}
          </p>
          {fieldErrors.length > 0 && (
            <ul className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
              {fieldErrors.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => focusProjectField(item.id)}
                    className="text-left text-[12px] text-primary-700/90 hover:text-primary-600 underline-offset-2 hover:underline cursor-pointer bg-transparent border-none p-0"
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
        <div className="mb-3 px-3.5 py-2.5 bg-accent-100/50 border border-accent-500/30 rounded-xs text-[12px] text-foreground-700 leading-relaxed">
          {t('compose.needEmailVerify')}
        </div>
      )}

      <ProjectFormFields
        layout="compact"
        draft={draft}
        errors={showErrors ? errors : NO_ERRORS}
        onChange={handleChange}
        slugField={{
          value: slug,
          onChange: handleSlugChange,
          error: showErrors ? slugError : slugServerError,
        }}
      />

      {/* 动作:贴表单底,非超高 sticky,减少「表单+底栏」叠高 */}
      <div className="mt-4 pt-3 border-t border-foreground-200/40 flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between pb-8">
        <div className="min-h-[1.25rem]">
          {(createError || (showErrors && fieldErrors.length > 0)) && (
            <p role="alert" className="text-[12px] font-medium text-primary-700 leading-relaxed">
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
        </div>
        <div className="flex items-center justify-end gap-3 shrink-0">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="px-4 py-1.5 text-[13px] text-foreground-500 hover:text-foreground-800 transition-colors duration-200 whitespace-nowrap cursor-pointer bg-transparent border-none"
          >
            {t('newProject.cancel')}
          </button>
          <button
            type="button"
            onClick={() => void handleCreate()}
            disabled={creating}
            className="inline-flex items-center gap-2 px-5 py-1.5 text-[13px] font-medium bg-primary-500 text-background-50 hover:bg-primary-600 transition-colors duration-200 rounded-xs whitespace-nowrap cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {creating ? t('newProject.creating') : t('newProject.create')}
          </button>
        </div>
      </div>
    </PageShell>
  );
}
