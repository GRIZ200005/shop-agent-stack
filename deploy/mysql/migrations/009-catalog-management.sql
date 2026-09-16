-- Original Aster: append-only administrator catalog adjustment history.
CREATE TABLE IF NOT EXISTS aster_catalog_change (
 request_id VARCHAR(36) PRIMARY KEY,
 product_id BIGINT NOT NULL,
 sku_id BIGINT NOT NULL,
 actor_id BIGINT NOT NULL,
 action VARCHAR(16) NOT NULL,
 expected_value INT NOT NULL,
 requested_value INT NOT NULL,
 before_value INT NOT NULL,
 after_value INT NOT NULL,
 reason VARCHAR(200) NOT NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 INDEX idx_catalog_history(product_id,created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
