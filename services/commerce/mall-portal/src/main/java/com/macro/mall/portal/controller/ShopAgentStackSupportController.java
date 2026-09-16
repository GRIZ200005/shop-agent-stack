package com.macro.mall.portal.controller;
import com.macro.mall.shopagentstack.SupportService;
import com.macro.mall.common.api.CommonResult;
import com.macro.mall.portal.service.UmsMemberService;
import org.springframework.web.bind.annotation.*;
/** Original ShopAgentStack: customer ownership is resolved from the authenticated member. */
@RestController @RequestMapping("/shop_agent_stack/support")
public class ShopAgentStackSupportController {
 private final SupportService support;private final UmsMemberService members;
 public ShopAgentStackSupportController(SupportService s,UmsMemberService m){support=s;members=m;}
 public record Create(String requestId,String title,String context){}
 public record Reply(String requestId,String content){}
 private long member(){return members.getCurrentMember().getId();}
 @GetMapping public CommonResult<?> list(@RequestParam(defaultValue="0") int page){return CommonResult.success(support.list(member(),page));}
 @PostMapping public CommonResult<?> create(@RequestBody Create b){return CommonResult.success(support.create(member(),b.requestId(),b.title(),b.context()));}
 @GetMapping("/{id}") public CommonResult<?> detail(@PathVariable String id){return CommonResult.success(support.detail(id,member()));}
 @PostMapping("/{id}/messages") public CommonResult<?> reply(@PathVariable String id,@RequestBody Reply b){support.reply(id,member(),false,b.requestId(),b.content());return CommonResult.success(null);}
}
