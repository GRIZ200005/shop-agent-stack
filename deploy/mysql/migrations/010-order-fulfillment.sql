-- Original Aster: one simulated shipment per order, with an ordered event history.
CREATE TABLE IF NOT EXISTS aster_shipment_event (
 id BIGINT AUTO_INCREMENT PRIMARY KEY,
 order_id BIGINT NOT NULL,
 stage VARCHAR(20) NOT NULL,
 actor_id BIGINT NOT NULL,
 actor_role VARCHAR(12) NOT NULL,
 note VARCHAR(300) NOT NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE KEY uq_shipment_stage(order_id,stage)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
