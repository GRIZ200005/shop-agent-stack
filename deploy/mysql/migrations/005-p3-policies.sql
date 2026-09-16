-- Original ShopAgentStack policy revisions and transactionally published clause index.
CREATE TABLE IF NOT EXISTS shop_agent_stack_policy_meta (
 policy_id BIGINT PRIMARY KEY,
 family_id BIGINT NOT NULL,
 visibility VARCHAR(20) NOT NULL DEFAULT 'CUSTOMER',
 effective_from DATETIME(6) NULL,
 effective_to DATETIME(6) NULL,
 index_status VARCHAR(20) NOT NULL DEFAULT 'NOT_PUBLISHED',
 INDEX idx_policy_family(family_id)
);
CREATE TABLE IF NOT EXISTS shop_agent_stack_policy_clause (
 id BIGINT PRIMARY KEY AUTO_INCREMENT,
 policy_id BIGINT NOT NULL,
 clause_no INT NOT NULL,
 content TEXT NOT NULL,
 content_hash CHAR(64) NOT NULL,
 UNIQUE KEY uq_policy_clause(policy_id,clause_no)
);
CREATE TABLE IF NOT EXISTS shop_agent_stack_knowledge_epoch (id INT PRIMARY KEY, revision BIGINT NOT NULL);
INSERT IGNORE INTO shop_agent_stack_knowledge_epoch VALUES(1,1);
-- Preserve existing published policies; do not import authoring drafts.
INSERT IGNORE INTO shop_agent_stack_policy_meta(policy_id,family_id,effective_from,index_status)
 SELECT id,id,CASE WHEN status='PUBLISHED' THEN COALESCE(published_at,created_at) END,
 CASE WHEN status='PUBLISHED' THEN 'READY' ELSE 'NOT_PUBLISHED' END FROM shop_agent_stack_policy;
INSERT IGNORE INTO shop_agent_stack_policy_clause(policy_id,clause_no,content,content_hash)
 SELECT p.id,1,p.content,SHA2(p.content,256) FROM shop_agent_stack_policy p
 WHERE p.status='PUBLISHED' AND NOT EXISTS(SELECT 1 FROM shop_agent_stack_policy_clause c WHERE c.policy_id=p.id);
