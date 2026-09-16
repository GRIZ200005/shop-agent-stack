package com.macro.mall.portal.service;

import com.macro.mall.common.exception.ApiException;
import com.macro.mall.model.OmsCartItem;
import com.macro.mall.model.PmsSkuStock;
import com.macro.mall.portal.dao.PortalProductDao;
import com.macro.mall.portal.domain.PromotionProduct;
import com.macro.mall.portal.service.impl.OmsPromotionServiceImpl;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import java.math.BigDecimal;
import java.util.List;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

/** ShopAgentStack regression tests for server-side checkout pricing. */
class CartPricingTest {
    private OmsPromotionServiceImpl service;
    private OmsCartItem cart;
    private PortalProductDao products;

    @BeforeEach void setUp() {
        service = new OmsPromotionServiceImpl();
        products = mock(PortalProductDao.class);
        ReflectionTestUtils.setField(service, "portalProductDao", products);
        PromotionProduct product = new PromotionProduct();
        product.setId(1L); product.setPromotionType(0); product.setGiftPoint(0); product.setGiftGrowth(0);
        PmsSkuStock sku = new PmsSkuStock();
        sku.setId(1L); sku.setPrice(new BigDecimal("49.90")); sku.setStock(100); sku.setLockStock(0);
        product.setSkuStockList(List.of(sku));
        when(products.getPromotionProductList(any())).thenReturn(List.of(product));
        cart = new OmsCartItem();
        cart.setProductId(1L); cart.setProductSkuId(1L); cart.setQuantity(2); cart.setPrice(new BigDecimal("0.01"));
    }
    @Test void forgedPriceIsReplacedWithCatalogPrice() {
        var result = service.calcCartPromotion(List.of(cart));
        assertEquals(new BigDecimal("49.90"), result.get(0).getPrice());
        assertEquals(new BigDecimal("99.80"), result.get(0).getPrice().multiply(BigDecimal.valueOf(result.get(0).getQuantity())));
    }
    @Test void unknownSkuIsRejected() {
        cart.setProductSkuId(99L);
        assertThrows(ApiException.class, () -> service.calcCartPromotion(List.of(cart)));
    }
    @Test void nonPositiveQuantityIsRejected() {
        cart.setQuantity(0);
        assertThrows(ApiException.class, () -> service.calcCartPromotion(List.of(cart)));
    }
    @Test void unknownProductIsRejected() {
        when(products.getPromotionProductList(any())).thenReturn(List.of());
        assertThrows(ApiException.class, () -> service.calcCartPromotion(List.of(cart)));
    }
}
