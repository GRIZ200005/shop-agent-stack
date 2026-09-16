package com.macro.mall.shopagentstack;

import com.macro.mall.common.exception.Asserts;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

/** Original ShopAgentStack domain. Approval and refund outbox are committed atomically. */
@Service
public class AfterSaleService {
    private final JdbcTemplate db;
    public AfterSaleService(JdbcTemplate db) { this.db = db; }

    private Map<String,Object> order(long id, long memberId) {
        var rows = db.queryForList("SELECT id,member_id,pay_amount,status FROM oms_order WHERE id=? AND delete_status=0 FOR UPDATE", id);
        if (rows.isEmpty() || ((Number) rows.get(0).get("member_id")).longValue() != memberId) Asserts.fail("订单不存在或无权访问");
        return rows.get(0);
    }
    @Transactional
    public void simulatePayment(long id, long memberId) {
        var order = order(id, memberId);
        int status = ((Number)order.get("status")).intValue();
        if (status == 1) return;
        if (status != 0) Asserts.fail("当前订单不能模拟支付");
        // Lock SKU rows in a stable order and update inventory as one transaction.
        var items = db.queryForList("SELECT product_sku_id,SUM(product_quantity) quantity FROM oms_order_item WHERE order_id=? GROUP BY product_sku_id ORDER BY product_sku_id", id);
        for (var item : items) {
            int quantity = ((Number)item.get("quantity")).intValue();
            if (quantity <= 0 || db.update("UPDATE pms_sku_stock SET stock=stock-?,lock_stock=lock_stock-?,sale=COALESCE(sale,0)+? WHERE id=? AND stock>=? AND lock_stock>=?", quantity,quantity,quantity,item.get("product_sku_id"),quantity,quantity) != 1) Asserts.fail("库存状态异常，请联系管理员");
        }
        db.update("UPDATE oms_order SET status=1,pay_type=0,payment_time=NOW() WHERE id=?", id);
    }
    @Transactional
    public Map<String,Object> submit(long memberId, long orderId, String reason) {
        if (reason == null || reason.isBlank() || reason.length()>500) Asserts.fail("请填写 1–500 字的售后原因");
        var order = order(orderId,memberId);
        var existing = db.queryForList("SELECT * FROM shop_agent_stack_after_sale WHERE order_id=?", orderId);
        if (!existing.isEmpty()) return detail(((Number)existing.get(0).get("id")).longValue(),memberId);
        int status = ((Number)order.get("status")).intValue();
        if (status < 1 || status > 3) Asserts.fail("仅已支付订单可申请售后");
        BigDecimal amount = (BigDecimal)order.get("pay_amount");
        if (amount == null || amount.signum()<=0) Asserts.fail("订单金额异常");
        db.update("INSERT INTO shop_agent_stack_after_sale(order_id,member_id,reason,amount) VALUES(?,?,?,?)", orderId,memberId,reason.trim(),amount);
        long id = db.queryForObject("SELECT id FROM shop_agent_stack_after_sale WHERE order_id=?",Long.class,orderId);
        event(id,"customer:"+memberId,"SUBMITTED","客户提交售后申请");
        return detail(id,memberId);
    }
    public List<Map<String,Object>> mine(long memberId) { return db.queryForList("SELECT * FROM shop_agent_stack_after_sale WHERE member_id=? ORDER BY id DESC LIMIT 100",memberId); }
    public Map<String,Object> detail(long id, Long memberId) {
        var rows = memberId == null ? db.queryForList("SELECT * FROM shop_agent_stack_after_sale WHERE id=?",id) : db.queryForList("SELECT * FROM shop_agent_stack_after_sale WHERE id=? AND member_id=?",id,memberId);
        if (rows.isEmpty()) Asserts.fail("售后不存在或无权访问");
        var result=rows.get(0);
        result.put("events",db.queryForList("SELECT action,note,created_at FROM shop_agent_stack_after_sale_event WHERE case_id=? ORDER BY id",id));
        return result;
    }
    public List<Map<String,Object>> queue() { return db.queryForList("SELECT a.*,u.nick_name assignee_name FROM shop_agent_stack_after_sale a LEFT JOIN ums_admin u ON u.id=a.assignee_id ORDER BY a.id DESC LIMIT 100"); }
    @Transactional
    public void claim(long id,long staffId) {
        if (db.update("UPDATE shop_agent_stack_after_sale SET status='CLAIMED',assignee_id=? WHERE id=? AND status='SUBMITTED' AND assignee_id IS NULL",staffId,id)!=1) Asserts.fail("工单已被领取或状态已更新，请刷新");
        event(id,"staff:"+staffId,"CLAIMED","客服已领取，进入人工处理");
    }
    @Transactional
    public void decide(long id,long staffId,boolean approved,String note) {
        if (note==null || note.isBlank() || note.length()>500) Asserts.fail("请填写 1–500 字的审核说明");
        var rows=db.queryForList("SELECT * FROM shop_agent_stack_after_sale WHERE id=? FOR UPDATE",id);
        if(rows.isEmpty()) Asserts.fail("售后不存在");
        var item=rows.get(0);
        if(!"CLAIMED".equals(item.get("status")) || item.get("assignee_id")==null || ((Number)item.get("assignee_id")).longValue()!=staffId) Asserts.fail("仅领取该工单的客服可审核，且不能重复审核");
        if(approved) {
            db.update("UPDATE shop_agent_stack_after_sale SET status='REFUNDING',decision_note=? WHERE id=?",note.trim(),id);
            db.update("INSERT INTO shop_agent_stack_refund_job(case_id) VALUES(?)",id);
            event(id,"staff:"+staffId,"APPROVED",note.trim());
        } else {
            db.update("UPDATE shop_agent_stack_after_sale SET status='REJECTED',decision_note=? WHERE id=?",note.trim(),id);
            event(id,"staff:"+staffId,"REJECTED",note.trim());
        }
    }
    private void event(long id,String actor,String action,String note) { db.update("INSERT INTO shop_agent_stack_after_sale_event(case_id,actor,action,note) VALUES(?,?,?,?)",id,actor,action,note); }
}
