import { Link } from 'react-router-dom';

interface LoginPromptProps {
  title: string;
  description: string;
  loginLabel?: string;
  registerLabel?: string;
}

export default function LoginPrompt({
  title,
  description,
  loginLabel = 'Sign in',
  registerLabel = 'Register',
}: LoginPromptProps) {
  return (
    <div className="py-20 text-center">
      <div className="mb-5">
        <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-secondary-100 flex items-center justify-center">
          <i className="ri-lock-line text-secondary-600 text-xl"></i>
        </div>
        <p className="font-heading text-[20px] font-medium text-foreground-950 mb-1">
          {title}
        </p>
        <p className="text-body-sm text-foreground-500 mb-6">
          {description}
        </p>
      </div>
      <div className="flex items-center justify-center gap-3">
        <Link
          to="/login"
          className="inline-flex items-center px-5 py-2.5 text-sm font-medium bg-primary-500 text-background-50 hover:bg-primary-600 transition-colors duration-200 rounded-xs whitespace-nowrap"
        >
          {loginLabel}
        </Link>
        <Link
          to="/login"
          className="inline-flex items-center px-5 py-2.5 text-sm text-foreground-600 hover:text-foreground-900 transition-colors duration-200 whitespace-nowrap"
        >
          {registerLabel}
        </Link>
      </div>
    </div>
  );
}