"use client"

import React, { useState } from "react"
import Image from "next/image"
import SpeciesIconFallback from "./SpeciesIconFallback"

interface SpeciesAvatarProps {
  illustration: string
  photo: string
  nameZh: string
  color: string
  group: string
  assetStatus: string
  size?: number
  radiusClass?: string
  className?: string
}

export default function SpeciesAvatar({
  illustration,
  photo,
  nameZh,
  color,
  group,
  assetStatus,
  size = 80,
  radiusClass = "rounded-[1.35rem]",
  className,
}: SpeciesAvatarProps) {
  const [illError, setIllError] = useState(false)
  const [photoError, setPhotoError] = useState(false)

  const canTryIllustration = assetStatus !== "placeholder" && illustration && !illError
  const canTryPhoto = !canTryIllustration && assetStatus !== "placeholder" && photo && !photoError
  const showFallback = !canTryIllustration && !canTryPhoto

  const containerStyle: React.CSSProperties = {
    width: size,
    height: size,
    background: `linear-gradient(180deg, ${color}12, ${color}26)`,
    border: `1.5px solid ${color}36`,
    flexShrink: 0,
    position: "relative",
    overflow: "hidden",
  }

  return (
    <div
      className={`flex items-center justify-center ${radiusClass} ${className ?? ""}`}
      style={containerStyle}
    >
      {/* 光晕 */}
      <div
        className="absolute"
        style={{
          width: size * 0.6,
          height: size * 0.6,
          borderRadius: "50%",
          background: `${color}44`,
          filter: "blur(12px)",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
        }}
      />

      {canTryIllustration && (
        <Image
          src={illustration}
          alt={nameZh}
          fill
          unoptimized
          sizes={`${size}px`}
          className={`relative h-full w-full object-cover ${radiusClass}`}
          onError={() => setIllError(true)}
        />
      )}

      {canTryPhoto && !canTryIllustration && (
        <Image
          src={photo}
          alt={nameZh}
          fill
          unoptimized
          sizes={`${size}px`}
          className={`relative h-full w-full object-cover ${radiusClass}`}
          onError={() => setPhotoError(true)}
        />
      )}

      {showFallback && (
        <SpeciesIconFallback
          color={color}
          group={group}
          size={size * 0.55}
          className="relative"
        />
      )}
    </div>
  )
}
