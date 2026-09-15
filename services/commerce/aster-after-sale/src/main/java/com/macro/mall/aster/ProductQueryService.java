package com.macro.mall.aster;

import com.macro.mall.common.exception.Asserts;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.*;

/** Original Aster: bounded, read-only catalog access for authenticated Agent grants. */
@Service
public class ProductQueryService {
    private final JdbcTemplate db;
    public ProductQueryService(JdbcTemplate db) { this.db=db; }
    private static final String VISIBLE=" FROM pms_product p WHERE p.delete_status=0 AND p.publish_status=1";
    private static final String PROJECTION="SELECT p.id,p.name,p.price,p.pic,p.brand_name,p.product_category_name,p.sub_title,p.description,p.detail_desc,p.promotion_type";
    static String literalLike(String value) { return "%"+value.replace("!","!!").replace("%","!%").replace("_","!_")+"%"; }
    public record Query(String query,String category,BigDecimal minPrice,BigDecimal maxPrice,Long after) {}

    @Transactional(readOnly=true)
    public Map<String,Object> search(Query request) {
        String query=request.query()==null?"":request.query().trim();
        String category=request.category()==null?"":request.category().trim();
        long after=request.after()==null?0:request.after();
        if(query.length()>80 || category.length()>64 || after<0) Asserts.fail("商品查询范围不合法");
        var min=request.minPrice(); var max=request.maxPrice();
        if((min!=null && (min.signum()<0 || min.compareTo(new BigDecimal("99999999.99"))>0)) || (max!=null && (max.signum()<0 || max.compareTo(new BigDecimal("99999999.99"))>0)) || (min!=null && max!=null && min.compareTo(max)>0)) Asserts.fail("价格范围不合法");
        String[] terms=query.isEmpty()?new String[0]:query.split("\\s+");
        if(terms.length>4) Asserts.fail("请使用最多四个短关键词查询商品");
        StringBuilder sql=new StringBuilder(PROJECTION+VISIBLE+" AND p.id>?");
        List<Object> args=new ArrayList<>();args.add(after);
        for(String term:terms) {
            sql.append(" AND (p.name LIKE ? ESCAPE '!' OR p.sub_title LIKE ? ESCAPE '!' OR p.description LIKE ? ESCAPE '!' OR p.detail_desc LIKE ? ESCAPE '!' OR p.product_category_name LIKE ? ESCAPE '!')");
            for(int i=0;i<5;i++)args.add(literalLike(term));
        }
        if(!category.isEmpty()){sql.append(" AND p.product_category_name=?");args.add(category);}
        if(min!=null){sql.append(" AND p.price>=?");args.add(min);}
        if(max!=null){sql.append(" AND p.price<=?");args.add(max);}
        sql.append(" ORDER BY p.id ASC LIMIT 6");
        var rows=db.queryForList(sql.toString(),args.toArray());
        boolean more=rows.size()>5;
        var selected=new ArrayList<>(rows.subList(0,Math.min(5,rows.size())));
        selected.forEach(this::enrich);
        return Map.of("products",selected,"has_more",more,"next_after",more?selected.get(selected.size()-1).get("id"):0,"observed_at",Instant.now().toString(),"price_kind","catalog_price_not_checkout_quote","retrieval_method","mysql_keyword_and_filters");
    }

    @Transactional(readOnly=true)
    public Map<String,Object> detail(long id) {
        if(id<=0)Asserts.fail("商品编号不合法");
        var rows=db.queryForList(PROJECTION+VISIBLE+" AND p.id=?",id);
        if(rows.isEmpty())Asserts.fail("商品不存在或当前未上架");
        var result=rows.get(0);enrich(result);return result;
    }

    private void enrich(Map<String,Object> row) {
        // Read stock from SKUs; the SPU stock field is not the available-to-promise source.
        row.put("skus",db.queryForList("SELECT id,sku_code,price,GREATEST(COALESCE(stock,0)-COALESCE(lock_stock,0),0) available_stock,sp_data FROM pms_sku_stock WHERE product_id=? ORDER BY id LIMIT 21",row.get("id")));
        @SuppressWarnings("unchecked") var skus=(List<Map<String,Object>>)row.get("skus");
        if(skus.size()>20)Asserts.fail("该商品规格过多，请在商品页面查看");
        row.put("currency","CNY");
        row.put("price_kind","catalog_price_not_checkout_quote");
        row.put("evidence_id","G"+row.get("id"));
        // Keep tool payloads bounded. These fields are data, not model instructions.
        for(String key:List.of("name","sub_title","description","detail_desc")) {
            Object value=row.get(key);
            if(value instanceof String text && text.length()>2000)row.put(key,text.substring(0,2000));
        }
    }
}
