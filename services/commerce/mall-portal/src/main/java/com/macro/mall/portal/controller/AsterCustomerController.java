package com.macro.mall.portal.controller;

import com.macro.mall.aster.AfterSaleService;
import com.macro.mall.common.api.CommonResult;
import com.macro.mall.portal.service.UmsMemberService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import org.springframework.web.bind.annotation.*;

/** Original Aster customer endpoints; identity always comes from authenticated membership. */
@RestController
@RequestMapping("/aster")
public class AsterCustomerController {
    private final AfterSaleService sales;
    private final UmsMemberService members;
    public AsterCustomerController(AfterSaleService sales,UmsMemberService members) { this.sales=sales; this.members=members; }
    public record Request(@NotNull @Positive Long orderId,@NotBlank @Size(max=500) String reason) {}
    private long member() { return members.getCurrentMember().getId(); }
    @PostMapping("/orders/{id}/simulate-payment") public CommonResult<?> pay(@PathVariable long id) { sales.simulatePayment(id,member()); return CommonResult.success(null); }
    @GetMapping("/after-sales") public CommonResult<?> list() { return CommonResult.success(sales.mine(member())); }
    @GetMapping("/after-sales/{id}") public CommonResult<?> detail(@PathVariable long id) { return CommonResult.success(sales.detail(id,member())); }
    @PostMapping("/after-sales") public CommonResult<?> submit(@Valid @RequestBody Request body) { return CommonResult.success(sales.submit(member(),body.orderId(),body.reason())); }
    @GetMapping("/policies") public CommonResult<?> policies() { member(); return CommonResult.success(sales.policies(false)); }
}
