-- Replace overly-permissive "Anyone can read bot runs" with role-restricted access.
-- The anon/public key should not be able to read bot run history, which can include
-- error_message fields containing API paths, schema info, and other internal details.

DROP POLICY IF EXISTS "Anyone can read bot runs" ON bot_runs;

CREATE POLICY "Maintainers and admins can read bot runs"
  ON bot_runs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
       WHERE profiles.id = auth.uid()
         AND profiles.role IN ('maintainer', 'admin')
    )
  );
