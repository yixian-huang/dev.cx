import type { ReactNode } from 'react';

interface FormAlertProps {
  children: ReactNode;
  /** default = 错误; info = 提示(如未验证邮箱) */
  tone?: 'error' | 'info';
  className?: string;
}

/**
 * 全站写路径错误/提示统一壳——高对比、带边框、role=alert，避免浅色小字被忽略。
 */
export default function FormAlert({ children, tone = 'error', className = '' }: FormAlertProps) {
  const toneCls =
    tone === 'info'
      ? 'bg-accent-100/55 border-accent-500/35 text-foreground-800'
      : 'bg-primary-50 border-primary-100 text-primary-800';
  return (
    <div
      role="alert"
      className={`px-3.5 py-2.5 border rounded-xs text-[13px] font-medium leading-relaxed ${toneCls} ${className}`}
    >
      {children}
    </div>
  );
}
