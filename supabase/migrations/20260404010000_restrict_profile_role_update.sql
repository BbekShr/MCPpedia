-- Prevent users from escalating their own role via profile UPDATE.
-- Drop the permissive policy and replace with one that excludes the role column.

DROP POLICY IF EXISTS "Users can update own profile" ON profiles;

-- Users can update their own profile, but CANNOT change role or created_at.
CREATE POLICY "Users can update own profile except role"
  ON profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    AND role = (SELECT role FROM profiles WHERE id = auth.uid())
    AND created_at = (SELECT created_at FROM profiles WHERE id = auth.uid())
  );

-- Admins can update any profile (including role changes).
CREATE POLICY "Admins can update any profile"
  ON profiles FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Admins/maintainers can update servers (for verify, archive, approve edits, etc.)
CREATE POLICY "Admins can update servers"
  ON servers FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'maintainer'))
  );

-- Admins/maintainers can update edits (approve/reject)
CREATE POLICY "Admins can update edits"
  ON edits FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'maintainer'))
  );
