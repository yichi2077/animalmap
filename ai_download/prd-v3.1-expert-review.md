# PRD v3.1 专家评审团审计报告
> 澳洲野生动物时空图谱  
> 审计对象：australia-wild-atlas-prd-v3.1.md  
> 评审模式：独立审计，各自发现问题后汇总  
> 结论格式：🔴 阻断性问题 / 🟡 重大风险 / 🟢 建议改进

---

## 评审团成员与职责

| 角色 | 职责边界 |
|---|---|
| **A — 首席代码架构师** | 系统设计、模块边界、技术债、可扩展性 |
| **B — 前端工程师** | React实现细节、渲染性能、组件规格完整性 |
| **C — 后端全栈工程师** | API设计、数据流、服务端安全、缓存策略 |
| **D — UI/UX设计师** | 视觉规格完整性、交互流程、用户体验 |
| **E — 视觉美学总监** | 风格一致性、动画质感、品牌感知（独立职位） |
| **F — 产品经理** | 需求覆盖度、用户价值、功能优先级 |
| **G — PMO项目管理** | 阶段可执行性、依赖关系、风险暴露 |
| **H — 信息安全工程师** | API安全、数据保护、攻击面 |
| **I — 数据工程师** | 数据质量、ALA数据可靠性、清洗逻辑 |
| **J — 内容与法务顾问** | 版权合规、LLM内容风险、数据授权 |
| **K — 无障碍与包容性工程师** | a11y、国际化、跨设备适配 |
| **L — DevOps与部署工程师** | 构建流程、部署平台、环境配置 |
| **M — 科普教育顾问** | 教育价值、科学准确性、叙事合理性 |

---

---

# A — 首席代码架构师

## 🔴 阻断性问题

### A-1：PRD 第 0.3 节与代码实现直接矛盾

PRD 第 0.3 节明确写道：

> "不要自己实现 k-means，使用指定的 npm 包"

但 PRD 在第 5 节（Phase 3）又提供了完整的 `lib/kmeans.ts` 自实现，且第 1.3 节的 `fetch-distribution-points.mjs` 脚本也内联了 k-means 实现。

**Agent 读到这里会陷入执行矛盾：** 究竟应该用 npm 包还是自实现？如果用 npm 包，指定的是哪个？（文档从未说明）如果用自实现，0.3 节的禁令要删除吗？

**修复方案：** 删除 0.3 节的 k-means 禁令，明确声明使用自实现的 `lib/kmeans.ts`，理由是避免引入新依赖，且此实现足够满足 MVP 需求。

### A-2：merge-species-content.mjs 脚本缺少 import 语句，无法运行

```javascript
// 读取 species.json 和 species-content-patch.json，合并字段，写回 species.json
const species = JSON.parse(await fs.readFile('data/species.json', 'utf8'))
```

`fs` 从未被 import。这个脚本作为独立 `.mjs` 文件运行会立即报 `ReferenceError: fs is not defined`。Agent 会照抄此代码，运行失败后不知道为什么。

**修复方案：** 在脚本开头补充 `import fs from 'node:fs/promises'`。

### A-3：模块级 CACHE Map 在 Next.js 开发模式下会内存泄漏

```typescript
// hooks/useALASpecies.ts
const CACHE: Map<string, RuntimeExtendedSpecies> = new Map()
```

这个 Map 定义在模块作用域，不在 React 组件内。在 Next.js 开发环境的 HMR（热模块替换）中，模块会被重新执行但旧实例不会被 GC，导致多次 HMR 后内存中存在多个 CACHE 实例。生产环境无此问题，但开发体验会变差，且 Agent 无法预判这个行为。

**修复方案：** 将 CACHE 改为 `globalThis.__atlasSpeciesCache` 挂载，或使用 React Context 管理，或明确注释"HMR 环境下此 cache 会重复初始化，属于已知 dev 行为"。

### A-4：LRU 淘汰逻辑不正确

```typescript
function evictIfNeeded() {
  if (CACHE.size > MAX_IN_MEMORY) {
    const firstKey = CACHE.keys().next().value
    if (firstKey) CACHE.delete(firstKey)
  }
}
```

`Map.keys()` 返回的是**插入顺序**而非**访问顺序**。这实现的是 FIFO（先进先出），不是 LRU（最近最少使用）。如果用户反复访问一个早期插入的物种，它反而会被优先淘汰。PRD 称其为 "LRU 淘汰" 是误导性描述。

**修复方案：** 要么改为真实 LRU（每次 get 时将 key 移到末尾），要么明确说明这是 FIFO 策略并更改注释。

## 🟡 重大风险

### A-5：云效果 DOM 气泡与 MapLibre 地图坐标同步缺少 rAF 节流

PRD 规定：

```typescript
map.on('move', update)
map.on('zoom', update)
```

`map.on('move')` 在用户拖动地图时每帧都会触发（60fps），且每次触发都会调用 `map.project()` 13次并触发 React setState。这会在地图拖动期间产生极高的重渲染压力。PRD 未指定任何节流机制。

**修复方案：** update 函数应包裹在 `requestAnimationFrame` 中，且需要 `cancelAnimationFrame` 防止重复调用。

### A-6：连接线渲染方式低效且有层叠问题

PRD 为每个小气泡单独渲染一个 `<svg position:absolute inset-0 overflow-visible>` 元素（12 个气泡 = 12 个独立 SVG）。每个 SVG 都有 `overflow-visible`，这会触发浏览器的 layout 重算。

**修复方案：** 所有连接线应该合并到**一个** SVG overlay 中统一渲染。

---

# B — 前端工程师

## 🔴 阻断性问题

### B-1：ExtendedSpeciesInfo 引用了未定义的函数和组件

在 Phase 4 的代码中：

```typescript
style={{ background: `rgba(${hexToRgb(getColorByClass(species.taxonomicClass))}, 0.12)` }}
```

`hexToRgb` 和 `getColorByClass` 函数从未在 PRD 任何位置定义。Agent 会生成调用不存在函数的代码，TypeScript 编译报错。

同样，`TaxonIcon`、`ConservationBadge`、`STATE_NAME_ZH` 均在代码中引用但从未定义规格。

**修复方案：** PRD 必须补充以下内容：
- `getColorByClass(taxonomicClass: string): string` 的颜色映射表
- `hexToRgb(hex: string): string` 的实现或引用
- `TaxonIcon` 组件的完整规格（或指向 taxon icon SVG paths 的引用）
- `ConservationBadge` 组件的完整 UI 规格
- `STATE_NAME_ZH` 的完整州名中文映射对象

### B-2：buildBubbleSvg 中的灭绝判断逻辑有 Bug

```typescript
const isExtinct = species.extinctYear !== undefined
```

这个判断在任何拥有 `extinctYear` 字段的物种上都会返回 `true`，无论当前时间轴是否已经到达灭绝年份。袋狼（extinctYear: 1936）在 1770 年时也会被渲染为幽灵灰色气泡。

**正确逻辑应为：**
```typescript
const isExtinct = species.extinctYear !== undefined && currentYear >= species.extinctYear
```

但 `buildBubbleSvg` 是一个异步函数，在地图初始化时调用，不接收 `currentYear` 参数。这意味着图片一旦预加载就固定了，无法随时间轴动态变化。**整个气泡图片预加载策略与时间轴驱动的设计存在根本性矛盾，PRD 未解决此问题。**

**修复方案：** 灭绝状态的视觉变化应通过 MapLibre 的 `icon-opacity` 和 CSS filter（如 `icon-color` 叠加灰色）在 layer paint property 中动态实现，而非在静态图片中烘焙。

### B-3：气泡半径在 MapLibre Symbol Layer 中无法直接使用像素值

PRD 定义了 `calcBubbleRadius` 返回像素半径，并将其存入 GeoJSON feature properties，但 MapLibre 的 symbol layer 的 `icon-size` 属性是**相对于预加载图片尺寸的比例系数**，不是绝对像素值。

如果预加载图片是 88px，`icon-size: 0.5` 则显示为 44px 逻辑尺寸。PRD 需要说明 `radius` 如何转换为 `icon-size`，否则 Agent 会写出错误的 paint 表达式。

**修复方案：** 补充换算公式：`iconSize = radius / (88 / 2)` 或类似逻辑，并在 paint 表达式中使用 `["get", "iconSize"]`。

## 🟡 重大风险

### B-4：序章动画（Intro Animation）在 PRD v3.1 中完全消失

原始 PRD v2.2 中有完整的"翻开绘本"10秒序章动画规格。现有代码库中可能存在 `IntroSequence.tsx` 组件（或占位）。PRD v3.1 在 Phase 列表中完全没有提及序章动画的实现，也没有说明是否保留、删除或修改原有实现。

Agent 不知道对 IntroSequence 应该做什么。

**修复方案：** 明确声明序章动画的处理方式：保留现有实现/重新实现/删除。

### B-5：搜索功能扩展规格严重不足

PRD 第 9 节提到搜索要支持 100-200 种物种，但仅有一行代码说明：
```typescript
species.scientificName.toLowerCase().includes(normalizedQuery)
```

完全没有：
- 搜索结果 dropdown 的 UI 规格
- 搜索 debounce 时间（现有代码无 debounce，100 种时每次按键都会匹配）
- 核心物种和扩展物种搜索结果的分组显示方式
- 搜索无结果时的 UI
- 扩展物种搜索时如何触发 ALA 的 `/api/ala/species` 接口（实时搜索？还是仅在本地已加载数据中匹配？）

---

# C — 后端全栈工程师

## 🔴 阻断性问题

### C-1：ALA biocache API URL 可能已过期

PRD 中使用的 URL：
```
https://biocache-ws.ala.org.au/ws/occurrences/search
```

ALA 的实际现行 biocache 服务地址为：
```
https://biocache.ala.org.au/ws/occurrences/search
```

`biocache-ws.ala.org.au` 是旧版域名，部分接口已迁移。Agent 如果直接使用 PRD 中的 URL，所有脚本和 API route 在运行时可能返回 404 或重定向失败。

**修复方案：** 在 PRD 中明确标注"Agent 应在开始编码前先验证 ALA API URL 的可用性，访问 `https://api.ala.org.au/` 确认当前服务端点"，并将 URL 提取到 `.env.local` 变量中。

### C-2：`/api/ala/occurrences` 存在 SSRF 漏洞

```typescript
const lsid = searchParams.get('lsid')
// 直接拼入上游请求：
url.searchParams.set('q', `lsid:${lsid}`)
```

`lsid` 参数未经任何验证。攻击者可以传入 `lsid=*:* OR lsid:something_else` 等 Solr 注入字符串，或者传入超长字符串触发上游 ALA 服务异常。虽然 ALA 是只读公开 API 风险有限，但属于输入验证缺失。

**修复方案：** 添加 lsid 格式验证：
```typescript
if (!lsid || !/^urn:lsid:[\w.:/-]+$/.test(lsid)) {
  return NextResponse.json({ error: 'Invalid lsid format' }, { status: 400 })
}
```

### C-3：`/api/llm/story` 无任何速率限制，存在 API 费用滥用风险

任何人可以无限制地向 `POST /api/llm/story` 发请求，每次调用都消耗 DeepSeek API 额度。对于一个公开的科普网站，这是严重的费用风险。

**修复方案：** PRD 必须要求实现基于 IP 的速率限制。在 Next.js 中可以使用 Vercel 的 `@vercel/kv` + 滑动窗口算法，或简单的 `Map<ip, {count, resetAt}>` 内存限制（每 IP 每分钟最多 5 次）。

## 🟡 重大风险

### C-4：Next.js `unstable_cache` 在 Vercel Edge Runtime 中行为不确定

```typescript
const fetchOccurrences = unstable_cache(
  async (...) => { ... },
  ['ala-occurrences'],
  { revalidate: 3600 }
)
```

`unstable_cache` 是 Next.js 的实验性 API，在 App Router 的 Route Handlers 中行为与 Server Components 中不同。且 cache key `['ala-occurrences']` 对所有请求共用，不包含 lsid 和年份参数，会导致所有物种的 occurrence 数据共享同一个缓存桶。

**修复方案：** cache key 应包含所有参数：`['ala-occurrences', lsid, yearFrom, yearTo]`，或改用更可靠的 `next: { revalidate: 3600 }` in fetch options。

### C-5：DeepSeek SSE 流的解析逻辑不完整

```typescript
const lines = chunk.split('\n').filter(l => l.startsWith('data: '))
```

SSE chunk 可能跨多个 TCP 数据包传输，单次 `reader.read()` 返回的字符串可能是不完整的行（如 `data: {"choices":[{"delta":{"cont`）。这个解析逻辑在网络不稳定时会静默丢失内容甚至触发 `JSON.parse` 异常。

**修复方案：** 需要维护一个 buffer 拼接跨 chunk 的不完整行：
```typescript
let buffer = ''
// 在 while 循环中：
buffer += decoder.decode(value, { stream: true })
const lines = buffer.split('\n')
buffer = lines.pop() ?? ''  // 最后一行可能不完整，保留到下次
```

---

# D — UI/UX 设计师

## 🔴 阻断性问题

**这是评审团最严重的发现。PRD v3.1 从头到尾没有一张线框图、没有一个具体的视觉布局规格、没有任何组件的像素/间距/颜色精确定义。Agent 在接到这份 PRD 时，对任何新增 UI 元素的呈现形式完全是在猜测。**

### D-1：新增组件的视觉规格全部缺失

PRD 新增了以下 UI 元素，但没有任何一个有视觉规格：

| 新增元素 | PRD 描述 | 缺失内容 |
|---|---|---|
| 环境音开关按钮 | "一个小图标按钮" | 位置（顶部哪里？右侧？左侧？）、尺寸、与其他控件的间距 |
| 扩展物种详情面板 | 有大致结构描述 | 实际的高度/布局比例、图标与文字的对齐方式、骨架屏动画方向 |
| 气泡云连接线 | "极细连接线，opacity 0.15" | 线宽、虚线间距（dashes 3 gaps 4 的视觉效果如何？） |
| 打字机效果光标 | `animate-pulse` + `▍` | 光标颜色、闪烁频率 |
| 云效果主气泡 vs 小气泡 | 有半径比例 | 视觉上应如何区分主次？边框粗细？投影强度？ |

### D-2：三种 InfoPanel 状态之间的过渡动画完全未定义

PRD 定义了三种面板状态（region/core-species/extended-species），但完全没有定义：
- 从 region → core-species 时，面板内容如何过渡（内容切换？还是整个面板重新滑出？）
- 从 core-species → extended-species 时，是直接替换还是有展开/收起动画？
- Framer Motion 的 AnimatePresence 包裹哪一层？key 如何设置？

现有 InfoPanel 已有 `x: 340 → 0` 的滑入动画，新的三状态设计是复用还是重写，PRD 没有说明。

### D-3：全国视图加载时序的用户体验未设计

PRD 定义了加载时序（T+0ms 到 T+3000ms），但没有设计这段时间内用户看到的 UI：
- 地图底图加载前用户看到什么？（白屏？骨架屏？）
- 核心物种加载时（T+100ms-500ms），气泡是逐一淡入还是一起出现？
- 扩展物种的渐进淡入有什么视觉提示让用户知道"还有更多内容在加载"？
- 是否需要一个"正在加载 xxx 种物种..."的进度提示？

## 🟡 重大风险

### D-4：移动端/平板完全没有设计规格

PRD 仅说"基础响应式即可"，但：
- 右侧 InfoPanel 在移动端（375px 宽）应该如何呈现？覆盖地图？底部抽屉？
- 底部 TimelineBar 在移动端如何处理（现有实现可能在小屏上挤压地图）？
- 气泡在触屏设备上的点击热区（现有 20px 的 hit circle 在手指操作下可能过小）？

这是现代网站产品不可忽视的基础规格。

### D-5：空状态和边界状态未设计

- 搜索结果为零时的空状态 UI
- 某个州完全没有扩展物种数据时，州视图右侧面板显示什么
- 时间轴在 1770 年时（最早期），大多数扩展物种不存在，地图几乎空白 — 是否需要引导文字？
- 扩展物种加载全部失败时，地图只显示 18 种 — 用户会以为这是 Bug

---

# E — 视觉美学总监

**这是本次审计最重要的维度。这个产品的灵魂是"治愈系互动自然绘本"，所有技术实现都必须服务于这个审美目标。PRD v3.1 在视觉层面存在方向性风险。**

## 🔴 阻断性问题

### E-1：100-200 种物种的气泡会破坏绘本地图的整体感

当 150 种扩展物种的分类图标气泡叠加到地图上时，视觉效果将从"绘本地图"退化成"数据散点图"。PRD 没有设计"视觉密度控制"机制：

- 全国视图下，150 种 × 2个气泡 = 300 个分类图标散布全图，会产生严重的视觉噪音
- 分类图标（鸟/兽/爬虫）本身风格如果不够精致，会与核心物种的精品插图气泡产生明显的品质落差
- PRD 没有规定扩展物种气泡的**视觉权重应明显低于核心物种**（更小？更透明？更模糊？）

**修复方案：** 需要明确的视觉层级规定：
- 核心物种气泡：完全不透明，有品牌色边框，有阴影
- 扩展物种气泡：默认透明度 0.45，无阴影，仅在 hover 时增强
- 全国视图下扩展物种气泡尺寸不超过核心物种的 60%

### E-2：动画参数规格不足以保证绘本质感

PRD 中的动画只指定了时间和部分运动参数，但没有指定最关键的**缓动曲线（easing）**，而缓动曲线决定了动画是"机械感"还是"生命感"。

- 云效果漂移：使用了 `ease: 'easeInOut'`，但没有指定是 `cubicBezier(0.45, 0, 0.55, 1)` 这样的标准 ease 还是更有弹性的 spring。绘本风格需要轻微的 overshoot（过冲）
- 气泡出现：PRD 没有定义出现动画，Agent 会默认 opacity fade-in，但绘本感需要的是 scale(0.7→1) + opacity(0→1) 的组合
- InfoPanel 弹出：现有 spring 参数（stiffness: 200, damping: 25）是否沿用？还是新状态有不同的弹性参数？
- 时间轴驱动的气泡大小变化：60ms 节流 + 线性插值会让气泡大小变化显得很机械，建议使用 spring 插值而非线性

### E-3：灭绝物种的"幽灵态"视觉没有精确规格

PRD 说灭绝物种气泡应该是"低 opacity + 去饱和"，但：
- 什么时候开始变化？是瞬间切换还是在接近 extinctYear 时渐变？
- 去饱和的程度？（PRD 说 `feColorMatrix values="0.15"` 但这是静态图片的烘焙值，与时间轴联动矛盾，见 B-2）
- 袋狼作为核心叙事物种，其灭绝视觉应该是整个地图上最有情绪张力的时刻，PRD 却用了和其他灭绝物种相同的通用处理

**修复方案：** 袋狼需要独立的灭绝动画规格：在 1936 年前后气泡应有特殊的消散效果（如：气泡裂解为若干小点后消失），区别于普通的 fade-out。

## 🟡 重大风险

### E-4：环境音与整体沉浸感的连接设计缺失

环境音是这个产品最有沉浸感的特性，但 PRD 没有设计：
- 环境音开启时，UI 上是否有视觉反馈（音波动画？地图上的微妙纹理变化？）
- 用户初次进入网站时是否自动播放环境音？（浏览器自动播放政策限制）
- 环境音开关的位置在 UI 中的「可发现性」（Discoverability）——用户怎么知道有环境音？

### E-5：核心物种插图文件不存在，但整个系统依赖它们

PRD 整个气泡渲染系统以 `species.illustration` 字段中的 SVG 文件为基础。然而：
- 项目中 `species.json` 里的 illustration 路径（如 `/assets/species/koala-illustration.svg`）指向的文件需要实际存在
- PRD 从未说明这些插图文件是否已存在、从哪里来、有什么风格规格
- 如果这些文件不存在，整个气泡头像系统会显示断图，Agent 无法自己画插图

**这是整个视觉系统的地基缺口。**

---

# F — 产品经理

## 🟡 重大风险

### F-1：序章动画在 PRD v3.1 中彻底消失，但它是产品第一印象

原 PRD v2.2 有详细的序章动画规格（"翻开绘本"，≤10秒）。现有代码库中可能有 `IntroSequence.tsx`。PRD v3.1 的 Phase 列表里没有任何关于序章的条目，也没有说明"删除"或"保留"。

Agent 在执行时面对这个歧义，最可能的行为是：忽略序章，直接进入地图。这会导致用户第一眼看到的是冷启动的空地图，而不是有吸引力的绘本体验。

### F-2："扩展物种故事由 LLM 运行时生成" 与科普准确性目标冲突

这是产品层面的核心矛盾：
- DeepSeek 生成的故事**没有经过人工审核**
- 对于科普教育产品，LLM 可能生成听起来合理但事实有误的内容（幻觉）
- PRD 没有任何内容审核机制：用户可能读到错误的自然科学信息

**PRD 必须解决这个问题。** 至少需要：
- LLM 输出底部添加"由 AI 生成，仅供参考"的免责标注
- 或者在 prompt 中明确要求 DeepSeek 不要输出无法核实的具体数字

### F-3：扩展物种中文名缺失，但产品的主要语言是中文

`extended-species.json` 只有 `nameEn` 和 `scientificName`，没有中文名。InfoPanel 在显示扩展物种时，要么显示英文名，要么显示学名，与整个产品的中文科普调性不符。

PRD 没有解决这个问题的方案。可行路径：通过 ALA API 的 `commonName` 字段 + 中文维基百科 API 联查，或在 LLM 故事生成 prompt 中要求同时生成中文名。

### F-4：时间轴播放速度（30年/秒）在 100-200 种物种下的体验没有重新评估

原始设计 30年/秒 对 18 种物种是合适的。当扩展到 200 种物种时，用户在 3秒内就从 1770 年播放到 1860 年，大量扩展物种的气泡会快速出现/消失，用户根本来不及看清楚。PRD 没有重新评估这个参数。

---

# G — PMO 项目管理

## 🟡 重大风险

### G-1：Phase 0 数据准备是最长耗时阶段，但在执行计划中被低估

Phase 0 包含 6 个脚本，其中：
- `setup:lsids`：18次 ALA API 调用，含300ms间隔，约 10 秒
- `setup:distribution`：18次 ALA occurrence 查询，每次 500 条记录，含500ms间隔，**约 15-20分钟**
- `setup:extended`：8个州 × 30种物种，含400ms间隔，约 15 分钟
- `setup:content`：18次 DeepSeek API 调用，含1000ms间隔，约 20 分钟
- 音频下载：24个文件，含600ms间隔，**约 20-30 分钟**（取决于网络）

**Phase 0 总耗时预计 1-1.5 小时，且是顺序执行不可并行化的。** Agent 在执行 Phase 0 时需要等待很长时间，且任何一个步骤失败都需要手动重试。

PRD 应当明确：哪些步骤可以部分失败继续执行，哪些步骤失败后必须从头重来。

### G-2：setup:all 脚本缺少 setup:audio，会导致音频文件缺失被忽略

```json
"setup:all": "npm run setup:lsids && npm run setup:distribution && npm run setup:extended && npm run setup:content && npm run setup:merge"
```

`setup:audio` 没有包含在 `setup:all` 中。Agent 运行 `npm run setup:all` 后会认为准备完成，但实际上音频文件一个都没有下载。

### G-3：各 Phase 的验收标准粒度不均匀

Phase 1（气泡渲染）的验收标准有 5 条可测试的具体检查项，但：
- Phase 6（LLM故事）只有"打字机效果在 1.5 秒内开始输出"一个模糊标准
- Phase 7（环境音）的验收里没有测试连接线样式是否正确
- Phase 9（动画打磨）没有任何可测试的验收标准，完全是主观判断

Agent 不能依赖主观判断做验收决策。

---

# H — 信息安全工程师

## 🔴 阻断性问题

### H-1：DeepSeek LLM 输出存在 XSS 风险

```typescript
<p className="text-[0.82rem] leading-6" style={{ color: 'var(--text-primary)' }}>
  {story}
  {isGenerating && <span className="animate-pulse">▍</span>}
</p>
```

`story` 是从 DeepSeek API 流式获取的原始文本，虽然 React 的 JSX `{story}` 会对 HTML 实体进行转义，但如果未来切换为 `dangerouslySetInnerHTML`（比如为了支持 Markdown 渲染），将直接暴露 XSS 风险。PRD 应明确：**LLM 输出只能以纯文本方式渲染，禁止使用 dangerouslySetInnerHTML**。

### H-2：DEEPSEEK_API_KEY 没有服务器端隔离说明

PRD 对 `DEEPSEEK_API_KEY` 的处理只有一行：

> "读取 `DEEPSEEK_API_KEY` 环境变量"

没有说明：
- 此 key 是否只在 server-side 使用（需要确认，不能出现在 `NEXT_PUBLIC_` 前缀中）
- Vercel 部署时如何配置（Environment Variables 面板）
- 本地开发时是否有 `.env.local` 的 git 保护（`.gitignore` 是否包含 `.env*.local`，现有项目已有但PRD未提及）

## 🟡 重大风险

### H-3：音频下载脚本的 `downloadFile` 函数直接将上游 URL 写入本地文件，无内容验证

```typescript
async function downloadFile(url, destPath) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`下载失败: ${res.status}`)
  const ws = createWriteStream(destPath)
  await pipeline(res.body, ws)
}
```

如果 xeno-canto 或 freesound 的 URL 被恶意替换（中间人攻击），脚本会将任意文件写入 `public/assets/audio/` 目录。对于 CI 环境中的自动化脚本，这是一个供应链安全风险。

**修复方案：** 至少验证 Content-Type 头必须是 `audio/mpeg` 或 `audio/ogg`。

---

# I — 数据工程师

## 🔴 阻断性问题

### I-1：灭绝物种（袋狼、豚足袋狸）在 ALA 中 occurrence 记录极少，但 PRD 未处理此边界

袋狼（Thylacinus cynocephalus）灭绝于 1936 年，ALA 中的 occurrence records 主要来自博物馆标本和历史文献，数量可能极少（< 50 条），且全部集中在塔斯马尼亚。`fetch-distribution-points.mjs` 中的代码：

```javascript
if (occurrences.length < 3) {
  // 使用 geoPoint 兜底
  sp.distributionPoints = [{ lat: sp.geoPoint.lat, lng: sp.geoPoint.lng, weight: 1.0 }]
}
```

如果袋狼有 20 条记录（> 3 但远少于期望），k-means 仍会尝试聚类，结果可能是极不代表实际分布的簇中心。PRD 应将阈值提高到更合理的值（如 20 条），并对灭绝物种的数据质量有专门说明。

### I-2：ALA occurrence 数据的时间维度与时间轴的联动关系设计有缺陷

PRD 的 `fetch-distribution-points.mjs` 使用 `yearFrom=1970, yearTo=2024` 的固定窗口查询所有物种的当代分布，然后将此分布用于所有历史年份（1770-2024）的气泡显示。

这意味着：**1788 年的考拉气泡，其位置和密度是基于 1970-2024 年的观察记录**。这在科学上是不准确的，因为考拉在 1900 年代遭到大规模猎杀，其 1900 年的实际分布范围远大于 2024 年。

**这是整个时间轴驱动的数据基础问题，PRD 没有解决方案。**

可行的修复路径（需在 PRD 中明确）：
- 对每个关键年份分别查询 occurrence（会极大增加数据量和 API 调用次数）
- 或者：明确声明"气泡位置仅代表当代分布，气泡大小通过 populationScore 时间插值反映种群变化，位置不随时间移动"，并在 UI 上向用户说明此限制

### I-3：`fetch-distribution-points.mjs` 中同时传了 `fields` 和 `fl` 参数

```javascript
url.searchParams.set('fields', 'decimalLatitude,decimalLongitude,year')
url.searchParams.set('pageSize', String(pageSize))
url.searchParams.set('fl', 'decimalLatitude,decimalLongitude,year')
```

`fields` 和 `fl` 是同一个功能的两种写法（ALA biocache 的 Solr 参数兼容），传两次会导致参数冲突。应只保留一个（推荐 `fl`）。

---

# J — 内容与法务顾问

## 🔴 阻断性问题

### J-1：音频版权归属必须在 UI 中显示，但 PRD 完全未规定归属展示位置

xeno-canto 的 Creative Commons 录音要求在使用时注明：
- 录音者姓名
- 录音来源链接
- 许可证类型（CC BY-SA / CC BY-NC-SA 等）

freesound 的 CC-BY 授权要求在下载物使用处注明来源。

PRD 的 `downloadFromXenoCanto` 函数收集了 `attribution` 字段，但：
1. 这个 attribution 字符串没有被存入任何数据文件
2. AudioPlayer 组件没有任何归属展示的 UI 规格
3. 用户播放动物声音时看不到任何版权声明

**这是法律合规问题，不是可选改进。**

**修复方案：**
- 音频下载脚本的 `report.json` 要存储 `attribution` 字段
- `audio.json` 需要新增 `attribution` 字段
- `AudioPlayer` 组件必须在播放器底部显示一行小字的版权信息

### J-2：DeepSeek 是中国企业，在澳大利亚科普教育场景中有潜在的数据合规问题

用户在点击扩展物种时，其查询行为（物种ID、时间戳、IP）会通过 Next.js API route 转发给 DeepSeek 服务器。对于一个以澳大利亚自然保护为主题、可能被澳大利亚学校使用的教育产品：

- 澳大利亚的隐私法（Privacy Act 1988）要求告知用户数据被转发给第三方
- 学校使用场景下可能涉及未成年人数据

**PRD 至少需要说明：隐私政策页面的内容要求，以及 DeepSeek API 调用是否记录用户请求内容。**

---

# K — 无障碍与包容性工程师

## 🟡 重大风险

### K-1：整个 PRD 没有任何 a11y（无障碍）规格

对于一个科普教育产品，基础无障碍是道德要求，也越来越成为法律要求（澳大利亚的 DDA）。

PRD v3.1 中完全没有：
- 气泡的 `aria-label` 规格（屏幕阅读器如何读出"袋狼，1936年灭绝，点击查看详情"？）
- 键盘导航（用 Tab 键能否遍历地图上的气泡？）
- 环境音对听觉障碍用户的替代体验
- 色彩对比度要求（暖色系低对比度设计可能对色觉障碍用户不友好）
- 动画减少模式（现有代码有 `useReducedMotion`，但新增的云效果漂移没有 reduced motion 处理）

### K-2：浏览器 WebGL 不支持时无降级处理

MapLibre GL 依赖 WebGL。在不支持 WebGL 的浏览器（老旧设备、某些企业浏览器策略）上，地图完全无法渲染，用户会看到一个空白页面。PRD 没有任何降级方案说明。

---

# L — DevOps 与部署工程师

## 🟡 重大风险

### L-1：部署平台完全未指定，但 API Routes 的行为高度依赖平台

PRD 使用了 `unstable_cache`（Next.js Server Cache），其行为在 Vercel、Railway、自托管 Node.js 上完全不同：
- Vercel：有 Data Cache，`unstable_cache` 工作正常
- 自托管 Node.js：`unstable_cache` 可能不持久化，每次请求都重新执行

PRD 必须指定部署平台。推荐 Vercel（与 Next.js 最兼容），并说明：
```
# 推荐部署方式：Vercel
# API Routes 自动变为 Serverless Functions
# Edge Runtime 不支持 Node.js stream，需要 Node.js Runtime
# 在 route.ts 中添加：export const runtime = 'nodejs'
```

### L-2：Phase 8 音频下载脚本在 CI/CD 环境中不可执行

音频文件下载脚本依赖 Freesound API key 和网络访问，不适合在 CI 管道中运行。但如果音频文件不提交到 git（因为 MP3 文件过大），部署时 `public/assets/audio/` 目录将为空。

PRD 没有说明音频文件的管理策略：
- 选项 A：提交到 git（文件过大，不推荐）
- 选项 B：使用 Git LFS
- 选项 C：部署前手动上传到 CDN / S3，URL 写入配置

---

# M — 科普教育顾问

## 🟡 重大风险

### M-1：时间轴的"推断层"（1770 年前）对于扩展物种完全没有数据支撑

PRD 沿用了原有的三层时间设计（推断层/事实层/Now），但对于 100-200 种扩展物种，1788 年之前的分布数据根本不存在。用户将时间轴拖到 1770 年时：
- 核心 18 种有手工编写的 timelineNarratives 说明
- 扩展物种的气泡会依然显示（基于 1970-2024 的分布数据），但没有任何叙事说明这是推断还是记录

这会让用户误以为 1770 年就有这么多有据可查的物种分布，产生错误的历史认知。

**修复方案：** 在时间轴处于推断层时，扩展物种气泡应降低 opacity 并在底部显示免责提示："推断层：1788 年之前的扩展物种分布数据基于当代记录推断，仅作参考。"

### M-2：LLM 生成的趣味故事未经科学审核就直接展示

对于扩展物种，用户点击后看到的故事完全由 DeepSeek 实时生成，没有任何科学家或博物学者的审核。对于科普教育产品，这是内容可信度的核心问题。

建议在 PRD 中明确：
- 在每个 LLM 故事底部显示"🤖 AI 生成故事 · 科学数据来源：ALA"
- 与核心物种的人工审核内容做视觉区分

---

# 汇总：必须在 PRD v3.2 中修复的问题

## 🔴 必须修复（14项，Agent 无法正确执行）

| 编号 | 问题 | 来源 |
|---|---|---|
| R-1 | 0.3节与代码实现的k-means矛盾 | A-1 |
| R-2 | merge-species-content.mjs 缺少 import | A-2 |
| R-3 | buildBubbleSvg 灭绝判断 Bug + 与时间轴联动矛盾 | B-2 |
| R-4 | MapLibre icon-size 不是像素值，缺换算公式 | B-3 |
| R-5 | ExtendedSpeciesInfo 引用未定义函数（hexToRgb等） | B-1 |
| R-6 | ALA biocache API URL 可能已过期 | C-1 |
| R-7 | /api/llm/story 无速率限制 | C-3 |
| R-8 | DeepSeek SSE 流解析不处理跨chunk情况 | C-5 |
| R-9 | 音频版权归属未在UI显示（法律合规）| J-1 |
| R-10 | 核心物种插图文件是否存在从未说明 | E-5 |
| R-11 | setup:all 脚本遗漏 setup:audio | G-2 |
| R-12 | ALA occurrence 时间维度与时间轴联动缺乏科学设计 | I-2 |
| R-13 | 序章动画（Intro Animation）完全从PRD消失 | B-4, F-1 |
| R-14 | 云效果DOM气泡的 map.on('move') 缺少 rAF 节流 | A-5 |

## 🟡 重大风险（需在 PRD v3.2 中有明确处理方案，12项）

| 编号 | 问题 | 来源 |
|---|---|---|
| W-1 | 新增UI组件无任何视觉规格（零线框图）| D-1 |
| W-2 | 三态InfoPanel的过渡动画未定义 | D-2 |
| W-3 | 扩展物种视觉层级未规定，会破坏绘本整体感 | E-1 |
| W-4 | 动画缓动曲线未指定，绘本质感无法保证 | E-2 |
| W-5 | 移动端/平板设计完全缺失 | D-4 |
| W-6 | 扩展物种中文名缺失 | F-3 |
| W-7 | DeepSeek LLM 输出的科学准确性无审核机制 | F-2, M-2 |
| W-8 | 部署平台未指定，unstable_cache 行为不确定 | L-1 |
| W-9 | 音频文件的git/CDN管理策略未定义 | L-2 |
| W-10 | SSRF 漏洞（lsid 参数未验证）| C-2 |
| W-11 | Phase 0 总耗时1.5小时被低估，失败重试策略缺失 | G-1 |
| W-12 | 推断层（1770前）扩展物种气泡的科学免责未设计 | M-1 |

---

# 评审团结论

**PRD v3.1 在技术架构层面已经相当完整，相比 v3.0 有质的提升。但存在以下根本性缺陷：**

1. **UI/视觉层是最大的空洞。** 整份文档没有一张视觉参考，Agent 对所有新增 UI 元素的视觉实现将完全依赖猜测，最终结果与设计目标（治愈系绘本）可能严重偏差。

2. **存在 14 个 Agent 无法正确执行的阻断性错误，** 其中包括代码 Bug、API URL 错误、脚本语法错误、法律合规缺失。

3. **科学准确性与产品定位的矛盾未解决。** 气泡分布数据基于当代记录而非历史分布，在时间轴驱动的科普产品中，这是一个需要在 PRD 层面明确处理方式的设计决策，而非留给 Agent 自行判断。

4. **序章动画丢失。** 这是产品的第一印象，其缺失会导致冷启动体验大幅下降。

**评审团建议：输出 PRD v3.2，集中解决所有 R 级问题，并为 UI 新增一个「UI 规格附录」章节。**
