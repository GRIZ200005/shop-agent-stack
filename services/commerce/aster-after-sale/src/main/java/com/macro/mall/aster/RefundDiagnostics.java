package com.macro.mall.aster;

import com.macro.mall.common.exception.Asserts;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;
import java.util.Map;

/** Read-only internal reconciliation. Legacy synchronous refunds are deliberately outside this scope. */
@Service
public class RefundDiagnostics {
    private final JdbcTemplate db;
    public RefundDiagnostics(JdbcTemplate db) { this.db=db; }
    private static final String SOURCE="""
        SELECT ids.case_id,j.status job_status,j.attempts,j.last_error,j.next_attempt_at,j.created_at,
               a.order_id,a.status sale_status,a.amount,a.refund_reference,
               o.status order_status,o.pay_amount,l.case_id ledger_case_id,l.order_id ledger_order_id,
               l.amount ledger_amount,l.reference ledger_reference,
               (SELECT COUNT(*) FROM aster_after_sale_event e WHERE e.case_id=ids.case_id AND e.action='REFUNDED') refund_events
        FROM (SELECT case_id FROM aster_refund_job UNION SELECT case_id FROM aster_simulated_refund
              UNION SELECT id FROM aster_after_sale WHERE status IN ('REFUNDING','REFUND_REVIEW')) ids
        LEFT JOIN aster_refund_job j ON j.case_id=ids.case_id
        LEFT JOIN aster_after_sale a ON a.id=ids.case_id
        LEFT JOIN oms_order o ON o.id=a.order_id
        LEFT JOIN aster_simulated_refund l ON l.case_id=ids.case_id
        """;
    private static final String CLASSIFIED="SELECT x.*, CASE " +
        "WHEN job_status='DONE' AND sale_status='REFUNDED' AND order_status=4 AND ledger_case_id IS NOT NULL " +
        "AND order_id=ledger_order_id AND amount=pay_amount AND amount=ledger_amount AND refund_reference=ledger_reference AND refund_events=1 THEN 'CONSISTENT' " +
        "WHEN job_status='PENDING' AND sale_status='REFUNDING' AND ledger_case_id IS NULL AND order_status IN (1,2,3) AND amount=pay_amount AND refund_events=0 THEN 'PENDING' " +
        "WHEN job_status='REVIEW' AND sale_status='REFUND_REVIEW' AND ledger_case_id IS NULL AND order_status IN (1,2,3) AND amount=pay_amount AND refund_events=0 THEN 'REVIEW' " +
        "ELSE 'MISMATCH' END reconciliation FROM ("+SOURCE+") x";

    @Transactional(readOnly=true,isolation=Isolation.REPEATABLE_READ)
    public Map<String,Object> monitor(long before) {
        if(before<0) Asserts.fail("分页参数无效");
        var summary=db.queryForMap("SELECT COUNT(*) total,COALESCE(SUM(reconciliation='CONSISTENT'),0) consistent,COALESCE(SUM(job_status='PENDING'),0) pending,COALESCE(SUM(job_status='REVIEW'),0) review,COALESCE(SUM(reconciliation='MISMATCH'),0) mismatches,COALESCE(SUM(job_status='PENDING' AND next_attempt_at<=NOW()),0) due,COALESCE(MAX(CASE WHEN job_status='PENDING' THEN TIMESTAMPDIFF(SECOND,created_at,NOW()) ELSE 0 END),0) oldest_pending_seconds FROM ("+CLASSIFIED+") checks");
        var rows=db.queryForList("SELECT * FROM ("+CLASSIFIED+") checks WHERE (?=0 OR case_id<?) ORDER BY case_id DESC LIMIT 50",before,before);
        return Map.of("summary",summary,"rows",rows,"next_before",rows.size()==50?rows.get(rows.size()-1).get("case_id"):0,"scope","P4_ASYNC_SIMULATOR");
    }

    @Transactional(readOnly=true,isolation=Isolation.REPEATABLE_READ)
    public Map<String,Object> check(long id) {
        var rows=db.queryForList("SELECT * FROM ("+CLASSIFIED+") checks WHERE case_id=?",id);
        if(!rows.isEmpty()) return rows.get(0);
        var sales=db.queryForList("SELECT status FROM aster_after_sale WHERE id=?",id);
        if(sales.isEmpty()) Asserts.fail("售后不存在");
        return Map.of("case_id",id,"reconciliation","REFUNDED".equals(sales.get(0).get("status"))?"LEGACY_NOT_TRACKED":"NOT_STARTED");
    }
}
