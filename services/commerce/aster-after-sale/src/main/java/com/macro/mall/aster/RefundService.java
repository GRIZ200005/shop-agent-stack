package com.macro.mall.aster;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import com.macro.mall.common.exception.Asserts;
import java.math.BigDecimal;

/** The local simulator ledger and business result share a DB transaction, not an external payment API. */
@Service
public class RefundService {
    private final JdbcTemplate db;
    public RefundService(JdbcTemplate db) { this.db=db; }

    public void recordFailure(long id,String code) {
        if(!java.util.Set.of("BUSINESS_STATE_CONFLICT","CONSUMER_FAILURE").contains(code)) throw new IllegalArgumentException("Unknown failure code");
        db.update("UPDATE aster_refund_job SET last_error=? WHERE case_id=? AND status='PENDING'",code,id);
    }

    @Transactional
    public void complete(long id) {
        var rows=db.queryForList("SELECT * FROM aster_after_sale WHERE id=? FOR UPDATE",id);
        if(rows.isEmpty()) throw new IllegalArgumentException("Unknown refund case");
        var sale=rows.get(0);
        var jobs=db.queryForList("SELECT status FROM aster_refund_job WHERE case_id=? FOR UPDATE",id);
        if(jobs.isEmpty()) throw new IllegalArgumentException("Unknown refund job");
        if("REFUNDED".equals(sale.get("status")) && "DONE".equals(jobs.get(0).get("status"))) return;
        // A late delivery must not bypass exhausted retries / manual review.
        if(!"PENDING".equals(jobs.get(0).get("status"))) return;
        if(!"REFUNDING".equals(sale.get("status"))) throw new IllegalStateException("Refund state conflict");
        var orders=db.queryForList("SELECT status,pay_amount FROM oms_order WHERE id=? FOR UPDATE",sale.get("order_id"));
        if(orders.isEmpty()) throw new IllegalStateException("Order missing");
        var order=orders.get(0);
        int status=((Number)order.get("status")).intValue();
        if(status<1 || status>3 || ((BigDecimal)sale.get("amount")).compareTo((BigDecimal)order.get("pay_amount"))!=0)
            throw new IllegalStateException("Refund amount or order state changed");
        String reference="SIM-ASTER-"+id;
        db.update("INSERT INTO aster_simulated_refund(case_id,order_id,amount,reference) VALUES(?,?,?,?)",id,sale.get("order_id"),sale.get("amount"),reference);
        db.update("UPDATE oms_order SET status=4,note='Aster simulated refund completed' WHERE id=?",sale.get("order_id"));
        db.update("UPDATE aster_after_sale SET status='REFUNDED',refund_reference=? WHERE id=?",reference,id);
        db.update("UPDATE aster_refund_job SET status='DONE',last_error=NULL WHERE case_id=?",id);
        db.update("INSERT INTO aster_after_sale_event(case_id,actor,action,note) VALUES(?,'simulator','REFUNDED','模拟退款已完成，无真实资金流转')",id);
    }

    @Transactional
    public void exhaust(long id) {
        db.queryForList("SELECT id FROM aster_after_sale WHERE id=? FOR UPDATE",id);
        if(db.update("UPDATE aster_refund_job SET status='REVIEW',last_error='RETRY_EXHAUSTED' WHERE case_id=? AND status='PENDING' AND attempts>=20 AND next_attempt_at<=NOW()",id)==1) {
            db.update("UPDATE aster_after_sale SET status='REFUND_REVIEW' WHERE id=? AND status='REFUNDING'",id);
            db.update("INSERT INTO aster_after_sale_event(case_id,actor,action,note) VALUES(?,'refund-worker','REFUND_REVIEW','退款多次处理未完成，等待人工核实')",id);
        }
    }

    @Transactional
    public void retry(long id,long staffId) {
        var sales=db.queryForList("SELECT status,assignee_id FROM aster_after_sale WHERE id=? FOR UPDATE",id);
        if(sales.isEmpty() || !"REFUND_REVIEW".equals(sales.get(0).get("status")) || sales.get(0).get("assignee_id")==null || ((Number)sales.get(0).get("assignee_id")).longValue()!=staffId)
            Asserts.fail("仅原领取客服可重试待核实退款");
        if(db.update("UPDATE aster_refund_job SET status='PENDING',attempts=0,next_attempt_at=NOW(),last_error=NULL WHERE case_id=? AND status='REVIEW'",id)!=1) Asserts.fail("任务状态已变化");
        db.update("UPDATE aster_after_sale SET status='REFUNDING' WHERE id=?",id);
        db.update("INSERT INTO aster_after_sale_event(case_id,actor,action,note) VALUES(?,?,'REFUND_RETRY','客服核实后重新排队处理模拟退款')",id,"staff:"+staffId);
    }
}
