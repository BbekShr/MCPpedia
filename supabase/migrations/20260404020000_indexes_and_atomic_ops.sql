-- =====================================================================
-- 1. Missing indexes for common query patterns
-- =====================================================================

-- discussions rate-limit check: .eq('user_id', user.id).gte('created_at', dayAgo)
CREATE INDEX IF NOT EXISTS discussions_user_id_idx ON discussions (user_id);
CREATE INDEX IF NOT EXISTS discussions_user_created_idx ON discussions (user_id, created_at DESC);

-- health_checks uptime calculation: .eq('server_id', ...).order('checked_at', desc)
CREATE INDEX IF NOT EXISTS health_checks_server_time_idx ON health_checks (server_id, checked_at DESC);

-- votes recount: .eq('discussion_id', ...).eq('value', ...)
CREATE INDEX IF NOT EXISTS votes_discussion_value_idx ON votes (discussion_id, value);


-- =====================================================================
-- 2. Atomic vote + recount (eliminates TOCTOU race condition)
-- =====================================================================

CREATE OR REPLACE FUNCTION vote_and_recount(
  p_user_id uuid,
  p_discussion_id uuid,
  p_value int
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_existing int;
  v_net int;
BEGIN
  -- Reject if caller is not the user they claim to be
  IF auth.uid() IS NULL OR auth.uid() != p_user_id THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Check existing vote
  SELECT value INTO v_existing
    FROM votes
   WHERE user_id = p_user_id AND discussion_id = p_discussion_id;

  IF FOUND THEN
    IF v_existing = p_value THEN
      -- Toggle off: same value = remove vote
      DELETE FROM votes
       WHERE user_id = p_user_id AND discussion_id = p_discussion_id;
    ELSE
      -- Change vote direction
      UPDATE votes SET value = p_value
       WHERE user_id = p_user_id AND discussion_id = p_discussion_id;
    END IF;
  ELSE
    -- New vote
    INSERT INTO votes (user_id, discussion_id, value)
    VALUES (p_user_id, p_discussion_id, p_value);
  END IF;

  -- Recount atomically in the same transaction
  SELECT COALESCE(SUM(value), 0) INTO v_net
    FROM votes
   WHERE discussion_id = p_discussion_id;

  UPDATE discussions SET upvotes = v_net WHERE id = p_discussion_id;

  RETURN v_net;
END;
$$;


-- =====================================================================
-- 3. Atomic community verify toggle + recount
-- =====================================================================

CREATE OR REPLACE FUNCTION toggle_community_verify(
  p_user_id uuid,
  p_server_id uuid,
  p_threshold int DEFAULT 3
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_existed boolean;
  v_count int;
  v_verified boolean;
BEGIN
  -- Reject if caller is not the user they claim to be
  IF auth.uid() IS NULL OR auth.uid() != p_user_id THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Check if already verified by this user
  IF EXISTS (
    SELECT 1 FROM community_verifications
     WHERE user_id = p_user_id AND server_id = p_server_id
  ) THEN
    -- Remove
    DELETE FROM community_verifications
     WHERE user_id = p_user_id AND server_id = p_server_id;
    v_existed := true;
  ELSE
    -- Add
    INSERT INTO community_verifications (user_id, server_id)
    VALUES (p_user_id, p_server_id);
    v_existed := false;
  END IF;

  -- Recount atomically
  SELECT COUNT(*) INTO v_count
    FROM community_verifications
   WHERE server_id = p_server_id;

  v_verified := v_count >= p_threshold;

  UPDATE servers
     SET community_verification_count = v_count,
         community_verified = v_verified
   WHERE id = p_server_id;

  RETURN jsonb_build_object(
    'count', v_count,
    'verified', v_verified,
    'user_verified', NOT v_existed
  );
END;
$$;
