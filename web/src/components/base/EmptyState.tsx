interface EmptyStateProps {
  message: string;
  hint?: string;
  className?: string;
}

export default function EmptyState({ message, hint, className = '' }: EmptyStateProps) {
  return (
    <div className={`py-16 text-center ${className}`}>
      <p className="text-body-md text-foreground-500">{message}</p>
      {hint && <p className="text-body-sm text-foreground-400 mt-2">{hint}</p>}
    </div>
  );
}