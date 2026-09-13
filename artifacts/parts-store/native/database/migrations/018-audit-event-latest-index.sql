SET @audit_events_action_entity_latest_exists = (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'audit_events'
    AND index_name = 'audit_events_action_entity_latest'
);
SET @audit_events_action_entity_latest_sql = IF(
  @audit_events_action_entity_latest_exists = 0,
  'CREATE INDEX audit_events_action_entity_latest ON audit_events(action,entity,entity_id,id DESC)',
  'SELECT 1'
);
PREPARE audit_events_action_entity_latest_statement FROM @audit_events_action_entity_latest_sql;
EXECUTE audit_events_action_entity_latest_statement;
DEALLOCATE PREPARE audit_events_action_entity_latest_statement;