"use client"

import React from "react"

const GROUP_ICON_PATHS: Record<string, string> = {
  extinct:    "M12,2 C8,2 4,6 4,10 C4,14 8,18 12,22 C16,18 20,14 20,10 C20,6 16,2 12,2Z",
  endangered: "M12,3 L14,9 L20,9 L15,13 L17,19 L12,15 L7,19 L9,13 L4,9 L10,9Z",
  native:     "M12,4 C8,4 5,7 5,11 C5,15 12,22 12,22 C12,22 19,15 19,11 C19,7 16,4 12,4Z",
  invasive:   "M12,2 L15,8 L22,8 L16.5,12.5 L18.5,19 L12,15 L5.5,19 L7.5,12.5 L2,8 L9,8Z",
  marine:     "M4,12 C4,12 8,6 12,6 C16,6 20,12 20,12 C20,12 16,18 12,18 C8,18 4,12 4,12Z",
}

interface Props {
  color: string
  group: string
  size?: number
  className?: string
}

export default function SpeciesIconFallback({ color, group, size = 48, className }: Props) {
  const iconPath = GROUP_ICON_PATHS[group] ?? GROUP_ICON_PATHS.native

  return (
    <div
      className={`flex items-center justify-center rounded-[1.35rem] ${className ?? ""}`}
      style={{
        width: size,
        height: size,
        background: `${color}18`,
        border: `1.5px solid ${color}36`,
        flexShrink: 0,
      }}
    >
      <svg
        width={size * 0.5}
        height={size * 0.5}
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden
      >
        <path d={iconPath} fill={color} opacity={0.8} />
      </svg>
    </div>
  )
}
