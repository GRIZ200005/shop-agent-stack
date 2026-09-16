package com.macro.mall.shopagentstack;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import com.macro.mall.common.exception.ApiException;
import java.util.UUID;
import static org.junit.jupiter.api.Assertions.*;

class SupportServiceTest {
 JdbcTemplate db;SupportService service;String id;
 @BeforeEach void setup(){
  var ds=new DriverManagerDataSource("jdbc:h2:mem:"+UUID.randomUUID()+";MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1","sa","");
  db=new JdbcTemplate(ds);service=new SupportService(db);id=UUID.randomUUID().toString();
  db.execute("CREATE TABLE shop_agent_stack_support_ticket(id VARCHAR(36) PRIMARY KEY,member_id BIGINT,title VARCHAR(120),context_text TEXT,status VARCHAR(20) DEFAULT 'WAITING',assignee_id BIGINT,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)");
  db.execute("CREATE TABLE shop_agent_stack_support_message(seq BIGINT AUTO_INCREMENT UNIQUE,id VARCHAR(36) PRIMARY KEY,ticket_id VARCHAR(36),author_id BIGINT,author_role VARCHAR(16),content TEXT,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)");
 }
 @Test void createIsIdempotentAndOwnerScoped(){
  service.create(1,id,"规格问题","客户提供的摘录");service.create(1,id,"规格问题","客户提供的摘录");
  assertEquals(1,db.queryForObject("SELECT COUNT(*) FROM shop_agent_stack_support_ticket",Integer.class));
  assertThrows(ApiException.class,()->service.detail(id,2L));
  assertThrows(ApiException.class,()->service.create(2,id,"规格问题","客户提供的摘录"));
  assertThrows(ApiException.class,()->service.create(1,id,"变化的请求",""));
 }
 @Test void repliesClaimsAndResolutionRespectBoundaries(){
  service.create(1,id,"规格问题","");service.claim(id,10);service.claim(id,10);
  assertThrows(ApiException.class,()->service.claim(id,11));
  assertThrows(ApiException.class,()->service.reply(id,11,true,UUID.randomUUID().toString(),"越权"));
  assertThrows(ApiException.class,()->service.resolve(id,10));
  String mid=UUID.randomUUID().toString();service.reply(id,10,true,mid,"请核对接口规格");service.reply(id,10,true,mid,"请核对接口规格");
  assertEquals(1,db.queryForObject("SELECT COUNT(*) FROM shop_agent_stack_support_message WHERE author_role='STAFF'",Integer.class));
  service.reply(id,1,false,UUID.randomUUID().toString(),"已了解");service.resolve(id,10);service.resolve(id,10);
  assertEquals("RESOLVED",service.detail(id,1L).get("status"));
  assertThrows(ApiException.class,()->service.reply(id,1,false,UUID.randomUUID().toString(),"关闭后不能添加"));
 }
}
