const typeAccent: Record<string, string> = {
  SHOW: 'text-accent-600',
  BUILD: 'text-primary-600',
  DISCUSS: 'text-secondary-600',
  // 时间线扩展类型:PROGRESS 沿用 BUILD 的墨色系(画布 2b),ASK 归入 DISCUSS 灰。
  PROGRESS: 'text-primary-600',
  ASK: 'text-secondary-600',
};

interface TypeLabelProps {
  // 宽化为 string:消费方(时间线/讨论列表)各自带扩展类型,未知值落中性灰。
  type: string;
  className?: string;
}

export default function TypeLabel({ type, className = '' }: TypeLabelProps) {
  const color = typeAccent[type] || 'text-foreground-400';
  return (
    <span className={`font-mono text-mono-sm tracking-wide whitespace-nowrap ${color} ${className}`}>
      {type}
    </span>
  );
}
