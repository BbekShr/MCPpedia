'use client'

import { useState } from 'react'

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
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
        </svg>
      </a>

      {/* LinkedIn */}
      <a
        href={links.linkedin}
        target="_blank"
        rel="noopener noreferrer"
        className="p-2 rounded-lg border border-border text-text-muted hover:text-[#0A66C2] hover:bg-[#0A66C2]/5 hover:border-[#0A66C2]/20 transition-all"
        title="Share on LinkedIn"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
        </svg>
      </a>

      {/* Reddit */}
      <a
        href={links.reddit}
        target="_blank"
        rel="noopener noreferrer"
        className="p-2 rounded-lg border border-border text-text-muted hover:text-[#FF4500] hover:bg-[#FF4500]/5 hover:border-[#FF4500]/20 transition-all"
        title="Share on Reddit"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 0C5.373 0 0 5.373 0 12c0 3.314 1.343 6.314 3.515 8.485l-2.286 2.286C.775 23.225 1.097 24 1.738 24H12c6.627 0 12-5.373 12-12S18.627 0 12 0zm5.5 13.5c0 .276-.224.5-.5.5s-.5-.224-.5-.5.224-.5.5-.5.5.224.5.5zm-8 0c0 .276-.224.5-.5.5s-.5-.224-.5-.5.224-.5.5-.5.5.224.5.5zm6.5 3c-1.105 0-3-1.343-4-1.343S8.105 16.5 7 16.5c-.276 0-.5-.224-.5-.5s.224-.5.5-.5c1.105 0 2.5 1.343 4 1.343h2c1.5 0 2.895-1.343 4-1.343.276 0 .5.224.5.5s-.224.5-.5.5zM17.5 9c.828 0 1.5.672 1.5 1.5S18.328 12 17.5 12 16 11.328 16 10.5 16.672 9 17.5 9z" />
        </svg>
      </a>

      {/* Hacker News */}
      <a
        href={links.hackernews}
        target="_blank"
        rel="noopener noreferrer"
        className="p-2 rounded-lg border border-border text-text-muted hover:text-[#FF6600] hover:bg-[#FF6600]/5 hover:border-[#FF6600]/20 transition-all"
        title="Share on Hacker News"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M0 0v24h24V0H0zm13.09 13.37L16.81 6h1.53l-4.53 8.85V20h-1.64v-5.14L7.66 6h1.57l3.86 7.37z" />
        </svg>
      </a>

      {/* Copy link */}
      <button
        onClick={copyLink}
        className="p-2 rounded-lg border border-border text-text-muted hover:text-text-primary hover:bg-bg-secondary hover:border-border transition-all relative"
        title={copied ? 'Copied!' : 'Copy link'}
      >
        {copied ? (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-green">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        ) : (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
          </svg>
        )}
      </button>
    </div>
  )
}
