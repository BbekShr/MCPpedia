import Link from 'next/link'
import type { Metadata } from 'next'
import { SITE_NAME, SITE_URL, CATEGORIES } from '@/lib/constants'
import {
  JsonLdScript,
  generateFAQJsonLd,
  generateBreadcrumbJsonLd,
  type FAQItem,
} from '@/lib/seo'
import { getCatalogCounts, formatApproxTotal } from '@/lib/live-counts'

// /faq was a 404 that llms.txt and the footer had no answer for. Answer engines
// pull from question-shaped pages more readily than from anything else on a
// site, and every one of these is a question we already answer implicitly
// across /methodology, /get-started and 36k server pages — just never in one
// place a model can quote.
export const revalidate = 86400 // 1d — the counts below are live

export const metadata: Metadata = {
  // `absolute` because the root layout appends " - MCPpedia" via its title
  // template, and this already ends in "| MCPpedia". Same pattern as the
  // server pages — every hub title that names the brand must use it.
  title: {
    absolute: `MCP Server FAQ — What MCP Is, How to Install, How Scoring Works | ${SITE_NAME}`,
  },
  description:
    'Straight answers about Model Context Protocol servers: what MCP is, how to install a server in Claude or Cursor, whether MCP servers are safe, and how MCPpedia scores them.',
  openGraph: {
    title: 'MCP Server FAQ',
    description:
      'What MCP is, how to install a server, whether they are safe, and how the 0-100 score works.',
    type: 'article',
    url: `${SITE_URL}/faq`,
  },
  alternates: { canonical: `${SITE_URL}/faq` },
}

function buildFaqs(catalogSize: string): FAQItem[] {
  return [
    {
      question: 'What is an MCP server?',
      answer:
        'An MCP server is a small program that exposes tools, data and prompts to an AI assistant over the Model Context Protocol, an open standard introduced by Anthropic in November 2024. The assistant stays the same; the server is what lets it read your database, search your files, open a browser or call an API. A client like Claude Desktop, Claude Code, Cursor or Windsurf connects to one or more servers and offers their tools to the model.',
    },
    {
      question: 'What is the difference between an MCP server and a plugin or a skill?',
      answer:
        'An MCP server gives a model new capabilities — tools it can call over a protocol, running as a separate process you control. A skill gives a model instructions and context for a task it can already do. They compose: a skill can tell the model how to use the tools an MCP server provides. MCP is also client-agnostic, so the same server works in Claude, Cursor and Windsurf, whereas plugin formats are usually tied to one product.',
    },
    {
      question: 'How do I install an MCP server?',
      answer:
        'Every MCP client reads a JSON config listing the servers it should start. The JSON is the same across clients — only the file path differs. Add an entry naming the command to run (usually npx or uvx plus the package) or the URL of a remote server, restart the client, and the tools appear. Every server page on MCPpedia carries a copy-paste config block for Claude Desktop, Claude Code, Cursor and Windsurf, plus any environment variables that server needs.',
    },
    {
      question: 'Are MCP servers safe to install?',
      answer:
        'Not automatically. An MCP server runs as a normal process on your machine with your permissions, and its tool descriptions are read by the model as instructions — which is the mechanism behind tool poisoning, where a malicious description tells the model to do something you did not ask for. Before installing, check who publishes it, whether it has open CVEs, whether it authenticates, and what its tools actually claim to do. MCPpedia scans for all four and shows the evidence on each server page.',
    },
    {
      question: 'How does MCPpedia score MCP servers?',
      answer:
        'Every server gets a 0-100 score from five weighted inputs: security (CVE scanning, tool-poisoning detection, and whether the server authenticates), maintenance (commit recency, release cadence, download trend), documentation (setup instructions, examples, tool schema coverage), client compatibility, and token efficiency — how much of your context window the tool definitions consume before you have asked anything. Scores are recomputed daily by bots, never edited by hand, and every input is shown on the server page so you can disagree with the weighting and still use the evidence.',
    },
    {
      question: 'Why do some MCP servers score badly?',
      answer:
        'Usually because there is nothing to score. A large share of the catalog is registry entries: a package name, no description, no published tool schema, no commits in the last year. A low score is not an accusation, it is a statement that we could not find evidence of the things that make a server safe to install. Servers with open CVEs or detected tool-poisoning patterns score badly for the opposite reason — we did find evidence.',
    },
    {
      question: 'What is tool poisoning?',
      answer:
        "A tool's description is passed to the model as text it trusts. Tool poisoning is hiding instructions in that description — telling the model to exfiltrate a file, ignore a safety rule, or call another tool with attacker-chosen arguments. The user never sees it, because clients show the tool name, not the full schema. MCPpedia parses every published tool schema and flags descriptions containing instruction-like patterns.",
    },
    {
      question: 'How many MCP servers are there?',
      answer: `MCPpedia currently tracks ${catalogSize} MCP servers discovered from the official MCP Registry, GitHub, npm and PyPI. That is the published population, not the usable one — a much smaller number have a description, a published tool schema and recent commits. The catalog is refreshed daily.`,
    },
    {
      question: 'Which MCP servers should I start with?',
      answer:
        'Start from what you actually want the model to reach: a database, your filesystem, GitHub, a search API. Prefer servers published by the vendor behind the underlying service over third-party wrappers — they track upstream changes. MCPpedia ranks the top ten in each category, and each category hub explains what separates the leaders from the rest.',
    },
    {
      question: 'Is MCPpedia free, and where does its data come from?',
      answer:
        'Free, no account, no paywall, no login wall. Data comes from the official MCP Registry, the GitHub API, npm and PyPI, plus community submissions and edits — all refreshed by scheduled bots. Scores are computed from that data by open, documented rules. Anyone can propose an edit to a server page, and the full catalog is available through a public API and an MCP server.',
    },
  ]
}

export default async function FaqPage() {
  const { totalServers } = await getCatalogCounts()
  const faqs = buildFaqs(formatApproxTotal(totalServers))

  return (
    <div className="max-w-[760px] mx-auto px-4 py-8">
      <JsonLdScript
        data={[
          generateFAQJsonLd(faqs),
          generateBreadcrumbJsonLd([
            { name: 'Home', url: SITE_URL },
            { name: 'FAQ', url: `${SITE_URL}/faq` },
          ]),
        ]}
      />

      <nav aria-label="Breadcrumb" className="text-sm text-text-muted mb-6">
        <Link href="/" className="hover:text-accent">Home</Link>
        <span className="mx-1.5 opacity-50">/</span>
        <span className="text-text-primary">FAQ</span>
      </nav>

      <h1 className="text-2xl font-semibold text-text-primary mb-2">
        MCP servers: frequently asked questions
      </h1>
      <p className="text-text-muted mb-8">
        What the Model Context Protocol is, how to install a server, whether they are safe, and how
        MCPpedia scores them.
      </p>

      <div className="flex flex-col gap-7">
        {faqs.map(faq => (
          <section key={faq.question}>
            <h2 className="text-[17px] font-semibold text-text-primary mb-1.5">{faq.question}</h2>
            <p className="text-[15px] leading-[1.65] text-text-primary m-0">{faq.answer}</p>
          </section>
        ))}
      </div>

      <div className="mt-12 pt-8 border-t border-border text-sm text-text-muted">
        <p className="mb-2">
          Still looking? Read the{' '}
          <Link href="/methodology" className="text-accent hover:text-accent-hover">scoring methodology</Link>,
          the <Link href="/get-started" className="text-accent hover:text-accent-hover">getting started guide</Link>,
          the <Link href="/security" className="text-accent hover:text-accent-hover">security advisories</Link>, or
          browse the <Link href="/best" className="text-accent hover:text-accent-hover">best servers in each of the {CATEGORIES.length} categories</Link>.
        </p>
        <p className="m-0">
          You can also query this catalog from inside your agent with the{' '}
          <Link href="/mcp" className="text-accent hover:text-accent-hover">MCPpedia MCP server</Link>.
        </p>
      </div>
    </div>
  )
}
