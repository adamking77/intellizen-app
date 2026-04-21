alter table workspace_views drop constraint if exists workspace_views_type_check;

alter table workspace_views add constraint workspace_views_type_check
check (type in ('table', 'kanban', 'list', 'gallery', 'calendar', 'chart'));
