'use client'

import { useState } from 'react'
import Image from 'next/image'

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

export default function ServerIcon({ name, authorGithub, size = 32, className = '' }: Props) {
  // GitHub avatars are always crisp at any size. Use as primary.
  const [imgSrc, setImgSrc] = useState<string | null>(() => {
    if (authorGithub) {
      // Strip leading @ and validate — GitHub usernames are alphanumeric + hyphens only
      const clean = authorGithub.replace(/^@/, '')
      if (clean && /^[\w-]+$/.test(clean)) {
        return `https://github.com/${clean}.png?size=128`
      }
    }
    return null
  })

  const [failed, setFailed] = useState(false)

  const initial = getInitial(name)
  const bgColor = hashColor(name)

  if (!imgSrc || failed) {
    return (
      <div
        className={`rounded-md flex items-center justify-center text-white font-bold shrink-0 ${className}`}
        style={{ width: size, height: size, backgroundColor: bgColor, fontSize: size * 0.45 }}
        role="img"
        aria-label={`${name} icon`}
      >
        {initial}
      </div>
    )
  }

  return (
    <Image
      src={imgSrc}
      alt={`${name} icon`}
      width={size}
      height={size}
      loading="lazy"
      className={`rounded-md shrink-0 bg-bg-tertiary object-cover ${className}`}
      onError={() => setFailed(true)}
    />
  )
}
