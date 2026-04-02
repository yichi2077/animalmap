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
