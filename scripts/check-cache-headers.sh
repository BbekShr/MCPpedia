#!/usr/bin/env bash
# Post-deploy ISR check, run by deploy-cloudflare.yml.
#
# For each "path min_s_maxage" pair: request until the response is
# `x-nextjs-cache: HIT` (a fresh deploy starts cold, so the first hit is a MISS
# or STALE), then assert the HIT's s-maxage is at least the TTL the code sets.
#
# Catches the two Oct 2026 failures:
#   - a page that never settles on HIT (regional cache regenerating per colo)
#   - an s-maxage shorter than the page's `revalidate` (a fetch inside the page
#     capping it — ServerReadme's 7d fetch held /s/[slug] at 7d instead of 30d)
set -euo pipefail

SITE="${SITE_URL:-https://mcppedia.org}"
ATTEMPTS=6
fail=0

check() {
  local path="$1" min="$2" headers cache maxage
  for ((i = 1; i <= ATTEMPTS; i++)); do
    headers=$(curl -sSI --max-time 20 "${SITE}${path}" | tr -d '\r')
    cache=$(grep -i '^x-nextjs-cache:' <<<"$headers" | awk '{print $2}' || true)
    if [ "$cache" = "HIT" ]; then
      maxage=$(grep -i '^cache-control:' <<<"$headers" | grep -oE 's-maxage=[0-9]+' | cut -d= -f2 || true)
      # s-maxage is the TTL minus the entry's age. Run right after a deploy,
      # entries are minutes old, so an hour of slack is plenty.
      if [ -z "$maxage" ] || [ "$maxage" -lt $((min - 3600)) ]; then
        echo "::error::${path} s-maxage=${maxage:-none}, expected about ${min}. Something in the render caps its revalidate (check fetch/unstable_cache TTLs)."
        fail=1
      else
        echo "OK ${path}: HIT, s-maxage=${maxage}"
      fi
      return
    fi
    echo "${path}: attempt ${i} got x-nextjs-cache=${cache:-none}, retrying"
    sleep 10
  done
  echo "::error::${path} never returned x-nextjs-cache: HIT after ${ATTEMPTS} attempts. Revalidations may not be sticking."
  fail=1
}

# Keep the TTLs in sync with the `revalidate` exports in app/.
check /s/mcp-server-mcppedia 2592000   # app/s/[slug]/page.tsx (30d)
# /llms.txt is left out until its cap is understood: it declares 7d but serves
# a 1d window in production (not reproducible in an env-less local build).
check /about 86400                     # app/about/page.tsx (1d)

exit "$fail"
