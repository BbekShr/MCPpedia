// Formatting, sanitization, and type-guard helpers.

export function num(val: unknown): number {
  return typeof val === "number" && Number.isFinite(val) ? val : 0;
}

export function str(val: unknown): string {
  return typeof val === "string" ? val : "";
}

export function arr<T = string>(val: unknown): T[] {
  return Array.isArray(val) ? (val as T[]) : [];
}

export function gradeFromScore(score: unknown): string {
  const n = num(score);
  if (n >= 80) return "A";
  if (n >= 60) return "B";
  if (n >= 40) return "C";
  if (n >= 20) return "D";
  return "F";
}

// Strip chars that could be used for markdown/prompt injection and cap length
// to prevent context flooding.
export function sanitize(input: unknown): string {
  if (typeof input !== "string") return String(input ?? "");
  return input
    .replace(/[<>]/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .slice(0, 500);
}

export type Server = Record<string, unknown>;

// Text-block formatter for list views.
export function formatServerLine(s: Server): string {
  const grade = gradeFromScore(s.score_total);
  const parts = [
    `**${sanitize(s.name)}** (${sanitize(s.slug)}) — Score: ${num(s.score_total)}/100 [${grade}]`,
  ];
  if (s.tagline) parts.push(`  ${sanitize(s.tagline)}`);
  const meta: string[] = [];
  if (num(s.github_stars) > 0) meta.push(`${num(s.github_stars).toLocaleString()} stars`);
  if (num(s.npm_weekly_downloads) > 0)
    meta.push(`${num(s.npm_weekly_downloads).toLocaleString()} weekly downloads`);
  if (s.token_efficiency_grade && s.token_efficiency_grade !== "unknown")
    meta.push(`Token efficiency: ${s.token_efficiency_grade}`);
  if (num(s.cve_count) > 0) meta.push(`CVEs: ${s.cve_count}`);
  if (s.health_status) meta.push(`Status: ${s.health_status}`);
  if (arr(s.categories).length) meta.push(`Categories: ${arr(s.categories).join(", ")}`);
  if (meta.length) parts.push(`  ${meta.join(" · ")}`);
  return parts.join("\n");
}

// Structured projection for tool outputSchema. Keep field names stable — clients
// may render these directly.
export function projectServer(s: Server) {
  return {
    slug: str(s.slug),
    name: str(s.name),
    tagline: str(s.tagline),
    url: `https://mcppedia.org/s/${str(s.slug)}`,
    scores: {
      total: num(s.score_total),
      security: num(s.score_security),
      maintenance: num(s.score_maintenance),
      efficiency: num(s.score_efficiency),
      documentation: num(s.score_documentation),
      compatibility: num(s.score_compatibility),
      grade: gradeFromScore(s.score_total),
    },
    stats: {
      github_stars: num(s.github_stars),
      npm_weekly_downloads: num(s.npm_weekly_downloads),
      cve_count: num(s.cve_count),
      token_efficiency_grade: str(s.token_efficiency_grade) || null,
      health_status: str(s.health_status) || null,
    },
    categories: arr<string>(s.categories),
    transport: arr<string>(s.transport),
  };
}

export function errorText(msg: string): {
  content: Array<{ type: "text"; text: string }>;
  isError: true;
} {
  return { content: [{ type: "text", text: msg }], isError: true };
}

export function resourceLink(slug: string, name: string, tagline?: string) {
  return {
    type: "resource_link" as const,
    uri: `mcppedia://server/${slug}`,
    name,
    description: tagline ? sanitize(tagline) : `MCPpedia entry for ${name}`,
    mimeType: "application/json",
  };
}
