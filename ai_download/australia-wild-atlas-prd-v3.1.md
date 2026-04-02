# 澳洲野生动物时空图谱 — PRD v3.1
> 面向 Claude Code Agent 的完整执行版本  
> 本文档是自包含的：Agent 不需要询问任何额外信息即可开始实现  
> 基于现有项目增量重构，不推倒重来

---

## 0. 给 Agent 的执行前说明

### 0.1 你现在面对的项目

这是一个已有代码基础的 Next.js 14 项目，路径结构如下（关键文件）：

```
australia-wild-time-atlas/
├── app/
│   ├── layout.tsx
│   └── page.tsx
├── components/
│   ├── AustraliaMap.tsx   ← 需要重构
│   └── InfoPanel.tsx      ← 需要重构
├── contexts/
│   └── AtlasContext.tsx   ← 需要扩充字段
├── data/
│   ├── species.json       ← 需要扩充字段
│   ├── timeline.json      ← 保留
│   ├── audio.json         ← 需要扩充
│   ├── regions.json       ← 保留
│   └── geo/
│       └── australian-states.min.json  ← 保留
├── lib/
│   ├── constants.ts       ← 保留
│   ├── interpolate.ts     ← 保留
│   ├── map-style.ts       ← 保留
│   └── species-ui.ts      ← 需要扩充
└── scripts/
    ├── validate-map-data.mjs
    └── validate-region-hit.mjs
```

### 0.2 执行顺序

**严格按照 Phase 顺序执行。每个 Phase 完成后运行验收检查，通过后再进入下一 Phase。**

Phase 顺序：
1. 数据准备（运行脚本生成所有静态数据）
2. 气泡渲染系统重构
3. 后端 API 层新建
4. 扩展物种渐进加载
5. 云效果与 InfoPanel 三态
6. LLM 故事流式生成
7. 环境音系统
8. 音频下载脚本
9. 性能优化与动画打磨

### 0.3 不要做的事

- 不要推倒重来，现有 `AtlasContext`、`TimelineBar`、`interpolate.ts` 等逻辑保留
- 不要引入 Redux / Zustand 等状态库
- 不要使用 CSS-in-JS 方案（已有 Tailwind + CSS 变量）
- 不要自己实现 k-means，使用指定的 npm 包
- 不要在没有实际内容的情况下创建占位组件就收工

---

## 1. Phase 0：数据准备（先于所有编码工作）

**这是最高优先级。没有正确的数据，后续所有渲染都无法工作。**

### 1.1 生成核心 18 种物种内容（`scripts/generate-species-content.mjs`）

**这个脚本调用 DeepSeek API，为核心 18 种物种生成 funFacts、storyNarrative、timelineNarratives，输出补丁文件合并到 species.json。**

脚本需要读取 `DEEPSEEK_API_KEY` 环境变量。如不存在则报错退出，提示用户配置。

```javascript
// scripts/generate-species-content.mjs
// 调用方式：node scripts/generate-species-content.mjs

import fs from 'node:fs/promises'
import path from 'node:path'

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY
if (!DEEPSEEK_API_KEY) {
  console.error('请先设置 DEEPSEEK_API_KEY 环境变量')
  process.exit(1)
}

const SYSTEM_PROMPT = `你是一名擅长写趣味科普的自然博物作家。
风格要求：口语化、有画面感、适合大众阅读、不要写成百科词条。
严格按照要求的 JSON 格式输出，不要有任何多余文字。`

async function generateForSpecies(species) {
  const USER_PROMPT = `请为以下澳大利亚动物生成科普内容，严格输出 JSON 格式：

物种：${species.nameZh}（${species.nameEn}，学名：${species.scientificName}）
保护状态：${species.dangerStatus}
分布区域：${species.states.join('、')}
现有故事：${species.story}

请输出以下 JSON（不要 markdown 代码块，直接输出 JSON 对象）：
{
  "funFacts": ["趣事1（50字内）", "趣事2（50字内）", "趣事3（50字内）"],
  "storyNarrative": "一段200字以内的沉浸叙事，用第二人称'你'，带画面感",
  "timelineNarratives": {
    "1770": "1770年前后这种动物的状态描述（40字内）",
    "1788": "1788年殖民开始时的状态（40字内）",
    "1900": "1900年前后的状态（40字内）",
    "1935": "1935年前后的状态（40字内）",
    "1950": "1950年前后的状态（40字内）",
    "2024": "2024年当下的状态（40字内）"
  }
}`

  const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: USER_PROMPT }
      ],
      max_tokens: 600,
      temperature: 0.7
    })
  })

  const data = await response.json()
  const text = data.choices[0].message.content.trim()
  return JSON.parse(text)
}

// 主流程：读取 species.json，逐个生成，写回
const speciesRaw = await fs.readFile('data/species.json', 'utf8')
const speciesList = JSON.parse(speciesRaw)
const results = []

for (const species of speciesList) {
  console.log(`生成中：${species.nameZh}...`)
  try {
    const content = await generateForSpecies(species)
    results.push({ id: species.id, ...content })
    await new Promise(r => setTimeout(r, 1000)) // 避免限速
  } catch (e) {
    console.error(`${species.nameZh} 生成失败：`, e.message)
    results.push({ id: species.id, error: e.message })
  }
}

await fs.writeFile('data/species-content-patch.json', JSON.stringify(results, null, 2))
console.log('完成，输出至 data/species-content-patch.json')
console.log('请检查内容后运行 node scripts/merge-species-content.mjs 合并')
```

**合并脚本（`scripts/merge-species-content.mjs`）：**

```javascript
// 读取 species.json 和 species-content-patch.json，合并字段，写回 species.json
const species = JSON.parse(await fs.readFile('data/species.json', 'utf8'))
const patch = JSON.parse(await fs.readFile('data/species-content-patch.json', 'utf8'))
const patchMap = Object.fromEntries(patch.map(p => [p.id, p]))

const merged = species.map(sp => ({
  ...sp,
  funFacts: patchMap[sp.id]?.funFacts ?? [],
  storyNarrative: patchMap[sp.id]?.storyNarrative ?? sp.story,
  timelineNarratives: patchMap[sp.id]?.timelineNarratives ?? {}
}))

await fs.writeFile('data/species.json', JSON.stringify(merged, null, 2))
console.log('合并完成')
```

### 1.2 查询并生成 ALA LSID 映射（`scripts/fetch-ala-lsids.mjs`）

```javascript
// scripts/fetch-ala-lsids.mjs
// 通过 ALA species search API 查询 18 种核心物种的 LSID

const CORE_SPECIES = [
  { id: 'thylacine', scientificName: 'Thylacinus cynocephalus' },
  { id: 'pig_footed_bandicoot', scientificName: 'Chaeropus ecaudatus' },
  { id: 'koala', scientificName: 'Phascolarctos cinereus' },
  { id: 'platypus', scientificName: 'Ornithorhynchus anatinus' },
  { id: 'tasmanian_devil', scientificName: 'Sarcophilus harrisii' },
  { id: 'bilby', scientificName: 'Macrotis lagotis' },
  { id: 'red_kangaroo', scientificName: 'Osphranter rufus' },
  { id: 'emu', scientificName: 'Dromaius novaehollandiae' },
  { id: 'echidna', scientificName: 'Tachyglossus aculeatus' },
  { id: 'kookaburra', scientificName: 'Dacelo novaeguineae' },
  { id: 'frilled_lizard', scientificName: 'Chlamydosaurus kingii' },
  { id: 'cane_toad', scientificName: 'Rhinella marina' },
  { id: 'european_rabbit', scientificName: 'Oryctolagus cuniculus' },
  { id: 'dingo', scientificName: 'Canis lupus dingo' },
  { id: 'red_fox', scientificName: 'Vulpes vulpes' },
  { id: 'southern_right_whale', scientificName: 'Eubalaena australis' },
  { id: 'great_white_shark', scientificName: 'Carcharodon carcharias' },
  { id: 'green_sea_turtle', scientificName: 'Chelonia mydas' },
]

const result = {}

for (const sp of CORE_SPECIES) {
  const url = `https://api.ala.org.au/species/search?q=${encodeURIComponent(sp.scientificName)}&fq=idxtype:TAXON&pageSize=1`
  const res = await fetch(url)
  const data = await res.json()
  const hit = data.searchResults?.results?.[0]
  if (hit?.guid) {
    result[sp.id] = hit.guid
    console.log(`✓ ${sp.id}: ${hit.guid}`)
  } else {
    result[sp.id] = null
    console.warn(`✗ ${sp.id}: 未找到 LSID`)
  }
  await new Promise(r => setTimeout(r, 300))
}

await fs.writeFile('data/ala-lsid-map.json', JSON.stringify(result, null, 2))
console.log('LSID 映射已写入 data/ala-lsid-map.json')
```

### 1.3 生成核心物种多点分布数据（`scripts/fetch-distribution-points.mjs`）

此脚本从 ALA occurrence API 拉取核心 18 种物种的历史出现记录，聚合为 `distributionPoints`，写入 species.json。

```javascript
// scripts/fetch-distribution-points.mjs

import fs from 'node:fs/promises'

// 澳大利亚 bounding box（用于数据质量过滤）
const AU_BOUNDS = { west: 112, east: 154, south: -44, north: -10 }

function isInAustralia(lat, lng) {
  return lat >= AU_BOUNDS.south && lat <= AU_BOUNDS.north &&
         lng >= AU_BOUNDS.west && lng <= AU_BOUNDS.east
}

// 简单 k-means 实现（仅用于此脚本，避免引入依赖）
function kmeans(points, k, iterations = 20) {
  if (points.length <= k) return points.map(p => ({ lat: p.lat, lng: p.lng, weight: 1 / points.length }))
  
  // 初始化：随机选 k 个中心
  let centers = points.slice(0, k).map(p => ({ lat: p.lat, lng: p.lng }))
  
  for (let iter = 0; iter < iterations; iter++) {
    // 分配
    const clusters = Array.from({ length: k }, () => [])
    for (const p of points) {
      let minDist = Infinity, minIdx = 0
      centers.forEach((c, i) => {
        const d = (p.lat - c.lat) ** 2 + (p.lng - c.lng) ** 2
        if (d < minDist) { minDist = d; minIdx = i }
      })
      clusters[minIdx].push(p)
    }
    // 更新中心
    centers = clusters.map(cluster => {
      if (cluster.length === 0) return centers[0]
      return {
        lat: cluster.reduce((s, p) => s + p.lat, 0) / cluster.length,
        lng: cluster.reduce((s, p) => s + p.lng, 0) / cluster.length
      }
    })
  }
  
  // 计算每个簇的权重（归一化）
  const clusters = Array.from({ length: k }, () => [])
  for (const p of points) {
    let minDist = Infinity, minIdx = 0
    centers.forEach((c, i) => {
      const d = (p.lat - c.lat) ** 2 + (p.lng - c.lng) ** 2
      if (d < minDist) { minDist = d; minIdx = i }
    })
    clusters[minIdx].push(p)
  }
  
  const total = points.length
  return centers.map((c, i) => ({
    lat: Math.round(c.lat * 100) / 100,
    lng: Math.round(c.lng * 100) / 100,
    weight: Math.round((clusters[i].length / total) * 100) / 100
  })).filter(c => c.weight > 0)
}

async function fetchOccurrences(lsid, yearFrom, yearTo, pageSize = 500) {
  const url = new URL('https://biocache-ws.ala.org.au/ws/occurrences/search')
  url.searchParams.set('q', `lsid:${lsid}`)
  url.searchParams.set('fq', `year:[${yearFrom} TO ${yearTo}]`)
  url.searchParams.set('fields', 'decimalLatitude,decimalLongitude,year')
  url.searchParams.set('pageSize', String(pageSize))
  url.searchParams.set('fl', 'decimalLatitude,decimalLongitude,year')
  
  const res = await fetch(url.toString(), { headers: { 'Accept': 'application/json' } })
  const data = await res.json()
  
  return (data.occurrences || [])
    .filter(o => o.decimalLatitude && o.decimalLongitude)
    .filter(o => isInAustralia(o.decimalLatitude, o.decimalLongitude))
    .map(o => ({ lat: o.decimalLatitude, lng: o.decimalLongitude }))
}

const lsidMap = JSON.parse(await fs.readFile('data/ala-lsid-map.json', 'utf8'))
const species = JSON.parse(await fs.readFile('data/species.json', 'utf8'))

for (const sp of species) {
  const lsid = lsidMap[sp.id]
  if (!lsid) {
    console.warn(`${sp.id}: 无 LSID，跳过`)
    continue
  }
  
  console.log(`处理 ${sp.nameZh}...`)
  // 使用 1970-2024 的记录作为当代分布基准（历史数据不足时也合理）
  const occurrences = await fetchOccurrences(lsid, 1970, 2024, 500)
  
  if (occurrences.length < 3) {
    console.warn(`  ${sp.nameZh}: occurrence 记录过少（${occurrences.length}），使用 geoPoint 兜底`)
    sp.distributionPoints = [{ lat: sp.geoPoint.lat, lng: sp.geoPoint.lng, weight: 1.0 }]
  } else {
    const k = Math.min(8, Math.ceil(occurrences.length / 20))
    sp.distributionPoints = kmeans(occurrences, k)
    console.log(`  → ${sp.distributionPoints.length} 个代表性分布点`)
  }
  
  await new Promise(r => setTimeout(r, 500))
}

await fs.writeFile('data/species.json', JSON.stringify(species, null, 2))
console.log('distributionPoints 已写入 data/species.json')
```

### 1.4 构建扩展物种列表（`scripts/fetch-extended-species.mjs`）

```javascript
// scripts/fetch-extended-species.mjs
// 从 ALA 查询 100-150 种扩展物种，输出 data/extended-species.json

import fs from 'node:fs/promises'

// 核心 18 种 ID，用于排除
const CORE_IDS = new Set([
  'thylacine','pig_footed_bandicoot','koala','platypus','tasmanian_devil',
  'bilby','red_kangaroo','emu','echidna','kookaburra','frilled_lizard',
  'cane_toad','european_rabbit','dingo','red_fox','southern_right_whale',
  'great_white_shark','green_sea_turtle'
])

// ALA 类名 → 前端 taxonomicClass 映射
const CLASS_MAP = {
  'Aves': 'bird',
  'Mammalia': 'mammal',
  'Reptilia': 'reptile',
  'Amphibia': 'amphibian',
  'Chondrichthyes': 'marine',
  'Actinopterygii': 'marine',
  'Malacostraca': 'invertebrate',
  'Insecta': 'invertebrate',
}

// 澳大利亚各州 ID 映射到 ALA state filter
const STATE_FILTERS = {
  nsw: 'New South Wales',
  vic: 'Victoria',
  qld: 'Queensland',
  sa: 'South Australia',
  wa: 'Western Australia',
  tas: 'Tasmania',
  nt: 'Northern Territory',
  act: 'Australian Capital Territory',
}

async function querySpeciesForState(stateName, pageSize = 30) {
  const url = new URL('https://api.ala.org.au/species/search')
  url.searchParams.set('q', '*:*')
  url.searchParams.set('fq', `stateConservation:*`)
  url.searchParams.set('fq', `class:(Aves Mammalia Reptilia Amphibia)`)
  url.searchParams.set('fq', `Australian_state_and_territory:"${stateName}"`)
  url.searchParams.set('sort', 'occCount')
  url.searchParams.set('dir', 'desc')
  url.searchParams.set('pageSize', String(pageSize))
  url.searchParams.set('fl', 'guid,name,commonNameSingle,classs,occCount,conservationStatusAUS')
  
  const res = await fetch(url.toString(), { headers: { 'Accept': 'application/json' } })
  if (!res.ok) return []
  const data = await res.json()
  return data.searchResults?.results || []
}

const allSpecies = new Map() // guid → species object

for (const [stateId, stateName] of Object.entries(STATE_FILTERS)) {
  console.log(`查询 ${stateName}...`)
  const results = await querySpeciesForState(stateName, 30)
  
  for (const item of results) {
    if (!item.guid || !item.name) continue
    if (allSpecies.has(item.guid)) continue
    
    const taxonomicClass = CLASS_MAP[item.classs] || 'mammal'
    
    allSpecies.set(item.guid, {
      id: `ext_${item.guid.replace(/[^a-z0-9]/gi, '_').toLowerCase().slice(-20)}`,
      lsid: item.guid,
      nameEn: item.commonNameSingle || item.name,
      scientificName: item.name,
      taxonomicClass,
      occurrenceCount: item.occCount || 0,
      primaryState: stateId,
      dangerStatus: item.conservationStatusAUS || 'LC',
      isCore: false,
    })
  }
  
  await new Promise(r => setTimeout(r, 400))
}

// 过滤：只保留 occurrence 记录 > 50 的物种，最多取 150 种
const filtered = [...allSpecies.values()]
  .filter(sp => sp.occurrenceCount > 50)
  .sort((a, b) => b.occurrenceCount - a.occurrenceCount)
  .slice(0, 150)

await fs.writeFile('data/extended-species.json', JSON.stringify(filtered, null, 2))
console.log(`完成，共 ${filtered.length} 种扩展物种`)
```

**输出格式（`data/extended-species.json`）：**

```json
[
  {
    "id": "ext_urn_lsid_xxxx",
    "lsid": "urn:lsid:biodiversity.org.au:afd.taxon:xxxx",
    "nameEn": "Rainbow Lorikeet",
    "scientificName": "Trichoglossus moluccanus",
    "taxonomicClass": "bird",
    "occurrenceCount": 45231,
    "primaryState": "qld",
    "dangerStatus": "LC",
    "isCore": false
  }
]
```

### 1.5 package.json 新增 scripts

```json
{
  "scripts": {
    "setup:lsids": "node scripts/fetch-ala-lsids.mjs",
    "setup:distribution": "node scripts/fetch-distribution-points.mjs",
    "setup:extended": "node scripts/fetch-extended-species.mjs",
    "setup:content": "node scripts/generate-species-content.mjs",
    "setup:merge": "node scripts/merge-species-content.mjs",
    "setup:audio": "node scripts/fetch-audio.mjs",
    "setup:all": "npm run setup:lsids && npm run setup:distribution && npm run setup:extended && npm run setup:content && npm run setup:merge"
  }
}
```

### 1.6 执行顺序

```bash
# 1. 配置环境变量
cp .env.example .env.local
# 填入 DEEPSEEK_API_KEY

# 2. 按顺序执行
npm run setup:lsids        # 生成 ala-lsid-map.json
npm run setup:distribution # 生成 distributionPoints（写入 species.json）
npm run setup:extended     # 生成 extended-species.json
npm run setup:content      # 生成 species-content-patch.json（需人工检查）
npm run setup:merge        # 合并内容到 species.json
npm run setup:audio        # 下载音频文件（见 Phase 8）
```

---

## 2. 数据结构完整定义

### 2.1 species.json 完整字段定义（核心物种）

```typescript
interface CoreSpecies {
  // 现有字段（保留）
  id: string                    // 唯一 ID，snake_case
  nameZh: string
  nameEn: string
  scientificName: string
  group: 'extinct' | 'endangered' | 'native' | 'invasive' | 'marine'
  groupLabel: string
  states: string[]              // 州 ID 数组
  dangerStatus: 'LC' | 'NT' | 'VU' | 'EN' | 'CR' | 'EX'
  soundType: 'real' | 'ai_simulated'
  story: string                 // 原有短故事（保留）
  illustration: string          // SVG 插图路径
  photo: string                 // 实景照片路径
  audio: string                 // 音频路径
  color: string                 // 品牌色 hex
  geoPoint: { lng: number; lat: number }
  introYear?: number            // 外来物种引入年份
  extinctYear?: number          // 灭绝年份
  migratory?: boolean

  // 新增字段（Phase 0 生成）
  taxonomicClass: 'bird' | 'mammal' | 'reptile' | 'marine' | 'amphibian' | 'invertebrate'
  distributionPoints: Array<{
    lat: number    // 纬度，保留 2 位小数
    lng: number    // 经度，保留 2 位小数
    weight: number // 相对密度权重，0-1，保留 2 位小数
  }>
  funFacts: string[]            // 3 条趣事，每条 50 字以内
  storyNarrative: string        // 200 字以内沉浸叙事
  timelineNarratives: {         // 关键年份的状态描述
    '1770'?: string
    '1788'?: string
    '1900'?: string
    '1935'?: string
    '1950'?: string
    '2024'?: string
  }
}
```

### 2.2 extended-species.json 完整字段定义

```typescript
interface ExtendedSpecies {
  id: string                    // 'ext_' + lsid 后缀
  lsid: string                  // ALA LSID
  nameEn: string
  scientificName: string
  taxonomicClass: 'bird' | 'mammal' | 'reptile' | 'marine' | 'amphibian' | 'invertebrate'
  occurrenceCount: number
  primaryState: string
  dangerStatus: string
  isCore: false
  // 运行时动态添加（不存入文件）：
  // distributionPoints: BubblePoint[]
  // populationScore: number
}
```

### 2.3 ambient-audio.json（完整内容）

```json
{
  "zones": [
    {
      "id": "tropical_rainforest",
      "label": "热带雨林",
      "audioFile": "/assets/audio/ambient/tropical-rainforest.mp3",
      "bounds": [
        { "stateId": "qld", "latMin": -20, "latMax": -10, "lngMin": 143, "lngMax": 146 }
      ]
    },
    {
      "id": "coastal",
      "label": "沿海",
      "audioFile": "/assets/audio/ambient/coastal-waves.mp3",
      "bounds": [
        { "stateId": "nsw", "latMin": -38, "latMax": -28, "lngMin": 150, "lngMax": 154 },
        { "stateId": "vic", "latMin": -39, "latMax": -37, "lngMin": 140, "lngMax": 150 },
        { "stateId": "wa",  "latMin": -35, "latMax": -28, "lngMin": 113, "lngMax": 116 },
        { "stateId": "sa",  "latMin": -38, "latMax": -33, "lngMin": 135, "lngMax": 139 },
        { "stateId": "tas", "latMin": -44, "latMax": -40, "lngMin": 144, "lngMax": 149 }
      ]
    },
    {
      "id": "outback_desert",
      "label": "内陆沙漠",
      "audioFile": "/assets/audio/ambient/outback-desert.mp3",
      "bounds": [
        { "stateId": "nt", "latMin": -26, "latMax": -15, "lngMin": 129, "lngMax": 138 },
        { "stateId": "wa", "latMin": -32, "latMax": -22, "lngMin": 118, "lngMax": 129 },
        { "stateId": "sa", "latMin": -32, "latMax": -26, "lngMin": 130, "lngMax": 141 }
      ]
    },
    {
      "id": "temperate_forest",
      "label": "温带森林",
      "audioFile": "/assets/audio/ambient/temperate-forest.mp3",
      "bounds": [
        { "stateId": "tas", "latMin": -44, "latMax": -41, "lngMin": 144, "lngMax": 147 },
        { "stateId": "vic", "latMin": -38, "latMax": -36, "lngMin": 146, "lngMax": 149 }
      ]
    },
    {
      "id": "savanna",
      "label": "热带草原",
      "audioFile": "/assets/audio/ambient/savanna.mp3",
      "bounds": [
        { "stateId": "qld", "latMin": -26, "latMax": -17, "lngMin": 138, "lngMax": 148 },
        { "stateId": "nt",  "latMin": -15, "latMax": -11, "lngMin": 130, "lngMax": 136 }
      ]
    },
    {
      "id": "ocean",
      "label": "海洋",
      "audioFile": "/assets/audio/ambient/ocean-deep.mp3",
      "bounds": []
    }
  ],
  "fallbackZoneId": "outback_desert"
}
```

**地貌区域判断算法（`lib/ambient-audio.ts`）：**

```typescript
// 按优先级匹配：遍历所有 zone，找到第一个包含该坐标的 bound
// 若都不匹配（用户点击了一般内陆区域），返回 fallbackZoneId
// 若用户点击了海域（stateId 为 null），返回 'ocean'

export function getZoneIdForCoordinate(
  lat: number,
  lng: number,
  stateId: string | null
): string {
  if (stateId === null) return 'ocean'
  
  const zones = ambientAudioData.zones
  // 优先级顺序：tropical_rainforest > coastal > temperate_forest > savanna > outback_desert
  const priority = ['tropical_rainforest', 'coastal', 'temperate_forest', 'savanna', 'outback_desert']
  
  for (const zoneId of priority) {
    const zone = zones.find(z => z.id === zoneId)
    if (!zone) continue
    const match = zone.bounds.find(b =>
      b.stateId === stateId &&
      lat >= b.latMin && lat <= b.latMax &&
      lng >= b.lngMin && lng <= b.lngMax
    )
    if (match) return zoneId
  }
  
  return ambientAudioData.fallbackZoneId
}
```

### 2.4 ala-lsid-map.json（由脚本生成，结构示例）

```json
{
  "thylacine": "urn:lsid:biodiversity.org.au:afd.taxon:d0c3d52b-...",
  "koala": "urn:lsid:biodiversity.org.au:afd.taxon:e9d6fbbd-...",
  "platypus": null,
  "..."
}
```

`null` 表示 ALA 未找到对应 LSID，Agent 需要在日志中标记，不影响其他物种处理。

---

## 3. Phase 1：气泡渲染系统重构（`components/AustraliaMap.tsx`）

### 3.1 气泡尺寸规格（完整定义）

```typescript
// 各物种分组的基准气泡半径（单位：像素，在 zoom=5 时的屏幕尺寸）
const BASE_RADIUS_BY_GROUP: Record<string, number> = {
  extinct:    10,   // 灭绝物种，偏小，幽灵感
  endangered: 14,   // 濒危物种
  native:     16,   // 广泛分布的本土物种
  invasive:   18,   // 入侵物种，偏大，体现扩张感
  marine:     15,   // 海洋物种
}

// 扩展物种统一基准
const BASE_RADIUS_EXTENDED = 10

// 实际半径计算
function calcBubbleRadius(
  group: string,
  populationScore: number,  // 0-1
  isCore: boolean,
  isRepresentative: boolean  // 主气泡额外放大
): number {
  const base = isCore ? (BASE_RADIUS_BY_GROUP[group] ?? 14) : BASE_RADIUS_EXTENDED
  const sized = base * (0.5 + populationScore * 0.8)  // 最小 50% 基准，最大 130% 基准
  return isRepresentative ? sized * 1.6 : sized
}
```

### 3.2 MapLibre Source 架构（双 Source）

```typescript
// 两个独立的 GeoJSON Source，不合并
const MAP_SOURCE_CORE_BUBBLES = 'atlas-core-bubbles'      // 核心 18 种
const MAP_SOURCE_EXTENDED_BUBBLES = 'atlas-ext-bubbles'   // 扩展物种

// 对应 Layer
const MAP_LAYER_CORE_SYMBOL = 'atlas-core-symbol'
const MAP_LAYER_CORE_AURA = 'atlas-core-aura'
const MAP_LAYER_EXT_SYMBOL = 'atlas-ext-symbol'
const MAP_LAYER_EXT_AURA = 'atlas-ext-aura'

// 点击事件检测顺序：先检测核心物种，再检测扩展物种，再检测区域
// queryRenderedFeatures 按 layer 数组顺序，核心在前
```

### 3.3 核心物种气泡 GeoJSON 构建

每种核心物种的每个 `distributionPoint` 对应一个 GeoJSON Feature。主气泡（weight 最大的点）额外标记。

```typescript
function buildCoreBubblesGeoJSON(processedSpecies: ProcessedSpecies[]) {
  const features = []
  
  for (const sp of processedSpecies) {
    if (!sp.isVisibleOnMap) continue
    
    const points = sp.distributionPoints ?? [{ lat: sp.geoPoint.lat, lng: sp.geoPoint.lng, weight: 1.0 }]
    const maxWeight = Math.max(...points.map(p => p.weight))
    
    // 全国视图：最多显示 5 个点；州视图：最多 10 个；云视图（已选中）：交由 DOM 层处理
    const maxPoints = sp.isSelected ? 0 : (focusRegionId ? 10 : 5)
    const displayPoints = points
      .sort((a, b) => b.weight - a.weight)
      .slice(0, maxPoints)
    
    for (const pt of displayPoints) {
      const isRep = pt.weight === maxWeight
      const radius = calcBubbleRadius(sp.group, sp.interpolated.populationScore, true, isRep)
      
      features.push({
        type: 'Feature',
        id: `${sp.id}_${pt.lat}_${pt.lng}`,
        geometry: { type: 'Point', coordinates: [pt.lng, pt.lat] },
        properties: {
          speciesId: sp.id,
          isCore: true,
          isRepresentative: isRep,
          iconImageId: sp.id,        // 预加载到 map 的图片 ID
          radius,
          opacity: sp.iconOpacity,
          auraOpacity: sp.auraOpacity,
          color: sp.color,
        }
      })
    }
  }
  
  return { type: 'FeatureCollection', features }
}
```

### 3.4 气泡图片规格（圆形头像 SVG 包装）

核心 18 种的气泡图片使用 SVG 动态构建，将物种插图嵌入圆形气泡。插图路径来自 `species.illustration`（SVG 格式）。

```typescript
// 由于插图是 SVG 文件，需要先 fetch 其内容，再内嵌到气泡 SVG 中
// 气泡 SVG 规格：88x88px，pixelRatio: 2（实际 44x44 逻辑像素）

async function buildBubbleSvg(
  species: CoreSpecies,
  populationScore: number
): Promise<string> {
  const isExtinct = species.extinctYear !== undefined
  const opacity = isExtinct ? 0.55 : 1
  const color = species.color
  
  // 灭绝物种气泡用灰色滤镜
  const filter = isExtinct
    ? `<filter id="extinct"><feColorMatrix type="saturate" values="0.15"/></filter>`
    : ''
  const filterAttr = isExtinct ? `filter="url(#extinct)"` : ''
  
  return `
<svg xmlns="http://www.w3.org/2000/svg" width="88" height="88" viewBox="0 0 88 88">
  <defs>
    ${filter}
    <clipPath id="circle-clip-${species.id}">
      <circle cx="44" cy="44" r="28"/>
    </clipPath>
    <filter id="shadow-${species.id}">
      <feDropShadow dx="0" dy="4" stdDeviation="6" flood-color="rgba(96,74,47,0.22)"/>
    </filter>
  </defs>
  <g filter="url(#shadow-${species.id})" ${filterAttr} opacity="${opacity}">
    <!-- 背景圆 -->
    <circle cx="44" cy="44" r="30" fill="rgba(255,250,243,0.95)" stroke="${color}" stroke-width="3"/>
    <!-- 插图区域（使用 foreignObject 或 image 元素加载 SVG） -->
    <image
      href="${species.illustration}"
      x="14" y="14" width="60" height="60"
      clip-path="url(#circle-clip-${species.id})"
      preserveAspectRatio="xMidYMid slice"
    />
    <!-- 外圈光晕（繁盛态才显示） -->
    <circle cx="44" cy="44" r="33" fill="none" stroke="${color}" stroke-width="1.5"
      opacity="${Math.min(populationScore * 0.6, 0.4)}"/>
  </g>
</svg>`
}
```

**扩展物种气泡**：使用 6 种分类图标 SVG path（直接内嵌，不需要 fetch）：

```typescript
const TAXON_ICON_PATHS: Record<string, string> = {
  bird: 'M12 2C8 2 5 6 5 10c0 2 1 4 2 5l-2 7h14l-2-7c1-1 2-3 2-5 0-4-3-8-7-8zm0 3c2 0 4 2 4 5 0 1-.5 2-1 3H9c-.5-1-1-2-1-3 0-3 2-5 4-5z',
  mammal: 'M12 3C9 3 7 5 7 8c0 1 .5 2 1 3L6 20h12l-2-9c.5-1 1-2 1-3 0-3-2-5-5-5zm-2 8c-.5 0-1-.5-1-1s.5-1 1-1 1 .5 1 1-.5 1-1 1zm4 0c-.5 0-1-.5-1-1s.5-1 1-1 1 .5 1 1-.5 1-1 1z',
  reptile: 'M12 2L8 6v3L4 12l4 3v3l4 4 4-4v-3l4-3-4-3V6l-4-4zm0 5c1 0 2 1 2 2s-1 2-2 2-2-1-2-2 1-2 2-2z',
  marine: 'M2 12c0-1 1-2 3-2h2c1-2 3-4 5-4s4 2 5 4h2c2 0 3 1 3 2s-1 2-3 2h-2c-1 2-3 4-5 4s-4-2-5-4H5c-2 0-3-1-3-2zm10-2c-1 0-2 1-2 2s1 2 2 2 2-1 2-2-1-2-2-2z',
  amphibian: 'M12 2C9 2 7 4 7 7c0 2 1 3 2 4L7 20h10l-2-9c1-1 2-2 2-4 0-3-2-5-5-5zM9 8c0-.5.5-1 1-1s1 .5 1 1-.5 1-1 1-1-.5-1-1zm4 0c0-.5.5-1 1-1s1 .5 1 1-.5 1-1 1-1-.5-1-1z',
  invertebrate: 'M12 2L9 5H7L5 8l2 1-1 3 2 1v3l2 1 2-1v-3l2-1-1-3 2-1-2-3h-2L12 2zm0 6c1 0 2 1 2 2s-1 2-2 2-2-1-2-2 1-2 2-2z',
}

function buildExtendedBubbleSvg(taxonomicClass: string, color: string): string {
  const path = TAXON_ICON_PATHS[taxonomicClass] ?? TAXON_ICON_PATHS.mammal
  return `
<svg xmlns="http://www.w3.org/2000/svg" width="88" height="88" viewBox="0 0 88 88">
  <defs>
    <filter id="shadow-ext">
      <feDropShadow dx="0" dy="3" stdDeviation="4" flood-color="rgba(96,74,47,0.18)"/>
    </filter>
  </defs>
  <g filter="url(#shadow-ext)">
    <circle cx="44" cy="44" r="28" fill="rgba(255,250,243,0.9)" stroke="${color}" stroke-width="2.5"/>
    <g transform="translate(20 20) scale(2)">
      <path d="${path}" fill="${color}" opacity="0.85"/>
    </g>
  </g>
</svg>`
}
```

### 3.5 时间轴驱动的气泡更新节流

```typescript
// 在 AustraliaMap.tsx 中
const BUBBLE_UPDATE_THROTTLE_MS = 60  // 约 16fps

const syncBubbles = useMemo(
  () => throttle(() => {
    const source = mapRef.current?.getSource(MAP_SOURCE_CORE_BUBBLES) as GeoJSONSource
    if (source) source.setData(buildCoreBubblesGeoJSON(processedSpecies))
  }, BUBBLE_UPDATE_THROTTLE_MS),
  [processedSpecies]
)

useEffect(() => { syncBubbles() }, [processedSpecies, syncBubbles])
```

`throttle` 使用 `lodash-es` 的实现，或直接内联实现（不引入新依赖）：

```typescript
function throttle<T extends (...args: unknown[]) => void>(fn: T, ms: number): T {
  let last = 0
  return ((...args) => {
    const now = Date.now()
    if (now - last >= ms) { last = now; fn(...args) }
  }) as T
}
```

---

## 4. Phase 2：后端 API 层

### 4.1 ALA Occurrence 代理（`app/api/ala/occurrences/route.ts`）

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { unstable_cache } from 'next/cache'

const AU_BOUNDS = { west: 112, east: 154, south: -44, north: -10 }

function isInAustralia(lat: number, lng: number): boolean {
  return lat >= AU_BOUNDS.south && lat <= AU_BOUNDS.north &&
         lng >= AU_BOUNDS.west && lng <= AU_BOUNDS.east
}

const fetchOccurrences = unstable_cache(
  async (lsid: string, yearFrom: number, yearTo: number, limit: number) => {
    const url = new URL('https://biocache-ws.ala.org.au/ws/occurrences/search')
    url.searchParams.set('q', `lsid:${lsid}`)
    url.searchParams.set('fq', `year:[${yearFrom} TO ${yearTo}]`)
    url.searchParams.set('fields', 'decimalLatitude,decimalLongitude,year')
    url.searchParams.set('pageSize', String(Math.min(limit, 500)))
    
    const res = await fetch(url.toString(), {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(8000)
    })
    
    if (!res.ok) throw new Error(`ALA returned ${res.status}`)
    
    const data = await res.json()
    return (data.occurrences || [])
      .filter((o: Record<string, number>) =>
        o.decimalLatitude && o.decimalLongitude &&
        isInAustralia(o.decimalLatitude, o.decimalLongitude)
      )
      .map((o: Record<string, number>) => ({
        lat: o.decimalLatitude,
        lng: o.decimalLongitude,
        year: o.year,
      }))
  },
  ['ala-occurrences'],
  { revalidate: 3600 }  // 1小时缓存
)

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const lsid = searchParams.get('lsid')
  const yearFrom = Number(searchParams.get('yearFrom') ?? 1770)
  const yearTo = Number(searchParams.get('yearTo') ?? 2024)
  const limit = Number(searchParams.get('limit') ?? 300)
  
  if (!lsid) return NextResponse.json({ error: 'lsid is required' }, { status: 400 })
  
  try {
    const occurrences = await fetchOccurrences(lsid, yearFrom, yearTo, limit)
    return NextResponse.json({ occurrences, count: occurrences.length })
  } catch (e) {
    return NextResponse.json({ error: 'ALA request failed', occurrences: [] }, { status: 200 })
    // 注意：即使失败也返回 200，让前端优雅降级而非报错
  }
}
```

### 4.2 ALA 物种搜索代理（`app/api/ala/species/route.ts`）

```typescript
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const q = searchParams.get('q') ?? '*'
  const stateId = searchParams.get('stateId')
  const limit = Math.min(Number(searchParams.get('limit') ?? 30), 50)
  
  const STATE_NAMES: Record<string, string> = {
    nsw: 'New South Wales', vic: 'Victoria', qld: 'Queensland',
    sa: 'South Australia', wa: 'Western Australia', tas: 'Tasmania',
    nt: 'Northern Territory', act: 'Australian Capital Territory',
  }
  
  const url = new URL('https://api.ala.org.au/species/search')
  url.searchParams.set('q', q)
  url.searchParams.set('fq', 'idxtype:TAXON')
  url.searchParams.set('fq', 'class:(Aves Mammalia Reptilia Amphibia Chondrichthyes)')
  if (stateId && STATE_NAMES[stateId]) {
    url.searchParams.set('fq', `Australian_state_and_territory:"${STATE_NAMES[stateId]}"`)
  }
  url.searchParams.set('pageSize', String(limit))
  url.searchParams.set('sort', 'occCount')
  url.searchParams.set('dir', 'desc')
  
  try {
    const res = await fetch(url.toString(), {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(6000),
      next: { revalidate: 3600 }
    })
    const data = await res.json()
    return NextResponse.json(data.searchResults?.results ?? [])
  } catch {
    return NextResponse.json([])
  }
}
```

### 4.3 DeepSeek 故事生成（`app/api/llm/story/route.ts`）

```typescript
import { NextRequest } from 'next/server'

export async function POST(req: NextRequest) {
  const apiKey = process.env.DEEPSEEK_API_KEY
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: 'DEEPSEEK_API_KEY not configured' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    )
  }
  
  const body = await req.json()
  const { nameZh, nameEn, scientificName, dangerStatus, taxonomicClass } = body
  
  const prompt = `请为这种澳大利亚动物写一段150字以内的有趣科普故事：
${nameZh}（${nameEn}，学名：${scientificName}）
保护状态：${dangerStatus}
类型：${taxonomicClass}
要求：口语化，有画面感，有记忆点，不要列数据。`
  
  const upstream = await fetch('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: '你是一名自然博物科普作家，擅长写有趣的短文。' },
        { role: 'user', content: prompt }
      ],
      max_tokens: 250,
      temperature: 0.8,
      stream: true,
    })
  })
  
  if (!upstream.ok) {
    return new Response(JSON.stringify({ error: 'DeepSeek API error' }), { status: 500 })
  }
  
  // 将 DeepSeek SSE 流透传给前端
  return new Response(upstream.body, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    }
  })
}
```

### 4.4 环境变量文件（`.env.example`）

```bash
# DeepSeek API Key（必填，用于生成物种故事）
DEEPSEEK_API_KEY=your_deepseek_api_key_here

# Freesound API Key（仅音频下载脚本需要，可免费注册 freesound.org 获取）
FREESOUND_API_KEY=your_freesound_api_key_here

# ALA 配置（无需 key，保留便于未来调整）
ALA_BIOCACHE_URL=https://biocache-ws.ala.org.au/ws
ALA_SPECIES_URL=https://api.ala.org.au/species
```

---

## 5. Phase 3：扩展物种渐进加载（`hooks/useALASpecies.ts`）

### 5.1 Hook 完整规格

```typescript
// hooks/useALASpecies.ts

import { useState, useEffect, useRef, useCallback } from 'react'
import extendedSpeciesRaw from '@/data/extended-species.json'

export interface RuntimeExtendedSpecies {
  id: string
  lsid: string
  nameEn: string
  scientificName: string
  taxonomicClass: string
  primaryState: string
  dangerStatus: string
  isCore: false
  distributionPoints: Array<{ lat: number; lng: number; weight: number }>
  populationScore: number   // 基于 occurrence 记录归一化
}

const CACHE: Map<string, RuntimeExtendedSpecies> = new Map()
const BATCH_SIZE = 15
const BATCH_INTERVAL_MS = 1200
const MAX_IN_MEMORY = 80  // LRU 上限

// 简单 LRU：超出上限时删除 Map 中最早插入的条目
function evictIfNeeded() {
  if (CACHE.size > MAX_IN_MEMORY) {
    const firstKey = CACHE.keys().next().value
    if (firstKey) CACHE.delete(firstKey)
  }
}

// ALA occurrence 记录数 → populationScore（归一化）
// 使用对数归一化：log(count+1)/log(maxExpected+1)，maxExpected=5000
function normalizeOccurrenceCount(count: number): number {
  return Math.min(Math.log(count + 1) / Math.log(5001), 1)
}

// 简单 k-means（复用 Phase 0 脚本中的实现，提取为公共函数放入 lib/kmeans.ts）
import { kmeans } from '@/lib/kmeans'

export function useALASpecies(options: {
  enabled: boolean           // 是否启用（核心物种加载完后才 true）
  focusStateId?: string | null
}) {
  const [loadedSpecies, setLoadedSpecies] = useState<RuntimeExtendedSpecies[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  
  const loadBatch = useCallback(async (batch: typeof extendedSpeciesRaw) => {
    const results: RuntimeExtendedSpecies[] = []
    
    for (const sp of batch) {
      if (CACHE.has(sp.id)) {
        results.push(CACHE.get(sp.id)!)
        continue
      }
      
      try {
        const res = await fetch(
          `/api/ala/occurrences?lsid=${encodeURIComponent(sp.lsid)}&yearFrom=1970&yearTo=2024&limit=200`
        )
        const data = await res.json()
        const occurrences: { lat: number; lng: number }[] = data.occurrences ?? []
        
        const k = Math.min(5, Math.max(1, Math.ceil(occurrences.length / 30)))
        const distributionPoints = occurrences.length >= 3
          ? kmeans(occurrences, k)
          : [{ lat: 0, lng: 0, weight: 1.0 }]  // 无数据时不显示（weight 0 会被过滤）
        
        const runtime: RuntimeExtendedSpecies = {
          ...sp,
          isCore: false,
          distributionPoints: distributionPoints.filter(p => p.lat !== 0),
          populationScore: normalizeOccurrenceCount(data.count ?? 0),
        }
        
        CACHE.set(sp.id, runtime)
        evictIfNeeded()
        results.push(runtime)
      } catch {
        // 单个物种失败不影响其他物种
      }
    }
    
    return results
  }, [])
  
  useEffect(() => {
    if (!options.enabled) return
    
    abortRef.current?.abort()
    abortRef.current = new AbortController()
    
    // 按优先级排序：优先加载 focusStateId 对应州的物种
    let prioritized = [...extendedSpeciesRaw]
    if (options.focusStateId) {
      prioritized = [
        ...prioritized.filter(sp => sp.primaryState === options.focusStateId),
        ...prioritized.filter(sp => sp.primaryState !== options.focusStateId),
      ]
    }
    
    setIsLoading(true)
    
    ;(async () => {
      const batches = []
      for (let i = 0; i < prioritized.length; i += BATCH_SIZE) {
        batches.push(prioritized.slice(i, i + BATCH_SIZE))
      }
      
      for (const batch of batches) {
        if (abortRef.current?.signal.aborted) break
        const results = await loadBatch(batch)
        setLoadedSpecies(prev => {
          const existing = new Set(prev.map(s => s.id))
          return [...prev, ...results.filter(r => !existing.has(r.id))]
        })
        await new Promise(r => setTimeout(r, BATCH_INTERVAL_MS))
      }
      
      setIsLoading(false)
    })()
    
    return () => abortRef.current?.abort()
  }, [options.enabled, options.focusStateId, loadBatch])
  
  return { loadedSpecies, isLoading }
}
```

### 5.2 `lib/kmeans.ts`（公共函数，Phase 0 脚本和 Hook 共用）

```typescript
// lib/kmeans.ts
// 简单 k-means，不引入外部依赖

export interface KMeansPoint {
  lat: number
  lng: number
}

export interface KMeansResult {
  lat: number
  lng: number
  weight: number
}

export function kmeans(points: KMeansPoint[], k: number, iterations = 15): KMeansResult[] {
  if (points.length === 0) return []
  if (points.length <= k) {
    const w = 1 / points.length
    return points.map(p => ({ ...p, weight: Math.round(w * 100) / 100 }))
  }
  
  // 使用 k-means++ 初始化
  const centers: KMeansPoint[] = [points[Math.floor(Math.random() * points.length)]]
  while (centers.length < k) {
    const dists = points.map(p => {
      const d = Math.min(...centers.map(c => (p.lat - c.lat) ** 2 + (p.lng - c.lng) ** 2))
      return d
    })
    const total = dists.reduce((a, b) => a + b, 0)
    let r = Math.random() * total
    for (let i = 0; i < dists.length; i++) {
      r -= dists[i]
      if (r <= 0) { centers.push(points[i]); break }
    }
  }
  
  let currentCenters = [...centers]
  
  for (let iter = 0; iter < iterations; iter++) {
    const clusters: KMeansPoint[][] = Array.from({ length: k }, () => [])
    for (const p of points) {
      let minD = Infinity, minI = 0
      currentCenters.forEach((c, i) => {
        const d = (p.lat - c.lat) ** 2 + (p.lng - c.lng) ** 2
        if (d < minD) { minD = d; minI = i }
      })
      clusters[minI].push(p)
    }
    currentCenters = clusters.map((cl, i) => {
      if (cl.length === 0) return currentCenters[i]
      return {
        lat: cl.reduce((s, p) => s + p.lat, 0) / cl.length,
        lng: cl.reduce((s, p) => s + p.lng, 0) / cl.length,
      }
    })
  }
  
  // 计算权重
  const clusters: KMeansPoint[][] = Array.from({ length: k }, () => [])
  for (const p of points) {
    let minD = Infinity, minI = 0
    currentCenters.forEach((c, i) => {
      const d = (p.lat - c.lat) ** 2 + (p.lng - c.lng) ** 2
      if (d < minD) { minD = d; minI = i }
    })
    clusters[minI].push(p)
  }
  
  return currentCenters.map((c, i) => ({
    lat: Math.round(c.lat * 100) / 100,
    lng: Math.round(c.lng * 100) / 100,
    weight: Math.round((clusters[i].length / points.length) * 100) / 100,
  })).filter(c => c.weight > 0)
}
```

---

## 6. Phase 4：云效果与 InfoPanel 三态

### 6.1 云效果实现（DOM 层，非 MapLibre symbol）

云效果的小气泡使用 React Portal 渲染到地图 canvas 之上的 DOM 层，通过 `map.project()` 实时获取屏幕坐标，Framer Motion 控制漂移。

**云效果组件（在 AustraliaMap.tsx 中，通过 createPortal 挂载）：**

```typescript
interface CloudBubbleConfig {
  id: string
  lngLat: [number, number]
  driftAmplitudePx: number  // 漂移幅度像素，范围 2-6
  driftPeriodMs: number     // 漂移周期毫秒，范围 8000-14000
  driftPhase: number        // 相位偏移 0-2π
  radius: number            // 渲染半径
  opacity: number           // 基础透明度
  iconImageUrl: string      // 气泡头像图片 URL（data: SVG）
}

function CloudBubbleLayer({
  species,
  map,
  distributionPoints,
}: {
  species: ProcessedSpecies
  map: maplibregl.Map
  distributionPoints: { lat: number; lng: number; weight: number }[]
}) {
  const [screenPositions, setScreenPositions] = useState<{ x: number; y: number }[]>([])
  
  // 监听地图 move/zoom，重新计算屏幕坐标
  useEffect(() => {
    const update = () => {
      const positions = distributionPoints.map(pt => {
        const pixel = map.project([pt.lng, pt.lat])
        return { x: pixel.x, y: pixel.y }
      })
      setScreenPositions(positions)
    }
    
    update()
    map.on('move', update)
    map.on('zoom', update)
    return () => {
      map.off('move', update)
      map.off('zoom', update)
    }
  }, [map, distributionPoints])
  
  // 最多显示 12 个小气泡（不含主气泡）
  const cloudPoints = distributionPoints.slice(0, 13)
  const maxWeight = Math.max(...cloudPoints.map(p => p.weight))
  
  // 每个小气泡的漂移参数（固定种子，避免每次渲染重新随机）
  const driftConfigs = useMemo(() =>
    cloudPoints.map((_, i) => ({
      amplitudePx: 2 + (i % 3) * 1.5,
      periodMs: 8000 + (i * 831) % 6000,
      phase: (i * 2.4) % (2 * Math.PI),
    })),
    [cloudPoints.length]
  )
  
  return createPortal(
    <div
      className="pointer-events-none absolute inset-0"
      style={{ zIndex: 20 }}
    >
      {cloudPoints.map((pt, i) => {
        const pos = screenPositions[i]
        if (!pos) return null
        
        const isRep = pt.weight === maxWeight
        const radius = calcBubbleRadius(species.group, species.interpolated.populationScore, true, isRep)
        const { amplitudePx, periodMs, phase } = driftConfigs[i]
        
        return (
          <CloudBubble
            key={i}
            x={pos.x}
            y={pos.y}
            radius={radius}
            isRepresentative={isRep}
            amplitudePx={amplitudePx}
            periodMs={periodMs}
            phase={phase}
            color={species.color}
            opacity={isRep ? 0.92 : 0.5 + pt.weight * 0.35}
            iconUrl={`/assets/species/${species.id}-illustration.svg`}
            showConnector={!isRep}  // 非主气泡显示连接线
            repX={screenPositions.find((_, j) => cloudPoints[j].weight === maxWeight)?.x ?? pos.x}
            repY={screenPositions.find((_, j) => cloudPoints[j].weight === maxWeight)?.y ?? pos.y}
          />
        )
      })}
    </div>,
    document.getElementById('atlas-cloud-layer')!  // 在 page.tsx 中添加此 div
  )
}

function CloudBubble({
  x, y, radius, isRepresentative, amplitudePx, periodMs, phase,
  color, opacity, iconUrl, showConnector, repX, repY,
}: {
  x: number; y: number; radius: number; isRepresentative: boolean
  amplitudePx: number; periodMs: number; phase: number
  color: string; opacity: number; iconUrl: string
  showConnector: boolean; repX: number; repY: number
}) {
  // 漂移动画：用 Framer Motion animate prop 循环
  const driftX = amplitudePx * Math.cos(phase)
  const driftY = amplitudePx * Math.sin(phase)
  
  return (
    <>
      {showConnector && (
        <svg
          className="pointer-events-none absolute inset-0 overflow-visible"
          style={{ zIndex: 19 }}
        >
          <line
            x1={x} y1={y} x2={repX} y2={repY}
            stroke={color}
            strokeWidth={0.8}
            strokeOpacity={0.15}
            strokeDasharray="3 4"
          />
        </svg>
      )}
      <motion.div
        className="absolute"
        style={{
          left: x - radius,
          top: y - radius,
          width: radius * 2,
          height: radius * 2,
        }}
        animate={{
          x: [0, driftX, 0, -driftX, 0],
          y: [0, driftY * 0.6, driftY, driftY * 0.6, 0],
        }}
        transition={{
          duration: periodMs / 1000,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      >
        <img
          src={iconUrl}
          alt=""
          className="h-full w-full rounded-full object-cover"
          style={{
            border: `${isRepresentative ? 2.5 : 1.5}px solid ${color}`,
            opacity,
            boxShadow: isRepresentative
              ? `0 4px 16px ${color}44`
              : `0 2px 6px ${color}22`,
            background: 'rgba(255,250,243,0.92)',
          }}
        />
      </motion.div>
    </>
  )
}
```

**`page.tsx` 中需要添加云效果挂载点：**

```tsx
// 在地图容器内，canvas 之上
<div id="atlas-cloud-layer" className="pointer-events-none absolute inset-0" style={{ zIndex: 20 }} />
```

### 6.2 InfoPanel 三态完整规格

**状态判断逻辑：**

```typescript
type PanelState = 'closed' | 'region' | 'core-species' | 'extended-species'

function getPanelState(
  focusRegionId: string | null,
  selectedSpeciesId: string | null,
  coreSpeciesIds: Set<string>
): PanelState {
  if (!focusRegionId && !selectedSpeciesId) return 'closed'
  if (selectedSpeciesId && coreSpeciesIds.has(selectedSpeciesId)) return 'core-species'
  if (selectedSpeciesId) return 'extended-species'
  return 'region'
}
```

**扩展物种详情态（`ExtendedSpeciesInfo` 组件）：**

```typescript
function ExtendedSpeciesInfo({ species }: { species: RuntimeExtendedSpecies }) {
  const [story, setStory] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState('')
  
  // 客户端缓存：同一物种不重复生成
  const storyCache = useRef<Map<string, string>>(new Map())
  
  useEffect(() => {
    if (storyCache.current.has(species.id)) {
      setStory(storyCache.current.get(species.id)!)
      return
    }
    
    setStory('')
    setIsGenerating(true)
    setError('')
    
    let fullText = ''
    
    fetch('/api/llm/story', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nameEn: species.nameEn,
        nameZh: species.nameEn,  // 扩展物种暂无中文名，使用英文名
        scientificName: species.scientificName,
        dangerStatus: species.dangerStatus,
        taxonomicClass: species.taxonomicClass,
      })
    }).then(async res => {
      if (!res.ok) { setError('故事生成失败，稍后再试'); setIsGenerating(false); return }
      
      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        
        const chunk = decoder.decode(value)
        // 解析 SSE data: 行
        const lines = chunk.split('\n').filter(l => l.startsWith('data: '))
        for (const line of lines) {
          const data = line.slice(6)
          if (data === '[DONE]') continue
          try {
            const parsed = JSON.parse(data)
            const delta = parsed.choices?.[0]?.delta?.content ?? ''
            fullText += delta
            setStory(fullText)  // 逐字符更新，打字机效果
          } catch { /* 忽略解析错误 */ }
        }
      }
      
      storyCache.current.set(species.id, fullText)
      setIsGenerating(false)
    }).catch(() => {
      setError('网络连接问题，无法获取故事')
      setIsGenerating(false)
    })
  }, [species.id])
  
  return (
    <div className="space-y-4 px-4 py-2">
      {/* 物种标题 */}
      <div className="flex items-center gap-3">
        <div
          className="h-14 w-14 shrink-0 rounded-[1rem] flex items-center justify-center"
          style={{ background: `rgba(${hexToRgb(getColorByClass(species.taxonomicClass))}, 0.12)` }}
        >
          {/* 分类图标 SVG */}
          <TaxonIcon taxonomicClass={species.taxonomicClass} size={28} />
        </div>
        <div>
          <p className="text-[0.72rem]" style={{ color: 'var(--warm-gray)' }}>
            {species.scientificName}
          </p>
          <h3 className="text-base font-medium" style={{ color: 'var(--text-primary)' }}>
            {species.nameEn}
          </h3>
          <ConservationBadge status={species.dangerStatus} />
        </div>
      </div>
      
      {/* ALA 数据摘要 */}
      <div
        className="rounded-[1rem] px-3.5 py-3 text-[0.78rem] space-y-1"
        style={{ background: 'rgba(246, 236, 217, 0.54)' }}
      >
        <p style={{ color: 'var(--warm-gray)' }}>
          ALA 记录数：{species.occurrenceCount.toLocaleString()} 条
        </p>
        <p style={{ color: 'var(--warm-gray)' }}>
          主要分布：{STATE_NAME_ZH[species.primaryState] ?? species.primaryState}
        </p>
      </div>
      
      {/* LLM 故事区域 */}
      <div className="rounded-[1rem] px-3.5 py-3" style={{ background: 'rgba(246, 236, 217, 0.54)' }}>
        <p className="text-[0.66rem] mb-2" style={{ color: 'var(--warm-gray)' }}>
          {isGenerating ? '正在查阅这种动物的故事...' : '趣味故事'}
        </p>
        {error ? (
          <p className="text-[0.78rem]" style={{ color: 'var(--warm-gray)' }}>{error}</p>
        ) : story ? (
          <p className="text-[0.82rem] leading-6" style={{ color: 'var(--text-primary)' }}>
            {story}
            {isGenerating && <span className="animate-pulse">▍</span>}
          </p>
        ) : (
          // 骨架屏
          <div className="space-y-2">
            {[100, 85, 70].map((w, i) => (
              <div
                key={i}
                className="h-3 rounded-full animate-pulse"
                style={{ width: `${w}%`, background: 'rgba(180,160,130,0.25)' }}
              />
            ))}
          </div>
        )}
      </div>
      
      {/* ALA 外链 */}
      <a
        href={`https://bie.ala.org.au/species/${encodeURIComponent(species.lsid)}`}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-2 text-[0.72rem] transition-opacity hover:opacity-70"
        style={{ color: 'var(--earth-deep)' }}
      >
        在 ALA 查看完整数据
        <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
          <path d="M1 1h8M9 1v8M1 9l8-8" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
        </svg>
      </a>
    </div>
  )
}
```

---

## 7. Phase 5：AtlasContext 扩充

在现有字段基础上，追加以下字段和 action：

```typescript
// contexts/AtlasContext.tsx 中新增

interface AtlasState {
  // ...现有字段保留...
  
  // 新增
  ambientAudioEnabled: boolean
  currentAmbientZoneId: string | null
  extendedSpeciesReady: boolean    // 扩展物种第一批已加载
  lastClickedCoord: [number, number] | null  // 最后点击的地图坐标
}

interface AtlasActions {
  // ...现有 actions 保留...
  
  // 新增
  setAmbientAudioEnabled: (enabled: boolean) => void
  setCurrentAmbientZoneId: (zoneId: string | null) => void
  setExtendedSpeciesReady: (ready: boolean) => void
  setLastClickedCoord: (coord: [number, number] | null) => void
}
```

---

## 8. Phase 6：环境音系统（`hooks/useAmbientAudio.ts`）

```typescript
// hooks/useAmbientAudio.ts

import { useEffect, useRef, useCallback } from 'react'
import { useAtlas } from '@/contexts/AtlasContext'
import ambientData from '@/data/ambient-audio.json'
import { getZoneIdForCoordinate } from '@/lib/ambient-audio'

const FADE_DURATION_MS = 1500
const TARGET_VOLUME = 0.30

export function useAmbientAudio() {
  const { ambientAudioEnabled, currentAmbientZoneId, setCurrentAmbientZoneId } = useAtlas()
  
  const currentAudioRef = useRef<HTMLAudioElement | null>(null)
  const fadeTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  
  const clearFade = () => {
    if (fadeTimerRef.current) clearInterval(fadeTimerRef.current)
  }
  
  const fadeOut = useCallback((audio: HTMLAudioElement, onDone?: () => void) => {
    clearFade()
    const startVol = audio.volume
    const step = startVol / (FADE_DURATION_MS / 50)
    fadeTimerRef.current = setInterval(() => {
      audio.volume = Math.max(0, audio.volume - step)
      if (audio.volume <= 0) {
        clearFade()
        audio.pause()
        audio.currentTime = 0
        onDone?.()
      }
    }, 50)
  }, [])
  
  const fadeIn = useCallback((audio: HTMLAudioElement) => {
    clearFade()
    audio.volume = 0
    audio.play().catch(() => {})
    const step = TARGET_VOLUME / (FADE_DURATION_MS / 50)
    fadeTimerRef.current = setInterval(() => {
      audio.volume = Math.min(TARGET_VOLUME, audio.volume + step)
      if (audio.volume >= TARGET_VOLUME) clearFade()
    }, 50)
  }, [])
  
  const playZone = useCallback((zoneId: string) => {
    const zone = ambientData.zones.find(z => z.id === zoneId)
    if (!zone) return
    
    const prev = currentAudioRef.current
    const next = new Audio(zone.audioFile)
    next.loop = true
    next.volume = 0
    currentAudioRef.current = next
    
    if (prev) {
      fadeOut(prev, () => fadeIn(next))
    } else {
      fadeIn(next)
    }
  }, [fadeIn, fadeOut])
  
  // 响应 zone 变化
  useEffect(() => {
    if (!ambientAudioEnabled) {
      if (currentAudioRef.current) fadeOut(currentAudioRef.current)
      return
    }
    if (currentAmbientZoneId) playZone(currentAmbientZoneId)
  }, [ambientAudioEnabled, currentAmbientZoneId, playZone, fadeOut])
  
  // 组件卸载时清理
  useEffect(() => () => {
    clearFade()
    currentAudioRef.current?.pause()
  }, [])
  
  // 对外暴露触发方法
  const triggerForCoordinate = useCallback((lat: number, lng: number, stateId: string | null) => {
    const zoneId = getZoneIdForCoordinate(lat, lng, stateId)
    setCurrentAmbientZoneId(zoneId)
  }, [setCurrentAmbientZoneId])
  
  return { triggerForCoordinate }
}
```

**在 AustraliaMap.tsx 的 click handler 中调用：**

```typescript
map.on('click', (event) => {
  const { lngLat } = event
  
  // ...现有点击逻辑（物种/区域）...
  
  // 触发环境音
  const stateId = findRegionIdByLngLat(lngLat.lng, lngLat.lat)  // 现有函数
  ambientAudio.triggerForCoordinate(lngLat.lat, lngLat.lng, stateId)
})
```

**环境音开关 UI（在 TopOverlay 或 TimelineBar 右侧）：**

```typescript
// 一个小图标按钮，使用 SVG 喇叭图标
<button
  onClick={() => setAmbientAudioEnabled(!ambientAudioEnabled)}
  className="atlas-focus-ring flex h-8 w-8 items-center justify-center rounded-full transition-colors"
  style={{
    background: ambientAudioEnabled ? 'rgba(125,165,108,0.18)' : 'rgba(239,223,196,0.6)',
    color: ambientAudioEnabled ? 'var(--leaf-400)' : 'var(--warm-gray)',
  }}
  aria-label={ambientAudioEnabled ? '关闭环境音' : '开启环境音'}
  title={ambientAudioEnabled ? '关闭环境音' : '开启环境音（点击地图区域播放）'}
>
  {/* 喇叭 SVG icon */}
  <SpeakerIcon muted={!ambientAudioEnabled} />
</button>
```

---

## 9. Phase 7：搜索功能扩展

现有搜索只覆盖核心 18 种，扩展后需要同时搜索扩展物种：

```typescript
// 在 AustraliaMap.tsx 的 processedSpecies useMemo 中，增加扩展物种的搜索匹配

const matchesSearch = !normalizedQuery ||
  species.nameZh?.includes(searchKeyword) ||
  species.nameEn.toLowerCase().includes(normalizedQuery) ||
  species.scientificName.toLowerCase().includes(normalizedQuery)
```

搜索结果优先显示核心物种，扩展物种按匹配度排列在后。搜索框 placeholder 更新为"搜索物种名称或学名"。

---

## 10. Phase 8：音频下载脚本（`scripts/fetch-audio.mjs`）

```javascript
// scripts/fetch-audio.mjs
// 运行前需要 FREESOUND_API_KEY 环境变量（可选，缺失时跳过 freesound 来源）
// xeno-canto 不需要 API key

import fs from 'node:fs/promises'
import path from 'node:path'
import { createWriteStream } from 'node:fs'
import { pipeline } from 'node:stream/promises'

const FREESOUND_KEY = process.env.FREESOUND_API_KEY
const OUTPUT_DIR = 'public/assets/audio'
const AMBIENT_DIR = path.join(OUTPUT_DIR, 'ambient')

await fs.mkdir(AMBIENT_DIR, { recursive: true })

// ─── 动物音频配置 ──────────────────────────────────────────────

const SPECIES_AUDIO = [
  // 鸟类 → xeno-canto
  {
    id: 'kookaburra',
    source: 'xeno-canto',
    scientificName: 'Dacelo novaeguineae',
    country: 'Australia',
    qualityMin: 'A',
  },
  {
    id: 'emu',
    source: 'xeno-canto',
    scientificName: 'Dromaius novaehollandiae',
    country: 'Australia',
    qualityMin: 'A',
  },
  // 哺乳类、爬行类 → freesound
  {
    id: 'koala',
    source: 'freesound',
    query: 'koala sound call',
    licenseFilter: ['Creative Commons 0', 'Attribution'],
  },
  {
    id: 'tasmanian_devil',
    source: 'freesound',
    query: 'tasmanian devil scream call',
    licenseFilter: ['Creative Commons 0', 'Attribution'],
  },
  {
    id: 'bilby',
    source: 'freesound',
    query: 'bilby sound Australia',
    licenseFilter: ['Creative Commons 0', 'Attribution'],
  },
  {
    id: 'red_kangaroo',
    source: 'freesound',
    query: 'kangaroo sound Australia',
    licenseFilter: ['Creative Commons 0', 'Attribution'],
  },
  {
    id: 'echidna',
    source: 'freesound',
    query: 'echidna sound',
    licenseFilter: ['Creative Commons 0', 'Attribution'],
  },
  {
    id: 'platypus',
    source: 'freesound',
    query: 'platypus underwater sound',
    licenseFilter: ['Creative Commons 0', 'Attribution'],
  },
  {
    id: 'frilled_lizard',
    source: 'freesound',
    query: 'frilled lizard hiss reptile',
    licenseFilter: ['Creative Commons 0', 'Attribution'],
  },
  {
    id: 'cane_toad',
    source: 'freesound',
    query: 'cane toad call frog tropical',
    licenseFilter: ['Creative Commons 0', 'Attribution'],
  },
  {
    id: 'european_rabbit',
    source: 'freesound',
    query: 'rabbit thumping warning',
    licenseFilter: ['Creative Commons 0', 'Attribution'],
  },
  {
    id: 'dingo',
    source: 'freesound',
    query: 'dingo howl Australia',
    licenseFilter: ['Creative Commons 0', 'Attribution'],
  },
  {
    id: 'red_fox',
    source: 'freesound',
    query: 'red fox call bark',
    licenseFilter: ['Creative Commons 0', 'Attribution'],
  },
  {
    id: 'southern_right_whale',
    source: 'freesound',
    query: 'whale song underwater',
    licenseFilter: ['Creative Commons 0', 'Attribution'],
  },
  // AI 模拟物种 → 标记为待手动添加
  { id: 'thylacine',        source: 'manual', note: '已灭绝，需 AI 模拟音频' },
  { id: 'pig_footed_bandicoot', source: 'manual', note: '已灭绝，需 AI 模拟音频' },
  { id: 'great_white_shark',    source: 'manual', note: '鲨鱼无声，需 AI 模拟水下环境音' },
  { id: 'green_sea_turtle',     source: 'manual', note: '需 AI 模拟音频' },
]

// ─── 环境音配置 ────────────────────────────────────────────────

const AMBIENT_AUDIO = [
  { id: 'tropical-rainforest', query: 'tropical rainforest birds Australia' },
  { id: 'coastal-waves',       query: 'ocean waves beach Australia coast' },
  { id: 'outback-desert',      query: 'outback australia desert wind dry' },
  { id: 'temperate-forest',    query: 'temperate forest birds creek stream' },
  { id: 'savanna',             query: 'savanna grassland wind birds australia' },
  { id: 'ocean-deep',          query: 'underwater ocean ambient deep sea' },
]

// ─── xeno-canto 下载 ───────────────────────────────────────────

async function downloadFromXenoCanto(config) {
  const url = `https://xeno-canto.org/api/2/recordings?query=${encodeURIComponent(config.scientificName)}+q:${config.qualityMin}+cnt:${config.country}`
  const res = await fetch(url)
  const data = await res.json()
  const recording = data.recordings?.[0]
  if (!recording) throw new Error('xeno-canto: 无结果')
  
  const fileUrl = recording.file.startsWith('//') ? `https:${recording.file}` : recording.file
  return { url: fileUrl, attribution: `xeno-canto.org: ${recording.rec} (${recording.lic})` }
}

// ─── freesound 下载 ────────────────────────────────────────────

async function downloadFromFreesound(config) {
  if (!FREESOUND_KEY) throw new Error('FREESOUND_API_KEY 未配置，跳过 freesound 来源')
  
  const url = new URL('https://freesound.org/apiv2/search/text/')
  url.searchParams.set('query', config.query)
  url.searchParams.set('filter', `license:(${config.licenseFilter.map(l => `"${l}"`).join(' OR ')})`)
  url.searchParams.set('sort', 'rating_desc')
  url.searchParams.set('fields', 'id,name,license,previews,duration')
  url.searchParams.set('page_size', '5')
  url.searchParams.set('token', FREESOUND_KEY)
  
  const res = await fetch(url.toString())
  const data = await res.json()
  const sound = data.results?.find(s => s.duration <= 60)  // 只取 60 秒以内
  if (!sound) throw new Error('freesound: 无合适结果')
  
  const previewUrl = sound.previews['preview-hq-mp3'] || sound.previews['preview-lq-mp3']
  return { url: previewUrl, attribution: `freesound.org: ${sound.name} (${sound.license})` }
}

// ─── 通用下载函数 ──────────────────────────────────────────────

async function downloadFile(url, destPath) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`下载失败: ${res.status}`)
  const ws = createWriteStream(destPath)
  await pipeline(res.body, ws)
}

// ─── 主流程 ───────────────────────────────────────────────────

const report = { downloaded: [], skipped: [], manual: [], failed: [] }

// 动物音频
for (const config of SPECIES_AUDIO) {
  const destPath = path.join(OUTPUT_DIR, `${config.id}.mp3`)
  
  try {
    await fs.access(destPath)
    console.log(`✓ ${config.id}: 已存在，跳过`)
    report.skipped.push(config.id)
    continue
  } catch { /* 文件不存在，继续下载 */ }
  
  if (config.source === 'manual') {
    console.log(`⚠ ${config.id}: ${config.note}`)
    report.manual.push({ id: config.id, note: config.note })
    continue
  }
  
  try {
    let result
    if (config.source === 'xeno-canto') result = await downloadFromXenoCanto(config)
    else result = await downloadFromFreesound(config)
    
    await downloadFile(result.url, destPath)
    console.log(`↓ ${config.id}: 已下载 (${result.attribution})`)
    report.downloaded.push({ id: config.id, attribution: result.attribution })
  } catch (e) {
    console.error(`✗ ${config.id}: ${e.message}`)
    report.failed.push({ id: config.id, error: e.message })
  }
  
  await new Promise(r => setTimeout(r, 600))
}

// 环境音（仅 freesound）
if (FREESOUND_KEY) {
  for (const config of AMBIENT_AUDIO) {
    const destPath = path.join(AMBIENT_DIR, `${config.id}.mp3`)
    try {
      await fs.access(destPath)
      console.log(`✓ ambient/${config.id}: 已存在`)
      continue
    } catch { /* 继续 */ }
    
    try {
      const result = await downloadFromFreesound({
        ...config,
        licenseFilter: ['Creative Commons 0', 'Attribution'],
      })
      await downloadFile(result.url, destPath)
      console.log(`↓ ambient/${config.id}: 已下载`)
    } catch (e) {
      console.error(`✗ ambient/${config.id}: ${e.message}`)
    }
    await new Promise(r => setTimeout(r, 600))
  }
} else {
  console.warn('未配置 FREESOUND_API_KEY，环境音跳过。请手动下载至 public/assets/audio/ambient/')
}

await fs.writeFile('scripts/audio-report.json', JSON.stringify(report, null, 2))
console.log('\n音频下载完成，报告已写入 scripts/audio-report.json')
console.log(`下载成功: ${report.downloaded.length}，跳过: ${report.skipped.length}，需手动: ${report.manual.length}，失败: ${report.failed.length}`)
```

---

## 11. 性能边界与约束

### 11.1 同屏气泡数量上限

| 视图模式 | 核心物种最多气泡 | 扩展物种最多气泡 | 总上限 |
|---|---|---|---|
| 全国视图 | 18种 × 5个 = 90 | 已加载数 × 2个，最多 150 | 240 |
| 州视图 | 该州核心种 × 10个 | 该州扩展种 × 5个，最多 100 | 150 |
| 云视图（选中物种） | 13个 DOM 气泡（当前物种） | 其他物种降低 opacity，不增加 | 13 + 60 |

超出上限时优先删除 weight 最低的点。

### 11.2 扩展物种 MapLibre symbol 数量上限

扩展物种的 GeoJSON features 上限 300 个（超出时优先保留当前视野内的）。

### 11.3 节流参数汇总

```typescript
const THROTTLE = {
  BUBBLE_UPDATE_MS: 60,       // 气泡位置/大小更新
  ALA_REQUEST_MS: 400,        // ALA 请求间隔
  BATCH_INTERVAL_MS: 1200,    // 扩展物种批次间隔
  LLM_DEBOUNCE_MS: 0,         // LLM 不需要 debounce（点击才触发）
}
```

---

## 12. 错误处理规格

| 场景 | 处理方式 |
|---|---|
| ALA API 超时（>8s） | 返回空数组，前端显示"当前无法加载分布数据" |
| ALA 返回坐标超出澳大利亚 | 服务端过滤，不返回给前端 |
| DeepSeek API key 未配置 | 返回 503，前端显示"故事生成功能未配置" |
| DeepSeek API 超时 | 停止流式输出，显示已生成的部分 + 省略号 |
| 音频文件不存在（404） | AudioPlayer 隐藏播放按钮，显示"暂无音频" |
| 环境音文件加载失败 | 静默忽略，不播放任何音频 |
| extended-species.json 不存在 | 仅显示核心 18 种，不报错 |
| 单个扩展物种 ALA 请求失败 | 跳过该物种，继续处理下一个 |

---

## 13. 验收标准（Agent 自检清单）

### 数据层
- [ ] `data/ala-lsid-map.json` 存在，18 种物种均有 LSID 或明确标记 null
- [ ] `data/species.json` 每条记录包含 `distributionPoints`（至少 1 个坐标点）
- [ ] `data/species.json` 每条记录包含 `funFacts`（3 条）、`storyNarrative`、`timelineNarratives`
- [ ] `data/extended-species.json` 存在，包含 50 条以上物种记录
- [ ] `data/ambient-audio.json` 存在，6 个地貌区均有定义

### 气泡系统
- [ ] 全国视图下，至少 10 种核心物种显示彩色头像气泡
- [ ] 拖动时间轴，气泡大小有可见变化（不是 opacity 微调）
- [ ] 1788 年前，外来物种（cane_toad、european_rabbit 等）不显示气泡
- [ ] 灭绝物种（thylacine）在 extinctYear 后气泡降为幽灵态（低 opacity + 去饱和）
- [ ] 扩展物种气泡（分类图标）在背景异步加载后淡入，不阻塞交互

### 云效果
- [ ] 点击任意核心物种，云效果 DOM 气泡出现
- [ ] 云效果小气泡有漂移动画，各气泡不同步
- [ ] 地图 pan/zoom 时，DOM 气泡跟随地图移动（不脱锚）
- [ ] 点击其他区域关闭选中，云效果消失

### 后端 API
- [ ] `GET /api/ala/occurrences?lsid=xxx&yearFrom=1900&yearTo=1950` 返回坐标数组
- [ ] `POST /api/llm/story` 返回 SSE 流
- [ ] 两个 API 均有缓存（重复请求不再访问上游）

### 环境音
- [ ] 点击 VIC 南部海岸区域，播放海浪声
- [ ] 点击 NT 内陆区域，播放沙漠风声
- [ ] 切换区域时，交叉淡入淡出（不硬切）
- [ ] 顶部开关可以关闭/开启环境音

### 音频
- [ ] `scripts/audio-report.json` 存在，记录下载状态
- [ ] 至少 10 种核心物种有真实 MP3 文件（非 0 字节）

---

## 14. 不做的事（MVP 硬边界）

1. 不做账号/收藏/分享
2. 不做物种对比视图
3. 不做 3D 地图
4. 不做移动端深适配（基础响应式即可，不做 touch 专属交互）
5. 不做复杂行为动画（走路/飞翔），只做漂移
6. 不做实时 ALA WebSocket 推送
7. 不做历史精确 GIS 边界（关键帧推断即可）
8. 不做扩展物种的专属插图（接口已预留，内容后续填充）
9. 不做多语言切换
10. 扩展物种不做音频
