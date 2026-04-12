with ranked as (
  select
    id,
    url,
    status,
    first_value(id) over (partition by url order by id) as canonical_id,
    row_number() over (partition by url order by id) as row_num
  from intel_signals
),
duplicate_links as (
  select
    ps.project_id,
    ranked.canonical_id as signal_id,
    ps.notes,
    ps.added_at
  from project_signals ps
  join ranked on ranked.id = ps.signal_id
  where ranked.row_num > 1
)
insert into project_signals (project_id, signal_id, notes, added_at)
select project_id, signal_id, notes, added_at
from duplicate_links
on conflict (project_id, signal_id) do nothing;

with ranked as (
  select
    id,
    url,
    first_value(id) over (partition by url order by id) as canonical_id,
    row_number() over (partition by url order by id) as row_num
  from intel_signals
)
delete from project_signals ps
using ranked
where ps.signal_id = ranked.id
  and ranked.row_num > 1;

with ranked as (
  select
    id,
    url,
    status,
    first_value(id) over (partition by url order by id) as canonical_id
  from intel_signals
),
status_rollup as (
  select
    canonical_id,
    bool_or(status = 'saved') as has_saved,
    bool_or(status = 'new') as has_new
  from ranked
  group by canonical_id
)
update intel_signals canonical
set status = case
  when status_rollup.has_saved then 'saved'
  when status_rollup.has_new then 'new'
  else 'dismissed'
end
from status_rollup
where canonical.id = status_rollup.canonical_id;

with ranked as (
  select
    id,
    url,
    first_value(id) over (partition by url order by id) as canonical_id,
    row_number() over (partition by url order by id) as row_num
  from intel_signals
)
delete from intel_signals
using ranked
where intel_signals.id = ranked.id
  and ranked.row_num > 1;

create unique index if not exists intel_signals_url_uidx on intel_signals (url);

update monitors
set signal_count = coalesce((
  select count(*)
  from intel_signals
  where intel_signals.monitor_id = monitors.id
), 0);
