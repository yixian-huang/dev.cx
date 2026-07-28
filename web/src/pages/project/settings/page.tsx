import { useTranslation } from 'react-i18next';
import { useState, useMemo, useCallback, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import PageShell from '@/components/feature/PageShell';
import ProjectFormFields from '@/components/feature/ProjectFormFields';
import ProjectFormShell from '@/components/feature/ProjectFormShell';
import FormAlert from '@/components/base/FormAlert';
import { useApiData } from '@/lib/use-api-data';
import { createClient, type ApiError } from '@/lib/api';
import { apiErrorMessage } from '@/lib/api-errors';
import { unwrap, type ApiProject } from '@/lib/adapters/api-types';
import { hideProject, unhideProject, updateProject } from '@/lib/actions';
import {
  type ProjectDraft,
  type DraftErrors,
  emptyDraft,
  draftFromApiProject,
  validateDraft,
  hasErrors,
  diffDraft,
  collectFieldErrors,
  scheduleFocusProjectField,
} from '@/lib/project-form';

// 设置页 = ProjectFormShell + ProjectFormFields(full)。
// 字段/校验与创建页一致;保存只 PATCH 改动字段(diffDraft);另有软隐藏区块。

const NO_ERRORS: DraftErrors = {};

export default function ProjectSettingsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();

  const { data: rawProject } = useApiData<unknown>('project', id ? `/api/projects/${id}` : null);
  const apiProject = rawProject ? unwrap<ApiProject>(rawProject, 'project') : undefined;

  const [draft, setDraft] = useState<ProjectDraft>(() =>
    apiProject ? draftFromApiProject(apiProject) : emptyDraft());
  const [initial, setInitial] = useState<ProjectDraft>(() =>
    apiProject ? draftFromApiProject(apiProject) : emptyDraft());

  useEffect(() => {
    if (!apiProject) return;
    const seeded = draftFromApiProject(apiProject);
    setDraft(seeded);
    setInitial(seeded);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiProject?.id]);

  const [showErrors, setShowErrors] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | undefined>(undefined);
  const [hidden, setHidden] = useState(Boolean(apiProject?.hidden));
  const [hiding, setHiding] = useState(false);
  const [hideError, setHideError] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (apiProject) setHidden(Boolean(apiProject.hidden));
  }, [apiProject?.id, apiProject?.hidden]);

  const errors = useMemo(() => validateDraft(draft), [draft]);
  const fieldErrors = useMemo(
    () => (showErrors ? collectFieldErrors(errors) : []),
    [showErrors, errors],
  );

  const handleChange = useCallback((patch: Partial<ProjectDraft>) => {
    setDraft((prev) => ({ ...prev, ...patch }));
    setSaved(false);
    setFormError(undefined);
  }, []);

  const revealValidation = useCallback((nextErrors: DraftErrors) => {
    setShowErrors(true);
    const items = collectFieldErrors(nextErrors);
    setFormError(
      items.length === 0
        ? t('project.formIncomplete')
        : t('project.formIncompleteCount', { count: items.length }),
    );
    scheduleFocusProjectField(nextErrors);
  }, [t]);

  const handleSave = useCallback(async () => {
    if (!id || saving) return;

    const liveErrors = validateDraft(draft);
    if (hasErrors(liveErrors)) {
      revealValidation(liveErrors);
      return;
    }

    setFormError(undefined);
    const patch = diffDraft(initial, draft);
    if (Object.keys(patch).length === 0) {
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      return;
    }

    setSaving(true);
    try {
      await updateProject(createClient({ baseURL: '' }), id, patch);
      setInitial(draft);
      setShowErrors(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      const e = err as ApiError;
      if (e.status === 401) {
        navigate('/login');
        return;
      }
      setShowErrors(true);
      setFormError(apiErrorMessage(e));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setSaving(false);
    }
  }, [id, draft, initial, saving, navigate, revealValidation]);

  const handleToggleHidden = useCallback(async () => {
    if (!id || hiding) return;
    setHideError(undefined);
    setHiding(true);
    try {
      const client = createClient({ baseURL: '' });
      const result = hidden ? await unhideProject(client, id) : await hideProject(client, id);
      setHidden(Boolean(result.hidden));
    } catch (err) {
      const e = err as ApiError;
      if (e.status === 401) {
        navigate('/login');
        return;
      }
      setHideError(apiErrorMessage(e));
    } finally {
      setHiding(false);
    }
  }, [id, hidden, hiding, navigate]);

  return (
    <PageShell pageEnter>
      <ProjectFormShell
        density="full"
        title={t('project.settings')}
        subtitle={t('project.settingsSubtitle')}
        backTo={id ? `/p/${id}` : undefined}
        showErrors={showErrors}
        fieldErrors={fieldErrors}
        formError={formError}
        successMessage={saved ? t('project.settingsSaved') : undefined}
        beforeFields={(
          <section className="mb-8 rounded-xs border border-foreground-200/40 px-4 py-4">
            <div className="font-mono text-[11px] tracking-[0.2em] text-foreground-400 uppercase mb-2">
              {t('project.visibilitySection')}
            </div>
            <p className="text-[13px] text-foreground-700 leading-relaxed">
              {hidden ? t('project.hiddenHelp') : t('project.publicHelp')}
            </p>
            {hideError && (
              <FormAlert className="mt-2 py-2">
                {hideError}
              </FormAlert>
            )}
            <div className="mt-3 flex items-center gap-3 flex-wrap">
              <span
                className={`inline-flex px-2 py-0.5 text-[11px] font-medium rounded-xs ${
                  hidden
                    ? 'bg-secondary-100 text-secondary-800'
                    : 'bg-primary-100 text-primary-700'
                }`}
              >
                {hidden ? t('project.hiddenBadge') : t('project.publicBadge')}
              </span>
              <button
                type="button"
                onClick={() => void handleToggleHidden()}
                disabled={hiding}
                className="inline-flex items-center px-3 py-1.5 text-[13px] font-medium border border-foreground-200/50 text-foreground-800 hover:bg-background-100 rounded-xs transition-colors duration-200 cursor-pointer disabled:opacity-40 bg-transparent"
              >
                {hiding
                  ? t('project.visibilityWorking')
                  : hidden
                    ? t('project.unhideAction')
                    : t('project.hideAction')}
              </button>
            </div>
          </section>
        )}
        primaryAction={{
          label: t('project.saveSettings'),
          loadingLabel: t('project.saving'),
          loading: saving,
          icon: 'ri-save-line',
          onClick: () => void handleSave(),
        }}
      >
        <ProjectFormFields
          draft={draft}
          errors={showErrors ? errors : NO_ERRORS}
          onChange={handleChange}
          slugReadonly={id}
        />
      </ProjectFormShell>
    </PageShell>
  );
}
