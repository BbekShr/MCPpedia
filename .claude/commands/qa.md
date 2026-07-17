# QA MCPpedia

Run QA testing across the MCPpedia app — unit tests, build verification, and E2E browser checks.

## Instructions

### Step 1: Run unit tests
Run `npm test` to execute the Vitest test suite. If any tests fail, investigate and fix them before continuing.

### Step 2: Run build
Run `npm run build` to verify no TypeScript or build errors. If the build fails, fix the errors.

### Step 3: Start dev server
Kill any existing dev server on port 3000 (`lsof -ti:3000 | xargs kill -9`), clear the `.next` cache, and start a fresh dev server with `npm run dev` in the background.

### Step 4: E2E browser tests with Playwright MCP
Once the dev server is ready at http://localhost:3000, run through these test scenarios using the Playwright MCP browser tools:

#### 4a. Homepage
- Navigate to http://localhost:3000
- Take a snapshot and verify: heading text, search bar, server cards rendered, no error messages

#### 4b. Search
- Navigate to http://localhost:3000/servers?q=supabase
- Take a snapshot and verify: search results appear, count is NOT "0 servers matching" (if results are visible), filter pills are rendered

#### 4c. Score filter with search
- Navigate to http://localhost:3000/servers?q=supabase&min_score=80
- Take a snapshot and verify: only servers with score >= 80 shown, count matches visible results

#### 4d. Server detail page
- Navigate to http://localhost:3000/s/supabase (or the first server from search results)
- Take a snapshot and verify: server name, score badge, security section, README section all render

#### 4e. Category page
- Navigate to http://localhost:3000/category/developer-tools
- Take a snapshot and verify: servers listed, no archived servers visible (check for "archived" health status)

#### 4f. Blog page
- Navigate to http://localhost:3000/blog
- Take a snapshot and verify: blog posts listed, links work

#### 4g. RSS feed
- Navigate to http://localhost:3000/blog/feed.xml
- Verify: XML content returned, contains <item> elements

#### 4h. robots.txt
- Navigate to http://localhost:3000/robots.txt
- Verify: contains Disallow for /admin, /api/, /auth/, /login

#### 4i. Badge/Widget endpoints
- Navigate to http://localhost:3000/api/badge/supabase
- Verify: SVG content returned
- Navigate to http://localhost:3000/api/widget/supabase
- Verify: SVG content returned

### Step 5: Report
After all checks, produce a summary table:

| Check | Status | Notes |
|-------|--------|-------|
| Unit tests | PASS/FAIL | X tests passed |
| Build | PASS/FAIL | |
| Homepage | PASS/FAIL | |
| Search + count | PASS/FAIL | |
| Score filter | PASS/FAIL | |
| Server detail | PASS/FAIL | |
| Category page | PASS/FAIL | |
| Blog | PASS/FAIL | |
| RSS feed | PASS/FAIL | |
| robots.txt | PASS/FAIL | |
| Badge API | PASS/FAIL | |
| Widget API | PASS/FAIL | |

If any checks fail, list the failures with details on what went wrong.

## Usage
- `/qa` — full QA run (unit tests + build + E2E)
- `/qa quick` — unit tests + build only (no browser)
- `/qa e2e` — browser tests only (assumes dev server running)
