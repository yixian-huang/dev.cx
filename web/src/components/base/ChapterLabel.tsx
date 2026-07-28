interface ChapterLabelProps {
  label: string;
  sublabel?: string;
  className?: string;
}

// 章节 kicker(画布全帧统一):mono 11px / letter-spacing 0.24em / fg-400,
// label 与 sublabel 以 · 连接排在同一行。
export default function ChapterLabel({ label, sublabel, className = '' }: ChapterLabelProps) {
  return (
    <div className={`font-mono text-[11px] tracking-[0.24em] text-foreground-400 uppercase ${className}`}>
      {label}
      {sublabel && <span className="tracking-normal"> · {sublabel}</span>}
    </div>
  );
}
