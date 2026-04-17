export default function BlinkLogo({ size = 24, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      role="img"
      aria-label="MCPpedia"
    >
      <style>{`
        @keyframes mcp-blink {
          0%, 92%, 100% { transform: scaleY(1); }
          95%           { transform: scaleY(0.1); }
        }
        .mcp-eye {
          transform-origin: center;
          transform-box: fill-box;
          animation: mcp-blink 3.5s ease-in-out infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .mcp-eye { animation: none; }
        }
      `}</style>
      <rect x="3" y="3" width="18" height="18" rx="4" stroke="currentColor" strokeWidth="2" />
      <circle className="mcp-eye" cx="8.5" cy="9.5" r="1.5" fill="currentColor" />
      <circle className="mcp-eye" cx="15.5" cy="9.5" r="1.5" fill="currentColor" />
      <path d="M8 15c1 1.5 3 2.5 4 2.5s3-1 4-2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}
