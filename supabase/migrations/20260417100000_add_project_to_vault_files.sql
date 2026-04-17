-- Allow vault_files to belong to either an investigation (case_id) or a project (project_id)

-- Make case_id nullable
ALTER TABLE vault_files ALTER COLUMN case_id DROP NOT NULL;

-- Add optional project FK
ALTER TABLE vault_files
  ADD COLUMN IF NOT EXISTS project_id bigint REFERENCES projects(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS vault_files_project_id_idx ON vault_files (project_id);

-- Ensure every row has at least one target
ALTER TABLE vault_files
  ADD CONSTRAINT vault_files_target_check
  CHECK (case_id IS NOT NULL OR project_id IS NOT NULL);

-- Add graph_export as a valid file type
ALTER TABLE vault_files DROP CONSTRAINT vault_files_file_type_check;
ALTER TABLE vault_files ADD CONSTRAINT vault_files_file_type_check
  CHECK (file_type IN (
    'plan', 'collect', 'collate', 'timeline', 'ach', 'report',
    'sweep', 'assessment', 'brief', 'analysis', 'graph_export'
  ));
