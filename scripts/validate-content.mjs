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
