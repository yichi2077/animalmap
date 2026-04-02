# 澳洲野生动物时空图谱 — PRD v3.0
> 面向 Claude Code 的执行版本  
> 产品阶段：MVP+  
> 基于现有项目增量重构，非推倒重来  
> 文档语言：中文

---

## 0. 写给 Claude Code 的执行说明

本文件是在现有项目（Next.js + MapLibre GL + Framer Motion）基础上的增量重构指令。  
**不要推倒重来**。现有的 AtlasContext、TimelineBar、interpolateKeyframes、地图底座、区域点击逻辑均应保留复用。  
本 PRD 描述的是：哪些模块需要新建、哪些需要重构、哪些可以直接复用。

### 核心技术决策一览（已锁定，不可更改）

| 决策项 | 结论 |
|---|---|
| 地图引擎 | MapLibre GL（保留） |
| 前端框架 | Next.js 14 + React 18 + TypeScript（保留） |
| 动画库 | Framer Motion（保留） |
| 地图样式 | 绘本风暖色系（保留现有 map-style） |
| 物种数量 | 核心层 18 种 + 扩展层 ~100-200 种（ALA 驱动） |
| ALA 数据 | 运行时调用，Next.js API route 代理 |
| LLM | DeepSeek API（用户自行配置 API key） |
| LLM 调用时机 | 仅扩展物种点击时运行时调用；核心 18 种预生成存 JSON |
| 第一屏策略 | 核心 18 种静态先显示，扩展物种异步渐进叠加 |
| 气泡头像 | 核心 18 种用专属插图，扩展物种接口预留（用户后续提供） |
| 音频 | 核心 18 种真实/AI音频 + 自动下载脚本；地貌分区环境音 |
| 环境音粒度 | 区域内按地貌分区（沿海/内陆/雨林/沙漠/温带森林/草原） |

---

## 1. 项目现状诊断

### 1.1 可以直接复用的模块

- `contexts/AtlasContext.tsx` — 状态管理，新增若干字段即可
- `components/TimelineBar.tsx` — 基本不动
- `lib/interpolate.ts` — 完全保留
- `lib/constants.ts` — 保留，可扩展
- `lib/species-ui.ts` — 保留，扩展支持动态物种
- `data/geo/australian-states.min.json` — 完全保留
- `data/regions.json` — 保留
- `data/timeline.json` — 保留核心 18 种数据

### 1.2 需要重构的模块

- `components/AustraliaMap.tsx` — 气泡渲染系统完全重构
- `components/InfoPanel.tsx` — 三状态扩展，新增扩展物种详情态
- `data/species.json` — 字段扩充
- `data/audio.json` — 字段扩充，新增环境音 mapping

### 1.3 需要新建的模块

```
新建内容总览：
├── app/api/ala/occurrences/route.ts     — ALA occurrence 代理
├── app/api/ala/species/route.ts         — ALA 物种搜索代理
├── app/api/llm/story/route.ts           — DeepSeek 故事生成代理
├── lib/ala-client.ts                    — ALA API 客户端封装
├── lib/ambient-audio.ts                 — 环境音地貌分区逻辑
├── lib/bubble-aggregation.ts            — ALA occurrence 聚合为气泡点
├── hooks/useALASpecies.ts               — ALA 物种数据 hook
├── hooks/useAmbientAudio.ts             — 环境音控制 hook
├── scripts/fetch-audio.mjs             — 音频自动下载脚本
└── data/ambient-audio.json             — 地貌分区环境音 mapping
```

---

## 2. 气泡可视化系统重构规格（最高优先级）

### 2.1 气泡层级架构

地图上的物种气泡分为两个渲染层：

#### A. 全国聚合层（默认视图）

**数据来源：**  
- 核心 18 种：来自 `species.json` 的静态分布点数组（新增字段 `distributionPoints`）
- 扩展物种：来自 ALA API 的 occurrence 记录，前端聚合

**渲染规则：**
- 每种动物在全国视图显示 **3-8 个代表性气泡**（由聚合算法决定）
- 全国视图同时展示多个不同物种的气泡，视觉上呈现"大陆上的生命多样性"
- 气泡大小 = `baseRadius * populationScore`，基准半径由物种分组决定
- 核心物种气泡用动物插图作为圆形头像
- 扩展物种气泡使用分类通用图标（鸟类/哺乳类/爬行类等），图标占位接口预留

**聚合算法（`lib/bubble-aggregation.ts`）：**

```typescript
// 将 ALA occurrence 记录聚合为 N 个代表性分布点
function aggregateOccurrences(
  occurrences: {lat: number, lng: number, year: number}[],
  targetYear: number,
  maxBubbles: number = 8
): BubblePoint[]

// 输出格式
interface BubblePoint {
  lat: number
  lng: number
  weight: number        // 该点的相对密度权重 0-1
  radius: number        // 实际渲染半径（像素）
  isRepresentative: boolean  // 是否为主气泡（携带动物头像）
}
```

聚合策略：
1. 按目标年份过滤 occurrence（前后 25 年滑动窗口）
2. 用 k-means（k=maxBubbles）将坐标聚合为代表点
3. 每个簇的 weight = 该簇内 occurrence 数量 / 总数量
4. 选密度最大的簇作为主气泡（`isRepresentative: true`）

#### B. 州内分布层（点击州后激活）

- 显示该州内所有物种的气泡，密度提高（每种动物最多 15 个气泡）
- 随时间轴移动，气泡位置做插值平移、大小做插值缩放
- 位置变化使用 Framer Motion 的 layout animation，不要用 CSS transition

#### C. 单物种云层（点击具体物种后激活）

- 该物种的所有分布点以完整精度显示（最多 50 个气泡）
- 1 个主气泡（动物头像，较大，`radius * 1.6`）位于密度中心
- 周围 N 个小气泡（同物种，半透明，`radius * 0.6-0.9`，微随机偏移）
- 小气泡与主气泡之间有极细的连接线（opacity 0.15，类似蜘蛛网）
- 整体云效果：小气泡绕主气泡做极慢速的漂移动画（周期 8-12s，位移 ±4px）
- 其他物种气泡降低 opacity 到 0.12

### 2.2 气泡组件规格（MapLibre Symbol Layer）

**不使用 DOM marker，全部走 MapLibre GeoJSON Source + Symbol Layer：**

```typescript
// GeoJSON feature 的 properties 字段
interface BubbleFeatureProperties {
  speciesId: string
  isCore: boolean           // 是否核心 18 种
  isRepresentative: boolean // 是否主气泡
  radius: number
  opacity: number
  iconImageId: string       // 预加载到 map 的图片 ID
  color: string
  populationScore: number
  layerType: 'national' | 'regional' | 'cloud'
}
```

**图片预加载策略：**
- 核心 18 种：启动时预加载所有插图（圆形裁剪，带气泡边框的 SVG 包装）
- 扩展物种：用分类图标（6种：bird / mammal / reptile / marine / amphibian / invertebrate）
- 气泡图片规格：88x88px，2x pixel ratio，圆形，带 2px 彩色边框，底部轻阴影

### 2.3 核心 species.json 字段扩充

在现有字段基础上新增：

```json
{
  "id": "koala",
  "distributionPoints": [
    {"lat": -33.8, "lng": 151.2, "weight": 0.8},
    {"lat": -27.5, "lng": 153.0, "weight": 0.6},
    {"lat": -37.8, "lng": 145.0, "weight": 0.7}
  ],
  "taxonomicClass": "mammal",
  "funFacts": [
    "考拉每天睡眠时间长达 18-22 小时，为了保存消化桉树叶所需的能量。",
    "考拉的指纹与人类几乎无法区分，即使在高倍显微镜下也极为相似。",
    "考拉宝宝出生时只有一粒葡萄大小，要在妈妈的育儿袋里待 6-7 个月。"
  ],
  "storyNarrative": "在桉树林的高处，有一种动物把整个世界变成了一张床……（预生成的沉浸叙事）",
  "timelineNarratives": {
    "1788": "殖民者到来前，考拉遍布澳大利亚东部的桉树林，数量估计超过一千万只。",
    "1900": "皮毛贸易高峰期，考拉遭到大规模猎杀，部分地区种群几近消失。",
    "1935": "保护法案开始实施，但栖息地破坏已造成不可逆的影响。",
    "1950": "种群缓慢恢复，但城市扩张持续压缩栖息地。",
    "2024": "2022年被正式列为濒危物种。野火、干旱和疾病使种群面临严峻威胁。"
  }
}
```

---

## 3. ALA 数据层规格

### 3.1 ALA API 代理（`app/api/ala/occurrences/route.ts`）

**接口规格：**

```
GET /api/ala/occurrences?speciesId={alaLsid}&yearFrom={year}&yearTo={year}&limit={n}
```

**代理逻辑：**
1. 接收前端请求
2. 转发至 `https://biocache-ws.ala.org.au/ws/occurrences/search`，参数：
   - `q=lsid:{alaLsid}`
   - `fq=year:[{yearFrom} TO {yearTo}]`
   - `fields=decimalLatitude,decimalLongitude,year,month`
   - `pageSize={limit}`（最大 500）
3. 清洗：过滤掉坐标为空或超出澳大利亚边界的记录
4. 缓存：使用 Next.js `unstable_cache` 缓存 1 小时（相同参数不重复请求 ALA）
5. 返回清洗后的数组

**ALA LSID 映射（`data/ala-lsid-map.json`）：**

```json
{
  "koala": "urn:lsid:biodiversity.org.au:afd.taxon:e9d6fbbd-1505-4073-990a-dc66c930dad6",
  "thylacine": "urn:lsid:biodiversity.org.au:afd.taxon:d0c3d52b-8f29-4e5e-a389-fdeacb7d45a2",
  ...
}
```

核心 18 种的 LSID 需要预先查询并填入此文件。Claude Code 需调用 ALA species search API 查询：

```
GET https://api.ala.org.au/species/search?q={scientificName}&fq=idxtype:TAXON
```

### 3.2 ALA 物种搜索代理（`app/api/ala/species/route.ts`）

用于扩展物种的动态搜索：

```
GET /api/ala/species?q={keyword}&stateTerritory={stateId}&limit=50
```

返回物种列表，包含：`lsid`, `nameComplete`, `commonName`, `kingdom`, `phylum`, `class`

### 3.3 前端数据获取 Hook（`hooks/useALASpecies.ts`）

```typescript
function useALASpecies(options: {
  stateId?: string        // 按州过滤
  yearRange?: [number, number]
  maxSpecies?: number
}) : {
  species: ExtendedSpecies[]
  isLoading: boolean
  error: string | null
}
```

**调用时机：**
- 用户点击某个州 → 触发该州的 ALA 物种搜索（如果尚未缓存）
- 全国视图加载完核心 18 种后 → 后台静默拉取扩展物种（每次最多 50 种，分批）

**内存缓存策略：**
- 用 `useRef` 存储已拉取的物种数据，避免重复请求
- 按州分 bucket 缓存（`cache[stateId] = [...]`）

---

## 4. LLM 故事生成规格

### 4.1 后端路由（`app/api/llm/story/route.ts`）

**接口规格：**

```
POST /api/llm/story
Body: {
  speciesId: string
  nameZh: string
  nameEn: string
  scientificName: string
  dangerStatus: string
  taxonomicClass: string
  currentYear: number
}
```

**DeepSeek 调用规格：**

```typescript
const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    model: 'deepseek-chat',
    messages: [
      {
        role: 'system',
        content: `你是一名擅长写趣味科普的自然博物作家。风格：口语化、有画面感、适合大众阅读、不要写成百科词条。字数控制在150字以内。`
      },
      {
        role: 'user',
        content: `请为这种澳大利亚动物写一段有趣的小故事或冷知识：
物种：${nameZh}（${nameEn}，学名：${scientificName}）
保护状态：${dangerStatus}
当前时间背景：${currentYear}年
要求：有细节、有画面感、有记忆点，不要干燥地列数据。`
      }
    ],
    max_tokens: 300,
    temperature: 0.8,
    stream: true  // 使用流式输出，前端可以看到打字机效果
  })
})
```

**流式响应处理：**
- 后端使用 `ReadableStream` 将 DeepSeek 的 SSE 流透传给前端
- 前端 InfoPanel 中扩展物种的故事区域显示打字机动画效果

### 4.2 环境变量配置（`.env.local` 模板）

```
# DeepSeek API
DEEPSEEK_API_KEY=your_key_here

# ALA（无需 key，但保留配置项便于未来扩展）
ALA_BASE_URL=https://biocache-ws.ala.org.au/ws
ALA_SPECIES_URL=https://api.ala.org.au/species

# 可选：请求限速
ALA_RATE_LIMIT_MS=200
```

---

## 5. 音频系统规格

### 5.1 动物声音自动下载脚本（`scripts/fetch-audio.mjs`）

**脚本功能：**

自动从 xeno-canto（鸟类）和 freesound（其他）下载核心 18 种动物的真实录音。

```javascript
// 脚本结构
const SPECIES_AUDIO_CONFIG = [
  {
    id: 'kookaburra',
    type: 'real',
    source: 'xeno-canto',
    query: 'Dacelo novaeguineae',  // 学名搜索
    targetFile: 'public/assets/audio/kookaburra.mp3',
    maxDurationSeconds: 30,
    quality: 'A'  // xeno-canto 录音质量等级
  },
  {
    id: 'koala',
    type: 'real',
    source: 'freesound',
    query: 'koala call Australia',
    targetFile: 'public/assets/audio/koala.mp3',
    license: ['cc0', 'cc-by']  // 只接受这些授权类型
  },
  {
    id: 'thylacine',
    type: 'ai_note',  // 标记为需要 AI 模拟，脚本跳过下载，输出提示
    targetFile: 'public/assets/audio/thylacine.mp3',
    note: '已灭绝物种，需要 AI 模拟音频，请手动添加'
  }
]
```

**xeno-canto API 调用流程：**
1. `GET https://xeno-canto.org/api/2/recordings?query={scientificName}+q:A+cnt:Australia`
2. 取第一条结果的 `file` 字段（直链 MP3）
3. 下载并截取前 30 秒（用 ffmpeg 或直接下载后标注时长）
4. 保存至 `public/assets/audio/{id}.mp3`

**freesound API 调用流程：**
1. 需要 freesound API key（免费注册）
2. `GET https://freesound.org/apiv2/search/text/?query={query}&filter=license:("Creative Commons 0" OR "Attribution")&fields=id,name,download`
3. 取评分最高的结果下载

**脚本执行方式：**
```bash
node scripts/fetch-audio.mjs
```

脚本应输出每个物种的下载状态，并生成 `scripts/audio-report.json` 记录哪些已下载、哪些是 AI 模拟占位。

### 5.2 环境音系统（`lib/ambient-audio.ts`）

**地貌分区定义（`data/ambient-audio.json`）：**

```json
{
  "zones": [
    {
      "id": "tropical_rainforest",
      "label": "热带雨林",
      "audio": "/assets/audio/ambient/tropical-rainforest.mp3",
      "regions": [
        {"stateId": "qld", "latRange": [-17, -10], "lngRange": [143, 146]}
      ]
    },
    {
      "id": "coastal",
      "label": "沿海",
      "audio": "/assets/audio/ambient/coastal-waves.mp3",
      "regions": [
        {"stateId": "nsw", "latRange": [-38, -28], "lngRange": [151, 154]},
        {"stateId": "vic", "latRange": [-39, -37], "lngRange": [140, 150]},
        {"stateId": "wa", "latRange": [-35, -22], "lngRange": [113, 116]},
        {"stateId": "sa", "latRange": [-38, -32], "lngRange": [135, 139]},
        {"stateId": "tas", "latRange": [-43, -40], "lngRange": [144, 148]}
      ]
    },
    {
      "id": "outback_desert",
      "label": "内陆沙漠",
      "audio": "/assets/audio/ambient/outback-desert.mp3",
      "regions": [
        {"stateId": "nt", "latRange": [-26, -14], "lngRange": [129, 138]},
        {"stateId": "wa", "latRange": [-32, -22], "lngRange": [118, 129]},
        {"stateId": "sa", "latRange": [-32, -26], "lngRange": [130, 141]}
      ]
    },
    {
      "id": "temperate_forest",
      "label": "温带森林",
      "audio": "/assets/audio/ambient/temperate-forest.mp3",
      "regions": [
        {"stateId": "tas", "latRange": [-44, -41], "lngRange": [145, 148]},
        {"stateId": "vic", "latRange": [-38, -36], "lngRange": [146, 149]}
      ]
    },
    {
      "id": "savanna",
      "label": "热带稀树草原",
      "audio": "/assets/audio/ambient/savanna.mp3",
      "regions": [
        {"stateId": "qld", "latRange": [-26, -17], "lngRange": [138, 148]},
        {"stateId": "nt", "latRange": [-14, -10], "lngRange": [130, 136]}
      ]
    },
    {
      "id": "ocean",
      "label": "海洋",
      "audio": "/assets/audio/ambient/ocean-deep.mp3",
      "regions": []
    }
  ],
  "fallback": "outback_desert"
}
```

**环境音 Hook（`hooks/useAmbientAudio.ts`）：**

```typescript
function useAmbientAudio() {
  // 输入：点击坐标或 stateId
  // 输出：播放对应环境音，自动交叉淡入淡出

  const playAmbientForCoordinate: (lat: number, lng: number) => void
  const playAmbientForState: (stateId: string) => void
  const stopAmbient: () => void
  const setVolume: (vol: number) => void
}
```

**交叉淡入淡出规格：**
- 当前播放音频 → 1.5 秒内淡出（0 → volume）
- 新音频 → 1.5 秒内淡入（volume → 0）
- 音量上限：0.35（环境音不能压过 UI 操作感）
- 用户可在顶部 UI 关闭环境音

**环境音音源获取（通过 scripts/fetch-audio.mjs 同步下载）：**

| 地貌类型 | Freesound 推荐搜索词 |
|---|---|
| 热带雨林 | `tropical rainforest australia birds` |
| 沿海 | `ocean waves australia beach` |
| 内陆沙漠 | `outback australia desert wind` |
| 温带森林 | `temperate forest australia birds creek` |
| 热带草原 | `savanna australia grassland wind` |
| 海洋 | `underwater ocean deep` |

---

## 6. InfoPanel 三态重构规格

### 6.1 面板状态机

```
InfoPanel 状态：
├── closed（无焦点）
├── region（点击了某州）
│   ├── 显示该州的物种气泡分布摘要
│   └── 右侧列表：核心物种（带插图）+ 扩展物种（带分类图标）
├── core-species（点击了核心 18 种）
│   ├── 动物头像 + 名称 + 学名
│   ├── 濒危等级条（现有 UI 保留）
│   ├── 当前年份的 timelineNarrative
│   ├── funFacts（3条，卡片式展示）
│   ├── storyNarrative（沉浸叙事段落）
│   └── 音频播放器（现有 UI 保留）
└── extended-species（点击了扩展物种）
    ├── 分类图标 + 名称（中英双语）
    ├── ALA 数据：最后记录时间、记录数量、保护等级
    ├── LLM 故事区域（流式打字机动画，加载态显示占位线条）
    └── "在 ALA 查看完整数据" 外链按钮
```

### 6.2 扩展物种详情的加载态 UI

```
加载中状态：
┌─────────────────────────────────┐
│ [图标]  物种名称                  │
│         英文名 · 学名             │
│                                  │
│ ████████████████  ← 骨架屏线条   │
│ ██████████████████████           │
│ ████████████████                 │
│                                  │
│ 正在为你查阅这种动物的故事...      │  ← loading 文案
└─────────────────────────────────┘
```

打字机效果：使用 React state 逐字符追加，速度约 25ms/字符。

---

## 7. AtlasContext 扩充规格

在现有状态基础上新增：

```typescript
interface AtlasState {
  // 现有字段（保留）
  currentYear: number
  isPlaying: boolean
  focusRegionId: string | null
  selectedSpeciesId: string | null
  searchKeyword: string
  hasSeenIntro: boolean
  isNowMode: boolean

  // 新增字段
  ambientAudioEnabled: boolean       // 环境音开关
  ambientZoneId: string | null       // 当前环境音地貌区 ID
  extendedSpeciesLoaded: boolean     // 扩展物种是否已异步加载
  selectedSpeciesIsCore: boolean     // 当前选中的是否为核心物种
  clickedCoordinate: [number, number] | null  // 最后点击地图坐标（用于环境音触发）
}

interface AtlasActions {
  // 现有 actions（保留）
  ...

  // 新增 actions
  toggleAmbientAudio: () => void
  setAmbientZone: (zoneId: string | null) => void
  setExtendedSpeciesLoaded: (loaded: boolean) => void
  setClickedCoordinate: (coord: [number, number] | null) => void
}
```

---

## 8. 气泡渲染动画规格

### 8.1 时间轴驱动的气泡动画

时间轴拖动时，气泡变化需要满足：

- **大小变化**：`radius` 在相邻关键帧之间线性插值，每帧更新（throttle 到 60ms）
- **位置变化**：只在关键年份有明显位移（如甘蔗蟾蜍 1935→1950 的扩散），中间年份插值
- **出现/消失**：`opacity` 淡入淡出，不要突然显隐

### 8.2 云效果的小气泡漂移

```typescript
// 每个小气泡有独立的漂移动画参数
interface CloudBubble {
  basePosition: {lat: number, lng: number}
  driftAmplitude: number    // 漂移幅度，单位像素，范围 2-6
  driftPeriod: number       // 漂移周期，单位秒，范围 8-14（随机）
  driftPhase: number        // 相位偏移，0-2π（随机，避免同步）
}
```

漂移动画用 `requestAnimationFrame` 驱动，更新每个小气泡的 pixel offset，然后用 MapLibre 的 `panBy` 逻辑的逆运算转回经纬度。实际上更简单的做法是：把云层小气泡改为 HTML DOM 绝对定位元素（通过 `map.project` 获取屏幕坐标），而不是 MapLibre symbol，这样 Framer Motion 可以直接驱动漂移动画。

**推荐实现：**
- 主气泡（representative）：继续用 MapLibre symbol layer
- 云层小气泡：改为 React Portal 渲染的 DOM 元素，用 `map.project` 获取屏幕坐标，Framer Motion 控制漂移

---

## 9. 渐进式加载流程

### 9.1 第一屏展示时序

```
T+0ms    页面加载
T+100ms  地图底图初始化完成
T+300ms  核心 18 种静态分布点从 species.json 读取，气泡渲染开始
T+500ms  序章动画触发（如果 hasSeenIntro = false）
T+1000ms 序章动画结束，地图可交互
T+1500ms 后台静默触发扩展物种 ALA 请求（第一批，优先当前视野内的物种）
T+3000ms 扩展物种气泡开始陆续出现（opacity 淡入，不干扰主界面）
...持续加载，直到 extendedSpeciesLoaded = true
```

### 9.2 扩展物种批量加载策略

```typescript
// 分批加载扩展物种，每批间隔 800ms，避免 ALA 请求风暴
async function loadExtendedSpeciesBatched(stateId?: string) {
  const batchSize = 20
  const batches = chunkArray(extendedSpeciesLsids, batchSize)
  
  for (const batch of batches) {
    const results = await Promise.all(
      batch.map(lsid => fetchALAOccurrences(lsid, currentYearRange))
    )
    // 每批数据到达后立即更新地图，不等全部完成
    dispatch({ type: 'ADD_EXTENDED_SPECIES', payload: results })
    await sleep(800)
  }
}
```

---

## 10. 扩展物种初始集（ALA 推荐查询）

Claude Code 需要调用 ALA 物种搜索 API，按以下条件查询构建扩展物种初始集：

**查询策略：**

```bash
# 按州查询，每州取 top 20 个有足够 occurrence 记录的物种
GET https://api.ala.org.au/species/search
  ?q=*
  &fq=stateConservation:*  
  &fq=class:(Aves OR Mammalia OR Reptilia OR Amphibia)
  &fq=countryConservation:*
  &sort=occurrenceCount
  &order=desc
  &pageSize=20
```

**过滤标准（只保留满足以下条件的物种）：**
- occurrence 记录数 > 100（保证有足够数据点构建气泡分布）
- 非核心 18 种（避免重复）
- class 在 Aves / Mammalia / Reptilia / Amphibia 之一
- 澳大利亚本土物种（排除外来纯入侵且无趣味性的物种）

**预期结果：** 约 100-150 种，覆盖澳大利亚所有州/领地

---

## 11. 性能边界与约束

### 11.1 气泡数量上限

| 视图模式 | 同屏最大气泡数 |
|---|---|
| 全国视图 | 核心 18 种 × 5气泡 + 扩展物种 × 2气泡 = ~500个上限 |
| 州视图 | 该州物种 × 15气泡 = ~300个上限 |
| 云视图（单物种） | 50个气泡（主1 + 小49） |

超出上限时，优先保留 `weight` 较高的气泡，删除权重最低的。

### 11.2 时间轴拖动节流

```typescript
const BUBBLE_UPDATE_THROTTLE_MS = 60  // 约 16fps，流畅且不过载
const LLM_STORY_DEBOUNCE_MS = 1200   // 停止点击 1.2s 后才触发 LLM
const ALA_REQUEST_THROTTLE_MS = 200  // ALA 请求间隔
```

### 11.3 内存管理

- ALA occurrence 数据在内存中最多保留 50 种物种的数据（LRU 淘汰）
- 超出时淘汰最久未访问的物种数据，下次需要时重新从 API 获取
- 图片资源（MapLibre 预加载）：核心 18 种常驻，扩展物种图标按分类复用（6个图标）

---

## 12. 验收标准

### 12.1 气泡系统验收

1. 全国视图下，18种核心物种的彩色头像气泡在 500ms 内完成首屏渲染
2. 拖动时间轴，气泡大小变化流畅，无明显卡顿（> 30fps）
3. 点击物种后，云效果出现，小气泡漂移动画周期自然且不规律
4. 扩展物种气泡在背景异步加载后逐渐淡入，不打断主交互

### 12.2 ALA 数据验收

1. 首次点击某州，ALA 数据在 2 秒内开始显示（允许流式增量展示）
2. 同一州的数据在 Session 内不重复请求（缓存生效）
3. ALA 请求失败时有友好降级（显示"当前数据暂时不可用"，不崩溃）

### 12.3 LLM 故事验收

1. 点击扩展物种后，打字机效果在 1.5 秒内开始输出文字
2. DeepSeek 生成的故事符合"口语化、有画面感"的风格要求
3. API key 未配置时显示友好提示，不影响其他功能

### 12.4 环境音验收

1. 点击地图不同区域，环境音在 1.5 秒内完成交叉淡变
2. 沿海区域（NSW/VIC/WA/SA/TAS 海岸带）播放海浪声
3. NT/WA内陆播放沙漠风声，QLD北部播放热带雨林音
4. 环境音音量不超过物种点击音效（环境音是背景）
5. 用户可关闭环境音，状态持久化（localStorage）

### 12.5 整体流畅度验收

1. 全国视图 + 500 个气泡，帧率不低于 30fps
2. 州视图切换，镜头推进动画 < 800ms
3. InfoPanel 展开动画 < 300ms（Framer Motion spring）
4. 时间轴拖动到头尾，无死锁或闪烁

---

## 13. 开发阶段拆解（给 Claude Code 的执行顺序）

### Phase 1：气泡渲染系统重构（最高优先级）

目标：
- 扩充 species.json 的 `distributionPoints` 字段（核心 18 种）
- 实现 `lib/bubble-aggregation.ts`
- 重构 AustraliaMap 的 species source，支持多点气泡
- 气泡头像图片预加载（圆形裁剪 SVG 包装）
- 实现气泡大小与 populationScore 的映射

交付物：全国视图可见多个物种的彩色头像气泡，时间轴联动大小变化

### Phase 2：ALA 后端代理

目标：
- 建立 3 个 API route（occurrences / species / story）
- 实现内存缓存 + 防抖策略
- 查询并填写核心 18 种的 ALA LSID
- 测试 ALA occurrence 数据的坐标质量

交付物：可在浏览器中测试 `/api/ala/occurrences?speciesId=...` 并返回干净的坐标数组

### Phase 3：扩展物种渐进加载

目标：
- 实现 `hooks/useALASpecies.ts`
- 实现分批加载 + 逐步淡入
- 扩展物种用分类图标气泡显示

交付物：全国视图可见 100+ 种物种的分类图标气泡（异步加载）

### Phase 4：云效果 + InfoPanel 三态

目标：
- 实现单物种云层（DOM 气泡 + Framer Motion 漂移）
- 重构 InfoPanel 为三状态机
- 核心物种：funFacts + storyNarrative + timelineNarrative
- 扩展物种：打字机 + 骨架屏

交付物：点击任意物种，InfoPanel 和云效果完整闭环

### Phase 5：LLM 故事生成

目标：
- 实现 `/api/llm/story` DeepSeek 流式代理
- 前端打字机动画
- 加载态骨架屏

交付物：点击扩展物种，故事打字机效果可用

### Phase 6：环境音系统

目标：
- 建立 `data/ambient-audio.json` 地貌分区
- 实现 `hooks/useAmbientAudio.ts`
- 点击地图触发环境音交叉淡变
- 顶部 UI 增加环境音开关

交付物：点击不同地区，播放对应环境音

### Phase 7：音频下载脚本

目标：
- 实现 `scripts/fetch-audio.mjs`
- 支持 xeno-canto + freesound 两个来源
- 输出下载报告

交付物：运行脚本后，`public/assets/audio/` 下有真实录音文件

### Phase 8：动画打磨 + 性能优化

目标：
- 确保全局 30fps+
- 补充缺失的过渡动画
- 测试 500 个气泡同屏性能
- 节流 / 防抖参数调优

交付物：流畅的完整体验

---

## 14. 文件结构变化总览

```
新增文件：
app/
  api/
    ala/
      occurrences/route.ts
      species/route.ts
    llm/
      story/route.ts

lib/
  ala-client.ts
  ambient-audio.ts
  bubble-aggregation.ts

hooks/
  useALASpecies.ts
  useAmbientAudio.ts

scripts/
  fetch-audio.mjs

data/
  ala-lsid-map.json
  ambient-audio.json

public/
  assets/
    audio/
      ambient/               ← 6种环境音文件
      *.mp3                  ← 18种动物音频

修改文件：
data/species.json            ← 新增 distributionPoints / funFacts / storyNarrative / timelineNarratives / taxonomicClass
contexts/AtlasContext.tsx    ← 新增 5 个状态字段
components/AustraliaMap.tsx  ← 气泡渲染系统重构
components/InfoPanel.tsx     ← 三状态重构
```

---

## 15. 不做的事（MVP 边界保护）

1. 不做用户账号系统
2. 不做物种对比功能
3. 不做数据导出
4. 不做移动端深适配（响应式基础即可）
5. 不做 3D 地图
6. 不做实时 ALA 数据流（WebSocket）
7. 不做物种的"行为动画"（只有漂移，不做走路/飞翔等复杂动画）
8. 扩展物种不做专属插图（接口预留，内容后续填充）
9. 不接入真实捕鲸/灭绝等历史 GIS 精确数据（关键帧推断即可）
