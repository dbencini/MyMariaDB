-- Add table_name to track which table a chunked restore job targets
ALTER TABLE restore_jobs ADD COLUMN table_name VARCHAR(255);

-- Add progress tracking columns for chunked restore
ALTER TABLE restore_checkpoints ADD COLUMN rows_done INTEGER NOT NULL DEFAULT 0;
ALTER TABLE restore_checkpoints ADD COLUMN total_rows INTEGER NOT NULL DEFAULT 0;
ALTER TABLE restore_checkpoints ADD COLUMN updated_at VARCHAR(30);
