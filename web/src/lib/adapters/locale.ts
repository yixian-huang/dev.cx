// adapter 层的语言开关(C3:relativeTime/KIND_LABEL 硬编码中文)。
// 适配器是纯函数、在 React 与 i18next 生命周期之外运行(SSR 预取、node:test 直测),
// 不能调 useTranslation——这里保存一份由 i18n 初始化/languageChanged 事件写入的语言标记,
// 适配器据此选串。默认 zh(与 i18n 的 fallbackLng 一致)。
export type AdapterLang = 'zh' | 'en';

let current: AdapterLang = 'zh';

export function setAdapterLocale(lang: string): void {
  current = lang.startsWith('en') ? 'en' : 'zh';
}

export function adapterLocale(): AdapterLang {
  return current;
}
