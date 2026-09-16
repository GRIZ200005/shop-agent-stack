-- Original ShopAgentStack P2: short-lived execution contexts and single-consumption confirmations.
CREATE TABLE IF NOT EXISTS shop_agent_stack_grant (
  token_hash CHAR(64) PRIMARY KEY,
  member_id BIGINT NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  INDEX idx_grant_expiry(expires_at)
);
CREATE TABLE IF NOT EXISTS shop_agent_stack_operation (
  id CHAR(36) PRIMARY KEY,
  member_id BIGINT NOT NULL,
  order_id BIGINT NOT NULL,
  reason VARCHAR(500) NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  confirmation_hash CHAR(64) NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'PREVIEW',
  case_id BIGINT NULL,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  consumed_at TIMESTAMP NULL,
  INDEX idx_agent_operation_owner(member_id,id)
);
