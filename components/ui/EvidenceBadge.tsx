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
