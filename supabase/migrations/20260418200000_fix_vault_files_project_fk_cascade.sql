-- Fix: vault_files.project_id had ON DELETE SET NULL, but the CHECK constraint
-- (case_id IS NOT NULL OR project_id IS NOT NULL) prevents setting project_id to
-- null when case_id is also null — i.e., project-only vault files block project deletion.
-- Change to ON DELETE CASCADE so project-only vault files are removed with the project.

ALTER TABLE vault_files
  DROP CONSTRAINT IF EXISTS vault_files_project_id_fkey;
ALTER TABLE vault_files
  ADD CONSTRAINT vault_files_project_id_fkey
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
