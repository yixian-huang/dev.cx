interface TabSwitcherProps<T extends string> {
  tabs: { key: T; label: string; count?: number }[];
  activeKey: T;
  onChange: (key: T) => void;
  className?: string;
}

export default function TabSwitcher<T extends string>({
  tabs,
  activeKey,
  onChange,
  className = '',
}: TabSwitcherProps<T>) {
  return (
    <div className={`flex items-baseline gap-1 ${className}`}>
      {tabs.map((tab) => (
        <button
          key={tab.key}
          onClick={() => onChange(tab.key)}
          className={`px-3 py-1 text-sm transition-colors duration-200 whitespace-nowrap rounded-xs cursor-pointer ${
            activeKey === tab.key
              ? 'text-foreground-950 font-medium'
              : 'text-foreground-500 hover:text-foreground-800'
          }`}
        >
          {tab.label}
          {/* 画布 2b:计数用 mono 小字跟在文字后,不做徽章 */}
          {tab.count !== undefined && (
            <span className="font-mono text-[11px] text-foreground-500 ml-1.5">{tab.count}</span>
          )}
        </button>
      ))}
    </div>
  );
}
