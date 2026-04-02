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
