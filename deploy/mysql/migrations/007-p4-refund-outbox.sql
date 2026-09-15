-- Original Aster asynchronous simulated refunds; additive and safe to reapply.
CREATE TABLE IF NOT EXISTS aster_refund_job (
 case_id BIGINT PRIMARY KEY,
 status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
 attempts INT NOT NULL DEFAULT 0,
 next_attempt_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 last_error VARCHAR(80) NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 INDEX idx_refund_dispatch(status,next_attempt_at)
);
CREATE TABLE IF NOT EXISTS aster_simulated_refund (
 case_id BIGINT PRIMARY KEY,
 order_id BIGINT NOT NULL UNIQUE,
 amount DECIMAL(10,2) NOT NULL,
 reference VARCHAR(80) NOT NULL UNIQUE,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
