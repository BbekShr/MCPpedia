#!/usr/bin/env bash
# Post-deploy ISR check, run by deploy-cloudflare.yml (or by hand: `bash
# scripts/check-cache-headers.sh` from any machine Cloudflare does not challenge).
#
# For each "path min_s_maxage" pair: request until the response is
# `x-nextjs-cache: HIT` (a fresh deploy starts cold, so the first hit is a MISS
# or STALE), assert the HIT's s-maxage is at least the TTL the code sets, then
# keep sampling to prove the entry holds.
#
# Catches the two Oct 2026 failures:
#   - a page that keeps regenerating. One HIT is not proof it settled: during
#     the per-colo churn a page alternated STALE/HIT, so a loop that stopped at
#     the first HIT passed. After the HIT, every follow-up sample must also be a
#     HIT and its s-maxage must not go UP (it only rises when the entry was
#     rewritten, i.e. regenerated, between two requests seconds apart).
#   - an s-maxage shorter than the page's `revalidate` (a fetch inside the page
#     capping it — ServerReadme's 7d fetch held /s/[slug] at 7d instead of 30d)
#
# Exit codes: 0 pass, 1 an ISR assertion failed, 2 the site could not be
# measured (Cloudflare challenged the client, non-200, network error). 2 is not
# an ISR verdict either way.
#
# GitHub-hosted runners are datacenter IPs and Cloudflare answers them with a
# 403 `cf-mitigated: challenge` page, which carries no Next headers at all. Set
# ISR_CHECK_HEADER ("Name: value") to a header a zone WAF skip rule exempts.
set -uo pipefail

SITE="${SITE_URL:-https://mcppedia.org}"
ATTEMPTS=6         # to reach the first HIT, 10s apart
HOLD_SAMPLES=3     # follow-up HITs required after the first, 5s apart
# How far below the TTL a HIT's s-maxage may sit (= the entry's age). Right
# after a deploy entries are minutes old, so an hour is plenty; raise it when
# running the check long after a deploy.
SLACK="${ISR_MAX_AGE_SLACK:-3600}"
fail=0
unmeasurable=0

curl_args=(-sS --max-time 20 -o /dev/null -D -)
if [ -n "${ISR_CHECK_HEADER:-}" ]; then
  curl_args+=(-H "$ISR_CHECK_HEADER")
fi

# Sets globals: headers status cache maxage. Returns 1 if the response is not
# something this check can judge (and prints why, with every header).
fetch() {
  local path="$1"
  headers=$(curl "${curl_args[@]}" "${SITE}${path}" 2>&1 | tr -d '\r') || true
  status=$(awk 'NR==1 && /^HTTP/ {print $2}' <<<"$headers")
  cache=$(grep -i '^x-nextjs-cache:' <<<"$headers" | awk '{print $2}' || true)
  maxage=$(grep -i '^cache-control:' <<<"$headers" | grep -oE 's-maxage=[0-9]+' | cut -d= -f2 || true)
  if [ "$status" = "200" ]; then
    return 0
  fi
  if grep -qi '^cf-mitigated: *challenge' <<<"$headers"; then
    echo "::warning::${path}: Cloudflare served a bot challenge (HTTP ${status:-?}, cf-mitigated: challenge), not the Worker's response. This is not an ISR result. Run the check from an unchallenged network or set ISR_CHECK_HEADER for a WAF skip rule."
  else
    echo "::error::${path}: expected HTTP 200, got ${status:-no response}."
  fi
  echo "--- full response headers for ${path} ---"
  echo "$headers"
  echo "---"
  return 1
}

check() {
  local path="$1" min="$2" prev
  for ((i = 1; i <= ATTEMPTS; i++)); do
    if ! fetch "$path"; then
      unmeasurable=1
      return
    fi
    if [ "$cache" = "HIT" ]; then
      break
    fi
    echo "${path}: attempt ${i} got x-nextjs-cache=${cache:-none}, retrying"
    if [ "$i" -eq "$ATTEMPTS" ]; then
      echo "::error::${path} never returned x-nextjs-cache: HIT after ${ATTEMPTS} attempts. Revalidations may not be sticking."
      echo "--- last response headers ---"; echo "$headers"; echo "---"
      fail=1
      return
    fi
    sleep 10
  done

  # s-maxage is the TTL minus the entry's age.
  if [ -z "$maxage" ] || [ "$maxage" -lt $((min - SLACK)) ]; then
    echo "::error::${path} s-maxage=${maxage:-none}, expected about ${min}. Something in the render caps its revalidate (check fetch/unstable_cache TTLs)."
    echo "--- response headers ---"; echo "$headers"; echo "---"
    fail=1
    return
  fi
  echo "${path}: HIT, s-maxage=${maxage}; checking it holds"

  prev="$maxage"
  for ((j = 1; j <= HOLD_SAMPLES; j++)); do
    sleep 5
    if ! fetch "$path"; then
      unmeasurable=1
      return
    fi
    # +2s of slack for clock skew between isolates; a regeneration resets the
    # age to ~0, which raises s-maxage by at least the 5s between samples.
    if [ "$cache" != "HIT" ] || [ -z "$maxage" ] || [ "$maxage" -gt $((prev + 2)) ]; then
      echo "::error::${path} did not hold after its first HIT: sample ${j} got x-nextjs-cache=${cache:-none}, s-maxage=${maxage:-none} (previous ${prev}). The entry is regenerating between requests seconds apart."
      echo "--- response headers ---"; echo "$headers"; echo "---"
      fail=1
      return
    fi
    prev="$maxage"
  done
  echo "OK ${path}: held HIT for ${HOLD_SAMPLES} more samples, s-maxage=${maxage}"
}

# Keep the TTLs in sync with the `revalidate` exports in app/.
# A slug from generateStaticParams' top 50 (by stars), so the deploy writes its
# entry and every isolate knows its 30d TTL from the prerender manifest. Pages
# outside the top 50 are rendered at runtime, and an isolate that has not
# rendered one yet treats its TTL as 1s (Next's calculateRevalidate default),
# so they flip STALE/HIT for a while after a deploy. That is a separate,
# known issue; checking one here would turn every deploy red.
check /s/playwright-mcp 2592000        # app/s/[slug]/page.tsx (30d)
# /llms.txt is left out until its cap is understood: it declares 7d but serves
# a 1d window in production (not reproducible in an env-less local build).
check /about 86400                     # app/about/page.tsx (1d)

if [ "$fail" -ne 0 ]; then
  exit 1
fi
if [ "$unmeasurable" -ne 0 ]; then
  exit 2
fi
exit 0
