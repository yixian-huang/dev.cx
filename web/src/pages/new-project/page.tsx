import { useTranslation } from 'react-i18next';
import { useState, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import PageShell from '@/components/feature/PageShell';
import ProjectFormFields from '@/components/feature/ProjectFormFields';
import ProjectFormShell from '@/components/feature/ProjectFormShell';
import FormAlert from '@/components/base/FormAlert';
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
  scheduleFocusProjectField,
} from '@/lib/project-form';

// 创建产品页:ProjectFormShell + compact 字段,成功后 replace 跳转 /p/:slug。

const NO_ERRORS: DraftErrors = {};

export default function NewProjectPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const emailVerified = user?.emailVerified !== false;

  const [draft, setDraft] = useState<ProjectDraft>(emptyDraft);
  const [slug, setSlug] = useState('');
  // 用户手动改过 slug 后不再跟 name 自动派生
  const slugTouchedRef = useRef(false);
  const [slugServerError, setSlugServerError] = useState<FieldError | undefined>(undefined);
  const [showErrors, setShowErrors] = useState(false);
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState<string | undefined>(undefined);

  const errors = useMemo(() => validateDraft(draft), [draft]);
  const slugError = slugServerError ?? validateSlug(slug);
  const fieldErrors = useMemo(
    () => (showErrors ? collectFieldErrors(errors, slugError) : []),
    [showErrors, errors, slugError],
  );

  const handleChange = useCallback((patch: Partial<ProjectDraft>) => {
    setDraft((prev) => ({ ...prev, ...patch }));
    if (patch.name !== undefined && !slugTouchedRef.current) {
      setSlug(slugStem(patch.name ?? ''));
      setSlugServerError(undefined);
    }
    setFormError(undefined);
  }, []);

  const handleSlugChange = useCallback((v: string) => {
    slugTouchedRef.current = true;
    setSlug(v.toLowerCase().trim());
    setSlugServerError(undefined);
    setFormError(undefined);
  }, []);

  const revealValidation = useCallback((nextErrors: DraftErrors, nextSlugError?: FieldError) => {
    setShowErrors(true);
    const items = collectFieldErrors(nextErrors, nextSlugError);
    setFormError(
      items.length === 0
        ? t('project.formIncomplete')
        : t('project.formIncompleteCount', { count: items.length }),
    );
    scheduleFocusProjectField(nextErrors, nextSlugError);
  }, [t]);

  const handleCreate = useCallback(async () => {
    if (creating) return;

    if (!emailVerified) {
      setShowErrors(true);
      setFormError(t('compose.needEmailVerify'));
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    const liveErrors = validateDraft(draft);
    const liveSlugError = slugServerError ?? validateSlug(slug);
    if (hasErrors(liveErrors) || liveSlugError) {
      revealValidation(liveErrors, liveSlugError);
      return;
    }

    setFormError(undefined);
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
      setFormError(apiErrorMessage(e));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setCreating(false);
    }
  }, [creating, emailVerified, draft, slug, slugServerError, navigate, revealValidation, t]);

  return (
    <PageShell width="wide" pageEnter contentClassName="pb-4">
      <ProjectFormShell
        density="compact"
        title={t('newProject.title')}
        subtitle={t('newProject.deckCompact')}
        requiredHint={t('newProject.requiredHint')}
        showErrors={showErrors}
        fieldErrors={fieldErrors}
        formError={formError}
        banners={
          !emailVerified ? (
            <FormAlert tone="info" className="mb-3">
              {t('compose.needEmailVerify')}
            </FormAlert>
          ) : null
        }
        secondaryAction={{
          label: t('newProject.cancel'),
          onClick: () => navigate(-1),
        }}
        primaryAction={{
          label: t('newProject.create'),
          loadingLabel: t('newProject.creating'),
          loading: creating,
          onClick: () => void handleCreate(),
        }}
      >
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
      </ProjectFormShell>
    </PageShell>
  );
}
