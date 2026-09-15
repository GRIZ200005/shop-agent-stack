package com.macro.mall.aster;

import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import com.macro.mall.common.exception.ApiException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class AgentOperationTest {
    private final JdbcTemplate db=mock(JdbcTemplate.class);
    private final AfterSaleService sales=mock(AfterSaleService.class);
    private final AgentOperationService service=new AgentOperationService(db,sales);

    @Test void expiredConfirmedOperationCannotSubmit() {
        when(db.queryForList(anyString(),eq("operation"),eq(1L))).thenReturn(List.of(Map.of("status","CONFIRMED","expires_at",Timestamp.from(Instant.now().minusSeconds(1)))));
        assertThrows(ApiException.class,()->service.execute(1,"operation"));
        verifyNoInteractions(sales);
    }

    @Test void previewCannotSkipConfirmation() {
        when(db.queryForList(anyString(),eq("operation"),eq(1L))).thenReturn(List.of(Map.of("status","PREVIEW","expires_at",Timestamp.from(Instant.now().plusSeconds(60)))));
        assertThrows(ApiException.class,()->service.execute(1,"operation"));
        verifyNoInteractions(sales);
    }

    @Test void expiredOrUnknownGrantCannotResolveIdentity() {
        when(db.queryForList(anyString(),anyString())).thenReturn(List.of());
        assertThrows(ApiException.class,()->service.identify("expired-synthetic-token"));
        verifyNoInteractions(sales);
    }
}
