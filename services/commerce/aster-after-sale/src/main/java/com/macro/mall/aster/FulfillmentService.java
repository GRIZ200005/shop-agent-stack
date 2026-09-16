package com.macro.mall.aster;

import com.macro.mall.common.exception.Asserts;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.util.*;

/** Original Aster: owner-scoped, transactional simulated order fulfillment. */
@Service
public class FulfillmentService {
 private final JdbcTemplate db;
 public FulfillmentService(JdbcTemplate db){this.db=db;}
 private Map<String,Object> order(long id,Long member,boolean lock){
  var rows=db.queryForList("SELECT id,order_sn,member_id,status,pay_amount,create_time,delivery_company,delivery_sn,receiver_name,receiver_phone,receiver_province,receiver_city,receiver_region,receiver_detail_address FROM oms_order WHERE id=? AND delete_status=0"+(lock?" FOR UPDATE":""),id);
  if(rows.isEmpty() || (member!=null && ((Number)rows.get(0).get("member_id")).longValue()!=member)) Asserts.fail("订单不存在或无权访问");
  return rows.get(0);
 }
 @Transactional(readOnly=true)
 public Map<String,Object> list(Integer status,String query,int page){
  query=query==null?"":query.trim();
  if(page<0 || page>10000 || query.length()>64 || (status!=null && (status<0 || status>5))) Asserts.fail("订单查询条件不合法");
  String where=" FROM oms_order WHERE delete_status=0 AND order_sn LIKE ? ESCAPE '!'";
  var args=new ArrayList<Object>();args.add(ProductQueryService.literalLike(query));
  if(status!=null){where+=" AND status=?";args.add(status);}
  long count=db.queryForObject("SELECT COUNT(*)"+where,Long.class,args.toArray());args.add(page*20);
  var items=db.queryForList("SELECT id,order_sn,status,pay_amount,create_time"+where+" ORDER BY id DESC LIMIT 20 OFFSET ?",args.toArray());
  return Map.of("items",items,"total",count);
 }
 @Transactional(readOnly=true)
 public Map<String,Object> detail(long id,Long member){
  var row=order(id,member,false);
  row.put("items",db.queryForList("SELECT product_id,product_name,product_pic,product_quantity,product_price FROM oms_order_item WHERE order_id=? ORDER BY id",id));
  row.put("events",db.queryForList("SELECT stage,note,created_at FROM aster_shipment_event WHERE order_id=? ORDER BY id",id));
  row.put("after_sale_open",activeSale(id));
  row.put("simulated",true);return row;
 }
 private boolean activeSale(long id){return db.queryForObject("SELECT COUNT(*) FROM aster_after_sale WHERE order_id=? AND status<>'REJECTED'",Long.class,id)>0;}
 private void allowed(long id){if(activeSale(id)) Asserts.fail("该订单存在售后处理，请先处理售后再继续履约");}
 private void event(long id,String stage,long actor,String role,String note){db.update("INSERT INTO aster_shipment_event(order_id,stage,actor_id,actor_role,note) VALUES(?,?,?,?,?)",id,stage,actor,role,note);}
 private boolean has(long id,String stage){return db.queryForObject("SELECT COUNT(*) FROM aster_shipment_event WHERE order_id=? AND stage=?",Long.class,id,stage)>0;}
 @Transactional
 public void advance(long id,long admin,String stage,String note){
  if((!"SHIPPED".equals(stage) && !"DELIVERING".equals(stage)) || note==null || note.isBlank() || note.length()>300) Asserts.fail("请填写1–300字的配送备注");
  var row=order(id,null,true);
  var previous=db.queryForList("SELECT actor_id,note FROM aster_shipment_event WHERE order_id=? AND stage=?",id,stage);
  if(!previous.isEmpty()){
   if(((Number)previous.get(0).get("actor_id")).longValue()!=admin || !previous.get(0).get("note").equals(note.trim())) Asserts.fail("该配送节点已记录，请刷新查看");
   return;
  }
  allowed(id);
  int status=((Number)row.get("status")).intValue();
  if(stage.equals("SHIPPED")){
   if(status!=1) Asserts.fail("仅待发货订单可以发货");
   db.update("UPDATE oms_order SET status=2,delivery_company='星序模拟配送',delivery_sn=?,delivery_time=NOW(),modify_time=NOW() WHERE id=?","SIM-ASTER-"+id,id);
  }else if(status!=2 || !has(id,"SHIPPED")) Asserts.fail("仅已模拟发货的订单可以更新配送");
  event(id,stage,admin,"ADMIN",note.trim());
 }
 @Transactional
 public void receive(long id,long member){
  var row=order(id,member,true);
  if(has(id,"RECEIVED")) return;
  allowed(id);
  if(((Number)row.get("status")).intValue()!=2 || !has(id,"SHIPPED")) Asserts.fail("当前订单不能确认收货");
  db.update("UPDATE oms_order SET status=3,confirm_status=1,receive_time=NOW(),modify_time=NOW() WHERE id=?",id);
  event(id,"RECEIVED",member,"CUSTOMER","客户确认收货，模拟履约已完成");
 }
}
