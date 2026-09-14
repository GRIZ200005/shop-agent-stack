package com.macro.mall.aster.admin;

import com.macro.mall.aster.AfterSaleService;
import com.macro.mall.common.api.CommonResult;
import com.macro.mall.common.exception.Asserts;
import com.macro.mall.dto.UmsAdminParam;
import com.macro.mall.service.UmsAdminService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import java.security.Principal;

@RestController
@RequestMapping("/aster")
public class AsterStaffController {
    private final AfterSaleService sales;
    private final AsterStaffAccess access;
    private final JdbcTemplate db;
    private final UmsAdminService admins;
    public AsterStaffController(AfterSaleService sales,AsterStaffAccess access,JdbcTemplate db,UmsAdminService admins) { this.sales=sales; this.access=access; this.db=db; this.admins=admins; }
    private long staff(Principal p,boolean admin) { return ((Number)access.require(p,admin).get("id")).longValue(); }
    public record Decision(@NotNull Boolean approved,@NotBlank @Size(max=500) String note) {}
    public record Policy(@NotBlank @Size(max=120) String title,@NotBlank @Size(max=20000) String content) {}
    public record Account(@Pattern(regexp="[a-zA-Z0-9_]{4,32}") @NotNull String username,@Size(min=12,max=64) @NotNull String password,@NotBlank @Size(max=40) String name,@Pattern(regexp="ADMIN|SERVICE") @NotNull String role) {}
    @GetMapping("/me") public CommonResult<?> me(Principal p) { return CommonResult.success(access.require(p,false)); }
    @GetMapping("/after-sales") public CommonResult<?> queue(Principal p) { staff(p,false); return CommonResult.success(sales.queue()); }
    @GetMapping("/after-sales/{id}") public CommonResult<?> detail(@PathVariable long id,Principal p) { staff(p,false); return CommonResult.success(sales.detail(id,null)); }
    @PostMapping("/after-sales/{id}/claim") public CommonResult<?> claim(@PathVariable long id,Principal p) { sales.claim(id,staff(p,false)); return CommonResult.success(null); }
    @PostMapping("/after-sales/{id}/decision") public CommonResult<?> decide(@PathVariable long id,@Valid @RequestBody Decision body,Principal p) { sales.decide(id,staff(p,false),body.approved(),body.note()); return CommonResult.success(null); }
    @GetMapping("/policies") public CommonResult<?> policies(Principal p) { staff(p,false); return CommonResult.success(sales.policies(true)); }
    @PostMapping("/policies") public CommonResult<?> draft(@Valid @RequestBody Policy body,Principal p) { sales.draft(body.title(),body.content(),staff(p,true)); return CommonResult.success(null); }
    @PostMapping("/policies/{id}/publish") public CommonResult<?> publish(@PathVariable long id,Principal p) { staff(p,true); sales.publish(id); return CommonResult.success(null); }
    @GetMapping("/staff") public CommonResult<?> accounts(Principal p) { staff(p,true); return CommonResult.success(db.queryForList("SELECT u.id,u.username,u.nick_name,s.role FROM ums_admin u JOIN aster_staff s ON u.id=s.admin_id ORDER BY u.id LIMIT 100")); }
    @PostMapping("/staff") @Transactional public CommonResult<?> create(@Valid @RequestBody Account body,Principal p) {
        staff(p,true);
        var input=new UmsAdminParam(); input.setUsername(body.username()); input.setPassword(body.password()); input.setNickName(body.name());
        var created=admins.register(input);
        if(created==null) Asserts.fail("账号已存在");
        db.update("INSERT INTO aster_staff(admin_id,role) VALUES(?,?)",created.getId(),body.role());
        return CommonResult.success(java.util.Map.of("id",created.getId()));
    }
}
