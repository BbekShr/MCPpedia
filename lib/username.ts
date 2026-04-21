// Username validation rules, shared between the onboarding form (/welcome),
// the API route (/api/username), and the SQL CHECK constraint on profiles.
// Keep the regex here in sync with the constraint in migration
// 20260421020000_username_rules.sql.

export const USERNAME_MIN_LENGTH = 3
export const USERNAME_MAX_LENGTH = 30

// Allowed: lowercase letters, digits, underscore, hyphen.
// Must start with a letter or digit (no leading _ or -).
// Must end with a letter or digit (no trailing _ or -).
// No consecutive separators (no __, --, _-, -_).
const USERNAME_REGEX = /^[a-z0-9](?:[a-z0-9]|[_-](?=[a-z0-9])){1,29}$/

// Routes, account keywords, and identities users must not be able to claim.
// Keep in alphabetical order, all lowercase.
const RESERVED_USERNAMES: ReadonlySet<string> = new Set([
  'about', 'account', 'admin', 'administrator', 'analytics', 'api', 'assets',
  'auth', 'badge', 'blog', 'bot', 'bots', 'callback', 'category', 'claude',
  'compare', 'contact', 'contributor', 'dashboard', 'delete', 'discuss',
  'docs', 'edit', 'editor', 'favicon', 'help', 'home', 'images', 'legal',
  'login', 'logout', 'maintainer', 'manifest', 'mcp', 'mcppedia', 'me',
  'methodology', 'moderator', 'new', 'null', 'official', 'owner', 'privacy',
  'profile', 'public', 'register', 'report', 'robots', 'root', 'security',
  'server', 'servers', 'settings', 'signin', 'signout', 'signup', 'site',
  'sitemap', 'static', 'staff', 'submit', 'support', 'system', 'team',
  'terms', 'undefined', 'user', 'users', 'verify', 'webhook', 'welcome',
  'www',
])

export type UsernameValidation =
  | { ok: true; normalized: string }
  | { ok: false; reason: string }

export function validateUsername(raw: string): UsernameValidation {
  if (typeof raw !== 'string') {
    return { ok: false, reason: 'Username is required.' }
  }
  const candidate = raw.trim().toLowerCase()
  if (candidate.length === 0) {
    return { ok: false, reason: 'Username is required.' }
  }
  if (candidate.length < USERNAME_MIN_LENGTH) {
    return { ok: false, reason: `Must be at least ${USERNAME_MIN_LENGTH} characters.` }
  }
  if (candidate.length > USERNAME_MAX_LENGTH) {
    return { ok: false, reason: `Must be at most ${USERNAME_MAX_LENGTH} characters.` }
  }
  if (!USERNAME_REGEX.test(candidate)) {
    return {
      ok: false,
      reason: 'Use letters, numbers, hyphens, and underscores. Must start and end with a letter or number, no doubled separators.',
    }
  }
  if (RESERVED_USERNAMES.has(candidate)) {
    return { ok: false, reason: 'That username is reserved.' }
  }
  return { ok: true, normalized: candidate }
}

export function isReservedUsername(value: string): boolean {
  return RESERVED_USERNAMES.has(value.toLowerCase())
}
