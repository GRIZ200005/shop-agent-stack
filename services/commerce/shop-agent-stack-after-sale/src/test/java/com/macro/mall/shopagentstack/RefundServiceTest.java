package com.macro.mall.shopagentstack;

import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.test.context.junit.jupiter.SpringJUnitConfig;
import org.springframework.transaction.annotation.EnableTransactionManagement;
import javax.sql.DataSource;
import java.util.concurrent.*;
import static org.junit.jupiter.api.Assertions.*;

@SpringJUnitConfig(RefundServiceTest.Config.class)
class RefundServiceTest {
    @Configuration @EnableTransactionManagement static class Config {
        @Bean DataSource dataSource() { return new DriverManagerDataSource("jdbc:h2:mem:refund;MODE=MySQL;DB_CLOSE_DELAY=-1","sa",""); }
        @Bean JdbcTemplate db(DataSource ds) { return new JdbcTemplate(ds); }
        @Bean DataSourceTransactionManager transactionManager(DataSource ds) { return new DataSourceTransactionManager(ds); }
        @Bean RefundService refunds(JdbcTemplate db) { return new RefundService(db); }
        @Bean AfterSaleService sales(JdbcTemplate db) { return new AfterSaleService(db); }
        @Bean RefundDiagnostics diagnostics(JdbcTemplate db) { return new RefundDiagnostics(db); }
    }
    @Autowired JdbcTemplate db;
    @Autowired RefundService refunds;
    @Autowired AfterSaleService sales;
    @Autowired RefundDiagnostics diagnostics;
    @BeforeEach void setup() {
        db.execute("DROP ALL OBJECTS");
        db.execute("CREATE TABLE oms_order(id BIGINT PRIMARY KEY,status INT,pay_amount DECIMAL(10,2),note VARCHAR(200))");
        db.execute("CREATE TABLE shop_agent_stack_after_sale(id BIGINT PRIMARY KEY,order_id BIGINT,amount DECIMAL(10,2),status VARCHAR(24),assignee_id BIGINT,decision_note VARCHAR(500),refund_reference VARCHAR(80))");
        db.execute("CREATE TABLE shop_agent_stack_refund_job(case_id BIGINT PRIMARY KEY,status VARCHAR(20) DEFAULT 'PENDING',attempts INT DEFAULT 0,next_attempt_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,last_error VARCHAR(80))");
        db.execute("CREATE TABLE shop_agent_stack_simulated_refund(case_id BIGINT PRIMARY KEY,order_id BIGINT UNIQUE,amount DECIMAL(10,2),reference VARCHAR(80) UNIQUE)");
        db.execute("CREATE TABLE shop_agent_stack_after_sale_event(case_id BIGINT,actor VARCHAR(80),action VARCHAR(40),note VARCHAR(500))");
        db.update("INSERT INTO oms_order VALUES(1,1,49.90,NULL)");
        db.update("INSERT INTO shop_agent_stack_after_sale VALUES(7,1,49.90,'CLAIMED',9,NULL,NULL)");
    }
    @Test void approvalOnlyQueuesUntilWorkerCommits() {
        sales.decide(7,9,true,"approved");
        assertEquals("REFUNDING",db.queryForObject("SELECT status FROM shop_agent_stack_after_sale",String.class));
        assertEquals(1,db.queryForObject("SELECT status FROM oms_order",Integer.class));
        refunds.complete(7);
        assertEquals("DONE",db.queryForObject("SELECT status FROM shop_agent_stack_refund_job",String.class));
        assertEquals(4,db.queryForObject("SELECT status FROM oms_order",Integer.class));
    }
    @Test void outboxInsertFailureRollsBackApproval() {
        db.update("INSERT INTO shop_agent_stack_refund_job(case_id) VALUES(7)");
        assertThrows(RuntimeException.class,()->sales.decide(7,9,true,"approved"));
        assertEquals("CLAIMED",db.queryForObject("SELECT status FROM shop_agent_stack_after_sale",String.class));
        assertEquals(0,db.queryForObject("SELECT COUNT(*) FROM shop_agent_stack_after_sale_event",Integer.class));
    }
    @Test void concurrentDuplicateDeliveryAppliesOnlyOnce() throws Exception {
        sales.decide(7,9,true,"approved");
        var pool=Executors.newFixedThreadPool(2); var start=new CountDownLatch(1);
        try {
            Callable<Void> work=()->{start.await();refunds.complete(7);return null;};
            var a=pool.submit(work); var b=pool.submit(work); start.countDown(); a.get(10,TimeUnit.SECONDS); b.get(10,TimeUnit.SECONDS);
        } finally { pool.shutdownNow(); }
        assertEquals(1,db.queryForObject("SELECT COUNT(*) FROM shop_agent_stack_simulated_refund",Integer.class));
        assertEquals(1,db.queryForObject("SELECT COUNT(*) FROM shop_agent_stack_after_sale_event WHERE action='REFUNDED'",Integer.class));
    }
    @Test void changedAmountCannotProduceRefund() {
        sales.decide(7,9,true,"approved"); db.update("UPDATE oms_order SET pay_amount=1");
        assertThrows(IllegalStateException.class,()->refunds.complete(7));
        assertEquals(0,db.queryForObject("SELECT COUNT(*) FROM shop_agent_stack_simulated_refund",Integer.class));
        assertEquals("PENDING",db.queryForObject("SELECT status FROM shop_agent_stack_refund_job",String.class));
    }
    @Test void exhaustedJobNeedsOwnerRetryAndLateMessageCannotBypassIt() {
        sales.decide(7,9,true,"approved"); db.update("UPDATE shop_agent_stack_refund_job SET attempts=20");
        refunds.exhaust(7); refunds.complete(7);
        assertEquals("REFUND_REVIEW",db.queryForObject("SELECT status FROM shop_agent_stack_after_sale",String.class));
        assertThrows(RuntimeException.class,()->refunds.retry(7,10));
        refunds.retry(7,9); refunds.complete(7);
        assertEquals(1,db.queryForObject("SELECT COUNT(*) FROM shop_agent_stack_simulated_refund",Integer.class));
    }
    @Test void reconcileDoesNotTreatPendingOrLegacyAsCorruption() {
        assertEquals("NOT_STARTED",diagnostics.check(7).get("reconciliation"));
        db.update("UPDATE shop_agent_stack_after_sale SET status='REFUNDED'");
        assertEquals("LEGACY_NOT_TRACKED",diagnostics.check(7).get("reconciliation"));
        db.update("UPDATE shop_agent_stack_after_sale SET status='CLAIMED'"); sales.decide(7,9,true,"approved");
        assertEquals("PENDING",diagnostics.check(7).get("reconciliation"));
        refunds.complete(7);
        assertEquals("CONSISTENT",diagnostics.check(7).get("reconciliation"));
        var summary=(java.util.Map<?,?>)diagnostics.monitor(0).get("summary");
        assertEquals(1,((Number)summary.get("total")).intValue());
        assertEquals(0,((Number)summary.get("mismatches")).intValue());
    }
    @Test void reconciliationDetectsMissingLedgerWrongAmountAndDuplicateEvent() {
        sales.decide(7,9,true,"approved"); refunds.complete(7);
        db.update("UPDATE shop_agent_stack_simulated_refund SET amount=1");
        assertEquals("MISMATCH",diagnostics.check(7).get("reconciliation"));
        db.update("UPDATE shop_agent_stack_simulated_refund SET amount=49.90");
        db.update("INSERT INTO shop_agent_stack_after_sale_event VALUES(7,'test','REFUNDED','duplicate')");
        assertEquals("MISMATCH",diagnostics.check(7).get("reconciliation"));
        db.update("DELETE FROM shop_agent_stack_simulated_refund");
        assertEquals("MISMATCH",diagnostics.check(7).get("reconciliation"));
        assertEquals("REFUNDED",db.queryForObject("SELECT status FROM shop_agent_stack_after_sale",String.class));
    }
    @Test void completedTaskCannotBeOverwrittenByFailureRecording() {
        sales.decide(7,9,true,"approved"); refunds.recordFailure(7,"BUSINESS_STATE_CONFLICT");
        assertEquals("BUSINESS_STATE_CONFLICT",db.queryForObject("SELECT last_error FROM shop_agent_stack_refund_job",String.class));
        refunds.complete(7); refunds.recordFailure(7,"CONSUMER_FAILURE");
        assertNull(db.queryForObject("SELECT last_error FROM shop_agent_stack_refund_job",String.class));
    }
}
