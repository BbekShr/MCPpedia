-- ============================================
-- EXPANDED SECURITY SCORING
-- Store computed evidence as JSONB + queryable flags
-- ============================================

-- Evidence array — UI renders this directly
alter table servers
  add column security_evidence jsonb default '[]';

-- Queryable flags for filtering/search
alter table servers
  add column has_code_execution boolean default false,
  add column has_injection_risk boolean default false,
  add column dangerous_pattern_count integer default 0,
  add column dep_health_score integer,
  add column dependency_count integer;
