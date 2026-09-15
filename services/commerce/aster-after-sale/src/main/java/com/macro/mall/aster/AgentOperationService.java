package com.macro.mall.aster;

import com.macro.mall.common.api.ResultCode;
import com.macro.mall.common.exception.Asserts;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.*;

/** Original Aster: Java owns identity, action parameters, expiry and one-time confirmation. */
@Service
public class AgentOperationService {
    private final JdbcTemplate db;
    private final AfterSaleService sales;
    public AgentOperationService(JdbcTemplate db, AfterSaleService sales) { this.db=db; this.sales=sales; }
    private static String secret() { byte[] b=new byte[32]; new SecureRandom().nextBytes(b); return Base64.getUrlEncoder().withoutPadding().encodeToString(b); }
    private static String hash(String value) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8))); }
        catch(Exception e) { throw new IllegalStateException("Digest unavailable"); }
    }
    public Map<String,Object> grant(long memberId) {
        String token=secret();
        db.update("DELETE FROM aster_agent_grant WHERE expires_at<NOW() LIMIT 1000");
        db.update("INSERT INTO aster_agent_grant VALUES(?,?,DATE_ADD(NOW(),INTERVAL 15 MINUTE))",hash(token),memberId);
        return Map.of("memberId",memberId,"executionToken",token,"expiresIn",900);
    }
    public long identify(String token) {
        if(token==null || token.length()>200) Asserts.fail(ResultCode.UNAUTHORIZED);
        var rows=db.queryForList("SELECT member_id FROM aster_agent_grant WHERE token_hash=? AND expires_at>NOW()",hash(token));
        if(rows.isEmpty()) Asserts.fail(ResultCode.UNAUTHORIZED);
        return ((Number)rows.get(0).get("member_id")).longValue();
    }
    public List<Map<String,Object>> orders(long memberId) {
        return db.queryForList("SELECT id,order_sn,status,pay_amount,create_time FROM oms_order WHERE member_id=? AND delete_status=0 ORDER BY id DESC LIMIT 20",memberId);
    }
    public Map<String,Object> order(long memberId,long id) {
        var rows=db.queryForList("SELECT id,order_sn,status,pay_amount,create_time FROM oms_order WHERE id=? AND member_id=? AND delete_status=0",id,memberId);
        if(rows.isEmpty()) Asserts.fail("订单不存在或无权访问");
        var result=rows.get(0);
        result.put("items",db.queryForList("SELECT product_name,product_quantity,product_price FROM oms_order_item WHERE order_id=?",id));
        return result;
    }
    @Transactional
    public Map<String,Object> preview(long memberId,long orderId,String reason) {
        if(reason==null || reason.isBlank() || reason.length()>500) Asserts.fail("请提供 1–500 字的售后原因");
        var order=order(memberId,orderId);
        int status=((Number)order.get("status")).intValue();
        if(status<1 || status>3) Asserts.fail("该订单当前不可申请售后");
        if(db.queryForObject("SELECT COUNT(*) FROM aster_after_sale WHERE order_id=?",Integer.class,orderId)>0) Asserts.fail("该订单已有售后申请，请查询进度");
        String id=UUID.randomUUID().toString(),confirmation=secret();
        db.update("INSERT INTO aster_agent_operation(id,member_id,order_id,reason,amount,confirmation_hash,expires_at) VALUES(?,?,?,?,?,?,DATE_ADD(NOW(),INTERVAL 10 MINUTE))",id,memberId,orderId,reason.trim(),order.get("pay_amount"),hash(confirmation));
        var result=status(memberId,id);
        result.put("confirmationToken",confirmation);
        return result;
    }
    public Map<String,Object> status(long memberId,String id) {
        var rows=db.queryForList("SELECT id,order_id,reason,amount,status,case_id,expires_at,consumed_at FROM aster_agent_operation WHERE id=? AND member_id=?",id,memberId);
        if(rows.isEmpty()) Asserts.fail("操作不存在或无权访问");
        var result=rows.get(0);
        var expiry=((java.sql.Timestamp)result.get("expires_at")).toInstant();
        result.put("expired",!expiry.isAfter(java.time.Instant.now()));
        result.put("expires_at",expiry.toString());
        return result;
    }
    @Transactional
    public Map<String,Object> confirm(long memberId,String id,String confirmation) {
        var rows=db.queryForList("SELECT * FROM aster_agent_operation WHERE id=? AND member_id=? FOR UPDATE",id,memberId);
        if(rows.isEmpty()) Asserts.fail("操作不存在或无权访问");
        var op=rows.get(0);
        if(confirmation==null || !MessageDigest.isEqual(hash(confirmation).getBytes(StandardCharsets.UTF_8),op.get("confirmation_hash").toString().getBytes(StandardCharsets.UTF_8))) Asserts.fail("确认凭据不匹配");
        if("SUCCEEDED".equals(op.get("status"))) return status(memberId,id);
        if(!Set.of("PREVIEW","CONFIRMED").contains(op.get("status")) || !((java.sql.Timestamp)op.get("expires_at")).toInstant().isAfter(java.time.Instant.now())) Asserts.fail("预览已失效或已取消，请重新发起");
        db.update("UPDATE aster_agent_operation SET status='CONFIRMED' WHERE id=?",id);
        return status(memberId,id);
    }
    @Transactional
    public Map<String,Object> execute(long memberId,String id) {
        var rows=db.queryForList("SELECT * FROM aster_agent_operation WHERE id=? AND member_id=? FOR UPDATE",id,memberId);
        if(rows.isEmpty()) Asserts.fail("操作不存在或无权访问");
        var op=rows.get(0);
        if("SUCCEEDED".equals(op.get("status"))) return status(memberId,id);
        if(!"CONFIRMED".equals(op.get("status")) || !((java.sql.Timestamp)op.get("expires_at")).toInstant().isAfter(java.time.Instant.now())) Asserts.fail("需要客户确认，或确认已过期");
        // Re-read authoritative order state inside the same transaction as consumption and submission.
        var currentRows=db.queryForList("SELECT pay_amount FROM oms_order WHERE id=? AND member_id=? AND delete_status=0 FOR UPDATE",op.get("order_id"),memberId);
        if(currentRows.isEmpty()) Asserts.fail("订单不存在或无权访问");
        var current=currentRows.get(0);
        if(((java.math.BigDecimal)current.get("pay_amount")).compareTo((java.math.BigDecimal)op.get("amount"))!=0) Asserts.fail("订单金额已变化，请重新预览");
        if(db.queryForObject("SELECT COUNT(*) FROM aster_after_sale WHERE order_id=?",Integer.class,op.get("order_id"))>0) Asserts.fail("该订单已有售后申请，请查询进度");
        var sale=sales.submit(memberId,((Number)op.get("order_id")).longValue(),op.get("reason").toString());
        db.update("UPDATE aster_agent_operation SET status='SUCCEEDED',case_id=?,consumed_at=NOW() WHERE id=?",sale.get("id"),id);
        return status(memberId,id);
    }
    public void cancel(long memberId,String id) {
        db.update("UPDATE aster_agent_operation SET status='CANCELLED' WHERE id=? AND member_id=? AND status IN ('PREVIEW','CONFIRMED')",id,memberId);
    }
}
