package com.macro.mall.aster;
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

class FulfillmentServiceTest {
 JdbcTemplate db;FulfillmentService service;TransactionTemplate tx;
 @BeforeEach void setup(){
  var ds=new DriverManagerDataSource("jdbc:h2:mem:"+UUID.randomUUID()+";MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1","sa","");
  db=new JdbcTemplate(ds);service=new FulfillmentService(db);tx=new TransactionTemplate(new DataSourceTransactionManager(ds));
  db.execute("CREATE TABLE oms_order(id BIGINT PRIMARY KEY,member_id BIGINT,status INT,delete_status INT,order_sn VARCHAR(64),pay_amount DECIMAL(10,2),create_time TIMESTAMP,delivery_company VARCHAR(64),delivery_sn VARCHAR(64),receiver_name VARCHAR(64),receiver_phone VARCHAR(64),receiver_province VARCHAR(64),receiver_city VARCHAR(64),receiver_region VARCHAR(64),receiver_detail_address VARCHAR(64),delivery_time TIMESTAMP,receive_time TIMESTAMP,modify_time TIMESTAMP,confirm_status INT)");
  db.execute("CREATE TABLE aster_after_sale(order_id BIGINT,status VARCHAR(32))");
  db.execute("CREATE TABLE aster_shipment_event(id BIGINT AUTO_INCREMENT PRIMARY KEY,order_id BIGINT,stage VARCHAR(20),actor_id BIGINT,actor_role VARCHAR(12),note VARCHAR(300),created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,UNIQUE(order_id,stage))");
  db.update("INSERT INTO oms_order(id,member_id,status,delete_status) VALUES(1,10,1,0)");
 }
 void advance(String stage){tx.executeWithoutResult(s->service.advance(1,20,stage,"合成配送备注"));}
 @Test void lifecycleIsIdempotentAndOwnerScoped(){
  advance("SHIPPED");advance("SHIPPED");advance("DELIVERING");
  assertThrows(ApiException.class,()->tx.executeWithoutResult(s->service.receive(1,11)));
  tx.executeWithoutResult(s->service.receive(1,10));tx.executeWithoutResult(s->service.receive(1,10));
  assertEquals(3,db.queryForObject("SELECT status FROM oms_order WHERE id=1",Integer.class));
  assertEquals(3,db.queryForObject("SELECT COUNT(*) FROM aster_shipment_event",Integer.class));
  assertThrows(ApiException.class,()->service.detail(1,11L));
 }
 @Test void unpaidAndAfterSaleOrdersCannotShip(){
  db.update("UPDATE oms_order SET status=0");assertThrows(ApiException.class,()->advance("SHIPPED"));
  db.update("UPDATE oms_order SET status=1");db.update("INSERT INTO aster_after_sale VALUES(1,'REFUNDING')");assertThrows(ApiException.class,()->advance("SHIPPED"));
  db.update("UPDATE aster_after_sale SET status='REJECTED'");advance("SHIPPED");
  db.update("UPDATE aster_after_sale SET status='SUBMITTED'");assertThrows(ApiException.class,()->tx.executeWithoutResult(s->service.receive(1,10)));
 }
 @Test void illegalTransitionsAndChangedReplaysAreRejected(){
  assertThrows(ApiException.class,()->advance("DELIVERING"));
  assertThrows(ApiException.class,()->tx.executeWithoutResult(s->service.receive(1,10)));
  advance("SHIPPED");assertThrows(ApiException.class,()->tx.executeWithoutResult(s->service.advance(1,20,"SHIPPED","另一个包裹")));
  assertEquals(1,db.queryForObject("SELECT COUNT(*) FROM aster_shipment_event",Integer.class));
 }
 @Test void competingAdminsCreateOnlyOneShipment() throws Exception {
  var pool=Executors.newFixedThreadPool(2);var gate=new CountDownLatch(1);
  try {
   var a=pool.submit(()->{gate.await();try{tx.executeWithoutResult(s->service.advance(1,20,"SHIPPED","管理员甲"));return true;}catch(ApiException e){return false;}});
   var b=pool.submit(()->{gate.await();try{tx.executeWithoutResult(s->service.advance(1,21,"SHIPPED","管理员乙"));return true;}catch(ApiException e){return false;}});
   gate.countDown();assertNotEquals(a.get(5,TimeUnit.SECONDS),b.get(5,TimeUnit.SECONDS));assertEquals(1,db.queryForObject("SELECT COUNT(*) FROM aster_shipment_event",Integer.class));
  } finally {pool.shutdownNow();}
 }
}
