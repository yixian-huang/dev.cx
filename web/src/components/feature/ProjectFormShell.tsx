import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import FormAlert from '@/components/base/FormAlert';
import { focusProjectField, type FieldError } from '@/lib/project-form';

export type ProjectFormFieldErrorItem = { id: string; error: FieldError };

interface ProjectFormShellProps {
  /** 页标题 */
  title: string;
  /** 副标题 */
  subtitle: string;
  /** 右上角提示(如「* 必填」);compact 刊头用 */
  requiredHint?: string;
  /** 返回链接(设置页回到产品详情) */
  backTo?: string;
  /** compact=创建页密排;full=设置页章节流的底栏间距 */
  density?: 'compact' | 'full';
  /** 是否展示校验摘要(提交过一次后) */
  showErrors: boolean;
  /** collectFieldErrors 结果;showErrors 时渲染可点击列表 */
  fieldErrors: ProjectFormFieldErrorItem[];
  /** 顶部/底栏共用的摘要文案(校验汇总或 API 错误) */
  formError?: string;
  /** 刊头下、字段前的提示(如未验证邮箱) */
  banners?: ReactNode;
  /** 字段前插槽(如设置页可见性区块) */
  beforeFields?: ReactNode;
  /** 通常是 <ProjectFormFields ... /> */
  children: ReactNode;
  /** 底栏次要动作(取消) */
  secondaryAction?: { label: string; onClick: () => void };
  /** 底栏主按钮 */
  primaryAction: {
    label: string;
    loadingLabel?: string;
    loading?: boolean;
    onClick: () => void;
    icon?: string;
  };
  /** 成功态(如「已保存」)——与 formError 互斥优先展示错误 */
  successMessage?: string;
}

/**
 * 创建产品 / 产品设置共用壳:刊头、校验 FormAlert(可跳字段)、底栏动作。
 * 字段本体仍由 ProjectFormFields 承担;本组件只管两端一致的反馈与动作节奏。
 */
export default function ProjectFormShell({
  title,
  subtitle,
  requiredHint,
  backTo,
  density = 'full',
  showErrors,
  fieldErrors,
  formError,
  banners,
  beforeFields,
  children,
  secondaryAction,
  primaryAction,
  successMessage,
}: ProjectFormShellProps) {
  const { t } = useTranslation();
  const compact = density === 'compact';
  const hasValidation = showErrors && (fieldErrors.length > 0 || Boolean(formError));
  const summaryText =
    formError
    || (fieldErrors.length > 0 ? t('project.formIncomplete') : undefined);

  return (
    <>
      <header
        className={
          compact
            ? 'pt-6 pb-4 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2'
            : 'pt-10 pb-6 flex items-center gap-4'
        }
      >
        {backTo && (
          <Link
            to={backTo}
            className="w-8 h-8 flex items-center justify-center rounded-md text-foreground-500 hover:text-foreground-800 hover:bg-background-100 transition-colors duration-150 cursor-pointer shrink-0"
            aria-label={t('project.backToProduct')}
          >
            <i className="ri-arrow-left-line text-[18px]" />
          </Link>
        )}
        <div className="flex-1 min-w-0">
          <h1
            className={
              compact
                ? 'font-heading text-[22px] md:text-[24px] font-semibold text-foreground-950 leading-tight'
                : 'font-heading text-[28px] font-semibold text-foreground-950 leading-[1.3]'
            }
          >
            {title}
          </h1>
          <p
            className={
              compact
                ? 'text-[12px] text-foreground-400 mt-1'
                : 'text-[13px] text-foreground-400 mt-1.5'
            }
          >
            {subtitle}
          </p>
        </div>
        {requiredHint && (
          <p className="text-[11px] text-foreground-400 shrink-0">{requiredHint}</p>
        )}
      </header>

      {hasValidation && (
        <FormAlert className={compact ? 'mb-3' : 'mb-4'}>
          <p>{summaryText}</p>
          {fieldErrors.length > 0 && (
            <ul className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 font-normal">
              {fieldErrors.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => focusProjectField(item.id)}
                    className="text-left text-[12px] underline-offset-2 hover:underline cursor-pointer bg-transparent border-none p-0 text-inherit"
                  >
                    · {t(item.error.key, item.error.params)}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </FormAlert>
      )}

      {banners}

      {beforeFields}

      {children}

      <div
        className={
          compact
            ? 'mt-4 pt-3 border-t border-foreground-200/40 flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between pb-8'
            : 'mt-10 pt-5 border-t border-foreground-200/35 flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between pb-16'
        }
      >
        <div className="min-h-[1.25rem] flex-1 min-w-0">
          {hasValidation && (
            <FormAlert className="py-2">
              {summaryText}
              {fieldErrors[0] && (
                <>
                  {' · '}
                  <button
                    type="button"
                    onClick={() => focusProjectField(fieldErrors[0].id)}
                    className="underline underline-offset-2 hover:opacity-80 cursor-pointer bg-transparent border-none p-0 text-inherit"
                  >
                    {t('project.jumpToError')}
                  </button>
                </>
              )}
            </FormAlert>
          )}
          {!hasValidation && formError && (
            <FormAlert className="py-2">{formError}</FormAlert>
          )}
          {!hasValidation && !formError && successMessage && (
            <span className="text-[13px] text-primary-600 flex items-center gap-1.5">
              <i className="ri-check-line text-[14px]" />
              {successMessage}
            </span>
          )}
        </div>
        <div className="flex items-center justify-end gap-3 shrink-0">
          {secondaryAction && (
            <button
              type="button"
              onClick={secondaryAction.onClick}
              className="px-4 py-1.5 text-[13px] text-foreground-500 hover:text-foreground-800 transition-colors duration-200 whitespace-nowrap cursor-pointer bg-transparent border-none"
            >
              {secondaryAction.label}
            </button>
          )}
          <button
            type="button"
            onClick={primaryAction.onClick}
            disabled={primaryAction.loading}
            className="inline-flex items-center gap-2 px-5 py-1.5 text-[13px] md:text-[14px] font-medium bg-primary-500 text-background-50 hover:bg-primary-600 transition-colors duration-200 rounded-xs whitespace-nowrap cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {primaryAction.loading ? (
              <>
                <i className="ri-loader-4-line animate-spin text-[14px]" />
                {primaryAction.loadingLabel ?? primaryAction.label}
              </>
            ) : (
              <>
                {primaryAction.icon && <i className={`${primaryAction.icon} text-[14px]`} />}
                {primaryAction.label}
              </>
            )}
          </button>
        </div>
      </div>
    </>
  );
}
