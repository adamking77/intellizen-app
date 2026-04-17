-- Rework investigations to 3-phase workflow
-- Brief / Collect / Analyse (replaces 6-phase Plan/Collect/Collate/Timeline/ACH/Report)

alter table investigations
  add column if not exists use_case text not null default 'scoping'
    check (use_case in ('scoping', 'post', 'sit_rep')),
  add column if not exists scope_notes text,
  add column if not exists humint_input text;

-- Add 'analysis' to allowed vault file types
alter table vault_files drop constraint vault_files_file_type_check;
alter table vault_files add constraint vault_files_file_type_check
  check (file_type in (
    'plan', 'collect', 'collate', 'timeline', 'ach', 'report',
    'sweep', 'assessment', 'brief', 'analysis'
  ));
