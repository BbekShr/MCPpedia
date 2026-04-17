-- Durable, cross-instance rate limiter backed by Postgres.
-- The previous in-memory Map in lib/rate-limit.ts reset on every cold start
-- and didn't share state across Vercel lambdas — so limits were trivially
-- bypassed. This migration adds a single table + a SECURITY DEFINER function
-- that implements an atomic fixed-window counter.

CREATE TABLE IF NOT EXISTS rate_limits (
  key text PRIMARY KEY,
  count int NOT NULL DEFAULT 0,
  reset_at timestamptz NOT NULL
);

-- Index for the periodic cleanup sweep.
CREATE INDEX IF NOT EXISTS rate_limits_reset_at_idx ON rate_limits (reset_at);

-- Lock the table down: only service-role reads/writes it. The function below
-- runs as SECURITY DEFINER so anon/authenticated callers can invoke it via
-- RPC without needing direct table access.
ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;

-- No policies = anon/authenticated can't touch rows directly. The function
-- bypasses RLS because it's SECURITY DEFINER + owned by postgres.

-- Atomic check-and-increment. Returns true if the caller is under the limit
-- (and increments the counter), false if they've exceeded it.
--
-- `p_key`    — the bucket key (e.g. 'ip:1.2.3.4:submit' or 'user:<uuid>:vote')
-- `p_limit`  — max requests allowed in the window
-- `p_window_ms` — window length in milliseconds
CREATE OR REPLACE FUNCTION check_rate_limit(
  p_key text,
  p_limit int,
  p_window_ms int
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now timestamptz := now();
  v_row rate_limits%ROWTYPE;
  v_reset_at timestamptz;
BEGIN
  -- Try to UPDATE an existing, unexpired row atomically.
  UPDATE rate_limits
  SET count = count + 1
  WHERE key = p_key
    AND reset_at > v_now
    AND count < p_limit
  RETURNING * INTO v_row;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'allowed', true,
      'remaining', p_limit - v_row.count,
      'reset_at', v_row.reset_at
    );
  END IF;

  -- No match: either the row is missing, expired, or over-limit.
  -- Try to INSERT a fresh row; if that conflicts with an over-limit row,
  -- check whether it's expired and reset or reject.
  v_reset_at := v_now + (p_window_ms || ' milliseconds')::interval;

  INSERT INTO rate_limits (key, count, reset_at)
  VALUES (p_key, 1, v_reset_at)
  ON CONFLICT (key) DO UPDATE
    SET count = CASE
      WHEN rate_limits.reset_at <= v_now THEN 1  -- expired: restart window
      ELSE rate_limits.count + 1                  -- still in window
    END,
    reset_at = CASE
      WHEN rate_limits.reset_at <= v_now THEN v_reset_at
      ELSE rate_limits.reset_at
    END
  RETURNING * INTO v_row;

  IF v_row.count > p_limit THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'remaining', 0,
      'retry_after', GREATEST(1, EXTRACT(EPOCH FROM (v_row.reset_at - v_now))::int)
    );
  END IF;

  RETURN jsonb_build_object(
    'allowed', true,
    'remaining', p_limit - v_row.count,
    'reset_at', v_row.reset_at
  );
END;
$$;

-- Allow anon + authenticated to invoke (but not read the table directly).
REVOKE ALL ON FUNCTION check_rate_limit(text, int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION check_rate_limit(text, int, int) TO anon, authenticated;

-- Periodic cleanup: delete rows whose window has ended. Call this from a
-- cron or occasional sweep; nothing breaks if it never runs (rows are just
-- orphaned, but the atomic function handles expired rows correctly).
CREATE OR REPLACE FUNCTION cleanup_rate_limits() RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted int;
BEGIN
  DELETE FROM rate_limits WHERE reset_at < now() - interval '1 hour';
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION cleanup_rate_limits() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION cleanup_rate_limits() TO service_role;
