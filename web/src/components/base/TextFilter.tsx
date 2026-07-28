interface TextFilterProps<T extends string> {
  options: { key: T; label: string }[];
  activeKey: T;
  onChange: (key: T) => void;
  className?: string;
}

export default function TextFilter<T extends string>({
  options,
  activeKey,
  onChange,
  className = '',
}: TextFilterProps<T>) {
  return (
    <div className={`flex items-center gap-1 ${className}`}>
      {options.map((opt) => {
        const isActive = activeKey === opt.key;
        return (
          <button
            key={opt.key}
            onClick={() => onChange(opt.key)}
            className={`px-2.5 py-1 text-xs transition-all duration-200 whitespace-nowrap rounded-full cursor-pointer ${
              isActive
                ? 'bg-background-200 text-foreground-950 font-medium'
                : 'text-foreground-500 hover:text-foreground-800 hover:bg-background-100'
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}