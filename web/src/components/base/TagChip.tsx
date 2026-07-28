interface TagChipProps {
  label: string;
  onRemove?: () => void;
  className?: string;
}

export default function TagChip({ label, onRemove, className = '' }: TagChipProps) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs bg-secondary-100 text-secondary-900 rounded-xs whitespace-nowrap ${className}`}>
      {label}
      {onRemove && (
        <button
          onClick={onRemove}
          className="text-secondary-500 hover:text-secondary-700 transition-colors duration-150"
        >
          <i className="ri-close-line w-3 h-3 flex items-center justify-center"></i>
        </button>
      )}
    </span>
  );
}