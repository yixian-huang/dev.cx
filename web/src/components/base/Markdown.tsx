import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';

export type { Components };

/* 共享 Markdown 渲染 —— 编辑器预览(MarkdownEditor)与阅读页(帖子/回复/产品/主页)共用
   同一套排版映射,保证「预览所见即发布所得」。
   字号/行高/正文色一律继承外层容器(各阅读场景自带排版基调:帖子 16px、回复 15px、
   楼中楼 13.5px…),只有标题、代码块、表格等结构性元素带绝对尺寸。 */

const proseComponents: Components = {
  h1: ({ children }) => (
    <h1 className="text-[22px] font-heading font-semibold text-foreground-950 mt-6 first:mt-0 mb-3 leading-tight">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="text-[18px] font-heading font-semibold text-foreground-900 mt-5 first:mt-0 mb-2 leading-tight">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="text-[15px] font-heading font-semibold text-foreground-800 mt-4 first:mt-0 mb-1.5 leading-tight">{children}</h3>
  ),
  p: ({ children }) => <p className="mb-3 last:mb-0">{children}</p>,
  ul: ({ children }) => <ul className="list-disc list-inside space-y-1 mb-3 last:mb-0">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal list-inside space-y-1 mb-3 last:mb-0">{children}</ol>,
  blockquote: ({ children }) => (
    <blockquote className="border-l-[3px] border-primary-300 pl-4 my-3 text-foreground-600 italic">{children}</blockquote>
  ),
  pre: ({ children }) => (
    <pre className="bg-background-100 text-foreground-800 p-4 rounded-md text-[13px] font-mono overflow-x-auto my-3 leading-relaxed">{children}</pre>
  ),
  code: ({ className, children }) => {
    // react-markdown v9 不再传 inline 标记:带 language- 类名或含换行的视为块级
    // (外层 pre 已承担块级样式),其余按行内 code 渲染。
    const isBlock = Boolean(className) || String(children ?? '').includes('\n');
    if (isBlock) {
      return <code className={className}>{children}</code>;
    }
    return (
      <code className="bg-background-100 text-foreground-800 px-1.5 py-0.5 rounded-xs text-[0.9em] font-mono">{children}</code>
    );
  },
  a: ({ children, href }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-primary-600 underline decoration-primary-300 hover:decoration-primary-500 transition-colors"
    >
      {children}
    </a>
  ),
  img: ({ src, alt }) => (
    <img src={typeof src === 'string' ? src : undefined} alt={alt} className="rounded-md max-w-full my-3" />
  ),
  table: ({ children }) => (
    <div className="overflow-x-auto my-3">
      <table className="w-full text-[13px] border-collapse">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border border-background-200 px-3 py-1.5 text-left font-medium text-foreground-800 bg-background-100">{children}</th>
  ),
  td: ({ children }) => (
    <td className="border border-background-200 px-3 py-1.5 text-foreground-700">{children}</td>
  ),
  hr: () => <hr className="my-5 border-background-200" />,
  strong: ({ children }) => <strong className="font-semibold text-foreground-900">{children}</strong>,
};

/* inline 变体:bio/周状态这类小字段。只保留行内格式和列表,标题/图片/表格/代码块
   降级为纯文本(unwrapDisallowed)——一段 hero 里冒出 H1 或大图会把版式炸掉。 */

const inlineComponents: Components = {
  p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
  ul: ({ children }) => <ul className="list-disc list-inside space-y-0.5 mb-2 last:mb-0">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal list-inside space-y-0.5 mb-2 last:mb-0">{children}</ol>,
  code: ({ children }) => (
    <code className="bg-background-100 text-foreground-800 px-1.5 py-0.5 rounded-xs text-[0.9em] font-mono">{children}</code>
  ),
  a: ({ children, href }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-primary-600 underline decoration-primary-300 hover:decoration-primary-500 transition-colors"
    >
      {children}
    </a>
  ),
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
};

const INLINE_ALLOWED = ['p', 'br', 'strong', 'em', 'del', 'a', 'code', 'ul', 'ol', 'li'];

interface MarkdownProps {
  children: string;
  variant?: 'prose' | 'inline';
  /** 局部排版覆写(如帖子正文更宽的段距),浅合并在基础映射之上。 */
  components?: Components;
}

export default function Markdown({ children, variant = 'prose', components }: MarkdownProps) {
  const base = variant === 'inline' ? inlineComponents : proseComponents;
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={components ? { ...base, ...components } : base}
      allowedElements={variant === 'inline' ? INLINE_ALLOWED : undefined}
      unwrapDisallowed={variant === 'inline'}
    >
      {children}
    </ReactMarkdown>
  );
}
