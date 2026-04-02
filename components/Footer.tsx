import Link from 'next/link'

export default function Footer() {
  return (
    <footer className="border-t border-border bg-bg-secondary mt-auto">
      <div className="max-w-[1200px] mx-auto px-4 py-8">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="text-sm text-text-muted">
            MCPpedia is a free, community-maintained encyclopedia.
          </div>
          <div className="flex items-center gap-4 text-sm">
            <Link href="/submit" className="text-text-muted hover:text-text-primary transition-colors duration-150">
              Contribute
            </Link>
            <Link href="/about" className="text-text-muted hover:text-text-primary transition-colors duration-150">
              About
            </Link>
            <a
              href="https://github.com/mcppedia/mcppedia"
              target="_blank"
              rel="noopener noreferrer"
              className="text-text-muted hover:text-text-primary transition-colors duration-150"
            >
              GitHub
            </a>
          </div>
        </div>
      </div>
    </footer>
  )
}
