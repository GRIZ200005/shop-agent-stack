package com.macro.mall.aster;

import com.macro.mall.common.exception.Asserts;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.util.*;

/** Original Aster: audited catalog mutations and atomic checkout reservations. */
@Service
public class CatalogManagementService {
    private final JdbcTemplate db;
    public CatalogManagementService(JdbcTemplate db) { this.db = db; }
    public record Change(String requestId, String action, Long skuId, int expected, int value, String reason) {}
    private static int number(Map<String,Object> row, String key) { return ((Number)row.get(key)).intValue(); }

    @Transactional(readOnly=true)
    public Map<String,Object> list(String query, Integer status, int page) {
        query = query == null ? "" : query.trim();
        if(query.length()>80 || page<0 || page>10000 || (status!=null && status!=0 && status!=1)) Asserts.fail("查询条件不合法");
        String where=" FROM pms_product WHERE delete_status=0 AND name LIKE ? ESCAPE '!'";
        List<Object> args=new ArrayList<>();args.add(ProductQueryService.literalLike(query));
        if(status!=null){where+=" AND publish_status=?";args.add(status);}
        long total=db.queryForObject("SELECT COUNT(*)"+where,Long.class,args.toArray());
        args.add(page*20);
        var rows=db.queryForList("SELECT id,name,pic,price,product_category_name,publish_status"+where+" ORDER BY id DESC LIMIT 20 OFFSET ?",args.toArray());
        return Map.of("items",rows,"total",total,"page",page);
    }

    @Transactional(readOnly=true)
    public Map<String,Object> detail(long id) {
        var rows=db.queryForList("SELECT id,name,pic,price,product_category_name,publish_status FROM pms_product WHERE id=? AND delete_status=0",id);
        if(rows.isEmpty()) Asserts.fail("商品不存在");
        var row=rows.get(0);
        row.put("skus",db.queryForList("SELECT id,sku_code,price,COALESCE(stock,0) stock,COALESCE(lock_stock,0) lock_stock,sp_data FROM pms_sku_stock WHERE product_id=? ORDER BY id",id));
        row.put("history",db.queryForList("SELECT c.*,u.username actor_name FROM aster_catalog_change c LEFT JOIN ums_admin u ON u.id=c.actor_id WHERE c.product_id=? ORDER BY c.created_at DESC,c.request_id DESC LIMIT 30",id));
        return row;
    }

    @Transactional
    public void change(long id, long actor, Change c) {
        if(c.requestId()==null || !c.requestId().matches("[a-fA-F0-9-]{36}") || c.reason()==null || c.reason().isBlank() || c.reason().length()>200) Asserts.fail("请提供操作编号和调整原因（最多200字）");
        if(!"STATUS".equals(c.action()) && !"STOCK".equals(c.action())) Asserts.fail("不支持的操作");
        long sku=c.skuId()==null?0:c.skuId();
        var products=db.queryForList("SELECT publish_status FROM pms_product WHERE id=? AND delete_status=0 FOR UPDATE",id);
        if(products.isEmpty()) Asserts.fail("商品不存在");
        var previous=db.queryForList("SELECT * FROM aster_catalog_change WHERE request_id=?",c.requestId());
        if(!previous.isEmpty()) {
            var p=previous.get(0);
            if(((Number)p.get("product_id")).longValue()!=id || ((Number)p.get("actor_id")).longValue()!=actor || ((Number)p.get("sku_id")).longValue()!=sku || !p.get("action").equals(c.action()) || number(p,"expected_value")!=c.expected() || number(p,"requested_value")!=c.value() || !p.get("reason").equals(c.reason().trim())) Asserts.fail("操作编号已被其他请求使用");
            return;
        }
        int before,after;
        if("STATUS".equals(c.action())) {
            if(sku!=0 || (c.value()!=0 && c.value()!=1)) Asserts.fail("上下架参数不合法");
            before=number(products.get(0),"publish_status");after=c.value();
            if(before!=c.expected()) Asserts.fail("商品状态已变化，请刷新后重试");
            db.update("UPDATE pms_product SET publish_status=? WHERE id=?",after,id);
        } else {
            if(c.value()==0 || Math.abs((long)c.value())>1000000) Asserts.fail("单次调整数量必须在正负100万以内且不为零");
            var stocks=db.queryForList("SELECT COALESCE(stock,0) stock,COALESCE(lock_stock,0) lock_stock FROM pms_sku_stock WHERE id=? AND product_id=? FOR UPDATE",sku,id);
            if(stocks.isEmpty()) Asserts.fail("商品规格不存在");
            before=number(stocks.get(0),"stock");
            long result=(long)before+c.value();
            if(before!=c.expected()) Asserts.fail("库存已变化，请刷新后重新调整");
            if(result<number(stocks.get(0),"lock_stock") || result<0 || result>Integer.MAX_VALUE) Asserts.fail("调整后库存不能少于订单占用量或超出范围");
            after=(int)result;
            db.update("UPDATE pms_sku_stock SET stock=? WHERE id=?",after,sku);
        }
        db.update("INSERT INTO aster_catalog_change(request_id,product_id,sku_id,actor_id,action,expected_value,requested_value,before_value,after_value,reason) VALUES(?,?,?,?,?,?,?,?,?,?)",c.requestId(),id,sku,actor,c.action(),c.expected(),c.value(),before,after,c.reason().trim());
    }

    /** Shares product-then-SKU lock order with catalog mutations; caller's order transaction owns rollback. */
    @Transactional
    public void reserve(long productId,long skuId,int quantity) {
        var products=db.queryForList("SELECT publish_status,delete_status FROM pms_product WHERE id=? FOR UPDATE",productId);
        if(quantity<=0 || products.isEmpty() || number(products.get(0),"publish_status")!=1 || number(products.get(0),"delete_status")!=0) Asserts.fail("商品已下架或不可购买，请更新购物袋");
        if(db.update("UPDATE pms_sku_stock SET lock_stock=COALESCE(lock_stock,0)+? WHERE id=? AND product_id=? AND COALESCE(stock,0)-COALESCE(lock_stock,0)>=?",quantity,skuId,productId,quantity)!=1) Asserts.fail("库存不足，请更新购物袋");
    }
}
