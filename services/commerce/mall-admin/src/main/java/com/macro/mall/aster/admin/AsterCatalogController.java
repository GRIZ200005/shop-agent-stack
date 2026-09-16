package com.macro.mall.aster.admin;
import com.macro.mall.aster.CatalogManagementService;
import com.macro.mall.common.api.CommonResult;
import org.springframework.web.bind.annotation.*;
import java.security.Principal;
/** Original Aster: administrator-only catalog operations, checked on every request. */
@RestController @RequestMapping("/aster/catalog")
public class AsterCatalogController {
 private final CatalogManagementService catalog; private final AsterStaffAccess access;
 public AsterCatalogController(CatalogManagementService c,AsterStaffAccess a){catalog=c;access=a;}
 private long admin(Principal p){return ((Number)access.require(p,true).get("id")).longValue();}
 @GetMapping public CommonResult<?> list(Principal p,@RequestParam(defaultValue="") String query,@RequestParam(required=false) Integer status,@RequestParam(defaultValue="0") int page){admin(p);return CommonResult.success(catalog.list(query,status,page));}
 @GetMapping("/{id}") public CommonResult<?> detail(Principal p,@PathVariable long id){admin(p);return CommonResult.success(catalog.detail(id));}
 @PostMapping("/{id}/changes") public CommonResult<?> change(Principal p,@PathVariable long id,@RequestBody CatalogManagementService.Change c){long actor=admin(p);try{catalog.change(id,actor,c);return CommonResult.success(null);}catch(com.macro.mall.common.exception.ApiException e){return CommonResult.validateFailed(e.getMessage());}}
}
