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
    const filePath = sp.media?.[field] || sp[field]
    if (filePath && !(await exists(filePath))) {
      missing.push({ id: sp.id, field, path: filePath })
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
