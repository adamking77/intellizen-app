create table if not exists knowledge.health_checks (
  id bigint generated always as identity primary key,
  checked_at timestamptz not null default now(),
  missing_doc_chunks bigint not null,
  chunks_null_embedding bigint not null,
  documents_null_embedding bigint not null,
  status text not null check (status in ('healthy', 'needs_attention')),
  details jsonb not null default '{}'::jsonb
);

create index if not exists health_checks_checked_at_idx
  on knowledge.health_checks (checked_at desc);

create or replace function knowledge.run_health_check()
returns knowledge.health_checks
language plpgsql
security definer
set search_path = knowledge, comms, public, extensions
as $$
declare
  missing_doc_chunks_count bigint;
  chunks_null_embedding_count bigint;
  documents_null_embedding_count bigint;
  check_row knowledge.health_checks;
begin
  select count(*)
  into missing_doc_chunks_count
  from knowledge.documents d
  where d.content is not null
    and not exists (
      select 1
      from knowledge.chunks c
      where c.document_id = d.id
    );

  select count(*)
  into chunks_null_embedding_count
  from knowledge.chunks
  where embedding is null;

  select count(*)
  into documents_null_embedding_count
  from knowledge.documents
  where content is not null
    and embedding is null;

  insert into knowledge.health_checks (
    missing_doc_chunks,
    chunks_null_embedding,
    documents_null_embedding,
    status,
    details
  )
  values (
    missing_doc_chunks_count,
    chunks_null_embedding_count,
    documents_null_embedding_count,
    case
      when missing_doc_chunks_count = 0
        and chunks_null_embedding_count = 0
        and documents_null_embedding_count = 0
      then 'healthy'
      else 'needs_attention'
    end,
    jsonb_build_object(
      'checks', jsonb_build_object(
        'missing_doc_chunks', missing_doc_chunks_count,
        'chunks_null_embedding', chunks_null_embedding_count,
        'documents_null_embedding', documents_null_embedding_count
      )
    )
  )
  returning * into check_row;

  if check_row.status = 'needs_attention' then
    insert into comms.fiona_inbox (
      from_agent,
      task,
      context,
      priority,
      status
    )
    values (
      'intellizen-health-monitor',
      format(
        'Knowledge health check failed: %s documents without chunks, %s chunks without embeddings, %s documents without embeddings.',
        missing_doc_chunks_count,
        chunks_null_embedding_count,
        documents_null_embedding_count
      ),
      jsonb_build_object(
        'type', 'knowledge-health-check',
        'health_check_id', check_row.id,
        'missing_doc_chunks', missing_doc_chunks_count,
        'chunks_null_embedding', chunks_null_embedding_count,
        'documents_null_embedding', documents_null_embedding_count
      ),
      'urgent',
      'pending'
    );
  end if;

  return check_row;
end;
$$;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'knowledge-health-check-daily') then
    perform cron.unschedule('knowledge-health-check-daily');
  end if;
end $$;

select cron.schedule(
  'knowledge-health-check-daily',
  '0 13 * * *',
  $$select knowledge.run_health_check();$$
);
