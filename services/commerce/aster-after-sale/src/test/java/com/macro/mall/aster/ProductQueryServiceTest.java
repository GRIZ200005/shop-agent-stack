package com.macro.mall.aster;

import com.macro.mall.common.exception.ApiException;
import org.junit.jupiter.api.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import java.math.BigDecimal;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;

class ProductQueryServiceTest {
    JdbcTemplate db;ProductQueryService service;
    @BeforeEach void setup() {
        db=new JdbcTemplate(new DriverManagerDataSource("jdbc:h2:mem:"+UUID.randomUUID()+";MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1","sa",""));
        service=new ProductQueryService(db);
        db.execute("CREATE TABLE pms_product(id BIGINT PRIMARY KEY,name VARCHAR(200),price DECIMAL(10,2),pic VARCHAR(200),brand_name VARCHAR(100),product_category_name VARCHAR(100),sub_title VARCHAR(255),description VARCHAR(3000),detail_desc VARCHAR(3000),promotion_type INT,delete_status INT,publish_status INT)");
        db.execute("CREATE TABLE pms_sku_stock(id BIGINT PRIMARY KEY,product_id BIGINT,sku_code VARCHAR(64),price DECIMAL(10,2),stock INT,lock_stock INT,sp_data VARCHAR(500))");
        for(int i=1;i<=8;i++) {
            db.update("INSERT INTO pms_product VALUES(?,?,?,'/p.webp','Aster','饮具','350mL','日用','材质：玻璃',0,0,1)",i,"杯"+i,10*i);
            db.update("INSERT INTO pms_sku_stock VALUES(?,?,?,10,10,3,'[]')",i,i,"SKU"+i);
        }
    }
    @SuppressWarnings("unchecked") List<Map<String,Object>> products(Map<String,Object> response){return (List<Map<String,Object>>)response.get("products");}
    @Test void filtersCombineTermsPriceAndCategoryAndUseSkuStock() {
        var result=service.search(new ProductQueryService.Query("玻璃 杯","饮具",new BigDecimal("20"),new BigDecimal("30"),0L));
        assertEquals(List.of(2L,3L),products(result).stream().map(p->((Number)p.get("id")).longValue()).toList());
        assertEquals(7,((Number)((Map<?,?>)((List<?>)products(result).get(0).get("skus")).get(0)).get("available_stock")).intValue());
    }
    @Test void unpublishedAndDeletedProductsCannotBeFoundOrRead() {
        db.update("UPDATE pms_product SET publish_status=0 WHERE id=1");db.update("UPDATE pms_product SET delete_status=1 WHERE id=2");
        assertThrows(ApiException.class,()->service.detail(1));assertThrows(ApiException.class,()->service.detail(2));
        assertTrue(products(service.search(new ProductQueryService.Query("杯1","",null,null,0L))).isEmpty());
    }
    @Test void wildcardCharactersAreLiteralAndSqlPayloadCannotBroadenQuery() {
        for(String input:List.of("%","_","' OR 1=1 --"))assertTrue(products(service.search(new ProductQueryService.Query(input,"",null,null,0L))).isEmpty());
        assertEquals(8,db.queryForObject("SELECT COUNT(*) FROM pms_product",Integer.class));
    }
    @Test void continuationDoesNotRepeatRows() {
        var first=service.search(new ProductQueryService.Query("","",null,null,0L));assertEquals(5,products(first).size());assertEquals(true,first.get("has_more"));
        var second=service.search(new ProductQueryService.Query("","",null,null,((Number)first.get("next_after")).longValue()));assertEquals(3,products(second).size());assertEquals(false,second.get("has_more"));
    }
    @Test void invalidPriceRangeIsRejected() {
        assertThrows(ApiException.class,()->service.search(new ProductQueryService.Query("","",new BigDecimal("30"),new BigDecimal("20"),0L)));
        assertThrows(ApiException.class,()->service.search(new ProductQueryService.Query("a b c d e","",null,null,0L)));
    }
}
