-- =====================================================================
-- Security hardening: RLS policy fixes + SECURITY DEFINER search_path
-- =====================================================================


-- =====================================================================
-- 1. servers INSERT — pin trust-sensitive columns to safe defaults
-- =====================================================================

DROP POLICY IF EXISTS "Authed users can insert servers" ON servers;

CREATE POLICY "Authed users can insert servers"
  ON servers FOR INSERT
  WITH CHECK (
    auth.uid() = submitted_by
    AND verified = false
    AND publisher_verified = false
    AND author_type = 'community'
    AND score_total = 0
    AND claimed_by IS NULL
  );


-- =====================================================================
-- 2. edits INSERT — prevent self-approval farming
-- =====================================================================

DROP POLICY IF EXISTS "Authed users can propose edits" ON edits;

CREATE POLICY "Authed users can propose edits"
  ON edits FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND status = 'pending'
  );


-- =====================================================================
-- 3. discussions UPDATE — add WITH CHECK to prevent self-vote inflation
--    and user_id/server_id reassignment
-- =====================================================================

DROP POLICY IF EXISTS "Users can update own discussions" ON discussions;

CREATE POLICY "Users can update own discussions"
  ON discussions FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);


-- =====================================================================
-- 4. profiles UPDATE — freeze karma and counter columns
-- =====================================================================

DROP POLICY IF EXISTS "Users can update own profile" ON profiles;

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    AND role = (SELECT role FROM profiles WHERE id = auth.uid())
    AND created_at = (SELECT created_at FROM profiles WHERE id = auth.uid())
    AND karma = (SELECT karma FROM profiles WHERE id = auth.uid())
    AND edits_approved = (SELECT edits_approved FROM profiles WHERE id = auth.uid())
    AND servers_submitted = (SELECT servers_submitted FROM profiles WHERE id = auth.uid())
    AND discussions_count = (SELECT discussions_count FROM profiles WHERE id = auth.uid())
  );


-- =====================================================================
-- 5. publisher_claims INSERT — prevent self-verification
-- =====================================================================

DROP POLICY IF EXISTS "Authed users can submit claims" ON publisher_claims;

CREATE POLICY "Authed users can submit claims"
  ON publisher_claims FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND verified = false
    AND verified_by IS NULL
    AND verified_at IS NULL
  );


-- =====================================================================
-- 6. SECURITY DEFINER functions — pin search_path to prevent schema injection
-- =====================================================================

CREATE OR REPLACE FUNCTION vote_and_recount(
  p_user_id uuid,
  p_discussion_id uuid,
  p_value int
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing int;
  v_net int;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() != p_user_id THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT value INTO v_existing
    FROM votes
   WHERE user_id = p_user_id AND discussion_id = p_discussion_id;

  IF FOUND THEN
    IF v_existing = p_value THEN
      DELETE FROM votes
       WHERE user_id = p_user_id AND discussion_id = p_discussion_id;
    ELSE
      UPDATE votes SET value = p_value
       WHERE user_id = p_user_id AND discussion_id = p_discussion_id;
    END IF;
  ELSE
    INSERT INTO votes (user_id, discussion_id, value)
    VALUES (p_user_id, p_discussion_id, p_value);
  END IF;

  SELECT COALESCE(SUM(value), 0) INTO v_net
    FROM votes
   WHERE discussion_id = p_discussion_id;

  UPDATE discussions SET upvotes = v_net WHERE id = p_discussion_id;

  RETURN v_net;
END;
$$;


CREATE OR REPLACE FUNCTION increment_mcp_usage(p_date date, p_action text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO mcp_api_usage (usage_date, action, count)
  VALUES (p_date, p_action, 1)
  ON CONFLICT (usage_date, action)
  DO UPDATE SET count = mcp_api_usage.count + 1;
END;
$$;


CREATE OR REPLACE FUNCTION toggle_community_verify(
  p_user_id uuid,
  p_server_id uuid,
  p_threshold int DEFAULT 3
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existed boolean;
  v_count int;
  v_verified boolean;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() != p_user_id THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF EXISTS (
    SELECT 1 FROM community_verifications
     WHERE user_id = p_user_id AND server_id = p_server_id
  ) THEN
    DELETE FROM community_verifications
     WHERE user_id = p_user_id AND server_id = p_server_id;
    v_existed := true;
  ELSE
    INSERT INTO community_verifications (user_id, server_id)
    VALUES (p_user_id, p_server_id);
    v_existed := false;
  END IF;

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
