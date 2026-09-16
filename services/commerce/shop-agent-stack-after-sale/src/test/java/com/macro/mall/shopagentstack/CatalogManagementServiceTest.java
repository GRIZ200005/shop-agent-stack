package com.macro.mall.shopagentstack;
import com.macro.mall.common.exception.ApiException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import java.util.*;
import java.util.concurrent.*;
import static org.junit.jupiter.api.Assertions.*;

class CatalogManagementServiceTest {
 JdbcTemplate db;CatalogManagementService catalog;TransactionTemplate tx;
 @BeforeEach void setup(){
  var ds=new DriverManagerDataSource("jdbc:h2:mem:"+UUID.randomUUID()+";MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1","sa","");
  db=new JdbcTemplate(ds);catalog=new CatalogManagementService(db);tx=new TransactionTemplate(new DataSourceTransactionManager(ds));
  db.execute("CREATE TABLE pms_product(id BIGINT PRIMARY KEY,publish_status INT,delete_status INT)");
  db.execute("CREATE TABLE pms_sku_stock(id BIGINT PRIMARY KEY,product_id BIGINT,stock INT,lock_stock INT)");
  db.execute("CREATE TABLE shop_agent_stack_catalog_change(request_id VARCHAR(36) PRIMARY KEY,product_id BIGINT,sku_id BIGINT,actor_id BIGINT,action VARCHAR(16),expected_value INT,requested_value INT,before_value INT,after_value INT,reason VARCHAR(200))");
  db.update("INSERT INTO pms_product VALUES(1,1,0)");db.update("INSERT INTO pms_sku_stock VALUES(10,1,10,3)");
 }
 CatalogManagementService.Change stock(int expected,int delta){return new CatalogManagementService.Change(UUID.randomUUID().toString(),"STOCK",10L,expected,delta,"盘点调整");}
 void apply(CatalogManagementService.Change c){tx.executeWithoutResult(s->catalog.change(1,9,c));}
 @Test void adjustmentsPreserveReservationsAndDeduplicate(){
  var c=stock(10,4);apply(c);apply(c);
  assertEquals(14,db.queryForObject("SELECT stock FROM pms_sku_stock",Integer.class));
  assertEquals(3,db.queryForObject("SELECT lock_stock FROM pms_sku_stock",Integer.class));
  assertEquals(1,db.queryForObject("SELECT COUNT(*) FROM shop_agent_stack_catalog_change",Integer.class));
  assertThrows(ApiException.class,()->apply(new CatalogManagementService.Change(c.requestId(),"STOCK",10L,10,5,"盘点调整")));
 }
 @Test void rejectsStaleValuesAndReductionBelowLockedStock(){
  assertThrows(ApiException.class,()->apply(stock(9,1)));
  assertThrows(ApiException.class,()->apply(stock(10,-8)));
  assertEquals(10,db.queryForObject("SELECT stock FROM pms_sku_stock",Integer.class));
  assertEquals(0,db.queryForObject("SELECT COUNT(*) FROM shop_agent_stack_catalog_change",Integer.class));
 }
 @Test void downlistingRejectsCheckoutAndTransactionRollsBackReservation(){
  apply(new CatalogManagementService.Change(UUID.randomUUID().toString(),"STATUS",0L,1,0,"暂停销售"));
  assertThrows(ApiException.class,()->tx.executeWithoutResult(s->catalog.reserve(1,10,1)));
  apply(new CatalogManagementService.Change(UUID.randomUUID().toString(),"STATUS",0L,0,1,"恢复销售"));
  assertThrows(ApiException.class,()->tx.executeWithoutResult(s->{catalog.reserve(1,10,2);catalog.reserve(1,999,1);}));
  assertEquals(3,db.queryForObject("SELECT lock_stock FROM pms_sku_stock",Integer.class));
 }
 @Test void competingReservationsCannotOversell() throws Exception {
  var pool=Executors.newFixedThreadPool(2);var gate=new CountDownLatch(1);
  Callable<Boolean> reserve=()->{gate.await();try{tx.executeWithoutResult(s->catalog.reserve(1,10,5));return true;}catch(ApiException e){return false;}};
  try{var a=pool.submit(reserve);var b=pool.submit(reserve);gate.countDown();assertNotEquals(a.get(5,TimeUnit.SECONDS),b.get(5,TimeUnit.SECONDS));assertEquals(8,db.queryForObject("SELECT lock_stock FROM pms_sku_stock",Integer.class));}finally{pool.shutdownNow();}
 }
}
