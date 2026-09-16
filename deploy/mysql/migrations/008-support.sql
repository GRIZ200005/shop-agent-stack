CREATE TABLE IF NOT EXISTS shop_agent_stack_support_ticket (
 id VARCHAR(36) PRIMARY KEY,
 member_id BIGINT NOT NULL,
 title VARCHAR(120) NOT NULL,
 context_text TEXT NOT NULL,
 status VARCHAR(20) NOT NULL DEFAULT 'WAITING',
 assignee_id BIGINT NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 INDEX idx_support_member (member_id,created_at),
 INDEX idx_support_queue (status,created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS shop_agent_stack_support_message (
 seq BIGINT AUTO_INCREMENT UNIQUE,
 id VARCHAR(36) PRIMARY KEY,
 ticket_id VARCHAR(36) NOT NULL,
 author_id BIGINT NOT NULL,
 author_role VARCHAR(16) NOT NULL,
 content TEXT NOT NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 INDEX idx_support_messages (ticket_id,seq),
 CONSTRAINT fk_support_message FOREIGN KEY (ticket_id) REFERENCES shop_agent_stack_support_ticket(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
