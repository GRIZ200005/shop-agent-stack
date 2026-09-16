package com.macro.mall.shopagentstack.admin;
import com.macro.mall.shopagentstack.SupportService;
import com.macro.mall.common.api.CommonResult;
import org.springframework.web.bind.annotation.*;
import java.security.Principal;
/** Original ShopAgentStack: live staff role check on every support request. */
@RestController @RequestMapping("/shop_agent_stack/support")
public class ShopAgentStackSupportController {
 private final SupportService support;private final ShopAgentStackStaffAccess access;
 public ShopAgentStackSupportController(SupportService s,ShopAgentStackStaffAccess a){support=s;access=a;}
 private long staff(Principal p){return ((Number)access.require(p,false).get("id")).longValue();}
 public record Reply(String requestId,String content){}
 @GetMapping public CommonResult<?> list(Principal p,@RequestParam(defaultValue="0") int page){staff(p);return CommonResult.success(support.list(null,page));}
 @GetMapping("/{id}") public CommonResult<?> detail(Principal p,@PathVariable String id){staff(p);return CommonResult.success(support.detail(id,null));}
 @PostMapping("/{id}/claim") public CommonResult<?> claim(Principal p,@PathVariable String id){support.claim(id,staff(p));return CommonResult.success(null);}
 @PostMapping("/{id}/messages") public CommonResult<?> reply(Principal p,@PathVariable String id,@RequestBody Reply b){support.reply(id,staff(p),true,b.requestId(),b.content());return CommonResult.success(null);}
 @PostMapping("/{id}/resolve") public CommonResult<?> resolve(Principal p,@PathVariable String id){support.resolve(id,staff(p));return CommonResult.success(null);}
}
