import type { Server } from '@/lib/types'
import type { FAQItem } from '@/lib/seo'

export function buildServerFAQs(server: Server): FAQItem[] {
  const faqs: FAQItem[] = []
  const toolCount = server.tools?.length || 0
  const packageName = server.npm_package || server.pip_package

  // Safety FAQ
  const cveCount = server.cve_count || 0
  let safetyAnswer: string
  if (cveCount === 0) {
    safetyAnswer = `${server.name} has no known CVEs as of the latest MCPpedia security scan.`
    if (server.has_authentication) {
      safetyAnswer += ' It requires authentication to connect, which limits unauthorized access.'
    } else {
      safetyAnswer += ' It does not require authentication, so any local process can connect — keep this in mind in shared environments.'
    }
    if (server.license && server.license !== 'NOASSERTION') {
      safetyAnswer += ` Licensed under ${server.license}.`
    }
  } else {
    safetyAnswer = `${server.name} has ${cveCount} known CVE${cveCount !== 1 ? 's' : ''} tracked by MCPpedia.`
    if (packageName) {
      safetyAnswer += ` You can verify these on OSV.dev by searching for "${packageName}".`
    }
    safetyAnswer += ' Review the Security section above for details before installing.'
  }
  faqs.push({ question: `Is ${server.name} safe to use?`, answer: safetyAnswer })

  // Install FAQ
  const hasInstallConfig = server.install_configs && Object.keys(server.install_configs).length > 0
  let installAnswer: string
  if (hasInstallConfig) {
    installAnswer = `${server.name} supports copy-paste install configs on its MCPpedia page for Claude Desktop, Cursor, and Claude Code. Scroll to the Quick Install section and select your client.`
  } else if (server.npm_package) {
    installAnswer = `Install ${server.name} via npm: \`npx ${server.npm_package}\`. Then add it to your MCP client config file.`
  } else if (server.pip_package) {
    installAnswer = `Install ${server.name} via pip: \`pip install ${server.pip_package}\`. Then configure it in your MCP client.`
  } else {
    installAnswer = `${server.name} can be installed by cloning its GitHub repository and following the setup instructions in the README.`
  }
  faqs.push({ question: `How do I install ${server.name}?`, answer: installAnswer })

  // Capabilities FAQ
  if (toolCount > 0) {
    const toolNames = server.tools.slice(0, 5).map((t) => t.name).join(', ')
    const moreText = toolCount > 5 ? ` and ${toolCount - 5} more` : ''
    faqs.push({
      question: `What can ${server.name} do?`,
      answer: `${server.name} provides ${toolCount} tool${toolCount !== 1 ? 's' : ''}: ${toolNames}${moreText}. See the full tools list on the server page for descriptions and parameters.`,
    })
  }

  // Compatibility FAQ
  const clients = server.compatible_clients && server.compatible_clients.length > 0
    ? server.compatible_clients.join(', ')
    : server.transport?.includes('stdio')
      ? 'Claude Desktop, Cursor, Claude Code, and most MCP clients that support stdio transport'
      : null
  if (clients) {
    faqs.push({
      question: `What AI clients work with ${server.name}?`,
      answer: `${server.name} is compatible with ${clients}. It uses ${server.transport?.join(' and ') || 'stdio'} transport.`,
    })
  }

  // Maintenance FAQ
  if (server.github_last_commit) {
    const daysSince = Math.floor((Date.now() - new Date(server.github_last_commit).getTime()) / 86400000)
    const maintenanceStatus = daysSince < 30 ? 'actively maintained' : daysSince < 90 ? 'recently maintained' : daysSince < 365 ? 'less actively maintained' : 'not actively maintained'
    let maintAnswer = `${server.name} is ${maintenanceStatus} — last commit was ${daysSince} day${daysSince !== 1 ? 's' : ''} ago.`
    if (server.github_stars > 0) {
      maintAnswer += ` It has ${server.github_stars.toLocaleString()} GitHub stars.`
    }
    faqs.push({
      question: `Is ${server.name} actively maintained?`,
      answer: maintAnswer,
    })
  }

  return faqs
}

interface ServerFAQProps {
  faqs: FAQItem[]
}

export default function ServerFAQ({ faqs }: ServerFAQProps) {
  if (faqs.length === 0) return null

  return (
    <section id="faq" className="pt-8 border-t border-border">
      <h2 className="text-lg font-semibold text-text-primary mb-4">Frequently Asked Questions</h2>
      <dl className="space-y-4">
        {faqs.map((faq) => (
          <div key={faq.question}>
            <dt className="text-sm font-medium text-text-primary mb-1">{faq.question}</dt>
            <dd className="text-sm text-text-muted">{faq.answer}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
