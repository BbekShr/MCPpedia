-- ============================================
-- TOOL POISONING DETECTION
-- Track tool poisoning indicators and definition hashes for rug-pull detection
-- ============================================

ALTER TABLE servers
  ADD COLUMN has_tool_poisoning boolean DEFAULT false,
  ADD COLUMN tool_poisoning_flags text[] DEFAULT '{}',
  ADD COLUMN tool_definition_hash text;
