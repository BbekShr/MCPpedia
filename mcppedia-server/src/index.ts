#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { mcpApiCall } from "./api.js";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";


function num(val: unknown): number {
  return typeof val === "number" && Number.isFinite(val) ? val : 0;
}

function str(val: unknown): string {
  return typeof val === "string" ? val : "";
}

function arr(val: unknown): string[] {
  return Array.isArray(val) ? val : [];
}

function gradeFromScore(score: unknown): string {
  const n = num(score);
  if (n >= 80) return "A";
  if (n >= 60) return "B";
  if (n >= 40) return "C";
  if (n >= 20) return "D";
  return "F";
}

// Strip characters that could be used for markdown injection or prompt injection
function sanitize(input: unknown): string {
  if (typeof input !== "string") return String(input ?? "");
  // Remove markdown formatting, HTML tags, and common prompt injection patterns
  return input
    .replace(/[<>]/g, "")           // HTML tags
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1") // markdown links
    .slice(0, 500);                 // cap length to prevent context flooding
}

function formatServer(s: Record<string, unknown>): string {
  const grade = gradeFromScore(s.score_total);
  const parts = [
    `**${sanitize(s.name)}** (${sanitize(s.slug)}) — Score: ${num(s.score_total)}/100 [${grade}]`,
  ];
  if (s.tagline) parts.push(`  ${sanitize(s.tagline)}`);
  const meta: string[] = [];
  if (num(s.github_stars) > 0)
    meta.push(`${num(s.github_stars).toLocaleString()} stars`);
  if (num(s.npm_weekly_downloads) > 0)
    meta.push(`${num(s.npm_weekly_downloads).toLocaleString()} weekly downloads`);
  if (s.token_efficiency_grade && s.token_efficiency_grade !== "unknown")
    meta.push(`Token efficiency: ${s.token_efficiency_grade}`);
  if (num(s.cve_count) > 0) meta.push(`CVEs: ${s.cve_count}`);
  if (s.health_status) meta.push(`Status: ${s.health_status}`);
  if (arr(s.categories).length)
    meta.push(`Categories: ${arr(s.categories).join(", ")}`);
  if (meta.length) parts.push(`  ${meta.join(" · ")}`);
  return parts.join("\n");
}

function errorText(msg: string): { content: Array<{ type: "text"; text: string }> } {
  return { content: [{ type: "text", text: msg }] };
}

// ─── Server setup ───────────────────────────────────────────

const server = new McpServer({
  name: "mcppedia",
  version: "0.1.0",
});

// ─── Tool 1: search_servers ─────────────────────────────────

server.tool(
  "search_servers",
  "Search 17K+ scored MCP servers. Categories: developer-tools, data, security, ai-ml, cloud, productivity, etc.",
  {
    query: z.string(),
    category: z.string().optional(),
    min_score: z.number().optional(),
    limit: z.number().optional(),
  },
  async ({ query, category, min_score, limit }) => {
    const { data, error } = await mcpApiCall("search", {
      query,
      category,
      min_score,
      limit: limit ?? 5,
    });

    if (error) return errorText(error);

    const servers = data as Array<Record<string, unknown>>;
    if (!servers?.length) {
      return errorText(`No servers found for "${sanitize(query)}".`);
    }

    const lines = servers.map((s) => formatServer(s));
    const header = `Found ${servers.length} server${servers.length === 1 ? "" : "s"} for "${sanitize(query)}":\n`;

    return { content: [{ type: "text", text: header + lines.join("\n\n") }] };
  }
);

// ─── Tool 2: get_server_details ─────────────────────────────

server.tool(
  "get_server_details",
  "Server details, scores, tools. Set security=true for CVE/poisoning/injection report.",
  {
    slug: z.string(),
    security: z.boolean().optional(),
  },
  async ({ slug, security }) => {
    const action = security ? "security" : "details";
    const { data, error } = await mcpApiCall(action, { slug });

    if (error) {
      return errorText(
        error.includes("unreachable") || error.includes("Rate limited")
          ? error
          : `Server "${slug}" not found. Try search_servers to find the correct slug.`
      );
    }

    const s = data as Record<string, unknown>;

    // Security-focused report
    if (security) {
      const sections: string[] = [];
      const secScore = s.score_security as number;
      let verdict: string;
      if (secScore >= 25) verdict = "LOW RISK";
      else if (secScore >= 18) verdict = "MODERATE RISK";
      else if (secScore >= 10) verdict = "HIGH RISK";
      else verdict = "CRITICAL RISK";

      sections.push(
        `# Security Report: ${sanitize(s.name)}`,
        `**${verdict}** — Security score: ${secScore}/30`,
        ""
      );

      sections.push("## Key Indicators");
      sections.push(`- CVEs found: ${s.cve_count}`);
      sections.push(
        `- Tool poisoning: ${s.has_tool_poisoning ? "YES — " + ((s.tool_poisoning_flags as string[]) || []).join(", ") : "None detected"}`
      );
      sections.push(`- Code execution: ${s.has_code_execution ? "YES" : "No"}`);
      sections.push(`- Injection risk: ${s.has_injection_risk ? "YES" : "No"}`);
      sections.push(`- Dangerous patterns: ${s.dangerous_pattern_count}`);
      sections.push(
        `- Dep health: ${s.dep_health_score !== null ? `${s.dep_health_score}/100` : "Not scanned"}`
      );
      sections.push(`- Auth required: ${s.has_authentication ? "Yes" : "No"}`);
      sections.push(`- License: ${s.license || "None found"}`);
      sections.push("");

      sections.push("## Verification");
      sections.push(`- MCPpedia verified: ${s.verified ? "Yes" : "No"}`);
      sections.push(`- Security verified: ${s.security_verified ? "Yes" : "No"}`);
      sections.push(`- Publisher verified: ${s.publisher_verified ? "Yes" : "No"}`);
      sections.push(`- Archived: ${s.is_archived ? "YES" : "No"}`);
      sections.push("");

      const evidence =
        (s.security_evidence as Array<{
          label: string;
          pass: boolean | null;
          detail: string;
          points: number;
          max_points: number;
        }>) || [];
      if (evidence.length > 0) {
        sections.push("## Evidence");
        for (const e of evidence) {
          const icon = e.pass === true ? "PASS" : e.pass === false ? "FAIL" : "INFO";
          sections.push(`- [${icon}] ${e.label}: ${e.detail} (${e.points}/${e.max_points} pts)`);
        }
      }

      sections.push("", "---", "*Automated scan. Cannot detect runtime attacks or supply chain compromises in transitive deps.*");
      return { content: [{ type: "text", text: sections.join("\n") }] };
    }

    // Full details report
    const grade = gradeFromScore(s.score_total as number);
    const tools = (s.tools as Array<{ name: string; description: string }>) || [];
    const resources = (s.resources as Array<{ name: string; description: string }>) || [];

    const sections: string[] = [];

    sections.push(
      `# ${sanitize(s.name)} ${s.verified ? "[Verified]" : ""} ${s.publisher_verified ? "[Publisher Verified]" : ""}`,
      s.tagline ? `${sanitize(s.tagline)}` : "",
      ""
    );

    sections.push(
      `## Score: ${s.score_total}/100 (${grade})`,
      `- Security: ${s.score_security}/30`,
      `- Maintenance: ${s.score_maintenance}/25`,
      `- Efficiency: ${s.score_efficiency}/20`,
      `- Documentation: ${s.score_documentation}/15`,
      `- Compatibility: ${s.score_compatibility}/10`,
      ""
    );

    const facts: string[] = [];
    if ((s.github_stars as number) > 0)
      facts.push(`Stars: ${(s.github_stars as number).toLocaleString()}`);
    if ((s.npm_weekly_downloads as number) > 0)
      facts.push(`Downloads/wk: ${(s.npm_weekly_downloads as number).toLocaleString()}`);
    facts.push(`Health: ${s.health_status}`);
    facts.push(`CVEs: ${s.cve_count}`);
    facts.push(`Token efficiency: ${s.token_efficiency_grade} (${s.total_tool_tokens} tokens for ${tools.length} tools)`);
    facts.push(`Transport: ${(s.transport as string[]).join(", ")}`);
    facts.push(`Auth required: ${s.requires_api_key ? "Yes" : "No"}`);
    if (s.license) facts.push(`License: ${s.license}`);
    if (s.author_name) facts.push(`Author: ${s.author_name} (${s.author_type})`);
    if (s.score_computed_at) facts.push(`Scores computed: ${s.score_computed_at}`);
    sections.push("## Facts", ...facts.map((f) => `- ${f}`), "");

    if (tools.length > 0) {
      sections.push(`## Tools (${tools.length})`);
      for (const t of tools.slice(0, 20)) {
        sections.push(`- **${sanitize(t.name)}**: ${sanitize(t.description || "No description")}`);
      }
      if (tools.length > 20) sections.push(`  ... and ${tools.length - 20} more`);
      sections.push("");
    }

    if (resources.length > 0) {
      sections.push(`## Resources (${resources.length})`);
      for (const r of resources.slice(0, 10)) {
        sections.push(`- **${sanitize(r.name)}**: ${sanitize(r.description || "No description")}`);
      }
      sections.push("");
    }

    const links: string[] = [];
    if (s.github_url) links.push(`GitHub: ${s.github_url}`);
    if (s.npm_package) links.push(`npm: https://www.npmjs.com/package/${s.npm_package}`);
    if (s.pip_package) links.push(`PyPI: https://pypi.org/project/${s.pip_package}`);
    if (s.homepage_url) links.push(`Homepage: ${s.homepage_url}`);
    links.push(`MCPpedia: https://mcppedia.org/s/${s.slug}`);
    if (links.length) {
      sections.push("## Links", ...links.map((l) => `- ${l}`), "");
    }

    sections.push("---", "*Scores updated daily. Verify critical security decisions independently.*");

    return { content: [{ type: "text", text: sections.filter(Boolean).join("\n") }] };
  }
);

// ─── Tool 3: compare_servers ────────────────────────────────

server.tool(
  "compare_servers",
  "Compare 2-5 MCP servers side-by-side on all scoring dimensions.",
  {
    slugs: z.array(z.string()).min(2).max(5),
  },
  async ({ slugs }) => {
    const { data, error } = await mcpApiCall("compare", { slugs });

    if (error) {
      return errorText(
        error.includes("unreachable") || error.includes("Rate limited")
          ? error
          : `No servers found for slugs: ${slugs.join(", ")}. Use search_servers to find correct slugs.`
      );
    }

    const servers = data as Array<Record<string, unknown>>;
    if (!servers?.length) {
      return errorText("No servers found.");
    }

    const found = servers.map((s) => s.slug as string);
    const missing = slugs.filter((s) => !found.includes(s));

    const sections: string[] = [];
    sections.push(`# Server Comparison`);
    if (missing.length) {
      sections.push(`(Not found: ${missing.join(", ")})`);
    }
    sections.push("");

    const names = servers.map((s) => sanitize(s.name));
    sections.push(`| Metric | ${names.join(" | ")} |`);
    sections.push(`| --- | ${names.map(() => "---").join(" | ")} |`);

    const rows = [
      ["Score", (s: Record<string, unknown>) => `${num(s.score_total)}/100 (${gradeFromScore(s.score_total)})`],
      ["Security", (s: Record<string, unknown>) => `${num(s.score_security)}/30`],
      ["Maintenance", (s: Record<string, unknown>) => `${num(s.score_maintenance)}/25`],
      ["Efficiency", (s: Record<string, unknown>) => `${num(s.score_efficiency)}/20`],
      ["Documentation", (s: Record<string, unknown>) => `${num(s.score_documentation)}/15`],
      ["Compatibility", (s: Record<string, unknown>) => `${num(s.score_compatibility)}/10`],
      ["Stars", (s: Record<string, unknown>) => num(s.github_stars).toLocaleString()],
      ["Downloads/wk", (s: Record<string, unknown>) => num(s.npm_weekly_downloads).toLocaleString()],
      ["Token Grade", (s: Record<string, unknown>) => str(s.token_efficiency_grade) || "N/A"],
      ["CVEs", (s: Record<string, unknown>) => `${num(s.cve_count)}`],
      ["Status", (s: Record<string, unknown>) => str(s.health_status) || "unknown"],
      ["Transport", (s: Record<string, unknown>) => arr(s.transport).join(", ") || "N/A",
      ],
    ] as Array<[string, (s: Record<string, unknown>) => string]>;

    for (const [label, fn] of rows) {
      sections.push(`| ${label} | ${servers.map(fn).join(" | ")} |`);
    }

    sections.push("");
    const best = [...servers].sort(
      (a, b) => num(b.score_total) - num(a.score_total)
    )[0];
    sections.push(
      `**Recommended**: ${sanitize(best.name)} (highest overall score: ${num(best.score_total)}/100)`
    );

    return { content: [{ type: "text", text: sections.join("\n") }] };
  }
);

// ─── Tool 4: get_install_config ─────────────────────────────

server.tool(
  "get_install_config",
  "Install config for claude-desktop (default), cursor, claude-code, or windsurf.",
  {
    slug: z.string(),
    client: z.string().optional(),
  },
  async ({ slug, client }) => {
    const targetClient = client ?? "claude-desktop";
    const { data, error } = await mcpApiCall("install", { slug });

    if (error) {
      return errorText(
        error.includes("unreachable") || error.includes("Rate limited")
          ? error
          : `Server "${slug}" not found. Try search_servers to find the correct slug.`
      );
    }

    const s = data as Record<string, unknown>;
    const sections: string[] = [];
    sections.push(`# Install: ${sanitize(s.name)}`);
    sections.push(`Target client: ${targetClient}`);
    sections.push("");

    const prereqs = (s.prerequisites as string[]) || [];
    if (prereqs.length) {
      sections.push("## Prerequisites");
      for (const p of prereqs) sections.push(`- ${p}`);
      sections.push("");
    }

    const configs = (s.install_configs as Record<string, unknown>) || {};
    const config =
      configs[targetClient] ||
      configs["default"] ||
      configs[Object.keys(configs)[0]];

    if (config) {
      sections.push("## Configuration");
      sections.push("```json");
      sections.push(JSON.stringify(config, null, 2));
      sections.push("```");
      sections.push("");
    } else {
      sections.push("## Configuration");
      if (s.npm_package) {
        sections.push("```json");
        sections.push(
          JSON.stringify(
            {
              mcpServers: {
                [slug]: { command: "npx", args: ["-y", s.npm_package] },
              },
            },
            null,
            2
          )
        );
        sections.push("```");
      } else if (s.pip_package) {
        sections.push("```json");
        sections.push(
          JSON.stringify(
            {
              mcpServers: {
                [slug]: { command: "uvx", args: [s.pip_package] },
              },
            },
            null,
            2
          )
        );
        sections.push("```");
      } else {
        sections.push(
          "No pre-built config available. Check the server's documentation."
        );
      }
      sections.push("");
    }

    const envInstructions =
      (s.env_instructions as Record<
        string,
        { label: string; url: string; steps: string }
      >) || {};
    if (Object.keys(envInstructions).length) {
      sections.push("## Environment Variables");
      for (const [key, info] of Object.entries(envInstructions)) {
        sections.push(`- **${key}**: ${info.label}`);
        if (info.url) sections.push(`  Get it: ${info.url}`);
        if (info.steps) sections.push(`  Steps: ${info.steps}`);
      }
      sections.push("");
    } else if (s.requires_api_key) {
      sections.push("## Note");
      sections.push(
        "This server requires an API key. Check the server's documentation for setup instructions."
      );
      sections.push("");
    }

    const clients = arr(s.compatible_clients);
    if (clients.length) {
      sections.push(`Compatible clients: ${clients.join(", ")}`);
    }
    sections.push(`Transport: ${arr(s.transport).join(", ") || "unknown"}`);


    return {
      content: [{ type: "text", text: sections.join("\n") }],
    };
  }
);

// ─── Tool 5: get_trending ───────────────────────────────────

server.tool(
  "get_trending",
  "Top-rated, most-starred, or newest MCP servers. Sort: score|stars|newest.",
  {
    category: z.string().optional(),
    sort: z.string().optional(),
    limit: z.number().optional(),
  },
  async ({ category, sort, limit }) => {
    const { data, error } = await mcpApiCall("trending", {
      category,
      sort: sort ?? "score",
      limit: limit ?? 10,
    });

    if (error) return errorText(error);

    const servers = data as Array<Record<string, unknown>>;
    if (!servers?.length) {
      return errorText(
        category
          ? `No trending servers found in category "${category}".`
          : "No trending servers found."
      );
    }

    const sortBy = sort ?? "score";
    const label =
      sortBy === "stars"
        ? "Most Starred"
        : sortBy === "newest"
          ? "Newest"
          : "Top Rated";
    const lines = servers.map((s) => formatServer(s));
    const header = `# ${label} MCP Servers${category ? ` in ${category}` : ""}\n`;

    return {
      content: [{ type: "text", text: header + lines.join("\n\n") }],
    };
  }
);

// ─── Start ──────────────────────────────────────────────────

async function main() {
  const mode = process.argv.includes("--http") ? "http" : "stdio";
  const port = parseInt(process.env.PORT || "8080", 10);

  if (mode === "http") {
    const MAX_SESSIONS = 100;
    const SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes
    const sessions = new Map<string, { transport: StreamableHTTPServerTransport; createdAt: number }>();
    const corsOrigin = process.env.CORS_ORIGIN || "*";

    // Clean up expired sessions every 5 minutes
    setInterval(() => {
      const now = Date.now();
      for (const [id, session] of sessions) {
        if (now - session.createdAt > SESSION_TTL_MS) {
          session.transport.close();
          sessions.delete(id);
        }
      }
    }, 5 * 60 * 1000);

    const httpServer = createServer(async (req, res) => {
      // CORS
      res.setHeader("Access-Control-Allow-Origin", corsOrigin);
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, mcp-session-id");

      if (req.method === "OPTIONS") {
        res.writeHead(204);
        res.end();
        return;
      }

      if (req.url !== "/mcp") {
        res.writeHead(404);
        res.end("Not found");
        return;
      }

      const sessionId = req.headers["mcp-session-id"] as string | undefined;

      if (req.method === "POST" && !sessionId) {
        // Reject if too many sessions
        if (sessions.size >= MAX_SESSIONS) {
          res.writeHead(503);
          res.end("Too many sessions. Try again later.");
          return;
        }

        // New session
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (id) => {
            sessions.set(id, { transport, createdAt: Date.now() });
          },
          onsessionclosed: (id) => {
            sessions.delete(id);
          },
        });
        await server.connect(transport);
        await transport.handleRequest(req, res);
        return;
      }

      if (sessionId) {
        const session = sessions.get(sessionId);
        if (session) {
          await session.transport.handleRequest(req, res);
        } else {
          res.writeHead(404);
          res.end("Session not found");
        }
        return;
      }

      res.writeHead(400);
      res.end("Missing mcp-session-id header");
    });

    httpServer.listen(port, () => {
      console.error(`MCPpedia server (HTTP) listening on port ${port}`);
    });
  } else {
    // Default: stdio
    const transport = new StdioServerTransport();
    await server.connect(transport);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
