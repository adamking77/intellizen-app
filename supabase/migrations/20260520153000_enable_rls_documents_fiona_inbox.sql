-- Close remaining advisory gaps for vault documents and Fiona/Hermes inbox.
-- No policies are added: anon/publishable keys see no rows and cannot write.
-- Local desktop/server consumers must use service_role.

alter table public.documents   enable row level security;
alter table public.fiona_inbox enable row level security;
