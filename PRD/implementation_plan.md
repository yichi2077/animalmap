# PRD v3.2 完整实现计划

## 现状分析

当前代码库已实现了 PRD v3.2 中约 60% 的功能，但仍有显著差距需要填补。

### 已实现的部分
- `species.json` 已有 `assetStatus`, `reviewStatus`, `sources`, `media` 字段
- `audio.json` 已有 `attribution`, `license`, `sourceUrl`, `availability` 字段
- `timeline.json` 已有 `evidenceType` 字段
- `InfoPanel.tsx` 已有头像 fallback、AudioPlayer、证据展示、来源展示
- 移动端适配（`useMediaQuery` hook 已在多个组件中使用）
- 移动端 drawer 行为和 milestone 过滤

### 需要完成的工作

## Phase 1: 数据结构修正 + 验证脚本

### 1.1 `audio.json` 修正
- 当前使用 `"planned"` 作为 availability，PRD 要求使用 `"missing"` 或 `"ai_simulated"`
- 4 种 AI 模拟物种（thylacine, pig_footed_bandicoot, great_white_shark, green_sea_turtle）应设为 `"ai_simulated"`
- 其余 14 种应设为 `"missing"`

### 1.2 `species.json` 补充字段
- PRD 要求 `funFacts`, `storyNarrative`, `timelineNarratives` 字段（可选但需存在）
- 当前数据结构使用 `media` 对象而非 PRD 中的 `illustration`/`photo` 顶级字段 → **判断：保留当前 `media` 对象结构更合理**，但确保 fallback 组件能正确读取

### 1.3 脚本创建
- [NEW] `scripts/add-evidence-types.mjs`
- 更新 `scripts/validate-assets.mjs`（已存在，需确认兼容）
- 更新 `scripts/validate-content.mjs`（已存在，需确认兼容）
- `package.json` 追加脚本

## Phase 2: 媒体 Fallback 系统

### 2.1 新建 UI 组件
- [NEW] `components/ui/SpeciesIconFallback.tsx`
- [NEW] `components/ui/SpeciesAvatar.tsx`

### 2.2 更新 InfoPanel.tsx
- 使用 `SpeciesAvatar` 替换 `SpeciesPortrait`

## Phase 3: 移动端适配
- IntroSequence: 跳过按钮移动端居中
- TopOverlay: 推断层免责提示 + 年份字号调整
- TimelineBar: 拖动手柄尺寸调整

## Phase 4: 内容可信度系统
- [NEW] `components/ui/EvidenceBadge.tsx`
- [NEW] `components/ui/SourcesCitation.tsx`
- InfoPanel 中集成 EvidenceBadge 和 SourcesCitation

## Phase 5: 容错与降级
- AustraliaMap: WebGL 检测 + 30s 超时
- `.env.example` 中文注释

## Phase 6: CSS + 最终验收
- `globals.css` 追加新 CSS 类
- 构建验证

## 设计决策

1. **`useMediaQuery` vs `useIsMobile`**: 当前代码使用 `useMediaQuery("(max-width: 767px)")` 已经实现了 PRD 中 `useIsMobile` 的功能，保留当前实现更合理
2. **`media` 对象 vs 顶级字段**: 当前 `species.json` 使用 `media.illustration` 结构，PRD 使用顶级 `illustration` 字段 → 保留当前结构，在组件中适配
3. **`SpeciesPortrait` vs `SpeciesAvatar`**: 当前已有功能完善的 `SpeciesPortrait`，PRD 的 `SpeciesAvatar` 逻辑更简洁 → 替换为 PRD 版本以保持一致性
