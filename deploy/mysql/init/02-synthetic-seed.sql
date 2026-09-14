-- Original Aster P0 fixtures. No imported accounts, order rows, addresses or product images.
SET NAMES utf8mb4;
INSERT INTO ums_member_level (id,name,growth_point,default_status,free_freight_point)
VALUES (1,'Aster Standard',0,1,0);
INSERT INTO ums_integration_consume_setting (id,deduction_per_amount,max_percent_per_order,use_unit,coupon_status)
VALUES (1,100,10,100,0);
INSERT INTO oms_order_setting (id,flash_order_overtime,normal_order_overtime,confirm_overtime,finish_overtime,comment_overtime)
VALUES (1,60,120,15,7,7);
INSERT INTO pms_brand (id,name,sort,show_status,product_count,product_comment_count)
VALUES (1,'Aster Lab',1,1,1,0);
INSERT INTO pms_product_category (id,parent_id,name,level,product_count,product_unit,nav_status,show_status,sort)
VALUES (1,0,'Test Accessories',0,1,'piece',1,1,1);
INSERT INTO pms_product (id,brand_id,product_category_id,name,product_sn,delete_status,publish_status,new_status,recommand_status,verify_status,sort,sale,price,original_price,stock,low_stock,unit,weight,preview_status,promotion_type,gift_growth,gift_point,brand_name,product_category_name)
VALUES (1,1,1,'Aster USB-C Cable','ASTER-CABLE-001',0,1,1,1,1,1,0,49.90,49.90,1000,10,'piece',0.10,0,0,0,0,'Aster Lab','Test Accessories');
INSERT INTO pms_sku_stock (id,product_id,sku_code,price,stock,low_stock,sale,lock_stock,sp_data)
VALUES (1,1,'ASTER-CABLE-BLACK-1M',49.90,1000,10,0,0,'[{"key":"Color","value":"Black"},{"key":"Length","value":"1m"}]');
