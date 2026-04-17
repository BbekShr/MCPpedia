"use client";

import React from "react";

/**
 * HeroStack — animated SVG illustration for the MCPpedia homepage hero.
 *
 * Shows the MCP integration stack building itself:
 *   your agent → AI clients → MCP protocol → scored servers → mcppedia
 * A CVE-flagged server tries to join the stack and gets rejected.
 *
 * Drop-in usage:
 *   <HeroStack />
 *
 * Respects `prefers-reduced-motion`. No external deps beyond React.
 */
export default function HeroStack({ className = "" }: { className?: string }) {
  return (
    <div className={`w-full overflow-hidden ${className}`}>
      <style>{styles}</style>
      <svg
        viewBox="0 125 500 300"
        xmlns="http://www.w3.org/2000/svg"
        role="img"
        aria-label="MCPpedia scores and secures every server in your AI stack"
        className="w-full h-auto"
      >
        <defs>
          <filter id="mcpp-shadow" x="-10%" y="-10%" width="120%" height="140%">
            <feDropShadow dx="0" dy="1.5" stdDeviation="2" floodColor="#0f172a" floodOpacity="0.1" />
          </filter>
        </defs>

        {/* soft halo */}
        <circle className="mcpp-halo" cx="250" cy="275" r="150" fill="#ffffff" opacity="0.35" />
        <circle className="mcpp-halo-inner" cx="250" cy="275" r="110" fill="#ffffff" opacity="0.5" />

        {/* platform base */}
        <g transform="translate(140,408)">
          <ellipse cx="110" cy="4" rx="100" ry="4" fill="#0f172a" opacity="0.06" />
          <rect x="0" y="0" width="220" height="4" rx="2" fill="#0284c7" opacity="0.35" />
          <rect x="30" y="4" width="160" height="2" rx="1" fill="#0284c7" opacity="0.18" />
        </g>

        {/* L1: mcppedia foundation */}
        <g className="mcpp-drop-1" filter="url(#mcpp-shadow)">
          <rect className="mcpp-card-bg mcpp-card-border" x="140" y="356" width="220" height="48" rx="10" fill="white" stroke="#0284c7" strokeWidth="1.5" />
          <g transform="translate(158,370)">
            <rect className="mcpp-card-border" x="0" y="0" width="22" height="22" rx="5" fill="none" stroke="#0284c7" strokeWidth="1.8" />
            <circle className="mcpp-eye mcpp-card-fill" cx="7" cy="9" r="1.8" fill="#0284c7" />
            <circle className="mcpp-eye mcpp-card-fill" cx="15" cy="9" r="1.8" fill="#0284c7" />
            <path className="mcpp-card-border" d="M6 15c1 1.3 2 1.8 5 1.8s4-.5 5-1.8" stroke="#0284c7" strokeWidth="1.3" strokeLinecap="round" fill="none" />
          </g>
          <text className="mcpp-text-primary" x="190" y="378" fontSize="13" fontWeight="500" fill="#0f172a">mcppedia</text>
          <text className="mcpp-text-muted" x="190" y="394" fontSize="11" fill="#64748b">scanned · scored · indexed</text>
        </g>

        {/* L2: servers */}
        <g className="mcpp-drop-2" filter="url(#mcpp-shadow)">
          <rect className="mcpp-good-bg mcpp-good-border" x="146" y="304" width="62" height="44" rx="7" fill="#f0fdf4" stroke="#86efac" strokeWidth="1" />
          <text className="mcpp-good-label" x="177" y="320" textAnchor="middle" fontSize="10" fontWeight="500" fill="#14532d">github</text>
          <text className="mcpp-good-score" x="177" y="340" textAnchor="middle" fontSize="16" fontWeight="500" fill="#15803d" fontFamily="ui-monospace">91</text>
          <g className="mcpp-chk" transform="translate(204,308)">
            <circle cx="0" cy="0" r="7" fill="#16a34a" />
            <path d="M-3 0l2 2 4-4" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          </g>
        </g>

        <g className="mcpp-drop-3" filter="url(#mcpp-shadow)">
          <rect className="mcpp-good-bg mcpp-good-border" x="220" y="304" width="62" height="44" rx="7" fill="#f0fdf4" stroke="#86efac" strokeWidth="1" />
          <text className="mcpp-good-label" x="251" y="320" textAnchor="middle" fontSize="10" fontWeight="500" fill="#14532d">postgres</text>
          <text className="mcpp-good-score" x="251" y="340" textAnchor="middle" fontSize="16" fontWeight="500" fill="#15803d" fontFamily="ui-monospace">89</text>
        </g>

        <g className="mcpp-drop-4" filter="url(#mcpp-shadow)">
          <rect className="mcpp-warn-bg mcpp-warn-border" x="294" y="304" width="62" height="44" rx="7" fill="#fefce8" stroke="#fde047" strokeWidth="1" />
          <text className="mcpp-warn-label" x="325" y="320" textAnchor="middle" fontSize="10" fontWeight="500" fill="#713f12">puppeteer</text>
          <text className="mcpp-warn-score" x="325" y="340" textAnchor="middle" fontSize="16" fontWeight="500" fill="#a16207" fontFamily="ui-monospace">76</text>
        </g>

        {/* CVE reject */}
        <g className="mcpp-cve-out">
          <g filter="url(#mcpp-shadow)">
            <rect className="mcpp-bad-bg mcpp-bad-border" x="368" y="304" width="58" height="44" rx="7" fill="#fef2f2" stroke="#dc2626" strokeWidth="1" strokeDasharray="3 2" />
            <text className="mcpp-bad-text" x="397" y="320" textAnchor="middle" fontSize="10" fontWeight="500" fill="#991b1b">sketchy</text>
            <text className="mcpp-bad-text" x="397" y="340" textAnchor="middle" fontSize="11" fontWeight="500" fill="#dc2626" fontFamily="ui-monospace">CVE</text>
          </g>
        </g>

        {/* L3: protocol */}
        <g className="mcpp-drop-5" filter="url(#mcpp-shadow)">
          <rect className="mcpp-proto-bg mcpp-proto-border" x="140" y="252" width="220" height="44" rx="8" fill="#f1f5f9" stroke="#94a3b8" strokeWidth="0.8" />
          <text className="mcpp-proto-label" x="250" y="268" textAnchor="middle" fontSize="9" fill="#64748b" letterSpacing="0.1em">PROTOCOL</text>
          <text className="mcpp-proto-text" x="250" y="286" textAnchor="middle" fontSize="12" fontWeight="500" fill="#0f172a" fontFamily="ui-monospace">model context protocol</text>
        </g>

        {/* L4: ai clients */}
        <g className="mcpp-drop-6" filter="url(#mcpp-shadow)">
          <rect className="mcpp-ai-bg mcpp-ai-border" x="160" y="200" width="180" height="44" rx="8" fill="#eff6ff" stroke="#0284c7" strokeWidth="0.8" />
          <text className="mcpp-ai-label" x="250" y="216" textAnchor="middle" fontSize="9" fill="#64748b" letterSpacing="0.1em">AI CLIENTS</text>
          <g transform="translate(250,234)" textAnchor="middle">
            <text className="mcpp-ai-text" x="-54" y="0" fontSize="12" fontWeight="500" fill="#0c4a6e">claude</text>
            <circle cx="-18" cy="-3" r="1" fill="#0284c7" />
            <text className="mcpp-ai-text" x="6" y="0" fontSize="12" fontWeight="500" fill="#0c4a6e">cursor</text>
            <circle cx="34" cy="-3" r="1" fill="#0284c7" />
            <text className="mcpp-ai-text" x="58" y="0" fontSize="12" fontWeight="500" fill="#0c4a6e">vs code</text>
          </g>
        </g>

        {/* L5: your agent */}
        <g className="mcpp-drop-7" filter="url(#mcpp-shadow)">
          <rect x="180" y="148" width="140" height="44" rx="8" fill="#0284c7" />
          <text x="250" y="167" textAnchor="middle" fontSize="13" fontWeight="500" fill="white">your agent</text>
          <text x="250" y="184" textAnchor="middle" fontSize="10" fill="#bae6fd" letterSpacing="0.04em">ships faster, safer</text>
        </g>

        {/* connector dots */}
        <g className="mcpp-dots" fill="#0284c7" opacity="0.25">
          <circle cx="250" cy="196" r="1.2" />
          <circle cx="250" cy="248" r="1.2" />
          <circle cx="250" cy="300" r="1.2" />
          <circle cx="250" cy="352" r="1.2" />
        </g>
      </svg>
    </div>
  );
}

const styles = `
  @keyframes mcpp-stack-drop {
    0%   { transform: translateY(-40px); opacity: 0; }
    14%  { transform: translateY(2px); opacity: 1; }
    18%  { transform: translateY(0); opacity: 1; }
    100% { transform: translateY(0); opacity: 1; }
  }
  @keyframes mcpp-cve-fly {
    0%, 25%   { transform: translate(0, 0) rotate(0); opacity: 1; }
    35%       { transform: translate(12px, -8px) rotate(12deg); }
    55%, 100% { transform: translate(140px, -90px) rotate(45deg); opacity: 0; }
  }
  @keyframes mcpp-chk-pop {
    0%, 90%  { opacity: 0; transform: scale(0.3); }
    95%      { opacity: 1; transform: scale(1.2); }
    100%     { opacity: 1; transform: scale(1); }
  }
  @keyframes mcpp-face-blink {
    0%, 93%, 100% { transform: scaleY(1); }
    96%           { transform: scaleY(0.1); }
  }

  .mcpp-drop-1 { animation: mcpp-stack-drop 9s cubic-bezier(.34,1.56,.64,1) infinite; animation-delay: 0s; }
  .mcpp-drop-2 { animation: mcpp-stack-drop 9s cubic-bezier(.34,1.56,.64,1) infinite; animation-delay: .4s; }
  .mcpp-drop-3 { animation: mcpp-stack-drop 9s cubic-bezier(.34,1.56,.64,1) infinite; animation-delay: .85s; }
  .mcpp-drop-4 { animation: mcpp-stack-drop 9s cubic-bezier(.34,1.56,.64,1) infinite; animation-delay: 1.3s; }
  .mcpp-drop-5 { animation: mcpp-stack-drop 9s cubic-bezier(.34,1.56,.64,1) infinite; animation-delay: 1.75s; }
  .mcpp-drop-6 { animation: mcpp-stack-drop 9s cubic-bezier(.34,1.56,.64,1) infinite; animation-delay: 2.2s; }
  .mcpp-drop-7 { animation: mcpp-stack-drop 9s cubic-bezier(.34,1.56,.64,1) infinite; animation-delay: 2.65s; }

  .mcpp-cve-out {
    animation: mcpp-cve-fly 9s ease-in-out infinite;
    animation-delay: 1.8s;
    transform-origin: center;
    transform-box: fill-box;
  }
  .mcpp-chk {
    animation: mcpp-chk-pop 9s ease-out infinite;
    transform-origin: center;
    transform-box: fill-box;
  }
  .mcpp-eye {
    transform-origin: center;
    transform-box: fill-box;
    animation: mcpp-face-blink 4s ease-in-out infinite;
  }

  @media (prefers-reduced-motion: reduce) {
    .mcpp-drop-1, .mcpp-drop-2, .mcpp-drop-3, .mcpp-drop-4,
    .mcpp-drop-5, .mcpp-drop-6, .mcpp-drop-7,
    .mcpp-cve-out, .mcpp-chk, .mcpp-eye {
      animation: none;
    }
  }

  [data-theme="dark"] .mcpp-halo { fill: #38bdf8; opacity: 0.08; }
  [data-theme="dark"] .mcpp-halo-inner { fill: #38bdf8; opacity: 0.12; }

  [data-theme="dark"] .mcpp-card-bg { fill: #161b22; }
  [data-theme="dark"] .mcpp-card-border { stroke: #38bdf8; }
  [data-theme="dark"] .mcpp-card-fill { fill: #38bdf8; }
  [data-theme="dark"] .mcpp-text-primary { fill: #e6edf3; }
  [data-theme="dark"] .mcpp-text-muted { fill: #8b949e; }

  [data-theme="dark"] .mcpp-good-bg { fill: rgba(63, 185, 80, 0.12); }
  [data-theme="dark"] .mcpp-good-border { stroke: #3fb950; }
  [data-theme="dark"] .mcpp-good-label { fill: #86efac; }
  [data-theme="dark"] .mcpp-good-score { fill: #4ade80; }

  [data-theme="dark"] .mcpp-warn-bg { fill: rgba(210, 153, 34, 0.12); }
  [data-theme="dark"] .mcpp-warn-border { stroke: #d29922; }
  [data-theme="dark"] .mcpp-warn-label { fill: #fde047; }
  [data-theme="dark"] .mcpp-warn-score { fill: #facc15; }

  [data-theme="dark"] .mcpp-bad-bg { fill: rgba(248, 81, 73, 0.1); }
  [data-theme="dark"] .mcpp-bad-border { stroke: #f85149; }
  [data-theme="dark"] .mcpp-bad-text { fill: #fca5a5; }

  [data-theme="dark"] .mcpp-proto-bg { fill: rgba(139, 148, 158, 0.08); }
  [data-theme="dark"] .mcpp-proto-border { stroke: #30363d; }
  [data-theme="dark"] .mcpp-proto-label { fill: #8b949e; }
  [data-theme="dark"] .mcpp-proto-text { fill: #e6edf3; }

  [data-theme="dark"] .mcpp-ai-bg { fill: rgba(56, 189, 248, 0.08); }
  [data-theme="dark"] .mcpp-ai-border { stroke: #38bdf8; }
  [data-theme="dark"] .mcpp-ai-label { fill: #8b949e; }
  [data-theme="dark"] .mcpp-ai-text { fill: #bae6fd; }

  [data-theme="dark"] .mcpp-dots { fill: #38bdf8; opacity: 0.35; }
`;
