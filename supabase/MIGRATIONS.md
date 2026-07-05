# GenZen Brain — Applied Migration Inventory

The remote Supabase project (`jicrdrwtwubveyvzyyrh`) is the authoritative
schema record. This repo's `supabase/migrations/` holds only the app-local
subset and cannot rebuild the full database.

Regenerate this file with the Supabase MCP `list_migrations` tool after
applying new migrations.

Snapshot: 2026-07-05 — 88 remote-applied migrations, 9 schemas.

| Version | Name |
|---|---|
| 20260412152429 | init_intellizen_v1_schema |
| 20260412153938 | add_graph_tables |
| 20260412160437 | dedupe_intel_signals_and_enforce_unique_urls |
| 20260412210000 | add_standalone_graph_mode |
| 20260412220000 | add_investigations_schema |
| 20260417000000 | rework_investigations_3phase |
| 20260417100000 | add_project_to_vault_files |
| 20260418200000 | fix_vault_files_project_fk_cascade |
| 20260419000000 | add_operations |
| 20260419120000 | add_workspace_nodes |
| 20260419123000 | add_workspace_nodes_ownership |
| 20260419133000 | add_canvas_documents |
| 20260419155243 | add_vault_files_content |
| 20260419182513 | add_canvas_documents |
| 20260419200000 | add_vault_files_content |
| 20260420110000 | add_workspace_databases |
| 20260421130000 | add_chart_view_type |
| 20260422121500 | add_workspace_record_refs |
| 20260423000000 | add_on_hold_operation_project_status |
| 20260427105411 | add_voice_notes_inbox |
| 20260427105453 | enable_pg_cron_for_voice_notes_cleanup |
| 20260511091832 | add_timeline_view_type |
| 20260520101821 | enable_rls_service_role_only_tables |
| 20260523125019 | allow_anon_select_documents |
| 20260525095034 | phase2_genzen_os_skills_memory_mcp |
| 20260525142343 | enable_rls_phase2_agent_tables |
| 20260525150725 | phase9_namespace_tables |
| 20260525151425 | phase9_update_functions_v2 |
| 20260525162022 | anon_policies_personal_app_access |
| 20260525230432 | add_agent_recall_hybrid |
| 20260525230541 | add_system_search_all_context |
| 20260525230655 | tighten_agent_recall_hybrid_scoring |
| 20260525230940 | normalize_memory_chunk_source_table |
| 20260526030000 | add_taxonomy_metadata_primitives |
| 20260526031500 | fix_org_units_parent_links |
| 20260526033000 | backfill_taxonomy_metadata |
| 20260526034500 | add_knowledge_search_hybrid |
| 20260526040000 | improve_search_hybrid_keyword_surface |
| 20260526040500 | tokenize_search_hybrid_paths |
| 20260527064105 | create_agent_skill_files |
| 20260527070129 | create_agent_mcp_catalog |
| 20260527070206 | mcp_servers_fk_catalog |
| 20260528105148 | biz_ops_schema_restructure |
| 20260528105547 | wire_tasks_to_biz_ops_and_fix_assignees |
| 20260528105614 | insert_biz_ops_projects_and_tasks |
| 20260528105930 | biz_ops_set_dates |
| 20260528110412 | tasks_cleanup_rename_dates |
| 20260528111038 | crm_restructure_and_tasks_relation |
| 20260528111051 | crm_migrate_existing_records |
| 20260528111635 | restructure_clients_create_introducers |
| 20260528111653 | migrate_clients_and_seed_introducers |
| 20260528112545 | add_weekly_triage_recurring_task |
| 20260528112642 | fix_weekly_triage_task_name |
| 20260528112701 | fix_weekly_triage_task_paths |
| 20260528112850 | update_weekly_triage_recurrence_day_time |
| 20260528113530 | populate_biz_ops_bodies_from_notion |
| 20260528113733 | populate_crm_client_introducer_bodies_from_notion |
| 20260528113948 | fix_introducers_database_uuid |
| 20260528113958 | migrate_introducers_records_to_new_uuid |
| 20260528114326 | fix_crm_and_clients_view_configs |
| 20260528114547 | add_introducers_default_view |
| 20260602070038 | create_intel_board_reviews |
| 20260604132341 | add_kindle_highlight_document_type |
| 20260604135003 | fix_kindle_titles_and_taxonomy |
| 20260604135150 | kindle_query_function |
| 20260604140547 | resize_embeddings_to_1536 |
| 20260606073624 | stabilize_mixed_dimension_search |
| 20260606080640 | agent_memory_provenance_and_reflection |
| 20260606080712 | harden_agent_source_of_truth_access |
| 20260610074950 | entity_first_taxonomy_metadata |
| 20260610122750 | knowledge_health_monitor |
| 20260611095529 | create_shared_plugins_tables |
| 20260611111159 | copywriting_suite_discoverability_gate |
| 20260613133849 | add_match_agent_memory_rpc |
| 20260613135029 | expose_agent_memory_via_public_views |
| 20260613141035 | fix_match_agent_memory_for_1536 |
| 20260629185830 | secure_knowledge_health_checks |
| 20260702090246 | add_atomic_record_section_append |
| 20260702090258 | add_workspace_work_events |
| 20260702102017 | add_record_revisions |
| 20260702105717 | add_intel_entities_and_claims |
| 20260702123105 | enable_realtime_fiona_inbox_chat |
| 20260703082222 | security_hardening_audit_f07 |
| 20260703082435 | prune_unused_indexes_audit_f08 |
| 20260703083415 | add_memory_summary_audit_f10 |
| 20260703090922 | anon_personal_app_access_v2_scoped |
| 20260705093638 | structural_entities_internal_search_relation_rpc |
