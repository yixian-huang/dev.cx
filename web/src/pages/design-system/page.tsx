import { useTranslation } from 'react-i18next';
import PageShell from '@/components/feature/PageShell';

export default function DesignSystemPage() {
  const { t } = useTranslation();

  return (
    <PageShell width="wide">
      <div className="py-16">

        {/* ═══════════════ Philosophy ═══════════════ */}
        <header className="mb-20">
          <p className="text-foreground-400 text-xs tracking-[0.22em] uppercase mb-4">Design System</p>
          <h1 className="font-heading text-display-xl text-foreground-950 mb-5 leading-[1.12]">
            墨与纸
          </h1>
          <p className="font-heading text-heading-lg text-foreground-700 mb-6">
            Ink &amp; Paper
          </p>
          <p className="text-body-lg text-foreground-700 max-w-[560px] leading-relaxed">
            一套为创造者社区而生的编辑式设计语言。以纸张为面，以墨色为骨，以朱砂为神 — 每个像素都在讲述&quot;人在造东西&quot;这件事。
          </p>
        </header>

        {/* ═══════════════ Design Primitives ═══════════════ */}
        <section className="mb-20">
          <p className="text-foreground-400 text-xs tracking-[0.22em] uppercase mb-8">Design Primitives</p>

          <div className="space-y-5">
            <PrimitiveCard
              name="纸 Paper"
              en="Surface as canvas"
              description="页面即纸张。不用阴影、不用卡片抬升、不用圆角 — 章节之间靠色调切换和留白区分层级。一页一章，一章一色带。"
              icon="ri-pages-line"
            />
            <PrimitiveCard
              name="墨 Ink"
              en="Emphasis through depth"
              description="主色如印刷油墨 — 深暖炭色，厚重但不冷。每屏只用一处主色 CTA，面积控制在 5% 以内。用在哪，哪就是唯一焦点。"
              icon="ri-ink-bottle-line"
            />
            <PrimitiveCard
              name="印 Seal"
              en="Distinctive markers"
              description="朱砂红作为点缀色，像书法作品上的印章。用于阶段标签、选中态、极少数的强调时刻。稀有才珍贵。"
              icon="ri-award-line"
            />
            <PrimitiveCard
              name="白 Void"
              en="Breathing room"
              description="留白不是空的 — 是内容之间的呼吸。单列 720px 居中，两端留出足够空间。信息密度低，阅读舒适度高。"
              icon="ri-contrast-line"
            />
            <PrimitiveCard
              name="字 Type"
              en="Typography as hierarchy"
              description="层级完全靠字号、粗细、灰度来建立。不用分割线、不用色块区隔、不用图标装饰 — 字体本身就有足够的表现力。"
              icon="ri-font-size"
            />
            <PrimitiveCard
              name="码 Mono"
              en="Developer texture"
              description="等宽字体用于 @handle、项目路径、类型标签。它是创造者的签名 — 在版面中制造节奏变化，像代码嵌在文章里。"
              icon="ri-code-line"
            />
          </div>
        </section>

        {/* ═══════════════ Color Tokens ═══════════════ */}
        <section className="mb-20">
          <p className="text-foreground-400 text-xs tracking-[0.22em] uppercase mb-8">Color Tokens</p>

          {/* Surface */}
          <div className="mb-10">
            <h2 className="font-heading text-heading-lg text-foreground-950 mb-2">纸 · Surface</h2>
            <p className="text-body-sm text-foreground-600 mb-5">暖色纸张底色，从近乎纯白到深灰，共 10 级</p>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              <ColorSwatch name="50" className="bg-background-50" textColor="text-foreground-900" />
              <ColorSwatch name="100" className="bg-background-100" textColor="text-foreground-900" />
              <ColorSwatch name="200" className="bg-background-200" textColor="text-foreground-900" />
              <ColorSwatch name="300" className="bg-background-300" textColor="text-foreground-900" />
              <ColorSwatch name="400" className="bg-background-400" textColor="text-foreground-900" />
            </div>
          </div>

          {/* Primary — Sumi Ink */}
          <div className="mb-10">
            <h2 className="font-heading text-heading-lg text-foreground-950 mb-2">墨 · Sumi Ink</h2>
            <p className="text-body-sm text-foreground-600 mb-5">深暖炭色。主按钮、活跃导航、链接悬停。每屏仅一处。</p>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-3">
              <ColorSwatch name="50" className="bg-primary-50" textColor="text-primary-900" />
              <ColorSwatch name="100" className="bg-primary-100" textColor="text-primary-900" />
              <ColorSwatch name="200" className="bg-primary-200" textColor="text-primary-900" />
              <ColorSwatch name="500" className="bg-primary-500" textColor="text-background-50" />
              <ColorSwatch name="600" className="bg-primary-600" textColor="text-background-50" />
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center px-2.5 py-1 bg-primary-500 text-background-50 text-xs font-medium rounded-xs whitespace-nowrap">发布</span>
              <span className="text-body-sm text-foreground-500">primary-500 → 主 CTA</span>
            </div>
          </div>

          {/* Accent — Vermilion Seal */}
          <div className="mb-10">
            <h2 className="font-heading text-heading-lg text-foreground-950 mb-2">印 · Vermilion Seal</h2>
            <p className="text-body-sm text-foreground-600 mb-5">朱砂暖红。阶段标签、稀少强调。克制使用，不争不抢。</p>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-3">
              <ColorSwatch name="50" className="bg-accent-50" textColor="text-accent-900" />
              <ColorSwatch name="100" className="bg-accent-100" textColor="text-accent-900" />
              <ColorSwatch name="500" className="bg-accent-500" textColor="text-background-50" />
              <ColorSwatch name="700" className="bg-accent-700" textColor="text-background-50" />
              <ColorSwatch name="900" className="bg-accent-900" textColor="text-background-50" />
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center px-2 py-0.5 text-[11px] font-medium tracking-wide bg-accent-100 text-accent-900 rounded-xs uppercase whitespace-nowrap">Beta</span>
              <span className="inline-flex items-center px-2 py-0.5 text-[11px] font-medium tracking-wide bg-accent-100 text-accent-900 rounded-xs uppercase whitespace-nowrap">Alpha</span>
              <span className="text-body-sm text-foreground-500">accent-100 → 阶段标签</span>
            </div>
          </div>

          {/* Secondary — Rice Paper Gray */}
          <div className="mb-10">
            <h2 className="font-heading text-heading-lg text-foreground-950 mb-2">宣纸 · Rice Paper Gray</h2>
            <p className="text-body-sm text-foreground-600 mb-5">暖灰中性色。标签、筛选、次级操作、卡片底色。</p>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-3">
              <ColorSwatch name="50" className="bg-secondary-50" textColor="text-secondary-900" />
              <ColorSwatch name="100" className="bg-secondary-100" textColor="text-secondary-900" />
              <ColorSwatch name="200" className="bg-secondary-200" textColor="text-secondary-900" />
              <ColorSwatch name="500" className="bg-secondary-500" textColor="text-background-50" />
              <ColorSwatch name="900" className="bg-secondary-900" textColor="text-background-50" />
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center px-2 py-0.5 text-xs bg-secondary-100 text-secondary-900 rounded-xs whitespace-nowrap">Rust</span>
              <span className="inline-flex items-center px-2 py-0.5 text-xs bg-secondary-100 text-secondary-900 rounded-xs whitespace-nowrap">分布式</span>
              <span className="text-body-sm text-foreground-500">secondary-100 → 话题标签</span>
            </div>
          </div>

          {/* Foreground — Ink */}
          <div>
            <h2 className="font-heading text-heading-lg text-foreground-950 mb-2">字 · Ink</h2>
            <p className="text-body-sm text-foreground-600 mb-5">暖黑文字色阶。从最深标题到最浅占位，共 10 级。</p>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              <ColorSwatch name="950" className="bg-foreground-950" textColor="text-background-50" />
              <ColorSwatch name="900" className="bg-foreground-900" textColor="text-background-50" />
              <ColorSwatch name="700" className="bg-foreground-700" textColor="text-background-50" />
              <ColorSwatch name="500" className="bg-foreground-500" textColor="text-background-50" />
              <ColorSwatch name="400" className="bg-foreground-400" textColor="text-foreground-900" />
            </div>
          </div>
        </section>

        {/* ═══════════════ Typography Scale ═══════════════ */}
        <section className="mb-20">
          <p className="text-foreground-400 text-xs tracking-[0.22em] uppercase mb-8">Typography Scale</p>

          <div className="space-y-6">
            <TypeSpec token="display-xl" size="42px" line="1.15" weight="600" font="serif"
              text="在造东西的人"
              note="Masthead 标题，桌面端"
            />
            <TypeSpec token="display-lg" size="32px" line="1.2" weight="600" font="serif"
              text="创造者档案"
              note="区块标题、档案姓名"
            />
            <TypeSpec token="display-md" size="24px" line="1.25" weight="600" font="serif"
              text="Rust 实现的分布式消息队列"
              note="焦点项目标题"
            />
            <TypeSpec token="heading-lg" size="20px" line="1.35" weight="600" font="serif"
              text="本周焦点"
              note="子区块标题"
            />
            <TypeSpec token="heading-md" size="18px" line="1.4" weight="500" font="serif"
              text="TypeScript 类型体操合集"
              note="次要项目标题"
            />
            <TypeSpec token="heading-sm" size="16px" line="1.45" weight="500" font="serif"
              text="从零实现一个微型 React 渲染器"
              note="讨论标题、卡片标题"
            />
            <TypeSpec token="body-lg" size="16px" line="1.7" weight="400" font="sans"
              text="基于 Raft 共识算法的高性能消息队列，支持多副本同步、自动故障转移和水平扩展。已经在生产环境承载日均 1.2 亿条消息。"
              note="正文段落、项目简介"
            />
            <TypeSpec token="body-md" size="14px" line="1.6" weight="400" font="sans"
              text="社区成员本周正在打磨的作品与讨论。"
              note="默认正文、描述文字"
            />
            <TypeSpec token="body-sm" size="13px" line="1.5" weight="400" font="sans"
              text="@zhangmy · Beta · 3 天前"
              note="元信息、时间戳、次要文案"
            />
            <TypeSpec token="label" size="12px" line="1.4" weight="500" font="sans"
              text="FOCUS · 本周焦点"
              note="章节标签、badge、chip"
            />
            <TypeSpec token="mono-md" size="13px" line="1.5" weight="400" font="mono"
              text="@zhangmy / rinq / figma-cjk"
              note="句柄、路径、类型标签"
            />
          </div>
        </section>

        {/* ═══════════════ Spacing Rhythm ═══════════════ */}
        <section className="mb-20">
          <p className="text-foreground-400 text-xs tracking-[0.22em] uppercase mb-8">Spacing Rhythm</p>

          <div className="space-y-5">
            <SpacingBar label="px-4 (16px)" width="w-4" value="移动端内边距" />
            <SpacingBar label="px-6 (24px)" width="w-6" value="桌面端内边距" />
            <SpacingBar label="gap-3 (12px)" width="w-3" value="元素内部间距" />
            <SpacingBar label="gap-6 (24px)" width="w-6" value="列表块间距" />
            <SpacingBar label="py-12 (48px)" width="w-12" value="章节内容间距" />
            <SpacingBar label="py-16 (64px)" width="w-16" value="大区块间距" />
          </div>

          <div className="mt-8 p-4 bg-background-100 rounded-xs border border-background-200/60">
            <p className="text-body-sm text-foreground-600">
              内容列宽：<span className="font-mono text-foreground-900">max-w-[720px]</span>，居中。永远单列。
            </p>
          </div>
        </section>

        {/* ═══════════════ Component Primitives ═══════════════ */}
        <section className="mb-20">
          <p className="text-foreground-400 text-xs tracking-[0.22em] uppercase mb-8">Component Primitives</p>

          <div className="space-y-10">
            {/* Buttons */}
            <div>
              <h3 className="font-heading text-heading-md text-foreground-950 mb-1">Buttons</h3>
              <p className="text-body-sm text-foreground-600 mb-4">每屏只有一个 primary CTA。次级操作用文字链接或 ghost 样式。</p>
              <div className="flex flex-wrap items-center gap-3">
                <button className="inline-flex items-center px-4 py-1.5 text-sm font-medium bg-primary-500 text-background-50 hover:bg-primary-600 transition-colors duration-200 rounded-xs whitespace-nowrap cursor-pointer">
                  发布
                </button>
                <button className="inline-flex items-center px-4 py-1.5 text-sm font-medium bg-accent-100 text-accent-900 hover:bg-accent-200 transition-colors duration-200 rounded-xs whitespace-nowrap cursor-pointer">
                  求反馈
                </button>
                <button className="inline-flex items-center px-3 py-1.5 text-sm text-foreground-600 hover:text-foreground-900 transition-colors duration-200 whitespace-nowrap cursor-pointer">
                  查看全部 →
                </button>
                <button className="inline-flex items-center px-3 py-1.5 text-sm font-medium border border-secondary-300 text-foreground-700 hover:bg-secondary-50 transition-colors duration-200 rounded-xs whitespace-nowrap cursor-pointer">
                  取消
                </button>
              </div>
            </div>

            {/* Stage Badges */}
            <div>
              <h3 className="font-heading text-heading-md text-foreground-950 mb-1">Stage Badges</h3>
              <p className="text-body-sm text-foreground-600 mb-4">项目阶段标识 — 朱砂暖色，低饱和，信息性而非装饰性。</p>
              <div className="flex flex-wrap gap-2">
                <span className="inline-flex items-center px-2 py-0.5 text-[11px] font-medium tracking-wide bg-accent-100 text-accent-900 rounded-xs uppercase whitespace-nowrap">Alpha</span>
                <span className="inline-flex items-center px-2 py-0.5 text-[11px] font-medium tracking-wide bg-accent-100 text-accent-900 rounded-xs uppercase whitespace-nowrap">Beta</span>
                <span className="inline-flex items-center px-2 py-0.5 text-[11px] font-medium tracking-wide bg-accent-100 text-accent-900 rounded-xs uppercase whitespace-nowrap">Active</span>
                <span className="inline-flex items-center px-2 py-0.5 text-[11px] font-medium tracking-wide bg-accent-100 text-accent-900 rounded-xs uppercase whitespace-nowrap">Deprecated</span>
              </div>
            </div>

            {/* Topic Chips */}
            <div>
              <h3 className="font-heading text-heading-md text-foreground-950 mb-1">Topic Chips</h3>
              <p className="text-body-sm text-foreground-600 mb-4">话题标签 — 宣纸灰底色，安静地跟在项目后面。</p>
              <div className="flex flex-wrap gap-2">
                <span className="inline-flex items-center px-2 py-0.5 text-xs bg-secondary-100 text-secondary-900 rounded-xs whitespace-nowrap">Rust</span>
                <span className="inline-flex items-center px-2 py-0.5 text-xs bg-secondary-100 text-secondary-900 rounded-xs whitespace-nowrap">分布式</span>
                <span className="inline-flex items-center px-2 py-0.5 text-xs bg-secondary-100 text-secondary-900 rounded-xs whitespace-nowrap">消息队列</span>
                <span className="inline-flex items-center px-2 py-0.5 text-xs bg-secondary-100 text-secondary-900 rounded-xs whitespace-nowrap">Wasm</span>
                <span className="inline-flex items-center px-2 py-0.5 text-xs bg-secondary-100 text-secondary-900 rounded-xs whitespace-nowrap">React</span>
                <span className="inline-flex items-center px-2 py-0.5 text-xs bg-secondary-100 text-secondary-900 rounded-xs whitespace-nowrap">TypeScript</span>
              </div>
            </div>

            {/* Handles */}
            <div>
              <h3 className="font-heading text-heading-md text-foreground-950 mb-1">Handles &amp; Paths</h3>
              <p className="text-body-sm text-foreground-600 mb-4">等宽字体句柄 — 创造者的签名，版面的节奏变化。</p>
              <div className="flex flex-wrap gap-x-5 gap-y-2">
                <span className="font-mono text-sm text-foreground-600">@zhangmy</span>
                <span className="font-mono text-sm text-foreground-600">rinq</span>
                <span className="font-mono text-sm text-foreground-600">figma-cjk</span>
                <span className="font-mono text-sm text-foreground-600">tiny-react</span>
                <span className="font-mono text-sm text-foreground-600">type-puzzles</span>
              </div>
            </div>

            {/* Chapter Label */}
            <div>
              <h3 className="font-heading text-heading-md text-foreground-950 mb-1">Chapter Label</h3>
              <p className="text-body-sm text-foreground-600 mb-4">大写字母、宽松字距、最浅灰色。不抢内容，只做视觉锚点。</p>
              <p className="text-foreground-400 text-xs tracking-[0.22em] uppercase">Focus · 本周焦点</p>
            </div>

            {/* Type Labels */}
            <div>
              <h3 className="font-heading text-heading-md text-foreground-950 mb-1">Type Labels</h3>
              <p className="text-body-sm text-foreground-600 mb-4">讨论类型标识 — SHOW / BUILD / ASK，等宽字体小号。</p>
              <div className="flex flex-wrap gap-3">
                <span className="font-mono text-xs text-foreground-500 tracking-wide">SHOW</span>
                <span className="font-mono text-xs text-foreground-500 tracking-wide">BUILD</span>
                <span className="font-mono text-xs text-foreground-500 tracking-wide">ASK</span>
              </div>
            </div>
          </div>
        </section>

        {/* ═══════════════ Content Patterns ═══════════════ */}
        <section className="mb-20">
          <p className="text-foreground-400 text-xs tracking-[0.22em] uppercase mb-8">Content Patterns</p>

          <div className="space-y-10">
            {/* Lead Project */}
            <div className="p-6 bg-background-100 rounded-xs border border-background-200/50">
              <p className="text-foreground-400 text-xs tracking-[0.22em] uppercase mb-5">Lead Project Row</p>
              <h3 className="font-heading text-display-md text-foreground-950 mb-3">Rust 实现的分布式消息队列 — Rinq</h3>
              <p className="text-body-lg text-foreground-700 mb-4">
                基于 Raft 共识算法的高性能消息队列，支持多副本同步、自动故障转移和水平扩展。已经在生产环境承载日均 1.2 亿条消息，正在为 1.0 做最后的可靠性测试。
              </p>
              <div className="flex items-center gap-3 text-body-sm text-foreground-600 flex-wrap">
                <span className="font-mono">@zhangmy</span>
                <span className="inline-flex items-center px-2 py-0.5 text-[11px] font-medium tracking-wide bg-accent-100 text-accent-900 rounded-xs uppercase">Beta</span>
                <span className="text-primary-500 font-medium">求反馈</span>
                <span className="text-foreground-300">·</span>
                <span>3 天前</span>
              </div>
            </div>

            {/* Quiet Row */}
            <div className="py-4">
              <p className="text-foreground-400 text-xs tracking-[0.22em] uppercase mb-5">Quiet Project Row</p>
              <h4 className="font-heading text-heading-sm text-foreground-950 mb-1.5">TypeScript 类型体操合集 — type-puzzles</h4>
              <div className="flex items-center gap-3 text-body-sm text-foreground-600 flex-wrap">
                <span className="font-mono">@linxf</span>
                <span className="inline-flex items-center px-2 py-0.5 text-[11px] font-medium tracking-wide bg-accent-100 text-accent-900 rounded-xs uppercase">Active</span>
                <span className="text-foreground-300">·</span>
                <span>5 天前</span>
              </div>
            </div>

            {/* Discussion Row */}
            <div className="py-4">
              <p className="text-foreground-400 text-xs tracking-[0.22em] uppercase mb-5">Discussion Row</p>
              <div className="flex items-start gap-3">
                <span className="font-mono text-xs text-foreground-500 shrink-0 mt-0.5 tracking-wide">SHOW</span>
                <div className="min-w-0">
                  <h4 className="font-heading text-heading-sm text-foreground-950 mb-1">我用 Wasm 给 Figma 写了一个中文排版插件</h4>
                  <div className="flex items-center gap-3 text-body-sm text-foreground-600 flex-wrap">
                    <span className="font-mono">figma-cjk</span>
                    <span className="text-foreground-300">·</span>
                    <span>18 条回复</span>
                    <span className="text-foreground-300">·</span>
                    <span>1 小时前</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Profile Header pattern */}
            <div className="p-6 bg-background-100 rounded-xs border border-background-200/50">
              <p className="text-foreground-400 text-xs tracking-[0.22em] uppercase mb-5">Profile Header</p>
              <div className="flex items-start gap-4">
                <div className="w-14 h-14 rounded-xs bg-secondary-200 shrink-0 flex items-center justify-center">
                  <span className="font-heading text-heading-lg text-foreground-400">Z</span>
                </div>
                <div className="min-w-0">
                  <h3 className="font-heading text-display-lg text-foreground-950 mb-0.5">张明远</h3>
                  <p className="font-mono text-sm text-foreground-600 mb-2">@zhangmy</p>
                  <p className="text-body-md text-foreground-700 max-w-[480px]">
                    全栈工程师，热衷分布式系统和 Rust。目前在做一个开源消息队列 Rinq，欢迎一起讨论。
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ═══════════════ Motion ═══════════════ */}
        <section className="mb-20">
          <p className="text-foreground-400 text-xs tracking-[0.22em] uppercase mb-8">Motion &amp; Animation</p>

          <div className="space-y-4">
            <MotionRow name="color hover" duration="200ms" easing="ease" appliesTo="所有颜色过渡" />
            <MotionRow name="nav background" duration="300ms" easing="ease" appliesTo="导航栏滚动背景切换" />
            <MotionRow name="page enter" duration="350ms" easing="ease-out" appliesTo="页面入场淡入" />
            <MotionRow name="tab switch" duration="150ms" easing="ease-out" appliesTo="Tab 切换颜色" />
            <MotionRow name="content reveal" duration="400ms" easing="ease-out" appliesTo="内容滚动揭示" />
          </div>

          <div className="mt-6 p-4 bg-background-100 rounded-xs border border-background-200/60">
            <p className="text-body-sm text-foreground-600">
              动画原则：内容优先 — 不延迟内容显示。微妙 — 像纸张滑动，不是 UI 弹跳。有目的 — 每个动画引导注意力或标识状态变化。
            </p>
          </div>
        </section>

        {/* ═══════════════ Anti-Patterns ═══════════════ */}
        <section className="mb-20">
          <p className="text-foreground-400 text-xs tracking-[0.22em] uppercase mb-8">Anti-Patterns</p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <AntiPattern reject="1px 边框做分隔" use="留白 + 背景色调切换" />
            <AntiPattern reject="投影抬升卡片" use="平面纸张，靠章节色带区分" />
            <AntiPattern reject="圆角 &gt; 3px" use="rounded-xs (2px) 或 rounded-sm (3px)" />
            <AntiPattern reject="药丸形按钮" use="矩形 2px 圆角" />
            <AntiPattern reject="背景图 + 文字叠加" use="纯色纸张 + 字体对比度" />
            <AntiPattern reject="多个 CTA 抢注意力" use="每屏一处主导操作" />
            <AntiPattern reject="功能图标网格" use="字体层级建立信息架构" />
            <AntiPattern reject="客户评价 / Logo 墙" use="真实项目展示" />
            <AntiPattern reject="导航栏放「关于」" use="仅页脚层级" />
            <AntiPattern reject="10+ 条密集列表" use="≤ 5 条可见，「全部」查看" />
            <AntiPattern reject="纯黑 #000" use="foreground-950" />
            <AntiPattern reject="蓝 / 紫色系点缀" use="暖炭墨色 primary + 朱砂 accent" />
            <AntiPattern reject="毛玻璃 / 模糊效果" use="不透明纯色表面" />
            <AntiPattern reject="暖陶 / 蜂蜜 / 鼠尾草色" use="中性暖纸 + 克制点缀" />
            <AntiPattern reject="卡片悬浮抬升" use="仅文字颜色变化" />
            <AntiPattern reject="「立即体验」类 CTA" use="「发布」「完善主页」等动作导向" />
            <AntiPattern reject="多列网格布局" use="单列 720px 居中" />
            <AntiPattern reject="无意义的装饰图标" use="字体本身的表现力" />
          </div>
        </section>

        {/* ═══════════════ Layout Rules ═══════════════ */}
        <section className="mb-20">
          <p className="text-foreground-400 text-xs tracking-[0.22em] uppercase mb-8">Layout Rules</p>

          <div className="space-y-5">
            <LayoutRule label="内容列" value="max-w-[720px]，居中，永远单列" />
            <LayoutRule label="导航栏高度" value="h-14 (56px)，固定顶部" />
            <LayoutRule label="章节切换" value="chapter-band class：背景色带 + 上下 1px 浅线" />
            <LayoutRule label="桌面内边距" value="px-6 (24px)" />
            <LayoutRule label="移动端内边距" value="px-4 (16px)" />
            <LayoutRule label="桌面端响应" value="≥ 768px — 顶部导航 + 完整内容 + 无底部 Tab" />
            <LayoutRule label="移动端响应" value="&lt; 768px — 底部 Tab 出现 + 内边距收缩" />
            <LayoutRule label="Z-Index" value="导航 50 · 浮层 10 · 内容 0" />
          </div>
        </section>

        {/* ═══════════════ Footer Reference ═══════════════ */}
        <section>
          <p className="text-foreground-400 text-xs tracking-[0.22em] uppercase mb-8">Footer Pattern</p>
          <div className="py-8 text-center bg-background-100 rounded-xs border border-background-200/50">
            <div className="flex items-center justify-center gap-4 text-sm text-foreground-600 mb-3 flex-wrap">
              <a href="#" className="hover:text-foreground-900 transition-colors duration-200 whitespace-nowrap">完善你的创造者主页</a>
              <span className="text-foreground-300">·</span>
              <a href="#" className="hover:text-foreground-900 transition-colors duration-200 whitespace-nowrap">登录 dev.cx</a>
            </div>
            <div className="flex items-center justify-center gap-3 text-xs text-foreground-400 flex-wrap">
              <a href="#" className="hover:text-foreground-700 transition-colors duration-200 whitespace-nowrap">关于</a>
              <span className="text-foreground-300">·</span>
              <a href="#" className="hover:text-foreground-700 transition-colors duration-200 whitespace-nowrap">社区规范</a>
            </div>
          </div>
        </section>

      </div>
    </PageShell>
  );
}

/* ═══════════════ Sub-components ═══════════════ */

function ColorSwatch({ name, className, textColor }: {
  name: string;
  className: string;
  textColor: string;
}) {
  return (
    <div className={`${className} rounded-xs p-3 flex flex-col justify-between min-h-[72px]`}>
      <span className={`text-[10px] font-mono ${textColor} opacity-70`}>{name}</span>
      <span className={`text-[10px] font-mono ${textColor} opacity-45`}>·</span>
    </div>
  );
}

function TypeSpec({ token, size, line, weight, font, text, note }: {
  token: string;
  size: string;
  line: string;
  weight: string;
  font: string;
  text: string;
  note: string;
}) {
  const fontClass = font === 'serif' ? 'font-heading' : font === 'mono' ? 'font-mono' : 'font-body';
  const weightClass = weight === '600' ? 'font-semibold' : weight === '500' ? 'font-medium' : 'font-normal';

  return (
    <div className="flex items-baseline gap-4 py-3 border-b border-background-200/50">
      <div className="w-24 shrink-0">
        <span className="text-xs font-mono text-foreground-400 block">{token}</span>
        <span className="text-[10px] font-mono text-foreground-300 block mt-0.5">{size} / {line} / W{weight}</span>
      </div>
      <div className="flex-1 min-w-0">
        <p className={`${fontClass} ${weightClass} text-foreground-900 truncate`}
          style={{ fontSize: size, lineHeight: line }}
        >
          {text}
        </p>
        <span className="text-xs text-foreground-400 mt-0.5 block">{note}</span>
      </div>
    </div>
  );
}

function SpacingBar({ label, width, value }: {
  label: string;
  width: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-4">
      <div className={`${width} h-4 bg-primary-500/70 rounded-xs shrink-0`} />
      <span className="text-sm font-mono text-foreground-600 w-28 shrink-0">{label}</span>
      <span className="text-sm text-foreground-400">{value}</span>
    </div>
  );
}

function AntiPattern({ reject, use }: { reject: string; use: string }) {
  return (
    <div className="flex items-start gap-3 p-3 bg-background-100 rounded-xs border border-background-200/50">
      <span className="text-accent-500 text-xs shrink-0 mt-0.5 font-mono">✕</span>
      <div className="min-w-0">
        <p className="text-sm text-foreground-600 truncate">{reject}</p>
        <p className="text-xs text-primary-500 mt-0.5">→ {use}</p>
      </div>
    </div>
  );
}

function PrimitiveCard({ name, en, description, icon }: {
  name: string;
  en: string;
  description: string;
  icon: string;
}) {
  return (
    <div className="flex items-start gap-4 p-5 bg-background-100 rounded-xs border border-background-200/50">
      <div className="w-9 h-9 shrink-0 flex items-center justify-center text-foreground-400">
        <i className={`${icon} text-lg`}></i>
      </div>
      <div className="min-w-0">
        <h3 className="font-heading text-heading-sm text-foreground-950 mb-0.5">{name}</h3>
        <p className="text-body-sm text-foreground-500 mb-1">{en}</p>
        <p className="text-body-sm text-foreground-700 leading-relaxed">{description}</p>
      </div>
    </div>
  );
}

function MotionRow({ name, duration, easing, appliesTo }: {
  name: string;
  duration: string;
  easing: string;
  appliesTo: string;
}) {
  return (
    <div className="flex items-center gap-4 py-2 border-b border-background-200/30">
      <span className="font-mono text-sm text-foreground-600 w-32 shrink-0">{name}</span>
      <span className="font-mono text-xs text-foreground-500 w-16 shrink-0">{duration}</span>
      <span className="font-mono text-xs text-foreground-400 w-20 shrink-0">{easing}</span>
      <span className="text-sm text-foreground-600">{appliesTo}</span>
    </div>
  );
}

function LayoutRule({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-4 py-2 border-b border-background-200/30">
      <span className="font-mono text-sm text-foreground-600 w-32 shrink-0">{label}</span>
      <span className="text-sm text-foreground-700">{value}</span>
    </div>
  );
}