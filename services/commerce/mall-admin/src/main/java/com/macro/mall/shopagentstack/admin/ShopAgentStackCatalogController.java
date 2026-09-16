package com.macro.mall.shopagentstack.admin;
import com.macro.mall.shopagentstack.CatalogManagementService;
import com.macro.mall.common.api.CommonResult;
import org.springframework.web.bind.annotation.*;
import java.security.Principal;
/** Original ShopAgentStack: administrator-only catalog operations, checked on every request. */
@RestController @RequestMapping("/shop_agent_stack/catalog")
public class ShopAgentStackCatalogController {
 private final CatalogManagementService catalog; private final ShopAgentStackStaffAccess access;
 public ShopAgentStackCatalogController(CatalogManagementService c,ShopAgentStackStaffAccess a){catalog=c;access=a;}
 private long admin(Principal p){return ((Number)access.require(p,true).get("id")).longValue();}
 @GetMapping public CommonResult<?> list(Principal p,@RequestParam(defaultValue="") String query,@RequestParam(required=false) Integer status,@RequestParam(defaultValue="0") int page){admin(p);return CommonResult.success(catalog.list(query,status,page));}
 @GetMapping("/{id}") public CommonResult<?> detail(Principal p,@PathVariable long id){admin(p);return CommonResult.success(catalog.detail(id));}
 @PostMapping("/{id}/changes") public CommonResult<?> change(Principal p,@PathVariable long id,@RequestBody CatalogManagementService.Change c){long actor=admin(p);try{catalog.change(id,actor,c);return CommonResult.success(null);}catch(com.macro.mall.common.exception.ApiException e){return CommonResult.validateFailed(e.getMessage());}}
}
