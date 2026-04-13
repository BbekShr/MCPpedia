import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export function registerPrompts(server: McpServer): void {
  // audit-my-mcp-setup — review every server the user currently has installed
  server.registerPrompt(
    "audit-my-mcp-setup",
    {
      title: "Audit my MCP setup",
      description:
        "Review every MCP server you have installed against MCPpedia's scoring catalog. Flags low-security, abandoned, and high-token servers and suggests swaps.",
    },
    () => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: [
              "You are an MCP security and quality auditor.",
              "",
              "1. List every MCP server configured in my client (check mcp config / roots).",
              "2. For each server slug, call `get_server_details` with `security: true` to pull its risk profile.",
              "3. Rate each server with a one-line verdict (KEEP / REVIEW / REPLACE).",
              "4. For any REPLACE, call `search_servers` for alternatives in the same category with a higher score.",
              "5. Produce a final markdown table: server | score | verdict | suggested swap.",
              "Be concise. Flag CRITICAL RISK and archived servers first.",
            ].join("\n"),
          },
        },
      ],
    })
  );

  // find-alternative — given a slug, suggest safer/higher-scored swaps
  server.registerPrompt(
    "find-alternative",
    {
      title: "Find a safer alternative",
      description:
        "Given a server slug, suggest alternatives with better security / maintenance scores.",
      argsSchema: { slug: z.string() },
    },
    ({ slug }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: [
              `I'm currently using the MCP server "${slug}". Help me find a safer or higher-scored alternative.`,
              "",
              `1. Call \`get_server_details\` with slug="${slug}" and security=true to understand its risk profile + categories.`,
              `2. Call \`search_servers\` in the same categories with min_score 10 points higher than the current server.`,
              `3. Call \`compare_servers\` with the top 2 alternatives plus the current one.`,
              "4. Recommend the single best swap with a one-paragraph rationale grounded in the comparison.",
            ].join("\n"),
          },
        },
      ],
    })
  );

  // security-review — long-form security writeup for a specific server
  server.registerPrompt(
    "security-review",
    {
      title: "Security review",
      description:
        "Generate a detailed security writeup for an MCP server. Uses sampling to produce narrative analysis.",
      argsSchema: { slug: z.string() },
    },
    ({ slug }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: [
              `Produce a thorough security review of the MCP server "${slug}" for an engineering audience.`,
              "",
              `1. Call \`get_server_details\` with slug="${slug}" and security=true for the structured risk data.`,
              "2. Call `get_server_details` without security for metadata (tools list, transport, auth).",
              "3. Write a review covering: threat model, attack surface (tool poisoning, injection, code execution), dependency health, license/provenance concerns, and a final risk verdict with mitigations.",
              "Cite specific evidence fields rather than generic claims.",
            ].join("\n"),
          },
        },
      ],
    })
  );
}
