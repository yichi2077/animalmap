# 澳洲野生动物时空图谱 — PRD v3.2
> **面向 Claude Code 的完整可执行开发文档**
> 更新：2026-04-01 | 基于：当前仓库代码 + 三轮专家评审综合
>
> **核心策略：以当前可运行 demo 为唯一基线，增量演进至可发布状态。不重写，不新建后端，不引入在线数据依赖。**

---

## 目录

1. [项目现实基线](#1-项目现实基线)
2. [设计系统规范](#2-设计系统规范)
3. [数据结构扩充](#3-数据结构扩充)
4. [工具脚本](#4-工具脚本)
5. [媒体 Fallback 系统](#5-媒体-fallback-系统)
6. [移动端适配](#6-移动端适配)
7. [内容可信度系统](#7-内容可信度系统)
8. [容错与降级](#8-容错与降级)
9. [Intro 与首屏协同](#9-intro-与首屏协同)
10. [验收标准清单](#10-验收标准清单)
11. [增强轨边界定义](#11-增强轨边界定义)
12. [文件变更清单](#12-文件变更清单)

---

## 1. 项目现实基线

### 1.1 当前已可工作的能力

执行前必须理解，以下内容已在仓库中正常运行，**不得重写**：

| 文件 | 当前状态 | 处理方式 |
|---|---|---|
| `app/page.tsx` | ✅ 正常 | 不改动 |
| `components/MapStage.tsx` | ✅ 正常 | 不改动 |
| `components/AustraliaMap.tsx` | ✅ 正常 | 小改：加 WebGL 检测、超时提示、移动端热区 |
| `components/InfoPanel.tsx` | ✅ 正常 | 重构：加 Drawer、Fallback、Attribution、Evidence |
| `components/TopOverlay.tsx` | ✅ 正常 | 小改：移动端尺寸、推断层提示 |
| `components/TimelineBar.tsx` | ✅ 正常 | 小改：移动端触碰热区 |
| `components/IntroSequence.tsx` | ✅ 正常 | 小改：跳过按钮移动端位置 |
| `components/Legend.tsx` | ✅ 正常 | 不改动 |
| `contexts/AtlasContext.tsx` | ✅ 正常 | 仅追加字段，不重构 |
| `lib/interpolate.ts` | ✅ 正常 | 不改动 |
| `lib/map-style.ts` | ✅ 正常 | 不改动 |
| `lib/constants.ts` | ✅ 正常 | 不改动 |
| `lib/species-ui.ts` | ✅ 正常 | 不改动 |
| `data/species.json` | ⚠️ 需扩充字段 | 追加新字段，不删除现有字段 |
| `data/timeline.json` | ⚠️ 需扩充字段 | 追加 `evidenceType`，不修改现有字段 |
| `data/audio.json` | ⚠️ 需扩充字段 | 追加 `attribution`、`license`、`availability` |
| `data/regions.json` | ✅ 正常 | 不改动 |
| `data/geo/australian-states.min.json` | ✅ 正常 | 不改动 |
| `.env.example` | ✅ 已存在 | 补充中文注释 |
| `public/assets/species/` | 🔴 空目录 | 建立 Fallback 系统，空目录不阻断运行 |
| `public/assets/audio/` | 🔴 空目录 | 建立 Fallback 系统，空目录不阻断运行 |

### 1.2 工程当前健康状态

```
npm run build → 通过
npm run lint  → 通过
首屏 JS 体积  → ~504 kB first load（正常范围）
```

### 1.3 当前最大风险

不是代码问题，是**资产与发布闭环**问题：
- `species.json` 中所有 `/assets/species/*.svg` 和 `*.jpg` 路径指向的文件不存在
- `audio.json` 中所有 `/assets/audio/*.mp3` 路径指向的文件不存在
- 用户看到的是 broken image + 无法播放的音频

所有改动的出发点是解决这个根本问题。

### 1.4 执行阶段与顺序

```
Phase 1 → 数据结构扩充 + 验证脚本
Phase 2 → 媒体 Fallback 系统（核心）
Phase 3 → 移动端适配
Phase 4 → 内容可信度系统
Phase 5 → 容错与降级
Phase 6 → Intro 与首屏协同 + 动画打磨
Phase 7 → 发布验收
```

**每个 Phase 完成后运行以下检查，全部通过后才进入下一 Phase：**
```bash
npm run build
npm run lint
```

### 1.5 绝对禁止事项

- 不推倒重来，不重写已正常工作的模块
- 不新建 `app/api/*` 路由（主轨无后端）
- 不引入 Redux / Zustand
- 不引入 CSS-in-JS
- 不实现 `hooks/useALASpecies.ts`（增强轨）
- 不实现运行时 LLM（增强轨）
- 不扩展到 100+ 种物种（增强轨）
- 媒体文件缺失时，不允许出现 broken image / broken audio 裸露状态

---

## 2. 设计系统规范

### 2.1 CSS 变量完整表

以下变量均已在 `app/globals.css` 中定义。**所有新增组件必须使用这些变量，禁止硬编码颜色值。**

```css
/* ── 背景与表面 ── */
--parchment: #fdf8f0           /* 主背景色 */
--parchment-dark: #f0e6d3      /* 次级背景 / 按钮背景 */
--sand: #f7f0e3                /* 输入框 / 卡片轻背景 */

/* ── 文字 ── */
--text-primary: #3d2e1e        /* 主要文字 */
--text-secondary: #6b5740      /* 次要文字 */
--warm-gray: #9a8572           /* 辅助文字 / 标签 / 时间戳 */
--earth: #7a6b52               /* 中性强调 / icon */
--earth-deep: #4a3728          /* 深色标题 / 强调 */
--earth-light: #b8a88a         /* 浅色强调 / 链接 */

/* ── 品牌功能色 ── */
--coral: #e08a58               /* 时间轴 / 播放按钮 / CTA */
--coral-light: #fce8de         /* coral 背景色 */
--leaf: #7da56c                /* 无危状态 / 正向信号 */
--ocean: #9ec3d8               /* 海洋 / 水域 */
--mint: #64ba9c                /* 恢复中状态 */
--sky: #6cb3d9                 /* 辅助蓝 */

/* ── 边框 ── */
--line-soft: rgba(170,146,112,0.18)
--line-strong: rgba(170,146,112,0.32)

/* ── 阴影 ── */
--shadow-soft: 0 4px 20px rgba(122,107,82,0.10)
--shadow-warm: 0 8px 32px rgba(122,107,82,0.15)
--shadow-panel: 0 12px 40px rgba(122,107,82,0.12)
--shadow-float: 0 24px 48px rgba(94,74,47,0.10)
```

### 2.2 间距规范

| 用途 | Tailwind 类 | 像素 |
|---|---|---|
| 面板横向内边距 | `px-5` | 20px |
| 面板纵向内边距 | `py-4` | 16px |
| 卡片横向内边距 | `px-3.5` | 14px |
| 卡片纵向内边距 | `py-3` | 12px |
| 列表项间距 | `space-y-3` | 12px |
| 行内元素间距 | `gap-2.5` | 10px |
| 正文行高 | `leading-6` | 24px |
| 小字行高 | `leading-relaxed` | 1.625 |

### 2.3 圆角规范

| 用途 | 值 |
|---|---|
| 主面板 / Drawer 顶部 | `2rem`（32px）|
| 卡片块 / 子面板 | `1.5rem`（24px）|
| 小卡片 / 内嵌块 | `1rem`（16px）|
| 按钮 / 胶囊标签 | `999px` |
| 图标容器 | `1.35rem`（22px）|
| 图标背景圆 | `rounded-[1.35rem]` |

### 2.4 Framer Motion 动画参数

**所有新增动画必须使用以下参数之一，不得自行发明。**

```typescript
// ① 面板弹入（spring）— 用于 InfoPanel、Drawer 出现
export const SPRING_PANEL = {
  type: "spring" as const,
  stiffness: 280,
  damping: 26,
  mass: 0.8,
}

// ② 内容切换（ease）— 用于面板内容状态切换
export const EASE_CONTENT = {
  duration: 0.28,
  ease: [0.22, 1, 0.36, 1] as [number,number,number,number],
}

// ③ 淡入（fade in）— 用于元素出现
export const EASE_FADE_IN = {
  duration: 0.32,
  ease: [0.22, 1, 0.36, 1] as [number,number,number,number],
}

// ④ 淡出（fade out）— 用于元素消失
export const EASE_FADE_OUT = {
  duration: 0.20,
  ease: [0.4, 0, 1, 1] as [number,number,number,number],
}

// ⑤ Drawer 滑入（spring）— 用于移动端抽屉
export const SPRING_DRAWER = {
  type: "spring" as const,
  stiffness: 320,
  damping: 30,
  mass: 0.9,
}

// ⑥ 骨架屏 — 使用 Tailwind `animate-pulse`，不自定义
```

**`useReducedMotion` 统一处理模板：**

```typescript
// 每个有动画的组件顶部加这一行
const shouldReduceMotion = useReducedMotion()

// 使用时：
const transition = shouldReduceMotion ? { duration: 0 } : SPRING_PANEL
```

### 2.5 字体规范

```
标题 / 物种名 / 年份大数字：font-display → Noto Serif SC
正文 / 界面文字：           默认（Noto Sans SC）
装饰手写（仅限 Intro）：    font-hand → Ma Shan Zheng
```

### 2.6 物种分组颜色对照

现有 `GROUP_ICON_PATHS` 中的分组与颜色对应关系（Fallback 使用）：

```typescript
// 与 species.json 中 group 字段对应
export const GROUP_COLORS: Record<string, string> = {
  extinct:    '#8a7e6d',   // 灰棕 — 幽灵感
  endangered: '#78acc8',   // 蓝灰 — 脆弱感
  native:     '#7da56c',   // 草绿 — 生命力
  invasive:   '#c97040',   // 橙棕 — 扩张感
  marine:     '#6cb3d9',   // 海蓝 — 海洋感
}
```

### 2.7 禁止使用的视觉方向

- 深蓝 / 纯黑 / 赛博感配色
- 毛玻璃效果（backdrop-filter: blur 用于信息层时需谨慎）
- 高饱和度 / 荧光色
- 数据大屏式扁平图标
- 密集散点图式信息布局
- 任何 emoji 字符

---

## 3. 数据结构扩充

### 3.1 `species.json` — 新增字段规范

在现有每条记录的末尾**追加**以下字段。现有字段（`id`、`nameZh`、`color`、`geoPoint` 等）**一律不改动、不删除**。

```typescript
// 新增字段的 TypeScript 类型
interface SpeciesNewFields {
  // 资产准备状态 — 控制 Fallback 逻辑
  assetStatus: 'placeholder' | 'partial' | 'complete'
  // placeholder = 无任何媒体文件，使用纯色 icon fallback
  // partial     = 部分文件存在（如只有插图，无照片）
  // complete    = illustration + photo + audio 均已准备好

  // 可信来源 — 法律归因要求
  sources: Array<{
    label: string   // 来源名称，如 "IUCN Red List"
    url:   string   // 来源 URL，必须是 https:// 开头的真实链接
  }>

  // 内容审核状态
  reviewStatus: 'draft' | 'reviewed' | 'approved'

  // 趣味事实（可选，有则展示，无则回退到 story 字段）
  funFacts?: string[]         // 3 条，每条 ≤ 60 字

  // 沉浸叙事（可选，有则展示，无则回退到 story 字段）
  storyNarrative?: string     // ≤ 250 字，用第二人称"你"，有画面感

  // 关键年份叙事（可选，有则在 InfoPanel 时间层中显示）
  timelineNarratives?: {
    '1770'?: string   // ≤ 40 字
    '1788'?: string
    '1900'?: string
    '1935'?: string
    '1950'?: string
    '2024'?: string
  }
}
```

**18 种核心物种的初始值策略：**

| 字段 | 初始值 | 原因 |
|---|---|---|
| `assetStatus` | `"placeholder"` | 媒体文件尚未准备 |
| `reviewStatus` | `"draft"` | 内容未经审核 |
| `sources` | 至少填 1 条 ALA 链接 | 法律归因要求 |
| `funFacts` | `[]` | 待填充 |
| `storyNarrative` | `""` | 待填充，系统会回退到 `story` |
| `timelineNarratives` | `{}` | 待填充 |

**每个物种的 ALA 来源链接格式：**

```
https://bie.ala.org.au/species/{scientificName URL编码}
```

例如考拉：`https://bie.ala.org.au/species/Phascolarctos%20cinereus`

**完整示例（koala 条目末尾追加）：**

```json
{
  "id": "koala",
  "nameZh": "树袋熊",
  "...（现有字段不变）...": "...",
  "assetStatus": "placeholder",
  "reviewStatus": "draft",
  "sources": [
    {
      "label": "ALA — Phascolarctos cinereus",
      "url": "https://bie.ala.org.au/species/Phascolarctos%20cinereus"
    },
    {
      "label": "IUCN Red List — Koala",
      "url": "https://www.iucnredlist.org/species/16892/21960344"
    }
  ],
  "funFacts": [],
  "storyNarrative": "",
  "timelineNarratives": {}
}
```

### 3.2 `audio.json` — 新增字段规范

在现有每个物种的音频对象中**追加**以下字段：

```typescript
interface AudioNewFields {
  attribution: string
  // 归因文本。真实录音：录音者/来源/许可证
  // AI 模拟："AI 模拟 · 非真实录音 · 仅供科普体验"
  // 未准备："音频资料收集中"

  license: string
  // 许可证文本，如 "CC BY 4.0"、"CC0"、"AI 模拟 · 非真实录音"

  sourceUrl: string
  // 来源链接，AI 模拟或未准备时填 "" 空字符串

  availability: 'available' | 'missing' | 'ai_simulated'
  // available    = 文件存在，可播放
  // missing      = 文件尚未准备，显示"暂无音频"提示
  // ai_simulated = AI 模拟，必须显示警示标签
}
```

**18 种物种的初始 availability 赋值规则：**

```
thylacine          → "ai_simulated"
pig_footed_bandicoot → "ai_simulated"
great_white_shark  → "ai_simulated"（鲨鱼本身不发声，为环境模拟）
green_sea_turtle   → "ai_simulated"
其余 14 种          → "missing"（真实录音文件尚未下载）
```

**完整示例：**

```json
{
  "koala": {
    "src": "/assets/audio/koala.mp3",
    "type": "real",
    "label": "真实录音",
    "description": "考拉的低沉吼叫声，通常在繁殖季节发出",
    "attribution": "来源待确认（目标：xeno-canto 或 freesound CC 授权录音）",
    "license": "待确认",
    "sourceUrl": "",
    "availability": "missing"
  },
  "thylacine": {
    "src": "/assets/audio/thylacine.mp3",
    "type": "ai_simulated",
    "label": "AI 模拟 · 非真实历史录音",
    "description": "基于近缘物种声学特征的 AI 推测性模拟",
    "attribution": "AI 模拟 · 非真实历史录音 · 仅供科普体验",
    "license": "AI 模拟 · 非真实录音",
    "sourceUrl": "",
    "availability": "ai_simulated"
  }
}
```

### 3.3 `timeline.json` — 新增 `evidenceType` 字段

在每个物种的每个关键帧对象上追加 `evidenceType` 字段：

```typescript
type EvidenceType = 'inferred' | 'historical' | 'contemporary'
// inferred     = 推断层：year ≤ 1788，无直接记录，基于生态推断
// historical   = 历史层：1788 < year < 2000，有历史文献支持
// contemporary = 当代层：year ≥ 2000，有当代调查数据
```

**赋值规则（自动化脚本处理）：**

```
year ≤ 1788  → evidenceType: "inferred"
year < 2000  → evidenceType: "historical"
year ≥ 2000  → evidenceType: "contemporary"
```

**示例：**

```json
{
  "koala": [
    {
      "year": 1770,
      "populationScore": 1.0,
      "distributionType": "stable",
      "narrative": "殖民者到来前，考拉遍布澳大利亚东部桉树林",
      "evidenceType": "inferred"
    },
    {
      "year": 1900,
      "populationScore": 0.4,
      "distributionType": "contraction",
      "narrative": "皮毛贸易导致种群大幅减少",
      "evidenceType": "historical"
    },
    {
      "year": 2024,
      "populationScore": 0.25,
      "distributionType": "contraction",
      "narrative": "2022 年正式列为濒危物种，野火威胁持续",
      "evidenceType": "contemporary"
    }
  ]
}
```

---

## 4. 工具脚本

### 4.1 `scripts/add-evidence-types.mjs`

自动给 `timeline.json` 所有关键帧补充 `evidenceType`：

```javascript
// scripts/add-evidence-types.mjs
import fs from 'node:fs/promises'

const raw = await fs.readFile('data/timeline.json', 'utf8')
const timeline = JSON.parse(raw)
let count = 0

for (const frames of Object.values(timeline)) {
  for (const frame of frames) {
    if (!frame.evidenceType) {
      if (frame.year <= 1788) frame.evidenceType = 'inferred'
      else if (frame.year < 2000) frame.evidenceType = 'historical'
      else frame.evidenceType = 'contemporary'
      count++
    }
  }
}

await fs.writeFile('data/timeline.json', JSON.stringify(timeline, null, 2))
console.log(`✓ 已为 ${count} 个关键帧补充 evidenceType`)
```

### 4.2 `scripts/validate-assets.mjs`

检查 `species.json` 和 `audio.json` 中引用的文件是否存在。**失败时只警告，不阻断构建。**

```javascript
// scripts/validate-assets.mjs
import fs from 'node:fs/promises'
import path from 'node:path'

const PUBLIC = path.resolve('public')

async function exists(rel) {
  try { await fs.access(path.join(PUBLIC, rel)); return true }
  catch { return false }
}

const species = JSON.parse(await fs.readFile('data/species.json', 'utf8'))
const audio   = JSON.parse(await fs.readFile('data/audio.json',   'utf8'))

const missing = []

for (const sp of species) {
  // 只检查 assetStatus 为 partial / complete 的物种
  if (sp.assetStatus === 'placeholder') continue

  for (const field of ['illustration', 'photo']) {
    if (sp[field] && !(await exists(sp[field]))) {
      missing.push({ id: sp.id, field, path: sp[field] })
    }
  }
}

for (const [id, meta] of Object.entries(audio)) {
  if (meta.availability === 'available' && !(await exists(meta.src))) {
    missing.push({ id, field: 'audio', path: meta.src })
  }
}

const report = {
  timestamp: new Date().toISOString(),
  totalMissing: missing.length,
  items: missing,
}

await fs.writeFile('scripts/asset-report.json', JSON.stringify(report, null, 2))

if (missing.length > 0) {
  console.warn(`⚠  ${missing.length} 个 "available/partial/complete" 资源文件缺失`)
  missing.forEach(m => console.warn(`   ${m.id}.${m.field}: ${m.path}`))
  console.warn('   完整报告: scripts/asset-report.json')
} else {
  console.log('✓ 所有声明为可用的资源文件均存在')
}
// 故意不 process.exit(1)：缺失文件由 fallback 系统处理，不阻断构建
```

### 4.3 `scripts/validate-content.mjs`

检查 18 种核心物种的内容必填项完整性：

```javascript
// scripts/validate-content.mjs
import fs from 'node:fs/promises'

const species  = JSON.parse(await fs.readFile('data/species.json', 'utf8'))
const audio    = JSON.parse(await fs.readFile('data/audio.json',   'utf8'))
const timeline = JSON.parse(await fs.readFile('data/timeline.json','utf8'))

const issues = []

for (const sp of species) {
  if (!sp.nameZh)  issues.push(`${sp.id}: 缺少 nameZh`)
  if (!sp.nameEn)  issues.push(`${sp.id}: 缺少 nameEn`)
  if (!sp.story && !sp.storyNarrative) issues.push(`${sp.id}: 缺少故事文本`)
  if (!sp.assetStatus)  issues.push(`${sp.id}: 缺少 assetStatus`)
  if (!sp.reviewStatus) issues.push(`${sp.id}: 缺少 reviewStatus`)
  if (!Array.isArray(sp.sources) || sp.sources.length === 0) {
    issues.push(`${sp.id}: 缺少 sources（至少 1 条）`)
  }

  const audioMeta = audio[sp.id]
  if (!audioMeta) {
    issues.push(`${sp.id}: audio.json 中无对应条目`)
  } else {
    if (!audioMeta.attribution) issues.push(`${sp.id}: 缺少 audio.attribution`)
    if (!audioMeta.availability) issues.push(`${sp.id}: 缺少 audio.availability`)
  }

  const frames = timeline[sp.id]
  if (!frames || frames.length === 0) {
    issues.push(`${sp.id}: timeline 中无关键帧`)
  } else {
    const missingEvidence = frames.filter(f => !f.evidenceType)
    if (missingEvidence.length > 0) {
      issues.push(`${sp.id}: ${missingEvidence.length} 个关键帧缺少 evidenceType（先运行 setup:evidence）`)
    }
  }
}

const report = {
  timestamp: new Date().toISOString(),
  totalIssues: issues.length,
  issues,
}

await fs.writeFile('scripts/content-report.json', JSON.stringify(report, null, 2))

if (issues.length > 0) {
  console.warn(`⚠  内容校验发现 ${issues.length} 个问题`)
  issues.forEach(i => console.warn(`   ${i}`))
  console.warn('   完整报告: scripts/content-report.json')
} else {
  console.log('✓ 内容校验全部通过')
}
```

### 4.4 `package.json` 新增脚本

在现有 `scripts` 对象中**追加**以下条目（不删除现有脚本）：

```json
{
  "scripts": {
    "setup:evidence": "node scripts/add-evidence-types.mjs",
    "validate:assets": "node scripts/validate-assets.mjs",
    "validate:content": "node scripts/validate-content.mjs",
    "validate:all": "npm run validate:assets && npm run validate:content",
    "predev": "node scripts/validate-assets.mjs",
    "prebuild": "node scripts/validate-assets.mjs && node scripts/validate-content.mjs"
  }
}
```

### 4.5 Phase 1 完成后的初始化命令

```bash
node scripts/add-evidence-types.mjs    # 补充 timeline evidenceType
node scripts/validate-content.mjs      # 检查内容完整性（查阅报告后手工补充空字段）
node scripts/validate-assets.mjs       # 检查资源文件（预期全部 missing，属正常）
```

---

## 5. 媒体 Fallback 系统

### 5.1 核心原则

`assetStatus === 'placeholder'` 时，系统必须提供完整视觉 Fallback。任何情况下不允许出现：
- broken image（`<img>` 显示裂图图标）
- 空白矩形
- 未样式化的 `alt` 文字

### 5.2 物种图像 Fallback 层级

```
优先级 1：assetStatus !== 'placeholder' 且 illustration 文件存在 → 显示插图
优先级 2：illustration 加载失败 / 不存在，photo 存在 → 显示照片（圆形裁剪）
优先级 3：两者均不存在 → 显示 SpeciesIconFallback 组件
```

### 5.3 新建 `components/ui/SpeciesIconFallback.tsx`

```typescript
// components/ui/SpeciesIconFallback.tsx
"use client"

import React from "react"

// 复用 AustraliaMap.tsx 中已有的 GROUP_ICON_PATHS
const GROUP_ICON_PATHS: Record<string, string> = {
  extinct:    "M12,2 C8,2 4,6 4,10 C4,14 8,18 12,22 C16,18 20,14 20,10 C20,6 16,2 12,2Z",
  endangered: "M12,3 L14,9 L20,9 L15,13 L17,19 L12,15 L7,19 L9,13 L4,9 L10,9Z",
  native:     "M12,4 C8,4 5,7 5,11 C5,15 12,22 12,22 C12,22 19,15 19,11 C19,7 16,4 12,4Z",
  invasive:   "M12,2 L15,8 L22,8 L16.5,12.5 L18.5,19 L12,15 L5.5,19 L7.5,12.5 L2,8 L9,8Z",
  marine:     "M4,12 C4,12 8,6 12,6 C16,6 20,12 20,12 C20,12 16,18 12,18 C8,18 4,12 4,12Z",
}

interface Props {
  color: string
  group: string
  size?: number
  className?: string
}

export default function SpeciesIconFallback({ color, group, size = 48, className }: Props) {
  const iconPath = GROUP_ICON_PATHS[group] ?? GROUP_ICON_PATHS.native

  return (
    <div
      className={`flex items-center justify-center rounded-[1.35rem] ${className ?? ""}`}
      style={{
        width: size,
        height: size,
        background: `${color}18`,
        border: `1.5px solid ${color}36`,
        flexShrink: 0,
      }}
    >
      <svg
        width={size * 0.5}
        height={size * 0.5}
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden
      >
        <path d={iconPath} fill={color} opacity={0.8} />
      </svg>
    </div>
  )
}
```

### 5.4 新建 `components/ui/SpeciesAvatar.tsx`

```typescript
// components/ui/SpeciesAvatar.tsx
"use client"

import React, { useState } from "react"
import SpeciesIconFallback from "./SpeciesIconFallback"

interface SpeciesAvatarProps {
  illustration: string
  photo: string
  nameZh: string
  color: string
  group: string
  assetStatus: string
  size?: number          // 容器尺寸，默认 80px（h-20 w-20）
  radiusClass?: string   // 圆角 class，默认 "rounded-[1.35rem]"
  className?: string
}

export default function SpeciesAvatar({
  illustration,
  photo,
  nameZh,
  color,
  group,
  assetStatus,
  size = 80,
  radiusClass = "rounded-[1.35rem]",
  className,
}: SpeciesAvatarProps) {
  const [illError, setIllError] = useState(false)
  const [photoError, setPhotoError] = useState(false)

  const canTryIllustration = assetStatus !== "placeholder" && illustration && !illError
  const canTryPhoto = !canTryIllustration && assetStatus !== "placeholder" && photo && !photoError
  const showFallback = !canTryIllustration && !canTryPhoto

  const containerStyle: React.CSSProperties = {
    width: size,
    height: size,
    background: `linear-gradient(180deg, ${color}12, ${color}26)`,
    border: `1.5px solid ${color}36`,
    flexShrink: 0,
    position: "relative",
    overflow: "hidden",
  }

  return (
    <div
      className={`flex items-center justify-center ${radiusClass} ${className ?? ""}`}
      style={containerStyle}
    >
      {/* 光晕 */}
      <div
        className="absolute"
        style={{
          width: size * 0.6,
          height: size * 0.6,
          borderRadius: "50%",
          background: `${color}44`,
          filter: "blur(12px)",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
        }}
      />

      {canTryIllustration && (
        <img
          src={illustration}
          alt={nameZh}
          className={`relative h-full w-full object-cover ${radiusClass}`}
          onError={() => setIllError(true)}
        />
      )}

      {canTryPhoto && !canTryIllustration && (
        <img
          src={photo}
          alt={nameZh}
          className={`relative h-full w-full object-cover ${radiusClass}`}
          onError={() => setPhotoError(true)}
        />
      )}

      {showFallback && (
        <SpeciesIconFallback
          color={color}
          group={group}
          size={size * 0.55}
          className="relative"
        />
      )}
    </div>
  )
}
```

### 5.5 音频 Fallback — `AudioPlayer` 组件规格

在 `InfoPanel.tsx` 中，将现有 `AudioPlayer` 组件替换为以下完整实现：

```typescript
// 在 InfoPanel.tsx 内，替换现有 AudioPlayer 函数

function AudioPlayer({ speciesId }: { speciesId: string }) {
  const meta = audioMeta[speciesId]
  const [isPlaying, setIsPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [errorMsg, setErrorMsg] = useState("")
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    setErrorMsg("")
    setProgress(0)
    setIsPlaying(false)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      if (audioRef.current) { audioRef.current.pause(); audioRef.current = null }
    }
  }, [speciesId])

  // ── 状态 1：无元数据 ──
  if (!meta) return null

  // ── 状态 2：文件缺失 ──
  if (meta.availability === "missing") {
    return (
      <div
        className="rounded-[1.1rem] px-3.5 py-3"
        style={{ background: "rgba(239, 223, 196, 0.72)" }}
      >
        <p className="text-[0.72rem]" style={{ color: "var(--warm-gray)" }}>
          🎵 暂无音频，资料收集中
        </p>
      </div>
    )
  }

  // ── 状态 3：AI 模拟 或 可用音频 ──
  const isAI = meta.availability === "ai_simulated"

  const toggleAudio = () => {
    if (!meta.src) return
    if (!audioRef.current) {
      audioRef.current = new Audio(meta.src)
      audioRef.current.addEventListener("ended", () => {
        setIsPlaying(false)
        setProgress(0)
        if (rafRef.current) cancelAnimationFrame(rafRef.current)
      })
    }
    if (isPlaying) {
      audioRef.current.pause()
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      setIsPlaying(false)
    } else {
      audioRef.current.play()
        .then(() => {
          setErrorMsg("")
          setIsPlaying(true)
          const tick = () => {
            if (audioRef.current?.duration) {
              setProgress(audioRef.current.currentTime / audioRef.current.duration)
            }
            rafRef.current = requestAnimationFrame(tick)
          }
          rafRef.current = requestAnimationFrame(tick)
        })
        .catch(() => {
          setErrorMsg("当前环境无法播放此音频")
          setIsPlaying(false)
        })
    }
  }

  return (
    <div
      className="rounded-[1.1rem] px-3.5 py-3"
      style={{ background: "rgba(239, 223, 196, 0.72)" }}
    >
      {/* ── 播放行 ── */}
      <div className="flex items-center gap-2.5">
        <button
          onClick={toggleAudio}
          className="atlas-focus-ring flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full transition-colors"
          style={{
            background: isPlaying ? "var(--coral)" : "var(--earth)",
            color: "rgba(255,249,241,0.96)",
          }}
          aria-label={isPlaying ? "暂停" : "播放声音"}
        >
          {isPlaying ? (
            <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
              <rect x="2" y="1" width="3" height="10" rx="1" />
              <rect x="7" y="1" width="3" height="10" rx="1" />
            </svg>
          ) : (
            <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
              <path d="M2.5 1v10l8-5z" />
            </svg>
          )}
        </button>

        <div className="min-w-0 flex-1">
          <div className="h-2 overflow-hidden rounded-full" style={{ background: "var(--sand)" }}>
            <div
              className="h-full rounded-full transition-all duration-100"
              style={{ width: `${progress * 100}%`, background: "var(--coral)" }}
            />
          </div>

          {/* AI 警示标签 */}
          {isAI && (
            <span
              className="mt-1 inline-block rounded-full px-2 py-0.5 text-[0.62rem]"
              style={{ background: "var(--coral-light)", color: "var(--coral)" }}
            >
              AI 模拟 · 非真实历史录音
            </span>
          )}

          {errorMsg && (
            <p className="mt-1 text-[0.68rem]" style={{ color: "var(--coral)" }}>
              {errorMsg}
            </p>
          )}
        </div>
      </div>

      {/* ── 归因行（新增）── */}
      {meta.attribution && (
        <div className="mt-2 flex items-start gap-1">
          <span className="shrink-0 text-[0.58rem] leading-[1.6]" style={{ color: "var(--warm-gray)", opacity: 0.5 }}>
            ©
          </span>
          <p className="text-[0.62rem] leading-relaxed" style={{ color: "var(--warm-gray)", opacity: 0.65 }}>
            {meta.attribution}
            {meta.sourceUrl && (
              <>
                {" · "}
                <a
                  href={meta.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-2 hover:opacity-80 transition-opacity"
                  style={{ color: "var(--earth-light)" }}
                >
                  来源
                </a>
              </>
            )}
          </p>
        </div>
      )}
    </div>
  )
}
```

### 5.6 在 `InfoPanel.tsx` 中使用 `SpeciesAvatar`

在 `SpeciesInfo` 函数中，将现有的物种头像区域替换为 `SpeciesAvatar` 组件调用：

```typescript
// 在 SpeciesInfo 函数中，替换现有头像区域：
import SpeciesAvatar from "@/components/ui/SpeciesAvatar"

// 将原有的：
// <div className="relative flex h-20 w-20 ...">
//   <div className="absolute h-12 w-12 rounded-full blur-xl" .../>
//   <div className="relative h-9 w-9 rounded-full" .../>
// </div>

// 替换为：
<SpeciesAvatar
  illustration={species.illustration ?? ""}
  photo={species.photo ?? ""}
  nameZh={species.nameZh}
  color={species.color}
  group={species.group}
  assetStatus={(species as any).assetStatus ?? "placeholder"}
/>
```

---

## 6. 移动端适配

### 6.1 新建 `lib/use-is-mobile.ts`

```typescript
// lib/use-is-mobile.ts
import { useState, useEffect } from "react"

export function useIsMobile(breakpoint = 768): boolean {
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint - 1}px)`)
    setIsMobile(mq.matches)
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mq.addEventListener("change", handler)
    return () => mq.removeEventListener("change", handler)
  }, [breakpoint])

  return isMobile
}
```

### 6.2 `InfoPanel.tsx` — 移动端 Drawer 改造

**策略：** 保留现有桌面端右侧面板逻辑完全不变，通过 `useIsMobile()` 判断，在移动端使用 Drawer 容器包裹相同的内容组件。

```typescript
// 在 InfoPanel.tsx 顶部引入
import { useIsMobile } from "@/lib/use-is-mobile"

// 在 InfoPanel 组件内
export default function InfoPanel() {
  const { focusRegionId, selectedSpeciesId, setFocusRegion, setSelectedSpecies } = useAtlas()
  const shouldReduceMotion = useReducedMotion()
  const isMobile = useIsMobile()
  const isOpen = Boolean(focusRegionId || selectedSpeciesId)

  const handleClose = () => {
    setSelectedSpecies(null)
    setFocusRegion(null)
  }

  // 公共内容（桌面与移动端共用同一套内容组件）
  const panelContent = (
    <PanelContent
      focusRegionId={focusRegionId}
      selectedSpeciesId={selectedSpeciesId}
      onClose={handleClose}
      shouldReduceMotion={shouldReduceMotion}
    />
  )

  // ── 移动端：底部 Drawer ──
  if (isMobile) {
    return (
      <AnimatePresence>
        {isOpen && (
          <>
            {/* 遮罩层 */}
            <motion.div
              key="backdrop"
              className="pointer-events-auto fixed inset-0 z-20"
              style={{ background: "rgba(58, 44, 30, 0.25)", backdropFilter: "blur(1px)" }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={shouldReduceMotion ? { duration: 0 } : EASE_FADE_IN}
              onClick={handleClose}
              aria-hidden
            />

            {/* Drawer */}
            <motion.div
              key="drawer"
              className="pointer-events-auto fixed bottom-0 left-0 right-0 z-30 overflow-hidden"
              style={{
                borderRadius: "2rem 2rem 0 0",
                maxHeight: "70vh",
                background: "linear-gradient(180deg, rgba(255,251,245,0.98) 0%, rgba(250,242,231,0.96) 56%, rgba(240,223,194,0.98) 100%)",
                boxShadow: "0 -8px 32px rgba(94,74,47,0.18), inset 0 1px 0 rgba(255,255,255,0.4)",
                border: "1px solid rgba(170,146,112,0.18)",
              }}
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={shouldReduceMotion ? { duration: 0 } : SPRING_DRAWER}
              role="dialog"
              aria-modal="true"
              aria-label="物种或区域详情"
            >
              {/* 拖动手柄 */}
              <div className="flex justify-center pt-3 pb-1">
                <div
                  className="rounded-full"
                  style={{ width: 40, height: 4, background: "rgba(170,146,112,0.35)" }}
                />
              </div>

              {/* 滚动内容区 */}
              <div className="overflow-y-auto" style={{ maxHeight: "calc(70vh - 28px)" }}>
                {panelContent}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    )
  }

  // ── 桌面端：右侧固定面板（保留现有实现）──
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ x: 340, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 340, opacity: 0 }}
          transition={shouldReduceMotion ? { duration: 0 } : SPRING_PANEL}
          className="pointer-events-auto fixed inset-y-5 right-5 z-30 w-[24rem] xl:w-[25rem]"
        >
          <div
            className="storybook-panel storybook-panel-strong h-full overflow-hidden"
            style={{ borderRadius: "2rem" }}
          >
            {panelContent}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
```

**`PanelContent` 内部组件：** 将现有 InfoPanel 的内部渲染逻辑（panel header + scrollable content + AnimatePresence 内容切换）提取为 `PanelContent` 内部函数，供桌面和移动端复用。具体内容保持与当前实现完全一致，仅做提取重组。

### 6.3 `TimelineBar.tsx` — 移动端触碰热区

在 `TimelineBar.tsx` 中引入 `useIsMobile`，调整以下两处：

**① 拖动手柄尺寸：**

```typescript
const isMobile = useIsMobile()

// 拖动圆点（现有的 w-[26px] h-[26px]）
// 替换为：
// style={{ width: isMobile ? 30 : 26, height: isMobile ? 30 : 26, ... }}
```

**② 移动端 milestone 标签：** 在 `< 390px` 时（`isMobile && window.innerWidth < 390`），只显示第一个和最后一个 milestone 标签，隐藏中间标签，避免文字重叠。

```typescript
// 在 milestone 渲染处：
const showLabel = !isMobile || index === 0 || index === milestones.length - 1
if (!showLabel) return <div key={year} ...>{/* 只渲染节点圆点，不渲染 label */}</div>
```

### 6.4 `TopOverlay.tsx` — 移动端尺寸调整

```typescript
const isMobile = useIsMobile()

// 年份大数字：
// 桌面：text-[2.45rem]（现有值）
// 移动：text-[1.8rem]
// 实现：style={{ fontSize: isMobile ? '1.8rem' : '2.45rem' }}

// 搜索框宽度（story-full 态）：
// 桌面：min(100%, 21rem)（现有值）
// 移动：min(100vw - 3rem, 18rem)
// 实现：style={{ width: isMobile ? 'min(calc(100vw - 3rem), 18rem)' : 'min(100%, 21rem)' }}
```

### 6.5 `IntroSequence.tsx` — 跳过按钮移动端位置

```typescript
// 将现有的：
// className="absolute bottom-8 right-8 ..."
// 改为：
className={`absolute ${isMobile ? 'bottom-8 left-1/2 -translate-x-1/2' : 'bottom-8 right-8'} ...`}
```

这避免了 iOS 系统栏将右下角按钮遮挡的问题。

---

## 7. 内容可信度系统

### 7.1 证据类型标签组件

新建 `components/ui/EvidenceBadge.tsx`：

```typescript
// components/ui/EvidenceBadge.tsx
"use client"

import React from "react"

type EvidenceType = "inferred" | "historical" | "contemporary"

const LABELS: Record<EvidenceType, { text: string; bg: string; color: string }> = {
  inferred:     { text: "推断叙事", bg: "rgba(184,168,138,0.18)", color: "rgba(122,107,82,0.85)" },
  historical:   { text: "历史记录", bg: "rgba(120,172,200,0.18)", color: "rgba(78,130,160,0.85)" },
  contemporary: { text: "当代调查", bg: "rgba(125,165,108,0.18)", color: "rgba(80,138,74,0.85)" },
}

interface Props {
  evidenceType: string
  className?: string
}

export default function EvidenceBadge({ evidenceType, className }: Props) {
  const meta = LABELS[evidenceType as EvidenceType]
  if (!meta) return null

  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[0.58rem] font-medium ${className ?? ""}`}
      style={{ background: meta.bg, color: meta.color }}
    >
      {meta.text}
    </span>
  )
}
```

### 7.2 在 `InfoPanel.tsx` 中展示证据类型

在 `SpeciesInfo` 组件的叙事文字（`interpolated.narrative`）区块中，追加证据标签：

```typescript
import EvidenceBadge from "@/components/ui/EvidenceBadge"

// 在叙事文字区块中，找到渲染 narrative 的位置
// 在段落文字之前或右上角，添加：

{interpolated.narrative && (
  <div className="rounded-[1.5rem] px-4 py-4" style={{ background: "rgba(246, 236, 217, 0.54)" }}>
    {/* 证据类型标签（新增） */}
    <div className="mb-2 flex items-center justify-between">
      <div className="atlas-kicker">Field Note</div>
      {currentFrameEvidenceType && (
        <EvidenceBadge evidenceType={currentFrameEvidenceType} />
      )}
    </div>
    {/* ...原有内容... */}
  </div>
)}
```

**获取当前帧的 evidenceType：**

```typescript
// 在 SpeciesInfo 内部
const keyframes = timeline[species.id] || []
const sorted = [...keyframes].sort((a, b) => a.year - b.year)

// 找到最接近 currentYear 的关键帧
const currentFrame = sorted.reduce((prev, curr) =>
  Math.abs(curr.year - currentYear) < Math.abs(prev.year - currentYear) ? curr : prev
, sorted[0])

const currentFrameEvidenceType = (currentFrame as any)?.evidenceType as string | undefined
```

### 7.3 推断层免责提示

在 `TopOverlay.tsx` 中，当 `currentYear <= 1788` 时，在年份下方追加免责提示：

```typescript
// 在 TopOverlay.tsx 的 story-full 区域中，年份行之后追加：
{currentYear <= 1788 && (
  <motion.p
    key="inferred-disclaimer"
    initial={{ opacity: 0, height: 0 }}
    animate={{ opacity: 1, height: "auto" }}
    exit={{ opacity: 0, height: 0 }}
    transition={shouldReduceMotion ? { duration: 0 } : EASE_FADE_IN}
    className="mt-1 text-[0.63rem] leading-relaxed"
    style={{ color: "var(--warm-gray)", opacity: 0.68 }}
  >
    ≈ 推断层：此时期基于生态推断，非确切历史记录
  </motion.p>
)}
```

### 7.4 来源引用组件

新建 `components/ui/SourcesCitation.tsx`：

```typescript
// components/ui/SourcesCitation.tsx
"use client"

import React from "react"

interface Source {
  label: string
  url: string
}

interface Props {
  sources: Source[]
}

export default function SourcesCitation({ sources }: Props) {
  if (!sources || sources.length === 0) return null

  return (
    <div
      className="rounded-[1rem] px-3.5 py-2.5"
      style={{ background: "rgba(246, 236, 217, 0.42)" }}
    >
      <p
        className="text-[0.62rem] uppercase tracking-wide"
        style={{ color: "var(--warm-gray)", opacity: 0.55, letterSpacing: "0.1em" }}
      >
        资料来源
      </p>
      <div className="mt-1.5 space-y-1">
        {sources.map((source, i) => (
          <a
            key={i}
            href={source.url}
            target="_blank"
            rel="noopener noreferrer"
            className="block text-[0.68rem] leading-relaxed transition-opacity hover:opacity-70"
            style={{ color: "var(--earth-light)" }}
          >
            ↗ {source.label}
          </a>
        ))}
      </div>
    </div>
  )
}
```

**在 `InfoPanel.tsx` 的 `SpeciesInfo` 底部引入：**

```typescript
import SourcesCitation from "@/components/ui/SourcesCitation"

// 在 SpeciesInfo 返回值的末尾，AudioPlayer 之后添加：
{(species as any).sources?.length > 0 && (
  <SourcesCitation sources={(species as any).sources} />
)}
```

### 7.5 空态文案规格

**搜索无结果：** `TopOverlay.tsx` 中已有处理，确认文案为：

```
在核心 18 种物种中未找到匹配。试试中文名、英文名或学名。
```

**区域内物种列表空态：** `InfoPanel.tsx` 中 `RegionInfo` 已有处理，确认文案为：

```
在 {region.nameZh} 没找到匹配物种，试试中文名、英文名或学名关键词。
```

**时间叙事为空：** `SpeciesInfo` 中 `interpolated.narrative === ""` 时，**不渲染 Field Note 区块**（当前实现可能已处理，确认一致）。

---

## 8. 容错与降级

### 8.1 WebGL 不支持检测（`AustraliaMap.tsx`）

在 `AustraliaMap.tsx` 的地图初始化 `useEffect` 最开始添加 WebGL 检测：

```typescript
// 在 useEffect 内部，maplibregl.Map 初始化之前：
const canvas = document.createElement("canvas")
const gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl")
if (!gl) {
  setWebGLUnsupported(true)
  return
}
```

**新增状态：**
```typescript
const [webGLUnsupported, setWebGLUnsupported] = useState(false)
```

**渲染 WebGL 不支持提示：**

```typescript
// 在 AustraliaMap 返回值中，map container 前：
if (webGLUnsupported) {
  return (
    <div className="atlas-map-loading flex flex-col items-center justify-center h-full">
      <p className="text-base font-display" style={{ color: "var(--earth-deep)" }}>
        浏览器不支持地图渲染
      </p>
      <p className="mt-2 text-sm" style={{ color: "var(--warm-gray)" }}>
        请使用 Chrome、Firefox 或 Safari 最新版本访问
      </p>
    </div>
  )
}
```

### 8.2 地图加载超时（`AustraliaMap.tsx`）

在地图初始化 `useEffect` 中，追加超时检测逻辑：

```typescript
// 新增状态
const [mapLoadTimeout, setMapLoadTimeout] = useState(false)

// 在地图初始化后，设置超时定时器：
const timeoutId = window.setTimeout(() => {
  if (!isMapReadyRef.current) {
    setMapLoadTimeout(true)
  }
}, 30_000)  // 30 秒

// 地图 load 事件触发后清除定时器：
map.on("load", () => {
  window.clearTimeout(timeoutId)
  isMapReadyRef.current = true
  // ...现有 load 逻辑
})

// useEffect cleanup 中也清除：
return () => {
  window.clearTimeout(timeoutId)
  // ...现有 cleanup
}
```

**渲染超时提示（替换现有 loading 态）：**

```typescript
// 在 !mapBooted 的渲染块中，追加超时判断：
{!mapBooted && (
  <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
    <div className="atlas-map-loading">
      <span className="atlas-kicker">Atlas Map</span>
      {mapLoadTimeout ? (
        <p style={{ color: "var(--coral)" }}>
          地图底图加载超时。请检查网络连接，或确认 MAPTILER_KEY 配置是否正确。
        </p>
      ) : (
        <p>正在铺开澳大利亚的地理底图</p>
      )}
    </div>
  </div>
)}
```

### 8.3 `.env.example` 补充注释

```bash
# 澳洲野生动物时空图谱 — 环境变量配置
#
# 地图底图提供商（可选）
# 留空时：自动使用 OpenFreeMap（免费，无需注册，覆盖全球）
# 填入时：使用 MapTiler（需在 maptiler.com 注册免费账号获取 key）
# 推荐：先留空测试，上线前申请 MapTiler 以获得更精美的绘本风格底图
NEXT_PUBLIC_MAPTILER_KEY=
NEXT_PUBLIC_MAPTILER_STYLE_URL=
# 示例自定义底图（MapTiler 付费地图，绘本风格更佳）：
# NEXT_PUBLIC_MAPTILER_STYLE_URL=https://api.maptiler.com/maps/topo-v2/style.json
```

---

## 9. Intro 与首屏协同

### 9.1 `IntroSequence.tsx` 保留现有实现

当前 `IntroSequence.tsx` 已正确实现：
- 翻书动画（phase 0-5，9 秒总时长）
- 首次访问自动播放
- 跳过按钮 + localStorage 记忆
- `useAtlas` 的 `hasSeenIntro` / `markIntroSeen` 集成

**只做两处小修改：**

① 跳过按钮移动端位置（见 §6.5）

② 确保 `MapStage` 在 Intro 期间后台加载：

### 9.2 确认 `page.tsx` 的渲染顺序正确

当前 `page.tsx` 的渲染顺序：

```tsx
<AtlasProvider>
  <main ...>
    <MapStage />        {/* ← 始终渲染，Intro 期间在 Intro 层下方后台加载 */}
    <TopOverlay />
    <InfoPanel />
    <Legend />
    <TimelineBar />
    <IntroSequence />   {/* ← z-[100]，覆盖在 MapStage 上方 */}
  </main>
</AtlasProvider>
```

**这个顺序已经正确**：`MapStage` 先于 `IntroSequence` 渲染，地图在 Intro 动画播放期间后台初始化。**不需要改动 `page.tsx`**。

### 9.3 动画一致性复查清单

在 Phase 6 中，确认以下现有动画参数是否符合设计规范（仅复查，不强制修改已工作的参数）：

| 组件 | 动画 | 当前参数 | 是否符合规范 |
|---|---|---|---|
| `InfoPanel` 面板滑入 | spring | `stiffness:200, damping:25` | ✅ 接近规范（可保留） |
| `InfoPanel` 内容切换 | ease | `duration:0.28, ease:[0.22,1,0.36,1]` | ✅ 符合规范 |
| `TopOverlay` 布局动画 | ease | `duration:0.36, ease:[0.22,1,0.36,1]` | ✅ 符合规范 |
| `IntroSequence` 退出 | opacity | `duration:0.8` | ✅ 合理 |

**新增组件（Drawer 等）必须使用 §2.4 中定义的参数。**

---

## 10. 验收标准清单

### Phase 1 验收

```
✓ npm run build 通过
✓ npm run lint 通过
✓ node scripts/add-evidence-types.mjs 成功运行
✓ node scripts/validate-content.mjs 输出报告（允许有警告）
✓ node scripts/validate-assets.mjs 输出报告（预期全部 missing，属正常）
✓ data/timeline.json 中每个关键帧有 evidenceType 字段
✓ data/species.json 中每条记录有 assetStatus、reviewStatus、sources 字段
✓ data/audio.json 中每条记录有 attribution、license、availability 字段
```

### Phase 2 验收

```
✓ 点击任意物种，InfoPanel 头像区域不出现 broken image
✓ assetStatus === 'placeholder' 时，显示品牌色 icon fallback
✓ availability === 'missing' 时，显示"暂无音频，资料收集中"
✓ availability === 'ai_simulated' 时，显示"AI 模拟 · 非真实历史录音"标签
✓ availability === 'ai_simulated' 时，归因行显示 "AI 模拟 · 非真实历史录音 · 仅供科普体验"
```

### Phase 3 验收（移动端）

```
✓ 390px 宽度下，InfoPanel 以底部 Drawer 形式显示
✓ Drawer 有顶部拖动手柄（40×4px 圆角横条）
✓ 点击 Drawer 后方遮罩层，Drawer 关闭
✓ Drawer 内容可以滚动查看（overflow-y-auto）
✓ 390px 宽度下，时间轴拖动圆点不小于 30px（可触碰）
✓ 390px 宽度下，Intro 跳过按钮居中显示，不被系统栏遮挡
✓ 390px 宽度下，TopOverlay 年份可见，搜索框可用
```

### Phase 4 验收（内容）

```
✓ SpeciesInfo 中显示 EvidenceBadge（推断叙事 / 历史记录 / 当代调查）
✓ currentYear <= 1788 时，TopOverlay 显示推断层免责提示
✓ 至少 3 种物种的 SourcesCitation 区块显示可点击的有效链接
✓ 搜索无结果时显示温和引导文案（无"找不到"负面语气）
```

### Phase 5 验收（降级）

```
✓ WebGL 不支持时，显示友好提示，不显示空白页
✓ 地图 30 秒未初始化，loading 提示更新为超时文案
✓ .env.example 有中文注释说明 MapTiler key 的配置方式
```

### Phase 6 验收（整体）

```
✓ 首次访问：Intro 完整播放，地图同时后台加载，Intro 结束后地图已 ready
✓ 全国态 → 点击州 → 点击物种 → 返回区域 → 关闭面板，主流程无卡死
✓ 页面第一眼是"绘本地图"感，不是数据仪表盘
✓ 新增组件使用 CSS 变量，不硬编码颜色
✓ prefers-reduced-motion 生效时，所有新增动画停止或简化
```

### 最终发布验收

```
✓ npm run build 通过
✓ npm run lint 通过
✓ npm run validate:all 通过（或报告已确认）
✓ 桌面端（1440px）主流程可走通
✓ 移动端（390px）主流程可走通
✓ 地图右上角 provider 标识正确显示
✓ MapLibre attribution（地图版权）可见
```

---

## 11. 增强轨边界定义

以下内容在主轨（Release A）**完全不实施**，文件中不得出现相关占位代码：

| 功能 | 理由 |
|---|---|
| `app/api/ala/*` ALA 代理接口 | 需要后端，增加部署复杂度 |
| `app/api/llm/*` LLM 接口 | 需要后端 + 费用控制 + 隐私声明 |
| `hooks/useALASpecies.ts` | 依赖上述接口 |
| `data/extended-species.json` | 100+ 物种会破坏绘本整体感 |
| DOM cloud bubble layer | 坐标同步逻辑复杂，性能风险高 |
| 多点气泡分布系统 | 依赖 ALA occurrence 数据 |
| 地貌环境音自动判定 | 需要音频文件和地貌分区系统 |
| 运行时 DeepSeek 内容生成 | 科普准确性无法保证，费用不可控 |

**增强轨的强制前提（任何一项未满足，不得进入增强轨）：**

1. Release A 全部验收标准通过
2. 内容版权归因链路完整（attribution、license 均已完善）
3. 部署平台确认为 Vercel（支持 Node.js runtime Server Actions）
4. 有隐私声明页面
5. API key 未设置时有明确的降级行为（不崩溃）
6. 所有公开 API 路由有输入格式校验和速率限制
7. LLM 输出在 UI 中有明确的"AI 生成内容"标注

---

## 12. 文件变更清单

### 需要新建的文件

```
lib/use-is-mobile.ts
components/ui/SpeciesIconFallback.tsx
components/ui/SpeciesAvatar.tsx
components/ui/EvidenceBadge.tsx
components/ui/SourcesCitation.tsx
scripts/add-evidence-types.mjs
scripts/validate-assets.mjs
scripts/validate-content.mjs
```

### 需要修改的文件

```
components/InfoPanel.tsx
  - 引入 useIsMobile + 移动端 Drawer 逻辑
  - 引入 SpeciesAvatar 替换头像区域
  - 替换 AudioPlayer（加归因行）
  - 引入 EvidenceBadge
  - 引入 SourcesCitation
  - 加 PanelContent 内部函数提取

components/AustraliaMap.tsx
  - 加 WebGL 不支持检测
  - 加地图加载超时逻辑

components/TopOverlay.tsx
  - 加推断层免责提示
  - 移动端年份字号和搜索框宽度

components/TimelineBar.tsx
  - 引入 useIsMobile
  - 移动端手柄尺寸 + Milestone 标签隐藏

components/IntroSequence.tsx
  - 引入 useIsMobile
  - 跳过按钮移动端位置

data/species.json
  - 18 条记录追加 assetStatus、sources、reviewStatus、funFacts、storyNarrative、timelineNarratives

data/audio.json
  - 18 条记录追加 attribution、license、sourceUrl、availability

data/timeline.json
  - 通过脚本批量追加 evidenceType（运行 setup:evidence）

.env.example
  - 补充中文注释

package.json
  - 追加 setup:evidence、validate:assets、validate:content、validate:all、predev、prebuild 脚本
```

### 绝对不改动的文件

```
app/page.tsx
app/layout.tsx
app/globals.css（仅允许追加新 CSS 类，不修改现有变量）
lib/interpolate.ts
lib/map-style.ts
lib/constants.ts
lib/species-ui.ts
contexts/AtlasContext.tsx（仅允许追加字段，不重构）
components/MapStage.tsx
components/Legend.tsx
data/regions.json
data/geo/australian-states.min.json
tailwind.config.ts
```

---

## 附录：新增 CSS 类（追加到 `app/globals.css` 末尾）

```css
/* ── Drawer 拖动手柄 ── */
.drawer-handle {
  width: 40px;
  height: 4px;
  border-radius: 2px;
  background: rgba(170, 146, 112, 0.35);
  margin: 0 auto;
}

/* ── 证据类型标签基础样式 ── */
.evidence-badge {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  padding: 0.15rem 0.55rem;
  font-size: 0.58rem;
  font-weight: 500;
  line-height: 1.4;
}

/* ── 移动端 Drawer 遮罩 ── */
.drawer-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(58, 44, 30, 0.25);
  backdrop-filter: blur(1px);
  -webkit-backdrop-filter: blur(1px);
}
```

---

*本 PRD 以当前仓库的真实代码为唯一基线。所有改动均为增量演进，不推倒重来。主轨目标是让现有 18 种核心物种的体验从"可演示原型"升级为"高完成度可发布科普作品"。*
