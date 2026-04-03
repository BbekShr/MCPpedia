-- Track whether security scans succeeded or failed
-- so we can distinguish "0 CVEs" from "scan failed"
alter table servers add column if not exists security_scan_status text default 'pending'
  check (security_scan_status in ('success', 'failed', 'pending'));
