import Link from 'next/link'

// Shown by the DB-backed pages when the database is unreachable, in place of
// throwing into app/error.tsx. A generic "Something went wrong" is both less
// honest and less useful than saying which part is down and pointing at the
// parts that still work — the file-based sections of the site (blog, skills,
// guides) have no database dependency and stay up through an outage.
//
// `noindex` matters: these pages are `force-dynamic`, so a crawl during an
// outage would otherwise index a contentful-looking page with no catalog in
// it. React hoists the tag into <head>. It applies only to this render — the
// normal page carries its usual metadata.
export default function LiveDataUnavailable({ title }: { title: string }) {
  return (
    <div className="max-w-lg mx-auto px-4 py-20 text-center">
      <meta name="robots" content="noindex, nofollow" />
      <h1 className="text-xl font-semibold text-text-primary mb-2">{title}</h1>
      <p className="text-text-muted mb-6 text-sm">
        Live catalog data is temporarily unavailable — the database is not
        reachable right now. Nothing has been lost, and this page will fill back
        in on its own once the connection is restored.
      </p>
      <p className="text-text-muted text-sm">
        Still available in the meantime:{' '}
        <Link href="/blog" className="text-accent hover:underline">Blog</Link>,{' '}
        <Link href="/skills" className="text-accent hover:underline">Skills</Link>,{' '}
        <Link href="/get-started" className="text-accent hover:underline">Get Started</Link>,{' '}
        <Link href="/methodology" className="text-accent hover:underline">Methodology</Link>.
      </p>
    </div>
  )
}
