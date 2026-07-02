-- Near-instant chat: push fiona_inbox inserts/updates to the app over
-- Supabase Realtime instead of waiting for the next poll.
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end
$$;

alter publication supabase_realtime add table comms.fiona_inbox;
