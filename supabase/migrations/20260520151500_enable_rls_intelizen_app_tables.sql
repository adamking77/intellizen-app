-- Enable RLS on IntelliZen-owned app tables for service_role-only access.
-- No policies are added: anon/publishable keys see no rows and cannot write.
-- The local desktop app now uses the service_role key in .env.local.
--
-- Excluded deliberately:
-- - GenZen Brain tables: documents, chunks, cases, decisions, config, taste_preferences
-- - Hermes/Fiona inbox tables; see the follow-up migration after service_role usage was confirmed

alter table public.canvas_documents      enable row level security;
alter table public.graph_edges           enable row level security;
alter table public.graph_nodes           enable row level security;
alter table public.intel_signals         enable row level security;
alter table public.investigation_signals enable row level security;
alter table public.investigations        enable row level security;
alter table public.monitors              enable row level security;
alter table public.operations            enable row level security;
alter table public.project_signals       enable row level security;
alter table public.projects              enable row level security;
alter table public.vault_files           enable row level security;
alter table public.workspace_databases   enable row level security;
alter table public.workspace_nodes       enable row level security;
alter table public.workspace_records     enable row level security;
alter table public.workspace_views       enable row level security;
