CREATE TABLE IF NOT EXISTS connections (
  id           VARCHAR(255) PRIMARY KEY,
  name         VARCHAR(255) NOT NULL,
  type         VARCHAR(20)  NOT NULL,
  host         VARCHAR(255) NOT NULL,
  port         INTEGER      NOT NULL,
  database     VARCHAR(255),
  username     VARCHAR(255) NOT NULL,
  password     TEXT         NOT NULL,
  created_at   VARCHAR(30)  NOT NULL
);

CREATE TABLE IF NOT EXISTS restore_jobs (
  id                    VARCHAR(255) PRIMARY KEY,
  backup_file           TEXT         NOT NULL,
  target_connection_id  VARCHAR(255) NOT NULL,
  target_database       VARCHAR(255) NOT NULL,
  content_mode          VARCHAR(20)  NOT NULL,
  status                VARCHAR(20)  NOT NULL DEFAULT 'in_progress',
  created_at            VARCHAR(30)  NOT NULL,
  completed_at          VARCHAR(30),
  FOREIGN KEY (target_connection_id) REFERENCES connections(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS restore_checkpoints (
  id                VARCHAR(255) PRIMARY KEY,
  job_id            VARCHAR(255) NOT NULL,
  object_type       VARCHAR(50)  NOT NULL,
  object_name       VARCHAR(255) NOT NULL,
  status            VARCHAR(20)  NOT NULL DEFAULT 'pending',
  row_count_source  INTEGER,
  row_count_target  INTEGER,
  completed_at      VARCHAR(30),
  FOREIGN KEY (job_id) REFERENCES restore_jobs(id) ON DELETE CASCADE
);
