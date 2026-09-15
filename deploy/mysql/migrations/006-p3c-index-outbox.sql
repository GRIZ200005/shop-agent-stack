CREATE TABLE IF NOT EXISTS aster_policy_index_job (
  revision BIGINT PRIMARY KEY,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  attempts INT NOT NULL DEFAULT 0,
  collection_name VARCHAR(160) NULL,
  error_code VARCHAR(80) NULL,
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
);
INSERT IGNORE INTO aster_policy_index_job(revision)
SELECT revision FROM aster_knowledge_epoch WHERE id=1;
