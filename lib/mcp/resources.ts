import {
  McpServer,
  ResourceTemplate,
} from "@modelcontextprotocol/sdk/server/mcp.js";
import { mcpApiCall } from "./api";
import { arr, num, projectServer, str } from "./format";

export function registerResources(server: McpServer): void {
  // mcppedia://trending — top 20 by score
  server.registerResource(
    "trending",
    "mcppedia://trending",
    {
      title: "Trending MCP servers",
      description: "Top 20 MCP servers by composite score. Refreshed daily.",
      mimeType: "application/json",
    },
    async (uri) => {
      const { data, error } = await mcpApiCall("trending", { sort: "score", limit: 20 });
      if (error) throw new Error(error);
      const servers = arr<Record<string, unknown>>(data).map(projectServer);
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify({ servers }, null, 2),
          },
        ],
      };
    }
  );

  // mcppedia://server/{slug} — full record
  server.registerResource(
    "server",
    new ResourceTemplate("mcppedia://server/{slug}", {
      list: async () => {
        const { data } = await mcpApiCall("trending", { sort: "score", limit: 20 });
        const servers = arr<Record<string, unknown>>(data);
        return {
          resources: servers.map((s) => ({
            uri: `mcppedia://server/${str(s.slug)}`,
            name: str(s.name),
            description: str(s.tagline),
            mimeType: "application/json",
          })),
        };
      },
    }),
    {
      title: "MCP server record",
      description: "Full record for a specific MCP server by slug.",
      mimeType: "application/json",
    },
    async (uri, variables) => {
      const slug = Array.isArray(variables.slug) ? variables.slug[0] : variables.slug;
      const { data, error } = await mcpApiCall("details", { slug });
      if (error) throw new Error(error);
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify(data, null, 2),
          },
        ],
      };
    }
  );

  // mcppedia://category/{name} — category listing
  server.registerResource(
    "category",
    new ResourceTemplate("mcppedia://category/{name}", {
      list: async () => {
        const { data } = await mcpApiCall("categories", {});
        const cats = arr<{ slug: string; name: string; count: number }>(data);
        return {
          resources: cats.map((c) => ({
            uri: `mcppedia://category/${str(c.slug)}`,
            name: str(c.name),
            description: `${num(c.count)} servers`,
            mimeType: "application/json",
          })),
        };
      },
    }),
    {
      title: "Category listing",
      description: "Top servers in a given category.",
      mimeType: "application/json",
    },
    async (uri, variables) => {
      const name = Array.isArray(variables.name) ? variables.name[0] : variables.name;
      const { data, error } = await mcpApiCall("trending", {
        category: name,
        sort: "score",
        limit: 20,
      });
      if (error) throw new Error(error);
      const servers = arr<Record<string, unknown>>(data).map(projectServer);
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify({ category: name, servers }, null, 2),
          },
        ],
      };
    }
  );
}
