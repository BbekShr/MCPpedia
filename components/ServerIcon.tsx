'use client'

import { useState } from 'react'

interface Props {
  name: string
  homepageUrl?: string | null
  authorGithub?: string | null
  size?: number
  className?: string
}

function getInitial(name: string): string {
  return name.replace(/^(mcp|server|mcp-server)[\s-]*/i, '').charAt(0).toUpperCase() || name.charAt(0).toUpperCase()
}

function hashColor(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash)
  }
  const colors = [
    '#0969da', '#1a7f37', '#9a6700', '#cf222e', '#8250df',
    '#0550ae', '#116329', '#7d4e00', '#a40e26', '#6639ba',
  ]
  return colors[Math.abs(hash) % colors.length]
}

export default function ServerIcon({ name, homepageUrl, authorGithub, size = 32, className = '' }: Props) {
  const [imgSrc, setImgSrc] = useState<string | null>(() => {
    // Priority 1: Favicon from homepage
    if (homepageUrl) {
      try {
        const domain = new URL(homepageUrl).origin
        return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=${size * 2}`
      } catch {
        // invalid URL
      }
    }
    // Priority 2: GitHub avatar
    if (authorGithub) {
      return `https://github.com/${authorGithub}.png?size=${size * 2}`
    }
    return null
  })

  const [fallbackLevel, setFallbackLevel] = useState(0)

  function handleError() {
    if (fallbackLevel === 0 && authorGithub) {
      // Favicon failed → try GitHub avatar
      setImgSrc(`https://github.com/${authorGithub}.png?size=${size * 2}`)
      setFallbackLevel(1)
    } else {
      // Everything failed → use letter avatar
      setImgSrc(null)
      setFallbackLevel(2)
    }
  }

  const initial = getInitial(name)
  const bgColor = hashColor(name)

  if (!imgSrc || fallbackLevel >= 2) {
    return (
      <div
        className={`rounded-md flex items-center justify-center text-white font-bold shrink-0 ${className}`}
        style={{ width: size, height: size, backgroundColor: bgColor, fontSize: size * 0.45 }}
      >
        {initial}
      </div>
    )
  }

  return (
    <img
      src={imgSrc}
      alt={`${name} icon`}
      width={size}
      height={size}
      className={`rounded-md shrink-0 bg-bg-tertiary ${className}`}
      onError={handleError}
    />
  )
}
