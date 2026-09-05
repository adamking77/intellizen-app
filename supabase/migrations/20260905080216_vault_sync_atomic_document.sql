-- Local vault maintenance only. No table layout or client permissions change.
-- The caller prepares every embedding before entering this transaction.
create or replace function public.sync_vault_document_v1(
  p_document jsonb, p_chunks jsonb, p_id bigint default null,
  p_expected_updated_at timestamptz default null
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  current_doc knowledge.documents%rowtype;
  saved knowledge.documents%rowtype;
  path text := p_document->>'source_path';
  item jsonb;
begin
  if path is null or path = '' or path like '/%' or path ~ '(^|/)\.\.(/|$)' then
    raise exception 'A safe vault-relative source path is required';
  end if;
  if coalesce(jsonb_typeof(p_document->'embedding'),'null') <> 'array'
     or jsonb_array_length(p_document->'embedding') <> 1536
     or coalesce(jsonb_typeof(p_chunks),'null') <> 'array' or jsonb_array_length(p_chunks) = 0 then
    raise exception 'Complete document and chunk embeddings are required';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(lower(path), 0));
  if p_id is not null then
    select * into current_doc from knowledge.documents where id=p_id for update;
    if not found or current_doc.updated_at is distinct from p_expected_updated_at then
      raise exception 'Document changed remotely; refresh before retrying' using errcode='40001';
    end if;
    if coalesce((current_doc.metadata->>'vault_external')::boolean,false)
       or current_doc.document_type='kindle_highlight' then
      raise exception 'External documents cannot be changed by vault sync';
    end if;
  end if;
  if exists(select 1 from knowledge.documents where lower(source_path)=lower(path) and id is distinct from p_id) then
    raise exception 'Source path already has a document; reconcile its identity first';
  end if;
  if p_id is null then
    insert into knowledge.documents(title,source_path,document_type,domain,content,embedding,metadata)
    values(p_document->>'title',path,p_document->>'document_type',p_document->>'domain',
      p_document->>'content',(p_document->'embedding')::text::extensions.vector,
      coalesce(p_document->'metadata','{}'::jsonb)) returning * into saved;
  else
    update knowledge.documents set source_path=path, content=p_document->>'content',
      embedding=(p_document->'embedding')::text::extensions.vector,
      metadata=coalesce(metadata,'{}'::jsonb)||coalesce(p_document->'metadata','{}'::jsonb),
      updated_at=clock_timestamp()
    where id=p_id returning * into saved;
  end if;
  -- Replacement is transactional: any bad chunk rolls back the document too.
  delete from knowledge.chunks where document_id=saved.id;
  for item in select value from jsonb_array_elements(p_chunks) loop
    if coalesce(jsonb_typeof(item->'embedding'),'null') <> 'array' or jsonb_array_length(item->'embedding') <> 1536
       or coalesce(item->>'content','')='' then raise exception 'Incomplete chunk'; end if;
    insert into knowledge.chunks(document_id,chunk_index,content,embedding)
    values(saved.id,(item->>'chunk_index')::integer,item->>'content',(item->'embedding')::text::extensions.vector);
  end loop;
  return jsonb_build_object('id',saved.id,'updated_at',saved.updated_at,'source_path',saved.source_path);
end $$;
revoke all on function public.sync_vault_document_v1(jsonb,jsonb,bigint,timestamptz) from public,anon,authenticated;
grant execute on function public.sync_vault_document_v1(jsonb,jsonb,bigint,timestamptz) to service_role;
