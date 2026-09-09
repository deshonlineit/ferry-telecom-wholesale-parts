-- Run manually after migrations; this script never mutates data.
DO $$
DECLARE missing text;
BEGIN
  SELECT string_agg(required.table_name || '.' || required.column_name, ', ')
  INTO missing
  FROM (VALUES
    ('native_picqer_outbox','locked_owner'),('native_picqer_outbox','locked_until'),
    ('native_picqer_outbox','order_created_at'),('native_order_snapshots','order_created_at'),
    ('native_stock_state','source_event_at'),('native_fulfilment_state','version'),
    ('native_fulfilment_state','reservation_acknowledged'),('native_fulfilment_state','processed_at')
  ) AS required(table_name,column_name)
  LEFT JOIN information_schema.columns c ON c.table_schema=current_schema()
    AND c.table_name=required.table_name AND c.column_name=required.column_name
  WHERE c.column_name IS NULL;
  IF missing IS NOT NULL THEN RAISE EXCEPTION 'Missing native Picqer columns: %', missing; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname=current_schema()
    AND tablename='native_picqer_outbox' AND indexname='native_picqer_outbox_ready') THEN
    RAISE EXCEPTION 'Missing native_picqer_outbox_ready index';
  END IF;
END $$;