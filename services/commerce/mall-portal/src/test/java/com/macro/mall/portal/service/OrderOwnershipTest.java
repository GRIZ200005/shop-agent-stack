package com.macro.mall.portal.service;

import com.macro.mall.mapper.OmsOrderMapper;
import com.macro.mall.mapper.OmsOrderItemMapper;
import com.macro.mall.model.*;
import com.macro.mall.portal.domain.OrderParam;
import com.macro.mall.portal.service.impl.OmsPortalOrderServiceImpl;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import java.util.List;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

/** ShopAgentStack tests: denied reads must not reach order-item loading; denied writes create no order. */
class OrderOwnershipTest {
    private OmsPortalOrderServiceImpl service;
    private OmsOrderMapper orders;
    private OmsOrderItemMapper items;
    private UmsMemberReceiveAddressService addresses;
    private OmsCartItemService carts;

    @BeforeEach void setUp() {
        service = new OmsPortalOrderServiceImpl();
        orders = mock(OmsOrderMapper.class);
        items = mock(OmsOrderItemMapper.class);
        addresses = mock(UmsMemberReceiveAddressService.class);
        carts = mock(OmsCartItemService.class);
        UmsMemberService members = mock(UmsMemberService.class);
        UmsMember member = new UmsMember(); member.setId(10L);
        when(members.getCurrentMember()).thenReturn(member);
        ReflectionTestUtils.setField(service, "orderMapper", orders);
        ReflectionTestUtils.setField(service, "orderItemMapper", items);
        ReflectionTestUtils.setField(service, "memberService", members);
        ReflectionTestUtils.setField(service, "memberReceiveAddressService", addresses);
        ReflectionTestUtils.setField(service, "cartItemService", carts);
    }

    @Test void otherMemberCannotReadOrder() {
        OmsOrder order = new OmsOrder(); order.setId(1L); order.setMemberId(20L);
        when(orders.selectByPrimaryKey(1L)).thenReturn(order);
        assertThrows(RuntimeException.class, () -> service.detail(1L));
        verifyNoInteractions(items);
    }
    @Test void absentOrderReturnsControlledFailure() {
        RuntimeException error = assertThrows(RuntimeException.class, () -> service.detail(999L));
        assertEquals("Order not available", error.getMessage());
        verifyNoInteractions(items);
    }
    @Test void ownerCanReadOrder() {
        OmsOrder order = new OmsOrder(); order.setId(1L); order.setMemberId(10L);
        when(orders.selectByPrimaryKey(1L)).thenReturn(order);
        when(items.selectByExample(any())).thenReturn(List.of());
        assertEquals(1L, service.detail(1L).getId());
    }
    @Test void otherMembersAddressCannotBeUsed() {
        OrderParam input = new OrderParam(); input.setMemberReceiveAddressId(2L);
        UmsMemberReceiveAddress address = new UmsMemberReceiveAddress(); address.setMemberId(20L);
        when(addresses.getItem(2L)).thenReturn(address);
        assertThrows(RuntimeException.class, () -> service.generateOrder(input));
        verifyNoInteractions(orders);
    }
    @Test void emptyCartCreatesNoOrder() {
        OrderParam input = new OrderParam(); input.setMemberReceiveAddressId(2L);
        UmsMemberReceiveAddress address = new UmsMemberReceiveAddress(); address.setMemberId(10L);
        when(addresses.getItem(2L)).thenReturn(address);
        when(carts.listPromotion(eq(10L), any())).thenReturn(List.of());
        RuntimeException error = assertThrows(RuntimeException.class, () -> service.generateOrder(input));
        assertEquals("At least one cart item is required", error.getMessage());
        verifyNoInteractions(orders);
    }
}
