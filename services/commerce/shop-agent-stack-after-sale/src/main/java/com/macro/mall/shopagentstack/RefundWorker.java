package com.macro.mall.shopagentstack;

import java.nio.charset.StandardCharsets;
import java.util.concurrent.TimeUnit;
import java.util.UUID;
import org.springframework.amqp.AmqpRejectAndDontRequeueException;
import org.springframework.amqp.core.*;
import org.springframework.amqp.rabbit.annotation.EnableRabbit;
import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.amqp.rabbit.connection.ConnectionFactory;
import org.springframework.amqp.rabbit.connection.CorrelationData;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;

/** At-least-once dispatcher; job stays pending until the consumer commits its result. */
@Configuration
@EnableRabbit
@EnableScheduling
@ConditionalOnProperty(name="shop_agent_stack.refund.enabled",havingValue="true")
public class RefundWorker {
    public static final String QUEUE="shop_agent_stack.refunds.v1";
    private final JdbcTemplate db;
    private final RefundService refunds;
    private final RabbitTemplate rabbit;
    public RefundWorker(JdbcTemplate db,RefundService refunds,ConnectionFactory connection) {
        this.db=db; this.refunds=refunds;
        this.rabbit=new RabbitTemplate(connection); this.rabbit.setMandatory(true);
    }
    @Bean public Declarables refundQueues() {
        return new Declarables(QueueBuilder.durable(QUEUE).deadLetterExchange("").deadLetterRoutingKey(QUEUE+".parking").build(),
                QueueBuilder.durable(QUEUE+".parking").build());
    }
    @Scheduled(fixedDelayString="${shop_agent_stack.refund.poll-ms:2000}")
    public void dispatch() {
        for(var row:db.queryForList("SELECT case_id,attempts FROM shop_agent_stack_refund_job WHERE status='PENDING' AND next_attempt_at<=NOW() ORDER BY next_attempt_at LIMIT 10")) {
            long id=((Number)row.get("case_id")).longValue();
            if(((Number)row.get("attempts")).intValue()>=20) { refunds.exhaust(id); continue; }
            // CAS lease: a competing dispatcher or crash can cause duplicates, never missing intent.
            if(db.update("UPDATE shop_agent_stack_refund_job SET attempts=attempts+1,next_attempt_at=TIMESTAMPADD(SECOND,30,NOW()) WHERE case_id=? AND status='PENDING' AND next_attempt_at<=NOW() AND attempts<20",id)!=1) continue;
            try {
                var properties=new MessageProperties(); properties.setDeliveryMode(MessageDeliveryMode.PERSISTENT);
                properties.setMessageId("refund:"+id); properties.setContentType("text/plain");
                var correlation=new CorrelationData(UUID.randomUUID().toString());
                rabbit.send("",QUEUE,new Message(Long.toString(id).getBytes(StandardCharsets.UTF_8),properties),correlation);
                if(!correlation.getFuture().get(5,TimeUnit.SECONDS).isAck() || correlation.getReturned()!=null) throw new IllegalStateException("Publish not confirmed");
                // A broker ACK must not erase a prior business-consumer failure.
            } catch(Exception error) {
                if(error instanceof InterruptedException) Thread.currentThread().interrupt();
                db.update("UPDATE shop_agent_stack_refund_job SET last_error='PUBLISH_UNCONFIRMED' WHERE case_id=? AND status='PENDING'",id);
            }
        }
    }
    @RabbitListener(queues=QUEUE,concurrency="1",ackMode="AUTO")
    public void consume(Message message) {
        Long id=null;
        try {
            String body=new String(message.getBody(),StandardCharsets.UTF_8);
            if(!body.matches("[1-9][0-9]{0,17}")) throw new IllegalArgumentException("Invalid refund ID");
            id=Long.parseLong(body);
            refunds.complete(id); // Transaction proxy commits before listener ACK.
        } catch(Exception error) {
            if(id!=null) {
                try { refunds.recordFailure(id,error instanceof IllegalStateException?"BUSINESS_STATE_CONFLICT":"CONSUMER_FAILURE"); }
                catch(Exception ignored) { /* DB outage must not turn a failed delivery into an ACK. */ }
            }
            // Park the failed delivery; persistent DB intent drives bounded delayed retries.
            throw new AmqpRejectAndDontRequeueException("Refund not applied; outbox will retry",error);
        }
    }
}
