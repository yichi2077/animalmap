# 澳洲野生动物时空图谱 — 增强轨 PRD (Release B)
> **面向 Claude Code 的独立增强功能执行文档**
> 前置条件：Release A（PRD v3.2）全部验收标准已通过
> 本文档仅描述增强轨功能，不重复 Release A 的内容
> 执行基线：Release A 完成后的仓库状态

---

## 0. 执行前置检查

在开始任何增强轨开发前，必须逐项确认以下前置条件。**任何一项未满足，立即停止，通知用户先完成 Release A。**

```
前置条件清单：
□ npm run build 通过（无报错）
□ npm run lint 通过（无报错）
□ npm run validate:all 通过或报告已确认
□ data/species.json 中每条核心物种记录包含 assetStatus、sources、reviewStatus 字段
□ data/audio.json 中每条记录包含 attribution、license、availability 字段
□ data/timeline.json 中每个关键帧包含 evidenceType 字段
□ components/ui/SpeciesAvatar.tsx 存在且正常工作
□ components/ui/EvidenceBadge.tsx 存在且正常工作
□ lib/use-is-mobile.ts 存在且正常工作
□ InfoPanel 移动端 Drawer 在 390px 宽度下可用
□ 部署平台已确认为 Vercel（Node.js runtime）
□ .env.local 中已配置 DEEPSEEK_API_KEY（用于 LLM 功能）
□ 已知悉：增强轨引入后端 API，整体部署复杂度上升
□ 已知悉：LLM 生成内容需在 UI 中明确标注"AI 生成"
```

---

## 1. 增强轨总览

### 1.1 增强轨的目标

Release A 完成了核心 18 种物种的高质量展示闭环。Release B 的目标是在此基础上，将网站升级为一个**动态丰富的在线生态探索平台**，核心差异是：

| 维度 | Release A | Release B |
|---|---|---|
| 物种数量 | 核心 18 种，静态数据 | 核心 18 种 + 扩展 100-150 种，在线拉取 |
| 地图气泡 | 每种一个固定点 marker | 多点分布气泡，大小反映种群密度 |
| 选中物种视觉 | 单个 portal marker | 云效果气泡群（多点漂移） |
| 物种详情 | 预置文本 | 核心物种预置 + 扩展物种 LLM 实时生成 |
| 地图交互音效 | 无 | 基于地理特征的环境音 |
| 数据来源 | 本地 JSON | 本地 JSON + ALA 在线 API |
| 后端 | 无 | Next.js API Routes（Vercel Serverless） |

### 1.2 增强轨功能模块

Release B 包含以下六个功能模块，**必须按顺序实现**：

```
Module 1：后端 API 层（所有其他模块的前提）
Module 2：扩展物种数据系统
Module 3：多点气泡分布渲染
Module 4：云效果气泡群（选中物种视觉升级）
Module 5：扩展物种 InfoPanel 第三态 + LLM 故事生成
Module 6：地貌环境音系统
```

### 1.3 迭代要求

每个 Module 完成后，Claude Code 必须：
1. 运行 Module 对应的验收检查
2. **如果任何检查项未通过，必须继续修复，直到全部通过，再进入下一 Module**
3. 不允许带着未通过的验收项进入下一 Module
4. 每个 Module 的验收均以功能实际可用为标准，不以"代码写完"为标准

---

## 2. Module 1：后端 API 层

### 2.1 功能描述

建立 Next.js API Routes，作为前端与外部服务（ALA、DeepSeek）之间的代理层。所有对外请求必须经过此层，不允许前端直接调用第三方 API。

### 2.2 需要新建的文件

```
app/api/ala/occurrences/route.ts    — ALA occurrence 数据代理
app/api/ala/species/route.ts        — ALA 物种搜索代理
app/api/llm/story/route.ts          — DeepSeek LLM 故事生成代理
```

### 2.3 各接口功能规格

#### `GET /api/ala/occurrences`

**功能：** 查询指定物种在指定时间范围内的出现记录，返回经纬度坐标数组。

**请求参数：**
- `lsid`（必填）：ALA 物种唯一标识符（LSID），格式为 `urn:lsid:biodiversity.org.au:afd.taxon:xxx`
- `yearFrom`（可选，默认 1970）：查询起始年份
- `yearTo`（可选，默认 2024）：查询结束年份
- `limit`（可选，默认 300，最大 500）：返回记录数上限

**处理逻辑：**
1. 校验 `lsid` 格式：必须以 `urn:lsid:` 开头，拒绝其他格式（返回 400）
2. 向 ALA biocache API 发起请求，端点为 `https://biocache.ala.org.au/ws/occurrences/search`（注意：不是 `biocache-ws.ala.org.au`，该旧域名已弃用）
3. 过滤：仅保留在澳大利亚 bounding box 内的坐标（west: 112, east: 154, south: -44, north: -10）
4. 过滤：仅保留经纬度字段均有效的记录
5. 对相同参数的请求缓存 1 小时（使用 Next.js `fetch` 的 `next: { revalidate: 3600 }` 选项）
6. **即使 ALA 请求失败，也返回 HTTP 200**，内容为空数组 `{ occurrences: [], count: 0, error: "ALA request failed" }`，让前端优雅降级

**返回格式：**
```json
{
  "occurrences": [
    { "lat": -27.47, "lng": 152.98, "year": 2020 }
  ],
  "count": 42
}
```

#### `GET /api/ala/species`

**功能：** 按州或关键词搜索 ALA 中的物种，返回物种列表。

**请求参数：**
- `stateId`（可选）：州 ID（nsw/vic/qld/sa/wa/tas/nt/act），转换为 ALA 对应的州名后查询
- `q`（可选，默认 `*`）：搜索关键词
- `limit`（可选，默认 30，最大 50）：返回数量上限

**处理逻辑：**
1. 将 stateId 映射为 ALA 使用的全称州名
2. 只查询 class 在以下范围内的物种：Aves、Mammalia、Reptilia、Amphibia、Chondrichthyes
3. 按 occurrence 数量降序排序
4. 过滤掉 Release A 核心 18 种物种（避免重复）
5. 缓存 1 小时
6. 失败时返回空数组（HTTP 200）

**返回格式：**
```json
[
  {
    "lsid": "urn:lsid:biodiversity.org.au:afd.taxon:xxx",
    "nameEn": "Rainbow Lorikeet",
    "scientificName": "Trichoglossus moluccanus",
    "taxonomicClass": "bird",
    "occurrenceCount": 45231,
    "dangerStatus": "LC"
  }
]
```

#### `POST /api/llm/story`

**功能：** 调用 DeepSeek API，为指定物种实时生成科普故事，以 SSE 流式返回。

**请求体（JSON）：**
```json
{
  "nameEn": "Rainbow Lorikeet",
  "scientificName": "Trichoglossus moluccanus",
  "dangerStatus": "LC",
  "taxonomicClass": "bird",
  "primaryState": "qld"
}
```

**处理逻辑：**
1. 检查 `DEEPSEEK_API_KEY` 环境变量，未配置则返回 503 + JSON 错误信息（不是 SSE）
2. 对同一 `scientificName` 进行 IP 级速率限制：每个 IP 每分钟最多 5 次请求，超出返回 429
3. 向 DeepSeek Chat API 发起流式请求（`stream: true`）
4. 将 DeepSeek 返回的 SSE 流**透传**给前端，保持流式特性
5. **不缓存**（每次生成内容应有一定随机性）

**DeepSeek 调用 Prompt 规格：**

System prompt（固定）：
```
你是一名擅长写趣味科普的自然博物作家。
风格：口语化、有画面感、适合大众阅读、不要写成百科词条、不要列数字数据。
字数严格控制在 120 字以内。不要在结尾总结，直接讲故事。
```

User prompt 模板：
```
为这种澳大利亚动物写一段有趣的科普小故事：
物种：{nameEn}（学名：{scientificName}）
保护状态：{dangerStatus}
主要分布：{primaryState}（澳大利亚）
要求：有细节、有画面感、有记忆点。
```

**安全要求：**
- LLM 输出绝对不能通过 `dangerouslySetInnerHTML` 渲染，只能作为纯文本显示
- 接口 Response header 必须包含 `Content-Type: text/event-stream`

### 2.4 速率限制实现方式

由于 Vercel Serverless 函数无持久内存，使用**内存 Map + 请求时间窗口**实现：

在每个 API route 的模块作用域中维护一个 `Map<ip, { count: number, resetAt: number }>`。每次请求时：
- 读取 `x-forwarded-for` 或 `x-real-ip` 请求头获取 IP
- 检查当前时间窗口（60 秒）内的请求次数
- 超出限制时返回 429 + `Retry-After` 响应头

注意：Serverless 环境中此 Map 不跨实例共享，属于尽力而为的限制，不是精确限速。如需精确限速，可在用户确认后接入 Upstash Redis，但当前阶段内存方式已足够。

### 2.5 `.env.example` 新增配置项

在现有 `.env.example` 中追加：

```bash
# DeepSeek API Key（LLM 故事生成功能必填）
# 获取地址：https://platform.deepseek.com/
DEEPSEEK_API_KEY=

# ALA API 端点（无需修改，保留用于将来灵活配置）
ALA_BIOCACHE_URL=https://biocache.ala.org.au/ws
ALA_SPECIES_URL=https://api.ala.org.au/species
```

### 2.6 Module 1 验收标准

以下所有检查项必须全部通过，才能进入 Module 2。**未通过则继续修复。**

```
验收检查 M1-01：
  操作：curl "http://localhost:3000/api/ala/occurrences?lsid=urn:lsid:biodiversity.org.au:afd.taxon:e9d6fbbd-1505-4073-990a-dc66c930dad6"
  期望：返回 HTTP 200，JSON 格式，包含 occurrences 数组和 count 字段
  失败判定：HTTP 非 200，或返回格式不符

验收检查 M1-02：
  操作：curl "http://localhost:3000/api/ala/occurrences?lsid=INVALID_FORMAT"
  期望：返回 HTTP 400
  失败判定：HTTP 200（表示没有做输入校验）

验收检查 M1-03：
  操作：curl "http://localhost:3000/api/ala/species?stateId=qld&limit=5"
  期望：返回 HTTP 200，JSON 数组，每项包含 lsid、nameEn、scientificName 字段
  失败判定：返回非 200，或字段缺失

验收检查 M1-04（需配置 DEEPSEEK_API_KEY）：
  操作：curl -X POST "http://localhost:3000/api/llm/story" \
        -H "Content-Type: application/json" \
        -d '{"nameEn":"Koala","scientificName":"Phascolarctos cinereus","dangerStatus":"EN","taxonomicClass":"mammal","primaryState":"qld"}'
  期望：返回 SSE 流，逐步输出中文故事文字
  失败判定：返回非 200，或内容不是流式，或没有中文内容

验收检查 M1-05（DEEPSEEK_API_KEY 未配置时）：
  操作：不设置 DEEPSEEK_API_KEY，执行同 M1-04 的请求
  期望：返回 HTTP 503，JSON 格式错误信息
  失败判定：服务器崩溃，或返回 500 未处理错误

验收检查 M1-06：
  操作：npm run build
  期望：通过，无报错
  失败判定：任何构建错误

验收检查 M1-07：
  操作：npm run lint
  期望：通过，无报错
  失败判定：任何 lint 错误
```

---

## 3. Module 2：扩展物种数据系统

### 3.1 功能描述

建立扩展物种（100-150 种）的数据获取与管理系统。扩展物种不存储在静态 JSON 中，而是通过 `/api/ala/species` 接口在运行时动态获取，并在前端内存中缓存。

扩展物种是对核心 18 种的**补充**，不是替代。视觉上必须明显区分：核心物种是主角，扩展物种是背景丰富层。

### 3.2 扩展物种的定义边界

**什么是扩展物种：**
- 不在核心 18 种列表中的澳大利亚野生动物
- 在 ALA 中有至少 100 条 occurrence 记录（保证分布数据质量）
- taxonomic class 属于：Aves、Mammalia、Reptilia、Amphibia、Chondrichthyes
- 优先选择各州代表性物种

**扩展物种不具备的内容（与核心物种的明确区别）：**
- 无专属插图（仅用分类通用图标）
- 无预置故事文本（点击时实时 LLM 生成）
- 无详细 timeline 关键帧（仅有当代分布快照）
- 无专属音频

### 3.3 扩展物种数据结构

扩展物种的运行时数据类型（TypeScript）：

```
interface ExtendedSpecies {
  id: string                  // 格式："ext_{lsid末尾20字符}"
  lsid: string                // ALA LSID 完整字符串
  nameEn: string              // 英文通用名（来自 ALA commonName 字段）
  scientificName: string      // 学名
  taxonomicClass: string      // bird / mammal / reptile / amphibian / marine
  occurrenceCount: number     // ALA 中的 occurrence 记录总数
  primaryState: string        // 主要分布州 ID
  dangerStatus: string        // ALA 中的保护等级
  isCore: false               // 始终为 false，与核心物种区分
  // 以下字段在运行时获取后填充：
  distributionPoints?: Array<{ lat: number; lng: number; weight: number }>
  populationScore?: number    // 基于 occurrence count 归一化，0-1
}
```

### 3.4 `hooks/useALASpecies.ts` 功能规格

这是扩展物种系统的核心 Hook，负责按批次异步拉取扩展物种数据并管理内存缓存。

**Hook 行为规格：**

1. **触发时机：** 核心 18 种物种的静态数据渲染完成（地图首屏显示正常）后，自动在后台开始加载扩展物种。不在首屏阻塞用户操作。

2. **加载顺序：** 如果当前有 `focusRegionId`（用户已点击某州），优先加载该州的扩展物种；否则按 occurrence 数量降序加载（最受关注的物种优先出现）。

3. **批次策略：** 每批次 15 种，批次间隔 1200ms，避免 ALA API 请求过密。

4. **坐标获取：** 每种扩展物种的分布点通过 `/api/ala/occurrences` 获取，年份范围固定为 1970-2024，limit 固定为 200。获取后使用 k-means 聚合为 3-6 个代表性分布点。

5. **内存管理：** 最多在内存中保留 80 种扩展物种的分布数据（FIFO 淘汰策略，优先淘汰最早加载的）。

6. **缓存键：** 以 `lsid` 为键，同一物种在 Session 内不重复请求。

7. **失败处理：** 单个物种的 ALA 请求失败时，跳过该物种，继续处理下一个，不中断整个批次。

**Hook 返回值：**
- `loadedSpecies: ExtendedSpecies[]` — 已加载的扩展物种列表（实时增长）
- `isLoading: boolean` — 是否仍在加载中
- `loadedCount: number` — 已加载数量
- `totalExpected: number` — 预计加载总数

### 3.5 k-means 聚合实现

扩展物种的分布点通过 k-means 聚合，将 ALA 原始 occurrence 坐标（可能有几十到几百个点）聚合为 3-6 个代表性点。

**k-means 实现放在 `lib/kmeans.ts`，供 Hook 和数据预处理脚本共用。**

规格要求：
- 使用 k-means++ 初始化（更稳定，避免随机初始化导致的聚类偏差）
- 迭代次数：15 次（MVP 精度足够）
- 输入：坐标点数组 `{lat, lng}[]`
- 参数 k：`Math.min(6, Math.max(3, Math.ceil(points.length / 40)))`
- 输出：每个聚类中心 + 该聚类占总点数的权重（0-1）
- 坐标精度：保留 2 位小数

**populationScore 计算：**

扩展物种无 timeline 数据，其 `populationScore` 通过 occurrence count 对数归一化：

```
populationScore = log(count + 1) / log(5001)
```

（5001 对应约 5000 条记录，假设这是 MVP 中出现的最大值，做归一化分母）

### 3.6 Module 2 验收标准

```
验收检查 M2-01：
  操作：打开网站，等待 5 秒后观察地图
  期望：除核心 18 种 marker 外，出现更多物种的气泡（分类图标样式），且地图仍然流畅可操作
  失败判定：无新气泡出现，或地图卡顿、掉帧明显

验收检查 M2-02：
  操作：打开 Chrome DevTools Network 面板，观察网络请求
  期望：看到若干 /api/ala/occurrences 请求，间隔约 1.2 秒，不是同时发出
  失败判定：所有请求同时发出（未实现批次间隔）

验收检查 M2-03：
  操作：点击 QLD 州，等待 3 秒
  期望：QLD 州内新增扩展物种气泡（昆士兰州的代表物种如彩虹鹦鹉等）
  失败判定：无新增气泡，或新增的气泡与 QLD 无关

验收检查 M2-04：
  操作：打开 React DevTools 或 console，检查已加载物种数量
  期望：5 分钟后加载数量应达到 50 种以上
  失败判定：5 分钟后仍低于 50 种（说明批次逻辑有问题）

验收检查 M2-05：
  操作：刷新页面，观察扩展物种加载是否重新开始
  期望：刷新后重新加载（session 内有缓存，但页面刷新后重置）
  失败判定：刷新后仍使用旧数据（说明缓存范围错误）

验收检查 M2-06：
  操作：npm run build && npm run lint
  期望：全部通过
  失败判定：任何报错
```

---

## 4. Module 3：多点气泡分布渲染

### 4.1 功能描述

将现有的"每种动物一个固定点 marker"升级为"多点气泡分布"，使用 MapLibre 的 GeoJSON Symbol Layer 渲染。气泡大小随 `populationScore` 动态变化，反映种群丰度。

**这是 Release B 中视觉变化最大的模块，但风险也最高。** 必须保证：
- 核心 18 种的体验完整性不退步（Release A 的质量不能降低）
- 扩展物种气泡的视觉层级明显低于核心物种（背景层）
- 全国视图最多同时显示 240 个气泡时，帧率不低于 30fps

### 4.2 架构：双 GeoJSON Source

地图上的物种气泡使用两个独立的 GeoJSON Source，分别管理核心物种和扩展物种：

**Source 1：核心物种气泡**（`atlas-core-bubbles`）
- 数据来自 `species.json` 的 `distributionPoints` 字段（Release A 应已通过脚本获取）
- 每个物种最多显示 5 个气泡（全国视图）/ 10 个（州聚焦视图）
- 气泡图片：物种品牌色 + 分类 icon 的 SVG 气泡（动态生成并预加载到地图）
- 气泡半径：`baseRadius * (0.5 + populationScore * 0.8)`

**Source 2：扩展物种气泡**（`atlas-ext-bubbles`）
- 数据来自 `useALASpecies` hook 的 `loadedSpecies`
- 每个物种最多显示 2 个气泡（全国视图）/ 5 个（州聚焦视图）
- 气泡图片：6 种分类通用 icon（bird/mammal/reptile/marine/amphibian/invertebrate），比核心物种气泡小 30%，透明度 0.55
- 扩展物种气泡**不带动物照片**，只有纯色分类图标

### 4.3 气泡尺寸系统

**各物种分组的基准半径（单位：像素，zoom=5 时）：**

| 分组 | 基准半径 | 说明 |
|---|---|---|
| `extinct` | 10px | 偏小，体现消失感 |
| `endangered` | 14px | 中等偏小 |
| `native` | 16px | 中等，生命力感 |
| `invasive` | 18px | 偏大，扩张感 |
| `marine` | 15px | 中等 |
| 扩展物种 | 10px | 统一，明显小于核心物种 |

**实际半径计算公式：**
```
radius = baseRadius × (0.5 + populationScore × 0.8)
isRepresentative（主气泡）时再乘以 1.6
```

**将 radius 转换为 MapLibre `icon-size`：**

MapLibre `icon-size` 是相对于预加载图片尺寸的比例系数，不是像素值。预加载气泡图片尺寸为 88×88px（pixelRatio: 2，逻辑尺寸 44px）。转换公式：

```
iconSize = (radius × 2) / 88
```

因此 radius=16px 对应 `icon-size: 0.36`，radius=25px 对应 `icon-size: 0.57`。

### 4.4 气泡图片生成与预加载

核心物种气泡图片是 SVG 字符串，动态生成后通过 `map.addImage()` 预加载。每个物种一张图片，图片 ID 等于物种 `id`。

**气泡 SVG 规格（88×88px）：**
- 外圈：带物种品牌色描边的圆（`stroke-width: 3`）
- 内部：淡色品牌色背景
- 中心：分类 icon SVG path，缩放至 40×40 区域
- 灭绝物种：加 `feColorMatrix saturate(0.15)` 滤镜
- `pixelRatio: 2`（高清屏显示质量）

**重要约束：灭绝状态不烘焙进图片**

气泡图片的灭绝状态（去饱和效果）不应在图片生成时就确定，而应通过 MapLibre 的 `icon-opacity` 和 paint 表达式在图层级别动态控制：

- 正常物种：`icon-opacity: 0.36 + populationScore × 0.52`
- 灭绝后：`icon-opacity` 使用 `getSpeciesOpacity(score, true)`（已有函数），配合 icon-color 叠加灰色

原因：物种是否处于"灭绝后"状态是由 `currentYear` 和 `extinctYear` 动态决定的，随时间轴移动而变化。静态烘焙会导致袋狼在 1935 年时就显示为幽灵态。

### 4.5 时间轴驱动的气泡更新

气泡 GeoJSON 数据随 `currentYear` 变化而更新。更新逻辑：

1. 使用 `throttle(60ms)` 节流，避免时间轴快速拖动时过度渲染
2. 每次更新时，重新计算每种物种的：
   - `isVisibleOnMap`（未到来/已灭绝的物种不显示）
   - `populationScore`（通过 `interpolateKeyframes` 插值）
   - `iconOpacity`、`auraOpacity`（基于 populationScore 和状态）
   - `iconSize`（基于 populationScore 和分组基准半径）
3. 调用 `source.setData(newGeoJSON)` 更新数据
4. 不销毁重建 source/layer（只更新数据）

**throttle 工具函数** 放在 `lib/throttle.ts`：使用闭包实现，不依赖 lodash：
```
上次执行时间存储在闭包中，当前时间 - 上次时间 >= 间隔时执行，否则记录 pending
```

### 4.6 层叠顺序（Z-order）

MapLibre 图层从底到顶的顺序：

```
1. 底图（OpenFreeMap / MapTiler）
2. 区域填充层（atlas-region-fill）— 现有
3. 区域光晕/边框层（现有多个层）— 现有
4. 扩展物种光晕层（atlas-ext-aura）— 新增
5. 扩展物种符号层（atlas-ext-symbol）— 新增
6. 核心物种光晕层（atlas-core-aura）— 新增（替代现有 atlas-species-aura）
7. 核心物种命中层（atlas-core-hit）— 新增（替代现有 atlas-species-hit）
8. 核心物种符号层（atlas-core-symbol）— 新增（替代现有 atlas-species-symbol）
```

**点击事件检测顺序**：先检测核心物种层，再检测扩展物种层，再检测区域层。

### 4.7 Module 3 验收标准

```
验收检查 M3-01：
  操作：打开网站，拖动时间轴从 1770 到 2024
  期望：
    - 甘蔗蟾蜍（cane_toad）在 1935 年前不显示气泡，1935 年后出现并随时间增大
    - 欧洲野兔（european_rabbit）在 1859 年前不显示
    - 袋狼（thylacine）在 1936 年后气泡消失或变为幽灵态
    - 所有变化流畅，无闪烁
  失败判定：以上任一物种的时间逻辑错误

验收检查 M3-02：
  操作：在全国视图下，打开 Chrome DevTools Performance 面板，录制 5 秒时间轴拖动
  期望：帧率不低于 30fps
  失败判定：帧率低于 30fps，或出现明显卡顿

验收检查 M3-03：
  操作：点击考拉（koala）的气泡
  期望：InfoPanel 打开并显示考拉的详情，与 Release A 完全一致
  失败判定：点击无响应，或信息不正确

验收检查 M3-04：
  操作：在全国视图同时存在核心物种和扩展物种气泡时，视觉检查
  期望：
    - 核心物种气泡明显大于扩展物种气泡
    - 扩展物种气泡透明度明显低于核心物种
    - 地图整体仍然呈现"绘本"感，不是数据散点图
  失败判定：核心物种和扩展物种气泡视觉上难以区分

验收检查 M3-05：
  操作：点击 VIC 州（维多利亚州）区域聚焦后，观察气泡变化
  期望：
    - VIC 州内的物种气泡密度增加（显示更多个点）
    - 其他州的气泡降低透明度
    - 镜头推进动画流畅
  失败判定：聚焦后气泡无变化，或镜头动画卡顿

验收检查 M3-06：
  操作：npm run build && npm run lint
  期望：全部通过
  失败判定：任何报错
```

---

## 5. Module 4：云效果气泡群（选中物种视觉升级）

### 5.1 功能描述

当用户点击某个物种时，在地图上展示该物种的"云效果气泡群"：
- 一个主气泡（最大，位于密度中心，带动物品牌色外环发光）
- 若干小气泡（同物种的其他分布点，半径较小，半透明，带缓慢漂移动画）
- 主气泡与小气泡之间有极细的虚线连接（表示同属一个物种群体）

这个效果**替代** Release A 中的 `SelectedSpeciesMarker` portal（保留 portal 的逻辑框架，但视觉内容升级）。

### 5.2 技术选型

云效果气泡群**使用 React Portal + DOM 元素**实现，而不是 MapLibre Symbol Layer。

原因：Framer Motion 的漂移动画无法直接驱动 MapLibre 图层，而 DOM 元素可以通过 Framer Motion 精确控制每个气泡的独立漂移。

**实现机制：**
1. 在 `app/page.tsx` 中添加一个 `<div id="atlas-cloud-layer">` 挂载点，绝对定位覆盖地图，`pointer-events: none`，`z-index: 20`
2. 在 `AustraliaMap.tsx` 中，当 `selectedSpeciesId` 变化时，通过 `createPortal` 将云效果组件渲染到此挂载点
3. 每个气泡通过 `map.project([lng, lat])` 获取屏幕坐标，转换为绝对定位
4. 监听地图 `move` 和 `zoom` 事件，使用 `requestAnimationFrame` 节流更新所有气泡的屏幕坐标

**关键性能约束：** `map.on('move')` 和 `map.on('zoom')` 触发频率极高（60fps），必须用 `requestAnimationFrame` 节流，确保坐标更新最多 60fps，不超过。防止在地图拖动时产生 DOM 更新风暴。

### 5.3 云效果视觉规格

**主气泡（Representative Bubble）：**
- 半径：基于分组基准半径 × 1.6（比 Module 3 中 symbol layer 的非选中态更大）
- 外观：`SpeciesAvatar` 组件（物种插图 / 照片 / 分类 icon fallback）
- 边框：`3px solid {species.color}`
- 外发光：`box-shadow: 0 0 0 8px {color}22, 0 8px 24px {color}44`
- 动画：轻呼吸感（gentle-breathe，4s 周期，scale 1→1.03）
- 无漂移（主气泡位置固定）

**小气泡（Secondary Bubble）：**
- 数量：分布点总数 - 1，最多 12 个
- 半径：主气泡半径 × 0.6 ~ 0.85（越靠近主气泡越小）
- 外观：同种分类 icon，无照片
- 透明度：0.45 + 该点 weight × 0.35
- 边框：`1.5px solid {species.color}88`
- 漂移动画参数（每个气泡独立，避免同步感）：
  - 振幅：2-6px（随机）
  - 周期：8000-14000ms（随机）
  - 相位：0-2π（随机，基于气泡索引计算，保证每次渲染相同）
  - 运动轨迹：椭圆形，X 方向振幅略大于 Y 方向

**连接线（Connector Lines）：**
- 从主气泡中心到每个小气泡中心
- 样式：`stroke: {color}，stroke-width: 0.8px，stroke-opacity: 0.15，stroke-dasharray: "3 4"`
- 使用单个 SVG overlay 渲染所有连接线（不是每条线一个独立 SVG）
- SVG 覆盖整个地图容器，`overflow: visible`

### 5.4 云效果生命周期

| 事件 | 云效果行为 |
|---|---|
| 物种被选中 | 云效果气泡群淡入（0.3s），其他物种 opacity 降低到 0.15 |
| 物种被取消选中 | 云效果气泡群淡出（0.2s），其他物种 opacity 恢复 |
| 地图 pan/zoom | 所有气泡跟随更新位置（rAF 节流），漂移动画在屏幕坐标上叠加 |
| 用户切换到另一个物种 | 旧云效果淡出同时新云效果淡入（AnimatePresence） |
| 时间轴变化 | 分布点数量和大小变化，气泡数量相应增减（有出现/消失动画） |

### 5.5 `prefers-reduced-motion` 处理

当 `useReducedMotion()` 返回 `true` 时：
- 漂移动画停止（所有小气泡静止）
- 呼吸动画停止
- 淡入淡出仍然保留（duration: 0 时仅为瞬切，不能完全去掉出现/消失）

### 5.6 Module 4 验收标准

```
验收检查 M4-01：
  操作：点击地图上的考拉（koala）marker
  期望：
    - InfoPanel 正常打开
    - 考拉所在位置出现主气泡（较大，有发光效果）
    - 周围出现若干小气泡（若 distributionPoints 有多个点）
    - 小气泡有各自独立的漂移动画，不同步
  失败判定：无云效果，或所有小气泡动画完全同步

验收检查 M4-02：
  操作：在云效果显示时，拖动地图平移
  期望：云效果气泡群随地图一起移动，不脱锚
  失败判定：气泡位置固定不动，或移动时有明显延迟/抖动

验收检查 M4-03：
  操作：云效果显示时，检查连接线
  期望：每个小气泡和主气泡之间有虚线连接，透明度约 0.15
  失败判定：无连接线，或连接线过于醒目影响绘本感

验收检查 M4-04：
  操作：点击取消选中（点击地图空白处），观察动画
  期望：云效果渐出（0.2s），其他物种 opacity 恢复
  失败判定：云效果突然消失（无过渡），或其他物种 opacity 不恢复

验收检查 M4-05：
  操作：启用系统"减少动画"设置，重新点击物种
  期望：漂移动画停止，但云效果仍然显示
  失败判定：云效果完全消失，或漂移仍在进行

验收检查 M4-06：
  操作：打开 Performance 面板，在云效果显示时拖动地图 5 秒
  期望：帧率不低于 30fps
  失败判定：帧率低于 30fps，或出现明显卡顿

验收检查 M4-07：
  操作：npm run build && npm run lint
  期望：全部通过
  失败判定：任何报错
```

---

## 6. Module 5：扩展物种 InfoPanel 第三态 + LLM 故事生成

### 6.1 功能描述

当用户点击扩展物种时，InfoPanel 切换到第三种状态（扩展物种详情态），展示：
- 物种基本信息（英文名、学名、分类、保护等级）
- 分类图标（无专属插图）
- ALA 数据摘要（occurrence 数量、主要分布州）
- LLM 实时生成的故事（打字机流式效果）
- "在 ALA 查看完整资料"外链

### 6.2 三态状态机

```
InfoPanel 状态枚举：
  'closed'            → isOpen = false
  'region'            → focusRegionId 有值，selectedSpeciesId 为空
  'core-species'      → selectedSpeciesId 在核心 18 种列表中
  'extended-species'  → selectedSpeciesId 是扩展物种 ID（以 'ext_' 开头）
```

状态判断逻辑应集中在一个 `getPanelState()` 纯函数中，而不是散布在渲染逻辑里。

### 6.3 扩展物种详情 UI 规格

**物种标题区：**

| 元素 | 规格 |
|---|---|
| 图标容器 | 56×56px，圆角 `1rem`，背景 `{taxonomicClassColor}18`，边框 `1.5px solid {color}36` |
| 分类图标 | 28px，使用对应 `taxonomicClass` 的 SVG icon path |
| 英文名 | `text-base font-medium`，`var(--text-primary)` |
| 学名 | `text-[0.72rem]`，`var(--warm-gray)`，斜体 |
| 保护等级标签 | `ConservationBadge` 组件（复用 Release A 中已有的实现） |

**ALA 数据摘要区：**

卡片样式（`background: rgba(246, 236, 217, 0.54)`，圆角 `1rem`），显示：
- "ALA 记录 {occurrenceCount} 条"（格式化为千分位）
- "主要分布：{州中文名}"

**LLM 故事区：**

- 标题：小字 kicker "AI 生成故事"
- 加载中：骨架屏（3 行 animate-pulse 占位条），同时显示"正在查阅这种动物的故事…"
- 生成中：打字机效果（逐字符追加），末尾显示闪烁光标 `▍`（animate-pulse）
- 完成：纯文本段落，无光标
- 错误：显示"故事加载失败，稍后重试"，不显示空白

**重要：LLM 故事底部必须显示免责声明：**
```
"🤖 以上内容由 AI 生成，仅供科普参考 · 数据来源：ALA"
```
样式：`text-[0.62rem]`，`var(--warm-gray)`，`opacity: 0.6`

**ALA 外链区：**
- 文案："在 ALA 查看完整资料 ↗"
- 链接：`https://bie.ala.org.au/species/{encodeURIComponent(lsid)}`
- 样式：`text-[0.72rem]`，`var(--earth-light)`，hover 时 `opacity: 0.7`

### 6.4 LLM 故事的客户端缓存

同一物种的故事在客户端 Session 内缓存（`useRef<Map<string, string>>`），第二次点击同一物种直接显示缓存结果，不重新调用 API。

**缓存键：物种的 `scientificName`**（不用 lsid，因为缓存的是故事内容，与学名绑定更语义化）

### 6.5 打字机效果实现规格

从 `/api/llm/story` 的 SSE 流解析文字：

1. 维护 `buffer` 字符串，处理跨 chunk 的不完整行
2. 每收到一个 token（delta.content），追加到 `story` state
3. React 每次 `setState` 触发重渲染，实现打字机效果
4. 注意：不要用 `setInterval` 逐字显示，而是**接收多快就显示多快**（LLM 输出速度本身就是打字机节奏）
5. 流结束时移除光标，缓存最终结果

**SSE 解析的 buffer 逻辑：**

```
完整逻辑：
  buffer += decoder.decode(chunk, { stream: true })
  lines = buffer.split('\n')
  buffer = lines.pop() ?? ''   ← 最后一行可能不完整，留到下次
  for each line in lines:
    if line.startsWith('data: '):
      data = line.slice(6)
      if data === '[DONE]': break
      try: delta = JSON.parse(data).choices[0]?.delta?.content ?? ''
      story += delta
```

### 6.6 扩展物种与 AtlasContext 的集成

`AtlasContext` 需要追加对扩展物种的感知：

在现有 `openSpecies` action 中，判断 `speciesId` 是否以 `'ext_'` 开头，如果是，则为扩展物种，需要从 `useALASpecies` hook 中查找对应记录（而不是从 `speciesData` 中查找）。

实现方式：在 `AtlasProvider` 中接入 `useALASpecies` hook（或通过 prop/context 传递 loadedSpecies），使 InfoPanel 可以访问扩展物种数据。

### 6.7 搜索功能扩展

现有搜索只覆盖核心 18 种。Release B 中，搜索需要同时覆盖已加载的扩展物种。

规格：
- 搜索词与以下字段匹配：nameEn（不区分大小写）、scientificName（不区分大小写）
- 扩展物种搜索结果排在核心物种之后
- 下拉列表最多显示 8 项（核心 + 扩展合计）
- 扩展物种在下拉列表中用分类图标而非品牌色圆点标识

### 6.8 Module 5 验收标准

```
验收检查 M5-01：
  操作：等待扩展物种加载完成后，点击地图上一个扩展物种的气泡
  期望：
    - InfoPanel 打开，显示英文名、学名、ALA 记录数、主要分布州
    - 几秒内开始出现打字机效果的 AI 生成故事
    - 底部显示 AI 免责声明
    - 显示"在 ALA 查看完整资料"链接
  失败判定：InfoPanel 显示核心物种的信息，或故事未出现，或无免责声明

验收检查 M5-02：
  操作：同一扩展物种，关闭 InfoPanel 后重新点击
  期望：故事立即显示（无打字机效果，从缓存读取）
  失败判定：重新点击后又触发了 API 调用，出现重复打字机效果

验收检查 M5-03：
  操作：不配置 DEEPSEEK_API_KEY，点击扩展物种
  期望：显示"故事加载失败，稍后重试"，其他内容（名称、ALA 数据）正常显示
  失败判定：整个 InfoPanel 报错或白屏

验收检查 M5-04：
  操作：在搜索框输入 "lorikeet"
  期望：下拉列表中出现 Rainbow Lorikeet（或其他相关扩展物种）
  失败判定：搜索结果中只有核心 18 种，无扩展物种

验收检查 M5-05：
  操作：在搜索框输入 "koala"
  期望：核心物种考拉排在扩展物种之前
  失败判定：核心物种与扩展物种排序混乱

验收检查 M5-06：
  操作：npm run build && npm run lint
  期望：全部通过
  失败判定：任何报错
```

---

## 7. Module 6：地貌环境音系统

### 7.1 功能描述

当用户点击地图的不同区域时，根据点击位置的地理特征（地貌类型），播放对应的环境背景音。环境音作为低音量背景层持续循环，切换区域时交叉淡入淡出。

### 7.2 地貌分区定义

环境音与地貌区域的映射存储在 `data/ambient-audio.json` 中（新建文件）。

**六种地貌类型和对应区域：**

| 地貌 ID | 中文名 | 音效特征 | 覆盖区域 |
|---|---|---|---|
| `tropical_rainforest` | 热带雨林 | 密集鸟鸣 + 雨声 + 蝉鸣 | QLD 北部（-20°N 以北，lngRange 143-146） |
| `coastal` | 沿海 | 海浪声 + 海鸥声 | NSW/VIC/WA/SA/TAS 海岸线（各州东/南/西边缘） |
| `outback_desert` | 内陆沙漠 | 干热风声 + 远处鸟鸣 | NT 中南部、WA 内陆、SA 北部 |
| `temperate_forest` | 温带森林 | 清脆鸟鸣 + 溪流声 | TAS 大部、VIC 东部山区 |
| `savanna` | 热带草原 | 草地风声 + 稀疏鸟鸣 | QLD 内陆、NT 北部 |
| `ocean` | 海洋 | 深海低沉水声 | 点击地图海域区域（stateId 为 null） |

**地貌判断优先级：**

当点击坐标落在多个区域的交叉地带时，按以下优先级匹配：
`tropical_rainforest > coastal > temperate_forest > savanna > outback_desert`

**默认地貌：** 当坐标不匹配任何特定地貌时，返回 `outback_desert`（最具代表性的澳大利亚内陆音效）。

**海域判断：** 当 `stateId === null`（用户点击了地图上的海域区域）时，直接返回 `ocean`。

### 7.3 `data/ambient-audio.json` 数据结构

```
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

### 7.4 `lib/ambient-audio.ts` 功能规格

此模块包含地貌判断纯函数 `getZoneIdForCoordinate`：

- 输入：`lat: number, lng: number, stateId: string | null`
- 输出：`string`（zone ID）
- 逻辑：如 §7.2 所述的优先级匹配

此函数是纯函数，不依赖 React，可被 Hook 和 Server Side 代码共用。

### 7.5 `hooks/useAmbientAudio.ts` 功能规格

**音频管理规格：**

1. 使用 `HTMLAudioElement` 播放环境音，循环模式（`loop: true`）
2. 目标音量：`0.30`（环境音不能盖过物种音效）
3. 交叉淡入淡出时长：`1500ms`
4. 淡出：以 50ms 为步长，每步降低 `(currentVolume / (1500/50))` 的音量，直到 0，然后暂停
5. 淡入：新音频从 volume 0 开始播放，以 50ms 为步长逐步升至 0.30
6. 切换逻辑：旧音频开始淡出的同时，新音频开始淡入（交叉）

**Hook 对外接口：**
- `triggerForCoordinate(lat, lng, stateId)` — 根据坐标触发对应地貌音效
- `stopAmbient()` — 停止所有环境音
- 注意：音量控制在 AtlasContext 的 `ambientAudioEnabled` 状态下

**AtlasContext 需要追加的字段：**
```
ambientAudioEnabled: boolean        — 用户开关，默认 true，持久化到 localStorage
currentAmbientZoneId: string | null — 当前播放的地貌 zone ID
```

**触发时机：**

在 `AustraliaMap.tsx` 的地图点击事件处理函数中，除了现有的物种/区域点击逻辑外，追加调用 `ambientAudio.triggerForCoordinate(lngLat.lat, lngLat.lng, stateId)`。

### 7.6 环境音开关 UI

**位置：** `TopOverlay.tsx` 的右侧（搜索框区域旁边），一个圆形图标按钮。

**规格：**
- 尺寸：`h-8 w-8`
- 图标：SVG 喇叭图标（开启状态有声波线条，关闭状态有一条斜线）
- 开启时背景：`rgba(125,165,108,0.18)`（leaf 色调）
- 关闭时背景：`rgba(239,223,196,0.6)`（parchment 色调）
- Tooltip（title 属性）：开启时"关闭环境音"，关闭时"开启环境音（点击地图区域播放）"
- `ambientAudioEnabled` 状态变化时，localStorage key `atlas-ambient-enabled` 同步更新

**用户可发现性（Discoverability）：**

网站首次加载且地图就绪后，在底部时间轴上方显示一条临时提示（3 秒后自动消失）：

```
提示文案："点击地图任意区域，聆听那里的声音 🌿"
样式：居中，小字，gentle-float 动画，不阻断操作
只在第一次访问时显示（localStorage 记忆 atlas-ambient-hint-seen）
```

### 7.7 音频文件获取

环境音文件需要放在 `public/assets/audio/ambient/` 目录下。

**获取途径（优先级顺序）：**

1. **Freesound.org CC 授权音频**（推荐）：在 freesound.org 搜索对应的关键词，下载 CC0 或 CC BY 授权的音频文件。每种地貌的推荐搜索词：
   - 热带雨林：`tropical rainforest australia birds`
   - 沿海：`ocean waves australia beach`
   - 内陆沙漠：`outback australia desert wind`
   - 温带森林：`temperate forest birds creek stream australia`
   - 热带草原：`savanna grassland wind birds australia`
   - 海洋：`underwater ocean ambient deep`

2. **自动下载脚本** `scripts/fetch-audio.mjs`：如果 `FREESOUND_API_KEY` 已配置（freesound.org 免费注册可获取），脚本自动搜索并下载上述音频。如果未配置，脚本输出手动下载指引后退出。

**环境音 Fallback：** 如果对应音频文件不存在，`useAmbientAudio` 静默跳过（不报错、不播放任何声音），用户体验正常降级。

### 7.8 Module 6 验收标准

```
验收检查 M6-01（需要 ambient 音频文件存在）：
  操作：点击 VIC 州南部海岸附近区域（lat ≈ -38, lng ≈ 145）
  期望：在 1.5 秒内开始播放海浪声
  失败判定：无声音，或播放的是错误的地貌音效

验收检查 M6-02：
  操作：点击 NT 内陆区域（lat ≈ -20, lng ≈ 133）
  期望：切换为沙漠风声，交叉淡变（不是硬切）
  失败判定：声音突然切换（无淡变），或播放热带音效

验收检查 M6-03：
  操作：点击地图海域区域（QLD 以东的海域）
  期望：切换为深海环境音
  失败判定：不变，或报错

验收检查 M6-04：
  操作：点击 TopOverlay 右侧的喇叭开关按钮
  期望：环境音停止，按钮状态切换为关闭样式
  失败判定：音频不停止，或按钮状态未变

验收检查 M6-05：
  操作：关闭环境音后刷新页面
  期望：页面刷新后环境音仍处于关闭状态（localStorage 持久化）
  失败判定：刷新后环境音自动开启

验收检查 M6-06（音频文件不存在时）：
  操作：删除 ambient 目录下的 mp3 文件后刷新，点击地图
  期望：页面正常，无报错，只是没有音效
  失败判定：控制台报错，或页面有任何异常

验收检查 M6-07：
  操作：npm run build && npm run lint
  期望：全部通过
  失败判定：任何报错
```

---

## 8. 增强轨整体验收标准

完成所有 6 个 Module 后，进行整体联合验收。**以下检查项全部通过，才视为增强轨（Release B）完成。**

### 8.1 功能完整性验收

```
整体验收 OA-01：
  完整体验流程：
  打开网站 → Intro 播放 → 地图就绪 → 等待 10 秒 → 地图上出现扩展物种气泡
  → 拖动时间轴观察气泡变化 → 点击 QLD 州聚焦 → 看到 QLD 区域内丰富的物种气泡
  → 点击一个扩展物种 → InfoPanel 第三态显示，LLM 故事打字机加载
  → 关闭面板 → 点击 NSW 海岸区域 → 听到海浪声
  → 点击关闭环境音 → 点击另一区域无声音变化
  期望：上述所有步骤流畅完成，无卡顿，无错误
  失败判定：任何步骤出现问题

整体验收 OA-02：
  核心 18 种体验不退步：
  执行 Release A 的所有验收检查（PRD v3.2 第 10 节）
  期望：全部通过（Release B 不能破坏 Release A 的功能）
  失败判定：任何 Release A 验收项未通过
```

### 8.2 性能验收

```
整体验收 OA-03：
  场景：全国视图，已加载 80+ 种物种气泡，拖动时间轴 10 秒
  期望：帧率全程不低于 30fps，无明显卡顿
  工具：Chrome DevTools Performance 面板
  失败判定：帧率多次低于 30fps，或有超过 200ms 的长任务

整体验收 OA-04：
  场景：点击 QLD 州，等待 5 秒，然后点击某个扩展物种
  期望：云效果出现流畅，LLM 故事在 3 秒内开始打字
  失败判定：云效果卡顿，或故事 5 秒后仍无任何输出
```

### 8.3 安全与合规验收

```
整体验收 OA-05：
  LLM 内容显示检查：
  找到页面上的 AI 生成故事文本
  期望：文本下方有"🤖 以上内容由 AI 生成，仅供科普参考"免责声明
  失败判定：无免责声明

整体验收 OA-06：
  速率限制测试：
  在 60 秒内向 /api/llm/story 发起 6 次请求（使用同一 IP）
  期望：第 6 次请求返回 HTTP 429
  失败判定：所有请求均返回 200（说明速率限制未生效）

整体验收 OA-07：
  XSS 安全检查：
  在 LLM 故事中包含 HTML 标签（通过修改 Prompt 或 Mock 响应）
  期望：HTML 标签作为纯文本显示，不被执行
  失败判定：HTML 被执行（说明使用了 dangerouslySetInnerHTML）
```

### 8.4 降级与稳定性验收

```
整体验收 OA-08：
  场景：不配置 DEEPSEEK_API_KEY，完整体验全站
  期望：
    - 核心 18 种功能完全正常
    - 扩展物种点击后显示信息面板，故事区域显示友好错误提示
    - 网站其他功能不受影响
  失败判定：任何崩溃或功能异常

整体验收 OA-09：
  场景：ALA API 全部超时（可通过 Mock 或临时断网模拟）
  期望：
    - 核心 18 种气泡正常显示（来自本地 JSON）
    - 扩展物种气泡不显示，但无报错
    - 搜索、InfoPanel、时间轴等功能正常
  失败判定：出现 JS 报错，或核心功能受影响

整体验收 OA-10：
  最终构建：
  npm run build && npm run lint && npm run validate:all
  期望：全部通过
  失败判定：任何报错
```

---

## 9. 新增文件清单

Release B 新建的文件（不修改 Release A 已有文件的核心逻辑，只追加新文件和新字段）：

### 后端 API

```
app/api/ala/occurrences/route.ts
app/api/ala/species/route.ts
app/api/llm/story/route.ts
```

### 前端 Hooks 和 Libs

```
hooks/useALASpecies.ts
hooks/useAmbientAudio.ts
lib/kmeans.ts
lib/ambient-audio.ts
lib/throttle.ts
```

### 数据文件

```
data/ambient-audio.json
data/extended-species.json  （由 scripts/fetch-extended-species.mjs 生成）
```

### 工具脚本

```
scripts/fetch-extended-species.mjs   — 从 ALA 拉取扩展物种列表
scripts/fetch-audio.mjs              — 下载环境音文件（需 FREESOUND_API_KEY）
```

### 媒体目录（需手动准备或脚本下载）

```
public/assets/audio/ambient/tropical-rainforest.mp3
public/assets/audio/ambient/coastal-waves.mp3
public/assets/audio/ambient/outback-desert.mp3
public/assets/audio/ambient/temperate-forest.mp3
public/assets/audio/ambient/savanna.mp3
public/assets/audio/ambient/ocean-deep.mp3
```

### 修改现有文件

```
components/AustraliaMap.tsx
  — 接入双 GeoJSON Source 气泡系统
  — 接入云效果 Portal
  — 接入环境音触发逻辑

components/InfoPanel.tsx
  — 接入第三态（扩展物种详情）
  — 接入三态状态机

components/TopOverlay.tsx
  — 接入搜索扩展物种逻辑
  — 添加环境音开关按钮

contexts/AtlasContext.tsx
  — 追加 ambientAudioEnabled、currentAmbientZoneId 字段

app/page.tsx
  — 添加 atlas-cloud-layer div 挂载点

.env.example
  — 追加 DEEPSEEK_API_KEY、FREESOUND_API_KEY 说明
```

---

## 10. 迭代原则与 Agent 执行规则

### 10.1 迭代驱动规则

Claude Code 在执行本 PRD 时，必须遵守以下规则：

**规则 1：验收优先于进度**
不允许"先把所有代码写完再回来修 bug"。每个 Module 完成后，立即执行对应的验收检查。有未通过项时，必须修复后才能继续。

**规则 2：失败时的处理流程**
```
验收检查失败 → 分析根本原因 → 修复 → 再次执行该验收检查 → 通过后才继续
不允许跳过失败项，不允许以"该功能存在已知问题"为借口推进
```

**规则 3：构建健康始终优先**
每次修改后立即运行 `npm run build`。如果构建失败，立即修复，不允许在构建失败状态下继续开发其他功能。

**规则 4：核心物种体验不退步**
每个 Module 完成后，验证 Release A 的核心功能仍然正常：
- 核心 18 种 marker 正常显示
- InfoPanel 的 region 态和 core-species 态正常
- 时间轴正常工作
- Intro 正常播放

**规则 5：视觉降级优于功能崩溃**
任何 API 请求失败、文件缺失、服务未配置的情况，必须有 UI 降级处理，不允许白屏或 JS 报错出现在用户界面。

### 10.2 非功能性约束

以下约束在整个 Release B 中贯穿始终：

| 约束 | 要求 |
|---|---|
| 代码风格 | 使用 TypeScript，无 `any` 类型（必要时用 `unknown` + 类型守卫） |
| 颜色 | 所有颜色使用 CSS 变量，禁止硬编码 |
| 动画 | 所有新增动画使用 PRD v3.2 §2.4 中定义的参数 |
| 无障碍 | 新增的可交互元素必须有 `aria-label` |
| 减少动画 | 所有新增动画必须响应 `useReducedMotion()` |
| 触碰热区 | 移动端可点击元素最小 44×44px |
| XSS 防护 | LLM 输出只能以纯文本渲染 |
| 隐私 | 不将用户行为数据上传至除 DeepSeek/ALA 以外的第三方 |

### 10.3 进度报告格式

Claude Code 在完成每个 Module 后，应输出以下格式的报告：

```
Module X 完成报告
─────────────────
新建文件：
  [列出新建的文件]

修改文件：
  [列出修改的文件，说明修改内容]

验收检查结果：
  M{X}-01: ✅ 通过
  M{X}-02: ✅ 通过
  M{X}-03: ❌ 未通过 → [说明问题] → [修复措施] → ✅ 修复后通过

构建状态：
  npm run build: ✅ 通过
  npm run lint: ✅ 通过

已知限制：
  [如有任何已知的边界情况或限制，在此说明]

下一步：
  准备进入 Module {X+1}
```

---

## 附录 A：ALA API 端点参考

以下为 Release B 会用到的 ALA API 端点，Agent 在实现时应以此为准（不使用其他端点）：

```
ALA biocache occurrence 查询：
  GET https://biocache.ala.org.au/ws/occurrences/search
  关键参数：q=lsid:{lsid}, fq=year:[{from} TO {to}], fields=decimalLatitude,decimalLongitude,year, pageSize={n}

ALA species 搜索：
  GET https://api.ala.org.au/species/search
  关键参数：q={keyword}, fq=idxtype:TAXON, fq=class:({class1} {class2}), sort=occCount, dir=desc, pageSize={n}

ALA species 详情（用于外链）：
  https://bie.ala.org.au/species/{lsid}  （浏览器可访问的物种页面）
```

## 附录 B：扩展物种 taxonomicClass 映射

ALA 返回的 class 字段（拉丁学名）到前端使用的 `taxonomicClass` 字符串的映射：

```
Aves          → bird
Mammalia      → mammal
Reptilia      → reptile
Amphibia      → amphibian
Chondrichthyes → marine
Actinopterygii → marine
其他           → mammal（默认兜底）
```

## 附录 C：核心 18 种物种 ID 列表（用于过滤扩展物种查询结果）

```
thylacine, pig_footed_bandicoot, koala, platypus, tasmanian_devil,
bilby, red_kangaroo, emu, echidna, kookaburra, frilled_lizard,
cane_toad, european_rabbit, dingo, red_fox, southern_right_whale,
great_white_shark, green_sea_turtle
```

---

*本文档为增强轨（Release B）的完整独立执行规格。所有功能实现均以验收标准为最终判定依据，而非以代码完成度为判定依据。Claude Code 在所有 6 个 Module 的全部验收检查通过，且整体验收（OA-01 至 OA-10）全部通过后，方视为 Release B 完成。*
