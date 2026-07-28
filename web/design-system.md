# dev.cx Design System — Ink & Paper (墨与纸)

> 编辑式沉静 · 纸张质地 · 墨色骨血 · 朱砂点睛
> 适用于创造者社区：人 + 项目 + 讨论

---

## 1. Philosophy

### What This Is
A **live community surface**, not a corporate marketing site. Every screen shows real people, real projects, real discussion. The platform does not pitch itself.

### What It Feels Like
Opening a well-made literary magazine — each page has one clear focus, generous whitespace, and type that commands attention. The surface feels like **ink on paper**: text rests on warm cream sheets, distinguished by tone bands, never floating with shadows.

### Six Design Primitives

1. **纸 Paper** — Surface as canvas. No shadows, no card lift, no rounded corners above 3px. Chapters distinguish themselves through tone shifts and whitespace alone.
2. **墨 Ink** — Emphasis through depth. A warm deep charcoal, like printing ink. One primary CTA per viewport, covering < 5% of surface area. Where it appears, it is the only focus.
3. **印 Seal** — Distinctive markers. A muted vermilion red, like a calligraphy seal stamp. Used for stage badges, selection states, and rare moments of emphasis. Precious because it is rare.
4. **白 Void** — Breathing room. Whitespace is not empty — it is the breathing space between content. Single column, 720px max, centered. Low information density, high reading comfort.
5. **字 Type** — Typography as hierarchy. All visual hierarchy comes from size, weight, and grayscale. No divider lines, no colored blocks, no decorative icons — the type itself has sufficient expressiveness.
6. **码 Mono** — Developer texture. Monospace for @handles, project paths, type labels. It is the developer's signature — creating rhythmic variation in the layout, like code embedded in prose.

### Core Principles

1. **One Focus Per Viewport** — never compete for attention with multiple "loud" elements
2. **Quality Over Noise** — item count limits, not feed dumps
3. **Typography Does the Work** — hierarchy via scale/weight/gray, not chrome
4. **People First** — real profiles and projects, not platform marketing
5. **No Card Walls** — content sits on paper bands, not elevated tile stacks

---

## 2. Color Tokens

### Surface — 纸 (Cream Paper)

| Token | Usage |
|-------|-------|
| **background-50** | Page ground, default canvas |
| **background-100** | Chapter bands, input fields, subtle fills |
| **background-200** | Dividers, disabled surfaces, card borders |

**Rule**: Chapter bands are applied to **entire sections**, never per-item or per-row. One sheet per chapter.

### Primary — 墨 (Sumi Ink)

| Token | Usage |
|-------|-------|
| **primary-500** | **Primary CTA**, active nav, links on hover — ONE per viewport |
| **primary-600** | Hover state on primary buttons |
| **primary-100** | Selection highlight, subtle tinted backgrounds |
| **primary-50** | Barely-there tint, alternate row hover |

Deep warm charcoal with the barest brown undertone. Like quality printing ink on cream paper — authoritative but not cold.

**Rule**: `primary-500` surface area must stay **< 5%** of any viewport. Use it surgically.

### Accent — 印 (Vermilion Seal)

| Token | Usage |
|-------|-------|
| **accent-100** | Stage badge background (Alpha, Beta, Active) |
| **accent-900** | Stage badge text |
| **accent-500** | Secondary emphasis, selection states |

Muted warm red. Like the seal stamp on a calligraphy scroll — distinctive but restrained. Used sparingly for markers.

**Rule**: Stage badges inform without competing. accent-500 used only for selection states and rare emphasis moments.

### Secondary — 宣纸 (Rice Paper Gray)

| Token | Usage |
|-------|-------|
| **secondary-100** | Chip backgrounds, tag fills, card surfaces |
| **secondary-900** | Chip text, tag text |
| **secondary-500** | Filter states, secondary actions |

Soft warm gray — the paper tone between cream and ink. Supporting, never competing.

### Text — 字 (Ink)

| Token | Usage |
|-------|-------|
| **foreground-950** | Headlines, primary text |
| **foreground-900** | Body text, default reading |
| **foreground-700** | Secondary body, meta |
| **foreground-600** | Muted, timestamps, handles |
| **foreground-500** | Placeholder, disabled |
| **foreground-400** | Chapter labels, very muted |
| **foreground-300** | Dividers, separators |

**Rule**: Never use pure black (`#000000`). Always start from `foreground-950`.

---

## 3. Typography

### Font Stack

```css
--font-heading: 'Noto Serif SC', 'Songti SC', 'SimSun', serif;
--font-body: 'Noto Sans SC', 'PingFang SC', 'Microsoft YaHei', sans-serif;
--font-mono: 'JetBrains Mono', 'SF Mono', 'Cascadia Code', monospace;
```

| Role | Font | Weight | Usage |
|------|------|--------|-------|
| **Display** | Noto Serif SC | 600–700 | Page titles, masthead, project names |
| **UI / Body** | Noto Sans SC | 400–500 | Navigation, body text, buttons, labels |
| **Mono** | JetBrains Mono | 400 | `@handles`, paths, `type:` labels, code |

### Type Scale

| Token | Size | Line-Height | Weight | Font | Usage |
|-------|------|-------------|--------|------|-------|
| **display-xl** | 42px | 1.15 | 600 | Serif | Masthead title (desktop) |
| **display-lg** | 32px | 1.2 | 600 | Serif | Section titles, profile name |
| **display-md** | 24px | 1.25 | 600 | Serif | Lead project title |
| **heading-lg** | 20px | 1.35 | 600 | Serif | Subsection titles |
| **heading-md** | 18px | 1.4 | 500 | Serif | Quiet project titles |
| **heading-sm** | 16px | 1.45 | 500 | Serif | Card titles, discussion titles |
| **body-lg** | 16px | 1.7 | 400 | Sans | Body paragraphs, project deck |
| **body-md** | 14px | 1.6 | 400 | Sans | Default body, descriptions |
| **body-sm** | 13px | 1.5 | 400 | Sans | Meta, timestamps, secondary |
| **label** | 12px | 1.4 | 500 | Sans | Chapter labels, badges, chips |
| **mono-md** | 13px | 1.5 | 400 | Mono | `@handles`, paths, type labels |
| **mono-sm** | 12px | 1.4 | 400 | Mono | Code inline, compact handles |

**Chinese-specific**: Line-height stays **≥ 1.5** for all body text (CJK characters need breathing room). Display can tighten to 1.15–1.2.

---

## 4. Spacing Rhythm

### Base Unit: 4px

All spacing is derived from a `4px` base unit. Use multiples of 4.

### Vertical Rhythm

| Context | Padding/Margin | Notes |
|---------|---------------|-------|
| **Section** | `py-16` (64px) | Between major chapters |
| **Chapter inner** | `py-12` (48px) | Within a chapter band |
| **Block gap** | `gap-6` (24px) | Between items in a list |
| **Item internal** | `gap-3` (12px) | Within a single item |
| **Text line** | `leading-relaxed` (1.625) | Body paragraph separation |
| **Tight text** | `leading-snug` (1.375) | Headlines, compact UI |

### Horizontal

| Context | Value | Notes |
|---------|-------|-------|
| **Content max-width** | `max-w-[720px]` | Single column, centered |
| **Page padding** | `px-6` (24px) | Desktop side gutters |
| **Mobile padding** | `px-4` (16px) | Mobile side gutters |
| **Nav height** | `h-14` (56px) | Fixed top nav |
| **Mobile tab height** | `h-14` (56px) | Fixed bottom nav |

**Rule**: Content area is always **single column**, ~640–720px max. No sidebars, no multi-column grids for primary content.

---

## 5. Component Primitives

### 5.1 Buttons

**Primary CTA**
```
bg-primary-500 text-background-50
hover:bg-primary-600
px-4 py-1.5 text-sm font-medium
rounded-xs (2px)
```

**Secondary / Subtle**
```
bg-accent-100 text-accent-900
hover:bg-accent-200
px-4 py-1.5 text-sm font-medium
rounded-xs (2px)
```

**Text Link**
```
text-foreground-600 hover:text-foreground-900
px-3 py-1.5 text-sm
```

**Outlined**
```
border border-secondary-300 text-foreground-700
hover:bg-secondary-50
px-3 py-1.5 text-sm font-medium
rounded-xs (2px)
```

**Rule**: Only ONE primary CTA per viewport. `rounded-xs` (2px) — never pills.

### 5.2 Navigation Links

**Active**
```
text-primary-500 font-medium
```

**Inactive**
```
text-foreground-600 hover:text-foreground-900
```

**Hover behavior**: Text color shift only. No background wash, no underline animation, no border-bottom.

### 5.3 Stage Badges

```
bg-accent-100 text-accent-900
px-2 py-0.5 text-[11px] font-medium tracking-wide uppercase
rounded-xs (2px)
```

Examples: `ALPHA`, `BETA`, `ACTIVE`, `DEPRECATED`

**Rule**: Vermilion seal tone — warm, muted, informative, never loud.

### 5.4 Topic Chips / Tags

```
bg-secondary-100 text-secondary-900
px-2 py-0.5 text-xs
rounded-xs (2px)
```

Examples: `Rust`, `分布式`, `消息队列`

### 5.5 Handles / Mono Labels

```
font-mono text-foreground-600 text-sm
```

Examples: `@zhangmy`, `figma-cjk`, `tiny-react`

### 5.6 Chapter Labels

```
text-foreground-400 text-xs tracking-[0.22em] uppercase
```

Examples: `Focus · 本周焦点`, `Discussion`

### 5.7 Type Labels

```
font-mono text-xs text-foreground-500 tracking-wide
```

Examples: `SHOW`, `BUILD`, `ASK`

---

## 6. Component Patterns

### 6.1 Navbar (Global Shell)

**Desktop**
```
Fixed top, z-50
bg-transparent → bg-background-50 (on scroll > 16px)
max-w-[720px] mx-auto px-6 h-14
Flex: [wordmark] [nav links] [search + actions + avatar/bell]
```

Nav links: `发现` · `最新` (center)
Actions right: `🔍` · `发布` (primary) · `登录`/`加入` (guest) or `🔔` · `👤` (authed)

**Mobile**
```
Fixed bottom, z-50
bg-background-50
h-14 flex justify-around
Tabs: 发现 | 最新 | ＋ | 通知 | 我
```

**Rule**: No "首页", no "关于" in primary nav. About is footer-level only.

### 6.2 Masthead (Page Title Zone)

The **only loud type zone** on a page. Still short.

```
Week kicker: text-foreground-400 text-xs tracking-[0.22em]
Title: text-display-xl (serif, 42px, 600)
Deck line: text-body-md (sans, 14px, 400, foreground-700) — ONE line max
```

**Rule**: No background image, no gradient, no centered brand logo. Left-aligned, type-only.

### 6.3 Lead Project Row

The single "loud" item in a chapter.

```
Project name: text-display-md (serif, 24px, 600)
Deck: text-body-lg (sans, 16px, 400, foreground-700) — 2–3 lines
Meta line: @handle · Stage badge · feedback chip · timestamp
Topic chips: inline, below or right-aligned
```

### 6.4 Quiet Project Row

Supporting items. Typographic only.

```
Project name: text-heading-sm (serif, 16px, 500)
Meta line: @handle · Stage badge · timestamp
No deck text. No card container.
```

### 6.5 Discussion Row

```
Type label (mono): text-xs text-foreground-500 — SHOW / BUILD / ASK
Title: text-heading-sm (serif, 16px, 500)
Meta: project-path (mono) · reply count · timestamp
```

### 6.6 Profile Header

The person is the only loud block.

```
Name: text-display-lg (serif, 32px, 600)
Handle: text-mono-md (mono, 13px, 400)
Bio: text-body-md (sans, 14px, 400, foreground-700) — 2 lines max
Links: text-sm, inline, separated by ·
```

### 6.7 Footer

```
py-8
Text-centered or left-aligned
Participation CTAs: 完善主页 · 登录
Secondary links (tiny, muted): 关于 · 社区规范
```

**Rule**: No brand manifesto. No 5-column link grid. No newsletter signup. Single line, participation-focused.

---

## 7. Motion & Animation

### Principles

1. **Content-first**: Animations must not delay content display
2. **Subtle**: Movement should feel like paper sliding, not UI springing
3. **Purposeful**: Every animation guides attention or signals state change

### Standard Transitions

| Context | Duration | Easing | Property |
|---------|----------|--------|----------|
| Color hover | 200ms | ease | color, background-color |
| Nav background | 300ms | ease | background-color |
| Page enter | 350ms | ease-out | opacity, transform |
| Tab switch | 150ms | ease-out | color |
| Content reveal | 400ms | ease-out | opacity, transform |

### Scroll Behaviors

- **Navbar**: Background transitions `transparent → solid` at `scrollY > 16px`
- **Content fade-in**: On first paint, content fades from `opacity: 0` to `1` over 300ms
- **No parallax, no sticky sidebars, no floating elements**

---

## 8. Layout Rules

### Single Column

All primary content sits in a single column, centered, `max-w-[720px]`.

### Responsive

| Breakpoint | Behavior |
|------------|----------|
| **≥ 768px (md)** | Desktop layout: top nav, full content width, no bottom tabs |
| **< 768px** | Mobile layout: bottom tabs appear, content padding reduces to `px-4` |

### Z-Index Hierarchy

| Layer | z-index | Element |
|-------|---------|---------|
| 1 | 10 | Content overlays, dropdowns |
| 2 | 50 | Fixed nav (top + bottom) |

---

## 9. Anti-Patterns (What NOT to Do)

| ❌ Reject | ✅ Use Instead |
|-----------|--------------|
| 1px borders for layout separation | Spacing + background tone shifts |
| Drop-shadow elevated cards | Flat paper on chapter bands |
| Rounded corners > 3px | `rounded-xs` (2px) or `rounded-sm` (3px) |
| Pill-shaped buttons | Rectangular with 2px radius |
| Background images behind text | Solid paper tones + type contrast |
| Multi-CTA marketing blocks | One primary action per viewport |
| Feature grid with icons | Typographic hierarchy |
| Testimonials / social proof | Real project showcase |
| "About" as primary nav item | Footer-level only |
| Dense 10+ item lists | ≤ 5 items visible, "全部" for more |
| Pure black (#000) | foreground-950 |
| Blue/purple accents | Warm charcoal primary + vermilion accent |
| Glassmorphism / blur | Solid opaque surfaces |
| Terracotta / honey / sage palette | Neutral warm paper + restrained accent |
| Animated underline nav | Color shift only |
| Card hover lift (shadow) | Text color shift or subtle wash |
| "立即体验" / "了解产品" CTAs | "发布" / "完善主页" / "登录" |
| Multi-column grid layouts | Single column, 720px max-width |
| Decorative icons for decoration's sake | Type expressiveness |

---

## 10. Token Quick Reference

```css
/* Surface — 纸 */
bg-background-50    /* Page ground */
bg-background-100   /* Chapter band, input fields */

/* Primary — 墨 (Sumi Ink) */
bg-primary-500      /* Primary CTA — ONE per viewport */
hover:bg-primary-600
text-primary-500    /* Active nav, links */
bg-primary-50       /* Subtle tint */
bg-primary-100      /* Selection */

/* Accent — 印 (Vermilion Seal) */
bg-accent-100 text-accent-900    /* Stage badges */
bg-accent-500                    /* Selection states (rare) */

/* Secondary — 宣纸 (Rice Paper Gray) */
bg-secondary-100 text-secondary-900  /* Topic chips */
bg-secondary-50                      /* Card surfaces */

/* Text — 字 (Ink) */
text-foreground-950  /* Headlines */
text-foreground-900  /* Body */
text-foreground-700  /* Secondary */
text-foreground-600  /* Meta, handles */
text-foreground-500  /* Placeholder */
text-foreground-400  /* Chapter labels */
text-foreground-300  /* Dividers */

/* Typography */
font-heading       /* Serif: titles, headings */
font-body          /* Sans: body text, UI */
font-mono          /* Mono: handles, paths, type labels */

/* Spacing */
max-w-[720px]      /* Content column */
px-6               /* Desktop gutters */
px-4               /* Mobile gutters */
py-16              /* Section spacing */
gap-6              /* Block gap */
gap-3              /* Item internal */
```

---

## 11. C3 视觉细化增补(2026-07-27,依据 design_handoff_devcx_visual_refresh)

### 品牌印章(朱砂方章)
- 印章 = CSS 方块:`bg-accent-500 text-accent-50 rounded-xs -rotate-6` + mono 600 "cx";禁 SVG(favicon 除外,favicon 不旋转)。
- 尺寸档:24px(导航/页脚签章)、30–34px(登录页/成功态)、描边小章(W{n} 章记:border accent-500/55 + mono 10px)。
- **朱砂预算(每屏)**:印章 ≤2(导航+页脚);章记 ≤1;状态点只留「求反馈」「未读」两种;选中态=墨点/朱砂下划线(仅筛选器类控件);热门=mono 编号转 accent 色,不加红点。
- `seal-stamp` 盖章动画只用于「确认时刻」(发布成功/创建成功/关注成功),一次一枚。

### 命名与排印
- UI 文案层「项目」→「产品」(代码标识符、路由 `/p/`、API 字段不动);编辑性场景(周刊/焦点)可用「作品」。
- 章节 kicker 统一:mono 11px / letter-spacing 0.24em / fg-400(ChapterLabel)。
- display 级衬线字重统一 600(禁 font-bold);`body { font-variant-numeric: tabular-nums }`。
- 头像一律方形 `rounded-xs`(2px);无头像渲染中性占位块,不渲染破图。
- dot-leaders opacity 0.3;列表行式 = 类型 mono 列(66px 讨论 / 44px 通知)+ serif 标题 + dot leaders + mono 计数。

### 暗色主题(墨纸反转)
- 冷灰 hue 260 全部替换为暖炭轴:background/foreground hue 80–88、accent hue 25(`--accent-500: 0.55 0.12 25`)。
- primary CTA 反转:米白底 `oklch(0.93 0.006 88)` + 炭字(`bg-primary-500 text-background-50` 组合在暗色下自动成立,组件不用改)。
- light/warm 主题不动;三主题结构不变,只换值。

*Last updated: 2026.07.27*
*Design language: Ink & Paper (墨与纸)*