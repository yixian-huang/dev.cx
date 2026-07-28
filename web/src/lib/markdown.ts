/* 摘要场景用:把 Markdown 源码降为纯文本再截断,避免卡片上露出 `##`/`![](…)` 这类语法。
   只做正则近似(链接留文字、图片整个丢弃、去标记符),不追求完整解析——摘要截 140 字,
   偏差可接受。 */
export function stripMarkdown(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*>\s?/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/[*_~`]+/g, '')
    .replace(/\n{2,}/g, '\n')
    .trim();
}
