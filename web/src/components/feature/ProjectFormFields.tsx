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

// 项目表单字段主体——发布页(new-project)与设置页(project/settings)共用同一份字段、
// 顺序、文案与校验展示;两个入口只差外层壳(标题/提交按钮/取数)。视觉沿用画布 5a:
// mono 编号章节头 + 无框输入 + 下划线选中,不再维护设置页那套卡片式独立实现。

interface ProjectFormFieldsProps {
  draft: ProjectDraft;
  // 传空对象 = 不展示错误(父级在首次提交前不亮错)
  errors: DraftErrors;
  onChange: (patch: Partial<ProjectDraft>) => void;
  // 发布模式:可编辑的公开地址字段(slug 是创建后不可改的永久地址,URL 即档案的一部分)
  slugField?: { value: string; onChange: (v: string) => void; error?: FieldError };
  // 编辑模式:只读展示既有地址
  slugReadonly?: string;
}

function SectionHeading({ no, text }: { no: string; text: string }) {
  return (
    <div className="pt-[22px] pb-4 border-t border-foreground-200/35 font-mono text-[11px] tracking-[0.24em] text-foreground-400">
      {no} · {text}
    </div>
  );
}

function FieldLabel({ text, required }: { text: string; required?: boolean }) {
  return (
    <label className="text-[11px] text-foreground-400 tracking-wider uppercase font-medium block mb-1.5">
      {text}
      {required && <span className="text-accent-600 ml-1 normal-case tracking-normal">*</span>}
    </label>
  );
}

function ErrorText({ error }: { error?: FieldError }) {
  const { t } = useTranslation();
  if (!error) return null;
  return (
    <p role="alert" className="text-[13px] font-medium text-primary-700 mt-1.5 leading-snug">
      {t(error.key, error.params)}
    </p>
  );
}

function fieldShell(hasError: boolean, base: string): string {
  if (!hasError) return base;
  return `${base} ring-1 ring-primary-500/45 bg-primary-50/40`;
}

/* ── 5a:下划线选中(非实底 pill),阶段(单选)/受众(多选)共用——value 传数组即多选,
   点亮/点灭由父级 onChange 处理 ── */
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
    <div className="flex items-center gap-4 flex-wrap">
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
  'w-full text-[14px] text-foreground-900 bg-background-100 px-3 py-2 rounded-xs outline-none border border-transparent placeholder:text-foreground-300 transition-colors duration-200';

export default function ProjectFormFields({ draft, errors, onChange, slugField, slugReadonly }: ProjectFormFieldsProps) {
  const { t } = useTranslation();
  const [newTag, setNewTag] = useState('');

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

  return (
    <>
      {/* 01 基本信息 */}
      <section>
        <SectionHeading no="01" text={t('project.basicInfo')} />
        <div className="space-y-5">
          <div>
            <FieldLabel text={t('project.nameLabel', '产品名')} required />
            {/* 5a:产品名 = 24px serif 无框输入;有错时加 ring,避免用户看不见字段级错误 */}
            <input
              id={PROJECT_FIELD_ID.name}
              type="text"
              value={draft.name}
              onChange={(e) => onChange({ name: e.target.value })}
              placeholder={t('project.namePlaceholder')}
              aria-invalid={Boolean(errors.name)}
              className={fieldShell(
                Boolean(errors.name),
                'w-full font-heading text-2xl font-semibold text-foreground-950 bg-transparent placeholder:text-foreground-300 py-1 outline-none border border-transparent rounded-xs',
              )}
            />
            <ErrorText error={errors.name} />
          </div>
          {(slugField || slugReadonly !== undefined) && (
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
              {slugField && (
                <p className="text-[12px] text-foreground-400 mt-1.5">{t('project.slugHint')}</p>
              )}
            </div>
          )}
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
                className={`ml-auto font-mono text-[11px] mt-1.5 shrink-0 ${
                  taglineLen > PROJECT_LIMITS.tagline ? 'text-primary-700' : 'text-foreground-300'
                }`}
              >
                {taglineLen}/{PROJECT_LIMITS.tagline}
              </span>
            </div>
          </div>
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
            <p className="text-[12px] text-foreground-400 mt-2">{t('project.audienceHint')}</p>
          </div>
        </div>
      </section>

      {/* 02 产品介绍 */}
      <section className="mt-8" id={PROJECT_FIELD_ID.description}>
        <SectionHeading no="02" text={t('project.description')} />
        <div className={errors.description ? 'rounded-xs ring-1 ring-primary-500/40 p-1 -m-1' : ''}>
          <MarkdownEditor
            value={draft.description}
            onChange={(v) => onChange({ description: v })}
            placeholder={t('project.descriptionPlaceholder')}
            minHeight={140}
          />
        </div>
        <ErrorText error={errors.description} />
      </section>

      {/* 03 标签(混排:技术类 mono、场景类正文字体) */}
      <section className="mt-8">
        <SectionHeading no="03" text={t('project.tags')} />
        <div
          id={PROJECT_FIELD_ID.tags}
          className={fieldShell(
            Boolean(errors.tags),
            'flex flex-wrap items-center gap-2 rounded-xs border border-transparent px-0.5 py-0.5',
          )}
        >
          {draft.tags.map((tag) => (
            <span
              key={tag}
              className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 text-[13px] bg-secondary-100 text-secondary-900 rounded-xs group/tag ${
                isTechTag(tag) ? 'font-mono' : ''
              }`}
            >
              {tag}
              <button
                type="button"
                onClick={() => removeTag(tag)}
                className="w-4 h-4 flex items-center justify-center text-secondary-400 hover:text-secondary-700 opacity-0 group-hover/tag:opacity-100 transition-opacity cursor-pointer"
                aria-label={`删除 ${tag}`}
              >
                <i className="ri-close-line text-[12px]"></i>
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
            className="text-[13px] text-foreground-900 bg-transparent placeholder:text-foreground-300 px-2 py-0.5 outline-none w-52 border-b border-foreground-200/50 focus:border-foreground-400 transition-colors"
          />
        </div>
        <ErrorText error={errors.tags} />
      </section>

      {/* 04 外部链接 */}
      <section className="mt-8">
        <SectionHeading no="04" text={t('project.links')} />
        <div className="space-y-2">
          {draft.links.map((link, idx) => (
            <div key={idx} id={PROJECT_FIELD_ID.link(idx)}>
              <div className="flex items-center gap-2 group/link">
                <input
                  type="text"
                  value={link.label}
                  onChange={(e) => updateLink(idx, 'label', e.target.value)}
                  placeholder={t('project.linkLabelPlaceholder')}
                  aria-invalid={Boolean(errors.links?.[idx])}
                  className={fieldShell(
                    Boolean(errors.links?.[idx]),
                    'w-[100px] text-[13px] text-foreground-900 bg-background-100 px-2.5 py-1.5 rounded-xs outline-none border border-transparent placeholder:text-foreground-300',
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
                    'flex-1 font-mono text-[13px] text-foreground-900 bg-background-100 px-2.5 py-1.5 rounded-xs outline-none border border-transparent placeholder:text-foreground-300',
                  )}
                />
                <button
                  type="button"
                  onClick={() => removeLink(idx)}
                  className="shrink-0 w-5 h-5 flex items-center justify-center text-foreground-300 hover:text-foreground-500 opacity-0 group-hover/link:opacity-100 transition-opacity cursor-pointer"
                  aria-label={t('project.linkRemove')}
                >
                  <i className="ri-close-line text-[14px]"></i>
                </button>
              </div>
              <ErrorText error={errors.links?.[idx]} />
            </div>
          ))}
          <button
            type="button"
            onClick={addLink}
            className="inline-flex items-center gap-1.5 text-[13px] text-foreground-500 hover:text-primary-500 transition-colors duration-150 cursor-pointer bg-transparent border-none p-0"
          >
            + {t('project.addLink')}
          </button>
          <ErrorText error={errors.linksCount} />
        </div>
      </section>

      {/* 05 产品截图 */}
      <section className="mt-8" id={PROJECT_FIELD_ID.screenshots}>
        <SectionHeading no="05" text={t('project.screenshots')} />
        <div className={errors.screenshots ? 'rounded-xs ring-1 ring-primary-500/40 p-1' : ''}>
          <ScreenshotGridField
            screenshots={draft.screenshots}
            onUpdate={(v) => onChange({ screenshots: v })}
          />
        </div>
        <ErrorText error={errors.screenshots} />
      </section>
    </>
  );
}
