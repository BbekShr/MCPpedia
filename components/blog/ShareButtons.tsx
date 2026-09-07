'use client'

import { useState } from 'react'
import { Icon } from '@/components/ui/icons'
import { Brand } from '@/components/ui/brand-marks'

export default function ShareButtons({
  url,
  title,
  hook,
}: {
  url: string
  title: string
  hook: string
}) {
  const [copied, setCopied] = useState(false)

  const shareText = hook || title
  const encodedUrl = encodeURIComponent(url)
  const encodedText = encodeURIComponent(shareText)

  const links = {
    twitter: `https://x.com/intent/tweet?text=${encodedText}&url=${encodedUrl}`,
    linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`,
    reddit: `https://reddit.com/submit?url=${encodedUrl}&title=${encodeURIComponent(title)}`,
    hackernews: `https://news.ycombinator.com/submitlink?u=${encodedUrl}&t=${encodeURIComponent(title)}`,
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // fallback
    }
  }

  return (
    <div className="flex items-center gap-1.5">
      {/* X / Twitter */}
      <a
        href={links.twitter}
        target="_blank"
        rel="noopener noreferrer"
        className="p-2 rounded-lg border border-border text-text-muted hover:text-text-primary hover:bg-bg-secondary hover:border-border transition-all"
        title="Share on X"
      >
        <Brand name="x" size={16} />
      </a>

      {/* LinkedIn */}
      <a
        href={links.linkedin}
        target="_blank"
        rel="noopener noreferrer"
        className="p-2 rounded-lg border border-border text-text-muted hover:text-[#0A66C2] hover:bg-[#0A66C2]/5 hover:border-[#0A66C2]/20 transition-all"
        title="Share on LinkedIn"
      >
        <Brand name="linkedin" size={16} />
      </a>

      {/* Reddit */}
      <a
        href={links.reddit}
        target="_blank"
        rel="noopener noreferrer"
        className="p-2 rounded-lg border border-border text-text-muted hover:text-[#FF4500] hover:bg-[#FF4500]/5 hover:border-[#FF4500]/20 transition-all"
        title="Share on Reddit"
      >
        <Brand name="reddit" size={16} />
      </a>

      {/* Hacker News */}
      <a
        href={links.hackernews}
        target="_blank"
        rel="noopener noreferrer"
        className="p-2 rounded-lg border border-border text-text-muted hover:text-[#FF6600] hover:bg-[#FF6600]/5 hover:border-[#FF6600]/20 transition-all"
        title="Share on Hacker News"
      >
        <Brand name="medium" size={16} />
      </a>

      {/* Copy link */}
      <button
        onClick={copyLink}
        className="p-2 rounded-lg border border-border text-text-muted hover:text-text-primary hover:bg-bg-secondary hover:border-border transition-all relative"
        title={copied ? 'Copied!' : 'Copy link'}
      >
        {copied ? (
          <Icon name="check" size={16} className="text-green" />
        ) : (
          <Icon name="link" size={16} />
        )}
      </button>
    </div>
  )
}
