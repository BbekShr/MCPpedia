-- Add the unique constraint that the flag API's duplicate check (error code 23505) expects.
-- Without this, users can submit unlimited duplicate flags for the same target.
ALTER TABLE flags
  ADD CONSTRAINT flags_user_target_unique UNIQUE (user_id, target_type, target_id);
