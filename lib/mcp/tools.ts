import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { mcpApiCall, logTelemetry } from "./api";
import {
  arr,
  errorText,
  formatServerLine,
  gradeFromScore,
  num,
  projectServer,
  resourceLink,
  sanitize,
  str,
  type Server,
} from "./format";

// ─── Shared output shapes ───────────────────────────────────

const scoresShape = {
  total: z.number(),
  security: z.number(),
  maintenance: z.number(),
  efficiency: z.number(),
  documentation: z.number(),
  compatibility: z.number(),
  grade: z.string(),
};

const serverSummarySchema = z.object({
  slug: z.string(),
  name: z.string(),
  tagline: z.string(),
  url: z.string(),
  scores: z.object(scoresShape),
  stats: z.object({
    github_stars: z.number(),
    npm_weekly_downloads: z.number(),
    cve_count: z.number(),
    token_efficiency_grade: z.string().nullable(),
    health_status: z.string().nullable(),
  }),
  categories: z.array(z.string()),
  transport: z.array(z.string()),
});

// Track tool latency for telemetry.
async function timed<T>(tool: string, fn: () => Promise<T>): Promise<T> {
  const started = Date.now();
  try {
    return await fn();
  } finally {
    logTelemetry({ event: "tool_call", tool, latency: Date.now() - started });
  }
}

export function registerTools(server: McpServer): void {
  // ── search_servers ────────────────────────────────────────

  server.registerTool(
    "search_servers",
    {
      title: "Search MCP servers",
      description:
        "Search 17K+ scored MCP servers. Categories: developer-tools, data, security, ai-ml, cloud, productivity, etc.",
      inputSchema: {
        query: z.string().describe("Keyword(s) to search for."),
        category: z.string().optional(),
        min_score: z.number().min(0).max(100).optional(),
        limit: z.number().min(1).max(20).optional(),
      },
      outputSchema: {
        count: z.number(),
        servers: z.array(serverSummarySchema),
      },
    },
    async ({ query, category, min_score, limit }) =>
      timed("search_servers", async () => {
        const { data, error } = await mcpApiCall("search", {
          query,
          category,
          min_score,
          limit: limit ?? 5,
        });
        if (error) return errorText(error);

        const servers = (data as Server[]) ?? [];
        if (!servers.length)
          return errorText(`No servers found for "${sanitize(query)}".`);

        const projected = servers.map(projectServer);
        const header = `Found ${servers.length} server${servers.length === 1 ? "" : "s"} for "${sanitize(query)}":\n`;
        const lines = servers.map(formatServerLine).join("\n\n");

        return {
          content: [
            { type: "text" as const, text: header + lines },
            ...servers.map((s) =>
              resourceLink(str(s.slug), str(s.name), str(s.tagline))
            ),
          ],
          structuredContent: { count: servers.length, servers: projected },
        };
      })
  );

  // ── get_server_details ────────────────────────────────────

  server.registerTool(
    "get_server_details",
    {
      title: "Get server details",
      description:
        "Full server info: scores, tools, transports. Set security=true for CVE / tool-poisoning / injection report.",
      inputSchema: {
        slug: z.string(),
        security: z.boolean().optional(),
      },
    },
    async ({ slug, security }) =>
      timed("get_server_details", async () => {
        const action = security ? "security" : "details";
        const { data, error } = await mcpApiCall(action, { slug });
        if (error) {
          return errorText(
            error.includes("unreachable") || error.includes("Rate limited")
              ? error
              : `Server "${sanitize(slug)}" not found. Try search_servers to find the correct slug.`
          );
        }

        const s = data as Server;

        if (security) {
          const secScore = num(s.score_security);
          let verdict: string;
          if (secScore >= 25) verdict = "LOW RISK";
          else if (secScore >= 18) verdict = "MODERATE RISK";
          else if (secScore >= 10) verdict = "HIGH RISK";
          else verdict = "CRITICAL RISK";

          const sections: string[] = [
            `# Security Report: ${sanitize(s.name)}`,
            `**${verdict}** — Security score: ${secScore}/30`,
            "",
            "## Key Indicators",
            `- CVEs found: ${num(s.cve_count)}`,
            `- Tool poisoning: ${s.has_tool_poisoning ? "YES — " + arr<string>(s.tool_poisoning_flags).join(", ") : "None detected"}`,
            `- Code execution: ${s.has_code_execution ? "YES" : "No"}`,
            `- Injection risk: ${s.has_injection_risk ? "YES" : "No"}`,
            `- Dangerous patterns: ${num(s.dangerous_pattern_count)}`,
            `- Dep health: ${s.dep_health_score != null ? `${s.dep_health_score}/100` : "Not scanned"}`,
            `- Auth required: ${s.has_authentication ? "Yes" : "No"}`,
            `- License: ${str(s.license) || "None found"}`,
            "",
            "## Verification",
            `- MCPpedia verified: ${s.verified ? "Yes" : "No"}`,
            `- Security verified: ${s.security_verified ? "Yes" : "No"}`,
            `- Publisher verified: ${s.publisher_verified ? "Yes" : "No"}`,
            `- Archived: ${s.is_archived ? "YES" : "No"}`,
            "",
          ];

          const evidence = arr<{
            label: string;
            pass: boolean | null;
            detail: string;
            points: number;
            max_points: number;
          }>(s.security_evidence);
          if (evidence.length) {
            sections.push("## Evidence");
            for (const e of evidence) {
              const icon = e.pass === true ? "PASS" : e.pass === false ? "FAIL" : "INFO";
              sections.push(`- [${icon}] ${e.label}: ${e.detail} (${e.points}/${e.max_points} pts)`);
            }
          }

          sections.push(
            "",
            "---",
            "*Automated scan. Cannot detect runtime attacks or transitive supply-chain compromises.*",
            `\nView full details: https://mcppedia.org/s/${str(s.slug)}`
          );

          return {
            content: [{ type: "text" as const, text: sections.join("\n") }],
            structuredContent: {
              slug: str(s.slug),
              name: str(s.name),
              verdict,
              score: secScore,
              cve_count: num(s.cve_count),
              has_tool_poisoning: !!s.has_tool_poisoning,
              has_code_execution: !!s.has_code_execution,
              has_injection_risk: !!s.has_injection_risk,
              verified: !!s.verified,
            },
          };
        }

        // Full details
        const grade = gradeFromScore(s.score_total);
        const tools = arr<{ name: string; description: string }>(s.tools);
        const resources = arr<{ name: string; description: string }>(s.resources);

        const sections: string[] = [
          `# ${sanitize(s.name)} ${s.verified ? "[Verified]" : ""} ${s.publisher_verified ? "[Publisher Verified]" : ""}`,
          s.tagline ? sanitize(s.tagline) : "",
          "",
          `## Score: ${num(s.score_total)}/100 (${grade})`,
          `- Security: ${num(s.score_security)}/30`,
          `- Maintenance: ${num(s.score_maintenance)}/25`,
          `- Efficiency: ${num(s.score_efficiency)}/20`,
          `- Documentation: ${num(s.score_documentation)}/15`,
          `- Compatibility: ${num(s.score_compatibility)}/10`,
          "",
        ];

        const facts: string[] = [];
        if (num(s.github_stars) > 0) facts.push(`Stars: ${num(s.github_stars).toLocaleString()}`);
        if (num(s.npm_weekly_downloads) > 0)
          facts.push(`Downloads/wk: ${num(s.npm_weekly_downloads).toLocaleString()}`);
        facts.push(`Health: ${str(s.health_status) || "unknown"}`);
        facts.push(`CVEs: ${num(s.cve_count)}`);
        facts.push(
          `Token efficiency: ${str(s.token_efficiency_grade) || "unknown"} (${num(s.total_tool_tokens)} tokens for ${tools.length} tools)`
        );
        facts.push(`Transport: ${arr<string>(s.transport).join(", ") || "unknown"}`);
        facts.push(`Auth required: ${s.requires_api_key ? "Yes" : "No"}`);
        if (s.license) facts.push(`License: ${sanitize(s.license)}`);
        if (s.author_name) facts.push(`Author: ${sanitize(s.author_name)} (${sanitize(s.author_type)})`);
        if (s.score_computed_at) facts.push(`Scores computed: ${sanitize(s.score_computed_at)}`);
        sections.push("## Facts", ...facts.map((f) => `- ${f}`), "");

        if (tools.length) {
          sections.push(`## Tools (${tools.length})`);
          for (const t of tools.slice(0, 20)) {
            sections.push(`- **${sanitize(t.name)}**: ${sanitize(t.description || "No description")}`);
          }
          if (tools.length > 20) sections.push(`  ... and ${tools.length - 20} more`);
          sections.push("");
        }

        if (resources.length) {
          sections.push(`## Resources (${resources.length})`);
          for (const r of resources.slice(0, 10)) {
            sections.push(`- **${sanitize(r.name)}**: ${sanitize(r.description || "No description")}`);
          }
          sections.push("");
        }

        const links: string[] = [];
        if (s.github_url) links.push(`GitHub: ${str(s.github_url)}`);
        if (s.npm_package) links.push(`npm: https://www.npmjs.com/package/${str(s.npm_package)}`);
        if (s.pip_package) links.push(`PyPI: https://pypi.org/project/${str(s.pip_package)}`);
        if (s.homepage_url) links.push(`Homepage: ${str(s.homepage_url)}`);
        links.push(`MCPpedia: https://mcppedia.org/s/${str(s.slug)}`);
        sections.push("## Links", ...links.map((l) => `- ${l}`), "");
        sections.push(
          "---",
          "*Scores updated daily. Verify critical security decisions independently.*"
        );

        return {
          content: [
            { type: "text" as const, text: sections.filter(Boolean).join("\n") },
            resourceLink(str(s.slug), str(s.name), str(s.tagline)),
          ],
          structuredContent: projectServer(s),
        };
      })
  );

  // ── compare_servers ───────────────────────────────────────

  server.registerTool(
    "compare_servers",
    {
      title: "Compare MCP servers",
      description: "Compare 2–5 MCP servers side-by-side across every scoring dimension.",
      inputSchema: { slugs: z.array(z.string()).min(2).max(5) },
      outputSchema: {
        servers: z.array(serverSummarySchema),
        missing: z.array(z.string()),
        recommended_slug: z.string(),
      },
    },
    async ({ slugs }) =>
      timed("compare_servers", async () => {
        const { data, error } = await mcpApiCall("compare", { slugs });
        if (error) {
          return errorText(
            error.includes("unreachable") || error.includes("Rate limited")
              ? error
              : `No servers found for slugs: ${slugs.join(", ")}.`
          );
        }

        const servers = (data as Server[]) ?? [];
        if (!servers.length) return errorText("No servers found.");

        const found = servers.map((s) => str(s.slug));
        const missing = slugs.filter((s) => !found.includes(s));
        const names = servers.map((s) => sanitize(s.name));
        const rows: Array<[string, (s: Server) => string]> = [
          ["Score", (s) => `${num(s.score_total)}/100 (${gradeFromScore(s.score_total)})`],
          ["Security", (s) => `${num(s.score_security)}/30`],
          ["Maintenance", (s) => `${num(s.score_maintenance)}/25`],
          ["Efficiency", (s) => `${num(s.score_efficiency)}/20`],
          ["Documentation", (s) => `${num(s.score_documentation)}/15`],
          ["Compatibility", (s) => `${num(s.score_compatibility)}/10`],
          ["Stars", (s) => num(s.github_stars).toLocaleString()],
          ["Downloads/wk", (s) => num(s.npm_weekly_downloads).toLocaleString()],
          ["Token Grade", (s) => str(s.token_efficiency_grade) || "N/A"],
          ["CVEs", (s) => `${num(s.cve_count)}`],
          ["Status", (s) => str(s.health_status) || "unknown"],
          ["Transport", (s) => arr<string>(s.transport).join(", ") || "N/A"],
        ];

        const lines: string[] = ["# Server Comparison"];
        if (missing.length) lines.push(`(Not found: ${missing.join(", ")})`);
        lines.push("");
        lines.push(`| Metric | ${names.join(" | ")} |`);
        lines.push(`| --- | ${names.map(() => "---").join(" | ")} |`);
        for (const [label, fn] of rows) {
          lines.push(`| ${label} | ${servers.map(fn).join(" | ")} |`);
        }

        const best = [...servers].sort((a, b) => num(b.score_total) - num(a.score_total))[0];
        lines.push("");
        lines.push(
          `**Recommended**: ${sanitize(best.name)} (highest overall score: ${num(best.score_total)}/100)`
        );

        return {
          content: [
            { type: "text" as const, text: lines.join("\n") },
            ...servers.map((s) => resourceLink(str(s.slug), str(s.name), str(s.tagline))),
          ],
          structuredContent: {
            servers: servers.map(projectServer),
            missing,
            recommended_slug: str(best.slug),
          },
        };
      })
  );

  // ── get_install_config ────────────────────────────────────

  server.registerTool(
    "get_install_config",
    {
      title: "Get install config",
      description: "Installation config for claude-desktop, cursor, claude-code, or windsurf.",
      inputSchema: {
        slug: z.string(),
        client: z
          .enum(["claude-desktop", "cursor", "claude-code", "windsurf"])
          .optional()
          .describe("Target client. If omitted, the user will be asked."),
      },
    },
    async ({ slug, client }, extra) =>
      timed("get_install_config", async () => {
        let targetClient = client;

        // Elicit the client if not provided and the client supports it.
        if (!targetClient) {
          try {
            const result = await extra.sendRequest(
              {
                method: "elicitation/create",
                params: {
                  message: `Which MCP client should I generate install config for "${sanitize(slug)}"?`,
                  requestedSchema: {
                    type: "object",
                    properties: {
                      client: {
                        type: "string",
                        enum: ["claude-desktop", "cursor", "claude-code", "windsurf"],
                        description: "Target MCP client",
                      },
                    },
                    required: ["client"],
                  },
                },
              },
              z.object({
                action: z.string(),
                content: z.object({ client: z.string() }).optional(),
              })
            );
            if (result.action === "accept" && result.content?.client) {
              const allowed = ["claude-desktop", "cursor", "claude-code", "windsurf"] as const;
              if ((allowed as readonly string[]).includes(result.content.client)) {
                targetClient = result.content.client as (typeof allowed)[number];
              }
            }
          } catch {
            // Client doesn't support elicitation — fall through to default.
          }
          targetClient = targetClient ?? "claude-desktop";
        }

        const { data, error } = await mcpApiCall("install", { slug });
        if (error) {
          return errorText(
            error.includes("unreachable") || error.includes("Rate limited")
              ? error
              : `Server "${sanitize(slug)}" not found. Try search_servers to find the correct slug.`
          );
        }

        const s = data as Server;
        const configs = (s.install_configs as Record<string, unknown>) || {};
        const config =
          configs[targetClient] ||
          configs["default"] ||
          configs[Object.keys(configs)[0]];

        const sections: string[] = [
          `# Install: ${sanitize(s.name)}`,
          `Target client: ${targetClient}`,
          "",
        ];

        const prereqs = arr<string>(s.prerequisites);
        if (prereqs.length) {
          sections.push("## Prerequisites");
          for (const p of prereqs) sections.push(`- ${sanitize(p)}`);
          sections.push("");
        }

        let configJson: unknown = config;
        sections.push("## Configuration");
        if (config) {
          sections.push("```json", JSON.stringify(config, null, 2), "```", "");
        } else if (s.npm_package) {
          configJson = {
            mcpServers: {
              [slug]: { command: "npx", args: ["-y", str(s.npm_package)] },
            },
          };
          sections.push("```json", JSON.stringify(configJson, null, 2), "```", "");
        } else if (s.pip_package) {
          configJson = {
            mcpServers: { [slug]: { command: "uvx", args: [str(s.pip_package)] } },
          };
          sections.push("```json", JSON.stringify(configJson, null, 2), "```", "");
        } else {
          sections.push("No pre-built config available. Check the server's documentation.", "");
        }

        const envInstructions =
          (s.env_instructions as Record<
            string,
            { label: string; url: string; steps: string }
          >) || {};
        if (Object.keys(envInstructions).length) {
          sections.push("## Environment Variables");
          for (const [key, info] of Object.entries(envInstructions)) {
            sections.push(`- **${key}**: ${sanitize(info.label)}`);
            if (info.url) sections.push(`  Get it: ${info.url}`);
            if (info.steps) sections.push(`  Steps: ${sanitize(info.steps)}`);
          }
          sections.push("");
        } else if (s.requires_api_key) {
          sections.push(
            "## Note",
            "This server requires an API key. Check the server's documentation for setup instructions.",
            ""
          );
        }

        sections.push(`Transport: ${arr<string>(s.transport).join(", ") || "unknown"}`);
        sections.push(`\nView full details: https://mcppedia.org/s/${str(s.slug)}`);

        return {
          content: [{ type: "text" as const, text: sections.join("\n") }],
        };
      })
  );

  // ── get_trending ──────────────────────────────────────────

  server.registerTool(
    "get_trending",
    {
      title: "Get trending servers",
      description: "Top-rated, most-starred, or newest MCP servers. Sort: score|stars|newest.",
      inputSchema: {
        category: z.string().optional(),
        sort: z.enum(["score", "stars", "newest"]).optional(),
        limit: z.number().min(1).max(20).optional(),
      },
      outputSchema: {
        count: z.number(),
        sort: z.string(),
        servers: z.array(serverSummarySchema),
      },
    },
    async ({ category, sort, limit }) =>
      timed("get_trending", async () => {
        const { data, error } = await mcpApiCall("trending", {
          category,
          sort: sort ?? "score",
          limit: limit ?? 10,
        });
        if (error) return errorText(error);

        const servers = (data as Server[]) ?? [];
        if (!servers.length) {
          return errorText(
            category
              ? `No trending servers found in category "${sanitize(category)}".`
              : "No trending servers found."
          );
        }

        const sortBy = sort ?? "score";
        const label =
          sortBy === "stars" ? "Most Starred" : sortBy === "newest" ? "Newest" : "Top Rated";
        const header = `# ${label} MCP Servers${category ? ` in ${sanitize(category)}` : ""}\n`;
        const lines = servers.map(formatServerLine).join("\n\n");

        return {
          content: [
            { type: "text" as const, text: header + lines },
            ...servers.map((s) =>
              resourceLink(str(s.slug), str(s.name), str(s.tagline))
            ),
          ],
          structuredContent: {
            count: servers.length,
            sort: sortBy,
            servers: servers.map(projectServer),
          },
        };
      })
  );

  // ── get_category_tree ─────────────────────────────────────

  server.registerTool(
    "get_category_tree",
    {
      title: "List categories",
      description:
        "Browse every category in the catalog with server counts. Useful before calling get_trending or search_servers.",
      inputSchema: {},
      outputSchema: {
        categories: z.array(
          z.object({ slug: z.string(), name: z.string(), count: z.number() })
        ),
      },
    },
    async () =>
      timed("get_category_tree", async () => {
        const { data, error } = await mcpApiCall("categories", {});
        if (error) return errorText(error);

        const cats = arr<{ slug: string; name: string; count: number }>(data);
        if (!cats.length) return errorText("No categories returned.");

        const lines = cats
          .sort((a, b) => num(b.count) - num(a.count))
          .map((c) => `- **${sanitize(c.name)}** (${c.slug}) — ${num(c.count)} servers`);

        return {
          content: [{ type: "text" as const, text: `# Categories\n\n${lines.join("\n")}` }],
          structuredContent: {
            categories: cats.map((c) => ({
              slug: str(c.slug),
              name: str(c.name),
              count: num(c.count),
            })),
          },
        };
      })
  );

  // ── what_changed ──────────────────────────────────────────

  server.registerTool(
    "what_changed",
    {
      title: "What changed",
      description:
        "Servers whose scores were recomputed since a given ISO-8601 timestamp. Powers 'what's new' agents.",
      inputSchema: {
        since: z
          .string()
          .describe("ISO-8601 timestamp, e.g. 2026-04-01T00:00:00Z"),
        limit: z.number().min(1).max(50).optional(),
      },
    },
    async ({ since, limit }) =>
      timed("what_changed", async () => {
        const { data, error } = await mcpApiCall("changes", {
          since,
          limit: limit ?? 20,
        });
        if (error) return errorText(error);

        const servers = (data as Server[]) ?? [];
        if (!servers.length)
          return errorText(`No score updates since ${sanitize(since)}.`);

        const header = `# Changes since ${sanitize(since)}\n`;
        const lines = servers.map(formatServerLine).join("\n\n");

        return {
          content: [
            { type: "text" as const, text: header + lines },
            ...servers.map((s) =>
              resourceLink(str(s.slug), str(s.name), str(s.tagline))
            ),
          ],
          structuredContent: { count: servers.length, servers: servers.map(projectServer) },
        };
      })
  );
}
