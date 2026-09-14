-- Original Aster P1 schema. Safe to reapply; no existing business rows are removed.
SET NAMES utf8mb4;
CREATE TABLE IF NOT EXISTS aster_staff (
  admin_id BIGINT PRIMARY KEY,
  role VARCHAR(20) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS aster_after_sale (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  order_id BIGINT NOT NULL UNIQUE,
  member_id BIGINT NOT NULL,
  reason VARCHAR(500) NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'SUBMITTED',
  assignee_id BIGINT NULL,
  decision_note VARCHAR(500) NULL,
  refund_reference VARCHAR(80) NULL UNIQUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_after_sale_member(member_id, id),
  INDEX idx_after_sale_queue(status, id)
);
CREATE TABLE IF NOT EXISTS aster_after_sale_event (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  case_id BIGINT NOT NULL,
  actor VARCHAR(80) NOT NULL,
  action VARCHAR(40) NOT NULL,
  note VARCHAR(500) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_case_events(case_id, id)
);
CREATE TABLE IF NOT EXISTS aster_policy (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  title VARCHAR(120) NOT NULL,
  content TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
  version INT NOT NULL DEFAULT 1,
  author_id BIGINT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  published_at TIMESTAMP NULL
);
-- Independently authored development policy. Not a real merchant promise.
INSERT INTO aster_policy(id,title,content,status,version,author_id,published_at)
SELECT 1,'体验商城售后说明','本环境仅用于学习与测试，不发生真实支付。完成模拟支付后，可对整笔订单提交一次售后申请。客服领取后审核；通过将记录模拟退款，拒绝会说明原因。部分退款、退货物流和真实支付渠道暂未开放。','PUBLISHED',1,0,CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM aster_policy WHERE id=1);

-- Original synthetic assortment; illustrations are independently drawn SVGs in the frontend.
INSERT INTO pms_product(id,brand_id,product_category_id,name,product_sn,delete_status,publish_status,new_status,recommand_status,verify_status,sort,sale,price,original_price,stock,low_stock,unit,weight,preview_status,promotion_type,gift_growth,gift_point,brand_name,product_category_name)
SELECT 101,1,1,'Aster 多合一扩展坞','ASTER-HUB-001',0,1,1,1,1,2,0,199.00,199.00,1000,10,'piece',0.2,0,0,0,0,'Aster Lab','Test Accessories'
WHERE NOT EXISTS (SELECT 1 FROM pms_product WHERE id=101);
INSERT INTO pms_product(id,brand_id,product_category_id,name,product_sn,delete_status,publish_status,new_status,recommand_status,verify_status,sort,sale,price,original_price,stock,low_stock,unit,weight,preview_status,promotion_type,gift_growth,gift_point,brand_name,product_category_name)
SELECT 102,1,1,'Aster 无线头戴耳机','ASTER-AUDIO-001',0,1,1,1,1,3,0,329.00,329.00,1000,10,'piece',0.3,0,0,0,0,'Aster Lab','Test Accessories'
WHERE NOT EXISTS (SELECT 1 FROM pms_product WHERE id=102);
INSERT INTO pms_product(id,brand_id,product_category_id,name,product_sn,delete_status,publish_status,new_status,recommand_status,verify_status,sort,sale,price,original_price,stock,low_stock,unit,weight,preview_status,promotion_type,gift_growth,gift_point,brand_name,product_category_name)
SELECT 103,1,1,'Aster 便携蓝牙音箱','ASTER-SPEAKER-001',0,1,1,1,1,4,0,159.00,159.00,1000,10,'piece',0.3,0,0,0,0,'Aster Lab','Test Accessories'
WHERE NOT EXISTS (SELECT 1 FROM pms_product WHERE id=103);
INSERT INTO pms_sku_stock(id,product_id,sku_code,price,stock,low_stock,sale,lock_stock,sp_data)
SELECT p.id,p.id,p.product_sn,p.price,1000,10,0,0,'[{"key":"版本","value":"标准版"}]' FROM pms_product p
WHERE p.id IN (101,102,103) AND NOT EXISTS (SELECT 1 FROM pms_sku_stock s WHERE s.id=p.id);
-- mall's product detail query requires a non-null attribute category, even without custom attributes.
UPDATE pms_product SET product_attribute_category_id=0 WHERE id IN (1,101,102,103) AND product_attribute_category_id IS NULL;
