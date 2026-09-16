package com.macro.mall.shopagentstack.admin;
import com.macro.mall.shopagentstack.FulfillmentService;
import com.macro.mall.common.api.CommonResult;
import org.springframework.web.bind.annotation.*;
import java.security.Principal;
/** Original ShopAgentStack: live administrator checks for order fulfillment. */
@RestController @RequestMapping("/shop_agent_stack/fulfillment")
public class ShopAgentStackFulfillmentController {
 private final FulfillmentService service;private final ShopAgentStackStaffAccess access;
 public ShopAgentStackFulfillmentController(FulfillmentService s,ShopAgentStackStaffAccess a){service=s;access=a;}
 private long admin(Principal p){return ((Number)access.require(p,true).get("id")).longValue();}
 public record Update(String stage,String note){}
 @GetMapping public CommonResult<?> list(Principal p,@RequestParam(required=false) Integer status,@RequestParam(defaultValue="") String query,@RequestParam(defaultValue="0") int page){admin(p);return CommonResult.success(service.list(status,query,page));}
 @GetMapping("/{id}") public CommonResult<?> detail(Principal p,@PathVariable long id){admin(p);return CommonResult.success(service.detail(id,null));}
 @PostMapping("/{id}/advance") public CommonResult<?> advance(Principal p,@PathVariable long id,@RequestBody Update body){service.advance(id,admin(p),body.stage(),body.note());return CommonResult.success(null);}
}
