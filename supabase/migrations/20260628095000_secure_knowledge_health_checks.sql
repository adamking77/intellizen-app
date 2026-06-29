revoke all privileges on table knowledge.health_checks from anon;
revoke all privileges on table knowledge.health_checks from authenticated;

grant select on table knowledge.health_checks to authenticated;
grant all privileges on table knowledge.health_checks to service_role;

alter table knowledge.health_checks enable row level security;

drop policy if exists "Authenticated can read health checks" on knowledge.health_checks;
drop policy if exists "Service role can manage health checks" on knowledge.health_checks;

create policy "Authenticated can read health checks"
on knowledge.health_checks
for select
to authenticated
using (true);

create policy "Service role can manage health checks"
on knowledge.health_checks
for all
to service_role
using (true)
with check (true);

revoke execute on function knowledge.run_health_check() from public;
revoke execute on function knowledge.run_health_check() from anon;
revoke execute on function knowledge.run_health_check() from authenticated;

grant execute on function knowledge.run_health_check() to service_role;
