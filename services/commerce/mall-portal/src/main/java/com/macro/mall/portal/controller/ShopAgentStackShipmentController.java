package com.macro.mall.portal.controller;
import com.macro.mall.shopagentstack.FulfillmentService;
import com.macro.mall.common.api.CommonResult;
import com.macro.mall.portal.service.UmsMemberService;
import org.springframework.web.bind.annotation.*;
/** Original ShopAgentStack: shipment ownership comes only from the current login. */
@RestController @RequestMapping("/shop_agent_stack/orders")
public class ShopAgentStackShipmentController {
 private final FulfillmentService service;private final UmsMemberService members;
 public ShopAgentStackShipmentController(FulfillmentService s,UmsMemberService m){service=s;members=m;}
 @GetMapping("/{id}/shipment") public CommonResult<?> detail(@PathVariable long id){return CommonResult.success(service.detail(id,members.getCurrentMember().getId()));}
 @PostMapping("/{id}/receive") public CommonResult<?> receive(@PathVariable long id){service.receive(id,members.getCurrentMember().getId());return CommonResult.success(null);}
}
