-- Tighten admin/maintainer UPDATE policies with WITH CHECK.
-- This prevents drift: an admin/maintainer can still UPDATE servers, but the
-- policy now explicitly re-asserts the role on both sides of the transition,
-- preventing a compromised admin session from changing their own role in a
-- single round-trip and preventing a stale session from bypassing role checks.

DROP POLICY IF EXISTS "Admins can update any profile" ON profiles;
CREATE POLICY "Admins can update any profile"
  ON profiles FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    AND role IN ('contributor', 'editor', 'maintainer', 'admin')
  );

DROP POLICY IF EXISTS "Admins can update servers" ON servers;
CREATE POLICY "Admins can update servers"
  ON servers FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'maintainer'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'maintainer'))
  );

DROP POLICY IF EXISTS "Admins can update edits" ON edits;
CREATE POLICY "Admins can update edits"
  ON edits FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('editor', 'admin', 'maintainer'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('editor', 'admin', 'maintainer'))
    AND status IN ('approved', 'rejected')
  );
