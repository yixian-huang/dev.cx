import { useTranslation } from 'react-i18next';
import { useState, useCallback } from 'react';
import MarkdownEditor from '@/pages/compose/components/MarkdownEditor';
import ScreenshotGridField from '@/components/feature/ScreenshotGridField';
import type { AudienceKey } from '@/lib/adapters/types';
import {
  type ProjectDraft,
  type DraftErrors,
  type FieldError,
  type ProjectLink,
  STAGE_OPTIONS,
  STAGE_LABEL_KEY,
  AUDIENCE_OPTIONS,
  PROJECT_LIMITS,
  PROJECT_FIELD_ID,
  isTechTag,
  runeLen,
} from '@/lib/project-form';

// 项目表单字段主体——发布页(new-project)与设置页(project/settings)共用。
// layout="compact":创建页双栏密排,尽量一屏看完;layout="full":设置页单栏章节式(画布 5a)。

export type ProjectFormLayout = 'full' | 'compact';

interface ProjectFormFieldsProps {
  draft: ProjectDraft;
  errors: DraftErrors;
  onChange: (patch: Partial<ProjectDraft>) => void;
  slugField?: { value: string; onChange: (v: string) => void; error?: FieldError };
  slugReadonly?: string;
  /** full=设置页章节流;compact=创建页一屏双栏 */
  layout?: ProjectFormLayout;
}

function SectionHeading({ no, text, compact }: { no: string; text: string; compact?: boolean }) {
  if (compact) {
    return (
      <div className="font-mono text-[10px] tracking-[0.2em] text-foreground-400 uppercase mb-2">
        {no} · {text}
      </div>
    );
  }
  return (
    <div className="pt-[22px] pb-4 border-t border-foreground-200/35 font-mono text-[11px] tracking-[0.24em] text-foreground-400">
      {no} · {text}
    </div>
  );
}

function FieldLabel({ text, required }: { text: string; required?: boolean }) {
  return (
    <label className="text-[11px] text-foreground-400 tracking-wider uppercase font-medium block mb-1">
      {text}
      {required && <span className="text-accent-600 ml-1 normal-case tracking-normal">*</span>}
    </label>
  );
}

function ErrorText({ error }: { error?: FieldError }) {
  const { t } = useTranslation();
  if (!error) return null;
  return (
    <p role="alert" className="text-[12px] font-medium text-primary-700 mt-1 leading-snug">
      {t(error.key, error.params)}
    </p>
  );
}

function fieldShell(hasError: boolean, base: string): string {
  if (!hasError) return base;
  return `${base} ring-1 ring-primary-500/45 bg-primary-50/40`;
}

function UnderlineChoice({
  options,
  value,
  onChange,
}: {
  options: { key: string; label: string }[];
  value: string | string[];
  onChange: (key: string) => void;
}) {
  return (
    <div className="flex items-center gap-3 flex-wrap">
      {options.map((opt) => {
        const active = Array.isArray(value) ? value.includes(opt.key) : value === opt.key;
        return (
          <button
            key={opt.key}
            type="button"
            onClick={() => onChange(opt.key)}
            className={`text-[13px] bg-transparent border-0 p-0 transition-colors duration-200 cursor-pointer ${
              active
                ? 'text-accent-600 border-b-[1.5px] border-accent-500 pb-0.5'
                : 'text-foreground-400 hover:text-foreground-700'
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

const inputClass =
  'w-full text-[14px] text-foreground-900 bg-background-100 px-3 py-1.5 rounded-xs outline-none border border-transparent placeholder:text-foreground-300 transition-colors duration-200';

export default function ProjectFormFields({
  draft,
  errors,
  onChange,
  slugField,
  slugReadonly,
  layout = 'full',
}: ProjectFormFieldsProps) {
  const { t } = useTranslation();
  const compact = layout === 'compact';
  const [newTag, setNewTag] = useState('');
  // 创建页:可选块默认展开(用户要一页看见);若嫌挤可折叠截图区
  const [moreOpen, setMoreOpen] = useState(true);

  const addTag = useCallback(() => {
    const trimmed = newTag.trim();
    if (trimmed && !draft.tags.includes(trimmed)) {
      onChange({ tags: [...draft.tags, trimmed] });
      setNewTag('');
    }
  }, [newTag, draft.tags, onChange]);

  const removeTag = useCallback(
    (tag: string) => {
      onChange({ tags: draft.tags.filter((tg) => tg !== tag) });
    },
    [draft.tags, onChange],
  );

  const updateLink = useCallback(
    (idx: number, field: keyof ProjectLink, value: string) => {
      onChange({
        links: draft.links.map((link, i) => (i === idx ? { ...link, [field]: value } : link)),
      });
    },
    [draft.links, onChange],
  );

  const addLink = useCallback(() => {
    onChange({ links: [...draft.links, { label: '', url: '' }] });
  }, [draft.links, onChange]);

  const removeLink = useCallback(
    (idx: number) => {
      onChange({ links: draft.links.filter((_, i) => i !== idx) });
    },
    [draft.links, onChange],
  );

  const taglineLen = runeLen(draft.tagline);

  const nameField = (
    <div>
      <FieldLabel text={t('project.nameLabel', '产品名')} required />
      <input
        id={PROJECT_FIELD_ID.name}
        type="text"
        value={draft.name}
        onChange={(e) => onChange({ name: e.target.value })}
        placeholder={t('project.namePlaceholder')}
        aria-invalid={Boolean(errors.name)}
        className={fieldShell(
          Boolean(errors.name),
          compact
            ? 'w-full font-heading text-xl font-semibold text-foreground-950 bg-background-100 px-3 py-1.5 rounded-xs outline-none border border-transparent placeholder:text-foreground-300'
            : 'w-full font-heading text-2xl font-semibold text-foreground-950 bg-transparent placeholder:text-foreground-300 py-1 outline-none border border-transparent rounded-xs',
        )}
      />
      <ErrorText error={errors.name} />
    </div>
  );

  const slugFieldEl =
    slugField || slugReadonly !== undefined ? (
      <div>
        <FieldLabel text={t('project.publicUrl')} required={Boolean(slugField)} />
        <div className="flex items-center font-mono text-[13px]">
          <span className="text-foreground-400 shrink-0">dev.cx/p/</span>
          {slugField ? (
            <input
              id={PROJECT_FIELD_ID.slug}
              type="text"
              value={slugField.value}
              onChange={(e) => slugField.onChange(e.target.value)}
              placeholder={t('project.slugPlaceholder')}
              spellCheck={false}
              aria-invalid={Boolean(slugField.error)}
              className={fieldShell(
                Boolean(slugField.error),
                'flex-1 font-mono text-[13px] text-foreground-900 bg-background-100 px-2.5 py-1.5 ml-1 rounded-xs outline-none border border-transparent placeholder:text-foreground-300',
              )}
            />
          ) : (
            <span className="text-foreground-600">{slugReadonly}</span>
          )}
        </div>
        {slugField && <ErrorText error={slugField.error} />}
        {slugField && !compact && (
          <p className="text-[12px] text-foreground-400 mt-1">{t('project.slugHint')}</p>
        )}
      </div>
    ) : null;

  const taglineField = (
    <div>
      <FieldLabel text={t('project.tagline')} />
      <input
        id={PROJECT_FIELD_ID.tagline}
        type="text"
        value={draft.tagline}
        onChange={(e) => onChange({ tagline: e.target.value })}
        placeholder={t('project.taglinePlaceholder')}
        aria-invalid={Boolean(errors.tagline)}
        className={fieldShell(Boolean(errors.tagline), inputClass)}
      />
      <div className="flex items-baseline justify-between gap-3">
        <ErrorText error={errors.tagline} />
        <span
          className={`ml-auto font-mono text-[10px] mt-1 shrink-0 ${
            taglineLen > PROJECT_LIMITS.tagline ? 'text-primary-700' : 'text-foreground-300'
          }`}
        >
          {taglineLen}/{PROJECT_LIMITS.tagline}
        </span>
      </div>
    </div>
  );

  const stageAudience = (
    <div className={compact ? 'grid grid-cols-1 sm:grid-cols-2 gap-3' : 'space-y-5'}>
      <div>
        <FieldLabel text={t('project.stage')} />
        <UnderlineChoice
          options={STAGE_OPTIONS.map((key) => ({ key, label: t(STAGE_LABEL_KEY[key]) }))}
          value={draft.stage}
          onChange={(key) => onChange({ stage: key as ProjectDraft['stage'] })}
        />
      </div>
      <div>
        <FieldLabel text={t('project.audienceLabel')} />
        <UnderlineChoice
          options={AUDIENCE_OPTIONS.map((opt) => ({ key: opt.key, label: t(opt.labelKey) }))}
          value={draft.audience}
          onChange={(key) => {
            const k = key as AudienceKey;
            onChange({
              audience: draft.audience.includes(k)
                ? draft.audience.filter((a) => a !== k)
                : [...draft.audience, k],
            });
          }}
        />
        {!compact && (
          <p className="text-[12px] text-foreground-400 mt-2">{t('project.audienceHint')}</p>
        )}
      </div>
    </div>
  );

  const descriptionField = (
    <div id={PROJECT_FIELD_ID.description}>
      <FieldLabel text={t('project.description')} />
      <div className={errors.description ? 'rounded-xs ring-1 ring-primary-500/40 p-0.5' : ''}>
        <MarkdownEditor
          value={draft.description}
          onChange={(v) => onChange({ description: v })}
          placeholder={t('project.descriptionPlaceholder')}
          minHeight={compact ? 96 : 140}
        />
      </div>
      <ErrorText error={errors.description} />
    </div>
  );

  const tagsField = (
    <div>
      <FieldLabel text={t('project.tags')} />
      <div
        id={PROJECT_FIELD_ID.tags}
        className={fieldShell(
          Boolean(errors.tags),
          'flex flex-wrap items-center gap-1.5 rounded-xs border border-transparent min-h-[34px]',
        )}
      >
        {draft.tags.map((tag) => (
          <span
            key={tag}
            className={`inline-flex items-center gap-1 px-2 py-0.5 text-[12px] bg-secondary-100 text-secondary-900 rounded-xs group/tag ${
              isTechTag(tag) ? 'font-mono' : ''
            }`}
          >
            {tag}
            <button
              type="button"
              onClick={() => removeTag(tag)}
              className="w-3.5 h-3.5 flex items-center justify-center text-secondary-400 hover:text-secondary-700 opacity-0 group-hover/tag:opacity-100 transition-opacity cursor-pointer"
              aria-label={`删除 ${tag}`}
            >
              <i className="ri-close-line text-[11px]"></i>
            </button>
          </span>
        ))}
        <input
          type="text"
          value={newTag}
          onChange={(e) => setNewTag(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addTag();
            }
          }}
          placeholder={t('project.tagsPlaceholder')}
          className="text-[12px] text-foreground-900 bg-transparent placeholder:text-foreground-300 px-1.5 py-0.5 outline-none w-40 border-b border-foreground-200/50 focus:border-foreground-400 transition-colors"
        />
      </div>
      <ErrorText error={errors.tags} />
    </div>
  );

  const linksField = (
    <div>
      <FieldLabel text={t('project.links')} />
      <div className="space-y-1.5">
        {draft.links.map((link, idx) => (
          <div key={idx} id={PROJECT_FIELD_ID.link(idx)}>
            <div className="flex items-center gap-1.5 group/link">
              <input
                type="text"
                value={link.label}
                onChange={(e) => updateLink(idx, 'label', e.target.value)}
                placeholder={t('project.linkLabelPlaceholder')}
                aria-invalid={Boolean(errors.links?.[idx])}
                className={fieldShell(
                  Boolean(errors.links?.[idx]),
                  'w-[88px] text-[12px] text-foreground-900 bg-background-100 px-2 py-1.5 rounded-xs outline-none border border-transparent placeholder:text-foreground-300',
                )}
              />
              <input
                type="url"
                value={link.url}
                onChange={(e) => updateLink(idx, 'url', e.target.value)}
                placeholder={t('project.linkUrlPlaceholder')}
                aria-invalid={Boolean(errors.links?.[idx])}
                className={fieldShell(
                  Boolean(errors.links?.[idx]),
                  'flex-1 font-mono text-[12px] text-foreground-900 bg-background-100 px-2 py-1.5 rounded-xs outline-none border border-transparent placeholder:text-foreground-300',
                )}
              />
              <button
                type="button"
                onClick={() => removeLink(idx)}
                className="shrink-0 w-5 h-5 flex items-center justify-center text-foreground-300 hover:text-foreground-500 opacity-0 group-hover/link:opacity-100 transition-opacity cursor-pointer"
                aria-label={t('project.linkRemove')}
              >
                <i className="ri-close-line text-[13px]"></i>
              </button>
            </div>
            <ErrorText error={errors.links?.[idx]} />
          </div>
        ))}
        <button
          type="button"
          onClick={addLink}
          className="inline-flex items-center gap-1 text-[12px] text-foreground-500 hover:text-primary-500 transition-colors duration-150 cursor-pointer bg-transparent border-none p-0"
        >
          + {t('project.addLink')}
        </button>
        <ErrorText error={errors.linksCount} />
      </div>
    </div>
  );

  const screenshotsField = (
    <div id={PROJECT_FIELD_ID.screenshots}>
      <FieldLabel text={t('project.screenshots')} />
      <div className={errors.screenshots ? 'rounded-xs ring-1 ring-primary-500/40 p-0.5' : ''}>
        <ScreenshotGridField
          screenshots={draft.screenshots}
          onUpdate={(v) => onChange({ screenshots: v })}
        />
      </div>
      <ErrorText error={errors.screenshots} />
    </div>
  );

  // ── 创建页:双栏密排,必填区 + 可选区同屏 ──
  if (compact) {
    return (
      <div className="space-y-4">
        <section className="rounded-xs border border-foreground-200/35 bg-background-50 px-4 py-3.5">
          <SectionHeading no="01" text={t('project.basicInfo')} compact />
          <div className="space-y-3">
            {nameField}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {slugFieldEl}
              {taglineField}
            </div>
            {stageAudience}
          </div>
        </section>

        <section className="rounded-xs border border-foreground-200/35 bg-background-50 px-4 py-3.5">
          <div className="flex items-center justify-between gap-3 mb-2">
            <div className="font-mono text-[10px] tracking-[0.2em] text-foreground-400 uppercase">
              02 · {t('newProject.optionalSection')}
            </div>
            <button
              type="button"
              onClick={() => setMoreOpen((v) => !v)}
              className="text-[12px] text-foreground-500 hover:text-foreground-800 bg-transparent border-none p-0 cursor-pointer"
            >
              {moreOpen ? t('newProject.collapseOptional') : t('newProject.expandOptional')}
            </button>
          </div>
          {moreOpen && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3">
              <div className="space-y-3 md:col-span-2">{descriptionField}</div>
              <div className="space-y-3">{tagsField}</div>
              <div className="space-y-3">{linksField}</div>
              <div className="md:col-span-2">{screenshotsField}</div>
            </div>
          )}
          {!moreOpen && (
            <p className="text-[12px] text-foreground-400">
              {t('newProject.optionalCollapsedHint')}
            </p>
          )}
        </section>
      </div>
    );
  }

  // ── 设置页:原单栏章节流 ──
  return (
    <>
      <section>
        <SectionHeading no="01" text={t('project.basicInfo')} />
        <div className="space-y-5">
          {nameField}
          {slugFieldEl}
          {taglineField}
          {stageAudience}
        </div>
      </section>

      <section className="mt-8">
        <SectionHeading no="02" text={t('project.description')} />
        {descriptionField}
      </section>

      <section className="mt-8">
        <SectionHeading no="03" text={t('project.tags')} />
        {tagsField}
      </section>

      <section className="mt-8">
        <SectionHeading no="04" text={t('project.links')} />
        {linksField}
      </section>

      <section className="mt-8">
        <SectionHeading no="05" text={t('project.screenshots')} />
        {screenshotsField}
      </section>
    </>
  );
}
