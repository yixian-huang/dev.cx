import { useTranslation } from 'react-i18next';
import { useState, useMemo, useCallback, useEffect } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import PageShell from '@/components/feature/PageShell';
import ProjectFormFields from '@/components/feature/ProjectFormFields';
import { useApiData } from '@/lib/use-api-data';
import { createClient, type ApiError } from '@/lib/api';
import { apiErrorMessage } from '@/lib/api-errors';
import { unwrap, type ApiProject } from '@/lib/adapters/api-types';
import { updateProject } from '@/lib/actions';
import {
  type ProjectDraft,
  type DraftErrors,
  emptyDraft,
  draftFromApiProject,
  validateDraft,
  hasErrors,
  diffDraft,
} from '@/lib/project-form';

// 设置页 = 共享 ProjectFormFields + 编辑壳。字段、顺序、文案、校验与发布页(new-project)
// 完全一致——受众在这里同样可改(此前编辑页缺该字段,受众一经创建永不可改)。
// 保存只 PATCH 改动字段(diffDraft);此前的 version/isOpenSource 是 API 不存在的假字段,
// 已随卡片式旧实现一起删除。

const NO_ERRORS: DraftErrors = {};

export default function ProjectSettingsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();

  const { data: rawProject } = useApiData<unknown>('project', id ? `/api/projects/${id}` : null);
  const apiProject = rawProject ? unwrap<ApiProject>(rawProject, 'project') : undefined;

  // 中性空白表单——apiProject 到达前(首帧/客户端补拉期间)的占位初始值。
  // 下面的 useEffect 一旦拿到 apiProject 就用 draftFromApiProject 重新灌种子。
  const [draft, setDraft] = useState<ProjectDraft>(() =>
    apiProject ? draftFromApiProject(apiProject) : emptyDraft());
  // 保存时只发改动字段——initial 记录"最后一次已知服务端状态"的快照,跟它 diff。
  const [initial, setInitial] = useState<ProjectDraft>(() =>
    apiProject ? draftFromApiProject(apiProject) : emptyDraft());

  // apiProject 首次到达(客户端异步补拉,或 SSR 未命中而客户端随后拿到)时重新灌种子——
  // 否则用户会一直对着空表单编辑,保存时却对真实项目发 PATCH。
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
  // 非 401 的写失败内联展示(spec §3 约定,Task 7 先例),不吞、不用 toast。
  const [saveError, setSaveError] = useState<string | undefined>(undefined);

  const errors = useMemo(() => validateDraft(draft), [draft]);

  const handleChange = useCallback((patch: Partial<ProjectDraft>) => {
    setDraft((prev) => ({ ...prev, ...patch }));
    setSaved(false);
    setSaveError(undefined);
  }, []);

  const handleSave = useCallback(async () => {
    if (!id) return;
    if (hasErrors(errors)) {
      setShowErrors(true);
      return;
    }
    setSaveError(undefined);

    const patch = diffDraft(initial, draft);
    // 所有表单字段都会真实落库,无改动时的"已保存"是诚实的
    if (Object.keys(patch).length === 0) {
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      return;
    }

    setSaving(true);
    try {
      await updateProject(createClient({ baseURL: '' }), id, patch);
      setInitial(draft);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      const e = err as ApiError;
      if (e.status === 401) {
        navigate('/login');
        return;
      }
      setSaveError(apiErrorMessage(e));
    } finally {
      setSaving(false);
    }
  }, [id, draft, initial, errors, navigate]);

  return (
    <PageShell pageEnter>
      {/* Header */}
      <header className="pt-10 pb-6 flex items-center gap-4">
        <Link
          to={`/p/${id}`}
          className="w-8 h-8 flex items-center justify-center rounded-md text-foreground-500 hover:text-foreground-800 hover:bg-background-100 transition-colors duration-150 cursor-pointer"
        >
          <i className="ri-arrow-left-line text-[18px]"></i>
        </Link>
        <div className="flex-1">
          <h1 className="font-heading text-[28px] font-semibold text-foreground-950 leading-[1.3]">
            {t('project.settings')}
          </h1>
          <p className="text-[13px] text-foreground-400 mt-1.5">
            {t('project.settingsSubtitle')}
          </p>
        </div>
      </header>

      <ProjectFormFields
        draft={draft}
        errors={showErrors ? errors : NO_ERRORS}
        onChange={handleChange}
        slugReadonly={id}
      />

      {/* Actions */}
      <div className="flex items-center justify-end gap-3 mt-10 pt-5 border-t border-foreground-200/35 pb-16">
        {saveError && <span className="text-[13px] text-primary-700 mr-auto">{saveError}</span>}
        {saved && (
          <span className="text-[13px] text-primary-600 flex items-center gap-1.5 mr-auto">
            <i className="ri-check-line text-[14px]"></i>
            {t('project.settingsSaved')}
          </span>
        )}
        <button
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-2 px-5 py-1.5 text-[14px] font-medium bg-primary-500 text-background-50 hover:bg-primary-600 transition-colors duration-200 rounded-xs whitespace-nowrap cursor-pointer disabled:opacity-50"
        >
          {saving ? (
            <>
              <i className="ri-loader-4-line animate-spin text-[14px]"></i>
              {t('project.saving')}
            </>
          ) : (
            <>
              <i className="ri-save-line text-[14px]"></i>
              {t('project.saveSettings')}
            </>
          )}
        </button>
      </div>
    </PageShell>
  );
}
