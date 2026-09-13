CREATE INDEX CONCURRENTLY IF NOT EXISTS audit_events_action_entity_latest
  ON parts_store.audit_events(action, entity, entity_id, id DESC);